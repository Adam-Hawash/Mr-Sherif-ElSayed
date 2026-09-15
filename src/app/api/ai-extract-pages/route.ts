// @ts-nocheck
// FILE: src/app/api/ai-extract-pages/route.ts
// ROUTE: POST /api/ai-extract-pages
// (2026-و40) استخراج الأسئلة من كتاب كبير **بصفحات محددة** — طلب المستر:
//   «بفتح كتاب كبير، أحدد صفحات، وأخليه يجيب كل الأسئلة اللي في الصفحات دي
//    أو عدد معين من أهم الأسئلة بالترتيب».
//
// الواجهة بتصوّر الصفحات على المتصفح (pdf.js — src/lib/pdf-pages.ts) وتبعتها
//   على دفعات (≤5 صفحات لكل طلب) — الصورة base64 dataURL.
//
// شكلان للطلب (نفس المسار):
//   1) استخراج: { pages:[{n:number, image:string}], mode:'all'|'top',
//                 count?:number, bookTitle?:string }
//      → لكل دفعة ≤5 صفحات نداء Gemini واحد (نص التعليمات + صور inlineData).
//        لو الدفعات >1 وmode='top' → نداء نصي إضافي يختار أهم count سؤال
//        بترتيب الكتاب (تحديد/فلترة بس — ممنوع إعادة صياغة).
//   2) اختيار نهائي عبر الدفعات: { selectTop:{ questions:[...], count:number } }
//      → الكلينت بيجمّع أسئلة كل الدفعات وبعدين يبعتها هنا لنداء النص-only
//        اللي يختار أهم count سؤال في ترتيب الكتاب (لأن النقل بيتم على دفعات،
//        الاختيار العابر للدفعات بيحصل في طلب منفصل خفيف).
//
// الرد: { success:true, extracted:{ title, content:'', questions:[...],
//         answerKey:'', stats:{ mcq, writing, total, batches, pages, skippedBatches } } }
// نفس شكل extracted اللي AIExtractionPanel بيستهلكه بالظبط.

import { NextRequest, NextResponse } from 'next/server'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson, repairCorruptMath } from '@/lib/math-text'

export const runtime = 'nodejs'
export const maxDuration = 180

var MAX_PAGES_PER_REQUEST = 30
var BATCH_SIZE = 5

/* تنظيف رياضي مطابق لـ normalizeMath في /api/ai-extract (الحفظ بيعمله برضه
   — بنعمله هنا عشان شاشة المراجعة تعرض النص النهائي من أول لحظة) */
function normalizeMath(s: string): string {
  if (!s) return s
  var out = repairCorruptMath(String(s))
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, '$1').replace(/\$([^$\n]+?)\$/g, '$1')
  out = out.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '')
  out = out.replace(/\\frac\s*\{\s*\(([^{}]*)\)\s*\}\s*\{\s*\(([^{}]*)\)\s*\}/g, '\\frac{$1}{$2}')
  return out
}

/* محلل JSON متسامح **لمصفوفات** — نفس أسلوب parseAIJson في /api/ai-extract:
   شيل الفنوص، دوّر على حدود المصفوفة، جرّب المشي لورا على ']' سابقة،
   وصلّح الأقواس الناقصة (قص إخراج الموديل في النص) */
