import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveParentStudent } from '@/lib/parent-students'

/* (2026-و38) شفاء ذاتي لجدول Parent — نفس حماية مسارَي التسجيل والدخول */
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

// ============================================================
// (2026-و37) متابعة ولي الأمر — نتايج ابنه:
//   - الواجبات: الدرجة/النهاية + وقت التسليم
//   - الامتحانات: الدرجة/النهاية + وقت التسليم
// البيانات دي كانت مقفولة على الطالب نفسه (و12: النتيجة ممنوعة على الطالب)
// لكن الولي أمر هو عين المستر في المتابعة — فبيشوف الدرجات كاملة
// ============================================================

export async function GET(request: NextRequest) {
  try {
    var searchParams = new URL(request.url).searchParams
    var parentId = searchParams.get('parentId') || ''
    /* (2026-و79) ولي الأمر بعدة أبناء — اختيار الابن من الـ query */
    var studentIdParam = searchParams.get('studentId') || ''
    if (!parentId) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }

    var parent = null as any
    try { await ensureParentTable() } catch (eDdl) {}
    try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (pErr) {}
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }

    /* (2026-و79) كل أبناء ولي الأمر + الابن المختار */
    var resolved = await resolveParentStudent(parent, studentIdParam)
    var students = resolved.students
    var student: any = resolved.selected
    var studentsOut = students.map(function (s: any) {
      return { id: s.id, name: s.name, grade: s.grade, status: s.status, isPaidAccess: !!s.isPaidAccess }
    })
    if (!student) {
      return NextResponse.json({
        parent: { id: parent.id, name: parent.name, phone: parent.phone },
        students: studentsOut,
        student: null,
        homeworks: [],
        exams: [],
        videos: null,
      })
    }

    // ===== (2026-و39) نسبة فيديوهات الابن — من VideoProgress (نفس بيانات الطالب) =====
    var videos: any = null
    try {
      var vp: any[] = await db.videoProgress.findMany({ where: { studentId: student.id } })
      var sumW = 0, sumT = 0, done = 0
      for (var vi = 0; vi < vp.length; vi++) {
        var row = vp[vi]
        var t = Math.max(Number(row.totalSeconds) || 0, 0)
        var w = Math.max(Number(row.watchedSeconds) || 0, 0)
        if (t > 0 && w > t) w = t
        if (row.completed === true) { done++; if (t > 0) w = t }
        sumW += w; sumT += t
      }
      videos = { count: vp.length, completed: done, percent: sumT > 0 ? Math.round((sumW / sumT) * 100) : (done > 0 ? 100 : 0) }
    } catch (vErr) { videos = null }

    // ===== واجبات ابنك =====
    var hwResults: any[] = []
    var examResults: any[] = []
    try {
      hwResults = await db.homeworkResult.findMany({
        where: { studentId: student.id },
        orderBy: { submittedAt: 'desc' },
        take: 100,
      })
    } catch (hErr) { hwResults = [] }
    try {
      examResults = await db.examResult.findMany({
        where: { studentId: student.id },
        orderBy: { submittedAt: 'desc' },
        take: 100,
      })
    } catch (eErr) { examResults = [] }

    // ===== عناوين الواجبات والامتحانات =====
    var hwIds = hwResults.map(function (r: any) { return r.homeworkId })
    var examIds = examResults.map(function (r: any) { return r.examId })
    var hwTitles: Record<string, string> = {}
    var examTitles: Record<string, string> = {}
    try {
      if (hwIds.length > 0) {
        var hws = await db.homework.findMany({ where: { id: { in: hwIds } } })
        hws.forEach(function (h: any) { hwTitles[h.id] = h.title || 'واجب' })
      }
    } catch (t1) {}
    try {
      if (examIds.length > 0) {
        var exs = await db.exam.findMany({ where: { id: { in: examIds } } })
        exs.forEach(function (e: any) { examTitles[e.id] = e.title || 'امتحان' })
      }
    } catch (t2) {}

    var homeworks = hwResults.map(function (r: any) {
      return {
        id: r.id,
        homeworkId: r.homeworkId,
        title: hwTitles[r.homeworkId] || 'واجب',
        score: r.score,
        maxScore: r.maxScore,
        submittedAt: r.submittedAt,
      }
    })
    var exams = examResults.map(function (r: any) {
      return {
        id: r.id,
        examId: r.examId,
        title: examTitles[r.examId] || 'امتحان',
        score: r.score,
        maxScore: r.maxScore,
        submittedAt: r.submittedAt,
      }
    })

    return NextResponse.json({
      parent: { id: parent.id, name: parent.name, phone: parent.phone },
      /* (2026-و79) قايمة كل الأبناء — البورتال بيعرض مبدّل بينهم */
      students: studentsOut,
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        status: student.status,
        isPaidAccess: !!student.isPaidAccess,
      },
      homeworks: homeworks,
      exams: exams,
      videos: videos,
    })
  } catch (err: any) {
    console.error('Parent results error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
