// @ts-nocheck
// POST /api/exams/submit - Submit exam answers, save INSTANTLY, then AI-grade in background
//
// **(إصلاح 2026-و10 — علة «الطالب اللي بيقدم الامتحان بيختفي من عندي»)**:
//   التدفق القديم كان بيصحّح كل الأسئلة المقالية بالذكاء الاصطناعي **قبل** ما
//   يحفظ أي حاجة (كل صورة VLM بـ 35 ثانية) — والعميل بيقطع بعد 120 ثانية
//   ويقول للطالب «تم التقديم» **بالكذب** والسيرفر لسه ما حفظش → مفيش صف في
//   ExamResult → الامتحان يختفي من عند المستر خالص + حارس التسلسل يفتكر
//   إن الطالب ما خدش الامتحان → قفل كاذب على كل اللي بعده.
//   التدفق الجديد (نفس نهج الواجبات المصلح):
//   1) تصحيح الاختياري فورًا (محلي، بلا ثواني)
//   2) حفظ صف ExamResult فورًا (درجة الاختياري + الأسئلة المقالية بحالة pending)
//   3) رد 200 على الطالب في ثواني — «التسليم وصل» كلام صادق مضمون
//   4) التصحيح الذكي للمقالي كله في الخلفية (after) وبعدها UPDATE الدرجة
//   كمان: امتحانات النماذج (models) بقيت مدعومة في التسليم — نفس اختيار
//   النموذج الحتمي اللي الطالب شافه في القايمة (pickModelIdx + fixedModel)

import { NextResponse } from 'next/server'
import { after } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds, finalAnswerCandidates } from '@/lib/ai-image-grader'
import { quickSmartMatch, gradeFallbackDecisive } from '@/lib/smart-grader'
/* (2026-و29) مسار gradeWritingSmart الجماعي اتشال من التسليم — كان نداء AI واحد
   لكل الأسئلة المقالية: أي 429/timeout/JSON مقطوع = فولباك للدفعة كلها = «كله غلط».
   دلوقتي تصحيح متسلسل سؤال-بسؤال (نفس إصلاح الواجب و25) — فشل سؤال ما يأثرش على غيره. */
import { checkExamSequential } from '@/lib/sequential-guard'
import { parseQuestions, resolveQuestionsForStudent } from '@/lib/exam-models'

export const runtime = 'nodejs'
export const maxDuration = 300

/* (2026-و29) كاش على مستوى الموديول: كل ALTER = نداء شبكة لقاعدة البيانات — تنفيذها في كل ريكوست كان بيدفع نداءات ضاية في كل تحميل (من أكبر أسباب بطء المنصة) — دلوقتي مرة واحدة لكل instance */
var _examResultReady: Promise<void> | null = null
async function ensureTable() {
  if (!_examResultReady) {
    _examResultReady = (async function () {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS ExamResult (
        id TEXT PRIMARY KEY,
        examId TEXT NOT NULL,
        studentId TEXT NOT NULL,
        score REAL NOT NULL DEFAULT 0,
        maxScore REAL NOT NULL DEFAULT 100,
        answers TEXT DEFAULT '',
        writingGrades TEXT DEFAULT '',
        submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN answers TEXT DEFAULT ""') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingGrades TEXT DEFAULT ""') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingResults TEXT DEFAULT ""') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN gradeOverrides TEXT DEFAULT ""') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP') } catch(e) {}
    /* (25-ب1) أعمدة الميزات الجديدة على Exam/Homework — defensive ALTERs
       بنفس نمط المشروع (ممنوع db:push): إظهار الإجابات + المؤقت + الجدولة */
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN showResult INTEGER DEFAULT 0') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN timeLimitMin INTEGER DEFAULT 0') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN scheduledAt DATETIME') } catch(e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Homework ADD COLUMN scheduledAt DATETIME') } catch(e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetStudentIds TEXT DEFAULT ''") } catch(e) {}
    /* (2026-و29) استهداف المجموعات */
    try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetGroupIds TEXT DEFAULT ''") } catch(e) {}
  } catch (e) {
    console.error('Ensure ExamResult table error:', e)
  }
})()
  }
  await _examResultReady
}

