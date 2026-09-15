// @ts-nocheck
// ============================================================
// (2026-و44) /api/notifications — إشعارات الطالب:
//   GET  ?studentId=…  → آخر 40 إشعار + unreadCount (+ تنظيف القديم)
//   POST { studentId, action: 'read-all' } → علّم الكل مقروء
//   POST { studentId, id,  action: 'read' } → علّم واحد مقروء
// أي فشل بيرجع 200 فاضي — الإشعارات مش سبب لكسر البورتال
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

async function ensureTable(): Promise<void> {
  try {
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Notification (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'general', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notification_student ON Notification(studentId, read)') } catch (e) {}
  } catch (e) {}
}

export async function GET(request: NextRequest) {
  try {
    var studentId = new URL(request.url).searchParams.get('studentId') || ''
    if (!studentId) return NextResponse.json({ notifications: [], unreadCount: 0 })
    await ensureTable()
    /* تنظيف هادئ: إشعارات أقدم من 60 يوم تشيل نفسها — الجدول ميبقاش ضخم */
    try { await db.$executeRawUnsafe("DELETE FROM Notification WHERE createdAt < datetime('now', '-60 days')") } catch (e) {}
    var rows: any = await db.$queryRawUnsafe(
      'SELECT id, type, title, body, read, createdAt FROM Notification WHERE studentId = ? ORDER BY createdAt DESC LIMIT 40',
      studentId
    )
    var unread: any = await db.$queryRawUnsafe(
      'SELECT COUNT(*) as c FROM Notification WHERE studentId = ? AND read = 0',
      studentId
    )
    return NextResponse.json({
      notifications: (rows || []).map(function (r: any) {
        return { id: r.id, type: r.type, title: r.title, body: r.body, read: !!Number(r.read), createdAt: r.createdAt }
      }),
      unreadCount: unread && unread.length ? Number(unread[0].c) || 0 : 0,
    })
  } catch (e) {
    console.error('[notifications] GET error:', e)
    return NextResponse.json({ notifications: [], unreadCount: 0 })
  }
}

export async function POST(request: NextRequest) {
  try {
    var body: any = {}
    try { body = await request.json() } catch (e) {}
    var studentId = String(body.studentId || '')
    var action = String(body.action || '')
    if (!studentId) return NextResponse.json({ ok: false })
    await ensureTable()
    if (action === 'read-all') {
      await db.$executeRawUnsafe('UPDATE Notification SET read = 1, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?', studentId)
    } else if (action === 'read' && body.id) {
      await db.$executeRawUnsafe('UPDATE Notification SET read = 1, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ? AND id = ?', studentId, String(body.id))
    }
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[notifications] POST error:', e)
    return NextResponse.json({ ok: false })
  }
}
