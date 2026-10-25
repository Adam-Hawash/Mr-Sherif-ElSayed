// FILE: src/lib/english-only.ts
// PURPOSE: (ز31 — طلب المستر) «كل حاجة بالإنجليزي» — حارس مركزي بيوصل بعد كل
//   استخراج/حل بالذكاء: بيدور على أي حروف عربية داخل نصوص الأسئلة/الاختيارات/
//   الحلول، ولو لقى بيبعت نداء نصي واحد سريع لـ Gemini يترجم الحقول دي للإنجليزي
//   ويرجّع نفس البنية بالظبط — فمفيش عربي بيوصل للمراجعة ولا للطلاب أبدًا،
//   حتى لو الموديل ماالتزمش بالتعليمات.
//
// الاستخدام (server-only):
//   import { ensureEnglishQuestions, containsArabic } from '@/lib/english-only'
//   questions = await ensureEnglishQuestions(questions)
//
// ملاحظات:
//   - النداء بيبقى text-only (من غير أي ملفات) وسريع — بيتعمل مرة واحدة
//     لكل استخراج، ومش بيوقف العملية لو فشل (برجّع الأصل زي ما هو).
//   - أرقام الأسئلة والـ bbox والـ figures بتتفك زي ما هي — الترجمة على
//     الحقول النصية بس (question/options/modelAnswer/acceptedAnswers/title/content).

import { callGemini, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson } from '@/lib/math-text'

/* حروف عربية (شاملة العربية الممتدة والرموز العربية الشائعة في الإجابات) */
var ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/

export function containsArabic(s: any): boolean {
  if (typeof s !== 'string') return false
  return ARABIC_RE.test(s)
}

/* الحقول النصية اللي بنتفحصها في كل سؤال */
function pickTextFields(q: any): { question?: string; options?: string[]; modelAnswer?: string; acceptedAnswers?: string[] } | null {
  if (!q || typeof q !== 'object') return null
  var out: any = null
  if (containsArabic(q.question)) out = out || {}, out.question = String(q.question)
  if (Array.isArray(q.options) && q.options.some(function (o: any) { return containsArabic(o) })) {
    out = out || {}
    out.options = q.options.map(function (o: any) { return String(o == null ? '' : o) })
  }
  if (containsArabic(q.modelAnswer)) out = out || {}, out.modelAnswer = String(q.modelAnswer)
  if (Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.some(function (a: any) { return containsArabic(a) })) {
    out = out || {}
    out.acceptedAnswers = q.acceptedAnswers.map(function (a: any) { return String(a == null ? '' : a) })
  }
  return out
}

/* تطبيق نص مترجم على السؤال — بنفس الفهارس */
function applyTranslated(q: any, tr: any): any {
  if (!q || !tr || typeof tr !== 'object') return q
  var out = Object.assign({}, q)
  if (typeof tr.question === 'string' && tr.question.trim() && !containsArabic(tr.question)) out.question = tr.question
  if (Array.isArray(tr.options) && Array.isArray(out.options) && tr.options.length === out.options.length) {
    var ok = tr.options.every(function (o: any) { return typeof o === 'string' && !containsArabic(o) })
    if (ok) out.options = tr.options
  }
  if (typeof tr.modelAnswer === 'string' && tr.modelAnswer.trim() && !containsArabic(tr.modelAnswer)) out.modelAnswer = tr.modelAnswer
  if (Array.isArray(tr.acceptedAnswers) && Array.isArray(out.acceptedAnswers) && tr.acceptedAnswers.length === out.acceptedAnswers.length) {
    var okA = tr.acceptedAnswers.every(function (a: any) { return typeof a === 'string' && !containsArabic(a) })
    if (okA) out.acceptedAnswers = tr.acceptedAnswers
  }
  return out
}

