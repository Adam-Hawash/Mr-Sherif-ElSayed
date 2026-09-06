// FILE: src/lib/smart-grader.ts
// PURPOSE: Smart writing/essay answer grading shared by:
//   - /api/homework/grade-writing (live + lazy flows)
//   - /api/homework/regrade       (admin re-grade button)
//   - /api/exams/regrade          (admin re-grade button)
//
// PRINCIPLE (what the teacher asked for):
//   Grade the MATHEMATICAL VALUE of the student answer — NOT the literal
//   wording. If the student's final value is mathematically equal to the
//   model answer's final value, it is CORRECT even when written differently
//   (different order, different notation, Arabic digits, no steps …).

import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson, repairCorruptMath } from '@/lib/math-text'

export interface WritingAnswer {
  question: string
  answer: string
  modelAnswer?: string
  acceptedAnswers?: string[]
  points: number
}

export interface GradedAnswer {
  question: string
  answer: string
  modelAnswer: string
  awardedPoints: number
  maxPoints: number
  isCorrect: boolean
  feedback: string
  gradingStatus: string
  needsGrading?: boolean
}

/* ---------- normalization for the fast path ---------- */

export function normalizeForMatch(s: string): string {
  var t = String(s || '').toLowerCase()
  // unify Arabic-Indic digits ٠-٩ → 0-9 (also Persian ۰-۹)
  t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
  t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
  t = t.replace(/\s+/g, ' ').trim()
  // strip decoration that never changes math value
  t = t.replace(/[\\$]/g, '')
  t = t.replace(/[.,؛،]$/g, '')
  // × . * all mean multiplication when between values
  return t
}

/* extract the FINAL value segment (usually after the last = or : ) */
function finalSegment(s: string): string {
  var t = normalizeForMatch(s)
  var parts = t.split(/[=:]/)
  for (var i = parts.length - 1; i >= 0; i--) {
    var seg = (parts[i] || '').trim()
    if (seg) return seg
  }
  return t
}

function stripFactorForm(s: string): string {
  // aaaaaaa (letter repeated n times) ≈ a^n — collapse runs of 3+ same letter
  return s.replace(/([a-z])\1{2,}/g, function (m, ch) { return ch + '^' + m.length })
}

/*
 * quickSmartMatch — no-AI fast path.
 * returns true  → graded correct without AI
 * returns false → caller decides (empty answers)
 * returns null → send to AI (not confidently matched)
 */
export function quickSmartMatch(
  studentAnswer: string,
  modelAnswer: string,
  acceptedAnswers: string[]
): boolean | null {
  var st = normalizeForMatch(studentAnswer)
  if (!st) return false
  var stFinal = stripFactorForm(finalSegment(st))
  var stAll = stripFactorForm(st)

  var candidates: string[] = []
  ;(acceptedAnswers || []).forEach(function (a) { if (a) candidates.push(a) })
  if (modelAnswer) candidates.push(modelAnswer)

  for (var i = 0; i < candidates.length; i++) {
    var candFinal = stripFactorForm(finalSegment(candidates[i]))
    var candAll = stripFactorForm(normalizeForMatch(candidates[i]))
    if (!candFinal && !candAll) continue
    // final value equal on both sides
    if (candFinal && stFinal && candFinal === stFinal) return true
    // accepted answer (short = specific) contained in the student line
    if (candAll && candAll.length <= 24 && stAll.indexOf(candAll) !== -1) return true
    // student final contained in the model's final (model: "x = 3 or x = -3" style)
    if (candFinal && stFinal && candFinal.indexOf(stFinal) !== -1 && stFinal.length >= 1 && candFinal.length - stFinal.length <= 2) return true
  }
  return null
}

/* ---------- AI grading ---------- */

