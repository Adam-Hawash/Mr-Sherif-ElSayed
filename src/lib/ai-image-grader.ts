// @ts-nocheck
// Shared AI grading logic — used by /api/ai/grade-image (direct) and
// /api/homework/submit (in-process) to avoid localhost fetch.
//
// DESIGN GOALS (user complaint: "slow + correcting randomly"):
//  1. FAST  — thinking:'low', no premature fast-fail on vision calls
//             (big photo uploads need their full timeout), tight output tokens.
//  2. SMART — the model must FIRST verify the photo actually contains the
//             STUDENT'S OWN solution to THIS question (onTopic check) before
//             grading. It must ignore printed question text / choice lists —
//             reading the question as "the student's answer" was the #1
//             accuracy bug.
//  3. FAIR  — no more dangerous local "substring → flip to correct" overrides.
//             The AI verdict stands; the only local override is an EXACT
//             normalized final-answer equivalence (fixes AI false-negatives).
//  4. HONEST — when the AI fails or is unsure → needsGrading (admin reviews)
//             instead of silently marking wrong/right.

import { db } from '@/lib/db'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson, repairCorruptMath } from '@/lib/math-text'

// Grading calls: low thinking = much faster, output is small structured JSON.
/* 2026-و25 — 3 محاولات بـ backoff صريح (1.5s ثم 4s) على 429/فشل: مفتاح Gemini
   الواحد المجاني بيضرب 429 بسهولة (خاصة مع تسلسل أسئلة مقالي كتير) — المحاولتين
   القديمين (1.2s بس) كانوا مش كفاية، وأول فشل كان بيسقط على فولباك الصفر.
   timeoutMs: 35s افتراضي للنص (حدود duration السيرفلس) — الصور بتمرر 60s
   (صور الحل الكبيرة كانت بتقطع لو قللناه — درس 2026-و12). */
async function callGrader(parts: any[], timeoutMs?: number): Promise<{ ok: boolean; text?: string; error?: string }> {
  var lastErr = ''
  var backoffs = [1500, 4000]
  for (var attempt = 0; attempt < 3; attempt++) {
    var result = await callGeminiCentral({
      parts: parts,
      /* 2026-و12 — توكنز أكتر + وقت أطول: صور الحل الكبيرة كانت بتقطع
         الـ JSON أو تطقطع التايم أوت فيرجع حكم غلط بدل تصحيح سليم */
      generationConfig: { temperature: 0.1, maxOutputTokens: 4096 },
      timeoutMs: timeoutMs || 35000,
      thinking: 'low',
    })
    if (result.ok) return { ok: true, text: result.text }
    lastErr = result.error || 'unknown'
    if (attempt < 2) await new Promise(function (r) { setTimeout(r, backoffs[attempt]) })
  }
  return { ok: false, error: lastErr }
}

/* (2026-و25) نداء التحقق الرخيص — STRICT VERIFY: بيقارن القيم النهائية بس.
   2 محاولات بتايم أوت قصير (20s) — دي مكالمة صغيرة (رد JSON سطر واحد). */
async function callVerifier(parts: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  var lastErr = ''
  for (var attempt = 0; attempt < 2; attempt++) {
    var result = await callGeminiCentral({
      parts: parts,
      generationConfig: { temperature: 0.0, maxOutputTokens: 1024 },
      timeoutMs: 20000,
      thinking: 'low',
    })
    if (result.ok) return { ok: true, text: result.text }
    lastErr = result.error || 'unknown'
    if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1500) })
  }
  return { ok: false, error: lastErr }
}

function parseAIJson(text: string): any | null {
  if (!text || !text.trim()) return null
  var jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(repairModelJson(jsonMatch[0]))
  } catch (e) {
    return null
  }
}

/* ------------------------------------------------------------------
 * Strict final-answer normalization for equivalence checking.
 * "2^{5}" === "2^5", "\frac{3}{4}" === "3/4", "x = 5." === "x = 5"
 * but "25" ≠ "2^5" (we keep the ^ marker — no blind character strip).
 * ------------------------------------------------------------------ */
export function normalizeFinalAnswer(s: string): string {
  var out = String(s || '').toLowerCase()
  // Arabic-Indic digits → Western (٤٢ = 42)
  out = out.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
  out = out.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
  // Arabic decimal separator ٫ → .  , and "3,5" → "3.5" (decimal comma)
  out = out.replace(/٫/g, '.')
  out = out.replace(/(\d)\s*,\s*(\d)/g, '$1.$2')
  // unicode superscripts → ^digits
  var supMap: Record<string, string> = { '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4', '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9' }
  out = out.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, function (m) {
    var r = '^'
    for (var i = 0; i < m.length; i++) r += supMap[m[i]] || ''
    return r
  })
  // \frac{a}{b} → a/b  (handle nesting one level)
  for (var pass = 0; pass < 2; pass++) {
    out = out.replace(/\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g, '$1/$2')
  }
  // unify operators & strip noise characters
  out = out.replace(/[×·]/g, '*')
  out = out.replace(/÷/g, '/')
  out = out.replace(/[\s{}$]/g, '')
  out = out.replace(/\\left|\\right/g, '')
  out = out.replace(/\\/g, '')
  // aaaa… (letter run of 3+) → a^n  so "aaaaaaa" === "a^7"
  out = out.replace(/([a-z])\1{2,}/g, function (m, ch) { return ch + '^' + m.length })
  // strip trailing punctuation
  out = out.replace(/[.,;:]+$/, '')
  return out
}

/* pull the final answer (after the last '=') from a solution text */
function finalPart(s: string): string {
  var parts = String(s || '').split('=')
  return (parts[parts.length - 1] || '').trim()
}

/* ------------------------------------------------------------------
 * 2026-و12 — التصحيح على الإجابة النهائية (طلب المستر الحرفي:
 * «يصحح بناءً على الإجابة النهائية اللي هي آخر حاجة»).
 * الشكل المعكوس دايماً متكافئ: "1/4 = x" === "x = 1/4" — اسم المتغير
 * ومكانه مبيغيروش حاجة، المقارنة بالقيم.
 * finalAnswerCandidates بترجع كل القيم المرشحة للإجابة النهائية:
 *   آخر جزء بعد آخر "=" + (لو النص جزأين وفيه متغير عاري) الجزء القيمي التاني.
 * المتغير العاري (x, y, n) ملوش قيمة لوحده — بنمنع مطابقة عاري×عاري
 * عشان "1/4 = x" مايتطابقش مع "2 = y" عن طريق "x"==="y".
 * ------------------------------------------------------------------ */
