// @ts-nocheck
// FILE: src/app/api/gamify/answer/route.ts
// (2026-غ1) إجابة سؤال اليوم — صح = XP + ستريك، غلط = مفيش XP + رسالة تشجيع
//   الإجابة الصح **مش بترجع من السيرفر للطالب** في أي وقت (أمان)
import { NextRequest, NextResponse } from 'next/server'
import { answerQuestion } from '@/lib/gamify'

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    var studentId = String(body.studentId || '')
    var seriesId = String(body.seriesId || '')
    var questionId = String(body.questionId || '')
    var choiceIndex = Number(body.choiceIndex)
    var answerText = String(body.answerText || '')
    if (!studentId || !seriesId || !questionId) {
      return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    }
    var result = await answerQuestion({
      studentId, seriesId, questionId,
      choiceIndex: isNaN(choiceIndex) ? -1 : choiceIndex,
      answerText,
    })
    if (!result.ok) return NextResponse.json(result, { status: 404 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('gamify answer error:', error)
    return NextResponse.json({ error: 'خطأ في تسجيل الإجابة' }, { status: 500 })
  }
}