function buildAiPrompt(needAI: WritingAnswer[]): string {
  var lines: string[] = []
  lines.push('You are an expert math teacher grading student answers with FULL mathematical understanding.')
  lines.push('')
  lines.push('CORE PRINCIPLE — grade the MATHEMATICAL VALUE, never the literal wording:')
  lines.push('The student answer is CORRECT (full points) whenever its final value is mathematically EQUAL to the model answer final value, even if written differently:')
  lines.push('- Different order: y^4x^6 = x^6y^4')
  lines.push('- Different notation: a^7 = aaaaaaa (a multiplied 7 times), 2^10 = 1024, 1/2 = 0.5 = ½, x^(1/2) = √x, √50 = 5√2, 2^{n+2} = 2^n·4')
  lines.push('- Arabic digits ٤٢ = 42, with or without × * · spaces units or steps')
  lines.push('- The final value may be CONTAINED in the model answer (the model shows full steps, the student wrote only the final result) → still CORRECT')
  lines.push('- UNDERSTAND the answer: find the FINAL value (usually the last thing written: after the last =, or a boxed/circled value, or after ANSWER). Messy steps, extra working or unusual formatting NEVER make a correct final value wrong. Simplify BOTH sides mentally before deciding.')
  lines.push('- ALWAYS decide: every graded answer gets a definite isCorrect true or false — never leave one undecided.')
  lines.push('')
  lines.push('NO MODEL ANSWER? SOLVE IT YOURSELF:')
  lines.push('- If the model answer is (none): read the QUESTION carefully, solve it step by step yourself, find the correct final answer, then grade the student answer against YOUR solution.')
  lines.push('- Grade on BOTH the final answer AND the solution steps: correct final value → full points; correct method with a small slip → about half; wrong method → 0.')
  lines.push('')
  lines.push('Scoring rules:')
  lines.push('- Final value mathematically equal → full points, isCorrect: true (even if the steps are messy or partially unreadable)')
  lines.push('- Correct method/steps but wrong final value → about half the points (rounded), isCorrect: false')
  lines.push('- Random text, copying the question, unrelated work, or empty → 0, isCorrect: false')
  lines.push('- If the student answer contains an image marker like [📷 صورة مرفقة: …] and no text, treat it as Not answered (0) — image-only answers cannot be graded here')
  lines.push('')
  lines.push('Write the feedback in Egyptian Arabic, ONE short sentence.')
  lines.push('')
  lines.push('Return ONE valid JSON array ONLY — no markdown fences, no text before or after:')
  lines.push('[{"index":0,"awardedPoints":5,"isCorrect":true,"feedback":"..."}]')
  lines.push('The index matches the question order below.')
  lines.push('')
  lines.push('Questions to grade:')
  needAI.forEach(function (wa, idx) {
    lines.push('--- Question ' + idx + ' (max ' + (wa.points || 0) + ' pts) ---')
    lines.push('Question: ' + repairCorruptMath(wa.question || ''))
    lines.push('Student answer: ' + repairCorruptMath(wa.answer || ''))
    lines.push('Model answer: ' + repairCorruptMath(wa.modelAnswer || '(none)'))
    if (wa.acceptedAnswers && wa.acceptedAnswers.length > 0) {
      lines.push('Accepted final answers: ' + wa.acceptedAnswers.join(' | '))
    }
    lines.push('')
  })
  return lines.join('\n')
}

/* tolerant JSON-array extraction (survives trailing garbage / fences) */
function parseAiArray(text: string): any[] | null {
  if (!text) return null
  var m = text.match(/\[[\s\S]*\]/)
  if (!m) return null
  var raw = repairModelJson(m[0])
  try { return JSON.parse(raw) } catch (e) {}
  for (var i = raw.length - 1, a = 0; i > 0 && a < 200; i--) {
    var c = raw.charAt(i)
    if (c === ']' || c === '}') {
      a++
      try { return JSON.parse(raw.substring(0, i + 1)) } catch (e) {}
    }
  }
  return null
}

/*
 * gradeWritingSmart — full pipeline for a list of writing answers.
 * Fast path first (no AI needed for clean matches), AI for the rest.
 */
