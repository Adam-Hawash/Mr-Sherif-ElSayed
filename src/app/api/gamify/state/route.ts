// @ts-nocheck
// FILE: src/app/api/gamify/state/route.ts
// (2026-غ1) حالة التحفيز الكاملة للطالب — نداء واحد يجيب كل حاجة:
//   ملف XP + الستريك + السلسلة النشطة + اليوم المفتوح + أسئلة النهاردة
//   (من غير الإجابة الصح أبدًا) + صندوق الكنز + الشارات + علامة التحذير
import { NextRequest, NextResponse } from 'next/server'
import { computeStudentState } from '@/lib/gamify'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  try {
    var studentId = new URL(req.url).searchParams.get('studentId') || ''
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    var grade = ''
    try {
      var st: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
      if (st && st.length) grade = String(st[0].grade || '')
    } catch (e) {}
    var state = await computeStudentState(studentId, grade)
    return NextResponse.json(state)
  } catch (error) {
    console.error('gamify state error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل حالة التحدي' }, { status: 500 })
  }
}
