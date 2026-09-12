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
import { exactEquivalent, finalAnswerCandidates, isBareVariable, modelFinalCandidates, verifyFinalAnswerEqual } from './ai-image-grader'

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
 * quickSmartMatch — no-AI fast path (كلام المستر: يفهم الإجابة النهائية، مش بالحرف).
 * المقارنة هنا بالـ VALUE بتاع الإجابة النهائية بس (equivalence) — مفيش أي
 * contains/substring (ده كان بيدي نتايج غلط: "15" كانت بتتحسب صح لما الصح "5").
 * (2026-و12) الشكل المعكوس بقى متكافئ: النموذج "1/4 = x" والطالب كتب
 * "x = 1/4" — نفس الإجابة، لأن التصحيح على الإجابة النهائية (آخر حاجة)
 * وممنوع مطابقة متغير عاري × متغير عاري (x مش قيمة).
 * returns true  → graded correct without AI (القيم متكافئة رقميًا/رمزيًا)
 * returns false → caller decides (empty answers)
 * returns null  → send to AI (it UNDERSTANDS the answer and decides)
 */
export function quickSmartMatch(
  studentAnswer: string,
  modelAnswer: string,
  acceptedAnswers: string[]
): boolean | null {
  var st = normalizeForMatch(studentAnswer)
  if (!st) return false
  var stFinal = stripFactorForm(finalSegment(st))
  // كل قيم الإجابة النهائية المحتملة للطالب (بتعالج الشكل المعكوس)
  var stCands = finalAnswerCandidates(st).map(function (c) { return stripFactorForm(c) }).filter(Boolean)
  if (stFinal && stCands.indexOf(stFinal) === -1) stCands.unshift(stFinal)
  if (stCands.length === 0) return null

  var candidates: string[] = []
  ;(acceptedAnswers || []).forEach(function (a) { if (a && String(a).trim()) candidates.push(String(a).trim()) })
  if (modelAnswer && String(modelAnswer).trim()) candidates.push(String(modelAnswer).trim())

  for (var i = 0; i < candidates.length; i++) {
    var cand = candidates[i]
    // الإجابة النهائية متكافئة رغم اختلاف الشكل: 0.5 = 50% = 1/2 = ½ = خمسة-على-عشرة
    // + كل قيم المرشح (بيصلّح "1/4 = x" مقابل "x = 1/4")
    var candCands = finalAnswerCandidates(cand).map(function (c) { return stripFactorForm(c) }).filter(Boolean)
    var candFinal = stripFactorForm(finalSegment(cand))
    if (candFinal && candCands.indexOf(candFinal) === -1) candCands.unshift(candFinal)
    for (var a = 0; a < stCands.length; a++) {
      for (var b = 0; b < candCands.length; b++) {
        if (!stCands[a] || !candCands[b]) continue
        // ممنوع مطابقة متغير عاري × متغير عاري (x === x دي مش إجابة)
        if (isBareVariable(stCands[a]) && isBareVariable(candCands[b])) continue
        if (exactEquivalent(stCands[a], candCands[b])) return true
      }
      // النموذج نفسه ممكن يكون قيمة مباشرة من غير = (مثلًا "5" أو "2^10")
      if (exactEquivalent(stCands[a], cand)) return true
    }
  }
  // مش متأكدين إنها متكافئة → الـ AI يفهم الإجابة ويقرر (مش حكم حرفي)
  return null
}

/* ---------- AI grading ---------- */

