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
/* (و45) تصنيف موحّد اختياري/مقالي — سؤال له اختيارات صور = اختياري مش مقالي */
import { isWritingQuestion, splitEmbeddedOptions } from '@/lib/question-figures'
/* (ز31) حارس «كل حاجة بالإنجليزي» — طلب المستر الحرفي */
import { ensureEnglishQuestions } from '@/lib/english-only'
/* (وN4) قص الرسمات على السيرفر **جوه المسار نفسه** + مطابقة أرقام الرسمة بالتكبير
   — طلب المستر: «ما بيقصش الرسومات» + «بيجيب أرقام من دماغه (المربع 3 و2 بيطلع 2 و2)» */
import { cropFiguresServerSide } from '@/lib/server-figures'
import { syncFigureNumbers } from '@/lib/figure-zoom'

export const runtime = 'nodejs'
export const maxDuration = 300

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

/* برومبت إنجليزي 100% (ز31) — نفس شكل أسئلة المنصة بالظبط (زي /api/ai-extract)
   ملاحظة: سطور العربي اتشالت من البرومبت — البرومبت المختلط اللغة كان بيسرّب
   عربي في المخرجات وطلب المستر «كل حاجة بالإنجليزي» */
function buildPagesPrompt(pageNumbers: number[], mode: 'all' | 'top', count: number): string {
  var lines = []
  var pagesLabel = pageNumbers.join(', ')
  lines.push('You are an expert math teacher reading PHOTOGRAPHED PAGES of a printed textbook/workbook.')
  lines.push('The images below are pages: ' + pagesLabel + ' — each image is labeled "Page N".')
  if (mode === 'top') {
    lines.push('TASK: From THESE pages extract only the MOST IMPORTANT, exam-typical questions (about ' + count + ' across the whole book — so from these pages pick the best ones), in the original book order.')
  } else {
    lines.push('TASK: Extract EVERY question printed on these pages, EXACTLY as printed, in the ORIGINAL BOOK ORDER (page by page, top to bottom).')
  }
  lines.push('')
  lines.push('HARD RULES (follow exactly):')
  lines.push('- Extract ONLY questions that actually exist on the pages. Do NOT invent, add, solve-as-new, or rephrase questions.')
  lines.push('- NUMBERING COVERAGE (most important — the teacher loses questions if you skip): if the pages show numbered questions (1., 2., 3., …), your output MUST contain EVERY number that appears — exactly ONE object per number, in the same order. If the pages have 15 numbered questions, return exactly 15 objects. NEVER skip, merge, or drop any question number, even if two questions start with the same words (like "Find the result:" twice — they are DIFFERENT questions).')
  lines.push('- PICTURE-ONLY QUESTIONS (very common in primary math books): a question that is only a drawing/picture/figure with little or no text (complete-the-picture, count-the-shapes, color-the-…) MUST STILL be extracted — return it with question text "" (empty) plus its "figure" bbox. NEVER drop a question just because it has no text.')
  lines.push('- MCQ: the page shows answer CHOICES under the question. Options must be the option TEXT ONLY — no letter prefixes (no "A)", no "(1)", no numbering). "correct" = the 0-based index of the correct option. If the correct answer is NOT printed anywhere on these pages → SOLVE the question yourself (you are an expert math teacher): set "correct" to the 0-based index of YOUR chosen answer among the options and write the full step-by-step solution in modelAnswer. NEVER set correct: -1 — the teacher relies on the platform solving unanswered questions.')
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
  lines.push('IMAGE-CHOICE RULE (2026-W45 — mandatory): a question whose choices are PICTURES / FIGURES (not text) is STILL "mcq" — NEVER "writing". Return "options" as empty strings with the SAME length as the picture-choices and put each picture in "optionFigures" aligned by index.')
  lines.push('- modelAnswer must include the expected table values when applicable (e.g. "f(-1)=5, f(0)=3 → points (-1,5), (0,3)").')
  lines.push('TABLE FIDELITY (ز31 — the teacher requires EXACT tables): copy every table EXACTLY as printed — SAME number of columns, SAME column order (left → right exactly as printed), SAME row order (top → bottom), SAME cell values in their original cells. NEVER reverse, rotate, transpose, merge, split or re-order columns or rows.')
  lines.push('ENGLISH ONLY GUARANTEE (ز31 — the teacher REQUIRES it): EVERY word you output — question text, options, modelAnswer, acceptedAnswers — MUST be ENGLISH. NEVER output a single Arabic character anywhere. If the page text is Arabic, TRANSLATE it to natural English (same meaning, same numbers) and output only the English.')
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
  lines.push('If the array has fewer than ' + count + ' questions, return the whole array unchanged.')
  lines.push('Return ONE single valid JSON array — no text before or after, no markdown fences.')
  return lines.join('\n')
}

