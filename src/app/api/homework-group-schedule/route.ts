// ============================================================
// /api/homework-group-schedule — (ز37) جدولة الواجبات للمجموعات
// طلب المستر الحرفي: «أحدد ميعاد لكل مجموعة زي اللي موجود في الفيديوهات
// وفي الامتحانات» — نفس نظام الفيديوهات بالظبط (VideoGroupSchedule):
//
// GET  ?homeworkId= (أدمن) → خطط المجموعات للواجب ده
// POST { adminId, homeworkId, plans: [{ groupId, unlockAt: ISO|null }] } → استبدال كامل
// DELETE ?adminId=&homeworkId= → مسح كل خطط المجموعات للواجب (يرجع ظاهر للكل)
//
// الفلترة نفسها بتحصل على السيرفر في GET /api/homework — قبل الميعاد
// الواجب **مختفي خالص** عن طلاب المجموعة (بدون عداد)، وغير المجموعات
// المستهدفة ما يشوفوه أصلًا. الواجب من غير خطط = سلوكه القديم زي ما هو.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

var ddlReady: Promise<void> | null = null
function ensureTable(): Promise<void> {
  if (!ddlReady) {
    ddlReady = (async function () {
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS HomeworkGroupSchedule (
            id TEXT PRIMARY KEY,
            homeworkId TEXT NOT NULL,
            groupId TEXT NOT NULL,
            unlockAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_hgs_hw ON HomeworkGroupSchedule(homeworkId)') } catch (e) {}
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_hgs_group ON HomeworkGroupSchedule(groupId)') } catch (e) {}
      } catch (e) {
        console.error('Ensure HomeworkGroupSchedule error:', e)
      }
    })()
  }
  return ddlReady
}

export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    var admin = await isAdmin(searchParams.get('adminId'))
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var homeworkId = searchParams.get('homeworkId') || ''
    if (!homeworkId) return NextResponse.json({ plans: [] })
    var rows = await db.$queryRawUnsafe('SELECT id, homeworkId, groupId, unlockAt, createdAt FROM HomeworkGroupSchedule WHERE homeworkId = ? ORDER BY createdAt ASC', homeworkId)
    return NextResponse.json({ plans: rows || [] })
  } catch (error: any) {
    console.error('HomeworkGroupSchedule GET error:', error)
    return NextResponse.json({ plans: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    var body = await request.json()
    var admin = await isAdmin(body.adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var homeworkId = String(body.homeworkId || '')
    var plans: any[] = Array.isArray(body.plans) ? body.plans : []
    if (!homeworkId) return NextResponse.json({ error: 'homeworkId مطلوب' }, { status: 400 })

    // استبدال كامل: نمسح خطط الواجب القديمة ونكتب الجديدة
    await db.$executeRawUnsafe('DELETE FROM HomeworkGroupSchedule WHERE homeworkId = ?', homeworkId)
    var saved = 0
    for (var i = 0; i < plans.length; i++) {
      var p = plans[i] || {}
      var groupId = String(p.groupId || '').trim()
      if (!groupId) continue
      var unlockAt: string | null = null
      if (p.unlockAt) {
        try {
          var d = new Date(String(p.unlockAt))
          if (!isNaN(d.getTime())) unlockAt = d.toISOString()
        } catch (e) {}
      }
      var id = 'hgs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + i
      try {
        await db.$executeRawUnsafe('INSERT INTO HomeworkGroupSchedule (id, homeworkId, groupId, unlockAt, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', id, homeworkId, groupId, unlockAt)
        saved++
      } catch (e) { console.error('[hgs] insert error:', e) }
    }
    return NextResponse.json({ message: saved > 0 ? ('تم حفظ جدولة المجموعات (' + saved + ' مجموعة)') : 'تم مسح جدولة المجموعات — الواجب ظاهر للكل', saved: saved })
  } catch (error: any) {
    console.error('HomeworkGroupSchedule POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ الجدولة' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    var admin = await isAdmin(searchParams.get('adminId'))
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var homeworkId = searchParams.get('homeworkId') || ''
    if (!homeworkId) return NextResponse.json({ error: 'homeworkId مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe('DELETE FROM HomeworkGroupSchedule WHERE homeworkId = ?', homeworkId)
    return NextResponse.json({ message: 'تم مسح جدولة المجموعات — الواجب ظاهر للكل' })
  } catch (error: any) {
    console.error('HomeworkGroupSchedule DELETE error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء مسح الجدولة' }, { status: 500 })
  }
}
