// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

/* Parse a JSON column that may be a string or already-parsed */
function parseJsonCol(col: any): any {
  try {
    if (!col) return null
    if (typeof col === 'string') return JSON.parse(col)
    return col
  } catch (e) { return null }
}

/* Apply manual admin overrides ({ "<origIdx>": true|false }) to a review item */
function applyOverride(item: any, overrides: any): void {
  if (!overrides || typeof overrides !== 'object') return
  var key = String(item.origIdx)
  if (overrides[key] === true || overrides[key] === false) {
    item.isCorrect = overrides[key] === true
    item.overridden = true
    if (item.type === 'writing') {
      item.aiIsCorrect = overrides[key] === true
      item.needsGrading = false
      item.awardedPoints = overrides[key] === true ? (item.points || item.aiAwardedPoints || 0) : 0
    }
  }
}

// Ensure tables exist before querying
async function ensureTables() {
  try {
    // HomeworkResult: create if not exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS HomeworkResult (id TEXT PRIMARY KEY, homeworkId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT '', submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    } catch (e) {}

    // Check HomeworkResult schema - rebuild if submittedAt is missing
    var hwNeedsRebuild = false
    try {
      var hwCols = await db.$queryRawUnsafe('PRAGMA table_info(HomeworkResult)')
      var hwHasSubmittedAt = (hwCols || []).some(function(c) { return c.name === 'submittedAt' })
      if (!hwHasSubmittedAt) {
        hwNeedsRebuild = true
      }
    } catch (e) {}

    if (hwNeedsRebuild) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE HomeworkResult RENAME TO HomeworkResult_old')
        await db.$executeRawUnsafe(`CREATE TABLE HomeworkResult (id TEXT PRIMARY KEY, homeworkId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT '', submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
        try {
          await db.$executeRawUnsafe(`INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, answers, submittedAt) SELECT id, homeworkId, studentId, score, maxScore, CASE WHEN answers IS NULL OR answers = '' THEN '' ELSE answers END, CURRENT_TIMESTAMP FROM HomeworkResult_old`)
        } catch (copyErr) {
          try {
            await db.$executeRawUnsafe(`INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, answers, submittedAt) SELECT id, homeworkId, studentId, score, maxScore, '', CURRENT_TIMESTAMP FROM HomeworkResult_old`)
          } catch (copyErr2) {
            console.error('Copy old HomeworkResult data error:', copyErr2)
          }
        }
        await db.$executeRawUnsafe('DROP TABLE HomeworkResult_old')
      } catch (rebuildErr) {
        console.error('Rebuild HomeworkResult error:', rebuildErr)
        try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult_old RENAME TO HomeworkResult') } catch (e) {}
      }
    }

    // ExamResult: create if not exists
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS ExamResult (id TEXT PRIMARY KEY, examId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT '', submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
    } catch (e) {}

    // Check ExamResult schema - rebuild if submittedAt is missing
    var exNeedsRebuild = false
    try {
      var exCols = await db.$queryRawUnsafe('PRAGMA table_info(ExamResult)')
      var exHasSubmittedAt = (exCols || []).some(function(c) { return c.name === 'submittedAt' })
      if (!exHasSubmittedAt) {
        exNeedsRebuild = true
      }
    } catch (e) {}

    if (exNeedsRebuild) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE ExamResult RENAME TO ExamResult_old')
        await db.$executeRawUnsafe(`CREATE TABLE ExamResult (id TEXT PRIMARY KEY, examId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, answers TEXT DEFAULT '', submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP)`)
        try {
          await db.$executeRawUnsafe(`INSERT INTO ExamResult (id, examId, studentId, score, maxScore, answers, submittedAt) SELECT id, examId, studentId, score, maxScore, CASE WHEN answers IS NULL OR answers = '' THEN '' ELSE answers END, CURRENT_TIMESTAMP FROM ExamResult_old`)
        } catch (copyErr) {
          try {
            await db.$executeRawUnsafe(`INSERT INTO ExamResult (id, examId, studentId, score, maxScore, answers, submittedAt) SELECT id, examId, studentId, score, maxScore, '', CURRENT_TIMESTAMP FROM ExamResult_old`)
          } catch (copyErr2) {
            console.error('Copy old ExamResult data error:', copyErr2)
          }
        }
        await db.$executeRawUnsafe('DROP TABLE ExamResult_old')
      } catch (rebuildErr) {
        console.error('Rebuild ExamResult error:', rebuildErr)
        try { await db.$executeRawUnsafe('ALTER TABLE ExamResult_old RENAME TO ExamResult') } catch (e) {}
      }
    }
  } catch (e) {
    console.error('Ensure tables error:', e)
  }
}

// GET /api/students/[id]/progress - Get student's video progress + exam results + homework results with wrong questions
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    // Ensure tables exist
    await ensureTables()

    // Use raw SQL for student lookup (Prisma schema out of sync - isPaidAccess column missing in DB)
    var student: any = null
    try {
      var studentRows = await db.$queryRawUnsafe('SELECT id, name, grade FROM Student WHERE id = ? LIMIT 1', id)
      student = studentRows && studentRows.length > 0 ? studentRows[0] : null
    } catch (e) {
      console.error('Student lookup raw SQL error, trying Prisma:', e)
      try { student = await db.student.findUnique({ where: { id }, select: { id: true, name: true, grade: true } }) } catch(e2) {}
    }
    if (!student) return NextResponse.json({ error: 'Student not found' }, { status: 404 })

    // Get video progress using RAW SQL (avoid Prisma schema mismatches)
    var videoProgress: any[] = []
    try {
      videoProgress = await db.$queryRawUnsafe(
        'SELECT * FROM VideoProgress WHERE studentId = ? ORDER BY lastWatchedAt DESC',
        id
      ) || []
    } catch (e) {
      console.error('VideoProgress raw SQL error, trying Prisma:', e)
      try {
        videoProgress = await db.videoProgress.findMany({ where: { studentId: id }, orderBy: { lastWatchedAt: 'desc' } })
      } catch(e2) { videoProgress = [] }
    }

    const videoIds = [...new Set(videoProgress.map((vp: any) => vp.videoId))]
    var videoMap: any = {}
    try {
      if (videoIds.length > 0) {
        var placeholders = videoIds.map(function() { return '?' }).join(',')
        var videos = await db.$queryRawUnsafe(
          'SELECT id, title, grade FROM Video WHERE id IN (' + placeholders + ')',
          ...videoIds
        ) || []
        videoMap = Object.fromEntries((videos as any[]).map((v: any) => [v.id, v]))
      }
    } catch (e) {
      console.error('Video lookup error:', e)
    }

    const videoProgressEnriched = videoProgress.map((vp: any) => ({
      id: vp.id,
      studentId: vp.studentId,
      videoId: vp.videoId,
      watchedSeconds: vp.watchedSeconds || 0,
      totalSeconds: vp.totalSeconds || 0,
      completed: !!vp.completed,
      lastWatchedAt: vp.lastWatchedAt,
      percent: vp.totalSeconds > 0 ? Math.min(100, Math.round((vp.watchedSeconds / vp.totalSeconds) * 100)) : 0,
      videoTitle: videoMap[vp.videoId]?.title || 'فيديو محذوف',
      videoGrade: videoMap[vp.videoId]?.grade || '',
    }))

    // Columns may not exist on older DBs — add before querying (guarded)
    try { await db.$executeRawUnsafe("ALTER TABLE ExamResult ADD COLUMN writingResults TEXT DEFAULT ''") } catch (e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE ExamResult ADD COLUMN gradeOverrides TEXT DEFAULT ''") } catch (e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE HomeworkResult ADD COLUMN gradeOverrides TEXT DEFAULT ''") } catch (e) {}

    // Get exam results with wrong questions using RAW SQL
    var examResultsEnriched: any[] = []
    try {
      var examRows = await db.$queryRawUnsafe(
        'SELECT er.id, er.examId, er.score, er.maxScore, er.submittedAt, er.answers, er.writingResults, er.gradeOverrides, e.title, e.questions, e.passScore FROM ExamResult er LEFT JOIN Exam e ON er.examId = e.id WHERE er.studentId = ? ORDER BY er.submittedAt DESC',
        id
      )

      for (var i = 0; i < (examRows || []).length; i++) {
        var row = examRows[i]
        var wrongQuestions: any[] = []

        // Re-grade to find wrong questions (only if answers saved)
        try {
          var mcq = []
          if (row.questions) {
            var raw = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions
            if (Array.isArray(raw)) mcq = raw
          }
          var studentAnswers: any = {}
          if (row.answers) {
            studentAnswers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
          }

          // Helper for lookup by origIdx
          function lookupExamAnswer(ans: any, idx: number): any {
            try {
              if (Array.isArray(ans)) return ans[idx]
              if (ans !== null && typeof ans === 'object') {
                return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
              }
            } catch (e) {}
            return undefined
          }

          if (mcq.length > 0 && (Array.isArray(studentAnswers) ? studentAnswers.length > 0 : Object.keys(studentAnswers).length > 0)) {
            mcq.forEach(function(q, qi) {
              var qText = q.question || q.q || ''
              var opts = Array.isArray(q.options) ? q.options : []
              var correctIdx = typeof q.correct === 'number' ? q.correct : 0
              if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0

              var ans = lookupExamAnswer(studentAnswers, qi)

              if (ans === undefined || ans === null || Number(ans) !== correctIdx) {
                wrongQuestions.push({
                  question: qText,
                  studentAnswer: (typeof ans === 'number' && opts[ans])
                    ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
                    : 'لم يتم الإجابة',
                  correctAnswer: opts[correctIdx]
                    ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
                    : '',
                })
              }
            })
          }
        } catch(gradeErr) {
          console.error('Re-grade error for exam', row.examId, ':', gradeErr)
        }

        var passScore = row.passScore || 50
        // Build all questions review (correct + wrong)
        var allExamQuestions: any[] = []
        try {
          var mcqAll: any[] = []
          var writingAllExam: any[] = []
          if (row.questions) {
            var rawAll = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions
            if (Array.isArray(rawAll)) {
              rawAll.forEach(function(q, idx) {
                var isW = q.type === 'writing' || q.type === 'essay'
                if (!isW && Array.isArray(q.options)) {
                  var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
                  if (allNA) isW = true
                }
                if (!isW && (!q.options || q.options.length === 0)) isW = true
                if (isW) writingAllExam.push({ q: q, origIdx: idx })
                else mcqAll.push({ q: q, origIdx: idx })
              })
            }
          }
          var studentAnsAll: any = {}
          if (row.answers) {
            studentAnsAll = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
          }
          // Helper to lookup by origIdx
          function lookupExamAns(ans: any, idx: number): any {
            try {
              if (Array.isArray(ans)) return ans[idx]
              if (ans !== null && typeof ans === 'object') {
                return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
              }
            } catch (e) {}
            return undefined
          }
          var storedExamVerdicts: any[] = []
          try {
            var parsedExam = parseJsonCol(row.writingResults)
            if (Array.isArray(parsedExam)) storedExamVerdicts = parsedExam
          } catch (e) {}
          var examOverrides: any = parseJsonCol(row.gradeOverrides)

          // MCQ all questions - lookup by origIdx
          mcqAll.forEach(function(item) {
            var q = item.q
            var origIdx = item.origIdx
            var qText = q.question || q.q || ''
            var opts = Array.isArray(q.options) ? q.options : []
            var realOpts = opts.filter(function(o) { return o && o !== 'N/A' && o !== 'لا يوجد' && String(o).trim() !== '' })
            var correctIdx = typeof q.correct === 'number' ? q.correct : 0
            if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
            var ans = lookupExamAns(studentAnsAll, origIdx)
            var isCorrect = ans !== undefined && ans !== null && Number(ans) === correctIdx
            var studentAnswerText = (typeof ans === 'number' && opts[ans] && opts[ans] !== 'N/A')
              ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
              : 'Not answered'
            var correctAnswerText = opts[correctIdx] && opts[correctIdx] !== 'N/A'
              ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
              : (q.modelAnswer || 'No correct answer stored')
            var mcqItem: any = {
              type: 'mcq',
              origIdx: origIdx,
              points: (typeof q.points === 'number' && q.points > 0) ? q.points : 1,
              question: qText,
              studentAnswer: studentAnswerText,
              correctAnswer: correctAnswerText,
              isCorrect: isCorrect,
            }
            applyOverride(mcqItem, examOverrides)
            allExamQuestions.push(mcqItem)
          })
          // Writing all questions - lookup by origIdx
          // Stored exam writing verdicts (written by /api/exams/regrade) —
          // NEVER run live AI grading inside this view route: it blocked the
          // response >30s for students with photo answers (تعذر تحميل البيانات).
          for (var ewi = 0; ewi < writingAllExam.length; ewi++) {
            var eItem = writingAllExam[ewi]
            var ewq = eItem.q
            var eOrigIdx = eItem.origIdx
            var eqText = ewq.question || ewq.q || ''
            var estudentText = ''
            var lookedUp = lookupExamAns(studentAnsAll, eOrigIdx)
            estudentText = lookedUp !== undefined && lookedUp !== null ? String(lookedUp) : ''
            estudentText = typeof estudentText === 'string' ? estudentText : String(estudentText || '')

            var eaiExtracted = ''
            var eaiIsCorrect = false
            var eaiFeedback = ''
            var eImageGraded = false
            var eawarded = 0
            var epoints = (typeof ewq.points === 'number' && ewq.points > 0) ? ewq.points : 5
            var eneedsGrading = false

            var storedExam = storedExamVerdicts.find(function (sv: any) { return sv && (sv.origIdx === eOrigIdx || (sv.question || '') === eqText) }) || storedExamVerdicts[ewi] || null
            if (storedExam) {
              eaiExtracted = storedExam.aiExtractedAnswer || storedExam.extractedAnswer || ''
              eaiIsCorrect = storedExam.aiIsCorrect === true || storedExam.isCorrect === true
              eaiFeedback = storedExam.aiFeedback || storedExam.feedback || ''
              eawarded = storedExam.awardedPoints || 0
              eImageGraded = eaiExtracted !== '' || storedExam.gradingStatus === 'graded'
              eneedsGrading = storedExam.needsGrading === true || storedExam.gradingStatus === 'pending'
              if (eneedsGrading) eaiFeedback = eaiFeedback || 'جاري التصحيح بالذكاء الاصطناعي...'
            } else if (estudentText && estudentText !== '[📷 صورة مرفقة]') {
              // submitted before verdicts were stored → teacher presses the
              // existing "إعادة تصحيح بالذكاء" button once and it's saved.
              eneedsGrading = true
              eaiFeedback = 'محتاج تصحيح — اضغط زر (إعادة تصحيح بالذكاء)'
            }

            var examQItem: any = {
              type: 'writing',
              origIdx: eOrigIdx,
              points: epoints,
              question: eqText,
              studentAnswer: estudentText,
              correctAnswer: ewq.modelAnswer || ewq.answer || 'No model answer',
              isCorrect: eaiIsCorrect,
              aiExtractedAnswer: eaiExtracted,
              aiIsCorrect: eaiIsCorrect,
              aiFeedback: eaiFeedback,
              awardedPoints: eawarded,
              imageGraded: eImageGraded,
              needsGrading: eneedsGrading,
            }
            applyOverride(examQItem, examOverrides)
            allExamQuestions.push(examQItem)
          }
        } catch(e) {}

        examResultsEnriched.push({
          id: row.id,
          examTitle: row.title || 'امتحان محذوف',
          examGrade: '',
          passScore: passScore,
          passed: (row.score || 0) >= passScore,
          score: row.score || 0,
          maxScore: row.maxScore || 100,
          submittedAt: row.submittedAt,
          wrongQuestions: wrongQuestions,
          allQuestions: allExamQuestions,
        })
      }
    } catch (e) {
      console.error('Exam results fetch error (progress):', e)
      // Fallback to Prisma
      try {
        const examResults = await db.examResult.findMany({ where: { studentId: id }, orderBy: { submittedAt: 'desc' } })
        const examIds = [...new Set(examResults.map(er => er.examId))]
        const exams = examIds.length > 0 ? await db.exam.findMany({ where: { id: { in: examIds } }, select: { id: true, title: true, grade: true, passScore: true } }) : []
        const examMap = Object.fromEntries(exams.map(e => [e.id, e]))
        examResultsEnriched = examResults.map(er => ({
          ...er, examTitle: examMap[er.examId]?.title || 'امتحان محذوف', examGrade: examMap[er.examId]?.grade || '',
          passScore: examMap[er.examId]?.passScore || 50, passed: er.score >= (examMap[er.examId]?.passScore || 50), wrongQuestions: [],
        }))
      } catch(e2) { examResultsEnriched = [] }
    }

    // If examResults is still empty, try simpler query without JOIN
    if (examResultsEnriched.length === 0) {
      try {
        var simpleExamRows = await db.$queryRawUnsafe(
          'SELECT id, examId, score, maxScore, submittedAt, answers FROM ExamResult WHERE studentId = ? ORDER BY submittedAt DESC',
          id
        )
        for (var sei = 0; sei < (simpleExamRows || []).length; sei++) {
          var ser = simpleExamRows[sei]
          var examTitle2 = 'امتحان'
          var passScore2 = 50
          try {
            var examInfo = await db.$queryRawUnsafe('SELECT title, passScore FROM Exam WHERE id = ? LIMIT 1', ser.examId)
            if (examInfo && examInfo.length > 0) {
              examTitle2 = examInfo[0].title || 'امتحان'
              passScore2 = examInfo[0].passScore || 50
            }
          } catch (e3) {}
          examResultsEnriched.push({
            id: ser.id,
            examTitle: examTitle2,
            examGrade: '',
            passScore: passScore2,
            passed: (ser.score || 0) >= passScore2,
            score: ser.score || 0,
            maxScore: ser.maxScore || 100,
            submittedAt: ser.submittedAt,
            wrongQuestions: [],
            allQuestions: [],
          })
        }
      } catch (e4) {
        console.error('Simple exam fetch error:', e4)
      }
    }

    // Get homework results using RAW SQL — include answers + stored writing verdicts
    var homeworkResults: any[] = []
    try {
      try { await db.$executeRawUnsafe("ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT ''") } catch (e) {}
      var hwRows = await db.$queryRawUnsafe(
        'SELECT hr.id, hr.homeworkId, hr.score, hr.maxScore, hr.submittedAt, hr.answers, hr.writingResults, hr.gradeOverrides, h.title, h.questions FROM HomeworkResult hr LEFT JOIN Homework h ON hr.homeworkId = h.id WHERE hr.studentId = ? ORDER BY hr.submittedAt DESC',
        id
      )

      for (var i = 0; i < (hwRows || []).length; i++) {
        var row = hwRows[i]
        var wrongQuestions: any[] = []
        var writingAnswers: any[] = []
        var allHwQuestions: any[] = []

        // Re-grade to find wrong questions + collect writing answers + build all questions
        try {
          var mcq = []
          var writingQs = []
          if (row.questions) {
            var raw = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions
            if (Array.isArray(raw)) {
              raw.forEach(function(q) {
                // Detect writing: type field, OR options empty/N/A
                var isWriting = q.type === 'writing' || q.type === 'essay'
                if (!isWriting && Array.isArray(q.options)) {
                  var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
                  if (allNA) isWriting = true
                }
                if (!isWriting && (!q.options || q.options.length === 0)) {
                  isWriting = true
                }
                if (isWriting) {
                  writingQs.push(q)
                } else {
                  mcq.push(q)
                }
              })
            }
          }
          var studentAnswers: any = {}
          if (row.answers) {
            studentAnswers = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
          }

          mcq.forEach(function(q, qi) {
            var qText = q.question || q.q || ''
            var opts = Array.isArray(q.options) ? q.options : []
            var correctIdx = typeof q.correct === 'number' ? q.correct : 0
            if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0

            var ans = undefined
            if (Array.isArray(studentAnswers)) {
              ans = studentAnswers[qi]
            } else if (studentAnswers !== null && typeof studentAnswers === 'object') {
              ans = studentAnswers[qi] !== undefined ? studentAnswers[qi] : studentAnswers[String(qi)]
            }

            if (ans === undefined || ans === null || Number(ans) !== correctIdx) {
              wrongQuestions.push({
                question: qText,
                studentAnswer: (typeof ans === 'number' && opts[ans])
                  ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
                  : 'لم يتم الإجابة',
                correctAnswer: opts[correctIdx]
                  ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
                  : '',
              })
            }
          })

          // Collect writing answers (offset by mcq length)
          writingQs.forEach(function(q, wi) {
            var qText = q.question || q.q || ''
            var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
            var studentText = ''
            var offset = mcq.length
            try {
              if (Array.isArray(studentAnswers)) {
                studentText = studentAnswers[offset + wi] || ''
              } else if (studentAnswers && typeof studentAnswers === 'object') {
                studentText = studentAnswers[offset + wi] || studentAnswers[String(offset + wi)] || ''
              }
            } catch (e) {}
            writingAnswers.push({
              question: qText,
              answer: typeof studentText === 'string' ? studentText : String(studentText || ''),
              points: pts,
              modelAnswer: q.modelAnswer || q.answer || '',
              acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
              needsGrading: true,
            })
          })
        } catch(gradeErr) {
          console.error('Re-grade error for hw', row.homeworkId, ':', gradeErr)
        }

        // ============= STORED VERDICTS (written once at submit time) =============
        // This view used to RE-RUN the AI grader on every open — slow AND the
        // verdicts changed between visits. Now: read the stored verdicts only.
        var storedWritingHw: any[] = []
        try {
          if (row.writingResults) {
            var parsedHW = typeof row.writingResults === 'string' ? JSON.parse(row.writingResults) : row.writingResults
            if (Array.isArray(parsedHW)) storedWritingHw = parsedHW
          }
        } catch (e) {}

        for (var wai = 0; wai < writingAnswers.length; wai++) {
          var waItem = writingAnswers[wai]
          var ansText = waItem.answer || ''

          // Skip if empty answer
          if (!ansText || ansText === '[📷 صورة مرفقة]') {
            writingAnswers[wai].needsGrading = false
            writingAnswers[wai].isCorrect = false
            writingAnswers[wai].awardedPoints = 0
            writingAnswers[wai].aiExtractedAnswer = ''
            writingAnswers[wai].aiIsCorrect = false
            writingAnswers[wai].aiFeedback = 'لم يجب الطالب'
            writingAnswers[wai].aiAwardedPoints = 0
            continue
          }

          var storedHw = storedWritingHw.find(function(sw) { return (sw.question || '') === waItem.question }) || storedWritingHw[wai] || null

          if (storedHw && storedHw.gradingStatus === 'pending') {
            // background grading still running
            writingAnswers[wai].needsGrading = true
            writingAnswers[wai].aiFeedback = 'جاري التصحيح بالذكاء الاصطناعي...'
            continue
          }

          if (storedHw) {
            writingAnswers[wai].aiExtractedAnswer = storedHw.aiExtractedAnswer || ''
            writingAnswers[wai].aiIsCorrect = storedHw.aiIsCorrect === true || storedHw.isCorrect === true
            writingAnswers[wai].aiFeedback = storedHw.aiFeedback || storedHw.feedback || ''
            writingAnswers[wai].aiAwardedPoints = storedHw.aiAwardedPoints || storedHw.awardedPoints || 0
            writingAnswers[wai].needsGrading = storedHw.needsGrading === true || storedHw.gradingStatus === 'manual'
            writingAnswers[wai].isCorrect = writingAnswers[wai].aiIsCorrect
            writingAnswers[wai].awardedPoints = storedHw.awardedPoints || 0
            continue
          }

          // LEGACY row (submitted before verdicts were stored): quick local
          // match only — deterministic, no live AI calls in a view.
          if (!waItem.modelAnswer) continue
          var cleanedStudent = (ansText || '').toLowerCase().replace(/\s+/g, ' ').trim()
          var cleanedModel = (waItem.modelAnswer || '').toLowerCase().replace(/\s+/g, ' ').trim()
          var quickMatched = false
          if (waItem.acceptedAnswers && waItem.acceptedAnswers.length > 0) {
            for (var qai = 0; qai < waItem.acceptedAnswers.length; qai++) {
              var accAns = (waItem.acceptedAnswers[qai] || '').trim().toLowerCase().replace(/\s+/g, ' ')
              if (accAns && (cleanedStudent === accAns || cleanedStudent.includes(accAns) || accAns.includes(cleanedStudent))) {
                quickMatched = true
                break
              }
            }
          }
          if (!quickMatched && cleanedModel) {
            var mParts = cleanedModel.split('=')
            var sParts = cleanedStudent.split('=')
            var mFinal = (mParts[mParts.length - 1] || '').trim()
            var sFinal = (sParts[sParts.length - 1] || '').trim()
            if (mFinal && sFinal && (mFinal === sFinal || mFinal.includes(sFinal) || sFinal.includes(mFinal))) quickMatched = true
          }
          if (quickMatched) {
            writingAnswers[wai].needsGrading = false
            writingAnswers[wai].isCorrect = true
            writingAnswers[wai].awardedPoints = waItem.points
            writingAnswers[wai].aiExtractedAnswer = ansText
            writingAnswers[wai].aiIsCorrect = true
            writingAnswers[wai].aiFeedback = 'صح (تطابق نصي)'
            writingAnswers[wai].aiAwardedPoints = waItem.points
          }
        }

        // Build all questions review (correct + wrong) for admin
        try {
          var mcqAll2 = []
          var writingAll2 = []
          var hwOverrides: any = parseJsonCol(row.gradeOverrides)
          if (row.questions) {
            var rawAll2 = typeof row.questions === 'string' ? JSON.parse(row.questions) : row.questions
            if (Array.isArray(rawAll2)) {
              rawAll2.forEach(function(q, qOrigIdx) {
                q.__origIdx = qOrigIdx
                var isW = q.type === 'writing' || q.type === 'essay'
                if (!isW && Array.isArray(q.options)) {
                  var allNA2 = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
                  if (allNA2) isW = true
                }
                if (!isW && (!q.options || q.options.length === 0)) isW = true
                if (isW) writingAll2.push(q)
                else mcqAll2.push(q)
              })
            }
          }
          var studentAnsAll2: any = {}
          if (row.answers) {
            studentAnsAll2 = typeof row.answers === 'string' ? JSON.parse(row.answers) : row.answers
          }
          // MCQ all questions
          mcqAll2.forEach(function(q, qi) {
            var qText = q.question || q.q || ''
            var opts = Array.isArray(q.options) ? q.options : []
            var correctIdx = typeof q.correct === 'number' ? q.correct : 0
            if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
            var ans = undefined
            if (Array.isArray(studentAnsAll2)) {
              ans = studentAnsAll2[qi]
            } else if (studentAnsAll2 !== null && typeof studentAnsAll2 === 'object') {
              ans = studentAnsAll2[qi] !== undefined ? studentAnsAll2[qi] : studentAnsAll2[String(qi)]
            }
            var isCorrect = ans !== undefined && ans !== null && Number(ans) === correctIdx
            var studentAnswerText = (typeof ans === 'number' && opts[ans])
              ? String.fromCharCode(65 + ans) + ') ' + opts[ans]
              : 'Not answered'
            var correctAnswerText = opts[correctIdx]
              ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
              : ''
            var hwMcqItem: any = {
              type: 'mcq',
              origIdx: q.__origIdx,
              points: (typeof q.points === 'number' && q.points > 0) ? q.points : 1,
              question: qText,
              studentAnswer: studentAnswerText,
              correctAnswer: correctAnswerText,
              isCorrect: isCorrect,
            }
            applyOverride(hwMcqItem, hwOverrides)
            allHwQuestions.push(hwMcqItem)
          })
          // Writing all questions
          writingAll2.forEach(function(q, wi) {
            var qText = q.question || q.q || ''
            var studentText = ''
            var offset = mcqAll2.length
            try {
              if (Array.isArray(studentAnsAll2)) {
                studentText = studentAnsAll2[offset + wi] || ''
              } else if (studentAnsAll2 && typeof studentAnsAll2 === 'object') {
                studentText = studentAnsAll2[offset + wi] || studentAnsAll2[String(offset + wi)] || ''
              }
            } catch (e) {}
            var hwWrItem: any = {
              type: 'writing',
              origIdx: q.__origIdx,
              points: (typeof q.points === 'number' && q.points > 0) ? q.points : 5,
              question: qText,
              studentAnswer: typeof studentText === 'string' ? studentText : String(studentText || ''),
              correctAnswer: q.modelAnswer || q.answer || '',
              isCorrect: false,
              // Augment with stored AI grading verdict (if any)
              aiExtractedAnswer: writingAnswers[wai] && writingAnswers[wai].aiExtractedAnswer,
              aiIsCorrect: writingAnswers[wai] && writingAnswers[wai].aiIsCorrect === true,
              aiFeedback: writingAnswers[wai] && writingAnswers[wai].aiFeedback,
              awardedPoints: writingAnswers[wai] && writingAnswers[wai].aiAwardedPoints || 0,
              imageGraded: !!(writingAnswers[wai] && writingAnswers[wai].aiExtractedAnswer !== undefined),
              needsGrading: !!(writingAnswers[wai] && writingAnswers[wai].needsGrading),
            }
            if (hwWrItem.aiIsCorrect === true) hwWrItem.isCorrect = true
            applyOverride(hwWrItem, hwOverrides)
            allHwQuestions.push(hwWrItem)
          })
        } catch(e) {}

        homeworkResults.push({
          id: row.id,
          homeworkTitle: row.title || 'واجب محذوف',
          score: row.score || 0,
          maxScore: row.maxScore || 100,
          submittedAt: row.submittedAt,
          wrongQuestions: wrongQuestions,
          writingAnswers: writingAnswers,
          hasWritingAnswers: writingAnswers.length > 0,
          allQuestions: allHwQuestions,
        })
      }
    } catch (e) {
      console.error('Homework results fetch error (progress):', e)
      homeworkResults = []
    }

    // If homework results is still empty, try simpler query without JOIN
    if (homeworkResults.length === 0) {
      try {
        var simpleHwRows = await db.$queryRawUnsafe(
          'SELECT id, homeworkId, score, maxScore, submittedAt, answers, gradeOverrides FROM HomeworkResult WHERE studentId = ? ORDER BY submittedAt DESC',
          id
        )
        var simpleOverrides: any = {}
        try { simpleOverrides = parseJsonCol(simpleHwRows && simpleHwRows[0] ? (simpleHwRows[0].gradeOverrides || '') : '') || {} } catch (e) { simpleOverrides = {} }
        for (var shi = 0; shi < (simpleHwRows || []).length; shi++) {
          var shr = simpleHwRows[shi]
          var hwTitle2 = 'واجب'
          var hwQuestions2 = ''
          try {
            var hwInfo = await db.$queryRawUnsafe('SELECT title, questions FROM Homework WHERE id = ? LIMIT 1', shr.homeworkId)
            if (hwInfo && hwInfo.length > 0) {
              hwTitle2 = hwInfo[0].title || 'واجب'
              hwQuestions2 = hwInfo[0].questions || ''
            }
          } catch (e5) {}

          // Build all questions from simple data
          var simpleAllQs: any[] = []
          try {
            var rawQs = hwQuestions2 ? (typeof hwQuestions2 === 'string' ? JSON.parse(hwQuestions2) : hwQuestions2) : []
            var studentAnsSimple = {}
            if (shr.answers) {
              studentAnsSimple = typeof shr.answers === 'string' ? JSON.parse(shr.answers) : shr.answers
            }
            if (Array.isArray(rawQs)) {
              rawQs.forEach(function(q, qi) {
                var isW = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) || (Array.isArray(q.options) && q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' }))
                if (isW) {
                  var studentText2 = ''
                  try {
                    if (Array.isArray(studentAnsSimple)) {
                      studentText2 = studentAnsSimple[qi] || ''
                    } else if (studentAnsSimple && typeof studentAnsSimple === 'object') {
                      studentText2 = studentAnsSimple[qi] || studentAnsSimple[String(qi)] || ''
                    }
                  } catch (e6) {}
                  var sWrItem: any = {
                    type: 'writing',
                    origIdx: qi,
                    points: (typeof q.points === 'number' && q.points > 0) ? q.points : 5,
                    question: q.question || q.q || '',
                    studentAnswer: typeof studentText2 === 'string' ? studentText2 : String(studentText2 || ''),
                    correctAnswer: q.modelAnswer || q.answer || '',
                    isCorrect: false,
                  }
                  applyOverride(sWrItem, simpleOverrides)
                  simpleAllQs.push(sWrItem)
                } else {
                  var opts2 = Array.isArray(q.options) ? q.options : []
                  var correctIdx2 = typeof q.correct === 'number' ? q.correct : 0
                  if (correctIdx2 < 0 || correctIdx2 >= opts2.length) correctIdx2 = 0
                  var ans2 = undefined
                  try {
                    if (Array.isArray(studentAnsSimple)) {
                      ans2 = studentAnsSimple[qi]
                    } else if (studentAnsSimple && typeof studentAnsSimple === 'object') {
                      ans2 = studentAnsSimple[qi] !== undefined ? studentAnsSimple[qi] : studentAnsSimple[String(qi)]
                    }
                  } catch (e7) {}
                  var isCorrect2 = ans2 !== undefined && ans2 !== null && Number(ans2) === correctIdx2
                  var sMcqItem: any = {
                    type: 'mcq',
                    origIdx: qi,
                    points: (typeof q.points === 'number' && q.points > 0) ? q.points : 1,
                    question: q.question || q.q || '',
                    studentAnswer: (typeof ans2 === 'number' && opts2[ans2]) ? String.fromCharCode(65 + ans2) + ') ' + opts2[ans2] : 'Not answered',
                    correctAnswer: opts2[correctIdx2] ? String.fromCharCode(65 + correctIdx2) + ') ' + opts2[correctIdx2] : '',
                    isCorrect: isCorrect2,
                  }
                  applyOverride(sMcqItem, simpleOverrides)
                  simpleAllQs.push(sMcqItem)
                }
              })
            }
          } catch (e8) {}

          homeworkResults.push({
            id: shr.id,
            homeworkTitle: hwTitle2,
            score: shr.score || 0,
            maxScore: shr.maxScore || 100,
            submittedAt: shr.submittedAt,
            wrongQuestions: [],
            writingAnswers: [],
            hasWritingAnswers: false,
            allQuestions: simpleAllQs,
          })
        }
      } catch (e9) {
        console.error('Simple homework fetch error:', e9)
      }
    }

    // Summary stats
    const totalVideosWatched = videoProgress.length
    const completedVideos = videoProgress.filter((vp: any) => vp.completed).length
    const avgWatchPercent = videoProgress.length > 0
      ? Math.min(100, Math.round(videoProgress.reduce((sum: number, vp: any) => sum + Math.min(100, (vp.totalSeconds > 0 ? (vp.watchedSeconds / vp.totalSeconds) * 100 : 0)), 0) / videoProgress.length))
      : 0
    const avgExamScore = examResultsEnriched.length > 0
      ? Math.round(examResultsEnriched.reduce(function(s, er) { return s + er.score }, 0) / examResultsEnriched.length)
      : 0
    const examsPassed = examResultsEnriched.filter(function(er) { return er.passed }).length
    const avgHwScore = homeworkResults.length > 0
      ? Math.round(homeworkResults.reduce(function(s, r) { return s + r.score }, 0) / homeworkResults.length)
      : 0

    return NextResponse.json({
      student: { id: student.id, name: student.name, grade: student.grade },
      videoProgress: videoProgressEnriched,
      examResults: examResultsEnriched,
      homeworkResults: homeworkResults,
      summary: {
        totalVideosWatched,
        completedVideos,
        avgWatchPercent,
        totalExamsTaken: examResultsEnriched.length,
        examsPassed,
        avgExamScore,
        totalHomeworkDone: homeworkResults.length,
        avgHwScore,
      },
    })
  } catch (error) {
    console.error('Student progress error:', error)
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}