export function isBareVariable(s: string): boolean {
  return /^[a-z]{1,2}$/.test(normalizeFinalAnswer(s))
}

function finalAnswerCandidatesSingle(text: string): string[] {
  var t = String(text || '').toLowerCase()
  var parts = t.split(/[=:]/)
  var segs: string[] = []
  for (var i = 0; i < parts.length; i++) {
    var s = (parts[i] || '').trim()
    if (s) segs.push(s)
  }
  var out: string[] = []
  if (segs.length === 0) {
    var whole = t.trim()
    if (whole) out.push(whole)
    return out
  }
  out.push(segs[segs.length - 1])
  if (segs.length === 2) {
    var lastBare = isBareVariable(segs[1])
    var firstBare = isBareVariable(segs[0])
    if (lastBare !== firstBare) {
      if (!firstBare && out.indexOf(segs[0]) === -1) out.push(segs[0])
      if (!lastBare && out.indexOf(segs[1]) === -1) out.push(segs[1])
    }
  }
  return out
}

export function finalAnswerCandidates(text: string): string[] {
  var t = String(text || '').toLowerCase()
  /* 2026-و13 — النموذج ممكن يكون فيه أكتر من إجابة مقبولة مفصولة بـ
     «أو / او / or / |» (زي "x = 2 أو x = 1/4") — بنستخرج مرشحين
     لكل بديل لوحده عشان أي بديل يعتبر إجابة صحيحة.
     ملحوظة: ممنوع القسمة على "/" — دي بتاعة الكسور (1/2). */
  var alternatives = t.split(/\s+(?:أو|او|or)\s+|\s*\|\s*/)
    .map(function (x) { return x.trim() })
    .filter(Boolean)
  if (alternatives.length === 0) alternatives = [t]
  var out: string[] = []
  alternatives.forEach(function (alt: string) {
    finalAnswerCandidatesSingle(alt).forEach(function (c: string) {
      if (c && out.indexOf(c) === -1) out.push(c)
    })
  })
  return out
}

/* أي قيمة من إجابة الطالب متكافئة مع أي قيمة من النموذج/المقبولة؟
   (ممنوع مطابقة حرفية، وممنوع عاري×عاري) */
export function anyFinalEquivalent(studentText: string, modelText: string, acceptedAnswers?: string[]): boolean {
  var sCands = finalAnswerCandidates(studentText)
  var mCands = finalAnswerCandidates(modelText)
  var all: string[] = mCands.slice()
  ;(acceptedAnswers || []).forEach(function (a: string) { if (a && all.indexOf(a) === -1) all.push(a) })
  for (var i = 0; i < sCands.length; i++) {
    var sc = sCands[i]
    if (!sc) continue
    for (var j = 0; j < all.length; j++) {
      var cc = all[j]
      if (!cc) continue
      if (isBareVariable(sc) && isBareVariable(cc)) continue
      if (exactEquivalent(sc, cc)) return true
    }
  }
  return false
}

/* كل القيم النهائية المقبولة من جهة النموذج: أجزاء الإجابة النموذجية
   + المربّع \\boxed + 【…】 + الإجابات المقبولة الإضافية */
export function modelFinalCandidates(modelAnswer: string, acceptedAnswers?: string[]): string[] {
  var out: string[] = []
  var push = function (v: string) {
    var t = String(v || '').trim()
    if (t && out.indexOf(t) === -1) out.push(t)
  }
  var m = String(modelAnswer || '')
  finalAnswerCandidates(m).forEach(push)
  var boxedM = m.match(/\\boxed\{([^}]+)\}/g) || []
  for (var bi = 0; bi < boxedM.length; bi++) push(boxedM[bi].replace(/^\\boxed\{/, '').replace(/\}$/, ''))
  var jpM = m.match(/【([^】]+)】/g) || []
  for (var ji = 0; ji < jpM.length; ji++) push(jpM[ji].replace(/[【】]/g, ''))
  ;(acceptedAnswers || []).forEach(push)
  return out
}

/* ------------------------------------------------------------------
 * 2026-و25 — STRICT VERIFY: نداء تحقق ثاني رخيص ضد «الـ AI واثق إنه غلط وهو غلطان».
 * لما الحكم الأول يقول غلط بنبعت مكالمة صغيرة مركّزة على حاجة واحدة:
 * «قارن قيم الإجابة النهائية بس — نفس القيمة؟» — لو رجع same=true يقلب الحكم صح.
 * ده اللي بيقتل شكوى «أسئلة صح بيحسبها غلط» من جذورها.
 * الفشل هنا آمن: لو النداء فشل بنسيب الحكم الأول زي ما هو.
 * ------------------------------------------------------------------ */
export async function verifyFinalAnswerEqual(params: {
  studentFinals: string[]
  modelFinals: string[]
  question?: string
}): Promise<boolean> {
  if (!hasGeminiKey()) return false
  var cut = function (v: string) { return String(v || '').trim().substring(0, 80) }
  var sVals = (params.studentFinals || []).map(cut).filter(Boolean).slice(0, 3)
  var mVals = (params.modelFinals || []).map(cut).filter(Boolean).slice(0, 3)
  if (sVals.length === 0 || mVals.length === 0) return false

  var prompt = 'You are checking ONE thing only: are the student final value(s) and the correct final value(s) the SAME mathematical VALUE?\n\n'
  prompt += 'Compare ONLY the final numeric/algebraic values — variable names, sides of the equation, notation, order, units and formatting NEVER matter.\n'
  prompt += 'All of these are the SAME value: 2^5 = 32, 1/2 = 0.5 = ½ = 50%, x^6y^4 = y^4x^6, "1/4 = x" === "x = 1/4", √50 = 5√2, 3:4 = 3/4, 3,5 = 3.5, ٤٢ = 42.\n\n'
  if (params.question) {
    prompt += 'Question (context only): ' + String(params.question).substring(0, 300) + '\n'
  }
  prompt += 'Student final value(s): ' + sVals.join(' | ') + '\n'
  prompt += 'Correct final value(s): ' + mVals.join(' | ') + '\n\n'
  prompt += 'Is ANY student value mathematically EQUAL to ANY correct value? Answer true only if a value truly matches; false if every student value is genuinely a different value.\n'
  prompt += 'Respond with ONLY this JSON — no other text:\n{"same": true}\nor\n{"same": false}\n'

  var result = await callVerifier([{ text: prompt }])
  if (!result.ok || !result.text) return false
  var parsed = parseAIJson(result.text)
  if (!parsed) return false
  return parsed.same === true || parsed.verdict === true || parsed.equal === true
}

