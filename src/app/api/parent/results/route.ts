import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    if (!parentId) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }

    var parent = null as any
    try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (pErr) {}
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }

    var student: any = null
    try { student = await db.student.findUnique({ where: { id: parent.studentId } }) } catch (sErr) {}
    if (!student) {
      return NextResponse.json({
        parent: { id: parent.id, name: parent.name, phone: parent.phone },
        student: null,
        homeworks: [],
        exams: [],
      })
    }

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
      student: {
        id: student.id,
        name: student.name,
        grade: student.grade,
        status: student.status,
        isPaidAccess: !!student.isPaidAccess,
      },
      homeworks: homeworks,
      exams: exams,
    })
  } catch (err: any) {
    console.error('Parent results error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