/* ===== اختيار النموذج الحتمي — بقى مشترك من lib/exam-models (2026-و22)
   عشان كل مكان (تسليم/عرض/إعادة تصحيح) يحسب نفس أسئلة الطالب بالظبط ===== */

export async function POST(request) {
  try {
    var body = await request.json()
    var studentId = body.studentId
    var examId = body.examId
    var answers = body.answers

    if (!studentId || !examId || answers === undefined || answers === null) {
      return NextResponse.json({ error: 'بيانات مفقودة' }, { status: 400 })
    }

    await ensureTable()

    // Check double submission
    try {
      var existing = await db.$queryRawUnsafe(
        'SELECT id FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1',
        studentId, examId
      )
      if (existing && existing.length > 0) {
        return NextResponse.json({ alreadySubmitted: true, submitted: true, blocked: true }, { status: 200 })
      }
    } catch (e) {
      console.error('Check existing exam result error:', e)
    }

    // الترتيب التسلسلي (نفس نظام الفيديوهات — طلب المستر)
    try {
      var seqCheck = await checkExamSequential(examId, studentId)
      if (!seqCheck.ok) {
        return NextResponse.json({ error: seqCheck.reason, sequentialLocked: true }, { status: seqCheck.code || 423 })
      }
    } catch (e) {}

    // Fetch exam (مع النماذج عشان نعرف أسئلة الطالب الفعلية)
    var exam = null
    try {
      /* (25-ب1) showResult مضاف للـ SELECT — بنقرأه بس للرد النهائي
         (إظهار نتيجة الاختياري للطالب أو رسالة الانتظار) */
      var examRows = await db.$queryRawUnsafe(
        'SELECT id, title, questions, passScore, models, modelMode, fixedModel, showResult, targetStudentIds, targetGroupIds FROM Exam WHERE id = ? LIMIT 1',
        examId
      )
      exam = examRows && examRows.length > 0 ? examRows[0] : null
    } catch (e) {
      console.error('Fetch exam error:', e)
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }
    if (!exam) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    /* (2026-و26) حارس الاستهداف: الامتحان الموجه لطلاب محددين — التسليم
       مسموح للي اسمه في القايمة بس (حتى لو طلبه بنفسه بالـ API)
       (2026-و29) + استهداف المجموعات: عضو المجموعة المستهدفة مسموح برضه */
    try {
      var tParsed = JSON.parse(String((exam as any).targetStudentIds || '[]'))
      var gParsed: string[] = []
      try { var gpX = JSON.parse(String((exam as any).targetGroupIds || '[]')); if (Array.isArray(gpX)) gParsed = gpX } catch (e) {}
      var allowedHere = true
      var studentGroupHere = ''
      if ((Array.isArray(tParsed) && tParsed.length > 0) || gParsed.length > 0) {
        allowedHere = false
        if (Array.isArray(tParsed) && tParsed.indexOf(String(studentId)) !== -1) allowedHere = true
        if (!allowedHere && gParsed.length > 0) {
          try {
            var sgRowsHere = await db.$queryRawUnsafe('SELECT groupId FROM Student WHERE id = ? LIMIT 1', studentId) as any[]
            if (sgRowsHere && sgRowsHere.length > 0) studentGroupHere = String(sgRowsHere[0].groupId || '')
            if (studentGroupHere && gParsed.indexOf(studentGroupHere) !== -1) allowedHere = true
          } catch (sgErr) {}
        }
      }
      if (!allowedHere) {
        return NextResponse.json({ error: 'الامتحان ده مش موجه ليك — كلمني لو فيه غلط' }, { status: 403 })
      }
    } catch (e) {}

    // Parse questions — (2026-و22) الـ helper المشترك resolveQuestionsForStudent:
    // لو الامتحان فيه نماذج ← أسئلة نموذج الطالب هو هي الأصل للتصحيح
    // (حتى لو فيه أسئلة أساس — الطالب شاف النموذج بتاعه فلازم يتصحح عليه)،
    // والأساس بوابه احتياط. نفس الدالة اللي بتقرأ شاشات الأدمن — صفر تعارض.
    var questions = resolveQuestionsForStudent(exam, studentId, examId)
    if (questions.length === 0) {
      questions = parseQuestions(exam.questions)
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: 'لا توجد أسئلة في هذا الامتحان' }, { status: 400 })
    }

    // Helper: look up student answer by original index
    function lookupAnswer(ans: any, idx: number): any {
      try {
        if (Array.isArray(ans)) return ans[idx]
        if (ans !== null && typeof ans === 'object') {
          return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
        }
      } catch (e) {}
      return undefined
    }

    // Separate MCQ from writing questions - track original index
    var mcqQuestions: any[] = []
    var writingQuestions: any[] = []
    questions.forEach(function(q, idx) {
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
      if (isWriting) writingQuestions.push({ q: q, origIdx: idx })
      else mcqQuestions.push({ q: q, origIdx: idx })
    })

    // ===== المرحلة 1: تصحيح الاختياري فورًا (محلي — مفيش انتظار) =====
    var score = 0
    var maxScore = 0
    /* 2026-و11 — أسئلة اختيارية من غير مفتاح مؤكد: صفر درجة + مراجعة مستر — مش (A) بالحر */
    var keylessMcq: any[] = []
    mcqQuestions.forEach(function(item, i) {
      var q = item.q
      var origIdx = item.origIdx
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : -1
      if (correctIdx < 0 || correctIdx >= opts.length) {
        keylessMcq.push({
          index: origIdx,
          question: String(q.question || q.q || ('السؤال ' + (origIdx + 1))),
          points: pts,
          studentAnswer: lookupAnswer(answers, origIdx),
        })
        return /* صفر درجة — مفيش تخمين */
      }
      var studentAnswer = lookupAnswer(answers, origIdx)
      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        score += pts
      }
    })

    // بناء مصفوفة أسئلة المقالي بحالة pending (التصحيح الذكي في الخلفية)
    var textWorkload: any[] = []
    var imageWorkload: any[] = []
    var pendingGrades: any[] = []
    var ptsByOrig: Record<number, number> = {}

    for (var wi = 0; wi < writingQuestions.length; wi++) {
      var wItem = writingQuestions[wi]
      var wq = wItem.q
      var wOrigIdx = wItem.origIdx
      var pts = (typeof wq.points === 'number' && wq.points > 0) ? wq.points : 5
      maxScore += pts
      ptsByOrig[wOrigIdx] = pts

      var lookedUp = lookupAnswer(answers, wOrigIdx)
      var studentText = lookedUp !== undefined && lookedUp !== null ? String(lookedUp) : ''

      var wEntry = {
        origIdx: wOrigIdx,
        question: wq.question || wq.q || '',
        modelAnswer: wq.modelAnswer || wq.answer || '',
        acceptedAnswers: Array.isArray(wq.acceptedAnswers) ? wq.acceptedAnswers : [],
        points: pts,
        studentText: studentText,
      }

      pendingGrades.push({
        origIdx: wOrigIdx,
        question: wEntry.question,
        answer: studentText,
        modelAnswer: wEntry.modelAnswer,
        awardedPoints: 0,
        maxPoints: pts,
        isCorrect: false,
        feedback: 'التصحيح الذكي جاري — هتظهر درجتك كاملة بعد لحظات',
        gradingStatus: 'pending',
      })

      var mediaIds = extractImageMediaIds(studentText)
      if (mediaIds.length > 0) imageWorkload.push(wEntry)
      else textWorkload.push(wEntry)
    }

    /* 2026-و11 — أسئلة المفتاح الناقص بتتحط في المراجعة بحالة graded
       (مش pending عشان إعادة التصحيح الذاتي متحاولش تصححها بالـ AI)
       — صفر درجة صادق + رسالة واضحة للطالب والمستر */
    for (var ki = 0; ki < keylessMcq.length; ki++) {
      var km = keylessMcq[ki]
      pendingGrades.push({
        origIdx: km.index,
        question: km.question,
        answer: km.studentAnswer !== undefined && km.studentAnswer !== null ? String(km.studentAnswer) : '',
        modelAnswer: '⚠ السؤال ده من غير إجابة مؤكدة في مفتاح الدرجات — المستر هيحدد الإجابة الصحيحة ويعيد التصحيح',
        awardedPoints: 0,
        maxPoints: km.points,
        isCorrect: false,
        feedback: '⚠ السؤال ده محتاج مراجعة المستر — إجابته مش مؤكدة في مفتاح الدرجات',
        gradingStatus: 'graded',
        needsManualKey: true,
      })
    }

    if (maxScore === 0) { maxScore = questions.length }

    // ===== المرحلة 2: **حفظ فوري** — الصف موجود من اللحظة دي في عند المستر =====
    var resultId = 'exr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    var answersJson = ''
    if (answers !== undefined && answers !== null) {
      try { answersJson = JSON.stringify(answers) } catch(e) { answersJson = '' }
    }
    var writingGradesJson = ''
    try { writingGradesJson = JSON.stringify(pendingGrades) } catch(e) { writingGradesJson = '' }

    try {
      /* 2026-و22 — بنكتب العمودين مع بعض (writingGrades + writingResults):
         شاشات الأدمن بتقرأ writingResults — لو ما اتكتبش كان البادج
         «بيتصحح بالذكاء الاصطناعي» فضل ظاهر لحد ما الإصلاح الذاتي يعدّي */
      await db.$executeRawUnsafe(
        'INSERT INTO ExamResult (id, studentId, examId, score, maxScore, answers, writingGrades, writingResults) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        resultId, studentId, examId, score, maxScore, answersJson, writingGradesJson, writingGradesJson
      )
    } catch (insertErr) {
      console.error('Insert exam result error:', insertErr)
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO ExamResult (id, studentId, examId, score, maxScore, answers, writingGrades) VALUES (?, ?, ?, ?, ?, ?, ?)',
          resultId, studentId, examId, score, maxScore, answersJson, writingGradesJson
        )
      } catch (retryErr) {
        console.error('Retry insert exam result error:', retryErr)
        return NextResponse.json({ error: 'حدث خطأ أثناء تسليم الامتحان' }, { status: 500 })
      }
    }

    // ===== المرحلة 3: رد فوري صادق — التسليم وصل مضمون =====
    // (التصحيح الذكي للمقالي بيكمل في after() وبعدها UPDATE الدرجة)
    after(async () => {
      // 3أ) نص → التصحيح الذكي (مطابقة سريعة + دفعة AI واحدة + fallback)
      var textGraded: any[] = []
      var imageGraded: any[] = []

      /* (2026-و25) partial persist — بنكتب الحكم الحالي بعد كل مرحلة: لو
         التسليم الخلفي اتقطع (serverless timeout/crash) اللي اتصحح مش بيضيع،
         والباقي بيفضل pending و gradesLookPending بيلقطه للإصلاح الذاتي
         (sweep / إعادة تصحيح الأدمن). الحكم النهائي (isFinal) بس هو اللي
         بيحوّل اللي ماتصححش لفولباك حاسم بدل ما يفضل معلق. */
      var persistExamGrades = async function(isFinal: boolean) {
        try {
          var gradesByOrig: Record<number, any> = {}
          for (var tx = 0; tx < textWorkload.length; tx++) {
            var tg = textGraded[tx]
            if (tg) gradesByOrig[textWorkload[tx].origIdx] = tg
          }
          for (var ix = 0; ix < imageWorkload.length; ix++) {
            var ig = imageGraded[ix]
            if (ig) gradesByOrig[imageWorkload[ix].origIdx] = ig
          }
          var writingScore = 0
          var finalGrades: any[] = []
          for (var pi = 0; pi < pendingGrades.length; pi++) {
            var pg = pendingGrades[pi]
            var gr = gradesByOrig[pg.origIdx]
            if (gr) {
              writingScore += Number(gr.awardedPoints) || 0
              finalGrades.push({
                origIdx: pg.origIdx,
                question: gr.question || pg.question,
                answer: gr.answer !== undefined ? gr.answer : pg.answer,
                modelAnswer: gr.modelAnswer || pg.modelAnswer,
                awardedPoints: gr.awardedPoints,
                maxPoints: gr.maxPoints || pg.maxPoints,
                isCorrect: gr.isCorrect,
                feedback: gr.feedback,
                gradingStatus: gr.gradingStatus || 'graded',
                needsGrading: gr.needsGrading === true ? true : undefined,
                aiExtractedAnswer: gr.aiExtractedAnswer || '',
              })
            } else if (pg.needsManualKey || pg.gradingStatus !== 'pending') {
              // أسئلة مفتاح ناقص — حكمها جاهز من التسليم
              finalGrades.push(pg)
            } else if (!isFinal) {
              // snapshot جزئي: لسه ما اتصرحش — بيفضل pending للإصلاح الذاتي
              finalGrades.push(pg)
            } else if ((pg.answer || '').trim()) {
              // (2026-و25) سؤال اتجاوب عليه فعلاً ومقدرناش نصححه (فشل كلي) —
              // ممنوع الصفر الصامت «لم يتم الإجابة» على محاولة حقيقية:
              // صورة → نص درجة المحاولة، نص → fallback حاسم بالقيم/التشابه
              if (/\[📷/.test(pg.answer || '')) {
                var imHalf = Math.ceil((pg.maxPoints || 1) / 2)
                writingScore += imHalf
                finalGrades.push({
                  origIdx: pg.origIdx,
                  question: pg.question,
                  answer: pg.answer,
                  modelAnswer: pg.modelAnswer,
                  awardedPoints: imHalf,
                  maxPoints: pg.maxPoints,
                  isCorrect: false,
                  feedback: 'صورة الحل اترفعت — درجة مؤقتة لحد ما المستر يراجعها وعدّلها من لوحته',
                  gradingStatus: 'graded',
                  aiExtractedAnswer: '(صورة الحل مقدرناش نقراها بدقة)',
                })
              } else {
                var fbD = gradeFallbackDecisive({
                  question: pg.question,
                  answer: pg.answer,
                  modelAnswer: pg.modelAnswer || '',
                  acceptedAnswers: [],
                  points: pg.maxPoints || 1,
                })
                writingScore += Number(fbD.awardedPoints) || 0
                finalGrades.push({
                  origIdx: pg.origIdx,
                  question: pg.question,
                  answer: pg.answer,
                  modelAnswer: pg.modelAnswer,
                  awardedPoints: fbD.awardedPoints,
                  maxPoints: fbD.maxPoints,
                  isCorrect: fbD.isCorrect,
                  feedback: fbD.feedback,
                  gradingStatus: 'graded',
                })
              }
            } else {
              // السؤال ده اتسلّم من غير نص ولا صورة → صفر صريح مش pending
              finalGrades.push({
                origIdx: pg.origIdx,
                question: pg.question,
                answer: pg.answer,
                modelAnswer: pg.modelAnswer,
                awardedPoints: 0,
                maxPoints: pg.maxPoints,
                isCorrect: false,
                feedback: 'لم يتم الإجابة',
                gradingStatus: 'graded',
              })
            }
          }

          var finalScore = score + writingScore
          var finalJson = ''
          try { finalJson = JSON.stringify(finalGrades) } catch(e) { finalJson = writingGradesJson }

          /* 2026-و22 — العمودين مع بعض (writingGrades + writingResults) */
          await db.$executeRawUnsafe(
            'UPDATE ExamResult SET score = ?, writingGrades = ?, writingResults = ? WHERE id = ?',
            finalScore, finalJson, finalJson, resultId
          )
        } catch (pErr) {
          console.error('Exam persist grades error:', pErr)
        }
      }

      /* (2026-و29) تصحيح متسلسل سؤال-بسؤال — نفس نمط الواجب بالظبط:
         1) مطابقة سريعة محلية (quickSmartMatch) → كاملة من غير AI
         2) AI لكل سؤال لوحده (gradeTextAnswer — فيه تحقق قيم مدمج STRICT VERIFY)
         3) فشل/عدم تأكد → فولباك حاسم للسؤال ده بس (مش الدفعة كلها)
         + partial persist بعد كل سؤال — اللي اتصحح مش بيضيع لو اتقطعنا */
      try {
        for (var tw = 0; tw < textWorkload.length; tw++) {
          var twItem = textWorkload[tw]
          var twAnswer = twItem.studentText || ''
          var graded1: any = null
          if (!twAnswer.trim() || twAnswer.trim() === '[📷 صورة مرفقة]') {
            graded1 = {
              question: twItem.question, answer: twAnswer, modelAnswer: twItem.modelAnswer,
              awardedPoints: 0, maxPoints: twItem.points, isCorrect: false,
              feedback: 'لم يتم الإجابة', gradingStatus: 'graded',
            }
          } else if (quickSmartMatch(twAnswer, twItem.modelAnswer || '', twItem.acceptedAnswers || []) === true) {
            /* (و24) ملاحظة شخصية زي معلم بيتكلم مع الطالب — حتى في المسار السريع */
            var stNote = (finalAnswerCandidates(twAnswer)[0] || twAnswer.trim() || '').slice(0, 40)
            graded1 = {
              question: twItem.question, answer: twAnswer, modelAnswer: twItem.modelAnswer,
              awardedPoints: twItem.points, maxPoints: twItem.points, isCorrect: true,
              feedback: 'برافو عليك ✓ الإجابة النهائية (' + stNote + ') مطابقة للإجابة الصحيحة',
              gradingStatus: 'graded',
            }
          } else {
            var tGrade: any = null
            try {
              tGrade = await gradeTextAnswer({
                question: twItem.question,
                studentAnswer: twAnswer,
                modelAnswer: twItem.modelAnswer || '',
                acceptedAnswers: twItem.acceptedAnswers || [],
                maxPoints: twItem.points,
              })
            } catch (tgErr) { console.error('[exam-submit] text grade error:', tgErr) }
            if (tGrade && !tGrade.needsGrading) {
              graded1 = {
                question: twItem.question, answer: twAnswer, modelAnswer: twItem.modelAnswer,
                awardedPoints: tGrade.awardedPoints || 0, maxPoints: twItem.points,
                isCorrect: tGrade.isCorrect === true,
                feedback: tGrade.feedback || (tGrade.isCorrect ? 'إجابة صحيحة' : 'إجابة مختلفة عن الإجابة الصحيحة'),
                gradingStatus: 'graded',
              }
            } else {
              /* AI فشل أو مش متأكد في السؤال ده بس → فولباك حاسم —
                 تكافؤ القيم → كاملة، علاقة بالحل → نص درجة + مراجعة */
              graded1 = gradeFallbackDecisive({
                question: twItem.question, answer: twAnswer,
                modelAnswer: twItem.modelAnswer || '',
                acceptedAnswers: twItem.acceptedAnswers || [],
                points: twItem.points,
              })
            }
          }
          textGraded[tw] = graded1
          await persistExamGrades(false)
        }
      } catch (grErr) {
        console.error('Exam writing grade error:', grErr)
        for (var tw2 = 0; tw2 < textWorkload.length; tw2++) {
          if (!textGraded[tw2]) {
            textGraded[tw2] = gradeFallbackDecisive({
              question: textWorkload[tw2].question,
              answer: textWorkload[tw2].studentText,
              modelAnswer: textWorkload[tw2].modelAnswer || '',
              acceptedAnswers: textWorkload[tw2].acceptedAnswers || [],
              points: textWorkload[tw2].points,
            })
          }
        }
      }
      await persistExamGrades(false)

      // 3ب) صور → VLM لكل سؤال (بتسلسل — مفتاح واحد مبيتحملش متوازي)
      for (var im = 0; im < imageWorkload.length; im++) {
        var iw = imageWorkload[im]
        var mediaIds2 = extractImageMediaIds(iw.studentText)
        var gradeData: any = null
        try {
          gradeData = await gradeImageAnswer({
            mediaId: mediaIds2[0],
            question: iw.question,
            modelAnswer: iw.modelAnswer,
            acceptedAnswers: iw.acceptedAnswers,
            maxPoints: iw.points,
          })
        } catch (imErr) {
          console.error('Exam writing image grade error:', imErr)
        }
        if (gradeData && gradeData.needsGrading !== true) {
          /* حكم الـ AI الواثق — نهائي: صح/جزئي/غلط (زي الواجب بالظبط) */
          var imAwarded = Math.min(Math.max(Math.round(Number(gradeData.awardedPoints) || (gradeData.isCorrect ? iw.points : 0)), 0), iw.points)
          imageGraded[im] = {
            question: iw.question,
            answer: iw.studentText,
            modelAnswer: iw.modelAnswer,
            awardedPoints: imAwarded,
            maxPoints: iw.points,
            isCorrect: imAwarded >= Math.ceil(iw.points * 0.5) && imAwarded > 0,
            feedback: gradeData.feedback || (imAwarded > 0 ? 'تم تصحيح صورة الحل' : 'الحل مش مطابق'),
            gradingStatus: 'graded',
            aiExtractedAnswer: gradeData.extractedAnswer || '',
          }
        } else {
          /* 2026-و13 — طلب المستر الحرفي: الامتحان يتصرف زي الواجب بالظبط —
             مفيش حالة «محتاجة مراجعة» معلقة وخالص: الـ AI مش متأكد من قراية
             الصورة ← درجة مؤقتة عادلة (نص درجة المحاولة) والمستر يقدر يعدلها
             بضغطة من لوحته — مفيش صفر ظالم ومفيش بادج معلق */
          var hasRealWork = iw.studentText.replace(/\[📷[^\]]*\]/g, '').trim().length > 0
          imageGraded[im] = {
            question: iw.question,
            answer: iw.studentText,
            modelAnswer: iw.modelAnswer,
            awardedPoints: hasRealWork ? Math.ceil(iw.points / 2) : 0,
            maxPoints: iw.points,
            isCorrect: false,
            feedback: hasRealWork
              ? 'صورة الحل اترفعت — درجة مؤقتة لحد ما تراجعها وعدّلها من لوحتك'
              : 'لم يتم الإجابة',
            gradingStatus: 'graded',
            aiExtractedAnswer: hasRealWork ? '(صورة الحل مقدرناش نقراها بدقة)' : '',
          }
        }
        /* (2026-و25) snapshot بعد كل صورة — اللي اتصحح متضيعش لو اتقطعنا */
        await persistExamGrades(false)
      }

      // 3ج) الحكم النهائي — كل اللي ماتصححش بياخد fallback حاسم (مش pending)
      await persistExamGrades(true)
      console.log('[exam-submit] background AI grading done:', resultId)
    })

    /* (25-ب1) طلب المستر: حرية إظهار/إخفاء الإجابات بعد التسليم —
       showResult=false (الافتراضي): نفس الرد القديم حرفيًا — بدون أي نتيجة.
       showResult=true: الطالب يشوف نتيجة الاختياري فورًا (mcqScore + تفاصيل
       كل سؤال اختياري) والمقالي بيفضل «بانتظار تصحيح المستر».
       بناء mcqResults من الاختياري المحسوب مسبقًا في المرحلة 1 (mcqQuestions)
       — نفس مقارنة الدرجة بالظبط، بدون أي إعادة تصحيح ولا لمس after() */
    /* (2026-و29) الدرجة العظمى للاختياري لوحده — عشان هيدر النتيجة الفورية
       «درجتك في الاختياري» يعرض mcqScore/mcqMaxScore صح بدل إجمالي شامل المقالي */
    var mcqMaxScore = 0
    mcqQuestions.forEach(function (item) {
      var pts = (typeof item.q.points === 'number' && item.q.points > 0) ? item.q.points : 1
      mcqMaxScore += pts
    })

    var showResultOn = exam.showResult === 1 || exam.showResult === true
    if (showResultOn) {
      var mcqResults = mcqQuestions.map(function (item) {
        var q = item.q
        var origIdx = item.origIdx
        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
        var opts = Array.isArray(q.options) ? q.options : []
        var correctIdx = typeof q.correct === 'number' ? q.correct : -1
        var keyless = correctIdx < 0 || correctIdx >= opts.length
        var raw = lookupAnswer(answers, origIdx)
        var isNum = raw !== undefined && raw !== null && raw !== '' && !isNaN(Number(raw))
        /* إجابة الطالب كنص: لو رقم → نص الخيار المختار عشان الطالب يشوف كلامه
           (لو الرقم بره حدود الخيارات → يظهر اللي بعته زي ما هو) */
        var studentText = ''
        if (raw !== undefined && raw !== null) {
          /* إجابة الطالب كنص: لو رقم → نص الخيار المختار عشان الطالب يشوف كلامه
             (لو الرقم بره حدود الخيارات → يظهر اللي بعته زي ما هو) */
          studentText = isNum ? String(opts[Number(raw)] ?? raw) : String(raw)
        }
        var isCorrect = !keyless && raw !== undefined && raw !== null && Number(raw) === correctIdx
        var entry: any = {
          origIdx: origIdx,
          question: String(q.question || q.q || ('السؤال ' + (origIdx + 1))),
          studentAnswer: studentText,
          correctAnswer: keyless ? '' : String(opts[correctIdx] || ''),
          isCorrect: isCorrect,
          points: pts,
        }
        if (keyless) {
          /* ملاحظة داخلية: سؤال اختياري من غير مفتاح مؤكد — صفر + مراجعة مستر
             (نفس منطق المرحلة 1 بالظبط — الحكم بييجي من المستر لاحقًا) */
          entry.needsManualKey = true
          entry.internalNote = '⚠ السؤال ده من غير إجابة مؤكدة في مفتاح الدرجات — المستر هيحدد الإجابة الصحيحة ويعيد التصحيح'
        }
        return entry
      })
      return NextResponse.json({
        success: true,
        submitted: true,
        showResult: true,
        message: 'تم تسليم الامتحان بنجاح',
        mcqScore: score,
        maxScore: maxScore,
        mcqMaxScore: mcqMaxScore,
        writingPending: writingQuestions.length > 0,
        mcqResults: mcqResults,
      })
    }

    return NextResponse.json({
      success: true,
      submitted: true,
      message: 'تم تسليم الامتحان بنجاح — انتظر النتيجة من المستر',
    })
  } catch (error) {
    console.error('Exam submit error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تسليم الامتحان' }, { status: 500 })
  }
}
