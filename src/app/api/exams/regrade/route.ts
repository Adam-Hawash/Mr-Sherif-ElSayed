// @ts-nocheck
// POST /api/exams/regrade
// PURPOSE: زرار المستر — إعادة تصحيح نتيجة امتحان موجودة:
//   1. الـ MCQ بيتحسب من الإجابات الخام + الأسئلة الحالية (تعديلات المستر بتطبق فوراً)
//   2. الأسئلة المقالية بتتصحح بالذكاء الاصطناعي (حسم نهائي — مفيش تصحيح يدوي)
//   3. score / maxScore / writingGrades / writingResults بيتحدثوا في مكانهم
//      (التعديلات اليدوية للمستر gradeOverrides بتتحسب دايماً)
// Input: { resultId }
// Output: { success, score, maxScore }

import { NextRequest, NextResponse } from 'next/server'
import { regradeExamResult } from '@/lib/regrade-core'

export const runtime = 'nodejs'
export const maxDuration = 180

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var resultId = body.resultId
    if (!resultId) {
      return NextResponse.json({ error: 'مفيش resultId' }, { status: 400 })
    }

    var outcome = await regradeExamResult(resultId)
    if (!outcome) {
      return NextResponse.json({ error: 'النتيجة أو الامتحان غير موجود' }, { status: 404 })
    }

    return NextResponse.json({
      success: true,
      score: outcome.score,
      maxScore: outcome.maxScore,
    })
  } catch (error) {
    console.error('Exam regrade error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
