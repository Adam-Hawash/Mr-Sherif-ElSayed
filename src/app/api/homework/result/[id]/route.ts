// @ts-nocheck
// GET /api/homework/result/[id] - Poll a homework result while the AI grades
// writing questions in the background.
// Returns the stored writingResults verdicts (single source of truth) so the
// student's UI updates live without re-running any AI call.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function GET(request, ctx) {
  try {
    var params = ctx && ctx.params ? (ctx.params.then ? await ctx.params : ctx.params) : {}
    var resultId = params.id
    if (!resultId) {
      return NextResponse.json({ ok: false, error: 'missing id' }, { status: 400 })
    }

    var rows: any = []
    try {
      rows = await db.$queryRawUnsafe(
        'SELECT id, homeworkId, studentId, score, maxScore, writingResults, submittedAt FROM HomeworkResult WHERE id = ? LIMIT 1',
        resultId
      ) || []
    } catch (e) {
      // older schema without writingResults column
      try {
        rows = await db.$queryRawUnsafe(
          'SELECT id, homeworkId, studentId, score, maxScore, submittedAt FROM HomeworkResult WHERE id = ? LIMIT 1',
          resultId
        ) || []
      } catch (e2) {
        rows = []
      }
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'not found' }, { status: 404 })
    }

    var row = rows[0]
    var writingAnswers: any[] = []
    try {
      if (row.writingResults) {
        var parsed = typeof row.writingResults === 'string' ? JSON.parse(row.writingResults) : row.writingResults
        if (Array.isArray(parsed)) writingAnswers = parsed
      }
    } catch (e) {}

    var gradingDone = writingAnswers.every(function(w) { return w.gradingStatus !== 'pending' })

    return NextResponse.json({
      ok: true,
      result: {
        id: row.id,
        homeworkId: row.homeworkId,
        score: row.score,
        maxScore: row.maxScore,
        submittedAt: row.submittedAt,
        gradingDone: gradingDone,
        writingAnswers: writingAnswers,
        writingGraded: gradingDone,
        hasWritingQuestions: writingAnswers.length > 0,
      },
    })
  } catch (error) {
    console.error('Homework result poll error:', error)
    return NextResponse.json({ ok: false, error: 'error' }, { status: 500 })
  }
}
