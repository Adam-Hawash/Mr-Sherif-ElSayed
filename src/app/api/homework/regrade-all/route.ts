// @ts-nocheck
// POST /api/homework/regrade-all
// PURPOSE (و24 — شكوى المستر: «المقالي بيدي كله غلط»):
//   التسليمات القديمة اللي اتخزنت بصدام الكود القديم فاضلة بدرجاتها الغلط
//   للأبد (الطالب مش بيرجع يقدّم تاني + الـ sweep بيستهدف المعلق بس).
//   الحل: زرار واحد في لوحة الأدمن بيمر على كل نتايج واجب معين (الأقدم أولًا)
//   ويعيد تصحيحها بالذكاء الاصطناعي — كل نتيجة تاخد حكم نهائي جديد.
// Input: { homeworkId, limit? }  (limit افتراضي 6، أقصى 12 — مهلة السيرفر)
// Output: { success, fixed, processed, remaining, total }

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { regradeHomeworkResult } from '@/lib/regrade-core'

export const runtime = 'nodejs'
export const maxDuration = 300

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var homeworkId = body.homeworkId
    if (!homeworkId) {
      return NextResponse.json({ error: 'مفيش homeworkId' }, { status: 400 })
    }
    var limit = parseInt(String(body.limit ?? '6'), 10)
    if (isNaN(limit) || limit < 1) limit = 6
    if (limit > 12) limit = 12

    // كل نتايج الواجب — الأقدم أولًا (ده اللي غالبًا متخزن بالكود القديم)
    var rows: any[] = []
    try {
      rows = await db.$queryRawUnsafe(
        'SELECT id FROM HomeworkResult WHERE homeworkId = ? ORDER BY submittedAt ASC',
        homeworkId
      )
    } catch (e) {
      try {
        rows = await db.$queryRawUnsafe(
          'SELECT id FROM HomeworkResult WHERE homeworkId = ? ORDER BY id ASC',
          homeworkId
        )
      } catch (e2) {
        rows = []
      }
    }

    var total = (rows || []).length
    var batch = (rows || []).slice(0, limit)
    var fixed = 0
    for (var i = 0; i < batch.length; i++) {
      try {
        var outcome = await regradeHomeworkResult(batch[i].id)
        if (outcome) fixed++
      } catch (e) {
        console.error('[HW regrade-all] failed for', batch[i].id, e)
      }
    }

    return NextResponse.json({
      success: true,
      fixed: fixed,
      processed: batch.length,
      remaining: Math.max(0, total - batch.length),
      total: total,
    })
  } catch (error) {
    console.error('Homework regrade-all error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
