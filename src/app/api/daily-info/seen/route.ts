// @ts-nocheck
// FILE: src/app/api/daily-info/seen/route.ts
// (2026-ت4) تسجيل إن الطالب شاف معلومة/حكمة اليوم — بعد الـ X أو الـ 30 ثانية
//   المعلومة دي ما تظهرش له تاني (لكل طالب ولكل معلومة مرة واحدة)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

var _tablesReady = false
async function ensureSeenTable(): Promise<void> {
  if (_tablesReady) return
  try {
    await db.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS DailyInfoView (infoId TEXT NOT NULL, studentId TEXT NOT NULL, seenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(infoId, studentId))'
    )
    _tablesReady = true
  } catch (e) {}
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    var studentId = String(body.studentId || '')
    var infoId = String(body.infoId || '')
    if (!studentId || !infoId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    await ensureSeenTable()
    try {
      await db.$executeRawUnsafe(
        'INSERT OR IGNORE INTO DailyInfoView (infoId, studentId) VALUES (?, ?)',
        infoId, studentId
      )
    } catch (e) { /* صامت — الإغلاق المحلي شغال على أي حال */ }
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: 'خطأ' }, { status: 500 })
  }
}