function buildAiPrompt(needAI: WritingAnswer[]): string {
  var lines: string[] = []
  lines.push('You are an expert math teacher grading student answers with FULL mathematical understanding.')
  lines.push('')
  lines.push('CORE PRINCIPLE — grade the MATHEMATICAL VALUE, never the literal wording:')
  lines.push('The student answer is CORRECT (full points) whenever its final value is mathematically EQUAL to the model answer final value, even if written differently:')
  lines.push('- The model answer may list MULTIPLE acceptable final answers separated by "أو" / "او" / "or" (like "x = 2 أو x = 1/4") — the student answer is CORRECT if it matches ANY ONE of those alternatives')
  lines.push('- Different order: y^4x^6 = x^6y^4')
  lines.push('- Different notation: a^7 = aaaaaaa (a multiplied 7 times), 2^10 = 1024, 1/2 = 0.5 = ½ = 50%, x^(1/2) = √x, √50 = 5√2, 2^{n+2} = 2^n·4, 3:4 = 3/4, 3,5 = 3.5')
  lines.push('- Arabic digits ٤٢ = 42; units and labels are IGNORED (12 سم = 12 cm = 12; x = 5 = 5); with or without × * · spaces units or steps')
  lines.push('- The final value may be CONTAINED in the model answer (the model shows full steps, the student wrote only the final result) → still CORRECT')
  lines.push('- UNDERSTAND the answer: find the FINAL value (usually the last thing written: after the last =, or a boxed/circled value, or after ANSWER). Messy steps, extra working or unusual formatting NEVER make a correct final value wrong. Simplify BOTH sides mentally before deciding.')
  lines.push('- A small SLIP in a MIDDLE step (sign slip, arithmetic slip, self-corrected step) does NOT make the answer wrong when the FINAL value is correct — students stumble mid-way and fix themselves; judge where they ENDED. UNDERSTAND the work like a human teacher, never grade by literal string matching.')
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
  lines.push('READ CAREFULLY (worst failure = grading a correct answer as wrong):')
  lines.push('- Re-read the student final answer TWICE before deciding. Read every digit carefully (4 vs 9, 1 vs 7, 5 vs 3, 0 vs 6). Never confuse digits — if the final value you read equals the model value, it is CORRECT, full stop.')
  lines.push('- If you are talking with a student in a chat: assume the student MEANT the closest valid mathematical interpretation of what they wrote, unless it is clearly a different value.')
  lines.push('')
  lines.push('FEEDBACK STYLE (2026-و24 + 2026-و30 — the teacher wants STRONG teacher-style notes on EVERY question, like a real teacher chatting with the student):')
  lines.push('- LANGUAGE IS MANDATORY: عامية مصرية بسيطة (Egyptian COLLOQUIAL Arabic) — ممنوع منعًا باتًا الفصحى. لا «حدث/ثم/قمت ب/خطأ في» — استخدم «بص، خلي بالك، اللي حصل إن، طبّق تاني، برافو، مش، ده/دي، عشان». Talk DIRECTLY to the student (استخدم «إنت») — 2–3 short sentences.')
  lines.push('- Correct: praise + say WHAT he did right (the rule/method he used + the final value). e.g. «برافو عليك! وزعت الأس صح على الحدين ووصلت للناتج بالظبط — الإجابة a^4 b^6 صح.»')
  lines.push('- Wrong: say (1) WHERE exactly the mistake happened (which step / which rule), (2) what the CORRECT approach is, (3) the correct final answer. e.g. «بص يا بطل، اللي حصل إنك في الخطوة التانية ضربت الأس غلط — الضرب بيجمّع الأسس a^6 × a^2 = a^8 مش a^4. خلي بالك المرة الجاية وطبّق القاعدة تاني، الصح a^4 b^6.»')
  lines.push('- NEVER be generic. No «إجابة غلط» alone — always the reason + the fix. And NEVER write in فصحى (مثلاً «حدث خطأ في الخطوة الثانية» ممنوعة — قول «اللي حصل إنك غلطت في الخطوة التانية»).')
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
      /* (و24) ملاحظة شخصية زي معلم بيتكلم مع الطالب — حتى في المسار السريع */
      var stNote = (finalAnswerCandidates(answerText)[0] || answerText.trim() || '').slice(0, 40)
      graded[i] = {
        question: wa.question,
        answer: answerText,
        modelAnswer: wa.modelAnswer || '',
        awardedPoints: maxPts,
        maxPoints: maxPts,
        isCorrect: true,
        feedback: 'برافو عليك ✓ الإجابة النهائية (' + stNote + ') مطابقة للإجابة الصحيحة',
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
    var aiVerdictPairs: { n: number; idx: number }[] = []
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
      aiVerdictPairs.push({ n: n, idx: idx })
    }
    /* (2026-و25) STRICT VERIFY — لكل إجابة الـ AI ما أعطاش الدرجة الكاملة
       (خصوصًا الأصفار اللي بتبوّظ الطالب) بنعمل نداء تحقق ثاني رخيص بيقارن
       قيم الإجابة النهائية بس — لو نفس القيمة يقلب صح كاملة.
       بحد أقصى 6 تحققات لكل دفعة عشان مهلة السيرفلس، وبتسلسل (مش متوازي). */
    var verifyBudget = 6
    for (var vp = 0; vp < aiVerdictPairs.length && verifyBudget > 0; vp++) {
      var pair = aiVerdictPairs[vp]
      var waV = needAI[pair.n]
      var gV = graded[pair.idx]
      var vMax = waV.points || 1
      if (!gV || gV.gradingStatus !== 'graded') continue
      if (Number(gV.awardedPoints) >= vMax) continue
      if (!waV.modelAnswer && !(waV.acceptedAnswers && waV.acceptedAnswers.length > 0)) continue
      var sVc = finalAnswerCandidates(waV.answer || '').slice(0, 3)
      if (sVc.length === 0) continue
      var mVc = modelFinalCandidates(waV.modelAnswer || '', waV.acceptedAnswers || []).slice(0, 3)
      if (mVc.length === 0) continue
      verifyBudget--
      try {
        var sameV = await verifyFinalAnswerEqual({ studentFinals: sVc, modelFinals: mVc, question: waV.question })
        if (sameV) {
          gV.awardedPoints = vMax
          gV.isCorrect = true
          gV.feedback = String('برافو عليك ✓ الإجابة النهائية (' + sVc[0] + ') مطابقة للإجابة الصحيحة — تم التأكد من القيمة مرتين').slice(0, 300)
        }
      } catch (vErr) { console.error('[gradeWritingSmart] verify error:', vErr) }
    }
  } else {
    for (var m2 = 0; m2 < needAIIdx.length; m2++) {
      graded[needAIIdx[m2]] = heuristicFallback(graded[needAIIdx[m2]], needAI[m2])
    }
  }

  return { graded: graded, aiUsed: true }
}

