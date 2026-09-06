// @ts-nocheck
// POST /api/homework/regrade
// PURPOSE: Admin button — re-grade an EXISTING homework result with the smart
//          grader WITHOUT the student resubmitting:
//            1. MCQ re-scored locally from the stored raw answers + the
//               CURRENT questions (so teacher edits to questions/keys apply).
//            2. Writing questions re-graded by the smart AI grader.
//            3. score / maxScore / writingResults all updated in place.
// Input: { resultId }
// Output: { success, score, maxScore, graded }

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

    // columns may not exist on very old DBs — same guards as submit route
    try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT \'\'') } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN answers TEXT DEFAULT \'\'') } catch (e) {}

    var rows = await db.$queryRawUnsafe(
      'SELECT id, homeworkId, studentId, score, maxScore, answers, writingResults, gradeOverrides FROM HomeworkResult WHERE id = ? LIMIT 1',
      resultId
    )
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'النتيجة غير موجودة' }, { status: 404 })
    }
    var res = rows[0]

    var hwRows = await db.$queryRawUnsafe(
      'SELECT id, title, questions FROM Homework WHERE id = ? LIMIT 1',
      res.homeworkId
    )
    if (!hwRows || hwRows.length === 0) {
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }

    // Parse questions (same split logic as submit route)
    var mcq = []
    var writingQuestions = []
    var mcqOrigIdx = []
    var writingOrigIdx = []
    try {
      var rawQ = typeof hwRows[0].questions === 'string' ? JSON.parse(hwRows[0].questions) : hwRows[0].questions
      if (Array.isArray(rawQ)) {
        rawQ.forEach(function (q, qIdx) {
          var isWriting = q.type === 'writing' || q.type === 'essay'
          if (!isWriting && Array.isArray(q.options)) {
            var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
            if (allNA) isWriting = true
          }
          if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
          if (isWriting) { writingQuestions.push(q); writingOrigIdx.push(qIdx) }
          else { mcq.push(q); mcqOrigIdx.push(qIdx) }
        })
      }
    } catch (e) {
      console.error('[Regrade HW] parse questions error:', e)
    }

    // Stored raw student answers
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
    mcq.forEach(function (q, i) {
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
      var studentAnswer = lookupAnswer(answers, i)
      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        mcqScore += pts
      }
    })

    // 2) Writing re-grade with the smart grader
    var writingAnswers = []
    writingQuestions.forEach(function (q, i) {
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var qText = q.question || q.q || ''
      var mcqLen = mcq.length
      var studentText = lookupAnswer(answers, mcqLen + i)
      studentText = typeof studentText === 'string' ? studentText : String(studentText || '')
      writingAnswers.push({
        question: qText,
        answer: studentText,
        points: pts,
        modelAnswer: q.modelAnswer || q.answer || '',
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
      })
    })

    var writingScore = 0
    var graded = []
    if (writingAnswers.length > 0) {
      var outcome = await gradeWritingSmart(writingAnswers)
      graded = outcome.graded
      graded.forEach(function (g) { writingScore += g.awardedPoints || 0 })
    }

    // honor manual teacher overrides (keys = full questions-array indices)
    var overrides = {}
    try { overrides = JSON.parse(res.gradeOverrides || '{}') || {} } catch (e) { overrides = {} }
    if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {}

    var contrib = {}
    mcq.forEach(function (q, i) {
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
      var studentAnswer = lookupAnswer(answers, i)
      contrib[String(mcqOrigIdx[i])] = (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) ? pts : 0
    })
    graded.forEach(function (g, gi) {
      var fullIdx = writingOrigIdx[gi]
      if (fullIdx === undefined) return
      contrib[String(fullIdx)] = (g.awardedPoints || 0)
    })
    Object.keys(overrides).forEach(function (k) {
      var ov = overrides[k]
      var q = null
      for (var zi = 0; zi < rawQ.length; zi++) { if (String(zi) === String(k)) { q = rawQ[zi]; break } }
      if (!q) return
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : ((q.type === 'writing' || q.type === 'essay') ? 5 : 1)
      contrib[String(k)] = ov === true ? pts : 0
    })

    var finalScore = 0
    Object.keys(contrib).forEach(function (k) { finalScore += contrib[k] || 0 })
    if (maxScore === 0) maxScore = res.maxScore || 1

    await db.$executeRawUnsafe(
      'UPDATE HomeworkResult SET score = ?, maxScore = ?, writingResults = ? WHERE id = ?',
      finalScore, maxScore, JSON.stringify(graded), resultId
    )

    return NextResponse.json({
      success: true,
      score: finalScore,
      maxScore: maxScore,
      mcqScore: mcqScore,
      writingScore: writingScore,
      graded: graded,
    })
  } catch (error) {
    console.error('Homework regrade error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
