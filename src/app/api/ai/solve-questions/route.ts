// @ts-nocheck
// FILE: src/app/api/ai/solve-questions/route.ts
// ROUTE: POST /api/ai/solve-questions
// PURPOSE: (و47) حل الأسئلة بالذكاء الاصطناعي من صفحة الأدمن — طلب المستر:
//   «ضايف ملف مش محلول واجب أو امتحان، فخلي الذكاء الاصطناعي يحله لي
//    وانا أقدر أغير في الحل عشان يظهر للطلبة — ويشوف لي الرسمة الصحيحة
//    في الاختيارات وهي تبقى الصحيحة هو يحط لي عليها».
//
// الفلو:
//   1) شاشة المراجعة (AIExtractionPanel) بتبعت دفعة أسئلة (3-4 سؤال)
//      مع روابط الرسومات (/api/files/<id>).
//   2) السيرفر بيقرا الصور من جدول Media مباشرة (base64) — من غير
//      أي رفع إضافي ولا حمل على الواجهة.
//   3) Gemini (vision) بيحل كل سؤال: اختيارات → رقم الإجابة الصحيحة
//      (ولو الاختيارات رسومات → بيبص على كل رسمة ويختار الصحيحة)،
//      مقالي → حل بسيط خطوة بخطوة.
//   4) الواجهة بتملأ correct/modelAnswer — والأستاذ يعدل قبل الحفظ.
//
// (ز31) طلب المستر الحرفي: «كل حاجة بالإنجليزي» — الحل (modelAnswer)
//   بيتكتب بالإنجليزي دايمًا، والبرومبت كله إنجليزي، وفي النهاية حارس
//   ensureEnglishText لو أي عربي زلّق من الموديل بيتترجم قبل الرجوع.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callGemini, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson } from '@/lib/math-text'
import { ensureEnglishText, containsArabic } from '@/lib/english-only'

export const runtime = 'nodejs'
export const maxDuration = 300

var FILE_URL_RE = /\/api\/files\/([A-Za-z0-9_-]{4,80})/
var MAX_QUESTIONS_PER_BATCH = 8
var MAX_IMAGE_B64 = 5000000 // ~3.7MB binary — حماية من صور عملاقة

function extractFileId(url: string): string {
  try {
    var m = FILE_URL_RE.exec(String(url || ''))
    return m ? m[1] : ''
  } catch (e) { return '' }
}

/* قراءة صورة من جدول Media (base64) وتحويلها part جاهز لـ Gemini */
async function mediaToInlinePart(url: string): Promise<any | null> {
  try {
    var id = extractFileId(url)
    if (!id) return null
    var media = await db.media.findUnique({ where: { id: id } })
    if (!media || !media.data) return null
    var mime = String(media.fileType || 'image/jpeg')
    if (mime.indexOf('image/') !== 0) return null
    var b64 = String(media.data)
    if (!b64 || b64.length > MAX_IMAGE_B64) return null
    return { inline_data: { mime_type: mime, data: b64 } }
  } catch (e) {
    return null
  }
}

/* نص السؤال اللي بيتبعث للنموذج — إنجليزي واضح ومحدد بالترتيب (ز31) */
function questionBrief(q: any): string {
  var isWriting = q.type === 'writing' || q.type === 'essay'
  var lines: string[] = []
  lines.push('■ Question i=' + q.i + (isWriting ? ' — type: WRITING (no choices)' : ' — type: MCQ (has choices)'))
  lines.push('Text: ' + (String(q.question || '').trim() || '(no text — the image IS the question)'))
  if (!isWriting) {
    var opts = Array.isArray(q.options) ? q.options : []
    var figs = Array.isArray(q.optionFigureUrls) ? q.optionFigureUrls : []
    if (opts.length > 0) {
      var parts: string[] = []
      for (var oi = 0; oi < opts.length; oi++) {
        var t = String(opts[oi] == null ? '' : opts[oi]).trim()
        var hasImg = String(figs[oi] || '').trim() !== ''
        parts.push(String.fromCharCode(65 + oi) + ') ' + (t || (hasImg ? '(picture option — look at image #' + (oi + 1) + ')' : '(no text)')))
      }
      lines.push('Choices: ' + parts.join('  |  '))
    } else if (figs.length > 0) {
      lines.push('The choices are PICTURES/FIGURES in order A,B,C,D — look at each image and pick the figure that correctly answers the question')
    }
  }
  return lines.join('\n')
}