/* ============================================================
 * (ز29) ملف الإجابات الاختياري — مسار الملفات الكبيرة:
 * الكلينت بيجمع كل الأسئلة المستخرجة من الصفحات وبيبعتها مع ملف الإجابات
 * (base64 أو رابط) — نداء Gemini واحد بيقرا المفتاح ويرجّع إجابة كل سؤال
 * (بقواعد القراءة الحرفية الصارمة: keyQuote + confidence + ممنوع التخمين)،
 * واللي ملقاهوش في المفتاح بيتحل بالذكاء (extract-or-solve).
 * ============================================================ */
function buildAnswersOnlyPromptPages(grade: string, type: string, questions: any[]): string {
  var lines = []
  lines.push('You are an expert math teacher. I will give you ONE document containing ANSWERS / answer key for math questions.')
  lines.push('Extract the answer for EACH question. The answers should match the questions I list below.')
  lines.push('')
  lines.push('Here are the questions extracted from the pages (in order):')
  questions.forEach(function (q, i) {
    var qType = isWritingQuestion(q) ? 'writing' : 'mcq'
    if (qType === 'mcq') {
      lines.push((i + 1) + '. [MCQ] ' + (q.question || ''))
      if (Array.isArray(q.options) && q.options.length > 0) {
        lines.push('   Options: ' + q.options.map(function (o, oi) { return String.fromCharCode(65 + oi) + ') ' + o }).join(' | '))
      }
    } else {
      lines.push((i + 1) + '. [WRITING] ' + (q.question || ''))
    }
    if (q.table && Array.isArray(q.table.rows) && q.table.rows.length > 0) {
      var tHead = Array.isArray(q.table.headers) ? q.table.headers.join(' | ') : ''
      var tRows = q.table.rows.map(function (row: any) {
        if (!Array.isArray(row)) return ''
        return row.map(function (cell: any) {
          var isBlank = cell && typeof cell === 'object' && cell.blank === true
          return isBlank ? '____' : String((cell && typeof cell === 'object' ? cell.t : cell) || '')
        }).join(' | ')
      }).join(' ; ')
      lines.push('   Table: ' + (tHead ? tHead + ' :: ' : '') + tRows)
    }
  })
  lines.push('')
  lines.push('For EACH question above, find its answer in the answer-key document and return:')
  lines.push('- For MCQ: the correct option index (0=A, 1=B, 2=C, 3=D) and a step-by-step modelAnswer')
  lines.push('- For WRITING: a complete step-by-step modelAnswer AND an array of acceptedAnswers (acceptable final answers)')
  lines.push('')
  lines.push('ACCURACY RULES (most important):')
  lines.push('- READ the answer key EXACTLY as written. For MCQ the "correct" index MUST be the letter/number actually written in the key for that question (e.g. key says "12-B" → correct:1).')
  lines.push('- ALWAYS include "keyQuote": the exact text you read from the key for that question (like "12-B" or "Q5: x=7"). This proves you read it, do not invent it.')
  lines.push('- ALWAYS include "confidence": "high" when the key clearly states the answer, "low" when ambiguous or missing.')
  lines.push('- If the answer for a question is NOT clearly found in the key → set "correct": -1 (MCQ) and confidence "low" — NEVER guess a letter. Still provide your best modelAnswer (marked as solved by you).')
  lines.push('- Watch out for common traps: shifted numbering, columns read in the wrong order, and answer letters written next to the PREVIOUS question. Verify the question number in the key matches before assigning.')
  lines.push('- Match by the question NUMBER first; only fall back to matching by text when the key has no numbers.')
  lines.push('')
  lines.push('SMART RULE: If the answer for a question IS found in the document → extract it exactly as written in the document.')
  lines.push('If the answer is NOT found in the document → SOLVE that question yourself completely: expert math teacher, correct, clear step-by-step solution matching the grade curriculum level (Grade: ' + grade + ') — and mark confidence "low".')
  lines.push('NEVER return empty values: EVERY question must get a complete modelAnswer (extracted OR solved by you). For writing questions also fill acceptedAnswers.')
  lines.push('')
  lines.push('Rules:')
  lines.push('- ALL output text in English')
  lines.push('- MATH FORMAT (very important — the platform renders this format as real math):')
  lines.push('  * Powers: use the ^ symbol — x^2, y^5, 2^12 (rendered as REAL superscripts).')
  lines.push('  * In modelAnswer / acceptedAnswers write every fraction as \\frac{numerator}{denominator} — rendered as a REAL stacked fraction. Example: "\\frac{3}{4}". NEVER write a/b.')
  lines.push('  * Do NOT wrap the whole numerator or denominator in parentheses.')
  lines.push('  * Use proper Unicode symbols: √ × ÷ π ≤ ≥ ≠ ≈ ∠ °. Do NOT use other LaTeX ($, \\sqrt, \\times…) or markdown.')
  lines.push('- The "answers" array MUST have the same length and order as the questions above')
  lines.push('- Each answer object MUST have an "index" field matching the question number (0-based)')
  lines.push('')
  lines.push('Return ONE single valid JSON object — no text before or after, no markdown fences, no fields outside the object:')
  lines.push('{"answers":[{"index":0,"correct":0,"confidence":"high","keyQuote":"1-A","modelAnswer":"step by step"},{"index":1,"correct":-1,"confidence":"low","keyQuote":"","modelAnswer":"full solution","acceptedAnswers":["5","x=5"]}]}')
  return lines.join('\n')
}

