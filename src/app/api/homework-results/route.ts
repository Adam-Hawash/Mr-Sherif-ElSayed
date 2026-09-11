// @ts-nocheck
import { NextRequest, NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
// (2026-و16) self-heal خلفي: تسليمات الواجب القديمة الناقصة التصحيح بتتصحح
// تلقائيًا بنفس مسار الذكاء الاصطناعي الحاسم — البادج مش بيفضل معلق للأبد
import { regradeHomeworkResult, gradesLookPending, questionsHaveWriting } from '@/lib/regrade-core'

/* (2026-و22) قراءة إجابة الطالب **بالفهرس الأصلي** — نفس helper التسليم */
function lookupByOrigIdx(ans: any, idx: number): any {
  try {
    if (Array.isArray(ans)) return ans[idx]
    if (ans !== null && typeof ans === 'object') {
      return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
    }
  } catch (e) {}
  return undefined
}

// GET /api/homework-results?studentId=xxx - Student: own results (basic info)
// GET /api/homework-results?homeworkId=xxx - Admin: all results for a homework with per-student details
//
// NOTE: this view used to RE-RUN the AI grader on every photo answer at every
// page load — slow, expensive, and the verdicts CHANGED between visits
// (the "تصحيح عشوائي" complaint). Now it reads the verdicts STORED at submit
// time (HomeworkResult.writingResults) — instant, stable, one source of truth.
export async function GET(request: NextRequest) {
  try {
    var url = new URL(request.url)
    var studentId = url.searchParams.get('studentId')
    var homeworkId = url.searchParams.get('homeworkId')

    // Admin mode: results for a specific homework with full per-student answer review
    if (homeworkId) {
      // Ensure HomeworkResult table has answers + writingResults columns
      try {
        await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS HomeworkResult (id TEXT PRIMARY KEY, homeworkId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT "", submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)')
      } catch (e) {}
      try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN answers TEXT DEFAULT ""') } catch (e) {}
      try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP') } catch (e) {}
      try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT ""') } catch (e) {}

      // Get homework info first (title, questions)
      var hwInfo: any = null
      try {
        var hwRows = await db.$queryRawUnsafe(
          'SELECT id, title, grade, questions FROM Homework WHERE id = ? LIMIT 1',
          homeworkId
        )
        hwInfo = hwRows && hwRows.length > 0 ? hwRows[0] : null
      } catch (e) {
        console.error('Homework lookup error:', e)
        try {
          hwInfo = await db.homework.findUnique({ where: { id: homeworkId }, select: { id: true, title: true, grade: true, questions: true } })
        } catch (e2) {}
      }

      if (!hwInfo) {
        return NextResponse.json({ error: 'Homework not found' }, { status: 404 })
      }

      // Get all results for this homework using RAW SQL with answers + stored writing verdicts
      var rawResults: any[] = []
      try {
        rawResults = await db.$queryRawUnsafe(
          'SELECT id, homeworkId, studentId, score, maxScore, submittedAt, answers, writingResults FROM HomeworkResult WHERE homeworkId = ? ORDER BY submittedAt DESC',
          homeworkId
        ) || []
      } catch (e) {
        console.error('Homework results fetch error:', e)
        try {
          rawResults = await db.$queryRawUnsafe(
            'SELECT id, homeworkId, studentId, score, maxScore, submittedAt, answers FROM HomeworkResult WHERE homeworkId = ? ORDER BY submittedAt DESC',
            homeworkId
          ) || []
        } catch (e3) {
          try {
            var prismaResults = await db.homeworkResult.findMany({
              where: { homeworkId },
              orderBy: { submittedAt: 'desc' },
            })
            rawResults = prismaResults.map((r: any) => ({ ...r, answers: '' }))
          } catch (e2) { rawResults = [] }
        }
      }

      // (2026-و16) self-heal: تسليمات قديمة قبل التصحيح الفوري (writingResults
      // فاضية أو فيها pending/needsGrading) ← إعادة تصحيح خلفية بنفس مسار
      // regrade-core الحاسم بعد ما الرد يتبعت — البادج بيختفي بعد تحديث بسيط
      try {
        if (hwInfo && questionsHaveWriting(hwInfo.questions)) {
          var healIds: string[] = []
          for (var hi = 0; hi < (rawResults || []).length; hi++) {
            if (healIds.length < 10 && gradesLookPending(rawResults[hi].writingResults)) healIds.push(rawResults[hi].id)
          }
          if (healIds.length > 0) {
            var healBatch = healIds.slice(0, 10)
            after(async function () {
              for (var hj = 0; hj < healBatch.length; hj++) {
                try { await regradeHomeworkResult(healBatch[hj]) } catch (e) {}
              }
            })
          }
        }
      } catch (e) {}

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

      // Parse homework questions
      var hwQuestions: any[] = []
      try {
        if (hwInfo.questions) {
          var raw = typeof hwInfo.questions === 'string' ? JSON.parse(hwInfo.questions) : hwInfo.questions
          if (Array.isArray(raw)) hwQuestions = raw
        }
      } catch (e) {}

      // Separate MCQ from writing — **بالفهرس الأصلي** (2026-و22)
      var mcqQs: any[] = []
      var writingQs: any[] = []
      hwQuestions.forEach(function(q: any, qOrigIdx: number) {
        var isWriting = q.type === 'writing' || q.type === 'essay'
        if (!isWriting && Array.isArray(q.options)) {
          var allNA = q.options.length > 0 && q.options.every(function(o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
          if (allNA) isWriting = true
        }
        if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
        if (isWriting) writingQs.push({ q: q, origIdx: qOrigIdx })
        else mcqQs.push({ q: q, origIdx: qOrigIdx })
      })

      // Build per-student results with all questions review
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

        // Stored AI verdicts (written by /api/homework/submit background grading)
        var storedWriting: any[] = []
        try {
          if (r.writingResults) {
            var parsedStored = typeof r.writingResults === 'string' ? JSON.parse(r.writingResults) : r.writingResults
            if (Array.isArray(parsedStored)) storedWriting = parsedStored
          }
        } catch (e) {}

        // MCQ all questions — بالفهرس الأصلي (2026-و22) مش بمكان السؤال
        mcqQs.forEach(function(item: any) {
          var q = item.q
          var qText = q.question || q.q || ''
          var opts = Array.isArray(q.options) ? q.options : []
          var correctIdx = typeof q.correct === 'number' ? q.correct : 0
          if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0

          var ans = lookupByOrigIdx(studentAns, item.origIdx)

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

        // Writing all questions — بالفهرس الأصلي (2026-و22) — من STORED verdicts فقط
        for (var wi = 0; wi < writingQs.length; wi++) {
          var wItem = writingQs[wi]
          var wq = wItem.q
          var wOrigIdx = wItem.origIdx
          var qText = wq.question || wq.q || ''
          var studentText = ''
          try {
            var lookedUp = lookupByOrigIdx(studentAns, wOrigIdx)
            studentText = lookedUp !== undefined && lookedUp !== null ? String(lookedUp) : ''
          } catch (e) {}
          studentText = typeof studentText === 'string' ? studentText : String(studentText || '')

          var modelAnswer = wq.modelAnswer || wq.answer || ''
          var acceptedAnswers = Array.isArray(wq.acceptedAnswers) ? wq.acceptedAnswers : []
          var pts = (typeof wq.points === 'number' && wq.points > 0) ? wq.points : 5

          // Stored verdict for this writing question — **بالفهرس الأصلي** (2026-و22)
          // → نص السؤال → الموضع (للتسليمات القديمة بس)
          var stored = storedWriting.find(function(sw: any) { return sw && sw.origIdx === wOrigIdx })
            || storedWriting.find(function(sw: any) { return sw && (sw.question || '') === qText })
            || storedWriting[wi]
            || null

          var isGradedNow = !!stored && stored.gradingStatus !== 'pending'
          var aiExtracted = stored ? (stored.aiExtractedAnswer || '') : ''
          var aiIsCorrect = stored ? (stored.aiIsCorrect === true || stored.isCorrect === true) : false
          var aiFeedback = stored ? (stored.aiFeedback || stored.feedback || '') : ''
          var awardedNow = stored ? (stored.awardedPoints || 0) : 0

          allQuestions.push({
            type: 'writing',
            question: qText,
            studentAnswer: studentText,
            correctAnswer: modelAnswer,
            isCorrect: isGradedNow ? aiIsCorrect : false,
            aiExtractedAnswer: aiExtracted,
            aiIsCorrect: aiIsCorrect,
            aiFeedback: aiFeedback,
            imageGraded: isGradedNow && !!aiExtracted,
          })

          writingAnswers.push({
            question: qText,
            answer: studentText,
            points: pts,
            modelAnswer: modelAnswer,
            acceptedAnswers: acceptedAnswers,
            needsGrading: !isGradedNow,
            gradingStatus: stored ? (stored.gradingStatus || (isGradedNow ? 'graded' : 'pending')) : 'legacy',
            aiExtractedAnswer: aiExtracted,
            aiIsCorrect: aiIsCorrect,
            aiFeedback: aiFeedback,
            imageGraded: isGradedNow && !!aiExtracted,
            isCorrect: isGradedNow ? aiIsCorrect : false,
            awardedPoints: isGradedNow ? awardedNow : 0,
          })
        }

        results.push({
          id: r.id,
          studentId: r.studentId,
          student: {
            name: student.name || 'طالب محذوف',
            phone: student.phone || '',
            grade: student.grade || hwInfo.grade || '',
          },
          score: r.score || 0,
          maxScore: r.maxScore || 100,
          submittedAt: r.submittedAt,
          passed: (r.score || 0) >= ((r.maxScore || 100) / 2),
          allQuestions: allQuestions,
          wrongQuestions: wrongQuestions,
          writingAnswers: writingAnswers,
          hasWritingAnswers: writingAnswers.length > 0,
        })
      }

      // Get students who haven't submitted the homework yet
      var notSubmitted: any[] = []
      try {
        var submittedIds = rawResults.map(function(r) { return r.studentId })
        if (submittedIds.length > 0) {
          var notPlaceholders = submittedIds.map(function() { return '?' }).join(',')
          notSubmitted = await db.$queryRawUnsafe(
            'SELECT id, name, phone FROM Student WHERE grade = ? AND status = ? AND id NOT IN (' + notPlaceholders + ')',
            hwInfo.grade, 'approved', ...submittedIds
          ) || []
        } else {
          notSubmitted = await db.$queryRawUnsafe(
            'SELECT id, name, phone FROM Student WHERE grade = ? AND status = ?',
            hwInfo.grade, 'approved'
          ) || []
        }
      } catch (e) {
        console.error('Not-submitted lookup error:', e)
        try {
          var submittedSet = new Set(submittedIds)
          notSubmitted = await db.student.findMany({
            where: { grade: hwInfo.grade, status: 'approved', id: { not: { in: Array.from(submittedSet) } } },
            select: { id: true, name: true, phone: true },
          })
        } catch (e2) { notSubmitted = [] }
      }

      var avgScore = results.length > 0
        ? (results.reduce(function(sum, r) { return sum + r.score }, 0) / results.length).toFixed(1)
        : '—'

      return NextResponse.json({
        results,
        notSubmitted,
        avgScore,
        hwInfo: {
          id: hwInfo.id,
          title: hwInfo.title,
          grade: hwInfo.grade,
          totalMcq: mcqQs.length,
          totalWriting: writingQs.length,
        },
      })
    }

    // Student mode: own results
    if (!studentId) return NextResponse.json({ results: [] })

    // Use raw SQL to avoid Prisma RETURN column mismatch
    var rows = await db.$queryRawUnsafe(
      'SELECT id, homeworkId, studentId, score, maxScore FROM HomeworkResult WHERE studentId = ?',
      studentId
    )

    return NextResponse.json({ results: rows || [] })
  } catch (error) {
    console.error('Homework results error:', error)
    return NextResponse.json({ results: [] })
  }
}