/*
 * gradeFallbackDecisive — public wrapper around the last-resort deterministic
 * grader. Used by /api/homework/submit whenever the AI call fails, so a
 * submission NEVER sits on "manual" status: there is always a definite
 * grade (final-answer equivalence → full, similarity → half, else 0).
 * The teacher can still override any verdict from the admin panel.
 */
export function gradeFallbackDecisive(wa: WritingAnswer): GradedAnswer {
  var slot: GradedAnswer = {
    question: wa.question,
    answer: wa.answer || '',
    modelAnswer: wa.modelAnswer || '',
    awardedPoints: 0,
    maxPoints: wa.points || 1,
    isCorrect: false,
    feedback: '',
    gradingStatus: 'graded',
  }
  return heuristicFallback(slot, wa)
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

  /* (2026-و25) محاولة فعلية من الطالب؟ نص ≥ 3 حروف معنوية أو صورة مرفوعة */
  var realAttempt = (!!st && st.replace(/[^0-9a-zA-Z\u0600-\u06FF]/g, '').length >= 3) || /\[📷/.test(wa.answer || '')
  var hasImage = /\[📷/.test(wa.answer || '')

  /* (2026-و25) فاضي تمامًا (مفيش نص ومفيش صورة) → صفر صريح «لم يتم الإجابة»
     من أول سطر — نفس رسالة مسار gradeWritingSmart، مهما كان فيه نموذجية أو لا */
  if (!st && !hasImage) {
    return {
      question: slot.question,
      answer: slot.answer,
      modelAnswer: slot.modelAnswer,
      awardedPoints: 0,
      maxPoints: maxPts,
      isCorrect: false,
      feedback: 'لم يتم الإجابة',
      gradingStatus: 'graded',
    }
  }

  if (!model) {
    // nothing to compare with at all → count anything written as attempted work
    if (realAttempt) {
      awarded = Math.ceil(maxPts / 2)
      feedback = 'الإجابة مكتوبة بس محتاجة مراجعة المستر النهائية'
    } else {
      awarded = 0
      feedback = 'لم يتم الإجابة'
    }
  } else {
    /* 2026-و12 — نفس تكافؤ الإجابة النهائية بالقيم (شامل الشكل المعكوس
       "1/4 = x" === "x = 1/4") — ممنوع صفر ظالم لغلط شكلي */
    var stCands = finalAnswerCandidates(st).map(function (c) { return stripFactorForm(c) }).filter(Boolean)
    var mCands = finalAnswerCandidates(model).map(function (c) { return stripFactorForm(c) }).filter(Boolean)
    var stFinal = stripFactorForm(finalSegment(st))
    var mFinal = stripFactorForm(finalSegment(model))
    if (stFinal && stCands.indexOf(stFinal) === -1) stCands.unshift(stFinal)
    if (mFinal && mCands.indexOf(mFinal) === -1) mCands.unshift(mFinal)
    var sim = bigramSimilarity(st, model)
    var valueMatched = false
    for (var a = 0; a < stCands.length && !valueMatched; a++) {
      for (var b = 0; b < mCands.length; b++) {
        if (!stCands[a] || !mCands[b]) continue
        if (isBareVariable(stCands[a]) && isBareVariable(mCands[b])) continue
        if (exactEquivalent(stCands[a], mCands[b])) { valueMatched = true; break }
      }
    }
    if (valueMatched) {
      awarded = maxPts
      feedback = 'الإجابة النهائية مطابقة للإجابة النموذجية ✓'
    } else if (sim >= 0.55) {
      awarded = Math.ceil(maxPts / 2)
      feedback = 'فيه تشابه جزئي مع الحل النموذجي — راجعها مع المستر'
    } else if (hasImage) {
      /* 2026-و25 — صورة مرفوعة مقدرناش نقراها محليًا في المسار النصي →
         نص درجة المحاولة + مراجعة بدل صفر (زي decisiveImageFallback بالظبط) */
      awarded = Math.ceil(maxPts / 2)
      feedback = 'درجة مؤقتة — صورة الحل محتاجة مراجعة المستر وهيعدلها لو لزم'
    } else if (realAttempt && (sim >= 0.30 || sharedValueToken(st, model))) {
      /* 2026-و25 — علاج «كله غلط. حرام»: محاولة حقيقية فيها علاقة بالحل
         (رقم/رمز مشترك أو تشابه ≥ 0.30) ومقدرناش نحكم بقوة ← نص الدرجة
         + ملاحظة مراجعة صريحة — زي decisiveImageFallback بالظبط —
         ممنوع صفر صامت. المستر يقدر يعدلها من لوحته لو الغلط حقيقي. */
      awarded = Math.ceil(maxPts / 2)
      feedback = 'درجة مؤقتة — مقدرناش نحكم بدقة على إجابتك والمستر هيعدلها لو لزم'
    }
    /* كلام ضايع تمامًا (مفيش أي رقم/رمز مشترك ولا تشابه) → 0 زي ما هو */
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

/* (2026-و25) هل إجابة الطالب فيها أي رقم أو كلمة/رمز مادة موجودة في النموذج؟
   ده الدليل الرخيص إن فيه علاقة حقيقية بين شغل الطالب والحل — بساعده نمنع
   صفر صامت لمحاولة حقيقية مقدرناش نحكم بقية (الأرقام هي الإشارة القوية في
   الرياضيات: "3×3×3×3 = 81" ضد نموذج "3^4 = 81" بيتشاركوا في 3 و 81). */
function sharedValueToken(studentNorm: string, modelNorm: string): boolean {
  if (!studentNorm || !modelNorm) return false
  var tokens = studentNorm.match(/\d+(?:\.\d+)?|[a-z\u0600-\u06FF]{2,}/g) || []
  for (var i = 0; i < tokens.length; i++) {
    if (modelNorm.indexOf(tokens[i]) !== -1) return true
  }
  return false
}
