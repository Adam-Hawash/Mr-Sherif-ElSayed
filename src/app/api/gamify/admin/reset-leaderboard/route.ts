// @ts-nocheck
// FILE: src/app/api/gamify/admin/reset-leaderboard/route.ts
// (2026-غ1) تصفير لوحة الترتيب الدراسية — طلب المستر حرفيًا:
//   «عايزك تمسحه لي حاليًا وبعد كده تخليه شغال عادي»
//   النقاط القديمة بتتعلم preReset=1 فتختفي من اللوحتين فورًا،
//   وأي نتيجة جديدة بعد كده بتتراكم عادي من الصفر
import { NextRequest, NextResponse } from 'next/server'
import { ensureGamifyTables, resetAcademicLeaderboard, xpLeaderboard } from '@/lib/gamify'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

/* حارس الأدمن — adminId من الـ body أو الكويري (2026-غ2 تأمين) */
async function guardAdmin(req: NextRequest, body?: any): Promise<boolean> {
  var adminId = (body && body.adminId) || new URL(req.url).searchParams.get('adminId') || ''
  return isAdmin(adminId)
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json().catch(() => ({}))
    if (!(await guardAdmin(req, body))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var result = await resetAcademicLeaderboard()
    return NextResponse.json({ ok: true, frozen: result.frozen })
  } catch (error) {
    console.error('gamify reset-leaderboard error:', error)
    return NextResponse.json({ error: 'خطأ في التصفير' }, { status: 500 })
  }
}

/** معاينة اللوحة الحالية قبل/بعد التصفير */
export async function GET(req: NextRequest) {
  try {
    if (!(await guardAdmin(req))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var academic: any = []
    try {
      academic = await db.$queryRawUnsafe(
        'SELECT s.name, s.grade, COALESCE(SUM(pl.points), 0) AS totalPoints ' +
        'FROM PointsLedger pl INNER JOIN Student s ON s.id = pl.studentId ' +
        "WHERE s.status IN ('approved','paid') AND COALESCE(pl.preReset, 0) = 0 " +
        'GROUP BY s.id, s.name, s.grade HAVING totalPoints > 0 ' +
        'ORDER BY totalPoints DESC LIMIT 10'
      ) || []
    } catch (e) { academic = [] }
    var xp: any[] = await xpLeaderboard(10)
    return NextResponse.json({ academic, xp })
  } catch (error) {
    return NextResponse.json({ error: 'خطأ في تحميل اللوحة' }, { status: 500 })
  }
}
