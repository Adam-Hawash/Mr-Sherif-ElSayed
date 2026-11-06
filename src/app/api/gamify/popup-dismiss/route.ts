// @ts-nocheck
// FILE: src/app/api/gamify/popup-dismiss/route.ts
// (2026-ج2) طلب المستر الحرفي: «لما بدوس على الـ X بتحدد دي ما بتبقاش موجودة»
//   الإشعار (البوب أب) بتاع سؤال اليوم يختفي خالص لليوم ده من السلسلة —
//   والسؤال نفسه بيفضل محفوظ ومتاح في تاب «التحدي اليومي» عادي.
import { NextRequest, NextResponse } from 'next/server'
import { dismissPopup } from '@/lib/gamify'

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    var studentId = String(body.studentId || '')
    var seriesId = String(body.seriesId || '')
    var day = Number(body.day) || 1
    if (!studentId || !seriesId) return NextResponse.json({ ok: false, error: 'بيانات ناقصة' }, { status: 400 })
    var ok = await dismissPopup(studentId, seriesId, day)
    return NextResponse.json({ ok: ok })
  } catch (error) {
    console.error('gamify popup-dismiss error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
