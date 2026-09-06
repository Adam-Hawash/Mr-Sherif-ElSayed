// @ts-nocheck
// POST /api/grading/override
// PURPOSE: Manual admin override of a single question's verdict (صح ↔ غلط)
//          on a homework OR exam result — the teacher's word beats the AI.
//   Input: { kind: 'homework' | 'exam', resultId, qIndex, isCorrect }
//     - qIndex = the index of the question inside the stored questions array
//   Behavior:
//     1. Saves the override in <Result>.gradeOverrides JSON: { "<qIndex>": bool }
//     2. Recomputes the score from scratch honoring overrides:
//        - MCQ: graded against the CURRENT question key (teacher edits apply)
//        - Writing: stored AI verdict points, overridden true→full points, false→0
//     3. Updates score in place (maxScore refreshed from current questions)
//   Output: { success, score, maxScore, overrides }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

function parseJsonCol(col: any): any {
  try {
    if (!col) return null
    if (typeof col === 'string') return JSON.parse(col)
    return col
  } catch (e) { return null }
}

function lookupAnswer(ans: any, idx: number): any {
  try {
    if (Array.isArray(ans)) return ans[idx]
    if (ans !== null && typeof ans === 'object') {
      return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
    }
  } catch (e) {}
  return undefined
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var kind = body.kind === 'exam' ? 'exam' : 'homework'
    var resultId = body.resultId
    var qIndex = body.qIndex
    var isCorrect = body.isCorrect === true

    if (!resultId || qIndex === undefined || qIndex === null) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }

    var table = kind === 'exam' ? 'ExamResult' : 'HomeworkResult'
    var qTable = kind === 'exam' ? 'Exam' : 'Homework'
    var fk = kind === 'exam' ? 'examId' : 'homeworkId'

    // Columns may not exist on very old DBs — guarded
    try { await db.$executeRawUnsafe("ALTER TABLE " + table + " ADD COLUMN gradeOverrides TEXT DEFAULT ''") } catch (e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE " + table + " ADD COLUMN writingResults TEXT DEFAULT ''") } catch (e) {}
    try { await db.$executeRawUnsafe("ALTER TABLE " + table + " ADD COLUMN answers TEXT DEFAULT ''") } catch (e) {}

    var rows = await db.$queryRawUnsafe(
      'SELECT id, ' + fk + ' AS parentId, score, maxScore, answers, gradeOverrides, writingResults FROM ' + table + ' WHERE id = ? LIMIT 1',
      resultId
    )
    if (!rows || rows.length === 0) {
      return NextResponse.json({ error: 'النتيجة غير موجودة' }, { status: 404 })
    }
    var res = rows[0]

    var qRows = await db.$queryRawUnsafe(
      'SELECT id, questions FROM ' + qTable + ' WHERE id = ? LIMIT 1',
      res.parentId
    )
    var questions = []
    if (qRows && qRows.length > 0) {
      var parsed = parseJsonCol(qRows[0].questions)
      if (Array.isArray(parsed)) questions = parsed
    }
    if (questions.length === 0) {
      return NextResponse.json({ error: 'الأسئلة غير موجودة' }, { status: 404 })
    }

    // 1) merge override
    var overrides = parseJsonCol(res.gradeOverrides) || {}
    if (typeof overrides !== 'object' || Array.isArray(overrides)) overrides = {}
    overrides[String(qIndex)] = isCorrect

    // 2) recompute the full score honoring overrides
    var answers = parseJsonCol(res.answers) || []
    var verdicts = parseJsonCol(res.writingResults) || []
    if (!Array.isArray(verdicts)) verdicts = []

    var score = 0
    var maxScore = 0
    var writingCounter = 0

    // ANSWER INDEXING DIFFERS PER KIND:
    //   exam    → answers[fullArrayIndex]
    //   homework→ MCQ-first ordering (answers[mcqOrder] / answers[mcqTotal + writingOrder])
    var mcqTotal = 0
    for (var qi = 0; qi < questions.length; qi++) {
      var q0 = questions[qi]
      var isW0 = q0.type === 'writing' || q0.type === 'essay'
      if (!isW0 && Array.isArray(q0.options)) {
        var na0 = q0.options.length > 0 && q0.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (na0) isW0 = true
      }
      if (!isW0 && (!q0.options || q0.options.length === 0)) isW0 = true
      if (!isW0) mcqTotal++
    }
    var mcqSeen = 0

    for (var qi = 0; qi < questions.length; qi++) {
      var q = questions[qi]
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true

      if (isWriting) {
        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 5
        maxScore += pts
        var overrideVal = overrides[String(qi)]
        if (overrideVal === true || overrideVal === false) {
          // teacher's manual verdict wins
          if (overrideVal === true) score += pts
        } else {
          var stored = verdicts.find(function (sv: any) { return sv && (sv.origIdx === qi || (sv.question || '') === (q.question || q.q || '')) }) || verdicts[writingCounter] || null
          if (stored && (stored.aiIsCorrect === true || stored.isCorrect === true)) {
            score += (stored.awardedPoints && stored.awardedPoints > 0) ? stored.awardedPoints : pts
          }
        }
        writingCounter++
      } else {
        var mpts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
        maxScore += mpts
        var opts = Array.isArray(q.options) ? q.options : []
        var correctIdx = typeof q.correct === 'number' ? q.correct : 0
        if (correctIdx < 0 || correctIdx >= opts.length) correctIdx = 0
        var ansIdx = kind === 'exam' ? qi : mcqSeen
        var ans = lookupAnswer(answers, ansIdx)
        var baseCorrect = ans !== undefined && ans !== null && Number(ans) === correctIdx
        var overrideVal2 = overrides[String(qi)]
        var finalCorrect = overrideVal2 === true || overrideVal2 === false ? overrideVal2 : baseCorrect
        if (finalCorrect) score += mpts
        mcqSeen++
      }
    }

    if (maxScore === 0) maxScore = res.maxScore || 1

    // 3) persist
    await db.$executeRawUnsafe(
      'UPDATE ' + table + ' SET score = ?, maxScore = ?, gradeOverrides = ? WHERE id = ?',
      score, maxScore, JSON.stringify(overrides), resultId
    )

    return NextResponse.json({
      success: true,
      score: score,
      maxScore: maxScore,
      overrides: overrides,
    })
  } catch (error) {
    console.error('Grading override error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
