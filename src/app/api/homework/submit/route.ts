// @ts-nocheck
// POST /api/homework/submit - Submit homework answers, save result INSTANTLY,
// then grade writing questions IN PARALLEL in the background.
//
// WHY (user complaint: submission slower than the upload itself, AI slow):
//  - OLD flow: one SEQUENTIAL Gemini call per writing question BEFORE
//    responding → 3 questions ≈ 3 × 15-25s of staring at a spinner.
//  - NEW flow: MCQ is graded locally (instant), the result row is saved
//    immediately with writing questions marked "pending", the API responds,
//    and `after()` grades ALL writing questions IN PARALLEL then updates the
//    row. The student polls /api/homework/result/[id] and sees grades appear.

import { NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds } from '@/lib/ai-image-grader'

export const runtime = 'nodejs'
export const maxDuration = 120

// Ensure table exists (+ writingResults column for background-graded verdicts)
async function ensureTable() {
  try {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS HomeworkResult (
          id TEXT PRIMARY KEY,
          homeworkId TEXT NOT NULL,
          studentId TEXT NOT NULL,
          score REAL NOT NULL DEFAULT 0,
          maxScore REAL NOT NULL DEFAULT 100,
          answers TEXT DEFAULT '',
          submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    } catch (e) {}

    var needsRebuild = false
    try {
      var cols = await db.$queryRawUnsafe('PRAGMA table_info(HomeworkResult)')
      var hasSubmittedAt = (cols || []).some(function(c) { return c.name === 'submittedAt' })
      if (!hasSubmittedAt) needsRebuild = true
    } catch (e) {}

    if (needsRebuild) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE HomeworkResult RENAME TO HomeworkResult_old')
        await db.$executeRawUnsafe(`
          CREATE TABLE HomeworkResult (
            id TEXT PRIMARY KEY,
            homeworkId TEXT NOT NULL,
            studentId TEXT NOT NULL,
            score REAL NOT NULL DEFAULT 0,
            maxScore REAL NOT NULL DEFAULT 100,
            answers TEXT DEFAULT '',
            submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        try {
          await db.$executeRawUnsafe(`
            INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, answers, submittedAt)
            SELECT id, homeworkId, studentId, score, maxScore,
                   CASE WHEN answers IS NULL OR answers = '' THEN '' ELSE answers END,
                   CURRENT_TIMESTAMP
            FROM HomeworkResult_old
          `)
        } catch (copyErr) {
          try {
            await db.$executeRawUnsafe(`
              INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, submittedAt)
              SELECT id, homeworkId, studentId, score, maxScore, CURRENT_TIMESTAMP
              FROM HomeworkResult_old
            `)
          } catch (copyErr2) {
            console.error('Copy old homework data error:', copyErr2)
          }
        }
        await db.$executeRawUnsafe('DROP TABLE HomeworkResult_old')
      } catch (rebuildErr) {
        console.error('Rebuild HomeworkResult error:', rebuildErr)
        try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult_old RENAME TO HomeworkResult') } catch (e) {}
      }
    }

    // writingResults column — persisted AI verdicts (single source of truth)
    try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT \'\'') } catch (e) {}
  } catch (e) {
    console.error('Ensure HomeworkResult table error:', e)
  }
}

/* quick local text matching (fast path, no AI) */
function quickTextMatch(answerText: string, modelAnswer: string, acceptedAnswers: string[]): boolean {
  var cleanStudent = answerText.toLowerCase().replace(/\s+/g, ' ').trim()
  if (!cleanStudent) return false
  if (acceptedAnswers && acceptedAnswers.length > 0) {
    for (var ai = 0; ai < acceptedAnswers.length; ai++) {
      var acc = (acceptedAnswers[ai] || '').trim().toLowerCase().replace(/\s+/g, ' ')
      if (acc && (cleanStudent === acc || cleanStudent.includes(acc) || acc.includes(cleanStudent))) return true
    }
  }
  if (modelAnswer) {
    var cleanModel = modelAnswer.toLowerCase().replace(/\s+/g, ' ').trim()
    var modelParts = cleanModel.split('=')
    var modelFinal = (modelParts[modelParts.length - 1] || '').trim()
    var studentParts = cleanStudent.split('=')
    var studentFinal = (studentParts[studentParts.length - 1] || '').trim()
    if (modelFinal && studentFinal && (modelFinal === studentFinal || modelFinal.includes(studentFinal) || studentFinal.includes(modelFinal))) return true
  }
  return false
}

export async function POST(request) {
  try {
    var body = await request.json()
    var studentId = body.studentId
    var homeworkId = body.homeworkId
    var answers = body.answers

    if (!studentId || !homeworkId) {
      return NextResponse.json({ error: 'بيانات مفقودة' }, { status: 400 })
    }

    await ensureTable()

    // Check double submission
    try {
      var existing = await db.$queryRawUnsafe(
        'SELECT id, score, maxScore FROM HomeworkResult WHERE studentId = ? AND homeworkId = ? LIMIT 1',
        studentId, homeworkId
      )
      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          alreadySubmitted: true,
          result: { id: existing[0].id, score: existing[0].score, maxScore: existing[0].maxScore },
        }, { status: 200 })
      }
    } catch (e) {
      console.error('Check existing hw error:', e)
    }

    // Fetch homework questions
    var homework = null
    try {
      var hwRows = await db.$queryRawUnsafe(
        'SELECT id, title, questions FROM Homework WHERE id = ? LIMIT 1',
        homeworkId
      )
      homework = hwRows && hwRows.length > 0 ? hwRows[0] : null
    } catch (e) {
      console.error('Fetch homework error:', e)
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }
    if (!homework) {
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }

    // Parse questions
    var mcq = []
    var writingQuestions = []
    if (homework.questions) {
      try {
        var raw = typeof homework.questions === 'string' ? JSON.parse(homework.questions) : homework.questions
        if (Array.isArray(raw)) {
          raw.forEach(function(q) {
            var isWriting = q.type === 'writing' || q.type === 'essay'
            if (!isWriting && Array.isArray(q.options)) {
              var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
              if (allNA) isWriting = true
            }
            if (!isWriting && (!q.options || q.options.length === 0)) {
              isWriting = true
            }
            if (isWriting) {
              writingQuestions.push(q)
            } else {
              mcq.push(q)
            }
          })
        }
      } catch (e) {
        console.error('Parse homework questions error:', e)
      }
    }
    if (mcq.length === 0 && writingQuestions.length === 0) {
      return NextResponse.json({ error: 'لا توجد أسئلة في الواجب' }, { status: 400 })
    }

    // ============ MCQ: graded locally, INSTANT ============
    var score = 0
    var maxScore = 0
    var wrongQuestions = []

    mcq.forEach(function(q, i) {
      var qText = q.question || q.q || ''
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) { correctIdx = 0 }

      var studentAnswer = undefined
      if (Array.isArray(answers)) {
        studentAnswer = answers[i]
      } else if (answers !== null && typeof answers === 'object') {
        studentAnswer = answers[i] !== undefined ? answers[i] : answers[String(i)]
      }

      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        score += pts
      } else {
        wrongQuestions.push({
          question: qText,
          studentAnswer: (typeof studentAnswer === 'number' && opts[studentAnswer])
            ? String.fromCharCode(65 + studentAnswer) + ') ' + opts[studentAnswer]
            : 'لم يتم الإجابة',
          correctAnswer: opts[correctIdx]
            ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
            : '',
        })
      }
    })

    if (maxScore === 0) { maxScore = mcq.length }
    var mcqScore = score

    // ============ Writing questions: saved as PENDING, graded in background ============
    var writingAnswers: any[] = []
    writingQuestions.forEach(function(q, i) {
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts

      var qText = q.question || q.q || ''
      var studentText = ''
      var mcqLen = mcq.length
      try {
        if (Array.isArray(answers)) {
          studentText = answers[mcqLen + i] || ''
        } else if (answers && typeof answers === 'object') {
          studentText = answers[mcqLen + i] || answers[String(mcqLen + i)] || ''
        }
      } catch (e) {}

      writingAnswers.push({
        question: qText,
        answer: typeof studentText === 'string' ? studentText : String(studentText || ''),
        points: pts,
        maxPoints: pts,
        modelAnswer: q.modelAnswer || q.answer || '',
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
        needsGrading: true,
        gradingStatus: 'pending',
        feedback: 'جاري التصحيح بالذكاء الاصطناعي...',
      })
    })

    // ============ SAVE RESULT IMMEDIATELY ============
    var resultId = 'hwr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    var answersJson = ''
    if (answers !== undefined && answers !== null) {
      try { answersJson = JSON.stringify(answers) } catch(e) { answersJson = '' }
    }

    var inserted = false
    try {
      await db.$executeRawUnsafe(
        'INSERT INTO HomeworkResult (id, studentId, homeworkId, score, maxScore, answers, writingResults, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        resultId, studentId, homeworkId, score, maxScore, answersJson, JSON.stringify(writingAnswers)
      )
      inserted = true
    } catch (insertErr) {
      console.error('Insert homework result error:', insertErr)
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO HomeworkResult (id, studentId, homeworkId, score, maxScore, answers, submittedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          resultId, studentId, homeworkId, score, maxScore, answersJson
        )
        inserted = true
      } catch (retryErr) {
        console.error('Retry insert homework result error:', retryErr)
        return NextResponse.json({ error: 'حصلت مشكلة في حفظ النتيجة' }, { status: 500 })
      }
    }

    var hasWriting = writingAnswers.length > 0

    // Respond INSTANTLY — the student is out of here in <1s
    var responsePayload = {
      success: true,
      submitted: true,
      pendingGrading: hasWriting,
      result: {
        id: resultId,
        score: score,
        maxScore: maxScore,
        submittedAt: new Date().toISOString(),
        wrongQuestions: wrongQuestions,
        writingAnswers: writingAnswers,
        hasWritingQuestions: hasWriting,
        writingGraded: false,
        writingScore: 0,
      },
    }

    // ============ BACKGROUND: grade ALL writing questions IN PARALLEL ============
    var gradeOneWriting = async function(wa: any) {
      var answerText = (wa.answer || '').trim()

      // --- IMAGE answer → one multimodal AI call
      var mediaIds = extractImageMediaIds(answerText)
      if (mediaIds.length > 0) {
        try {
          var gradeData = await gradeImageAnswer({
            mediaId: mediaIds[0],
            question: wa.question,
            modelAnswer: wa.modelAnswer,
            acceptedAnswers: wa.acceptedAnswers,
            maxPoints: wa.points,
          })
          if (gradeData.needsGrading) {
            // AI unsure / photo not on topic / AI failed → admin reviews (no random verdict)
            return Object.assign({}, wa, {
              gradingStatus: 'manual',
              needsGrading: true,
              isCorrect: false,
              awardedPoints: 0,
              aiExtractedAnswer: gradeData.extractedAnswer || '(تعذر الاستخراج)',
              aiIsCorrect: false,
              aiFeedback: gradeData.feedback || 'محتاجة مراجعة يدوية',
              aiAwardedPoints: 0,
              feedback: gradeData.feedback || 'محتاجة مراجعة يدوية',
            })
          }
          return Object.assign({}, wa, {
            gradingStatus: 'graded',
            needsGrading: false,
            aiExtractedAnswer: gradeData.extractedAnswer || '',
            aiIsCorrect: gradeData.isCorrect === true,
            aiFeedback: gradeData.feedback || '',
            aiAwardedPoints: gradeData.awardedPoints || 0,
            isCorrect: gradeData.isCorrect === true,
            awardedPoints: gradeData.awardedPoints || 0,
          })
        } catch (gradeErr) {
          console.error('[HW BG] AI grade image error:', gradeErr)
          return Object.assign({}, wa, {
            gradingStatus: 'manual',
            needsGrading: true,
            isCorrect: false,
            awardedPoints: 0,
            aiExtractedAnswer: '(فشل الـ AI في قراءة الصورة)',
            aiIsCorrect: false,
            aiFeedback: 'فشل التصحيح بالـ AI - هتتراجع من الأستاذ',
            aiAwardedPoints: 0,
            feedback: 'فشل التصحيح بالـ AI - هتتراجع من الأستاذ',
          })
        }
      }

      // --- TEXT answer
      if (!answerText || answerText === '[📷 صورة مرفقة]') {
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: false,
          awardedPoints: 0,
          feedback: 'Not answered',
        })
      }
      if (!wa.modelAnswer) {
        return Object.assign({}, wa, {
          gradingStatus: 'manual',
          needsGrading: true,
          feedback: 'لا توجد إجابة نموذجية - يحتاج تصحيح يدوي',
        })
      }
      // fast local match
      if (quickTextMatch(answerText, wa.modelAnswer, wa.acceptedAnswers)) {
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: true,
          awardedPoints: wa.points,
          aiExtractedAnswer: answerText,
          aiIsCorrect: true,
          aiFeedback: 'إجابة صحيحة (تطابق نصي)',
          aiAwardedPoints: wa.points,
          feedback: 'إجابة صحيحة',
        })
      }
      // AI text grading
      try {
        var textGrade = await gradeTextAnswer({
          question: wa.question,
          studentAnswer: answerText,
          modelAnswer: wa.modelAnswer,
          acceptedAnswers: wa.acceptedAnswers,
          maxPoints: wa.points,
        })
        if (textGrade) {
          if (textGrade.needsGrading) {
            return Object.assign({}, wa, {
              gradingStatus: 'manual',
              needsGrading: true,
              isCorrect: false,
              awardedPoints: 0,
              aiExtractedAnswer: answerText,
              aiIsCorrect: false,
              aiFeedback: textGrade.feedback || 'محتاجة مراجعة يدوية',
              aiAwardedPoints: 0,
              feedback: textGrade.feedback || 'محتاجة مراجعة يدوية',
            })
          }
          return Object.assign({}, wa, {
            gradingStatus: 'graded',
            needsGrading: false,
            isCorrect: textGrade.isCorrect === true,
            awardedPoints: textGrade.awardedPoints || 0,
            aiExtractedAnswer: answerText,
            aiIsCorrect: textGrade.isCorrect === true,
            aiFeedback: textGrade.feedback || '',
            aiAwardedPoints: textGrade.awardedPoints || 0,
            feedback: textGrade.feedback || '',
          })
        }
        // AI returned nothing → manual review (NOT auto-wrong)
        return Object.assign({}, wa, {
          gradingStatus: 'manual',
          needsGrading: true,
          feedback: 'التصحيح الذكي تعذر — هتتراجع من الأستاذ',
        })
      } catch (textGradeErr) {
        console.error('[HW BG] AI text grading error:', textGradeErr)
        return Object.assign({}, wa, {
          gradingStatus: 'manual',
          needsGrading: true,
          feedback: 'التصحيح الذكي تعذر — هتتراجع من الأستاذ',
        })
      }
    }

    var backgroundGrading = async function() {
      try {
        var gradedList = await Promise.all(writingAnswers.map(function(wa) { return gradeOneWriting(wa) }))
        var writingScore = 0
        gradedList.forEach(function(g) {
          // only 'graded' entries count toward the score; 'manual' wait for the admin
          if (g.gradingStatus === 'graded') writingScore += (g.awardedPoints || 0)
        })
        var finalScore = mcqScore + writingScore
        try {
          await db.$executeRawUnsafe(
            'UPDATE HomeworkResult SET score = ?, writingResults = ? WHERE id = ?',
            finalScore, JSON.stringify(gradedList), resultId
          )
          console.log('[HW BG] Grading done for', resultId, '— final score', finalScore + '/' + maxScore)
        } catch (updErr) {
          console.error('[HW BG] Update result error:', updErr)
          try {
            await db.$executeRawUnsafe(
              'UPDATE HomeworkResult SET score = ? WHERE id = ?',
              finalScore, resultId
            )
          } catch (e2) {}
        }
      } catch (bgErr) {
        console.error('[HW BG] Background grading fatal error:', bgErr)
      }
    }

    if (hasWriting && inserted) {
      // after() runs when the response has been sent — same invocation, same runtime
      after(backgroundGrading)
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Homework submit error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة في تسليم الواجب' }, { status: 500 })
  }
}
