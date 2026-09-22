// ============================================================
// /api/admin/db-cleanup — (و81) أداة تنظيف قاعدة البيانات من الأدمن
// ============================================================
// السبب الجذري لتضخم الداتابيز: أي طالب/فيديو/امتحان/واجب بيتحذف وكل
// صفوفه بتفضل يتيمة للأبد (الطلاب المحذوفين أعمارهم أطول من المنصة).
// الأداة دي بتعدّ اليتامى وتقدر تمسحها نهائيًا + ضغط القاعدة بـ VACUUM.
//
// POST { adminId, dryRun?: boolean }  — أو adminId في query params
//   dryRun=true  → عدّ بس من غير حذف («فحص»)
//   dryRun=false → حذف نهائي للبيانات اليتيمة
// ?vacuum=1 → بعد المعالجة بيحاول يعمل VACUUM (ضغط القاعدة) في try/catch
//
// الرد: { ok:true, results:[{table, found, deleted}], totalFound, totalDeleted,
//         dryRun, vacuum?: 'ok'|'failed: ...' }
// auth: نفس نمط باقي admin APIs في المنصة (adminId + isAdmin)
// ============================================================
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function POST(request: NextRequest) {
  try {
    var body: any = {}
    try { body = await request.json() } catch (e) {}
    var { searchParams } = new URL(request.url)
    var adminId = String(body.adminId || searchParams.get('adminId') || '')
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }

    var dryRun = body.dryRun === undefined ? true : !(body.dryRun === false || body.dryRun === 'false')
    var wantVacuum = searchParams.get('vacuum') === '1' || body.vacuum === true

    /* كل قاعدة: [الجدول، شرط اليتيمة] — العد والحذف بنفس الشرط بالظبط.
       القواعد بتتنفذ بالترتيب: روابط الأبوة (ParentStudent) قبل Parent. */
    var rules: Array<[string, string]> = [
      /* ===== يتامى studentId (طلاب اتحذفوا وصفوفهم فضلت) ===== */
      ['StudentActivity', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['ExamResult (studentId)', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['ExamResult (examId)', 'examId IS NULL OR examId NOT IN (SELECT id FROM Exam)'],
      ['HomeworkResult (studentId)', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['HomeworkResult (homeworkId)', 'homeworkId IS NULL OR homeworkId NOT IN (SELECT id FROM Homework)'],
      ['VideoProgress (studentId)', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['VideoProgress (videoId)', 'videoId IS NULL OR videoId NOT IN (SELECT id FROM Video)'],
      ['VideoAccess (studentId)', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['VideoAccess (videoId)', 'videoId IS NULL OR videoId NOT IN (SELECT id FROM Video)'],
      ['VideoGroupSchedule (videoId)', 'videoId IS NULL OR videoId NOT IN (SELECT id FROM Video)'],
      ['VideoGroupSchedule (groupId)', "groupId IS NULL OR groupId NOT IN (SELECT id FROM StudentGroup)"],
      ['Notification', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['Payment', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['Discussion', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      /* الشكاوى وتذاكر التشغيل ممكن تكون من غير طالب ("") — دي مش يتامى */
      ['Complaint', "studentId IS NOT NULL AND studentId != '' AND studentId NOT IN (SELECT id FROM Student)"],
      /* (2026-و84) الشكوى بعد حلها تتمسح من صفحة الأدمن — القاعدة دي بتلم المخزون القديم */
      ['Complaint (شكاوى اتحلت)', "status = 'resolved'"],
      ['PlayTicket (studentId)', "studentId IS NOT NULL AND studentId != '' AND studentId NOT IN (SELECT id FROM Student)"],
      ['PlayTicket (videoId)', 'videoId IS NULL OR videoId NOT IN (SELECT id FROM Video)'],
      /* ===== أولياء الأمور وروابط الأبوة ===== */
      ['ParentStudent', 'parentId IS NULL OR parentId NOT IN (SELECT id FROM Parent) OR studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
      ['Parent', 'studentId IS NULL OR studentId NOT IN (SELECT id FROM Student)'],
    ]

    var results: Array<{ table: string; found: number; deleted: number; error?: string }> = []
    var totalFound = 0
    var totalDeleted = 0

    for (var i = 0; i < rules.length; i++) {
      var table = rules[i][0]
      var cond = rules[i][1]
      var found = 0
      var deleted = 0
      var err: string | undefined
      try {
        var cntRows: any[] = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM ' + table.split(' ')[0] + ' WHERE ' + cond)
        found = Number((cntRows && cntRows[0] && cntRows[0].c) || 0)
      } catch (e: any) {
        /* جدول ناقص على قاعدة قديمة — بنسجل ونكمل */
        err = String((e && e.message) || e).slice(0, 200)
      }
      if (!err && !dryRun && found > 0) {
        try {
          var affected = await db.$executeRawUnsafe('DELETE FROM ' + table.split(' ')[0] + ' WHERE ' + cond)
          deleted = Number(affected) || 0
        } catch (e: any) {
          err = String((e && e.message) || e).slice(0, 200)
        }
      }
      results.push({ table: table, found: found, deleted: deleted, error: err })
      totalFound += found
      totalDeleted += deleted
    }

    /* ===== تذاكر التشغيل المنتهية (expiresAt < دلوقتي) =====
       مقارنة التواريخ في JS مش في SQL — تخزين DateTime بيتفاوت بين
       CURRENT_TIMESTAMP و ISO، والـ JS بيفهم الاتنين صح. */
    try {
      var ticketRows: any[] = await db.$queryRawUnsafe('SELECT id, expiresAt FROM PlayTicket')
      var now = Date.now()
      var expiredIds: string[] = []
      for (var t = 0; t < ticketRows.length; t++) {
        var exp = new Date(ticketRows[t].expiresAt).getTime()
        if (isFinite(exp) && exp < now) expiredIds.push(String(ticketRows[t].id))
      }
      var deletedExpired = 0
      if (!dryRun && expiredIds.length > 0) {
        /* حذف على دفعات — عشان حد أقصى لعناصر IN في SQL */
        for (var c = 0; c < expiredIds.length; c += 500) {
          var chunk = expiredIds.slice(c, c + 500)
          var ph = chunk.map(function () { return '?' }).join(',')
          deletedExpired += Number(await db.$executeRawUnsafe('DELETE FROM PlayTicket WHERE id IN (' + ph + ')', ...chunk)) || 0
        }
      }
      results.push({ table: 'PlayTicket (expired)', found: expiredIds.length, deleted: deletedExpired })
      totalFound += expiredIds.length
      totalDeleted += deletedExpired
    } catch (e: any) {
      results.push({ table: 'PlayTicket (expired)', found: 0, deleted: 0, error: String((e && e.message) || e).slice(0, 200) })
    }

    /* ===== (اختياري) ضغط القاعدة — VACUUM ===== */
    var vacuumResult: string | undefined
    if (wantVacuum) {
      try {
        await db.$executeRawUnsafe('VACUUM')
        vacuumResult = 'ok'
      } catch (e: any) {
        vacuumResult = 'failed: ' + String((e && e.message) || e).slice(0, 160)
      }
    }

    return NextResponse.json({
      ok: true,
      dryRun: dryRun,
      results: results,
      totalFound: totalFound,
      totalDeleted: totalDeleted,
      vacuum: vacuumResult,
    })
  } catch (error: any) {
    console.error('db-cleanup error:', (error && error.message) || error)
    return NextResponse.json({ ok: false, error: 'فشل التنظيف — ' + ((error && error.message) || 'خطأ في السيرفر') }, { status: 500 })
  }
}
