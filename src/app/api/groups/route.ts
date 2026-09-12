// ============================================================
// /api/groups — (2026-و29) نظام المجموعات — طلب المستر:
//   «عاوزين نقسم الطلاب لمجموعتين... مجموعة التلات أو مجموعة الأحد»
//   الأدمن بيعمل مجموعات باسمه ويوزع الطلاب عليها — وبعدين يستهدف
//   الفيديوهات/الامتحانات/الواجبات للمجموعة (مع ميعاد ظهور للامتحان والواجب
//   والفيديو لكل مجموعة — مخفي تمامًا قبل الميعاد).
//   الأدمن بس اللي يقدر يقرأ أو يعدل — مفيش أي بيانات لغيره.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* defensive DDL — أول ريكوست بيتأكد إن الجداول والأعمدة موجودة (نفس نمط المشروع:
   ممنوع db:push — قاعدة بيانات الإنتاج بتترقّى لوحدها هنا) */
var ddlReady: Promise<void> | null = null
function ensureGroupsSchema(): Promise<void> {
  if (!ddlReady) {
    ddlReady = (async function () {
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS StudentGroup (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL,
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
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
        try { await db.$executeRawUnsafe("ALTER TABLE Student ADD COLUMN groupId TEXT DEFAULT ''") } catch (e) {}
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_student_group ON Student(groupId)') } catch (e) {}
      } catch (e) {
        console.error('Ensure groups schema error:', e)
      }
    })()
  }
  return ddlReady
}

// GET /api/groups?adminId=xxx — كل المجموعات + أعضاؤها (للوحة الأدمن)
export async function GET(request: NextRequest) {
  try {
    await ensureGroupsSchema()
    const { searchParams } = new URL(request.url)
    const admin = await isAdmin(searchParams.get('adminId'))
    if (!admin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    /* (2026-و29) جدول + أعضاء في نداءين متوازيين بدل N+1 — المنصة سريعة */
    var groupRows: any[] = []
    var studentRows: any[] = []
    try {
      var r1 = await db.$queryRawUnsafe('SELECT id, name, createdAt FROM StudentGroup ORDER BY createdAt ASC')
      groupRows = (r1 as any[]) || []
    } catch (e) {}
    try {
      var r2 = await db.$queryRawUnsafe("SELECT id, name, phone, grade, groupId, status FROM Student WHERE groupId != '' ORDER BY name ASC")
      studentRows = (r2 as any[]) || []
    } catch (e) {}

    var membersByGroup: Record<string, any[]> = {}
    for (var si = 0; si < studentRows.length; si++) {
      var st = studentRows[si]
      var g = String(st.groupId || '')
      if (!membersByGroup[g]) membersByGroup[g] = []
      membersByGroup[g].push({ id: st.id, name: st.name, phone: st.phone, grade: st.grade, status: st.status })
    }

    var groups = groupRows.map(function (r: any) {
      return { id: r.id, name: r.name, createdAt: r.createdAt, members: membersByGroup[r.id] || [] }
    })

    // الطلاب غير المسندين — عشان الأدمن يضيفهم لمجموعة من نفس الشاشة
    var unassigned: any[] = []
    try {
      var r3 = await db.$queryRawUnsafe("SELECT id, name, phone, grade, status FROM Student WHERE groupId = '' OR groupId IS NULL ORDER BY name ASC")
      unassigned = (r3 as any[]) || []
    } catch (e) {}

    return NextResponse.json({
      groups: groups,
      unassigned: unassigned.map(function (r: any) { return { id: r.id, name: r.name, phone: r.phone, grade: r.grade, status: r.status } }),
    })
  } catch (error: any) {
    console.error('Groups GET error:', error)
    return NextResponse.json({ error: 'حدث خطأ في تحميل المجموعات' }, { status: 500 })
  }
}

// POST /api/groups — { adminId, name } إنشاء مجموعة
export async function POST(request: NextRequest) {
  try {
    await ensureGroupsSchema()
    var body = await request.json()
    var admin = await isAdmin(body.adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var name = String(body.name || '').trim()
    if (!name) return NextResponse.json({ error: 'اكتب اسم المجموعة' }, { status: 400 })

    // منع الاسم المكرر
    var dup: any[] = []
    try {
      var dRows = await db.$queryRawUnsafe('SELECT id FROM StudentGroup WHERE name = ? LIMIT 1', name)
      dup = (dRows as any[]) || []
    } catch (e) {}
    if (dup.length > 0) {
      return NextResponse.json({ error: 'فيه مجموعة بنفس الاسم بالفعل' }, { status: 400 })
    }
    var id = 'grp_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    await db.$executeRawUnsafe('INSERT INTO StudentGroup (id, name, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)', id, name)
    return NextResponse.json({ message: 'تم إنشاء المجموعة', group: { id: id, name: name, members: [] } }, { status: 201 })
  } catch (error: any) {
    console.error('Groups POST error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء إنشاء المجموعة' }, { status: 500 })
  }
}

// PATCH /api/groups — { adminId, id, name } إعادة تسمية
export async function PATCH(request: NextRequest) {
  try {
    await ensureGroupsSchema()
    var body = await request.json()
    var admin = await isAdmin(body.adminId)
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var id = String(body.id || '')
    var name = String(body.name || '').trim()
    if (!id || !name) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    await db.$executeRawUnsafe('UPDATE StudentGroup SET name = ? WHERE id = ?', name, id)
    return NextResponse.json({ message: 'تم تحديث اسم المجموعة' })
  } catch (error: any) {
    console.error('Groups PATCH error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء تعديل المجموعة' }, { status: 500 })
  }
}

// DELETE /api/groups?adminId=&id= — حذف المجموعة + فصل أعضائها + مسح جدولة الفيديوهات بتاعتها
export async function DELETE(request: NextRequest) {
  try {
    await ensureGroupsSchema()
    const { searchParams } = new URL(request.url)
    var admin = await isAdmin(searchParams.get('adminId'))
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    var id = searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })
    await db.$executeRawUnsafe("UPDATE Student SET groupId = '' WHERE groupId = ?", id)
    await db.$executeRawUnsafe('DELETE FROM VideoGroupSchedule WHERE groupId = ?', id)
    await db.$executeRawUnsafe('DELETE FROM StudentGroup WHERE id = ?', id)
    return NextResponse.json({ message: 'تم حذف المجموعة — الطلاب اللي كانوا فيها بقوا من غير مجموعة' })
  } catch (error: any) {
    console.error('Groups DELETE error:', error)
    return NextResponse.json({ error: 'حدث خطأ أثناء حذف المجموعة' }, { status: 500 })
  }
}