/* محلل JSON متسامح لكائن واحد */
function parseLooseObject(text: string): any | null {
  if (!text) return null
  var t = String(text).replace(/```(?:json)?/gi, '')
  var start = t.indexOf('{')
  if (start === -1) return null
  var raw = repairModelJson(t.substring(start))
  var end = raw.lastIndexOf('}')
  if (end !== -1) {
    try { var d = JSON.parse(raw.substring(0, end + 1)); if (d && typeof d === 'object') return d } catch (e) {}
  }
  return null
}

/**
 * ensureEnglishQuestions — الحارس النهائي «كل حاجة بالإنجليزي».
 * بيفحص أسئلة الاستخراج/الحل، ولو لقى عربي في أي حقل نصي بيبعت نداء ترجمة
 * واحد (نص فقط) ويرجّع الأسئلة بكل الحقول إنجليزي. فشل الترجمة → الأصل زي ما هو.
 */
export async function ensureEnglishQuestions(questions: any[]): Promise<any[]> {
  try {
    if (!Array.isArray(questions) || questions.length === 0) return questions
    if (!hasGeminiKey()) return questions

    /* جمع الحقول العربية فقط — لو مفيش، مفيش نداء خالص */
    var payload: any[] = []
    var touched: number[] = []
    for (var i = 0; i < questions.length; i++) {
      var fields = pickTextFields(questions[i])
      if (fields) { payload.push({ index: i, fields: fields }); touched.push(i) }
    }
    if (payload.length === 0) return questions

    /* سقف أمان: 60 حقل مترجم في النداء الواحد — الباقي بيفضل زي ما هو */
    var capped = payload.slice(0, 60)

    var instr: string[] = []
    instr.push('You are a precise English-only translator for a math platform.')
    instr.push('The JSON below contains question fields that were WRONGLY written in Arabic. Translate EVERY Arabic word into natural, correct ENGLISH — keep all math values, symbols, equations and numbers EXACTLY the same.')
    instr.push('RULES:')
    instr.push('- Output language: English ONLY. NEVER keep any Arabic character in any translated field.')
    instr.push('- Keep the math notation of the platform: powers as x^2, fractions as \\frac{numerator}{denominator}, roots √, × ÷ π ≤ ≥ ≠. Do NOT introduce $ or other LaTeX.')
    instr.push('- Keep field shapes identical: same keys, same array lengths, same order.')
    instr.push('- Translate the MATH CONTENT faithfully (do not solve, do not change numbers, do not add or remove steps).')
    instr.push('Return ONE valid JSON object — no text before or after, no markdown fences. Shape:')
    instr.push('{"translations":[{"index":0,"fields":{"question":"...","options":["..."],"modelAnswer":"...","acceptedAnswers":["..."]}}]}')
    instr.push('Here is the JSON:')
    var body = JSON.stringify(capped.map(function (p) { return { index: p.index, fields: p.fields } }))
    var result = await callGemini({
      parts: [{ text: instr.join('\n') + '\n' + body }],
      generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      timeoutMs: 60000,
    })
    if (!result.ok || !result.text) return questions

    var data = parseLooseObject(result.text)
    if (!data || !Array.isArray(data.translations)) return questions

    var byIndex: any = {}
    data.translations.forEach(function (t: any) {
      if (t && typeof t.index === 'number' && t.fields) byIndex[t.index] = t.fields
    })
    if (Object.keys(byIndex).length === 0) return questions

    return questions.map(function (q: any, i: number) {
      if (!byIndex[i]) return q
      return applyTranslated(q, byIndex[i])
    })
  } catch (e) {
    console.error('[english-only] ensureEnglishQuestions failed (non-fatal):', (e && (e as any).message) || e)
    return questions
  }
}

/**
 * ensureEnglishText — نسخة نص واحد (لحلول solve-questions المفردة).
 * بترجّع النص إنجليزي لو كان فيه عربي، وإلا النص زي ما هو.
 */
export async function ensureEnglishText(text: string): Promise<string> {
  try {
    var t = String(text || '')
    if (!containsArabic(t)) return t
    if (!hasGeminiKey()) return t
    var instr: string[] = []
    instr.push('Translate EVERY Arabic word in the text below into natural, correct ENGLISH. Keep all math values, symbols, equations, numbers and line structure EXACTLY the same. Output English ONLY — never keep any Arabic character. Return the translated text ONLY, no quotes, no explanations, no markdown.')
    var result = await callGemini({
      parts: [{ text: instr.join('\n') + '\n\n' + t }],
      generationConfig: { temperature: 0, maxOutputTokens: 4096 },
      timeoutMs: 45000,
    })
    if (result.ok && result.text && String(result.text).trim() && !containsArabic(result.text)) {
      return String(result.text).trim()
    }
    return t
  } catch (e) {
    return String(text || '')
  }
}