/* canonicalize a pure monomial so x^6y^4 === y^4*x^6 (order never matters).
 * Returns '' for anything that is NOT a pure monomial (fractions, sums …). */
function canonicalMonomial(s: string): string {
  var t = normalizeFinalAnswer(s)
  if (!t || !/^[a-z0-9^*]+$/.test(t)) return ''
  var tokens = t.match(/[a-z](?:\^\d+)?|\d+(?:\^\d+)?/g)
  if (!tokens || tokens.length === 0) return ''
  tokens.sort()
  return tokens.join('*')
}

/* safe numeric evaluation for pure arithmetic/exponent forms: 2^10 = 1024,
 * 1/2 = 0.5, 50% = 0.5, √50, π, 3:4 ratio, ½ …
 * Returns null for anything with letters (no eval of words). */
function tryNumeric(s: string): number | null {
  var t = normalizeFinalAnswer(s)
  if (!t) return null
  // unicode fractions → explicit division
  t = t.replace(/½/g, '(1/2)').replace(/¼/g, '(1/4)').replace(/¾/g, '(3/4)')
  t = t.replace(/⅓/g, '(1/3)').replace(/⅔/g, '(2/3)')
  // percent: 50% → 50/100 (= 0.5)
  t = t.replace(/%/g, '/100')
  // square roots: √50 → Math.sqrt(50), √(50) → Math.sqrt(50)
  t = t.replace(/√\s*\(?\s*([\d.]+)\s*\)?/g, 'Math.sqrt($1)')
  // pi
  t = t.replace(/π/g, 'Math.PI')
  // ratio "3:4" (as a WHOLE value) = 3/4
  if (/^[\d.]+\s*:\s*[\d.]+$/.test(t.trim())) t = t.trim().replace(/:/, '/')
  t = t.replace(/\^/g, '**')
  if (!/\d/.test(t) && t.indexOf('Math.PI') === -1) return null
  // allow only arithmetic + the Math.sqrt / Math.PI tokens we just built
  var check = t.replace(/Math\.sqrt/g, '').replace(/Math\.PI/g, '')
  if (!/^[\d+\-*/().\s]*$/.test(check)) return null
  try {
    var v = Function('"use strict"; return (' + t + ')')()
    return typeof v === 'number' && isFinite(v) ? v : null
  } catch (e) {
    return null
  }
}

