// @ts-nocheck
// POST /api/exams/submit - Submit exam answers, auto-grade, save result with answers
//
// GRADING FLOW (the teacher asked for FULL auto-grading — nothing left empty):
//   MCQ     → graded instantly
//   Writing → graded RIGHT NOW during submit:
//     - image answers ([📷 صورة مرفقة: …]) → VLM grading (gradeImageAnswer)
//     - text answers → smart grader (fast match + AI batch + deterministic fallback)
//   Final score (MCQ + writing) is saved together with per-question
//   writingGrades JSON so the student AND admin see the AI verdict everywhere.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds } from '@/lib/ai-image-grader'
import { gradeWritingSmart } from '@/lib/smart-grader'

export const runtime = 'nodejs'
export const maxDuration = 300

async function ensureTable() {
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
    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP') } catch(e) {}
  } catch (e) {
    console.error('Ensure ExamResult table error:', e)
  }
}

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

    // Fetch exam
    var exam = null
    try {
      var examRows = await db.$queryRawUnsafe(
        'SELECT id, title, questions, passScore FROM Exam WHERE id = ? LIMIT 1',
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

    // Parse questions - separate MCQ from writing
    var questions = []
    if (exam.questions) {
      try {
        var raw = typeof exam.questions === 'string' ? JSON.parse(exam.questions) : exam.questions
        if (Array.isArray(raw)) { questions = raw }
      } catch (e) {
        console.error('Parse exam questions error:', e)
      }
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: 'لا توجد أسئلة في هذا الامتحان' }, { status: 400 })
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

    // Grade MCQ
    var score = 0
    var maxScore = 0
    var mcqWrong = []
    mcqQuestions.forEach(function(item, i) {
      var q = item.q
      var origIdx = item.origIdx
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) { correctIdx = 0 }
      var studentAnswer = lookupAnswer(answers, origIdx)
      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        score += pts
      } else {
        mcqWrong.push({
          question: q.question || q.q || '',
          studentAnswer: (typeof studentAnswer === 'number' && opts[studentAnswer])
            ? String.fromCharCode(65 + studentAnswer) + ') ' + opts[studentAnswer]
            : 'لم يتم الإجابة',
          correctAnswer: opts[correctIdx]
            ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
            : '',
        })
      }
    })

    // ===== WRITING: full AI grading NOW (no pending, nothing left empty) =====
    var mcqScore = score
    var writingScore = 0
    var writingGrades: any[] = []

    // 1) build the writing workload
    var textWorkload: any[] = []   // for gradeWritingSmart (batch, one AI call)
    var imageWorkload: any[] = []  // for gradeImageAnswer (per question, VLM)

    for (var wi = 0; wi < writingQuestions.length; wi++) {
      var wItem = writingQuestions[wi]
      var wq = wItem.q
      var wOrigIdx = wItem.origIdx
      var pts = (typeof wq.points === 'number' && wq.points > 0) ? wq.points : 5
      maxScore += pts

      var studentText = ''
      var lookedUp = lookupAnswer(answers, wOrigIdx)
      studentText = lookedUp !== undefined && lookedUp !== null ? String(lookedUp) : ''

      var item = {
        origIdx: wOrigIdx,
        question: wq.question || wq.q || '',
        modelAnswer: wq.modelAnswer || wq.answer || '',
        acceptedAnswers: Array.isArray(wq.acceptedAnswers) ? wq.acceptedAnswers : [],
        points: pts,
        studentText: studentText,
      }

      var mediaIds = extractImageMediaIds(studentText)
      if (mediaIds.length > 0) imageWorkload.push(item)
      else textWorkload.push(item)
    }

    // 2) text answers → smart grader (fast match + ONE batch AI call + fallback)
    var textGraded: any[] = []
    try {
      var textResult = await gradeWritingSmart(textWorkload.map(function(w) {
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
      console.error('Writing smart grade error:', grErr)
      textGraded = textWorkload.map(function(w) {
        return {
          question: w.question, answer: w.studentText, modelAnswer: w.modelAnswer,
          awardedPoints: 0, maxPoints: w.points, isCorrect: false,
          feedback: 'تعذر التصحيح — راجع مع المستر', gradingStatus: 'graded',
        }
      })
    }

    // 3) image answers → VLM per question
    var imageGraded: any[] = []
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
        console.error('Writing image grade error:', imErr)
      }
      if (gradeData) {
        var imAwarded = Math.min(Math.max(Math.round(Number(gradeData.awardedPoints) || (gradeData.isCorrect ? iw.points : 0)), 0), iw.points)
        imageGraded.push({
          question: iw.question,
          answer: iw.studentText,
          modelAnswer: iw.modelAnswer,
          awardedPoints: imAwarded,
          maxPoints: iw.points,
          isCorrect: imAwarded >= Math.ceil(iw.points * 0.5) && imAwarded > 0,
          feedback: gradeData.feedback || (imAwarded > 0 ? 'تم تصحيح صورة الحل' : 'الحل مش مطابق'),
          gradingStatus: 'graded',
          aiExtractedAnswer: gradeData.extractedAnswer || '',
        })
      } else {
        // VLM failed → count attempted work instead of leaving it empty
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
        })
      }
    }

    // 4) merge back in original question order + sum the score
    var merged: any[] = []
    for (var tx = 0; tx < textWorkload.length; tx++) {
      merged.push({ workload: textWorkload[tx], grade: textGraded[tx] || null })
    }
    for (var ix = 0; ix < imageWorkload.length; ix++) {
      merged.push({ workload: imageWorkload[ix], grade: imageGraded[ix] || null })
    }

    var gradesByOrig: Record<number, any> = {}
    for (var mg = 0; mg < merged.length; mg++) {
      var m = merged[mg]
      var gr = m.grade || {
        question: m.workload.question, answer: m.workload.studentText, modelAnswer: m.workload.modelAnswer,
        awardedPoints: 0, maxPoints: m.workload.points, isCorrect: false,
        feedback: 'لم يتم الإجابة', gradingStatus: 'graded',
      }
      writingScore += Number(gr.awardedPoints) || 0
      gradesByOrig[m.workload.origIdx] = gr
    }

    // keep grades in the ORIGINAL question order for display
    writingQuestions.forEach(function(wItem) {
      var gr = gradesByOrig[wItem.origIdx]
      if (gr) {
        writingGrades.push({
          origIdx: wItem.origIdx,
          question: gr.question,
          answer: gr.answer,
          modelAnswer: gr.modelAnswer,
          awardedPoints: gr.awardedPoints,
          maxPoints: gr.maxPoints,
          isCorrect: gr.isCorrect,
          feedback: gr.feedback,
          gradingStatus: gr.gradingStatus || 'graded',
          aiExtractedAnswer: gr.aiExtractedAnswer || '',
        })
      }
    })

    score = mcqScore + writingScore

    if (maxScore === 0) { maxScore = questions.length }

    // Save with answers + writingGrades
    var resultId = 'exr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    var answersJson = ''
    if (answers !== undefined && answers !== null) {
      try { answersJson = JSON.stringify(answers) } catch(e) { answersJson = '' }
    }
    var writingGradesJson = ''
    try { writingGradesJson = JSON.stringify(writingGrades) } catch(e) { writingGradesJson = '' }

    try {
      await db.$executeRawUnsafe(
        'INSERT INTO ExamResult (id, studentId, examId, score, maxScore, answers, writingGrades) VALUES (?, ?, ?, ?, ?, ?, ?)',
        resultId, studentId, examId, score, maxScore, answersJson, writingGradesJson
      )
    } catch (insertErr) {
      console.error('Insert exam result error:', insertErr)
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO ExamResult (id, studentId, examId, score, maxScore, answers) VALUES (?, ?, ?, ?, ?, ?)',
          resultId, studentId, examId, score, maxScore, answersJson
        )
      } catch (retryErr) {
        console.error('Retry insert exam result error:', retryErr)
        return NextResponse.json({ error: 'حدث خطأ أثناء تسليم الامتحان' }, { status: 500 })
      }
    }

    return NextResponse.json({
      success: true,
      submitted: true,
      score: score,
      maxScore: maxScore,
      writingGrades: writingGrades,
    })
  } catch (error) {
    console.error('Exam submit error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تسليم الامتحان' }, { status: 500 })
  }
}
