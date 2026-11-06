// @ts-nocheck
// FILE: src/app/api/gamify/admin/nag/route.ts
// (2026-غ1) تنبيه جماعي من المستر — «خش حل السؤال اليومي بسرعة»
//   بيوصل لكل طالب لسه ما حلش سؤال النهاردة + إشعار لأولياء أمورهم
import { NextRequest, NextResponse } from 'next/server'
import { ensureGamifyTables, nagUnsolvedStudents } from '@/lib/gamify'
import { isAdmin } from '@/lib/video-guard'

export async function POST(req: NextRequest) {
  try {
    var body = await req.json().catch(() => ({}))
    var adminId = (body && body.adminId) || new URL(req.url).searchParams.get('adminId') || ''
    if (!(await isAdmin(adminId))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var grade = String(body.grade || '') || undefined
    var msg = String(body.message || '') || undefined
    var result = await nagUnsolvedStudents(grade, msg)
    return NextResponse.json({ ok: true, notified: result.notified })
  } catch (error) {
    console.error('gamify nag error:', error)
    return NextResponse.json({ error: 'خطأ في إرسال التنبيه' }, { status: 500 })
  }
}