export async function POST(request) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json({ error: 'مفاتيح الذكاء الاصطناعي مش موجودة (GEMINI_API_KEYS)' }, { status: 500 })
    }
    var body = await request.json().catch(function () { return null })
    var questions = body && Array.isArray(body.questions) ? body.questions : []
    if (questions.length === 0) {
      return NextResponse.json({ error: 'مفيش أسئلة اتبعتت' }, { status: 400 })
    }
    if (questions.length > MAX_QUESTIONS_PER_BATCH) {
      questions = questions.slice(0, MAX_QUESTIONS_PER_BATCH)
    }

    /* ===== بناء الـ parts: التعليمات + لكل سؤال نصه وصوره بالترتيب =====
       (ز31) برومبت إنجليزي 100% — الحل بيتكتب بالإنجليزي (طلب المستر الحرفي) */
    var instr: string[] = []
    instr.push('You are an expert math teacher solving exam and homework questions for students. Below is a batch of questions (some include images: the question figure and/or pictures of the answer choices).')
    instr.push('YOUR TASK — for EVERY question:')
    instr.push('1) Solve it with 100% correct math (accuracy is the top priority).')
    instr.push('2) Write in "modelAnswer" a SIMPLE, CLEAR, step-by-step solution IN ENGLISH — a few short lines: the solving steps then the final result. Example style: "Subtract 5 from both sides: 3x = 12 → x = 4. Final answer: x = 4".')
    instr.push('3) MCQ questions: set correct = the index of the right choice (0=A, 1=B, 2=C, 3=D).')
    instr.push('   • If the choices are PICTURES/figures: look at every option image with your own eyes and pick the figure that actually solves the question — that one becomes correct. NEVER guess randomly.')
    instr.push('4) WRITING questions (no choices): correct = -1 and write the complete simple solution in modelAnswer.')
    instr.push('modelAnswer WRITING RULES:')
    instr.push('• ENGLISH ONLY — never write ANY Arabic character anywhere in modelAnswer (or anywhere in the output).')
    instr.push('• MATH FORMAT (the platform renders it as real math): powers as x^2, EVERY fraction as \\frac{numerator}{denominator} (NEVER a/b), square root √, cube root ∛, multiplication ×, division ÷, π, ≤ ≥ ≠ ≈ ∠ °. No $ signs, no other LaTeX, no markdown.')
    instr.push('• NEVER guess — if the question is incomplete or unreadable from the image, write in modelAnswer: "This question needs review".')
    instr.push('Return a JSON array ONLY — no text before or after it, exactly this shape:')
    instr.push('[{"i":0,"correct":2,"modelAnswer":"..."}]')
    instr.push('where i = the question number exactly as listed below (i=0 for the first). You MUST return one line for EVERY question in the list.')
    instr.push('===== QUESTIONS =====')

    var briefs = questions.map(function (q: any, bi: number) {
      return questionBrief(Object.assign({}, q, { i: typeof q.i === 'number' ? q.i : bi }))
    })
    var parts: any[] = [{ text: instr.join('\n') + '\n' + briefs.join('\n\n') }]

    /* صور كل سؤال: رسمة السؤال الأول، بعدين صور الاختيارات بالترتيب —
       مع ترويسة نصية صغيرة تربط الصور برقم السؤال */
    for (var qi = 0; qi < questions.length; qi++) {
      var q = questions[qi]
      var imgs: any[] = []
      if (q.figureUrl) {
        var figPart = await mediaToInlinePart(q.figureUrl)
        if (figPart) imgs.push(figPart)
      }
      if (Array.isArray(q.optionFigureUrls)) {
        for (var fi = 0; fi < q.optionFigureUrls.length && fi < 4; fi++) {
          var ofPart = await mediaToInlinePart(q.optionFigureUrls[fi])
          if (ofPart) imgs.push(ofPart)
        }
      }
      if (imgs.length > 0) {
        parts.push({ text: '(Images for question i=' + (typeof q.i === 'number' ? q.i : qi) + ': the question figure first (if any), then the option pictures in order A,B,C,D (if any))' })
        for (var ii = 0; ii < imgs.length; ii++) parts.push(imgs[ii])
      }
    }

    var result = await callGemini({
      parts: parts,
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      timeoutMs: 120000,
    })

    if (!result.ok || !result.text) {
      return NextResponse.json({ error: result.error || 'الذكاء الاصطناعي مش رد — جرب تاني' }, { status: 502 })
    }

    /* ===== استخراج الـ JSON array من الرد (متسامح مع كلام زايد) ===== */
    var raw = String(result.text)
    var arrStart = raw.indexOf('[')
    var arrEnd = raw.lastIndexOf(']')
    if (arrStart === -1 || arrEnd === -1 || arrEnd <= arrStart) {
      return NextResponse.json({ error: 'الذكاء الاصطناعي رد بشكل غير متوقع — جرب تاني' }, { status: 502 })
    }
    var jsonSlice = repairModelJson(raw.slice(arrStart, arrEnd + 1))
    var solved: any[] = []
    try {
      var parsed = JSON.parse(jsonSlice)
      if (Array.isArray(parsed)) solved = parsed
    } catch (e1) {
      try {
        var parsed2 = JSON.parse(jsonSlice.replace(/,\s*([\]}])/g, '$1'))
        if (Array.isArray(parsed2)) solved = parsed2
      } catch (e2) {
        return NextResponse.json({ error: 'مقدرتش أقرا حل الذكاء الاصطناعي — جرب تاني' }, { status: 502 })
      }
    }

    /* تنقية النتايج: i صحيح + correct في نطاق سليم + modelAnswer نص
       + (ز31) حارس «كل حاجة بالإنجليزي»: أي عربي زلّق من الموديل بيتترجم قبل الرجوع */
    var clean = solved.map(function (s: any) {
      var out: any = { i: -1, correct: -1, modelAnswer: '' }
      if (s && typeof s === 'object') {
        var idx = parseInt(String(s.i), 10)
        if (isFinite(idx)) out.i = idx
        var c = parseInt(String(s.correct), 10)
        if (isFinite(c)) out.correct = c
        var ma = String(s.modelAnswer || s.answer || s.solution || '').trim()
        if (ma) out.modelAnswer = ma.slice(0, 4000)
      }
      return out
    }).filter(function (s: any) { return s.i >= 0 })

    /* (ز31) ضمانة الإنجليزي — نداء ترجمة لكل حل فيه عربي (بالتوازي، صامت لو فشل) */
    try {
      var arIdx = clean.map(function (s: any, ix: number) { return containsArabic(s.modelAnswer) ? ix : -1 }).filter(function (ix: number) { return ix >= 0 })
      if (arIdx.length > 0) {
        var translated = await Promise.all(clean.map(function (s: any) {
          return containsArabic(s.modelAnswer) ? ensureEnglishText(s.modelAnswer) : Promise.resolve(s.modelAnswer)
        }))
        translated.forEach(function (t: string, ix: number) { if (t) clean[ix].modelAnswer = t })
      }
    } catch (eEn) { /* صامت — الحل الأصلي بيفضل */ }

    return NextResponse.json({ success: true, solved: clean })
  } catch (error) {
    console.error('AI solve-questions error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة في الحل: ' + ((error && error.message) || 'Unknown') }, { status: 500 })
  }
}
