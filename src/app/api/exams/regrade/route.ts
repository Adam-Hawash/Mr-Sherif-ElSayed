// @ts-nocheck
// POST /api/exams/regrade
// PURPOSE: Admin button — re-score an EXISTING exam result:
//            1. MCQ re-scored locally from the stored raw answers + the
//               CURRENT exam questions (teacher edits apply immediately).
//            2. Writing questions re-graded by the smart AI grader.
//            3. score / maxScore updated in place on ExamResult.
// Input: { resultId }
// Output: { success, score, maxScore }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { gradeWritingSmart } from '@/lib/smart-grader'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var resultId = body.resultId
    if (!resultId) {
      return NextResponse.json({ error: 'مفيش resultId' }, { status: 400 })
    }

    try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN answers TEXT DEFAULT ""') } catch (e) {}

    try { await db.$executeRawUnsafe("ALTER TABLE ExamResult ADD COLUMN writingResults TEXT DEFAULT ''") } catch (e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE ExamResult ADD COLUMN gradeOverrides TEXT DEFAULT ''") } catch (e) {}

    var rows = await db.$queryRawUnsafe(
      'SELECT id, examId, studentId, score, maxScore, answers, gradeOverrides FROM ExamResult WHERE id = ? LIMIT 1',
      resultId
    )
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'النتيجة غير موجودة' }, { status: 404 })
    }
    var res = rows[0]

    var examRows = await db.$queryRawUnsafe(
      'SELECT id, title, questions, passScore FROM Exam WHERE id = ? LIMIT 1',
      res.examId
    )
    if (!examRows || examRows.length === 0) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    // Parse questions with original index tracking (same as submit route)
    var all = []
    try {
      var rawQ = typeof examRows[0].questions === 'string' ? JSON.parse(examRows[0].questions) : examRows[0].questions
      if (Array.isArray(rawQ)) all = rawQ
    } catch (e) {}

    var mcq = []
    var writingQuestions = []
    all.forEach(function (q, idx) {
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
      if (isWriting) writingQuestions.push({ q: q, origIdx: idx })
      else mcq.push({ q: q, origIdx: idx })
    })

    var answers = []
    try {
      answers = res.answers ? JSON.parse(res.answers) : []
    } catch (e) { answers = [] }

    function lookupAnswer(ans, idx) {
      try {
        if (Array.isArray(ans)) return ans[idx]
        if (ans !== null && typeof ans === 'object') {
          return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
        }
      } catch (e) {}
      return undefined
    }

    // 1) MCQ re-score with CURRENT question keys
    var mcqScore = 0
    var maxScore = 0
    mcq.forEach(function (item) {
      var q = item.q
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
      var studentAnswer = lookupAnswer(answers, item.origIdx)
      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        mcqScore += pts
      }
    })

    // 2) Writing re-grade with the smart grader
    var writingAnswers = []
    writingQuestions.forEach(function (item) {
      var q = item.q
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 5
      maxScore += pts
      var studentText = lookupAnswer(answers, item.origIdx)
      studentText = typeof studentText === 'string' ? studentText : String(studentText || '')
      writingAnswers.push({
        origIdx: item.origIdx,
        question: q.question || q.q || '',
        answer: studentText,
        points: pts,
        modelAnswer: q.modelAnswer || q.answer || '',
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
      })
    })

    var writingScore = 0
    var gradedVerdicts = []
    if (writingAnswers.length > 0) {
      var outcome = await gradeWritingSmart(writingAnswers)
      gradedVerdicts = (outcome.graded || []).map(function (g, gi) {
        var merged = Object.assign({}, g)
        if (writingAnswers[gi] && writingAnswers[gi].origIdx !== undefined) merged.origIdx = writingAnswers[gi].origIdx
        writingScore += merged.awardedPoints || 0
        return merged
      })
    }

    // honor manual teacher overrides (k = questions-array index)
    var overrides = {}
    try { overrides = JSON.parse(res.gradeOverrides || '{}') || {} } catch (e) { overrides = {} }
    if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {}

    // per-question contributions in questions-array coordinates
    var contrib = {}
    mcq.forEach(function (item) {
      var pts = (typeof item.q.points === 'number' && item.q.points > 0) ? item.q.points : 1
      var opts = Array.isArray(item.q.options) ? item.q.options : []
      var correctIdx = typeof item.q.correct === 'number' ? item.q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
      var studentAnswer = lookupAnswer(answers, item.origIdx)
      contrib[String(item.origIdx)] = (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) ? pts : 0
    })
    gradedVerdicts.forEach(function (g) {
      if (g.origIdx === undefined) return
      contrib[String(g.origIdx)] = (g.awardedPoints || 0)
    })
    Object.keys(overrides).forEach(function (k) {
      var ov = overrides[k]
      var q = all[k]
      if (!q) return
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : ((q.type === 'writing' || q.type === 'essay') ? 5 : 1)
      contrib[String(k)] = ov === true ? pts : 0
    })

    var finalScore = 0
    Object.keys(contrib).forEach(function (k) { finalScore += contrib[k] || 0 })
    if (maxScore === 0) maxScore = res.maxScore || 1

    await db.$executeRawUnsafe(
      'UPDATE ExamResult SET score = ?, maxScore = ?, writingResults = ? WHERE id = ?',
      finalScore, maxScore, JSON.stringify(gradedVerdicts), resultId
    )

    return NextResponse.json({
      success: true,
      score: finalScore,
      maxScore: maxScore,
      mcqScore: mcqScore,
      writingScore: writingScore,
    })
  } catch (error) {
    console.error('Exam regrade error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
