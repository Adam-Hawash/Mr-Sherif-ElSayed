// ============================================================
// /api/game/leaderboard — (2026-ز38) لوحة ترتيب XP (الألعاب)
// GET — لوحة منفصلة تمامًا عن لوحة الدرجة الأكاديمية (PointsLedger):
//   • XP = مجموع دفتر XpLedger (تحديات + صناديق + مراهنات + تعديلات المستر)
//   • أول 50 طالب مقبول + مكان الطالب الحالي لو مش في القايمة
//   • بييجي معاه الستريك وعدد الشارات والكوزمتيك المُلبوس للطعم الجيمنج
//   • بيسوّي المراهنات المفتوحة اللي نتايجها نزلت (سحب عام)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureGameTables, settleOpenBets } from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var meId = String(sp.get('studentId') || '').trim()

    await ensureGameTables()
    await settleOpenBets()

    var rows: any = await db.$queryRawUnsafe(
      'SELECT s.id, s.name, s.grade, COALESCE(SUM(xpl.amount), 0) AS xp, ' +
      'COALESCE((SELECT currentStreak FROM StreakState ss WHERE ss.studentId = s.id LIMIT 1), 0) AS streak, ' +
      "COALESCE((SELECT COUNT(*) FROM StudentBadge sb WHERE sb.studentId = s.id), 0) AS badgeCount, " +
      "COALESCE((SELECT equippedCosmetic FROM StreakState ss2 WHERE ss2.studentId = s.id LIMIT 1), '') AS equipped " +
      'FROM XpLedger xpl INNER JOIN Student s ON s.id = xpl.studentId ' +
      "WHERE s.status IN ('approved', 'paid') " +
      'GROUP BY s.id, s.name, s.grade ' +
      'HAVING xp > 0 ' +
      'ORDER BY xp DESC, s.name ASC ' +
      'LIMIT 50'
    ) || []

    var board = (rows || []).map(function (r: any, idx: number) {
      return {
        rank: idx + 1,
        id: String(r.id),
        name: String(r.name || 'طالب').trim().replace(/\s+/g, ' ') || 'طالب',
        grade: String(r.grade || ''),
        xp: Math.round(Number(r.xp) || 0),
        streak: Number(r.streak) || 0,
        badgeCount: Number(r.badgeCount) || 0,
        equipped: String(r.equipped || ''),
      }
    })

    // مكاني أنا — لو مش ضمن أول 50
    var meRank: { rank: number; xp: number } | null = null
    if (meId) {
      var inBoard = board.find(function (b) { return b.id === meId })
      if (inBoard) {
        meRank = { rank: inBoard.rank, xp: inBoard.xp }
      } else {
        try {
          var meRows: any = await db.$queryRawUnsafe(
            "SELECT COALESCE(SUM(xpl.amount), 0) AS xp FROM XpLedger xpl WHERE xpl.studentId = ? ", meId
          ) || []
          var myXp = Math.round(Number((meRows[0] || {}).xp) || 0)
          if (myXp > 0) {
            var aheadRows: any = await db.$queryRawUnsafe(
              'SELECT COUNT(DISTINCT xpl.studentId) AS c FROM XpLedger xpl INNER JOIN Student s ON s.id = xpl.studentId ' +
              "WHERE s.status IN ('approved', 'paid') " +
              'GROUP BY xpl.studentId HAVING COALESCE(SUM(xpl.amount), 0) > ? ', myXp
            ) || []
            meRank = { rank: (aheadRows || []).length + 1, xp: myXp }
          }
        } catch (e) { console.error('me rank error:', e) }
      }
    }

    return NextResponse.json({ leaderboard: board, me: meRank })
  } catch (error) {
    console.error('game leaderboard error:', error)
    return NextResponse.json({ leaderboard: [], me: null })
  }
}
