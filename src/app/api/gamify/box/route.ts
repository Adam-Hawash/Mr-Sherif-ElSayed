// @ts-nocheck
// FILE: src/app/api/gamify/box/route.ts
// (2026-غ1) صندوق الكنز — كل 24 ساعة مرة واحدة
//   الجوايز: XP (10/20/30) + **60 XP نادرة** + درع ستريك + هالات نادرة
import { NextRequest, NextResponse } from 'next/server'
import { openMysteryBox } from '@/lib/gamify'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  try {
    var body = await req.json().catch(() => ({}))
    var studentId = String(body.studentId || '')
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    var grade = ''
    try {
      var st: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
      if (st && st.length) grade = String(st[0].grade || '')
    } catch (e) {}
    var result = await openMysteryBox(studentId, grade)
    if (!result.ok && result.error === 'cooldown') {
      return NextResponse.json(result, { status: 429 })
    }
    return NextResponse.json(result)
  } catch (error) {
    console.error('gamify box error:', error)
    return NextResponse.json({ error: 'خطأ في فتح الصندوق' }, { status: 500 })
  }
}
