// FILE: src/lib/regrade-core.ts
// PURPOSE: منطق إعادة التصحيح المشترك — بيستخدمه:
//            • /api/exams/regrade + /api/homework/regrade (زرار المستر)
//            • /api/grading/sweep (التصحيح التلقائي للنتايج القديمة)
//          بيحسب النتيجة من جديد من الإجابات الخام + الأسئلة الحالية:
//            • MCQ → تصحيح محلي فوري
//            • مقالي نص → gradeWritingSmart (تطابق سريع + AI + fallback حاسم)
//            • مقالي صورة → VLM ولو فشل درجة محاولة عادلة
//            • تعديلات المستر اليدوية (gradeOverrides) بتتحسب دايماً
//          المستر طلب: مفيش حاجة اسمها "يحتاج تصحيح يدوي" — كل سؤال بياخد
//          حكم نهائي، والمستر يقدر يعدّل بعدها براحته.

import { db } from '@/lib/db'
import { gradeWritingSmart, gradeFallbackDecisive } from '@/lib/smart-grader'
import { gradeImageAnswer, extractImageMediaIds } from '@/lib/ai-image-grader'
import { resolveQuestionsForStudent } from '@/lib/exam-models'

export type QItem = { q: any; origIdx: number }

// أعمدة قديمة ممكن تكون ناقصة على داتابيز قديمة — نفس حراس submit
export async function ensureResultColumns() {
  try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN answers TEXT DEFAULT ""') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingGrades TEXT DEFAULT ""') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingResults TEXT DEFAULT ""') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN gradeOverrides TEXT DEFAULT ""') } catch (e) {}
  try { await db.$executeRawUnsafe("ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT ''") } catch (e) {}
  try { await db.$executeRawUnsafe("ALTER TABLE HomeworkResult ADD COLUMN answers TEXT DEFAULT ''") } catch (e) {}
  try { await db.$executeRawUnsafe("ALTER TABLE HomeworkResult ADD COLUMN gradeOverrides TEXT DEFAULT ''") } catch (e) {}
}

// فصل الأسئلة: اختياري vs مقالي (بنفس منطق routes التسليم بالظبط)
export function splitQuestions(rawQuestions: any[]): { mcq: QItem[]; writing: QItem[]; all: any[] } {
  var mcq: QItem[] = []
  var writing: QItem[] = []
  var all: any[] = Array.isArray(rawQuestions) ? rawQuestions : []
  all.forEach(function (q, idx) {
    var isWriting = q.type === 'writing' || q.type === 'essay'
    if (!isWriting && Array.isArray(q.options)) {
      var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
      if (allNA) isWriting = true
    }
    if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
    if (isWriting) writing.push({ q: q, origIdx: idx })
    else mcq.push({ q: q, origIdx: idx })
  })
  return { mcq: mcq, writing: writing, all: all }
}

export function lookupAnswer(ans: any, idx: number): any {
  try {
    if (Array.isArray(ans)) return ans[idx]
    if (ans !== null && typeof ans === 'object') {
      return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
    }
  } catch (e) {}
  return undefined
}

// هل أسئلة (واجب/امتحان) فيها سؤال مقالي أصلاً؟
export function questionsHaveWriting(qs: any): boolean {
  try {
    var parsed = typeof qs === 'string' ? JSON.parse(qs) : qs
    if (!Array.isArray(parsed)) return false
    for (var i = 0; i < parsed.length; i++) {
      var q = parsed[i] || {}
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
      if (isWriting) return true
    }
  } catch (e) {}
  return false
}

function pointsOf(q: any, writingDefault: number): number {
  return (typeof q.points === 'number' && q.points > 0) ? q.points : writingDefault
}

// هل التسليم ده لسه ناقص تصحيح؟ (مفيش درجات مخزنة / فيه pending / فيه manual)
// ملحوظة: الفاضي = مفيش درجات متخزنة خالص = ناقص تصحيح (فحص "فيه أسئلة مقالية
// أصلاً" بيتم قبله في النداءات)
export function gradesLookPending(jsonText: any): boolean {
  try {
    if (jsonText === null || jsonText === undefined) return true
    var s = String(jsonText).trim()
    if (s === '' || s === '[]' || s === 'null' || s === '""') return true
    var arr = JSON.parse(s)
    if (!Array.isArray(arr)) return true
    if (arr.length === 0) return true
    for (var i = 0; i < arr.length; i++) {
      var g = arr[i]
      if (!g) return true
      if (g.needsGrading === true) return true
      if (g.gradingStatus === 'pending' || g.gradingStatus === 'manual') return true
      if (g.awardedPoints === undefined || g.awardedPoints === null) return true
    }
    return false
  } catch (e) {
    return true
  }
}

