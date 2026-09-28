// ============================================================
// (2026-و106) /api/videos/reorder — إعادة ترتيب أجزاء درس متعدد
// الأدمن يبعت { adminId, orders: [{ id, orderIndex }] } ونتأكد إن كل
// الفيديوهات دي أجزاء (groupKey واحد) قبل الكتابة.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { adminId, orders } = body
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })
    }
    if (!Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json({ error: 'لازم تبعت الترتيب الجديد' }, { status: 400 })
    }
    // كل الأجزاء لازم يكونوا نفس الدرس (نفس groupKey)
    const ids = orders.map((o: { id: string }) => String(o.id || ''))
    const rows = await db.video.findMany({
      where: { id: { in: ids } },
      select: { id: true, groupKey: true },
    })
    const keys = new Set(rows.map((r) => r.groupKey))
    if (keys.size > 1) {
      return NextResponse.json({ error: 'الفيديوهات دي مش أجزاء نفس الدرس' }, { status: 400 })
    }
    await safeWrite(async function () {
      const updates = orders.map((o: { id: string; orderIndex: number }) =>
        db.video.update({ where: { id: String(o.id) }, data: { orderIndex: Math.max(0, Number(o.orderIndex) || 0) } })
      )
      await db.$transaction(updates)
      return true
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'فشل حفظ الترتيب: ' + String((error && error.message) || error).slice(0, 160) }, { status: 500 })
  }
}
