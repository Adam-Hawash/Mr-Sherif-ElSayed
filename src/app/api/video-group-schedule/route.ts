// ============================================================
// /api/video-group-schedule — (2026-و29) جدولة الفيديوهات للمجموعات
// طلب المستر الحرفي: «هخلي الفيديو ده يظهر لمجموعة يوم السبت، ومجموعة التلات
// ما يظهرلهاش الفيديو ده... يظهرلها يوم التلات. بس الفيديو ما يظهرش ليهم،
// مش يقول له فاضلك كذا، الفيديو ما يظهرش ليهم غير في الميعاد ده»
//
// GET  ?videoId= (أدمن) → خطط المجموعات للفيديو ده
// POST { adminId, videoId, plans: [{ groupId, unlockAt: ISO|null }] } → استبدال كامل
// DELETE ?adminId=&videoId= → مسح كل خطط المجموعات للفيديو (يرجع ظاهر للكل)
//
// الفلترة نفسها بتحصل على السيرفر في GET /api/videos — قبل الميعاد الفيديو
// **مختفي خالص** عن طلاب المجموعة (بدون عداد)، وغير المجموعات المستهدفة
// ما يشوفوش أصلًا.
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
          CREATE TABLE IF NOT EXISTS VideoGroupSchedule (
            id TEXT PRIMARY KEY,
            videoId TEXT NOT NULL,
            groupId TEXT NOT NULL,
            unlockAt DATETIME,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_vgs_video ON VideoGroupSchedule(videoId)') } catch (e) {}
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_vgs_group ON VideoGroupSchedule(groupId)') } catch (e) {}
      } catch (e) {
        console.error('Ensure VideoGroupSchedule error:', e)
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
    var videoId = searchParams.get('videoId') || ''
    if (!videoId) return NextResponse.json({ plans: [] })
    var rows = await db.$queryRawUnsafe('SELECT id, videoId, groupId, unlockAt, createdAt FROM VideoGroupSchedule WHERE videoId = ? ORDER BY createdAt ASC', videoId)
    return NextResponse.json({ plans: rows || [] })
  } catch (error: any) {
    console.error('VideoGroupSchedule GET error:', error)
    return NextResponse.json({ plans: [] })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    var body = await request.json()
    var admin = await isAdmin(body.adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var videoId = String(body.videoId || '')
    var plans: any[] = Array.isArray(body.plans) ? body.plans : []
    if (!videoId) return NextResponse.json({ error: 'videoId مطلوب' }, { status: 400 })

    // استبدال كامل: نمسح خطط الفيديو القديمة ونكتب الجديدة
    await db.$executeRawUnsafe('DELETE FROM VideoGroupSchedule WHERE videoId = ?', videoId)
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
      var id = 'vgs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9) + '_' + i
      try {
        await db.$executeRawUnsafe('INSERT INTO VideoGroupSchedule (id, videoId, groupId, unlockAt, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)', id, videoId, groupId, unlockAt)
        saved++
      } catch (e) { console.error('[vgs] insert error:', e) }
    }
    return NextResponse.json({ message: saved > 0 ? ('تم حفظ جدولة المجموعات (' + saved + ' مجموعة)') : 'تم مسح جدولة المجموعات — الفيديو ظاهر للكل', saved: saved })
  } catch (error: any) {
    console.error('VideoGroupSchedule POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حفظ الجدولة' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    await ensureTable()
    const { searchParams } = new URL(request.url)
    var admin = await isAdmin(searchParams.get('adminId'))
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var videoId = searchParams.get('videoId') || ''
    if (!videoId) return NextResponse.json({ error: 'videoId مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe('DELETE FROM VideoGroupSchedule WHERE videoId = ?', videoId)
    return NextResponse.json({ message: 'تم مسح جدولة المجموعات — الفيديو ظاهر للكل' })
  } catch (error: any) {
    console.error('VideoGroupSchedule DELETE error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء مسح الجدولة' }, { status: 500 })
  }
}
