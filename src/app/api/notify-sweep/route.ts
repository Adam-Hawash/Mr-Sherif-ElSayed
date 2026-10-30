// @ts-nocheck
// ============================================================
// (2026-و97) /api/notify-sweep — تشغيل ماسح إشعارات الواجبات والامتحانات يدويًا
//
//   GET  → يشغّل الماسح ويرجّع الإحصائيات (عدد إشعارات النزول/التحذير/التأخير)
//   POST → نفس الشي (لتوافق cron خارجي لو اتضاف بعدين)
//
//   الماسح idempotent (مفتاح منع تكرار NotifySweepLog) فمفيش ضرر من
//   تكرار النداء — والمعدل محدود 45 ثانية بين كل تشغيل (force يتجاوزه)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { sweepAssignmentNotifications } from '@/lib/assignment-notify'
import { db } from '@/lib/db'

/* (2026-و97) تشخيص سلسلة الإشعارات — بيكشف بالظبط وين اللي بيتقطع:
   الجداول موجودة؟ شكلها صح؟ فيه أولياء أمور؟ فيه اشتراكات push؟
   فيه إشعارات اتكتبت فعلًا؟ — الأرقام كلها مقنّعة (أمان) */
async function diag(): Promise<NextResponse> {
  function mask(s: any): string {
    var t = String(s || '')
    if (t.length <= 4) return t ? '••' : ''
    return t.slice(0, 3) + '•••' + t.slice(-2)
  }
  var out: any = { ok: true, at: new Date().toISOString(), dbUrl: (process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || 'file').indexOf('libsql://') === 0 ? 'turso' : 'file' }
  try {
    /* 1) الجداول وأشكالها */
    var tables: any = {}
    var want = ['parent_notifications', 'Notification', 'NotifySweepLog', 'ParentPushSubscription', 'Parent', 'ParentStudent', 'Student']
    for (var i = 0; i < want.length; i++) {
      var tname = want[i]
      try {
        var cols: any = await db.$queryRawUnsafe('PRAGMA table_info(' + tname + ')')
        cols = cols || []
        if (!cols.length) { tables[tname] = { exists: false }; continue }
        var cnt: any = await db.$queryRawUnsafe('SELECT COUNT(*) as c FROM ' + tname)
        tables[tname] = { exists: true, cols: cols.map(function (c: any) { return String(c.name) }), count: Number(cnt[0] && cnt[0].c || 0) }
      } catch (e) { tables[tname] = { exists: false, err: String(e && (e as any).message || e).slice(0, 120) } }
    }
    out.tables = tables

    /* 2) عينة طلاب — parentPhone متسجل؟ */
    try {
      var st: any = await db.$queryRawUnsafe("SELECT id, name, parentPhone, grade FROM Student WHERE status IN ('approved','paid') ORDER BY createdAt DESC LIMIT 5")
      out.students = (st || []).map(function (r: any) { return { id: mask(r.id), name: String(r.name || '').slice(0, 10), parentPhone: mask(r.parentPhone), grade: String(r.grade || '') } })
    } catch (e) { out.students = { err: String(e && (e as any).message || e).slice(0, 120) } }

    /* 3) عينة أولياء أمور — مرتبطين بطلاب؟ */
    try {
      var pr: any = await db.$queryRawUnsafe('SELECT id, phone, studentId FROM Parent ORDER BY createdAt DESC LIMIT 5')
      out.parents = (pr || []).map(function (r: any) { return { id: mask(r.id), phone: mask(r.phone), studentId: mask(r.studentId) } })
    } catch (e) { out.parents = { err: String(e && (e as any).message || e).slice(0, 120) } }

    /* 4) اشتراكات الـ push — متخزنة بمفتاح إيه؟ */
    try {
      var su: any = await db.$queryRawUnsafe('SELECT parentId, endpoint FROM ParentPushSubscription LIMIT 5')
      out.pushSubs = (su || []).map(function (r: any) { return { parentId: mask(r.parentId), endpoint: String(r.endpoint || '').slice(0, 40) } })
    } catch (e) { out.pushSubs = { err: String(e && (e as any).message || e).slice(0, 120) } }

    /* 5) آخر إشعارات ولي الأمر الفعلية */
    try {
      var pn: any = await db.$queryRawUnsafe('SELECT parent_id, student_name, message, created_at FROM parent_notifications ORDER BY id DESC LIMIT 5')
      out.recentParentNotifs = (pn || []).map(function (r: any) { return { parentId: mask(r.parent_id), student: String(r.student_name || '').slice(0, 10), msg: String(r.message || '').slice(0, 50).replace(/\n/g, ' | '), at: String(r.created_at || '') } })
    } catch (e) { out.recentParentNotifs = { err: String(e && (e as any).message || e).slice(0, 120) } }

    /* 6) آخر امتحانات/واجبات نزلت (14 يوم) — عشان نعرف الماسح شايفها */
    try {
      var ex: any = await db.$queryRawUnsafe("SELECT COUNT(*) as c FROM Exam WHERE createdAt >= datetime('now','-14 days')")
      var hw: any = await db.$queryRawUnsafe("SELECT COUNT(*) as c FROM Homework WHERE createdAt >= datetime('now','-14 days')")
      out.recentAssignments = { exams14d: Number(ex[0] && ex[0].c || 0), homework14d: Number(hw[0] && hw[0].c || 0) }
    } catch (e) { out.recentAssignments = { err: String(e && (e as any).message || e).slice(0, 120) } }
  } catch (e) {
    out.ok = false
    out.err = String(e && (e as any).message || e).slice(0, 200)
  }
  return NextResponse.json(out)
}

export async function GET(request: NextRequest) {
  try {
    var url = new URL(request.url)
    if (url.searchParams.get('diag') === '1') return diag()
    var force = url.searchParams.get('force') === '1'
    var stats = await sweepAssignmentNotifications({ force: force })
    return NextResponse.json({ ok: true, sweptAt: new Date().toISOString(), ...stats })
  } catch (e) {
    console.error('[notify-sweep] error:', e)
    return NextResponse.json({ ok: false, error: 'sweep failed' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  return GET(request)
}