// تصحيح كل الأسئلة المقالية بشكل حاسم (نص → smart grader، صورة → VLM)
async function gradeWritingDecisive(writing: QItem[], answers: any): Promise<{ verdicts: any[]; writingScore: number }> {
  var textWorkload: any[] = []
  var imageWorkload: any[] = []

  writing.forEach(function (item) {
    var q = item.q
    var pts = pointsOf(q, 5)
    var raw = lookupAnswer(answers, item.origIdx)
    var studentText = raw !== undefined && raw !== null ? String(raw) : ''
    var entry = {
      origIdx: item.origIdx,
      question: q.question || q.q || '',
      modelAnswer: q.modelAnswer || q.answer || '',
      acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
      points: pts,
      studentText: studentText,
    }
    var mediaIds = extractImageMediaIds(studentText)
    if (studentText && mediaIds.length > 0) imageWorkload.push(entry)
    else textWorkload.push(entry)
  })

  var textGraded: any[] = []
  if (textWorkload.length > 0) {
    try {
      var textResult = await gradeWritingSmart(textWorkload.map(function (w) {
        return {
          question: w.question,
          answer: w.studentText,
          modelAnswer: w.modelAnswer,
          acceptedAnswers: w.acceptedAnswers,
          points: w.points,
        }
      }))
      textGraded = textResult.graded || []
    } catch (grErr) {
      console.error('[regrade-core] smart grade error:', grErr)
      textGraded = []
    }
  }
  // أي سؤال نصي مالقاش له حكم → fallback حاسم (دايماً graded)
  textWorkload.forEach(function (w, wi) {
    if (textGraded[wi]) {
      textGraded[wi].gradingStatus = 'graded'
      textGraded[wi].needsGrading = false
      textGraded[wi].aiIsCorrect = textGraded[wi].isCorrect === true
      textGraded[wi].aiFeedback = textGraded[wi].feedback || ''
      textGraded[wi].aiExtractedAnswer = textGraded[wi].aiExtractedAnswer || (w.studentText ? w.studentText : '(فارغ)')
      return
    }
    textGraded[wi] = gradeFallbackDecisive({
      question: w.question,
      answer: w.studentText,
      modelAnswer: w.modelAnswer,
      acceptedAnswers: w.acceptedAnswers,
      points: w.points,
    })
    textGraded[wi].aiIsCorrect = textGraded[wi].isCorrect === true
    textGraded[wi].aiFeedback = textGraded[wi].feedback || ''
    textGraded[wi].aiExtractedAnswer = w.studentText ? w.studentText : '(فارغ)'
  })

  var imageGraded: any[] = []
  for (var im = 0; im < imageWorkload.length; im++) {
    var iw = imageWorkload[im]
    var gradeData: any = null
    try {
      var mediaIds2 = extractImageMediaIds(iw.studentText)
      gradeData = await gradeImageAnswer({
        mediaId: mediaIds2[0],
        question: iw.question,
        modelAnswer: iw.modelAnswer,
        acceptedAnswers: iw.acceptedAnswers,
        maxPoints: iw.points,
      })
    } catch (imErr) {
      console.error('[regrade-core] image grade error:', imErr)
    }
    if (gradeData) {
      /* 2026-و13 — نفس قرار التسليم: الـ AI مش متأكد من قراية الصورة ←
         درجة مؤقتة عادلة (نص درجة المحاولة) بدل صفر — زي الواجب بالظبط،
         والمستر يعدلها بضغطة من لوحته */
      var imRealWork = iw.studentText.replace(/\[📷[^\]]*\]/g, '').trim().length > 0
      var imUnsure = gradeData.needsGrading === true && gradeData.isCorrect !== true
      var imAwarded = imUnsure
        ? (imRealWork ? Math.ceil(iw.points / 2) : 0)
        : Math.min(Math.max(Math.round(Number(gradeData.awardedPoints) || (gradeData.isCorrect ? iw.points : 0)), 0), iw.points)
      imageGraded.push({
        question: iw.question,
        answer: iw.studentText,
        modelAnswer: iw.modelAnswer,
        awardedPoints: imAwarded,
        maxPoints: iw.points,
        isCorrect: imUnsure ? false : (imAwarded >= Math.ceil(iw.points * 0.5) && imAwarded > 0),
        feedback: imUnsure
          ? (imRealWork ? 'صورة الحل اترفعت — درجة مؤقتة لحد ما تراجعها وعدّلها من لوحتك' : 'لم يتم الإجابة')
          : (gradeData.feedback || (imAwarded > 0 ? 'تم تصحيح صورة الحل' : 'الحل مش مطابق')),
        gradingStatus: 'graded',
        needsGrading: false,
        aiExtractedAnswer: gradeData.extractedAnswer || (imUnsure && imRealWork ? '(صورة الحل مقدرناش نقراها بدقة)' : ''),
      })
    } else {
      // الـ VLM فشل → درجة محاولة عادلة بدل ما نسيبها فاضية
      var hasRealWork = iw.studentText.replace(/\[📷[^\]]*\]/g, '').trim().length > 0
      imageGraded.push({
        question: iw.question,
        answer: iw.studentText,
        modelAnswer: iw.modelAnswer,
        awardedPoints: hasRealWork ? Math.ceil(iw.points / 2) : 0,
        maxPoints: iw.points,
        isCorrect: hasRealWork,
        feedback: hasRealWork ? 'صورة الحل اترفعت — المستر هيراجعها ويعادلها' : 'لم يتم الإجابة',
        gradingStatus: 'graded',
        needsGrading: false,
        aiExtractedAnswer: '',
      })
    }
    imageGraded[im].aiIsCorrect = imageGraded[im].isCorrect === true
    imageGraded[im].aiFeedback = imageGraded[im].feedback || ''
  }

  // دمج بترتيب الأسئلة الأصلي + حساب الدرجة
  var byOrig: Record<number, any> = {}
  var writingScore = 0
  textWorkload.forEach(function (w, wi) {
    var g = textGraded[wi]
    if (g) { writingScore += Number(g.awardedPoints) || 0; byOrig[w.origIdx] = g }
  })
  imageWorkload.forEach(function (w, ii) {
    var g = imageGraded[ii]
    if (g) { writingScore += Number(g.awardedPoints) || 0; byOrig[w.origIdx] = g }
  })

  var verdicts: any[] = []
  writing.forEach(function (item) {
    var g = byOrig[item.origIdx]
    if (!g) {
      // أمان أخير — مفيش سؤال بيفضل من غير حكم
      g = gradeFallbackDecisive({
        question: item.q.question || item.q.q || '',
        answer: '',
        modelAnswer: item.q.modelAnswer || item.q.answer || '',
        acceptedAnswers: [],
        points: pointsOf(item.q, 5),
      })
    }
    verdicts.push({
      origIdx: item.origIdx,
      question: g.question || item.q.question || item.q.q || '',
      answer: g.answer !== undefined ? g.answer : (lookupAnswer(answers, item.origIdx) || ''),
      modelAnswer: g.modelAnswer || item.q.modelAnswer || item.q.answer || '',
      awardedPoints: Math.min(Math.max(Math.round(Number(g.awardedPoints) || 0), 0), pointsOf(item.q, 5)),
      maxPoints: g.maxPoints || pointsOf(item.q, 5),
      points: g.maxPoints || pointsOf(item.q, 5),
      isCorrect: g.isCorrect === true,
      aiIsCorrect: g.isCorrect === true,
      feedback: g.feedback || '',
      aiFeedback: g.feedback || '',
      gradingStatus: 'graded',
      needsGrading: false,
      isGraded: true,
      aiExtractedAnswer: g.aiExtractedAnswer || '',
      imageGraded: /\[📷/.test(String(g.answer || '')),
      textGraded: !/\[📷/.test(String(g.answer || '')),
    })
  })

  return { verdicts: verdicts, writingScore: writingScore }
}

function applyOverrides(verdicts: any[], overridesJson: string, all: any[], writingDefault: number) {
  var overrides: any = {}
  try { overrides = JSON.parse(overridesJson || '{}') || {} } catch (e) { overrides = {} }
  if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {}
  var overrideContrib: Record<string, number> = {}
  Object.keys(overrides).forEach(function (k) {
    var ov = overrides[k]
    var q = all[Number(k)]
    if (!q) return
    var pts = pointsOf(q, writingDefault)
    overrideContrib[String(k)] = ov === true ? pts : 0
    // علّم الحكم المخزن بالتعديل اليدوي عشان العرض يبيّن "كلمة المستر"
    for (var i = 0; i < verdicts.length; i++) {
      if (verdicts[i].origIdx === Number(k)) {
        verdicts[i].awardedPoints = ov === true ? pts : 0
        verdicts[i].isCorrect = ov === true
        verdicts[i].aiIsCorrect = ov === true
        verdicts[i].overridden = true
        break
      }
    }
  })
  return overrideContrib
}

function mcqContrib(mcq: QItem[], answers: any): { contrib: Record<string, number>; mcqScore: number; maxFromMcq: number } {
  var contrib: Record<string, number> = {}
  var mcqScore = 0
  var maxFromMcq = 0
  mcq.forEach(function (item) {
    var q = item.q
    var pts = pointsOf(q, 1)
    maxFromMcq += pts
    var opts = Array.isArray(q.options) ? q.options : []
    /* 2026-و11 — مفتاح ناقص = صفر صادق مش (A) بالحر — لحد ما المستر يثبت المفتاح */
    var correctIdx = typeof q.correct === 'number' ? q.correct : -1
    if (correctIdx < 0 || correctIdx >= opts.length) {
      contrib[String(item.origIdx)] = 0
      return
    }
    var studentAnswer = lookupAnswer(answers, item.origIdx)
    var ok = studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx
    contrib[String(item.origIdx)] = ok ? pts : 0
    if (ok) mcqScore += pts
  })
  return { contrib: contrib, mcqScore: mcqScore, maxFromMcq: maxFromMcq }
}

function sumMax(all: any[], mcqCount: number, verdicts: any[]): number {
  var maxScore = 0
  all.forEach(function (q, idx) {
    var isWriting = q.type === 'writing' || q.type === 'essay'
    if (!isWriting && Array.isArray(q.options)) {
      var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
      if (allNA) isWriting = true
    }
    if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
    var pts = pointsOf(q, isWriting ? 5 : 1)
    maxScore += pts
    void idx
  })
  return maxScore
}

// ===== الامتحانات =====
// بيرجّع {score, maxScore} أو null لو النتيجة/الامتحان مش موجودين
export async function regradeExamResult(resultId: string): Promise<{ score: number; maxScore: number } | null> {
  await ensureResultColumns()
  var rows: any[] = await db.$queryRawUnsafe(
    'SELECT id, examId, studentId, score, maxScore, answers, writingGrades, gradeOverrides FROM ExamResult WHERE id = ? LIMIT 1',
    resultId
  )
  if (!rows || rows.length === 0) return null
  var res = rows[0]

  /* 2026-و22 — علة «الورق بيتصحح على أسئلة تانية»: لو الامتحان فيه نماذج
     لازم نعيد التصحيح على **أسئلة نموذج الطالب** (نفس الأسئلة اللي شافها
     وسلّم عليها) مش أسئلة الأساس — وإلا كل الفهارس بتتزحزح والورق يتعرض
     ويتصحح في سؤال مش سؤاله */
  var examRows: any[] = await db.$queryRawUnsafe(
    'SELECT id, title, questions, passScore, models, modelMode, fixedModel FROM Exam WHERE id = ? LIMIT 1',
    res.examId
  )
  if (!examRows || examRows.length === 0) return null

  var rawQ: any[] = resolveQuestionsForStudent(examRows[0], res.studentId, res.examId)
  var parts = splitQuestions(rawQ)
  if (parts.writing.length === 0 && parts.mcq.length === 0) return null // مفيش أسئلة نقدر نحسب عليها

  var answers: any = []
  try { answers = res.answers ? JSON.parse(res.answers) : [] } catch (e) { answers = [] }

  var mcqResult = mcqContrib(parts.mcq, answers)
  var writingResult = await gradeWritingDecisive(parts.writing, answers)
  var overrideContrib = applyOverrides(writingResult.verdicts, res.gradeOverrides, parts.all, 5)

  var contrib: Record<string, number> = Object.assign({}, mcqResult.contrib)
  writingResult.verdicts.forEach(function (g) {
    if (g.origIdx === undefined) return
    contrib[String(g.origIdx)] = g.awardedPoints || 0
  })
  Object.keys(overrideContrib).forEach(function (k) { contrib[k] = overrideContrib[k] })

  var finalScore = 0
  Object.keys(contrib).forEach(function (k) { finalScore += contrib[k] || 0 })
  var maxScore = sumMax(parts.all, parts.mcq.length, writingResult.verdicts)
  if (maxScore === 0) maxScore = res.maxScore || 1

  var verdictsJson = ''
  try { verdictsJson = JSON.stringify(writingResult.verdicts) } catch (e) {}

  // نكتب العمودين: writingGrades (submit/exam-results/student) + writingResults (progress/regrade)
  await db.$executeRawUnsafe(
    'UPDATE ExamResult SET score = ?, maxScore = ?, writingGrades = ?, writingResults = ? WHERE id = ?',
    finalScore, maxScore, verdictsJson, verdictsJson, resultId
  )

  return { score: finalScore, maxScore: maxScore }
}

// ===== الواجبات =====
export async function regradeHomeworkResult(resultId: string): Promise<{ score: number; maxScore: number } | null> {
  await ensureResultColumns()
  var rows: any[] = await db.$queryRawUnsafe(
    'SELECT id, homeworkId, studentId, score, maxScore, answers, writingResults, gradeOverrides FROM HomeworkResult WHERE id = ? LIMIT 1',
    resultId
  )
  if (!rows || rows.length === 0) return null
  var res = rows[0]

  var hwRows: any[] = await db.$queryRawUnsafe(
    'SELECT id, title, questions FROM Homework WHERE id = ? LIMIT 1',
    res.homeworkId
  )
  if (!hwRows || hwRows.length === 0) return null

  var rawQ: any[] = []
  try {
    var parsed = typeof hwRows[0].questions === 'string' ? JSON.parse(hwRows[0].questions) : hwRows[0].questions
    if (Array.isArray(parsed)) rawQ = parsed
  } catch (e) {}
  var parts = splitQuestions(rawQ)
  if (parts.writing.length === 0 && parts.mcq.length === 0) return null

  var answers: any = []
  try { answers = res.answers ? JSON.parse(res.answers) : [] } catch (e) { answers = [] }

  var mcqResult = mcqContrib(parts.mcq, answers)
  var writingResult = await gradeWritingDecisive(parts.writing, answers)
  var overrideContrib = applyOverrides(writingResult.verdicts, res.gradeOverrides, parts.all, 5)

  var contrib: Record<string, number> = Object.assign({}, mcqResult.contrib)
  writingResult.verdicts.forEach(function (g) {
    if (g.origIdx === undefined) return
    contrib[String(g.origIdx)] = g.awardedPoints || 0
  })
  Object.keys(overrideContrib).forEach(function (k) { contrib[k] = overrideContrib[k] })

  var finalScore = 0
  Object.keys(contrib).forEach(function (k) { finalScore += contrib[k] || 0 })
  var maxScore = sumMax(parts.all, parts.mcq.length, writingResult.verdicts)
  if (maxScore === 0) maxScore = res.maxScore || 1

  // ترتيب الحكم بترتيب الأسئلة المقالية (القارئات بتطابق بالسؤال وبالفهرس)
  var verdictsJson = ''
  try { verdictsJson = JSON.stringify(writingResult.verdicts) } catch (e) {}

  await db.$executeRawUnsafe(
    'UPDATE HomeworkResult SET score = ?, maxScore = ?, writingResults = ? WHERE id = ?',
    finalScore, maxScore, verdictsJson, resultId
  )

  return { score: finalScore, maxScore: maxScore }
}

// ===== تنظيف النتايج اليتيمة (الواجب/الامتحان/الفيديو اتحذف والدرجات فضلت) =====
// المستر طلب: أي واجب يتشال من المنصة → نقطته وكل حاجة ليها تتشال
export async function cleanupOrphanResults(): Promise<{ homework: number; exam: number; video: number }> {
  var homework = 0
  var exam = 0
  var video = 0
  try {
    var r1: any = await db.$executeRawUnsafe('DELETE FROM HomeworkResult WHERE homeworkId NOT IN (SELECT id FROM Homework)')
    homework = typeof r1 === 'number' ? r1 : 0
  } catch (e) {}
  try {
    var r2: any = await db.$executeRawUnsafe('DELETE FROM ExamResult WHERE examId NOT IN (SELECT id FROM Exam)')
    exam = typeof r2 === 'number' ? r2 : 0
  } catch (e) {}
  try {
    var r3: any = await db.$executeRawUnsafe('DELETE FROM VideoProgress WHERE videoId NOT IN (SELECT id FROM Video)')
    video = typeof r3 === 'number' ? r3 : 0
  } catch (e) {}
  return { homework: homework, exam: exam, video: video }
}