function parseAIJsonArray(text: string): any[] | null {
  if (!text || !text.trim()) return null
  var t = String(text).trim()
  // 1) شيل أسوار markdown لو موجودة
  t = t.replace(/```(?:json)?/gi, '')
  var start = t.indexOf('[')
  if (start === -1) return null
  var raw = repairModelJson(t.substring(start))
  // 2) قص آخر ']' وحاول مباشرة
  var end = raw.lastIndexOf(']')
  if (end !== -1) {
    try { var direct = JSON.parse(raw.substring(0, end + 1)); if (Array.isArray(direct)) return direct } catch (e) {}
  }
  // 3) مشي لورا على مواضع ']' (نفاية زبالة بعد إغلاق المصفوفة)
  var attempts = 0
  for (var i = raw.length - 1; i > 0 && attempts < 200; i--) {
    if (raw.charAt(i) === ']') {
      attempts++
      try {
        var picked = JSON.parse(raw.substring(0, i + 1))
        if (Array.isArray(picked)) return picked
      } catch (e) {}
    }
  }
  // 4) إصلاح القص: ضيف الأقواس/الاقتباسات الناقصة بنفس خوارزمية parseAIJson
  var stack: string[] = []
  var inStr = false
  var esc = false
  for (var j = 0; j < raw.length; j++) {
    var ch = raw.charAt(j)
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else {
      if (ch === '"') inStr = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') {
        if (stack.length) stack.pop()
      }
    }
  }
  if (stack.length > 0 && stack.length <= 8) {
    var repaired = raw
    if (inStr || esc) repaired += '"'
    while (stack.length) repaired += stack.pop()
    try {
      var fixed = JSON.parse(repaired)
      if (Array.isArray(fixed)) return fixed
    } catch (e) {}
  }
  return null
}

function stripDataUrl(img: string): string {
  return String(img || '').replace(/^data:[^;]+;base64,/, '')
}

/* برومبت ثنائي اللغة — نفس شكل أسئلة المنصة بالظبط (زي /api/ai-extract) */
function buildPagesPrompt(pageNumbers: number[], mode: 'all' | 'top', count: number): string {
  var lines = []
  var pagesLabel = pageNumbers.join(', ')
  lines.push('You are an expert math teacher reading PHOTOGRAPHED PAGES of a printed textbook/workbook.')
  lines.push('سوف أعطيك صوراً لصفحات من كتاب مدرسي مطبوع. استخرج الأسئلة المطبوعة كما هي تماماً.')
  lines.push('The images below are pages: ' + pagesLabel + ' — each image is labeled «صفحة N / Page N».')
  if (mode === 'top') {
    lines.push('TASK: From THESE pages extract only the MOST IMPORTANT, exam-typical questions (about ' + count + ' across the whole book — so from these pages pick the best ones), in the original book order.')
    lines.push('المطلوب: أهم أسئلة الامتحانات في الصفحات دي بالترتيب.')
  } else {
    lines.push('TASK: Extract EVERY question printed on these pages, EXACTLY as printed, in the ORIGINAL BOOK ORDER (page by page, top to bottom).')
    lines.push('المطلوب: كل الأسئلة اللي في الصفحات دي بالظبط وبترتيب الكتاب.')
  }
  lines.push('')
  lines.push('HARD RULES (follow exactly):')
  lines.push('- Extract ONLY questions that actually exist on the pages. Do NOT invent, add, solve-as-new, or rephrase questions.')
  lines.push('- MCQ: the page shows answer CHOICES under the question. Options must be the option TEXT ONLY — no letter prefixes (no "A)", no "(1)", no numbering). "correct" = the 0-based index of the correct option. If the correct answer is NOT printed anywhere on these pages set correct: -1 and write the full solution in modelAnswer.')
  lines.push('- WRITING: no choices printed under the question. Set type "writing", options [], correct: -1, modelAnswer = complete step-by-step solution, acceptedAnswers = array of acceptable final answers.')
  lines.push('- IGNORE page headers, footers, page numbers, logos, advertisements, and decorations.')
  lines.push('- A question that spans two pages = ONE question; set "sourcePage" to the FIRST page it appears on.')
  lines.push('- EVERY question object MUST include "sourcePage": the page number the question appears on (from the labels).')
  lines.push('')
  lines.push('WORKSHEET STRUCTURE (very important — many worksheet questions contain TABLES and GRAPHS):')
  lines.push('- TABLES: if a question shows a printed table, return "table" reproducing it EXACTLY: {"headers":["x","f(x)","(x, f(x))"],"rows":[[{"t":"-2"},{"t":"","blank":true},{"t":"","blank":true}]]}.')
  lines.push('  * Printed cells → {"t":"<exact printed text>"}. Cells the STUDENT must fill → {"t":"","blank":true}.')
  lines.push('  * Do NOT blank printed cells, and do NOT fill the blank cells — the student writes inside them.')
  /* (و43) قاعدة صارمة للرسومات: أي رسمة/منحنى/شكل هندسي لازم تترجع figure /
     optionFigures — ممنوع تحويل الرسمة لنص وصف أو جدول إحداثيات، والـ
     modelAnswer بيبقى النتائج النهائية المختصرة بس */
  lines.push('HARD RULE — FIGURES: for EVERY question (and every MCQ option) that contains or depends on any drawing, graph, plotted curve, geometric shape, diagram, chart, or image-based table: you MUST return figure/optionFigures data:')
  lines.push('  * question-level "figure":{"page":N,"bbox":{"x":..,"y":..,"w":..,"h":..}}')
  lines.push('  * option-level "optionFigures":[{"page":N,"bbox":{...}} or null, ...] aligned with the options array.')
  lines.push('  * bbox = tight rectangle around the drawing INCLUDING its axes/labels, as FRACTIONS of the whole page image (0..1, x/y = top-left).')
  lines.push('  * NEVER convert a drawing into text: do NOT describe the graph, do NOT write coordinate tables or step-by-step plotting inside question text or modelAnswer.')
  lines.push('  * modelAnswer = concise final results only (example: "axis of symmetry: x = 3, maximum value = 4").')
  lines.push('  * If unsure whether something is a figure, treat it AS a figure. Options that are pure images get empty string text plus their optionFigures entry.')
  lines.push('- modelAnswer must include the expected table values when applicable (e.g. "f(-1)=5, f(0)=3 → points (-1,5), (0,3)").')
  lines.push('- MATH FORMAT (the platform renders it as real math): powers as x^2; EVERY fraction as \\frac{numerator}{denominator} (NEVER a/b, and do NOT wrap the whole numerator/denominator in parentheses); square root √, cube root ∛, × ÷ π ≤ ≥ ≠ ≈ ∠ °. No $ signs, no other LaTeX, no markdown.')
  lines.push('- ALL output text in English (same as the rest of the platform).')
  lines.push('')
  lines.push('Return ONE single valid JSON array — no text before or after, no markdown fences. Shape:')
  lines.push('[{"type":"mcq","question":"...","options":["opt1","opt2","opt3","opt4"],"correct":0,"points":1,"modelAnswer":"step by step solution","sourcePage":' + (pageNumbers[0] || 1) + '},{"type":"writing","question":"...","options":[],"correct":-1,"points":5,"modelAnswer":"full solution","acceptedAnswers":["5","x=5"],"sourcePage":' + (pageNumbers[0] || 1) + ',"table":{"headers":["x","f(x)"],"rows":[[{"t":"-1"},{"t":"","blank":true}]]},"figure":{"page":' + (pageNumbers[0] || 1) + ',"bbox":{"x":0.05,"y":0.3,"w":0.4,"h":0.35}}}]')
  return lines.join('\n')
}

/* نداء نص-only: اختيار أهم count سؤال من قايمة مدموجة — تحديد بس من غير إعادة كتابة */
function buildSelectTopPrompt(count: number): string {
  var lines = []
  lines.push('You are an exam editor. Below is a JSON array of math questions extracted from a textbook IN ORIGINAL BOOK ORDER (each may carry "sourcePage").')
  lines.push('TASK: select the ' + count + ' MOST IMPORTANT, exam-typical questions from the array and return ONLY those, as a JSON array, PRESERVING the original book order and the ORIGINAL objects EXACTLY (pure selection/filter — do NOT rewrite, rename fields, translate, or add anything).')
  lines.push('اختر أهم أسئلة الامتحانات فقط — بنفس ترتيب الكتاب — من غير أي تعديل على النصوص.')
  lines.push('If the array has fewer than ' + count + ' questions, return the whole array unchanged.')
  lines.push('Return ONE single valid JSON array — no text before or after, no markdown fences.')
  return lines.join('\n')
}

async function callGeminiParts(parts: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  var result = await callGeminiCentral({
    parts: parts,
    generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
    timeoutMs: 90000,
  })
  if (result.ok) return { ok: true, text: result.text }
  console.error('[AI Extract Pages] Gemini failed:', result.error)
  return { ok: false, error: result.error || 'unknown' }
}

/* توحيد سؤال على شكل المنصة القانوني + الحفاظ على sourcePage + حقول ورقة العمل (و40-w) */
function finalizeQuestion(q: any): any | null {
  if (!q || typeof q !== 'object') return null
  var qText = normalizeMath(q.question || q.q || '')
  if (!qText || !String(qText).trim()) return null
  var sourcePage = typeof q.sourcePage === 'number' ? q.sourcePage : (parseInt(String(q.sourcePage), 10) || 0)
  /* (2026-و40-w) pass-through حقول ورقة العمل: srcName/table/figure/optionFigures */
  var ws: any = {}
  if (q.srcName && String(q.srcName).trim()) ws.srcName = String(q.srcName).trim()
  if (q.table && Array.isArray(q.table.rows)) ws.table = q.table
  if (q.figure && q.figure.bbox) ws.figure = q.figure
  if (Array.isArray(q.optionFigures)) ws.optionFigures = q.optionFigures
  var isWriting = q.type === 'writing' || q.type === 'essay'
  if (!isWriting && (!Array.isArray(q.options) || q.options.length === 0)) isWriting = true
  if (isWriting) {
    return Object.assign({
      type: 'writing',
      question: qText,
      options: [],
      correct: -1,
      points: (typeof q.points === 'number' && q.points > 0) ? q.points : 5,
      modelAnswer: normalizeMath(q.modelAnswer || q.answer || ''),
      acceptedAnswers: (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []).map(function (a: any) { return normalizeMath(String(a)) }),
      sourcePage: sourcePage,
    }, ws)
  }
  var opts = (q.options || []).map(function (o: any) { return normalizeMath(String(o == null ? '' : o)) }).filter(function (o: string) { return o.trim() !== '' }).slice(0, 4)
  var correct = typeof q.correct === 'number' ? q.correct : (parseInt(String(q.correct), 10) || -1)
  if (correct >= opts.length) correct = -1
  return Object.assign({
    type: 'mcq',
    question: qText,
    options: opts,
    correct: correct,
    points: (typeof q.points === 'number' && q.points > 0) ? q.points : 1,
    modelAnswer: normalizeMath(q.modelAnswer || ''),
    sourcePage: sourcePage,
  }, ws)
}

/* استخراج دفعة صفحات واحدة (≤5) — مع محاولة إعادة واحدة قبل التخطي */
async function extractBatch(pages: any[], mode: 'all' | 'top', count: number): Promise<{ questions: any[]; ok: boolean }> {
  var pageNumbers = pages.map(function (p) { return p.n })
  var parts: any[] = [{ text: buildPagesPrompt(pageNumbers, mode, count) }]
  for (var i = 0; i < pages.length; i++) {
    parts.push({ text: 'صفحة ' + pages[i].n + ' / Page ' + pages[i].n + ':' })
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: stripDataUrl(pages[i].image) } })
  }
  for (var attempt = 0; attempt < 2; attempt++) {
    var res = await callGeminiParts(parts)
    if (res.ok && res.text) {
      var arr = parseAIJsonArray(res.text)
      if (arr && arr.length >= 0) {
        var finalized: any[] = []
        for (var qi = 0; qi < arr.length; qi++) {
          var fq = finalizeQuestion(arr[qi])
          if (fq) finalized.push(fq)
        }
        return { questions: finalized, ok: true }
      }
    }
    if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1200) })
  }
  return { questions: [], ok: false }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json({ error: 'مفتاح Gemini مش متظبط — ضيفه في Environment Variables' }, { status: 500 })
    }
    var body = await request.json()

    /* ===== المسار 2: اختيار نهائي نص-only عبر دفعات الكلينت ===== */
    if (body && body.selectTop) {
      var selQs = body.selectTop.questions
      var selCount = parseInt(String(body.selectTop.count || 10), 10) || 10
      if (!Array.isArray(selQs) || selQs.length === 0) {
        return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: [], answerKey: '', stats: { mcq: 0, writing: 0, total: 0, batches: 0, pages: 0, skippedBatches: 0, topSelected: false } } })
      }
      if (selCount >= selQs.length) {
        return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: selQs, answerKey: '', stats: { mcq: 0, writing: 0, total: selQs.length, batches: 0, pages: 0, skippedBatches: 0, topSelected: false } } })
      }
      var textParts = [{ text: buildSelectTopPrompt(selCount) + '\n\nQUESTIONS JSON:\n' + JSON.stringify(selQs) }]
      var selRes = await callGeminiParts(textParts)
      var selected: any[] | null = selRes.ok && selRes.text ? parseAIJsonArray(selRes.text) : null
      if (selected && selected.length > 0) {
        /* أمان: نبني على الأسئلة الأصلية المرسلة — لو الموديل عدّل أي سؤال نتجاهله */
        var byKey: any = {}
        for (var si = 0; si < selQs.length; si++) {
          var k = String(selQs[si].question || '').trim().toLowerCase().substring(0, 80)
          if (k) byKey[k] = selQs[si]
        }
        var safeSelected: any[] = []
        for (var di = 0; di < selected.length && safeSelected.length < selCount; di++) {
          var dk = String((selected[di] && selected[di].question) || '').trim().toLowerCase().substring(0, 80)
          if (dk && byKey[dk]) safeSelected.push(byKey[dk])
        }
        if (safeSelected.length > 0) {
          return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: safeSelected, answerKey: '', stats: { mcq: 0, writing: 0, total: safeSelected.length, batches: 0, pages: 0, skippedBatches: 0, topSelected: true } } })
        }
      }
      /* فشل الاختيار الذكي → فولباك حتمي: أول count سؤال في ترتيب الكتاب */
      return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: selQs.slice(0, selCount), answerKey: '', stats: { mcq: 0, writing: 0, total: Math.min(selCount, selQs.length), batches: 0, pages: 0, skippedBatches: 0, topSelected: false } } })
    }

    /* ===== المسار 1: استخراج من صور الصفحات ===== */
    var pages = body && Array.isArray(body.pages) ? body.pages : []
    var mode: 'all' | 'top' = body.mode === 'top' ? 'top' : 'all'
    var count = parseInt(String(body.count || 10), 10) || 10
    var bookTitle = String(body.bookTitle || '').trim()
    pages = pages.filter(function (p: any) { return p && typeof p.n === 'number' && p.n > 0 && p.image }).slice(0, MAX_PAGES_PER_REQUEST)
    pages.sort(function (a: any, b: any) { return a.n - b.n })
    if (pages.length === 0) {
      return NextResponse.json({ error: 'مفيش صفحات صالحة في الطلب' }, { status: 400 })
    }

    /* دفعات ≤5 صفحات — لكل دفعة نداء Gemini واحد */
    var batches: any[][] = []
    for (var b = 0; b < pages.length; b += BATCH_SIZE) {
      batches.push(pages.slice(b, b + BATCH_SIZE))
    }

    var allQuestions: any[] = []
    var skippedBatches = 0
    for (var bi = 0; bi < batches.length; bi++) {
      var batchRes = await extractBatch(batches[bi], mode, count)
      if (!batchRes.ok) { skippedBatches++; continue }
      for (var qj = 0; qj < batchRes.questions.length; qj++) allQuestions.push(batchRes.questions[qj])
    }

    /* mode='top' وكل الأسئلة جاية من دفعات متعددة → نداء نص-only واحد يختار أهم count */
    var topSelected = false
    if (mode === 'top' && batches.length > 1 && allQuestions.length > count) {
      var topRes = await callGeminiParts([{ text: buildSelectTopPrompt(count) + '\n\nQUESTIONS JSON:\n' + JSON.stringify(allQuestions) }])
      var topArr: any[] | null = topRes.ok && topRes.text ? parseAIJsonArray(topRes.text) : null
      if (topArr && topArr.length > 0) {
        var byText: any = {}
        for (var ai2 = 0; ai2 < allQuestions.length; ai2++) {
          var k2 = String(allQuestions[ai2].question || '').trim().toLowerCase().substring(0, 80)
          if (k2) byText[k2] = allQuestions[ai2]
        }
        var safeTop: any[] = []
        for (var ti = 0; ti < topArr.length && safeTop.length < count; ti++) {
          var tk = String((topArr[ti] && topArr[ti].question) || '').trim().toLowerCase().substring(0, 80)
          if (tk && byText[tk]) safeTop.push(byText[tk])
        }
        if (safeTop.length > 0) { allQuestions = safeTop; topSelected = true }
      }
      if (!topSelected) allQuestions = allQuestions.slice(0, count) /* فولباك حتمي */
    }

    var mcqCount = allQuestions.filter(function (q) { return q.type === 'mcq' }).length
    var writingCount = allQuestions.filter(function (q) { return q.type === 'writing' }).length
    var firstPage = pages[0].n
    var lastPage = pages[pages.length - 1].n

    return NextResponse.json({
      success: true,
      extracted: {
        title: bookTitle || ('كتاب — صفحات ' + firstPage + '–' + lastPage),
        content: '',
        questions: allQuestions,
        answerKey: '',
        stats: {
          mcq: mcqCount,
          writing: writingCount,
          total: allQuestions.length,
          batches: batches.length,
          pages: pages.length,
          skippedBatches: skippedBatches,
          topSelected: topSelected,
        },
      },
    })
  } catch (error: any) {
    console.error('AI extract pages error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
