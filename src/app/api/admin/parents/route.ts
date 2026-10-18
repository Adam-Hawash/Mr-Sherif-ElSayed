// ============================================================
// /api/admin/parents — (2026-ز19) إدارة أولياء الأمور من لوحة الأدمن
//   طلب المستر الحرفي: «عايزك تضيف لي في صفحة الأدمن أولياء الأمور عشان
//   نعرف أولياء الأمور مين اللي موجود ومين ابنهم — زي اللي موجودة في
//   منصة مستر وائل».
//
// GET    /api/admin/parents?adminId=...   → قائمة أولياء الأمور + ابنهم
//                                           + عدد الأجهزة المفعّلة للإشعارات
//                                           + عدد الإشعارات + تاريخ التسجيل
// DELETE /api/admin/parents?adminId=...   → حذف ولي أمر نهائيًا (Body: { id })
//                                           بيمسح معاه: إشعاراته الداخلية
//                                           (ParentNotification) + أجهزته
//                                           (ParentPushSubscription).
//   ⚠️ الحذف ما بيلمس الطالب ولا درجاته خالص.
//
// نفس نمط auth الأدمن في المشروع (adminId + isAdmin) — ونفس تاب وائل (و90)
// مع تكييف: هنا Parent بيرتبط بطالب واحد (studentId) ومفيش جدول ParentStudent.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import { normalizeParentPhone } from '@/lib/parent-notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    var searchParams = new URL(request.url).searchParams
    var adminId = String(searchParams.get('adminId') || '')
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    var parents: any[] = []
    try {
      parents = await db.parent.findMany({ orderBy: { createdAt: 'desc' } })
    } catch (e) {
      parents = []
    }

    /* أسماء الطلاب المرتبطين — Parent.studentId = الطالب الوحيد المربوط */
    var studentIds: string[] = []
    for (var i = 0; i < parents.length; i++) {
      if (parents[i].studentId && studentIds.indexOf(parents[i].studentId) === -1) studentIds.push(parents[i].studentId)
    }
    var studentsMap: Record<string, any> = {}
    if (studentIds.length) {
      try {
        var students = await db.student.findMany({ where: { id: { in: studentIds } } })
        for (var si = 0; si < students.length; si++) studentsMap[students[si].id] = students[si]
      } catch (eS) {}
    }

    /* عدادات الإشعارات والأجهزة — parentId فيهم = رقم موبايل ولي الأمر مطبّع
       (normalizeParentPhone). بنعد بالصيغتين (المطبّعة + الخام) احتياط. */
    var subs: any[] = []
    var notes: any[] = []
    try { subs = await db.parentPushSubscription.findMany() } catch (eP) { subs = [] }
    try { notes = await db.parentNotification.findMany() } catch (eN) { notes = [] }
    var subsCount: Record<string, number> = {}
    for (var sj = 0; sj < subs.length; sj++) subsCount[subs[sj].parentId] = (subsCount[subs[sj].parentId] || 0) + 1
    var notesCount: Record<string, number> = {}
    for (var nj = 0; nj < notes.length; nj++) notesCount[notes[nj].parentId] = (notesCount[notes[nj].parentId] || 0) + 1

    var out = parents.map(function (p: any) {
      var kids: any[] = []
      var primary = studentsMap[p.studentId] || null
      if (primary) kids.push({ id: primary.id, name: primary.name, phone: primary.phone, grade: primary.grade })
      var ph = normalizeParentPhone(String(p.phone || ''))
      var devices = (subsCount[ph] || 0) + (ph && ph !== String(p.phone) ? (subsCount[String(p.phone)] || 0) : 0)
      var notesN = (notesCount[ph] || 0) + (ph && ph !== String(p.phone) ? (notesCount[String(p.phone)] || 0) : 0)
      return {
        id: p.id,
        name: p.name,
        phone: p.phone,
        createdAt: p.createdAt,
        students: kids,
        pushDevices: devices,
        notifications: notesN,
      }
    })

    return NextResponse.json({ ok: true, parents: out, total: out.length })
  } catch (err: any) {
    console.error('[admin/parents] GET error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر' }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    var searchParams = new URL(request.url).searchParams
    var adminId = String(searchParams.get('adminId') || '')
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    var id = String((body && body.id) || searchParams.get('id') || '')
    if (!id) return NextResponse.json({ error: 'معرف ولي الأمر ناقص' }, { status: 400 })

    var parent: any = null
    try { parent = await db.parent.findUnique({ where: { id: id } }) } catch (eF) {}
    if (!parent) return NextResponse.json({ error: 'حساب ولي الأمر مش موجود (ممكن يكون اتمسح قبل كده)' }, { status: 404 })
    var phoneVariants: string[] = []
    var norm = normalizeParentPhone(String(parent.phone || ''))
    if (norm) phoneVariants.push(norm)
    if (parent.phone && phoneVariants.indexOf(String(parent.phone)) === -1) phoneVariants.push(String(parent.phone))

    var deletedNotifications = 0
    var deletedSubs = 0

    try {
      var r1 = await safeWrite(function () { return db.parentNotification.deleteMany({ where: { parentId: { in: phoneVariants } } }) })
      deletedNotifications = r1 ? r1.count : 0
    } catch (e1) {}
    try {
      var r2 = await safeWrite(function () { return db.parentPushSubscription.deleteMany({ where: { parentId: { in: phoneVariants } } }) })
      deletedSubs = r2 ? r2.count : 0
    } catch (e2) {}
    await safeWrite(function () { return db.parent.delete({ where: { id: id } }) })

    return NextResponse.json({
      ok: true,
      deleted: { notifications: deletedNotifications, pushDevices: deletedSubs },
    })
  } catch (err: any) {
    console.error('[admin/parents] DELETE error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني' }, { status: 500 })
  }
}
