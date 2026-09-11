// @ts-nocheck
import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds } from '@/lib/ai-image-grader'
import { regradeExamResult, gradesLookPending, questionsHaveWriting } from '@/lib/regrade-core'
import { resolveQuestionsForStudent, splitForDisplay } from '@/lib/exam-models'
import { gradeFallbackDecisive, quickSmartMatch } from '@/lib/smart-grader'

// GET /api/exam-results?studentId=xxx&examId=yyy - Student pre-submit check (raw SQL)
// GET /api/exam-results?studentId=xxx - Student: all exam results
// GET /api/exam-results?examId=xxx - Admin: results for exam with analytics (RAW SQL with answers)
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const examId = searchParams.get('examId')
  const studentId = searchParams.get('studentId')

  // Student mode: all exam results for this student (raw SQL)
  if (studentId && !examId) {
    try {
      // writingGrades column may not exist on old databases — ensure it first
      try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingGrades TEXT DEFAULT ""') } catch (e) {}
      var rows = await db.$queryRawUnsafe(
        'SELECT id, examId, studentId, score, maxScore, submittedAt, writingGrades FROM ExamResult WHERE studentId = ?',
        studentId
      )
      /* 2026-و12 — طلب المستر الصريح: النتيجة ممنوعة على الطالب — الرد
         بيرجع بس (سلّم إمتى) عشان حالة «تم التقديم» والقفل التسلسلي،
       من غير أي درجة أو تصحيح أو إجابة نموذجية (دي لمستر شريف بس) */
      var minimal = (rows || []).map(function(r: any) {
        return { id: r.id, examId: r.examId, submittedAt: r.submittedAt }
      })

      // self-heal: نتايج قديمة ناقصة التصحيح → إعادة تصحيح تلقائي بالذكاء الاصطناعي
      // في الخلفية بعد الرد — الطالب يحدّث الصفحة يلاقي درجته اتحطت
      try {
        var pendingIds: string[] = []
        var qMap: Record<string, string> = {}
        try {
          var qRows = await db.$queryRawUnsafe('SELECT er.id AS rid, e.questions AS qs FROM ExamResult er INNER JOIN Exam e ON e.id = er.examId WHERE er.studentId = ?', studentId)
          ;(qRows || []).forEach(function(qr: any) { qMap[qr.rid] = qr.qs })
        } catch (e) {}
        for (var pi = 0; pi < (rows || []).length; pi++) {
          var rid = rows[pi].id
          if (gradesLookPending(rows[pi].writingGrades) && questionsHaveWriting(qMap[rid])) pendingIds.push(rid)
        }
        if (pendingIds.length > 0) {
          var healIds = pendingIds.slice(0, 10)
          after(async function() {
            for (var hi = 0; hi < healIds.length; hi++) {
              try { await regradeExamResult(healIds[hi]) } catch (e) {}
            }
          })
        }
      } catch (e) {}

      return NextResponse.json({ results: minimal })
    } catch (error) {
      console.error('Student exam results error:', error)
      try {
        var rows2 = await db.$queryRawUnsafe(
          'SELECT id, examId, submittedAt FROM ExamResult WHERE studentId = ?',
          studentId
        )
        return NextResponse.json({ results: (rows2 || []).map(function(r: any) { return { id: r.id, examId: r.examId, submittedAt: r.submittedAt } }) })
      } catch (e2) {
        return NextResponse.json({ results: [] })
      }
    }
  }

  // Student pre-submit check: specific exam + student (raw SQL)
  if (studentId && examId) {
    try {
      /* (و25) كان بيرجع {id, examId} بس — فزرار «تحديث الملاحظات» في كارت
         النتيجة (امتحانات showResult) عمره ما كان هيجيب تصحيح المقالي.
         دلوقتي: لو المستر مفعّل «إظهار الإجابات» للامتحان ده → نتيجة الطالب
         كاملة (score + writingGrades). الامتحان المخفي (showResult=0) بيفضل
         مقفول بالحرف — قرار و12 حاكم عليه زي ما هو. */
      var showResRows: any[] = []
      try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN showResult INTEGER DEFAULT 0') } catch (e) {}
      try {
        showResRows = await db.$queryRawUnsafe('SELECT showResult FROM Exam WHERE id = ? LIMIT 1', examId)
      } catch (e) {}
      var showOn = !!(showResRows && showResRows.length > 0 && (showResRows[0].showResult === 1 || showResRows[0].showResult === true))
      if (showOn) {
        try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingResults TEXT DEFAULT ""') } catch (e) {}
        var fullRows = await db.$queryRawUnsafe(
          'SELECT id, examId, studentId, score, maxScore, submittedAt, writingGrades FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1',
          studentId, examId
        )
        var withGrades: any[] = []
        for (var wi2 = 0; wi2 < (fullRows || []).length; wi2++) {
          var rRow = fullRows[wi2]
          var wgArr: any[] = []
          try { wgArr = rRow.writingGrades ? JSON.parse(rRow.writingGrades) : [] } catch (e) { wgArr = [] }
          withGrades.push({
            id: rRow.id, examId: rRow.examId, studentId: rRow.studentId,
            score: rRow.score, maxScore: rRow.maxScore, submittedAt: rRow.submittedAt,
            writingGrades: wgArr,
          })
        }
        return NextResponse.json({ results: withGrades })
      }
      var rows = await db.$queryRawUnsafe(
        'SELECT id, examId FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1',
        studentId, examId
      )
      return NextResponse.json({ results: rows || [] })
    } catch (error) {
      console.error('Exam result check error:', error)
      return NextResponse.json({ results: [] })
    }
  }

  // Admin mode: results for a specific exam with full per-student answer review
  if (!examId) {
    return NextResponse.json({ error: 'examId required' }, { status: 400 })
  }

  try {
    // Ensure ExamResult table has answers column (created by submit route)
    try {
      await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS ExamResult (id TEXT PRIMARY KEY, examId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)')
    } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN answers TEXT DEFAULT ""') } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN writingGrades TEXT DEFAULT ""') } catch (e) {}

    // Get exam info first (title, questions, grade, passScore)
    var examInfo: any = null
    try {
      var examRows = await db.$queryRawUnsafe(
        // (2026-و22) النماذج معانا — كل طالب بيتعرض أسئلة نموذجه هو
        'SELECT id, title, grade, questions, models, modelMode, fixedModel, passScore FROM Exam WHERE id = ? LIMIT 1',
        examId
      )
      examInfo = examRows && examRows.length > 0 ? examRows[0] : null
    } catch (e) {
      console.error('Exam lookup error:', e)
      try {
        examInfo = await db.exam.findUnique({ where: { id: examId }, select: { id: true, title: true, grade: true, questions: true, models: true, modelMode: true, fixedModel: true, passScore: true } })
      } catch (e2) {}
    }

    if (!examInfo) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Get all results for this exam using RAW SQL with answers + stored writingGrades
    var rawResults: any[] = []
    try {
      rawResults = await db.$queryRawUnsafe(
        'SELECT id, examId, studentId, score, maxScore, submittedAt, answers, writingGrades FROM ExamResult WHERE examId = ? ORDER BY submittedAt DESC',
        examId
      ) || []
    } catch (e) {
      console.error('Exam results fetch error:', e)
      // Fallback to Prisma
      try {
        var prismaResults = await db.examResult.findMany({
          where: { examId },
          orderBy: { submittedAt: 'desc' },
        })
        rawResults = prismaResults.map((r: any) => ({ ...r, answers: '', writingGrades: '' }))
      } catch (e2) { rawResults = [] }
    }

    // Get student info for each result
    var studentIds = rawResults.map((r: any) => r.studentId).filter(Boolean)
    var studentMap: any = {}
    if (studentIds.length > 0) {
      try {
        var placeholders = studentIds.map(function() { return '?' }).join(',')
        var students = await db.$queryRawUnsafe(
          'SELECT id, name, phone, grade FROM Student WHERE id IN (' + placeholders + ')',
          ...studentIds
        ) || []
        students.forEach(function(s: any) { studentMap[s.id] = s })
      } catch (e) {
        console.error('Student lookup error:', e)
      }
    }

    // Parse exam questions — (2026-و22) الأساس للعرض العام بس؛ جوه اللوب
    // كل طالب بيتعرض أسئلة نموذجه هو (resolveQuestionsForStudent)
    var examQuestions: any[] = []
    try {
      if (examInfo.questions) {
        var raw = typeof examInfo.questions === 'string' ? JSON.parse(examInfo.questions) : examInfo.questions
        if (Array.isArray(raw)) examQuestions = raw
      }
    } catch (e) {}

    // Separate MCQ from writing — أساس (للعرض العام + totals) — جوه اللوب
    // بنعمل نفس الفصل لأسئلة كل طالب على حدة
    // Track ORIGINAL index for each question (key for student answers lookup)
    var mcqQs: any[] = []        // [{q: ..., origIdx: 0}, ...]
    var writingQs: any[] = []    // [{q: ..., origIdx: 1}, ...]
    splitForDisplay(examQuestions, mcqQs, writingQs)

    // Helper: look up student answer at original index
    function lookupAnswer(studentAns: any, origIdx: number): any {
      try {
        if (Array.isArray(studentAns)) return studentAns[origIdx]
        if (studentAns !== null && typeof studentAns === 'object') {
          return studentAns[origIdx] !== undefined ? studentAns[origIdx] : studentAns[String(origIdx)]
        }
      } catch (e) {}
      return undefined
    }

    // Build per-student results with all questions review
    var passScore = examInfo.passScore || 50
    var results: any[] = []
    for (var ri = 0; ri < rawResults.length; ri++) {
      var r = rawResults[ri]
      var student = studentMap[r.studentId] || {}
      // Parse student answers
      var studentAns: any = {}
      try {
        if (r.answers) {
          studentAns = typeof r.answers === 'string' ? JSON.parse(r.answers) : r.answers
        }
      } catch (e) {}

      /* (2026-و22) أسئلة الطالب الفعلية — نموذجه لو الامتحان فيه نماذج.
         ده كان سبب «الورق بيتعرض في سؤال مش سؤاله» في امتحانات النماذج */
      var studentQuestions = resolveQuestionsForStudent(examInfo, r.studentId, examId)
      var mcqQsS: any[] = []
      var writingQsS: any[] = []
      splitForDisplay(studentQuestions, mcqQsS, writingQsS)

      var allQuestions: any[] = []
      var wrongQuestions: any[] = []
      var writingAnswers: any[] = []

      // Stored AI writing grades (saved at submit time) — reuse them instead of
      // re-calling the AI live for every admin view (fast + consistent)
      var storedByOrig: Record<number, any> = {}
      try {
        var storedArr: any[] = r.writingGrades ? (typeof r.writingGrades === 'string' ? JSON.parse(r.writingGrades) : r.writingGrades) : []
        if (Array.isArray(storedArr)) {
          storedArr.forEach(function(sg: any) { if (sg && typeof sg.origIdx === 'number') storedByOrig[sg.origIdx] = sg })
        }
      } catch (e) {}

      // MCQ all questions - iterate by ORIGINAL index (أسئلة الطالب نفسه)
      mcqQsS.forEach(function(item, qi) {
        var q = item.q
        var origIdx = item.origIdx
        var qText = q.question || q.q || ''
        var opts = Array.isArray(q.options) ? q.options : []
        /* 2026-و11 — سؤال من غير مفتاح مؤكد: عرض صادق — مش إجابة (A) وهمية */
        var correctIdx = typeof q.correct === 'number' ? q.correct : -1
        var keyless = correctIdx < 0 || correctIdx >= opts.length

        var ans = lookupAnswer(studentAns, origIdx)

        var isCorrect = ans !== undefined && ans !== null && Number(ans) === correctIdx
        var studentAnswerText = (typeof ans === 'number' && opts[ans] && opts[ans] !== 'N/A')
          ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
          : 'Not answered'
        var correctAnswerText = keyless
          ? '⚠ إجابة السؤال مش مؤكدة في المفتاح — محتاجة مراجعة المستر'
          : ((opts[correctIdx] && opts[correctIdx] !== 'N/A')
            ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
            : (q.modelAnswer || 'No correct answer stored'))

        allQuestions.push({
          type: 'mcq',
          question: qText,
          studentAnswer: studentAnswerText,
          correctAnswer: correctAnswerText,
          isCorrect: isCorrect,
        })

        if (!isCorrect) {
          wrongQuestions.push({
            question: qText,
            studentAnswer: studentAnswerText,
            correctAnswer: correctAnswerText,
          })
        }
      })

      // Writing all questions - iterate by ORIGINAL index (أسئلة الطالب نفسه)
      for (var wi = 0; wi < writingQsS.length; wi++) {
        var wItem = writingQsS[wi]
        var wq = wItem.q
        var wOrigIdx = wItem.origIdx
        var qText = wq.question || wq.q || ''
        var studentText = ''
        // Look up student answer by ORIGINAL index (key used during submit)
        var lookedUp = lookupAnswer(studentAns, wOrigIdx)
        studentText = lookedUp !== undefined && lookedUp !== null ? String(lookedUp) : ''
        studentText = typeof studentText === 'string' ? studentText : String(studentText || '')

        var modelAnswer = wq.modelAnswer || wq.answer || ''
        var acceptedAnswers = Array.isArray(wq.acceptedAnswers) ? wq.acceptedAnswers : []
        var pts = (typeof wq.points === 'number' && wq.points > 0) ? wq.points : 5

        // FAST PATH: grades stored at submit time → use them directly (no live AI)
        var stored = storedByOrig[wOrigIdx]
        if (stored) {
          /* 2026-و13 — التسليم بقى حاسم (زي الواجب): مفيش صفوف needsGrading
             جديدة — والحكم المخزن الصريح بيتحترم زي ما هو (الدرجة المؤقتة
             النصفية تفضل غلط بالبادج مع تعليق واضح إنها مؤقتة) */
          var storedNeedsReview = stored.needsGrading === true || stored.gradingStatus === 'needsGrading' || stored.gradingStatus === 'pending'
          var storedAwarded = storedNeedsReview
            ? 0
            : Math.min(Math.max(Math.round(Number(stored.awardedPoints) || 0), 0), pts)
          var storedIsCorrect = storedNeedsReview
            ? false
            : (stored.isCorrect === true
                ? true
                : (stored.isCorrect === false
                    ? false
                    : (storedAwarded >= Math.ceil(pts * 0.5) && storedAwarded > 0)))
          var storedExtracted = stored.aiExtractedAnswer || (String(stored.answer || '') !== '' ? String(stored.answer) : '')
          var storedFeedback = storedNeedsReview
            ? (stored.feedback || 'التصحيح الذكي محتاج يتأكد — محتاجة مراجعة مستر شريف')
            : (stored.feedback || (storedIsCorrect ? 'صح' : 'غلط'))
          var storedAnsText = String(stored.answer || studentText || '')

          allQuestions.push({
            type: 'writing',
            question: qText,
            studentAnswer: storedAnsText,
            correctAnswer: stored.modelAnswer || modelAnswer,
            isCorrect: storedIsCorrect,
            aiExtractedAnswer: storedExtracted,
            aiIsCorrect: storedIsCorrect,
            aiFeedback: storedFeedback,
            imageGraded: /\[📷/.test(storedAnsText),
            textGraded: !/\[📷/.test(storedAnsText),
            needsGrading: storedNeedsReview,
            isGraded: !storedNeedsReview,
            awardedPoints: storedAwarded,
            maxPoints: stored.maxPoints || pts,
          })
          writingAnswers.push({
            question: qText,
            answer: storedAnsText,
            points: pts,
            modelAnswer: stored.modelAnswer || modelAnswer,
            acceptedAnswers: acceptedAnswers,
            needsGrading: storedNeedsReview,
            aiExtractedAnswer: storedExtracted,
            aiIsCorrect: storedIsCorrect,
            aiFeedback: storedFeedback,
            imageGraded: /\[📷/.test(storedAnsText),
            textGraded: !/\[📷/.test(storedAnsText),
            isGraded: !storedNeedsReview,
            isCorrect: storedIsCorrect,
            awardedPoints: storedAwarded,
            maxPoints: stored.maxPoints || pts,
          })
          continue
        }

        // AI grading - image OR text (live fallback for results saved before
        // submit-time grading existed)
        var aiExtracted = ''
        var aiIsCorrect = false
        var aiFeedback = ''
        var imageGraded = false
        var textGraded = false
        var needsGrading = false

        // Skip if empty
        if (!studentText || studentText === '[📷 صورة مرفقة]' || studentText.trim() === '') {
          needsGrading = false
          aiFeedback = 'لم يجب الطالب'
          aiExtracted = '(فارغ)'
        } else if (!modelAnswer) {
          // المستر: مفيش حاجة اسمها تصحيح يدوي — حتى من غير إجابة نموذجية السؤال بياخد حكم نهائي
          try {
            var fbGrade = gradeFallbackDecisive({ question: qText, answer: studentText, modelAnswer: '', acceptedAnswers: acceptedAnswers, points: pts })
            aiExtracted = studentText || '(فارغ)'
            aiIsCorrect = fbGrade.isCorrect === true
            aiFeedback = fbGrade.feedback || 'تم التصحيح آلياً'
            textGraded = true
          } catch (e) {
            aiFeedback = 'لم يتم الإجابة'
            aiExtracted = '(فارغ)'
          }
        } else {
          var mediaIds = extractImageMediaIds(studentText)

          // IMAGE GRADING
          if (mediaIds.length > 0) {
            try {
              var gradeData = await gradeImageAnswer({
                mediaId: mediaIds[0],
                question: qText,
                modelAnswer: modelAnswer,
                acceptedAnswers: acceptedAnswers,
                maxPoints: pts,
              })
              if (gradeData) {
                aiExtracted = gradeData.extractedAnswer || '(تعذر الاستخراج)'
                aiIsCorrect = gradeData.isCorrect === true
                aiFeedback = gradeData.feedback || (gradeData.isCorrect ? 'صح' : 'غلط')
                imageGraded = true
              }
            } catch (e) {
              console.error('[Exam Results] AI grade image error:', e)
              aiFeedback = 'فشل التصحيح'
              aiExtracted = '(فشل الـ AI)'
            }
          } else {
            // TEXT GRADING — **القاعدة الذهبية (طلب المستر): الحكم على الإجابة
            // النهائية بفهم قيمتها الرياضية — ممنوع أي مطابقة حرفية/contains**
            // (الـ contains كان بديّ "15" صح لما الصح "5"). نفس منطق
            // quickSmartMatch المستخدم وقت التسليم: تكافؤ القيمة النهائية
            // ← صح فورًا، غير كده الـ AI يفهم الإجابة ويحكم.
            var qm = quickSmartMatch(studentText, modelAnswer, acceptedAnswers || [])
            if (qm === true) {
              aiExtracted = studentText
              aiIsCorrect = true
              aiFeedback = 'صح — الإجابة النهائية مطابقة بالقيمة'
              textGraded = true
            } else {
              // AI text grading (يفهم الإجابة النهائية مش بالحرف)
              try {
                var eTextGrade = await gradeTextAnswer({
                  question: qText,
                  studentAnswer: studentText,
                  modelAnswer: modelAnswer,
                  acceptedAnswers: acceptedAnswers,
                  maxPoints: pts,
                })
                if (eTextGrade) {
                  aiExtracted = studentText
                  aiIsCorrect = eTextGrade.isCorrect === true
                  aiFeedback = eTextGrade.feedback || (eTextGrade.isCorrect ? 'صح' : 'غلط')
                  textGraded = true
                }
              } catch (e) {
                console.error('[Exam Results] AI text grading error:', e)
                aiFeedback = 'فشل التصحيح'
              }
            }
          }
        }

        // IMPORTANT: If AI grading didn't run (needsGrading), keep needsGrading=true
        // Otherwise mark as graded (imageGraded || textGraded)
        var isGraded = imageGraded || textGraded

        allQuestions.push({
          type: 'writing',
          question: qText,
          studentAnswer: studentText,
          correctAnswer: modelAnswer,
          isCorrect: isGraded ? aiIsCorrect : false,
          aiExtractedAnswer: aiExtracted,
          aiIsCorrect: aiIsCorrect,
          aiFeedback: aiFeedback,
          imageGraded: imageGraded,
          textGraded: textGraded,
          needsGrading: needsGrading,
          isGraded: isGraded,
        })

        writingAnswers.push({
          question: qText,
          answer: typeof studentText === 'string' ? studentText : String(studentText || ''),
          points: pts,
          modelAnswer: modelAnswer,
          acceptedAnswers: acceptedAnswers,
          needsGrading: needsGrading,
          aiExtractedAnswer: aiExtracted,
          aiIsCorrect: aiIsCorrect,
          aiFeedback: aiFeedback,
          imageGraded: imageGraded,
          textGraded: textGraded,
          isGraded: isGraded,
          isCorrect: isGraded ? aiIsCorrect : false,
          awardedPoints: isGraded ? (aiIsCorrect ? pts : 0) : 0,
        })
      }

      results.push({
        id: r.id,
        studentId: r.studentId,
        student: {
          name: student.name || 'طالب محذوف',
          phone: student.phone || '',
          grade: student.grade || examInfo.grade || '',
        },
        score: r.score || 0,
        maxScore: r.maxScore || 100,
        submittedAt: r.submittedAt,
        passed: (r.score || 0) >= passScore,
        allQuestions: allQuestions,
        wrongQuestions: wrongQuestions,
        writingAnswers: writingAnswers,
        hasWritingAnswers: writingAnswers.length > 0,
      })
    }

    // Get students who haven't taken the exam yet
    var notTaken: any[] = []
    try {
      var submittedIds = rawResults.map(function(r) { return r.studentId })
      if (submittedIds.length > 0) {
        var notPlaceholders = submittedIds.map(function() { return '?' }).join(',')
        notTaken = await db.$queryRawUnsafe(
          'SELECT id, name, phone FROM Student WHERE grade = ? AND status = ? AND id NOT IN (' + notPlaceholders + ')',
          examInfo.grade, 'approved', ...submittedIds
        ) || []
      } else {
        notTaken = await db.$queryRawUnsafe(
          'SELECT id, name, phone FROM Student WHERE grade = ? AND status = ?',
          examInfo.grade, 'approved'
        ) || []
      }
    } catch (e) {
      console.error('Not-taken lookup error:', e)
      // Fallback to Prisma
      try {
        var submittedSet = new Set(submittedIds)
        notTaken = await db.student.findMany({
          where: { grade: examInfo.grade, status: 'approved', id: { not: { in: Array.from(submittedSet) } } },
          select: { id: true, name: true, phone: true },
        })
      } catch (e2) { notTaken = [] }
    }

    // Calculate most missed questions (across all submissions)
    // (2026-و22) بالمفتاح نص السؤال — في النماذج كل طالب لسته مختلفة
    // فالترقيم الموضعي كان بيجمع أسئلة مختلفة تحت بعض
    var questionMisses: Record<string, { question: string; total: number; wrong: number }> = {}
    results.forEach(function(r: any) {
      r.allQuestions.forEach(function(aq: any) {
        var qKey = String(aq.question || '')
        if (!questionMisses[qKey]) {
          questionMisses[qKey] = { question: aq.question, total: 0, wrong: 0 }
        }
        if (aq.type === 'mcq') {
          questionMisses[qKey].total++
          if (!aq.isCorrect) questionMisses[qKey].wrong++
        }
      })
    })
    var mostMissed = Object.values(questionMisses)
      .filter(function(q) { return q.wrong > 0 })
      .sort(function(a, b) { return b.wrong - a.wrong })

    var avgScore = results.length > 0
      ? (results.reduce(function(sum, r) { return sum + r.score }, 0) / results.length).toFixed(1)
      : '—'

    // self-heal: النتايج اللي مالهاش درجات مخزنة بتتصحح في الخلفية بعد الرد
    // (التسليمات القديمة قبل ما التصحيح الفوري يبقى موجود)
    try {
      var healIds2: string[] = []
      var examHasWritingQs = questionsHaveWriting(examInfo.questions)
      for (var hi2 = 0; hi2 < rawResults.length; hi2++) {
        if (examHasWritingQs && gradesLookPending(rawResults[hi2].writingGrades)) healIds2.push(rawResults[hi2].id)
      }
      if (healIds2.length > 0) {
        var healBatch = healIds2.slice(0, 10)
        after(async function() {
          for (var hi3 = 0; hi3 < healBatch.length; hi3++) {
            try { await regradeExamResult(healBatch[hi3]) } catch (e) {}
          }
        })
      }
    } catch (e) {}

    return NextResponse.json({
      results,
      notTaken,
      mostMissed,
      avgScore,
      examInfo: {
        id: examInfo.id,
        title: examInfo.title,
        grade: examInfo.grade,
        passScore: passScore,
        totalMcq: mcqQs.length,
        totalWriting: writingQs.length,
      },
    })
  } catch (error) {
    console.error('Exam results error:', error)
    return NextResponse.json({ error: 'Failed to fetch results' }, { status: 500 })
  }
}
