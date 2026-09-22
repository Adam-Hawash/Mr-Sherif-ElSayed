import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureParentNotificationsTable, normalizeParentPhone } from '@/lib/parent-notify'

/* (2026-و37/و38) شفاء ذاتي لجدول Parent — نفس حماية مسارَي الدخول والنتايج */
var parentDdlDone: Promise<void> | null = null
function ensureParentTable(): Promise<void> {
  if (!parentDdlDone) {
    parentDdlDone = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Parent (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT '', studentId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_parent_student ON Parent(studentId)') } catch (e) {}
      } catch (e) {
        parentDdlDone = null
      }
    })()
  }
  return parentDdlDone
}

/* التحقق من جلسة ولي الأمر + ضمان وجود جدول الإشعارات */
async function resolveParent(parentId: string): Promise<any> {
  try { await ensureParentTable() } catch (e) {}
  try { await ensureParentNotificationsTable() } catch (e) {}
  var parent = null as any
  try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (e) {}
  return parent
}

// ============================================================
// (2026-و87) إشعارات أولياء الأمور — طلب المستر:
//   «ولي الأمر يفتح حسابه يلاقي إشعار بكل تسليم امتحان/واجب لابنه»
//
//   GET   /api/parent/notifications?parentId=…
//         → آخر 50 إشعار + عداد غير المقروء
//   PATCH /api/parent/notifications  { parentId, id }      → إشعار واحد
//   PATCH /api/parent/notifications  { parentId, all:true } → الكل
//
//   المطابقة: parent_id = رقم موبايل ولي الأمر المطبّع (010xxxxxxxx)
//   أو id حسابه احتياطًا — نفس المفتاح اللي بيتكتب من lib/parent-notify
// ============================================================

export async function GET(request: NextRequest) {
  try {
    var parentId = new URL(request.url).searchParams.get('parentId') || ''
    if (!parentId) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }
    var parent = await resolveParent(parentId)
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }

    var phone = normalizeParentPhone(String(parent.phone || ''))
    var rows: any = []
    try {
      rows = await db.$queryRawUnsafe(
        'SELECT id, parent_id, student_name, message, is_read, created_at FROM parent_notifications WHERE parent_id = ? OR parent_id = ? ORDER BY id DESC LIMIT 50',
        phone, String(parent.id)
      )
    } catch (qErr) {
      console.error('Parent notifications query error (ignored):', qErr)
      rows = []
    }

    var list: any[] = []
    var arr: any[] = rows || []
    for (var i = 0; i < arr.length; i++) {
      var r = arr[i]
      /* created_at ممكن يرجع Date object (adapter) أو نص SQLite — نوحّده ISO UTC */
      var dObj: any = r.created_at
      var d: Date
      if (dObj instanceof Date) d = dObj
      else {
        var sC = String(dObj || '')
        if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(sC)) d = new Date(sC.replace(' ', 'T') + 'Z')
        else d = new Date(sC)
      }
      var iso = isNaN(d.getTime()) ? '' : d.toISOString()
      list.push({
        id: Number(r.id),
        studentName: String(r.student_name || ''),
        message: String(r.message || ''),
        isRead: Number(r.is_read) ? 1 : 0,
        createdAt: iso,
      })
    }
    var unread = 0
    for (var u = 0; u < list.length; u++) { if (!list[u].isRead) unread++ }

    return NextResponse.json({ ok: true, notifications: list, unread: unread })
  } catch (err) {
    console.error('Parent notifications GET error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}

export async function PATCH(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    var parentId = body ? String(body.parentId || '') : ''
    if (!parentId) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }
    var parent = await resolveParent(parentId)
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }

    var phone = normalizeParentPhone(String(parent.phone || ''))
    var oneId = body && body.id !== undefined && body.id !== null ? Number(body.id) : 0
    if (oneId > 0) {
      await db.$executeRawUnsafe(
        'UPDATE parent_notifications SET is_read = 1 WHERE id = ? AND (parent_id = ? OR parent_id = ?)',
        oneId, phone, String(parent.id)
      )
    } else {
      await db.$executeRawUnsafe(
        'UPDATE parent_notifications SET is_read = 1 WHERE (parent_id = ? OR parent_id = ?) AND is_read = 0',
        phone, String(parent.id)
      )
    }
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Parent notifications PATCH error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