export async function gradeWritingSmart(writingAnswers: WritingAnswer[]): Promise<{
  graded: GradedAnswer[]
  aiUsed: boolean
}> {
  var graded: GradedAnswer[] = []
  var needAI: WritingAnswer[] = []
  var needAIIdx: number[] = []

  for (var i = 0; i < writingAnswers.length; i++) {
    var wa = writingAnswers[i]
    var maxPts = wa.points || 1
    var answerText = wa.answer || ''

    // empty → 0
    if (!answerText.trim() || answerText.trim() === '[📷 صورة مرفقة]') {
      graded[i] = {
        question: wa.question,
        answer: answerText,
        modelAnswer: wa.modelAnswer || '',
        awardedPoints: 0,
        maxPoints: maxPts,
        isCorrect: false,
        feedback: 'لم يتم الإجابة',
        gradingStatus: 'graded',
      }
      continue
    }

    // fast path
    var quick = quickSmartMatch(answerText, wa.modelAnswer || '', wa.acceptedAnswers || [])
    if (quick === true) {
      graded[i] = {
        question: wa.question,
        answer: answerText,
        modelAnswer: wa.modelAnswer || '',
        awardedPoints: maxPts,
        maxPoints: maxPts,
        isCorrect: true,
        feedback: 'الإجابة صحيحة ✓',
        gradingStatus: 'graded',
      }
      continue
    }

    // no model answer at all → STILL grade with AI (it solves the question itself)
    // (old behavior left this as "يحتاج تصحيح يدوي" — the teacher wants NOTHING left ungraded)

    needAI.push(wa)
    needAIIdx.push(i)
    graded[i] = {
      question: wa.question,
      answer: answerText,
      modelAnswer: wa.modelAnswer || '',
      awardedPoints: 0,
      maxPoints: maxPts,
      isCorrect: false,
      feedback: 'بانتظار التصحيح',
      gradingStatus: 'pending',
    }
  }

  if (needAI.length === 0) {
    return { graded: graded, aiUsed: false }
  }

  if (!hasGeminiKey()) {
    // No AI key at all → fallback heuristic so nothing stays pending
    for (var hk = 0; hk < needAIIdx.length; hk++) {
      var hIdx = needAIIdx[hk]
      graded[hIdx] = heuristicFallback(graded[hIdx], needAI[hk])
    }
    return { graded: graded, aiUsed: false }
  }

  var result = await callGeminiCentral({
    parts: [{ text: buildAiPrompt(needAI) }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
    timeoutMs: 90000,
  })

  // one retry on transient failure
  if (!result.ok) {
    result = await callGeminiCentral({
      parts: [{ text: buildAiPrompt(needAI) }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      timeoutMs: 90000,
    })
  }

  if (!result.ok) {
    // AI failed twice → heuristic fallback (never leave anything ungraded)
    for (var k = 0; k < needAIIdx.length; k++) {
      var gi = needAIIdx[k]
      graded[gi] = heuristicFallback(graded[gi], needAI[k])
    }
    return { graded: graded, aiUsed: false }
  }

  var aiResults = parseAiArray(result.text || '')
  if (aiResults && Array.isArray(aiResults)) {
    for (var n = 0; n < needAIIdx.length; n++) {
      var idx = needAIIdx[n]
      var wa2 = needAI[n]
      var aiRes: any = null
      for (var r = 0; r < aiResults.length; r++) {
        if (aiResults[r] && Number(aiResults[r].index) === n) { aiRes = aiResults[r]; break }
      }
      if (!aiRes) {
        // AI skipped this index → heuristic fallback for it
        graded[idx] = heuristicFallback(graded[idx], wa2)
        continue
      }
      var awarded = Math.min(Math.max(Math.round(Number(aiRes.awardedPoints) || 0), 0), wa2.points || 1)
      graded[idx].awardedPoints = awarded
      graded[idx].isCorrect = awarded >= Math.ceil((wa2.points || 1) * 0.5) && awarded > 0
      graded[idx].feedback = String(aiRes.feedback || (awarded > 0 ? 'صحيح' : 'غير صحيح')).slice(0, 300)
      graded[idx].gradingStatus = 'graded'
    }
  } else {
    for (var m2 = 0; m2 < needAIIdx.length; m2++) {
      graded[needAIIdx[m2]] = heuristicFallback(graded[needAIIdx[m2]], needAI[m2])
    }
  }

  return { graded: graded, aiUsed: true }
}

/*
 * heuristicFallback — last-resort deterministic grading (no AI).
 * Compares the normalized FINAL segments (and overall text similarity) of the
 * student answer vs the model answer. Guarantees a definite grade so the
 * student NEVER sees "يحتاج تصحيح يدوي" — the teacher can still override.
 */
function heuristicFallback(slot: GradedAnswer, wa: WritingAnswer): GradedAnswer {
  var st = normalizeForMatch(wa.answer || '')
  var model = normalizeForMatch(wa.modelAnswer || '')
  var maxPts = wa.points || 1
  var awarded = 0
  var feedback = 'الإجابة مش مطابقة للإجابة النموذجية'

  if (!model) {
    // nothing to compare with at all → count anything written as attempted work
    if (st && st.replace(/[^0-9a-zA-Z\u0600-\u06FF]/g, '').length >= 3) {
      awarded = Math.ceil(maxPts / 2)
      feedback = 'الإجابة مكتوبة بس محتاجة مراجعة المستر النهائية'
    } else {
      awarded = 0
      feedback = 'لم يتم الإجابة'
    }
  } else {
    var stFinal = stripFactorForm(finalSegment(st))
    var mFinal = stripFactorForm(finalSegment(model))
    var sim = bigramSimilarity(st, model)
    if (stFinal && mFinal && stFinal === mFinal) {
      awarded = maxPts
      feedback = 'الإجابة النهائية مطابقة للإجابة النموذجية ✓'
    } else if (sim >= 0.55) {
      awarded = Math.ceil(maxPts / 2)
      feedback = 'فيه تشابه جزئي مع الحل النموذجي — راجعها مع المستر'
    }
  }

  return {
    question: slot.question,
    answer: slot.answer,
    modelAnswer: slot.modelAnswer,
    awardedPoints: awarded,
    maxPoints: maxPts,
    isCorrect: awarded >= Math.ceil(maxPts * 0.5) && awarded > 0,
    feedback: feedback,
    gradingStatus: 'graded',
  }
}

/* bigram Dice similarity 0..1 — cheap, deterministic */
function bigramSimilarity(a: string, b: string): number {
  var cleanA = a.replace(/[^0-9a-z\u0600-\u06FF]/g, '')
  var cleanB = b.replace(/[^0-9a-z\u0600-\u06FF]/g, '')
  if (cleanA.length < 2 || cleanB.length < 2) return 0
  var grams: Record<string, number> = {}
  var total = 0
  for (var i = 0; i < cleanA.length - 1; i++) {
    var g = cleanA.substring(i, i + 2)
    grams[g] = (grams[g] || 0) + 1
    total++
  }
  var hits = 0
  for (var j = 0; j < cleanB.length - 1; j++) {
    var g2 = cleanB.substring(j, j + 2)
    if (grams[g2] && grams[g2] > 0) { hits++; grams[g2]-- }
  }
  var denom = total + (cleanB.length - 1)
  return denom > 0 ? (2 * hits) / denom : 0
}
