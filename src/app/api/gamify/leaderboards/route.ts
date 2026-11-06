// @ts-nocheck
// FILE: src/app/api/gamify/leaderboards/route.ts
// (2026-غ1) لوحة الترتيب المزدوجة — طلب المستر:
//   «لوحة عادية للنقاط الدراسية بس، ولوحة تانية للـ XP بتاع التحدي»
//   • academic: مجموع درجات الامتحانات والواجبات بعد التصفير (PointsLedger preReset=0)
//   • xp: نقاط التحدي اليومي والصندوق والرهانات (GamifyProfile)
import { NextRequest, NextResponse } from 'next/server'
import { xpLeaderboard } from '@/lib/gamify'
import { db } from '@/lib/db'
import { ensureLedgerTable, syncLedger } from '@/lib/points-ledger'

export async function GET(req: NextRequest) {
  try {
    var limit = Math.min(Number(new URL(req.url).searchParams.get('limit')) || 10, 50)

    var academic: any[] = []
    try {
      await syncLedger()
      academic = await db.$queryRawUnsafe(
        'SELECT s.name, s.grade, COALESCE(SUM(pl.points), 0) AS totalPoints ' +
        'FROM PointsLedger pl INNER JOIN Student s ON s.id = pl.studentId ' +
        "WHERE s.status IN ('approved','paid') AND COALESCE(pl.preReset, 0) = 0 " +
        'GROUP BY s.id, s.name, s.grade ' +
        'HAVING totalPoints > 0 ' +
        'ORDER BY totalPoints DESC, s.name ASC LIMIT ?',
        limit
      ) || []
    } catch (e) { academic = [] }

    var xp: any[] = await xpLeaderboard(limit)

    return NextResponse.json({
      academic: (academic || []).map(function (r: any, i: number) {
        var total = Number(r.totalPoints) || 0
        var clean = Math.round(total * 10) / 10
        if (clean % 1 === 0) clean = Math.round(clean)
        return { rank: i + 1, name: String(r.name || 'طالب'), grade: String(r.grade || ''), points: clean }
      }),
      xp: xp,
    })
  } catch (error) {
    console.error('gamify leaderboards error:', error)
    return NextResponse.json({ academic: [], xp: [] })
  }
}
