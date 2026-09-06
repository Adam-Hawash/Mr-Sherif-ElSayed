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
// One automatic retry — a transient failure should NEVER leave a submission
// stuck on "needs manual correction" (teacher request: AI finishes the job).
async function callGrader(parts: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  var lastErr = ''
  for (var attempt = 0; attempt < 2; attempt++) {
    var result = await callGeminiCentral({
      parts: parts,
      generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
      timeoutMs: 35000,
      thinking: 'low',
    })
    if (result.ok) return { ok: true, text: result.text }
    lastErr = result.error || 'unknown'
    if (attempt === 0) await new Promise(function (r) { setTimeout(r, 1200) })
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
 * 1/2 = 0.5. Returns null for anything with letters (no eval of words). */
function tryNumeric(s: string): number | null {
  var t = normalizeFinalAnswer(s).replace(/\^/g, '**')
  if (!t || !/\d/.test(t) || !/^[\d+\-*/(). ]+$/.test(t)) return null
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
  // pure arithmetic evaluates equal: 2^10 = 1024, 1/2 = 0.5
  var va = tryNumeric(a)
  var vb = tryNumeric(b)
  if (va !== null && vb !== null && Math.abs(va - vb) < 1e-9) return true
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
  prompt += 'STEP 4 — Find the student\'s FINAL ANSWER. It is usually the LAST thing they wrote: after the last "=", or a boxed/circled/underlined value, or after the word ANSWER. Read it UNDERSTANDING the math — messy handwriting, crossed-out attempts and unreadable middle steps DO NOT matter. Only the final answer matters.\n'
  prompt += 'STEP 5 — Compare the student\'s final answer VALUE with the model final answer and accepted answers. You are comparing MATHEMATICAL VALUES, not strings. All of these are the SAME answer: 2^7 = 128, 1/2 = 0.5 = ½, n=6 = n = 6 = 6, x^4y^3 = y^3x^4, √50 = 5√2, 2^{n+2} = 2^n·4. Simplify BOTH sides mentally before deciding.\n'
  prompt += 'STEP 6 — A correct final answer with wrong/missing/unreadable steps is still CORRECT (full points). A genuinely DIFFERENT final value is WRONG even if the steps look nice. Never mark an answer wrong just because the handwriting is hard to read or the steps are messy — judge the final value.\n'
  prompt += 'STEP 7 — ALWAYS give a definite verdict (isCorrect true or false). Only say onTopic=false when the photo truly contains NO student work at all.\n\n'
  prompt += 'awardedPoints: an integer from 0 to ' + maxPoints + ' (' + maxPoints + ' only when isCorrect=true).\n\n'
  prompt += 'Respond with ONLY this JSON — no markdown, no extra text:\n'
  prompt += '{"onTopic": true, "extractedAnswer": "the student\'s own work, max 3 short lines", "finalAnswer": "only the final answer", "isCorrect": true, "awardedPoints": ' + maxPoints + ', "confidence": "high", "feedback": "تعليق قصير بالعامية المصرية"}\n'

  var parts = [
    { text: prompt },
    { inlineData: { mimeType: mimeType, data: media.data } },
  ]

  var result = await callGrader(parts)

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
  var isCorrect = parsed.isCorrect === true
  var awardedPoints = clampPoints(parsed.awardedPoints, maxPoints)
  var feedback = String(parsed.feedback || '').trim()
  var needsGrading = false

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
  if (!isCorrect && finalAns) {
    var candidates: string[] = []
    if (modelAnswer) candidates.push(finalPart(modelAnswer))
    acceptedAnswers.forEach(function (a) { candidates.push(a) })
    for (var ci = 0; ci < candidates.length; ci++) {
      if (candidates[ci] && exactEquivalent(finalAns, candidates[ci])) {
        isCorrect = true
        awardedPoints = maxPoints
        if (!feedback || feedback.indexOf('غلط') >= 0 || feedback.indexOf('خطأ') >= 0 || feedback.indexOf('خاطئة') >= 0) {
          feedback = 'إجابة صحيحة — الإجابة النهائية مطابقة'
        }
        break
      }
    }
  }
  // AI said correct but gave 0 points → give full
  if (isCorrect && awardedPoints === 0) awardedPoints = maxPoints
  // AI said wrong → 0 points, period
  if (!isCorrect) awardedPoints = 0

  // ---- GUARD 4: low confidence NEVER blocks the result anymore — the AI
  // verdict stands and the teacher can still flip it from the admin panel.
  if (confidence === 'low' && !feedback) {
    feedback = isCorrect ? 'إجابة صحيحة (بثقة منخفضة — راجعها لو شكيت)' : 'إجابة مختلفة عن الصحيحة (بثقة منخفضة)'
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

  if (!studentAnswer || !modelAnswer) return null
  if (!hasGeminiKey()) return null

  var acceptedStr = acceptedAnswers.length > 0
    ? '\nOther accepted final answers: ' + acceptedAnswers.join(' | ')
    : ''

  var prompt = 'You are an expert, FAIR math teacher who grades by MATHEMATICAL VALUE — never by literal wording. Grade the student\'s typed answer.\n\n'
  prompt += 'THE QUESTION:\n' + repairCorruptMath(question) + '\n\n'
  prompt += 'STUDENT ANSWER:\n' + repairCorruptMath(studentAnswer) + '\n\n'
  prompt += 'MODEL SOLUTION:\n' + repairCorruptMath(modelAnswer) + '\n'
  prompt += acceptedStr + '\n\n'
  prompt += 'CORE PRINCIPLE — the student answer is CORRECT (full points) whenever its FINAL value is mathematically EQUAL to the model final value, even if written differently:\n'
  prompt += '- Different order: y^4x^6 = x^6y^4\n'
  prompt += '- Different notation: a^7 = aaaaaaa (a multiplied 7 times), 2^10 = 1024, 1/2 = 0.5 = ½, x^(1/2) = √x, √50 = 5√2\n'
  prompt += '- Arabic digits ٤٢ = 42; with or without × * · spaces or steps\n'
  prompt += '- The final value may be CONTAINED in the model solution (model shows steps, student wrote only the final result) → still CORRECT\n'
  prompt += 'Rules:\n'
  prompt += '1. Extract the student\'s FINAL answer (after the last "=" or the last result written).\n'
  prompt += '2. Compare ONLY final values with the model final answer / accepted answers — accept all equivalent forms above.\n'
  prompt += '3. A correct final answer with wrong/missing steps is CORRECT. A genuinely different final value is WRONG.\n'
  prompt += '4. If the student answer does not actually address the question (e.g. it is just the question text, or unrelated) → isCorrect=false and confidence="low".\n'
  prompt += '5. Never guess. If unsure → confidence="low".\n\n'
  prompt += 'awardedPoints: integer 0 to ' + maxPoints + ' (' + maxPoints + ' only when isCorrect=true).\n\n'
  prompt += 'Respond with ONLY this JSON — no markdown:\n'
  prompt += '{"isCorrect": true, "awardedPoints": ' + maxPoints + ', "confidence": "high", "feedback": "تعليق قصير بالعامية المصرية"}\n'

  var result = await callGrader([{ text: prompt }])
  if (!result.ok || !result.text) return null

  var parsed = parseAIJson(result.text)
  if (!parsed) return null

  var isCorrect = parsed.isCorrect === true
  var confidence = String(parsed.confidence || 'high').toLowerCase()
  var awardedPoints = clampPoints(parsed.awardedPoints, maxPoints)

  // exact-equivalence false-negative fix
  if (!isCorrect) {
    var candidates: string[] = []
    candidates.push(finalPart(modelAnswer))
    acceptedAnswers.forEach(function (a) { candidates.push(a) })
    var studentFinal = finalPart(studentAnswer)
    for (var ci = 0; ci < candidates.length; ci++) {
      if (candidates[ci] && studentFinal && exactEquivalent(studentFinal, candidates[ci])) {
        isCorrect = true
        break
      }
    }
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
    // Decisive: low confidence never blocks — teacher can override in admin
    needsGrading: false,
  }
}
