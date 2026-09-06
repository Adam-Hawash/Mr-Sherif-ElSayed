// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds } from '@/lib/ai-image-grader'

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
      var rows = await db.$queryRawUnsafe(
        'SELECT id, examId, studentId, score, maxScore FROM ExamResult WHERE studentId = ?',
        studentId
      )
      return NextResponse.json({ results: rows || [] })
    } catch (error) {
      console.error('Student exam results error:', error)
      return NextResponse.json({ results: [] })
    }
  }

  // Student pre-submit check: specific exam + student (raw SQL)
  if (studentId && examId) {
    try {
      var rows = await db.$queryRawUnsafe(
        'SELECT id FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1',
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

    // Get exam info first (title, questions, grade, passScore)
    var examInfo: any = null
    try {
      var examRows = await db.$queryRawUnsafe(
        'SELECT id, title, grade, questions, passScore FROM Exam WHERE id = ? LIMIT 1',
        examId
      )
      examInfo = examRows && examRows.length > 0 ? examRows[0] : null
    } catch (e) {
      console.error('Exam lookup error:', e)
      try {
        examInfo = await db.exam.findUnique({ where: { id: examId }, select: { id: true, title: true, grade: true, questions: true, passScore: true } })
      } catch (e2) {}
    }

    if (!examInfo) {
      return NextResponse.json({ error: 'Exam not found' }, { status: 404 })
    }

    // Get all results for this exam using RAW SQL with answers
    var rawResults: any[] = []
    try {
      rawResults = await db.$queryRawUnsafe(
        'SELECT id, examId, studentId, score, maxScore, submittedAt, answers FROM ExamResult WHERE examId = ? ORDER BY submittedAt DESC',
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
        rawResults = prismaResults.map((r: any) => ({ ...r, answers: '' }))
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

    // Parse exam questions
    var examQuestions: any[] = []
    try {
      if (examInfo.questions) {
        var raw = typeof examInfo.questions === 'string' ? JSON.parse(examInfo.questions) : examInfo.questions
        if (Array.isArray(raw)) examQuestions = raw
      }
    } catch (e) {}

    // Separate MCQ from writing for re-grading + display
    // Track ORIGINAL index for each question (key for student answers lookup)
    var mcqQs: any[] = []        // [{q: ..., origIdx: 0}, ...]
    var writingQs: any[] = []    // [{q: ..., origIdx: 1}, ...]
    examQuestions.forEach(function(q: any, idx: number) {
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function(o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
      if (isWriting) writingQs.push({ q: q, origIdx: idx })
      else mcqQs.push({ q: q, origIdx: idx })
    })

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

      var allQuestions: any[] = []
      var wrongQuestions: any[] = []
      var writingAnswers: any[] = []

      // MCQ all questions - iterate by ORIGINAL index
      mcqQs.forEach(function(item, qi) {
        var q = item.q
        var origIdx = item.origIdx
        var qText = q.question || q.q || ''
        var opts = Array.isArray(q.options) ? q.options : []
        var correctIdx = typeof q.correct === 'number' ? q.correct : 0
        if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0

        var ans = lookupAnswer(studentAns, origIdx)

        var isCorrect = ans !== undefined && ans !== null && Number(ans) === correctIdx
        var studentAnswerText = (typeof ans === 'number' && opts[ans] && opts[ans] !== 'N/A')
          ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
          : 'Not answered'
        var correctAnswerText = (opts[correctIdx] && opts[correctIdx] !== 'N/A')
          ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
          : (q.modelAnswer || 'No correct answer stored')

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

      // Writing all questions - iterate by ORIGINAL index
      for (var wi = 0; wi < writingQs.length; wi++) {
        var wItem = writingQs[wi]
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

        // AI grading - image OR text
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
          // No model answer — admin will grade manually
          needsGrading = true
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
            // TEXT GRADING - quick match first
            var cleanStud = (studentText || '').toLowerCase().replace(/\s+/g, ' ').trim()
            var cleanMod = (modelAnswer || '').toLowerCase().replace(/\s+/g, ' ').trim()
            var quickMatch = false

            if (acceptedAnswers && acceptedAnswers.length > 0) {
              for (var eai = 0; eai < acceptedAnswers.length; eai++) {
                var eAcc = (acceptedAnswers[eai] || '').trim().toLowerCase().replace(/\s+/g, ' ')
                if (eAcc && (cleanStud === eAcc || cleanStud.includes(eAcc) || eAcc.includes(cleanStud))) {
                  quickMatch = true
                  break
                }
              }
            }

            if (quickMatch) {
              aiExtracted = studentText
              aiIsCorrect = true
              aiFeedback = 'صح (تطابق نصي)'
              textGraded = true
            } else if (cleanMod) {
              // Match final answer
              var eMParts = cleanMod.split('=')
              var eSParts = cleanStud.split('=')
              var eMFinal = (eMParts[eMParts.length - 1] || '').trim()
              var eSFinal = (eSParts[eSParts.length - 1] || '').trim()
              if (eMFinal && eSFinal && (eMFinal === eSFinal || eMFinal.includes(eSFinal) || eSFinal.includes(eMFinal))) {
                aiExtracted = studentText
                aiIsCorrect = true
                aiFeedback = 'صح (الإجابة النهائية مطابقة)'
                textGraded = true
              } else {
                // AI text grading
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
    var questionMisses: Record<number, { question: string; total: number; wrong: number }> = {}
    results.forEach(function(r: any) {
      r.allQuestions.forEach(function(aq: any, idx: number) {
        if (!questionMisses[idx]) {
          questionMisses[idx] = { question: aq.question, total: 0, wrong: 0 }
        }
        if (aq.type === 'mcq') {
          questionMisses[idx].total++
          if (!aq.isCorrect) questionMisses[idx].wrong++
        }
      })
    })
    var mostMissed = Object.values(questionMisses)
      .filter(function(q) { return q.wrong > 0 })
      .sort(function(a, b) { return b.wrong - a.wrong })

    var avgScore = results.length > 0
      ? (results.reduce(function(sum, r) { return sum + r.score }, 0) / results.length).toFixed(1)
      : '—'

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
