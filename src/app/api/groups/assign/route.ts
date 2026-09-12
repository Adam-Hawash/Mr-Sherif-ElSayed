// ============================================================
// /api/groups/assign — (2026-و29) تسكين الطلاب في المجموعات
// POST { adminId, studentIds: [..], groupId }  → تسكينهم في المجموعة
// POST { adminId, studentIds: [..], groupId: '' } → إخراجهم من أي مجموعة
// الطالب العضو في مجموعة واحدة بس — نقله لمجموعة تانية بيخرجه من القديمة تلقائيًا
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var admin = await isAdmin(body.adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    var ids: string[] = Array.isArray(body.studentIds) ? body.studentIds.map(function (x: any) { return String(x || '').trim() }).filter(Boolean) : []
    var groupId = String(body.groupId || '')
    if (ids.length === 0) return NextResponse.json({ error: 'حدد الطلاب الأول' }, { status: 400 })

    if (groupId) {
      // المجموعة لازم تكون موجودة
      var grp: any[] = []
      try {
        var gRows = await db.$queryRawUnsafe('SELECT id FROM StudentGroup WHERE id = ? LIMIT 1', groupId)
        grp = (gRows as any[]) || []
      } catch (e) {}
      if (grp.length === 0) return NextResponse.json({ error: 'المجموعة غير موجودة' }, { status: 404 })
    }

    var updated = 0
    for (var i = 0; i < ids.length; i++) {
      try {
        await db.$executeRawUnsafe('UPDATE Student SET groupId = ? WHERE id = ?', groupId, ids[i])
        updated++
      } catch (e) { console.error('[groups/assign] update error:', e) }
    }

    return NextResponse.json({
      message: groupId ? ('تم تسكين ' + updated + ' طالب في المجموعة') : ('تم إخراج ' + updated + ' طالب من المجموعات'),
      updated: updated,
    })
  } catch (error: any) {
    console.error('Groups assign error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تسكين الطلاب' }, { status: 500 })
  }
}