/* محلل JSON متسامح لكائن واحد (نفس أسلوب parseAIJson في /api/ai-extract) */
function parseAIJsonObjectPages(text: string): any | null {
  if (!text || !text.trim()) return null
  var t = String(text).trim()
  t = t.replace(/```(?:json)?/gi, '')
  var start = t.indexOf('{')
  if (start === -1) return null
  var raw = repairModelJson(t.substring(start))
  var end = raw.lastIndexOf('}')
  if (end !== -1) {
    try { var direct = JSON.parse(raw.substring(0, end + 1)); if (direct && typeof direct === 'object') return direct } catch (e) {}
  }
  var stack: string[] = []
  var inStr = false
  var esc = false
  for (var j = 0; j < raw.length; j++) {
    var ch = raw.charAt(j)
    if (inStr) {
      if (esc) { esc = false } else if (ch === '\\') { esc = true } else if (ch === '"') { inStr = false }
      continue
    }
    if (ch === '"') { inStr = true } else if (ch === '{' || ch === '[') { stack.push(ch) } else if (ch === '}' || ch === ']') { stack.pop() }
  }
  while (stack.length > 0) { stack.pop(); raw += stack[stack.length] === '[' ? ']' : '}' }
  try { var fixed = JSON.parse(raw); if (fixed && typeof fixed === 'object') return fixed } catch (e) {}
  return null
}

/* (ز29) تطابق نهائي: ملف الإجابات × الأسئلة المستخرجة — بيرجّع نفس الأسئلة
   زي ما هي مع correct/modelAnswer/acceptedAnswers من المفتاح */
async function matchAnswersBatch(questions: any[], aPart: any, grade: string, type: string): Promise<any[] | null> {
  var prompt = buildAnswersOnlyPromptPages(grade, type, questions)
  var parts: any[] = [{ text: prompt }, { text: '\n\nQUESTIONS JSON (for reference):\n' + JSON.stringify(questions.map(function (q: any) { return { type: q.type, question: q.question, options: q.options, table: q.table } })) }, aPart]
  for (var attempt = 0; attempt < 2; attempt++) {
    var res = await callGeminiParts(parts)
    if (res.ok && res.text) {
      var data = parseAIJsonObjectPages(res.text)
      if (data && Array.isArray(data.answers)) {
        return questions.map(function (q: any, i: number) {
          var ans = data.answers.find(function (a: any) { return a && (typeof a.index === 'number' ? a.index === i : false) }) || data.answers[i]
          if (!ans) return q
          var out = Object.assign({}, q)
          if (typeof ans.modelAnswer === 'string' && ans.modelAnswer.trim() && !(out.modelAnswer || '').trim()) out.modelAnswer = normalizeMath(ans.modelAnswer)
          if (Array.isArray(ans.acceptedAnswers) && ans.acceptedAnswers.length > 0 && (!Array.isArray(out.acceptedAnswers) || out.acceptedAnswers.length === 0)) {
            out.acceptedAnswers = ans.acceptedAnswers.map(function (a: any) { return normalizeMath(String(a)) })
          }
          if (out.type !== 'writing') {
            var idx = typeof ans.correct === 'number' ? ans.correct : parseInt(String(ans.correct), 10)
            if (typeof idx === 'number' && isFinite(idx) && idx >= 0) {
              var optCount = Array.isArray(out.options) ? out.options.length : 0
              if (optCount === 0 && Array.isArray(out.optionFigures) && out.optionFigures.length > 0) optCount = out.optionFigures.length
              if (idx < optCount) out.correct = idx
              else out.correct = -1
            } else if (out.correct === undefined || out.correct === null) {
              out.correct = -1
            }
            if (ans.confidence === 'low' || ans.correct === -1) {
              out.needsReview = true
              if (ans.confidence === 'low' && (ans.correct === -1 || ans.correct === undefined)) out.correct = out.correct === undefined ? -1 : out.correct
            }
            if (ans.keyQuote) out.keyQuote = String(ans.keyQuote).substring(0, 80)
          }
          return out
        })
      }
    }
    if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1200) })
  }
  return null
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

/* ============================================================
 * (وN4) كشف مناطق الرسمات — نداء واحد لكل دفعة لسد الفراغات اللي النموذج
 * رجّعها من غير bbox. ده كان السبب الأول إن رسمات كتير بتفضل من غير قص
 * خالص: مفيش bbox → مفيش قص → المستر شايف «الرسومات ما بتتقصش».
 * الكشف بيتم على صور الصفحات نفسها وبرجّع bbox كسور من الصفحة (0..1)،
 * وبنملأ بيه أسئلة مستوى السؤال الناقصة بس (حوار آمن — عمره ما بيغير
 * bbox موجود، ومش بيضيف رسمة لسؤال مالوش رسمة أصلًا في صفحة تانية).
 * ============================================================ */
function buildFigureDetectPrompt(pageNumbers: number[]): string {
  var lines = []
  lines.push('These are photographed textbook pages: ' + pageNumbers.join(', ') + ' — each image labeled "Page N".')
  lines.push('TASK: locate EVERY printed drawing/figure/geometric shape/graph/diagram/picture region on these pages. IGNORE plain text lines, tables of numbers, page headers/footers and decorations.')
  lines.push('For EACH figure return one object: {"page":N,"bbox":{"x":..,"y":..,"w":..,"h":..}}')
  lines.push('bbox = tight rectangle around the drawing INCLUDING its dimension labels/numbers and axes, as FRACTIONS of the whole page image (0..1, x/y = top-left corner).')
  lines.push('Be precise: the rectangle must contain the whole drawing (with its printed numbers) and nothing else.')
  lines.push('Return ONE single valid JSON array — no text before or after, no markdown fences. If there are no figures at all, return [].')
  return lines.join('\n')
}

/* تقاطع مستطيلين (IoU) — لعزل المناطق المكتشفة اللي ليها bbox موجود أصلًا */
function bboxIou(a: any, b: any): number {
  var ax2 = a.x + a.w, ay2 = a.y + a.h, bx2 = b.x + b.w, by2 = b.y + b.h
  var ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x))
  var iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y))
  var inter = ix * iy
  var union = a.w * a.h + b.w * b.h - inter
  return union > 0 ? inter / union : 0
}

/* تطبيع bbox من رد الكشف — نفس فكرة smartBbox في server-figures (0..1000 → 0..1) */
function normalizeDetectedBbox(bb: any): { x: number; y: number; w: number; h: number } | null {
  if (!bb || typeof bb !== 'object') return null
  var x = Number(bb.x), y = Number(bb.y), w = Number(bb.w), h = Number(bb.h)
  if (![x, y, w, h].every(function (n) { return isFinite(n) })) return null
  var maxV = Math.max(x, y, w, h)
  if (maxV > 1.5) { x /= 1000; y /= 1000; w /= 1000; h /= 1000 }
  if (w <= 0.004 || h <= 0.004 || w > 1.2 || h > 1.2) return null
  x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y))
  if (x + w > 1) w = Math.max(0.01, 1 - x)
  if (y + h > 1) h = Math.max(0.01, 1 - y)
  return { x: x, y: y, w: w, h: h }
}

/* دمج المناطق المكتشفة مع الأسئلة اللي ناقصها رسمة:
   لكل صفحة — المناطق المكتشفة فوق-تحت × أسئلة الصفحة الناقصة بترتيب الكتاب
   (ترتيب الاستخراج = ترتيب الكتاب) — إقران 1:1 بالقراءة.
   المناطق القريبة من bbox موجود أصلًا (IoU > 0.45) بتتستبعد الأول. */
function fillMissingFigures(dets: any[], questions: any[]): number {
  var filled = 0
  try {
    var byPageD: Record<number, any[]> = {}
    for (var di = 0; di < (dets || []).length; di++) {
      var d = dets[di]
      if (!d || typeof d !== 'object') continue
      var pg = parseInt(String(d.page), 10)
      if (!isFinite(pg) || pg <= 0) continue
      var bb = normalizeDetectedBbox(d.bbox)
      if (!bb) continue
      ;(byPageD[pg] = byPageD[pg] || []).push(bb)
    }
    var byPageQ: Record<number, any[]> = {}
    for (var qi = 0; qi < (questions || []).length; qi++) {
      var q = questions[qi]
      if (!q || (q.figure && q.figure.bbox)) continue
      var pgQ = parseInt(String(q.sourcePage || 0), 10)
      if (!isFinite(pgQ) || pgQ <= 0) continue
      ;(byPageQ[pgQ] = byPageQ[pgQ] || []).push(q)
    }
    var pageKeys = Object.keys(byPageD)
    for (var pi = 0; pi < pageKeys.length; pi++) {
      var pageNo = parseInt(pageKeys[pi], 10)
      var detsP = (byPageD[pageNo] || []).slice().sort(function (a, b) { return (a.y - b.y) || (a.x - b.x) })
      var qsP = byPageQ[pageNo] || []
      if (!qsP.length || !detsP.length) continue
      /* استبعد المناطق اللي هي أصلاً مطابقة لرسومات موجودة في أي سؤال تاني على نفس الصفحة */
      var claimed: any[] = []
      for (var qc = 0; qc < questions.length; qc++) {
        var qC = questions[qc]
        if (qC && qC.figure && qC.figure.bbox && parseInt(String(qC.figure.page || qC.sourcePage || 0), 10) === pageNo) {
          var nbb = normalizeDetectedBbox(qC.figure.bbox)
          if (nbb) claimed.push(nbb)
        }
      }
      var free: any[] = []
      for (var dj = 0; dj < detsP.length; dj++) {
        var isClaimed = false
        for (var cj = 0; cj < claimed.length; cj++) {
          if (bboxIou(detsP[dj], claimed[cj]) > 0.45) { isClaimed = true; break }
        }
        if (!isClaimed) free.push(detsP[dj])
      }
      /* إقران 1:1 بترتيب القراءة — المكتشف فوق-تحت × الأسئلة الناقصة بترتيب الكتاب */
      for (var fq = 0; fq < qsP.length && fq < free.length; fq++) {
        var qF = qsP[fq]
        qF.figure = Object.assign({}, qF.figure || {}, { page: pageNo, bbox: free[fq] })
        filled++
      }
    }
  } catch (eFill) { /* آمن — الرسمات الناقصة بتفضل زي ما هي */ }
  return filled
}

async function detectFigureRegions(pages: any[], questions: any[]): Promise<number> {
  if (!Array.isArray(pages) || pages.length === 0 || !Array.isArray(questions) || questions.length === 0) return 0
  var pageNumbers = pages.map(function (p) { return p.n })
  var parts: any[] = [{ text: buildFigureDetectPrompt(pageNumbers) }]
  for (var i = 0; i < pages.length; i++) {
    parts.push({ text: 'Page ' + pages[i].n + ':' })
    parts.push({ inlineData: { mimeType: 'image/jpeg', data: stripDataUrl(pages[i].image) } })
  }
  try {
    var res = await callGeminiParts(parts)
    if (!res.ok || !res.text) return 0
    var dets = parseAIJsonArray(res.text)
    if (!dets || dets.length === 0) return 0
    return fillMissingFigures(dets, questions)
  } catch (eDet) { return 0 }
}

/* توحيد سؤال على شكل المنصة القانوني + الحفاظ على sourcePage + حقول ورقة العمل (و40-w) */
function finalizeQuestion(q: any): any | null {
  if (!q || typeof q !== 'object') return null
  /* (ز43) العقل الذكي: تفكيك الاختيارات المدموجة جوه نص السؤال
     «…\na. 2\nb. …\nc. …» → سؤال + اختيارات حقيقية A B C */
  q = splitEmbeddedOptions(q)
  var qText = normalizeMath(q.question || q.q || '')
  /* (2026-وN2 — إصلاح «في أسئلة بيمسحها ما بيستخرجهاش»):
     سؤال نصه فاضي لكن فيه رسمة/جدول/اختيارات/رسومات اختيارات = سؤال حقيقي
     (كتير جدًا في كتب الابتدائي: «أكمل» ورسمة بس) — ممنوع مسحه أبدًا.
     بنرجعه زي ما هو والرسمة هي اللي بتوصفه، والمستر يقدر يضيف له نص من شاشة المراجعة.
     اللي بيتمسح بس: سؤال مفيهوش أي حاجة أصلًا (نص فاضي + لا رسمة + لا جدول + لا اختيارات). */
  var hasFig = q.figure && q.figure.bbox
  var hasTbl = q.table && Array.isArray(q.table.rows) && q.table.rows.length > 0
  var hasOfArr = Array.isArray(q.optionFigures) && q.optionFigures.some(function (of: any) { return !!of })
  var hasOpts = Array.isArray(q.options) && q.options.some(function (o: any) { return String(o == null ? '' : o).trim() !== '' })
  if ((!qText || !String(qText).trim()) && !hasFig && !hasTbl && !hasOfArr && !hasOpts) return null
  var sourcePage = typeof q.sourcePage === 'number' ? q.sourcePage : (parseInt(String(q.sourcePage), 10) || 0)
  /* (2026-و40-w) pass-through حقول ورقة العمل: srcName/table/figure/optionFigures */
  var ws: any = {}
  if (q.srcName && String(q.srcName).trim()) ws.srcName = String(q.srcName).trim()
  if (q.table && Array.isArray(q.table.rows)) ws.table = q.table
  if (q.figure && q.figure.bbox) ws.figure = q.figure
  if (Array.isArray(q.optionFigures)) ws.optionFigures = q.optionFigures
  /* (ز43) علامة تقطيع الرسمة العريضة لرسومات اختيارات — بتتصرف في مرحلة القص */
  if (q._figureSplitPending) ws._figureSplitPending = q._figureSplitPending
  /* (و45) سؤال له اختيارات (نص أو صور/رسومات) = اختياري دايمًا — ممنوع يتحول مقالي */
  var isWriting = isWritingQuestion(q)
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
  /* (و45) رسومات الاختيارات: النص الفاضي بيفضل زي ما هو (الاختيار صورة) —
     ولو مفيش نص أصلًا بنملأ نص فاضي بنفس عدد رسومات الاختيارات */
  var hasOf = Array.isArray(q.optionFigures) && q.optionFigures.length > 0
  var opts = (q.options || []).map(function (o: any) { return normalizeMath(String(o == null ? '' : o)) })
  /* (2026-وN2) إبادة حشو «N/A» من الموديل — الاختيار الفاضي بيفضل فاضي،
     وN/A حرفيًا بيتشال دايمًا عشان حرف الـ N ما يوصلش للطالب خالص */
  if (!hasOf) { opts = opts.filter(function (o: string) { return o.trim() !== '' && o !== 'N/A' }) }
  else { opts = opts.map(function (o: string) { return o === 'N/A' ? '' : o }) }
  if (opts.length === 0 && hasOf) { for (var oiE = 0; oiE < q.optionFigures.length; oiE++) opts.push('') }
  /* (ز43) سقف 8 اختيارات بدل 4 — كتب بتيجي بـ 5 و7 اختيارات */
  opts = opts.slice(0, 8)
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
    parts.push({ text: 'Page ' + pages[i].n + ':' })
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

    /* ===== (ز29) المسار 3: تطابق الأسئلة المستخرجة مع ملف إجابات اختياري ===== */
    if (body && body.answersOnly) {
      var ansQs = body.answersOnly.questions
      var ansGrade = String(body.answersOnly.grade || '')
      var ansType = String(body.answersOnly.type || 'exam')
      var ansDoc = body.answersOnly.answer || null
      if (!Array.isArray(ansQs) || ansQs.length === 0) {
        return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: [], answerKey: '', stats: { mcq: 0, writing: 0, total: 0, batches: 0, pages: 0, skippedBatches: 0, answerMatched: false } } })
      }
      var ansPart: any = null
      try {
        if (ansDoc && typeof ansDoc.data === 'string' && ansDoc.data.length > 0) {
          ansPart = { inlineData: { mimeType: String(ansDoc.mime || 'application/pdf'), data: ansDoc.data } }
        } else if (ansDoc && typeof ansDoc.url === 'string' && ansDoc.url.trim()) {
          var aFetch2 = await fetch(ansDoc.url.trim())
          if (aFetch2.ok) {
            var aBuf2 = await aFetch2.arrayBuffer()
            var aCt2 = aFetch2.headers.get('content-type') || ''
            var aMime2 = aCt2.includes('pdf') ? 'application/pdf' : aCt2.includes('png') ? 'image/png' : aCt2.includes('webp') ? 'image/webp' : aCt2.includes('image') ? aCt2 : 'application/pdf'
            ansPart = { inlineData: { mimeType: aMime2, data: Buffer.from(new Uint8Array(aBuf2)).toString('base64') } }
          }
        }
      } catch (eAF2) {
        console.error('[AI Extract Pages] answer doc load failed (non-fatal):', (eAF2 && eAF2.message) || eAF2)
      }
      if (!ansPart) {
        /* من غير ملف إجابات صالح — رجّع الأسئلة زي ما هي */
        return NextResponse.json({ success: true, extracted: { title: '', content: '', questions: ansQs, answerKey: '', stats: { mcq: 0, writing: 0, total: ansQs.length, batches: 0, pages: 0, skippedBatches: 0, answerMatched: false } } })
      }
      var matched = await matchAnswersBatch(ansQs.slice(0, 80), ansPart, ansGrade, ansType)
      var finalQs = matched || ansQs
      /* (ز31) حارس «كل حاجة بالإنجليزي» على نتيجة التطابق */
      try { finalQs = await ensureEnglishQuestions(finalQs) } catch (eEn) { }
      var mMcq = finalQs.filter(function (q: any) { return q.type === 'mcq' }).length
      var mWriting = finalQs.filter(function (q: any) { return q.type === 'writing' }).length
      return NextResponse.json({
        success: true,
        extracted: {
          title: '',
          content: '',
          questions: finalQs,
          answerKey: '',
          stats: { mcq: mMcq, writing: mWriting, total: finalQs.length, batches: 0, pages: 0, skippedBatches: 0, answerMatched: !!matched },
        },
      })
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
    /* (وN4) أسئلة كل دفعة مرجعية للكشف/القص/مطابقة الأرقام على دفعتها */
    var batchQuestions: any[][] = []
    var routeStart = Date.now()
    var skippedBatches = 0
    for (var bi = 0; bi < batches.length; bi++) {
      var batchRes = await extractBatch(batches[bi], mode, count)
      if (!batchRes.ok) { skippedBatches++; batchQuestions.push([]); continue }
      var bqArr: any[] = []
      for (var qj = 0; qj < batchRes.questions.length; qj++) {
        allQuestions.push(batchRes.questions[qj])
        bqArr.push(batchRes.questions[qj])
      }
      batchQuestions.push(bqArr)
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

    /* ============================================================
     * (وN4) خط أنابيب الرسمات — على السيرفر جوه المسار نفسه:
     *  1) كشف المناطق اللي النموذج رجّعها من غير bbox (سد الفراغات)
     *  2) قص كل رسمة من صور الصفحات نفسها → figure.url معباية في نفس الرد
     *     — مفيش اعتماد على متصفح المستر ولا نداء إنقاذ إضافي
     *  3) إعادة قراءة كل رسمة مقصوصة «بتكبير» — أرقام الرسمة بتتاخد من
     *     الرسمة نفسها (المربع 3 و2 يطلع 3 و2 مش 2 و2) ونص السؤال بيتصحح
     * ده حل «ما بيقصش الرسومات» + «بيجيب أرقام من دماغه» من الجذر.
     * أي فشل هنا مش بيوقف الاستخراج — الرسمات/الأرقام بتفضل زي ما هي.
     * ============================================================ */
    var figuresCrop = { cropped: 0, failed: 0 }
    var figuresDetected = 0
    var figuresFixed = 0
    try {
      for (var fp = 0; fp < batches.length; fp++) {
        var fQs = batchQuestions[fp] || []
        if (fQs.length === 0) continue
        /* 1) كشف bbox الناقص — بس لو في ناقص وللسه في ميزانية وقت */
        var needDetect = false
        for (var nd = 0; nd < fQs.length; nd++) {
          var qqN = fQs[nd]
          if (qqN && !(qqN.figure && qqN.figure.bbox)) { needDetect = true; break }
        }
        if (needDetect && Date.now() - routeStart < 150000) {
          try { figuresDetected += await detectFigureRegions(batches[fp], fQs) } catch (eDet) {}
        }
        /* 2) القص على السيرفر من صور الدفعة نفسها — مع buffers للإعادة القراءة */
        var fPages = batches[fp].map(function (p: any) { return { n: p.n, base64: stripDataUrl(p.image) } })
        var cropRes = await cropFiguresServerSide({ pages: fPages } as any, fQs, { withBuffers: true })
        figuresCrop.cropped += cropRes.cropped
        figuresCrop.failed += cropRes.failed
        /* 3) مطابقة أرقام الرسمة بالتكبير — الميزانية الزمنية محفوظة */
        if (cropRes.crops && cropRes.crops.length > 0 && Date.now() - routeStart < 215000) {
          try {
            var zoomRes = await syncFigureNumbers(cropRes.crops, callGeminiParts)
            figuresFixed += zoomRes.fixed
          } catch (eZoom) {}
        }
      }
      if (figuresCrop.cropped > 0 || figuresDetected > 0 || figuresFixed > 0) {
        console.log('[AI Extract Pages] figures: crop=' + figuresCrop.cropped + '/' + (figuresCrop.cropped + figuresCrop.failed) + ' detected=' + figuresDetected + ' numFixed=' + figuresFixed)
      }
    } catch (eFC: any) {
      console.error('[AI Extract Pages] figure pipeline failed (non-fatal):', (eFC && eFC.message) || eFC)
    }

    var mcqCount = allQuestions.filter(function (q) { return q.type === 'mcq' }).length
    var writingCount = allQuestions.filter(function (q) { return q.type === 'writing' }).length
    var firstPage = pages[0].n
    var lastPage = pages[pages.length - 1].n

    /* (ز31) حارس «كل حاجة بالإنجليزي» — أي عربي زلّق من الموديل بيتترجم قبل الرجوع */
    try { allQuestions = await ensureEnglishQuestions(allQuestions) } catch (eEn) { }

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
          figuresCrop: figuresCrop,
          figuresDetected: figuresDetected,
          figuresFixed: figuresFixed,
        },
      },
    })
  } catch (error: any) {
    console.error('AI extract pages error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