/* EXACT normalized equivalence (never substring) — exported for tests */
export function exactEquivalent(a: string, b: string): boolean {
  var na = normalizeFinalAnswer(a)
  var nb = normalizeFinalAnswer(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // tolerate a leading "x=" / "ans:" label on either side
  var stripLabel = function (t: string) { return t.replace(/^[a-z]{1,4}[:=]/, '') }
  if (stripLabel(na) === stripLabel(nb)) return true
  // multiplication order never matters: x^6y^4 === y^4x^6
  var ca = canonicalMonomial(a)
  var cb = canonicalMonomial(b)
  if (ca !== '' && cb !== '' && ca === cb) return true
  // pure arithmetic evaluates equal: 2^10 = 1024, 1/2 = 0.5, 50% = 0.5, √50 = 7.071…, 3:4 = 3/4
  var va = tryNumeric(a)
  var vb = tryNumeric(b)
  if (va !== null && vb !== null && Math.abs(va - vb) < 1e-9) return true
  // percent-symmetric pass: "50%" ≡ "50" (same value, one wrote the sign and one didn't)
  var stripPct = function (t: string) { return String(t || '').replace(/%/g, '') }
  var va2 = tryNumeric(stripPct(a))
  var vb2 = tryNumeric(stripPct(b))
  if (va2 !== null && vb2 !== null && Math.abs(va2 - vb2) < 1e-9) return true
  return false
}

/* word-overlap similarity (used ONLY to detect "AI read the question text") */
function wordSimilarity(a: string, b: string): number {
  var wa = String(a || '').toLowerCase().replace(/\s+/g, ' ').split(' ').filter(function (w) { return w.length > 1 })
  var wb = String(b || '').toLowerCase().replace(/\s+/g, ' ').split(' ').filter(function (w) { return w.length > 1 })
  if (wa.length === 0 || wb.length === 0) return 0
  var setB: any = {}
  wb.forEach(function (w) { setB[w] = true })
  var hit = 0
  wa.forEach(function (w) { if (setB[w]) hit++ })
  return hit / Math.min(wa.length, wb.length)
}

/* clamp points to [0, maxPoints] as integer */
function clampPoints(p: any, maxPoints: number): number {
  var n = parseInt(String(p), 10)
  if (isNaN(n) || n < 0) n = 0
  if (n > maxPoints) n = maxPoints
  return n
}

/* ------------------------------------------------------------------
 * IMAGE grading — one multimodal call: read student work + grade.
 * ------------------------------------------------------------------ */
export async function gradeImageAnswer(params: {
  mediaId: string
  question: string
  modelAnswer?: string
  acceptedAnswers?: string[]
  maxPoints?: number
}): Promise<{
  extractedAnswer: string
  finalAnswer?: string
  isCorrect: boolean
  awardedPoints: number
  maxPoints: number
  feedback: string
  onTopic?: boolean
  confidence?: string
  needsGrading?: boolean
  error?: string
}> {
  var rawMediaId = (params.mediaId || '').trim()
  var mediaId = rawMediaId
  if (rawMediaId.indexOf('/') >= 0) {
    var lastSlash = rawMediaId.lastIndexOf('/')
    mediaId = rawMediaId.substring(lastSlash + 1).trim()
  }
  mediaId = mediaId.replace(/^["']|["']$/g, '')
  var question = params.question || ''
  var modelAnswer = params.modelAnswer || ''
  var acceptedAnswers = Array.isArray(params.acceptedAnswers) ? params.acceptedAnswers : []
  var maxPoints = typeof params.maxPoints === 'number' ? params.maxPoints : 5

  var MANUAL = {
    extractedAnswer: '',
    isCorrect: false,
    awardedPoints: 0,
    maxPoints: maxPoints,
    feedback: 'التصحيح الذكي مش متأكد من الإجابة دي — هتتراجع من الأستاذ',
    needsGrading: true,
  }

  if (!mediaId) {
    return Object.assign({}, MANUAL, { feedback: 'mediaId required', error: 'mediaId required' })
  }
  if (!hasGeminiKey()) {
    return Object.assign({}, MANUAL, { feedback: 'AI غير متاح — هتتراجع من الأستاذ', error: 'no api key' })
  }

  // Fetch the media record (image stored as base64)
  var media: any = null
  try {
    media = await db.media.findUnique({ where: { id: mediaId } })
  } catch (e) {
    try {
      var rows = await db.$queryRawUnsafe('SELECT id, filename, fileType, data FROM Media WHERE id = ? LIMIT 1', mediaId)
      media = rows && rows.length > 0 ? rows[0] : null
    } catch (e2) {
      media = null
    }
  }
  if (!media || !media.data) {
    return Object.assign({}, MANUAL, { feedback: 'الصورة غير موجودة — هتتراجع من الأستاذ', error: 'media not found' })
  }

  var mimeType = media.fileType || 'image/jpeg'
  if (!mimeType.startsWith('image/')) {
    if (mimeType.includes('png') || (media.filename || '').endsWith('.png')) mimeType = 'image/png'
    else if (mimeType.includes('webp') || (media.filename || '').endsWith('.webp')) mimeType = 'image/webp'
    else mimeType = 'image/jpeg'
  }

  // ---------- STRICT GRADING PROMPT ----------
  var acceptedStr = acceptedAnswers.length > 0
    ? '\nOther accepted final answers: ' + acceptedAnswers.join(' | ')
    : ''

  var prompt = 'You are an expert, STRICT math teacher grading one student submission.\n\n'
  prompt += 'THE QUESTION the student answered:\n' + repairCorruptMath(question) + '\n\n'
  if (modelAnswer) {
    prompt += 'MODEL SOLUTION:\n' + repairCorruptMath(modelAnswer) + '\n'
  }
  prompt += acceptedStr + '\n\n'
  prompt += 'The student attached a PHOTO that is supposed to show THEIR OWN handwritten or typed solution to the question above.\n\n'
  prompt += 'Follow these steps EXACTLY:\n'
  prompt += 'STEP 1 — Look at the photo. Identify the STUDENT\'S OWN work: handwriting/typing produced by the student (solution steps, calculations, a final answer).\n'
  prompt += 'STEP 2 — IGNORE all pre-printed content: the question text itself, choice lists like (A) B) C) D)), headers, logos, other questions on the page. The student did not write those, and they are NOT their answer.\n'
  prompt += 'STEP 3 — TOPIC CHECK (onTopic): does the photo actually contain the student\'s OWN solution attempt to THIS exact question? If it only shows the printed question, or a different question, or nothing at all → onTopic=false.\n'
  prompt += 'STEP 4 — Find the student\'s FINAL ANSWER. Priority order:\n'
  prompt += '   (a) If ANY value is written inside a BOX / frame / مربع / circled / clearly boxed at the end → THAT is the final answer. Students are taught to box their final answer — the box is the answer, ALWAYS.\n'
  prompt += '   (b) If there is no box → the final answer is the LAST line they wrote (the value after the LAST "=").\n'
  prompt += '   CRITICAL: every intermediate step, every middle result, every scratched-out attempt is NOT the answer. Do NOT grade an intermediate value. Many students write wrong-looking middle steps and still end with the CORRECT boxed final answer — that is CORRECT, full marks. If you compare a middle step against the model answer instead of the boxed/last value, you FAIL.\n'
  prompt += '   Set answerSource = "boxed" if found in a box, "last-line" if from the last line, "unclear" if you truly cannot read any final value.\n'
  prompt += 'STEP 5 — Compare the student\'s final answer VALUE with the model final answer and accepted answers. You are comparing MATHEMATICAL VALUES, not strings. The model answer may list MULTIPLE acceptable final answers separated by "أو" / "او" / "or" (like "x = 2 أو x = 1/4") — the student\'s final answer is CORRECT if it matches ANY ONE of those alternatives. All of these are the SAME answer: 2^7 = 128, 1/2 = 0.5 = ½ = 50%, n=6 = n = 6 = 6, x^4y^3 = y^3x^4, √50 = 5√2, 2^{n+2} = 2^n·4, 3:4 = 3/4, 3,5 = 3.5, ٤٢ = 42. Units and labels NEVER matter (12 سم = 12 cm = 12). "1/4 = x" and "x = 1/4" are the SAME answer — the variable name and its side/position NEVER matter; grade ONLY the final VALUE the student ended with (the LAST thing written). Simplify BOTH sides mentally before deciding.\n'
  prompt += 'STEP 6 — A correct final answer with wrong/missing/unreadable steps is still CORRECT (full points). A genuinely DIFFERENT final value is WRONG even if the steps look nice. Never mark an answer wrong just because the handwriting is hard to read or the steps are messy — judge the final value.\n'
  prompt += 'STEP 6.5 — UNDERSTAND the solution like a human teacher (as if the student is explaining it to you), NEVER literal matching: a small SLIP in a MIDDLE step (sign slip like writing "-4x = 1" instead of "-4x = -1", a small arithmetic slip, a crossed-out attempt, a step the student self-corrected right after) does NOT make the work wrong when the student ENDED at the correct final answer. Students stumble mid-way and fix themselves — judge where they ENDED. Only the FINAL value decides correct/wrong.\n'
  prompt += 'STEP 6.6 — READ HANDWRITING CAREFULLY (the worst failure is grading a CORRECT answer as wrong because you misread a digit): read every handwritten digit with FULL attention (4 vs 9, 1 vs 7, 5 vs 3, 0 vs 6, 2 vs 7). Re-read the final answer TWICE before deciding. If the final value you read equals the model value → it is CORRECT, full stop.\n'
  prompt += 'STEP 7 — ALWAYS give a definite verdict (isCorrect true or false). Only say onTopic=false when the photo truly contains NO student work at all.\n\n'
  prompt += 'awardedPoints: an integer from 0 to ' + maxPoints + '. HARD RULE — no partial credit: if isCorrect=true then awardedPoints MUST be exactly ' + maxPoints + ' (NEVER deduct for messy/hard-to-read/unfinished-looking steps when the final answer is right); if isCorrect=false then awardedPoints MUST be 0.\n\n'
  prompt += 'FEEDBACK STYLE (2026-و24 + 2026-و30 — the teacher wants STRONG teacher-style notes like a real chat with the student): LANGUAGE IS MANDATORY — write the feedback in عامية مصرية بسيطة (Egyptian COLLOQUIAL Arabic) — ممنوع منعًا باتًا الفصحى (لا «حدث/ثم/قمت ب/خطأ في») — use «بص، خلي بالك، اللي حصل إن، طبّق تاني، برافو، مش، عشان» talking DIRECTLY to the student (استخدم «إنت») — 2–3 short sentences. Correct → praise + say WHAT he did right (the method/rule + the final value): «برافو عليك! تبسيطك للأسس صح ووصلت للناتج بالظبط.» Wrong → (1) WHERE exactly the mistake happened (which step/rule), (2) the correct approach, (3) the correct final answer: «بص يا بطل، اللي حصل إنك في الخطوة التانية ضربت الأس غلط — الضرب بيجمّع الأسس a^6 × a^2 = a^8 مش a^4، خلي بالك وطبّق القاعدة تاني والصح a^4 b^6.» NEVER generic (ممنوع «إجابة غلط» لوحدها) وNEVER فصحى.\n\n'
  prompt += 'Respond with ONLY this JSON — no markdown, no extra text:\n'
  prompt += '{"onTopic": true, "extractedAnswer": "the student\'s own work, max 3 short lines", "finalAnswer": "only the final boxed/last value", "answerSource": "boxed", "isCorrect": true, "awardedPoints": ' + maxPoints + ', "confidence": "high", "feedback": "ملاحظة بالعامية المصرية للطالب: ليه صح أو ليه غلط — كأنك بتكلمه بجد (جملتين كحد أقصى)"}\n'

  var parts = [
    { text: prompt },
    { inlineData: { mimeType: mimeType, data: media.data } },
  ]

  var result = await callGrader(parts, 60000)

  if (!result.ok) {
    console.error('[gradeImageAnswer] Gemini failed:', result.error)
    return Object.assign({}, MANUAL, { error: result.error })
  }

  var parsed = parseAIJson(result.text || '')
  if (!parsed) {
    console.error('[gradeImageAnswer] Failed to parse:', (result.text || '').substring(0, 200))
    return Object.assign({}, MANUAL, { error: 'parse failed' })
  }

  var onTopic = parsed.onTopic !== false
  var confidence = String(parsed.confidence || 'high').toLowerCase()
  var extractedAnswer = String(parsed.extractedAnswer || '').trim()
  var finalAns = String(parsed.finalAnswer || parsed.final_answer || '').trim()
  // لو الـ AI معملش حقل finalAnswer → نجرب نستخرجه من آخر سطر في الـ extracted
  if (!finalAns && extractedAnswer) {
    var fromExtract = finalPart(extractedAnswer)
    if (fromExtract) finalAns = fromExtract
  }
  var isCorrect = parsed.isCorrect === true
  var awardedPoints = clampPoints(parsed.awardedPoints, maxPoints)
  var feedback = String(parsed.feedback || '').trim()
  var needsGrading = false

  // ---- GUARD 0 (2026-و19): الصورة واصلة **مقطوعة/ناقصة** — دي صور رفع
  // قديم قبل إصلاح تجميع الأجزاء (أول 2MB بس كانت بتتحفظ). ممنوع صفر ظالم
  // على عيب في الرفع مش في حل الطالب: درجة محاولة عادلة (نص الدرجة)
  // والمراجعة اليدوية متاحة للمستر من الأدمن زي أي سؤال.
  // (الصور الجديدة بعد إصلاح الرفع بتوصل كاملة والحردهم مش بتشتغل)
  var truncHay = (feedback + ' \n ' + extractedAnswer).toLowerCase()
  var truncHint = /(?:الصورة|الصوره|الصور|photo|image|picture|screenshot)[^\n.]{0,40}(?:مقطوع|مقصوص|متقطع|ناقص|ناقصة|غير كامل|مش كامل|مش مكتمل|غير مكتمل|cut|cropped|truncat|incomplete|partial)|(?:cut off|cut-off|truncated|incomplete|cropped|partially)[^\n.]{0,30}(?:photo|image|picture)|only (?:the )?(?:top|first|upper|beginning|part of)[^\n.]{0,40}(?:photo|image|visible|shown|page)/i.test(truncHay)
  if (!isCorrect && truncHint) {
    var fairAttempt = maxPoints > 0 ? Math.max(1, Math.ceil(maxPoints / 2)) : 0
    return {
      extractedAnswer: extractedAnswer,
      finalAnswer: finalAns,
      isCorrect: false,
      awardedPoints: fairAttempt,
      maxPoints: maxPoints,
      feedback: feedback
        ? feedback + ' — الصورة وصلت ناقصة (رفع قديم) فاتحسبت درجة محاولة عادلة؛ عدّلها يدويًا من هنا لو حل الطالب كامل وصحيح'
        : 'الصورة وصلت ناقصة (رفع قديم قبل إصلاح الرفع) — اتحسبت نص الدرجة كمحاولة عادلة، عدّلها يدويًا من الأدمن لو الحل كامل وصحيح',
      onTopic: true,
      confidence: 'low',
      needsGrading: false,
    }
  }

  // ---- GUARD 1: photo is not actually the student's solution to THIS question.
  // Decisive verdict (0 points + clear feedback) instead of stalling on manual
  // review — the teacher can override from the admin panel if needed.
  if (!onTopic) {
    return {
      extractedAnswer: extractedAnswer,
      finalAnswer: finalAns,
      isCorrect: false,
      awardedPoints: 0,
      maxPoints: maxPoints,
      feedback: feedback || 'الصورة مفيهاش حل واضح للسؤال ده — لو ده حل الطالب صحّحه من الأدمن',
      onTopic: false,
      confidence: confidence,
      needsGrading: false,
    }
  }

  // ---- GUARD 2: the "extracted answer" is basically the QUESTION text
  // (the model read the printed question instead of the student's work).
  // Only a problem when there is NO final answer to grade — with a real
  // finalAnswer we grade by it and never stall the submission.
  if (question && extractedAnswer && !finalAns && wordSimilarity(extractedAnswer, question) >= 0.8) {
    return {
      extractedAnswer: extractedAnswer,
      finalAnswer: finalAns,
      isCorrect: false,
      awardedPoints: 0,
      maxPoints: maxPoints,
      feedback: 'مفيش إجابة نهائية واضحة في الصورة — راجعها من الأدمن لو الطالب حصل حل',
      onTopic: true,
      confidence: 'low',
      needsGrading: true,
    }
  }

  // ---- GUARD 3: exact-equivalence false-negative fix (AI said wrong but the
  // final answers are EXACTLY equivalent after normalization).
  // 2026-و12: بيقارن كل قيم الإجابة النهائية (الطالب × [كل أجزاء النموذج
  // + المربّع + المقبولة]) — بيصلّح الشكل المعكوس "1/4 = x" vs "x = 1/4".
  if (!isCorrect && finalAns) {
    var candidates: string[] = []
    if (modelAnswer) {
      var mCands3 = finalAnswerCandidates(modelAnswer)
      for (var m3 = 0; m3 < mCands3.length; m3++) candidates.push(mCands3[m3])
      var boxedM = modelAnswer.match(/\\boxed\{([^}]+)\}/g) || []
      for (var bi = 0; bi < boxedM.length; bi++) {
        var inner = boxedM[bi].replace(/^\\boxed\{/, '').replace(/\}$/, '')
        if (inner) candidates.push(inner)
      }
      var jpM = modelAnswer.match(/【([^】]+)】/g) || []
      for (var ji = 0; ji < jpM.length; ji++) candidates.push(jpM[ji].replace(/[【】]/g, ''))
    }
    acceptedAnswers.forEach(function (a) { candidates.push(a) })
    var sCands3 = finalAnswerCandidates(finalAns)
    var flipped = false
    for (var si = 0; si < sCands3.length && !flipped; si++) {
      var sc3 = sCands3[si]
      if (!sc3) continue
      for (var ci = 0; ci < candidates.length; ci++) {
        var cc3 = candidates[ci]
        if (!cc3) continue
        if (isBareVariable(sc3) && isBareVariable(cc3)) continue
        if (exactEquivalent(sc3, cc3)) {
          isCorrect = true
          awardedPoints = maxPoints
          flipped = true
          if (!feedback || feedback.indexOf('غلط') >= 0 || feedback.indexOf('خطأ') >= 0 || feedback.indexOf('خاطئة') >= 0) {
            feedback = 'إجابة صحيحة — الإجابة النهائية (الأخيرة) مطابقة للصحيحة'
          }
          break
        }
      }
    }
  }
  // ---- GUARD 3.5 (2026-و25): الـ AI رفض والحكم غلط والإجابة النهائية مقروءة
  // → نداء تحقق ثاني رخيص (STRICT VERIFY) يقارن القيم النهائية بس — لو same
  // يقلب صح كاملة. ده بيقتل «بيحسبها غلط وهي صح» في مسار الصور كمان.
  if (!isCorrect && finalAns && (modelAnswer || acceptedAnswers.length > 0)) {
    try {
      var mCandsV = modelFinalCandidates(modelAnswer, acceptedAnswers).slice(0, 3)
      if (mCandsV.length > 0) {
        var sameImg = await verifyFinalAnswerEqual({ studentFinals: [finalAns], modelFinals: mCandsV, question: question })
        if (sameImg) {
          isCorrect = true
          awardedPoints = maxPoints
          needsGrading = false
          if (!feedback || feedback.indexOf('غلط') >= 0 || feedback.indexOf('خطأ') >= 0 || feedback.indexOf('خاطئة') >= 0) {
            feedback = 'إجابة صحيحة — الإجابة النهائية (' + finalAns + ') مطابقة للصحيحة (اتأكدنا منها مرتين)'
          }
        }
      }
    } catch (verErr) { console.error('[gradeImageAnswer] verify error:', verErr) }
  }
  // 2026-و19 — الصح = الدرجة كاملة دايمًا (طلب المستر الحرفي: التصحيح على
  // الإجابة النهائية — الموديل كان بيفهم صح ويعطي isCorrect=true لكن يخصم
  // نقطة ببلاش من حل كامل ويدّي 4/5 — ممنوع، الحكم النهائي هو اللي بيحدد)
  if (isCorrect) awardedPoints = maxPoints
  // AI said wrong → 0 points, period
  if (!isCorrect) awardedPoints = 0

  // ---- GUARD 4: honest review when the AI says WRONG but it is not sure it
  // even READ the final answer correctly (unreadable handwriting / no final
  // value found). A false ZERO is the worst outcome — the teacher reviews
  // these instead of the student losing marks unfairly.
  if (!isCorrect && (confidence === 'low' || !finalAns)) {
    needsGrading = true
    awardedPoints = 0
    if (!feedback) feedback = 'التصحيح الذكي مش متأكد إنه قري الإجابة النهائية صح من الصورة — راجعها من هنا'
  }

  // ---- GUARD 5: low confidence on a CORRECT verdict never blocks — the
  // result stands and the teacher can still flip it from the admin panel.
  if (confidence === 'low' && isCorrect && !feedback) {
    feedback = 'إجابة صحيحة (بثقة منخفضة — راجعها لو شكيت)'
  }

  // display text: work + final answer
  var displayExtracted = extractedAnswer
  if (finalAns && finalAns !== extractedAnswer) {
    displayExtracted = (extractedAnswer ? extractedAnswer + '\n' : '') + 'الإجابة النهائية: ' + finalAns
  }

  return {
    extractedAnswer: displayExtracted,
    finalAnswer: finalAns,
    isCorrect: isCorrect,
    awardedPoints: awardedPoints,
    maxPoints: maxPoints,
    feedback: feedback || (isCorrect ? 'إجابة صحيحة' : 'إجابة مختلفة عن الإجابة الصحيحة'),
    onTopic: true,
    confidence: confidence,
    needsGrading: needsGrading,
  }
}

// Extract media IDs from a student answer that contains image attachment tags.
// Supports:
//   1. [📷 صورة مرفقة: MEDIA_ID]
//   2. [📷 صورة مرفقة: /api/files/MEDIA_ID]
//   3. [📷 صورة مرفقة: /some/path/MEDIA_ID]
//   4. CORRUPTED markers — junk glued after the id like "…/cmt…4y(85owp8h/"
//      → the cuid pattern c[a-z0-9]{14,} is extracted and trailing junk dropped.
export function extractImageMediaIds(answerText: string): string[] {
  if (!answerText || typeof answerText !== 'string') return []
  var matches = answerText.match(/\[📷[^\]]*\]?/g) || []
  var ids: string[] = []
  matches.forEach(function (m) {
    // 1st try: a real /api/files/<id> path (also survives junk right after the id)
    var pathMatch = m.match(/\/api\/files\/(c[a-z0-9]{8,})/i)
    var mediaId = pathMatch ? pathMatch[1] : ''
    if (!mediaId) {
      var idMatch = m.match(/[:\s]\s*([^\]]+)/)
      var raw = idMatch && idMatch[1] ? idMatch[1].trim().replace(/^["']+|["']+$/g, '') : ''
      if (raw) {
        var cuid = raw.match(/c[a-z0-9]{14,}/i)
        if (cuid) mediaId = cuid[0]
        else {
          var lastSlash = raw.lastIndexOf('/')
          mediaId = (lastSlash >= 0 ? raw.substring(lastSlash + 1) : raw).trim()
          mediaId = mediaId.replace(/[^\w\-].*$/, '').trim()
        }
      }
    }
    if (mediaId && ids.indexOf(mediaId) === -1) ids.push(mediaId)
  })
  return ids
}

/* ------------------------------------------------------------------
 * TEXT grading — for writing answers typed without an image.
 * Same strict contract as image grading.
 * ------------------------------------------------------------------ */
export async function gradeTextAnswer(params: {
  question: string
  studentAnswer: string
  modelAnswer: string
  acceptedAnswers?: string[]
  maxPoints?: number
}): Promise<{
  extractedAnswer: string
  isCorrect: boolean
  awardedPoints: number
  maxPoints: number
  feedback: string
  confidence?: string
  needsGrading?: boolean
} | null> {
  var question = params.question || ''
  var studentAnswer = params.studentAnswer || ''
  var modelAnswer = params.modelAnswer || ''
  var acceptedAnswers = Array.isArray(params.acceptedAnswers) ? params.acceptedAnswers : []
  var maxPoints = typeof params.maxPoints === 'number' ? params.maxPoints : 5

  // modelAnswer is OPTIONAL now: when missing, the AI solves the question
  // itself and grades against its own solution (nothing left ungraded)
  if (!studentAnswer || (!modelAnswer && !question)) return null
  if (!hasGeminiKey()) return null

  var acceptedStr = acceptedAnswers.length > 0
    ? '\nOther accepted final answers: ' + acceptedAnswers.join(' | ')
    : ''

  var prompt = 'You are an expert, FAIR math teacher who grades by MATHEMATICAL VALUE — never by literal wording. Grade the student\'s typed answer.\n\n'
  prompt += 'THE QUESTION:\n' + repairCorruptMath(question) + '\n\n'
  prompt += 'STUDENT ANSWER:\n' + repairCorruptMath(studentAnswer) + '\n\n'
  prompt += 'MODEL SOLUTION:\n' + (modelAnswer ? repairCorruptMath(modelAnswer) : '(none - SOLVE the question yourself step by step, find the correct final answer, then grade the student answer against YOUR solution. Grade on the final answer AND the solution steps: correct final → full points, correct method with small slip → about half)') + '\n'
  prompt += acceptedStr + '\n\n'
  prompt += 'CORE PRINCIPLE — the student answer is CORRECT (full points) whenever its FINAL value is mathematically EQUAL to the model final value, even if written differently:\n'
  prompt += '- The model answer may list MULTIPLE acceptable final answers separated by "أو" / "او" / "or" (like "x = 2 أو x = 1/4") — the student answer is CORRECT if it matches ANY ONE of those alternatives\n'
  prompt += '- Different order: y^4x^6 = x^6y^4\n'
  prompt += '- REVERSED equation forms are the SAME answer: "1/4 = x" === "x = 1/4" — the variable name and its side/position NEVER matter\n'
  prompt += '- Different notation: a^7 = aaaaaaa (a multiplied 7 times), 2^10 = 1024, 1/2 = 0.5 = ½ = 50%, x^(1/2) = √x, √50 = 5√2, 3:4 = 3/4, 3,5 = 3.5\n'
  prompt += '- Arabic digits ٤٢ = 42; units and labels are IGNORED (12 سم = 12 cm = 12, x = 5 = 5); with or without × * · spaces or steps\n'
  prompt += '- The final value may be CONTAINED in the model solution (model shows steps, student wrote only the final result) → still CORRECT\n'
  prompt += 'Rules:\n'
  prompt += '1. Extract the student\'s FINAL answer (after the last "=" or the last result written).\n'
  prompt += '2. Compare ONLY final values with the model final answer / accepted answers — accept all equivalent forms above.\n'
  prompt += '3. A correct final answer with wrong/missing steps is CORRECT. A genuinely different final value is WRONG.\n'
  prompt += '3b. UNDERSTAND the answer like you are talking with the student — interpret what they MEANT mathematically (never literal string matching). A small slip in a MIDDLE step (sign slip, arithmetic slip, self-corrected step) does NOT make the work wrong when the FINAL value is correct — students stumble mid-way and fix themselves; judge where they ENDED.\n'
  prompt += '4. If the student answer does not actually address the question (e.g. it is just the question text, or unrelated) → isCorrect=false and confidence="low".\n'
  prompt += '5. Never guess. If unsure → confidence="low".\n'
  prompt += '6. READ CAREFULLY (worst failure = a correct answer graded wrong): re-read the student final answer TWICE — read every digit carefully (4 vs 9, 1 vs 7, 5 vs 3, 0 vs 6). If the final value you read equals the model value → CORRECT, full stop.\n\n'
  prompt += 'FEEDBACK STYLE (2026-و24 — STRONG teacher-style note like a real chat): Egyptian Arabic, talk to him directly (انت) — 2–3 short sentences. Correct → praise + WHAT he did right (the rule/method + final value): «برافو عليك! وزعت الأس صح ووصلت لـ a^4 b^6 — ده بالظبط المطلوب.» Wrong → (1) WHERE the mistake happened (which step/rule), (2) the correct approach, (3) the correct final answer: «في الخطوة التانية ضربت الأس غلط — الضرب بيجمّع الأسس a^6 × a^2 = a^8 مش a^4، طبّق القاعدة تاني والصح a^4 b^6.» NEVER generic.\n\n'
  prompt += 'awardedPoints: integer 0 to ' + maxPoints + '. HARD RULE — no partial credit: isCorrect=true ⇒ awardedPoints exactly ' + maxPoints + '; isCorrect=false ⇒ 0.\n\n'
  prompt += 'Respond with ONLY this JSON — no markdown:\n'
  prompt += '{"isCorrect": true, "awardedPoints": ' + maxPoints + ', "confidence": "high", "feedback": "ملاحظة بالمصري للطالب: ليه صح أو ليه غلط — كأنك بتكلمه بجد (جملتين كحد أقصى)"}\n'

  var result = await callGrader([{ text: prompt }])
  if (!result.ok || !result.text) return null

  var parsed = parseAIJson(result.text)
  if (!parsed) return null

  var isCorrect = parsed.isCorrect === true
  var confidence = String(parsed.confidence || 'high').toLowerCase()
  var awardedPoints = clampPoints(parsed.awardedPoints, maxPoints)

  // exact-equivalence false-negative fix (2026-و12): كل قيم إجابة الطالب
  // مقابل كل قيم النموذج + المربّع + المقبولة — بيصلّح الشكل المعكوس
  if (!isCorrect) {
    var candidates: string[] = []
    var mCands4 = finalAnswerCandidates(modelAnswer)
    for (var m4 = 0; m4 < mCands4.length; m4++) candidates.push(mCands4[m4])
    var boxedM = modelAnswer.match(/\\boxed\{([^}]+)\}/g) || []
    for (var bi = 0; bi < boxedM.length; bi++) candidates.push(boxedM[bi].replace(/^\\boxed\{/, '').replace(/\}$/, ''))
    var jpM = modelAnswer.match(/【([^】]+)】/g) || []
    for (var ji = 0; ji < jpM.length; ji++) candidates.push(jpM[ji].replace(/[【】]/g, ''))
    acceptedAnswers.forEach(function (a) { candidates.push(a) })
    var sCands4 = finalAnswerCandidates(studentAnswer)
    for (var si2 = 0; si2 < sCands4.length && !isCorrect; si2++) {
      var sc4 = sCands4[si2]
      if (!sc4) continue
      for (var ci2 = 0; ci2 < candidates.length; ci2++) {
        var cc4 = candidates[ci2]
        if (!cc4) continue
        if (isBareVariable(sc4) && isBareVariable(cc4)) continue
        if (exactEquivalent(sc4, cc4)) { isCorrect = true; break }
      }
    }
  }
  // ---- STRICT VERIFY (2026-و25): الـ AI واثق إنه غلط؟ نداء تحقق ثاني رخيص
  // يقارن قيم الإجابة النهائية بس — لو رجع same يقلب الحكم صح كاملة.
  // ده علاج شكوى «أسئلة صح بيحسبها غلط» — المقارنة الأولى بتغلط في قراية
  // الشكل/الصياغة، والتحديده بيتم على القيمة بس.
  if (!isCorrect && (modelAnswer || acceptedAnswers.length > 0)) {
    try {
      var sCandsV = finalAnswerCandidates(studentAnswer).slice(0, 3)
      if (sCandsV.length > 0) {
        var mCandsV = modelFinalCandidates(modelAnswer, acceptedAnswers).slice(0, 3)
        if (mCandsV.length > 0) {
          var sameTxt = await verifyFinalAnswerEqual({ studentFinals: sCandsV, modelFinals: mCandsV, question: question })
          if (sameTxt) {
            isCorrect = true
            awardedPoints = maxPoints
            confidence = 'high'
            feedback = 'برافو عليك ✓ الإجابة النهائية (' + sCandsV[0] + ') مطابقة للإجابة الصحيحة — تم التأكد من القيمة مرتين'
          }
        }
      }
    } catch (verErr) { console.error('[gradeTextAnswer] verify error:', verErr) }
  }
  if (isCorrect && awardedPoints === 0) awardedPoints = maxPoints
  if (!isCorrect) awardedPoints = 0

  return {
    extractedAnswer: studentAnswer,
    isCorrect: isCorrect,
    awardedPoints: awardedPoints,
    maxPoints: maxPoints,
    feedback: String(parsed.feedback || '').trim() || (isCorrect ? 'إجابة صحيحة' : 'إجابة مختلفة عن الإجابة الصحيحة'),
    confidence: confidence,
    // غلط + ثقة واطية → مراجعة من الأستاذ بدل صفر ظالم
    needsGrading: !isCorrect && confidence === 'low',
  }
}
