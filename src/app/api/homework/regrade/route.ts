// @ts-nocheck
// POST /api/homework/regrade
// PURPOSE: زرار المستر — إعادة تصحيح نتيجة واجب موجودة بدون ما الطالب يعيد التسليم:
//   1. الـ MCQ بيتحسب من الإجابات الخام + الأسئلة الحالية (تعديلات المستر بتطبق فوراً)
//   2. الأسئلة المقالية بتتصحح بالذكاء الاصطناعي (حسم نهائي — مفيش تصحيح يدوي)
//   3. score / maxScore / writingResults بيتحدثوا في مكانهم
//      (التعديلات اليدوية للمستر gradeOverrides بتتحسب دايماً)
// Input: { resultId }
// Output: { success, score, maxScore, graded }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { regradeHomeworkResult } from '@/lib/regrade-core'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var resultId = body.resultId
    if (!resultId) {
      return NextResponse.json({ error: 'مفيش resultId' }, { status: 400 })
    }

    var outcome = await regradeHomeworkResult(resultId)
    if (!outcome) {
      return NextResponse.json({ error: 'النتيجة أو الواجب غير موجود' }, { status: 404 })
    }

    // نرجّع الدرجات المخزنة بعد التحديث (نفس شكل الرد القديم)
    var graded: any[] = []
    try {
      var rows: any[] = await db.$queryRawUnsafe(
        'SELECT writingResults FROM HomeworkResult WHERE id = ? LIMIT 1',
        resultId
      )
      if (rows && rows[0] && rows[0].writingResults) {
        var parsed = JSON.parse(rows[0].writingResults)
        if (Array.isArray(parsed)) graded = parsed
      }
    } catch (e) {}

    return NextResponse.json({
      success: true,
      score: outcome.score,
      maxScore: outcome.maxScore,
      graded: graded,
    })
  } catch (error) {
    console.error('Homework regrade error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
