// FILE: src/app/api/grading/sweep/route.ts
// PURPOSE: التصحيح التلقائي الشامل — المستر طلب مفيش حاجة اسمها "يحتاج تصحيح يدوي":
//   1) بيمسح النتايج اليتيمة (واجب/امتحان/فيديو اتحذف من المنصة والدرجات فضلت)
//   2) بيدور على النتايج القديمة اللي تسجلت قبل ما التصحيح الفوري يبقى موجود
//      (writingGrades/writingResults ناقصة أو pending) وبيصححها بالذكاء
//      الاصطناعي تلقائياً — كل سؤال بياخد درجة نهائية، والمستر يقدر يعدّل بعدها.
//
// POST /api/grading/sweep   { limit?: number }  (default 5 — عشان مهلة السيرفر)
// GET  /api/grading/sweep   نفس الشغل بـ limit 3
// Output: { cleanedOrphans, fixed, remaining, done }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { regradeExamResult, regradeHomeworkResult, ensureResultColumns, gradesLookPending, cleanupOrphanResults, questionsHaveWriting } from '@/lib/regrade-core'

export const runtime = 'nodejs'
export const maxDuration = 300

async function runSweep(limit: number) {
  await ensureResultColumns()

  // 1) النتايج اليتيمة تتمسح (الواجب المحذوف اللي طالعة درجته في لوحة الأدمن)
  var cleaned = { homework: 0, exam: 0, video: 0 }
  try { cleaned = await cleanupOrphanResults() } catch (e) {}

  var fixed = 0
  var candidates: { kind: 'exam' | 'homework'; id: string }[] = []

  // 2) امتحانات: نتيجة فيها إجابات + أسئلتها فيها مقالي + الدرجات المخزنة ناقصة/pending
  try {
    var examRows: any[] = await db.$queryRawUnsafe(
      'SELECT er.id AS rid, er.writingGrades AS wg, e.questions AS qs FROM ExamResult er INNER JOIN Exam e ON e.id = er.examId WHERE er.answers IS NOT NULL AND er.answers != "" ORDER BY er.submittedAt ASC'
    )
    ;(examRows || []).forEach(function (r) {
      if (questionsHaveWriting(r.qs) && gradesLookPending(r.wg)) candidates.push({ kind: 'exam', id: r.rid })
    })
  } catch (e) { console.error('[sweep] exam candidates error:', e) }

  // 3) واجبات: نفس الفكرة على writingResults
  try {
    var hwRows: any[] = await db.$queryRawUnsafe(
      'SELECT hr.id AS rid, hr.writingResults AS wr, h.questions AS qs FROM HomeworkResult hr INNER JOIN Homework h ON h.id = hr.homeworkId WHERE hr.answers IS NOT NULL AND hr.answers != "" ORDER BY hr.submittedAt ASC'
    )
    ;(hwRows || []).forEach(function (r) {
      if (questionsHaveWriting(r.qs) && gradesLookPending(r.wr)) candidates.push({ kind: 'homework', id: r.rid })
    })
  } catch (e) { console.error('[sweep] homework candidates error:', e) }

  var remaining = candidates.length
  var batch = candidates.slice(0, Math.max(1, Math.min(limit, 15)))

  for (var i = 0; i < batch.length; i++) {
    var c = batch[i]
    try {
      if (c.kind === 'exam') await regradeExamResult(c.id)
      else await regradeHomeworkResult(c.id)
      fixed++
      remaining--
    } catch (e) {
      console.error('[sweep] regrade ' + c.kind + ' ' + c.id + ' error:', e)
    }
  }

  return { cleanedOrphans: cleaned, fixed: fixed, remaining: Math.max(0, remaining), done: remaining <= 0 }
}

export async function POST(request: NextRequest) {
  try {
    var limit = 5
    try {
      var body = await request.json()
      if (body && typeof body.limit === 'number') limit = body.limit
    } catch (e) {}
    var result = await runSweep(limit)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sweep error:', error)
    return NextResponse.json({ cleanedOrphans: { homework: 0, exam: 0, video: 0 }, fixed: 0, remaining: 0, done: true, error: 'sweep failed' }, { status: 200 })
  }
}

export async function GET() {
  try {
    var result = await runSweep(3)
    return NextResponse.json(result)
  } catch (error) {
    console.error('Sweep error:', error)
    return NextResponse.json({ cleanedOrphans: { homework: 0, exam: 0, video: 0 }, fixed: 0, remaining: 0, done: true, error: 'sweep failed' }, { status: 200 })
  }
}
