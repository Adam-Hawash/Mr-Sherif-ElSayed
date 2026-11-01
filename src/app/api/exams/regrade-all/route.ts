// @ts-nocheck
// POST /api/exams/regrade-all
// PURPOSE (و24): زرار «إعادة تصحيح الكل بالذكاء الاصطناعي» لنتايج امتحان معين —
//   نفس فكرة /api/homework/regrade-all: التسليمات القديمة المتخزنة بدرجات قديمة/غلط
//   بتتصحح تاني بالكامل (الأقدم أولًا).
// Input: { examId, limit? }
// Output: { success, fixed, processed, remaining, total }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { regradeExamResult } from '@/lib/regrade-core'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var examId = body.examId
    if (!examId) {
      return NextResponse.json({ error: 'مفيش examId' }, { status: 400 })
    }
    var limit = parseInt(String(body.limit ?? '6'), 10)
    if (isNaN(limit) || limit < 1) limit = 6
    if (limit > 12) limit = 12

    var rows: any[] = []
    try {
      rows = await db.$queryRawUnsafe(
        'SELECT id FROM ExamResult WHERE examId = ? ORDER BY submittedAt ASC',
        examId
      )
    } catch (e) {
      try {
        rows = await db.$queryRawUnsafe(
          'SELECT id FROM ExamResult WHERE examId = ? ORDER BY id ASC',
          examId
        )
      } catch (e2) {
        rows = []
      }
    }

    var total = (rows || []).length
    var batch = (rows || []).slice(0, limit)
    var fixed = 0
    for (var i = 0; i < batch.length; i++) {
      try {
        var outcome = await regradeExamResult(batch[i].id)
        if (outcome) fixed++
      } catch (e) {
        console.error('[EXAM regrade-all] failed for', batch[i].id, e)
      }
    }

    return NextResponse.json({
      success: true,
      fixed: fixed,
      processed: batch.length,
      remaining: Math.max(0, total - batch.length),
      total: total,
    })
  } catch (error) {
    console.error('Exam regrade-all error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
