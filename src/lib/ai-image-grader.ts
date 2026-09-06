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

// Grading calls: low thinking = much faster, output is small structured JSON.
async function callGrader(parts: any[]): Promise<{ ok: boolean; text?: string; error?: string }> {
  var result = await callGeminiCentral({
    parts: parts,
    generationConfig: { temperature: 0.1, maxOutputTokens: 2048 },
    timeoutMs: 25000,
    thinking: 'low',
  })
  if (result.ok) return { ok: true, text: result.text }
  return { ok: false, error: result.error || 'unknown' }
}

function parseAIJson(text: string): any | null {
  if (!text || !text.trim()) return null
  var jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0])
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
  // strip trailing punctuation
  out = out.replace(/[.,;:]+$/, '')
  return out
}

/* pull the final answer (after the last '=') from a solution text */
function finalPart(s: string): string {
  var parts = String(s || '').split('=')
  return (parts[parts.length - 1] || '').trim()
}

/* EXACT normalized equivalence (never substring) — exported for tests */
export function exactEquivalent(a: string, b: string): boolean {
  var na = normalizeFinalAnswer(a)
  var nb = normalizeFinalAnswer(b)
  if (!na || !nb) return false
  if (na === nb) return true
  // tolerate a leading "x=" / "ans:" label on either side
  var stripLabel = function (t: string) { return t.replace(/^[a-z]{1,4}[:=]/, '') }
  return stripLabel(na) === stripLabel(nb)
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
  prompt += 'THE QUESTION the student answered:\n' + question + '\n\n'
  if (modelAnswer) {
    prompt += 'MODEL SOLUTION:\n' + modelAnswer + '\n'
  }
  prompt += acceptedStr + '\n\n'
  prompt += 'The student attached a PHOTO that is supposed to show THEIR OWN handwritten or typed solution to the question above.\n\n'
  prompt += 'Follow these steps EXACTLY:\n'
  prompt += 'STEP 1 — Look at the photo. Identify the STUDENT\'S OWN work: handwriting/typing produced by the student (solution steps, calculations, a final answer).\n'
  prompt += 'STEP 2 — IGNORE all pre-printed content: the question text itself, choice lists like (A) B) C) D)), headers, logos, other questions on the page. The student did not write those, and they are NOT their answer.\n'
  prompt += 'STEP 3 — TOPIC CHECK (onTopic): does the photo actually contain the student\'s OWN solution attempt to THIS exact question? If it only shows the printed question, or a different question, or nothing readable → onTopic=false.\n'
  prompt += 'STEP 4 — If onTopic: extract the student\'s FINAL answer (the last result — usually after the last "=", or the last written expression/number).\n'
  prompt += 'STEP 5 — Compare the student\'s final answer with the model final answer and accepted answers. Equivalent forms are CORRECT: 1024 = 2^10, 0.5 = 1/2, n=5 = n = 5, x^4y^3 = y^3x^4, a^6b^5 = a^5b^6 (no!). Only TRUE mathematical equivalence counts.\n'
  prompt += 'STEP 6 — A correct final answer with wrong/missing steps is still CORRECT (we grade the final answer). A different final answer is WRONG even if the steps look nice.\n'
  prompt += 'STEP 7 — Be fair but strict. If you cannot read a clear final answer from the student\'s own work → isCorrect=false and confidence="low". Never guess and never give benefit of the doubt.\n\n'
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

  // ---- GUARD 1: photo is not actually the student's solution to THIS question
  if (!onTopic) {
    return {
      extractedAnswer: extractedAnswer,
      finalAnswer: finalAns,
      isCorrect: false,
      awardedPoints: 0,
      maxPoints: maxPoints,
      feedback: feedback || 'الصورة مفيهاش حل واضح للسؤال ده — هتتراجع من الأستاذ',
      onTopic: false,
      confidence: confidence,
      needsGrading: true,
    }
  }

  // ---- GUARD 2: the "extracted answer" is basically the QUESTION text
  // (the model read the printed question instead of the student's work —
  //  the exact bug from the user's screenshot). Never auto-grade that.
  if (question && extractedAnswer && wordSimilarity(extractedAnswer, question) >= 0.8) {
    return {
      extractedAnswer: extractedAnswer,
      finalAnswer: finalAns,
      isCorrect: false,
      awardedPoints: 0,
      maxPoints: maxPoints,
      feedback: 'اللي اتقري من الصورة شبه نص السؤال مش حل الطالب — هتتراجع من الأستاذ',
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

  // ---- GUARD 4: low confidence → send to admin review instead of a random verdict
  if (confidence === 'low') needsGrading = true

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
export function extractImageMediaIds(answerText: string): string[] {
  if (!answerText || typeof answerText !== 'string') return []
  var matches = answerText.match(/\[📷\s*صورة\s*مرفقة:\s*([^\]]+?)\]/g) || []
  var ids: string[] = []
  matches.forEach(function (m) {
    var idMatch = m.match(/\[📷\s*صورة\s*مرفقة:\s*([^\]]+?)\]/)
    if (idMatch && idMatch[1]) {
      var raw = idMatch[1].trim()
      raw = raw.replace(/^["']|["']$/g, '')
      var lastSlash = raw.lastIndexOf('/')
      var mediaId = lastSlash >= 0 ? raw.substring(lastSlash + 1) : raw
      mediaId = mediaId.trim()
      if (mediaId) ids.push(mediaId)
    }
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

  var prompt = 'You are an expert, STRICT math teacher. Grade the student\'s typed answer.\n\n'
  prompt += 'THE QUESTION:\n' + question + '\n\n'
  prompt += 'STUDENT ANSWER:\n' + studentAnswer + '\n\n'
  prompt += 'MODEL SOLUTION:\n' + modelAnswer + '\n'
  prompt += acceptedStr + '\n\n'
  prompt += 'Rules:\n'
  prompt += '1. Extract the student\'s FINAL answer (after the last "=" or the last result written).\n'
  prompt += '2. Compare with the model final answer / accepted answers. Equivalent forms are CORRECT: 1024 = 2^10, 0.5 = 1/2, n=5 = n = 5.\n'
  prompt += '3. A correct final answer with wrong/missing steps is CORRECT. A different final answer is WRONG.\n'
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
    needsGrading: confidence === 'low',
  }
}
