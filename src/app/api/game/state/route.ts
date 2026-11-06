// ============================================================
// /api/game/state — (2026-ز38) الحالة الكاملة لمركز الألعاب للطالب
// GET ?studentId=&grade=
//   • إعدادات الصف (دورة التحدي/XP لكل إجابة/الصناديق/المراهنات)
//   • الستريك (مع تطبيق قاعدة اليوم الضايع → صفر، أو الدرع بيغطي)
//   • أسئلة النهارده (بتتثبت أول مرة — من غير الإجابات)
//   • رصيد XP + آخر حركات الدفتر + الصناديق + الشارات + المراهنات
//   • تسوية المراهنات الخاملة + تقييم الشارات (من غير لمس مسارات التسليم)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ensureGameTables, ensureDailyAssignment, getGameConfig, getStreakState,
  xpBalance, settleOpenBets, evaluateBadges, BADGE_DEFS, cairoDayKey, msToCairoMidnight, parseDbDate,
} from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var studentId = String(sp.get('studentId') || '').trim()
    var grade = String(sp.get('grade') || '').trim()
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    await ensureGameTables()

    // الصف: من الطلب أو من قاعدة البيانات (لو الطلب ناقص)
    if (!grade) {
      try {
        var stRows: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
        if (Array.isArray(stRows) && stRows.length > 0) grade = String(stRows[0].grade || '')
      } catch (e) {}
    }

    // 1) تسوية المراهنات المفتوحة (لو نتايجها نزلت)
    await settleOpenBets(studentId)

    // 2) تقييم الشارات (شروطها محسوبة من الداتابيس)
    var newBadges = await evaluateBadges(studentId)

    // 3) الحالة الأساسية
    var cfg = await getGameConfig(grade)
    var streak = await getStreakState(studentId)
    var today = await ensureDailyAssignment(studentId, grade)
    var balance = await xpBalance(studentId)

    // 4) آخر حركات دفتر XP (للسجل)
    var ledgerRows: any = await db.$queryRawUnsafe(
      'SELECT kind, amount, note, createdAt FROM XpLedger WHERE studentId = ? ORDER BY createdAt DESC, rowid DESC LIMIT 12', studentId
    )
    var ledger = (ledgerRows || []).map(function (r: any) {
      return { kind: String(r.kind), amount: Number(r.amount) || 0, note: String(r.note || ''), createdAt: r.createdAt }
    })

    // 5) الصندوق السري — آخر فتح + المتبقي من التهدئة
    var boxRows: any = await db.$queryRawUnsafe(
      'SELECT createdAt, rewardType, rewardValue FROM MysteryBoxOpen WHERE studentId = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1', studentId
    )
    var lastBoxAt: string | null = Array.isArray(boxRows) && boxRows.length > 0 ? String(boxRows[0].createdAt) : null
    var boxCooldownMs = 0
    if (lastBoxAt) {
      var lastMs = parseDbDate(lastBoxAt)
      if (isFinite(lastMs)) boxCooldownMs = Math.max(0, 24 * 3600 * 1000 - (Date.now() - lastMs))
    }
    var boxesOpened = 0
    try {
      var cntRows: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM MysteryBoxOpen WHERE studentId = ?', studentId)
      boxesOpened = Number((cntRows || [{}])[0].c) || 0
    } catch (e) {}

    // 6) الشارات — الكل + المفتوحة
    var badgeRows: any = await db.$queryRawUnsafe('SELECT code, name, nameEn, description, rarity, icon FROM Badge ORDER BY rarity DESC, code ASC')
    var mineRows: any = await db.$queryRawUnsafe('SELECT badgeCode, unlockedAt FROM StudentBadge WHERE studentId = ?', studentId)
    var mineMap: Record<string, string> = {}
    for (var i = 0; i < (mineRows || []).length; i++) mineMap[String(mineRows[i].badgeCode)] = String(mineRows[i].unlockedAt || '')
    // نستخدم التعريفات المحلية لو جدول الشارات فاضي (احتياط)
    var badgeDefs = Array.isArray(badgeRows) && badgeRows.length > 0
      ? (badgeRows || []).map(function (r: any) { return { code: String(r.code), name: String(r.name), nameEn: String(r.nameEn || ''), description: String(r.description || ''), rarity: String(r.rarity || 'common'), icon: String(r.icon || 'Award') } })
      : BADGE_DEFS
    var badges = badgeDefs.map(function (b) {
      return { code: b.code, name: b.name, nameEn: b.nameEn, description: b.description, rarity: b.rarity, icon: b.icon, unlocked: !!mineMap[b.code], unlockedAt: mineMap[b.code] || null }
    })

    // 7) المراهنات — المفتوحة + آخر المسواة
    var betRows: any = await db.$queryRawUnsafe(
      "SELECT id, targetType, targetId, targetTitle, wageredXp, targetPct, multiplier, status, payout, finalScore, finalMax, settledAt, createdAt FROM XpBet WHERE studentId = ? ORDER BY createdAt DESC LIMIT 20", studentId
    )
    var bets = (betRows || []).map(function (r: any) {
      return {
        id: String(r.id), targetType: String(r.targetType), targetId: String(r.targetId), targetTitle: String(r.targetTitle || ''),
        wageredXp: Number(r.wageredXp) || 0, targetPct: Number(r.targetPct) || 70, multiplier: Number(r.multiplier) || 2,
        status: String(r.status || 'open'), payout: Number(r.payout) || 0, finalScore: r.finalScore == null ? null : Number(r.finalScore),
        finalMax: r.finalMax == null ? null : Number(r.finalMax), settledAt: r.settledAt, createdAt: r.createdAt,
      }
    })

    return NextResponse.json({
      config: { grade: cfg.grade, cycleDays: cfg.cycleDays, xpPerCorrect: cfg.xpPerCorrect, mysteryEnabled: cfg.mysteryEnabled, bettingEnabled: cfg.bettingEnabled },
      streak: streak,
      today: today,
      xp: { balance: balance, ledger: ledger },
      mysteryBox: { lastOpenedAt: lastBoxAt, cooldownMs: boxCooldownMs, boxesOpened: boxesOpened },
      badges: badges,
      newBadges: newBadges,
      bets: bets,
      betTiers: [{ pct: 50, multiplier: 1.5 }, { pct: 70, multiplier: 2 }, { pct: 90, multiplier: 3 }],
      dayKey: cairoDayKey(),
      msToMidnight: msToCairoMidnight(),
    })
  } catch (error) {
    console.error('game state error:', error)
    return NextResponse.json({ error: 'حصل خطأ في تحميل مركز الألعاب' }, { status: 500 })
  }
}

// POST — تجهيز كوزمتيك البروفايل (من جوائز الصندوق السري)
// { studentId, action: 'equipCosmetic', key: '' } — فاضي = شِل التجهيز
export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) {}
    var studentId = String((body && body.studentId) || '').trim()
    var action = String((body && body.action) || '')
    var key = String((body && body.key) || '').trim()
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    if (action !== 'equipCosmetic') return NextResponse.json({ error: 'أكشن غير معروف' }, { status: 400 })

    await ensureGameTables()

    // لازم يكون مملوك له فعلًا (أو فاضي — سحب التجهيز)
    var rows: any = await db.$queryRawUnsafe('SELECT cosmetics FROM StreakState WHERE studentId = ? LIMIT 1', studentId)
    var owned: string[] = Array.isArray(rows) && rows.length > 0
      ? (function () { try { var p = JSON.parse(String(rows[0].cosmetics || '[]')); return Array.isArray(p) ? p.map(function (x: any) { return String(x) }) : [] } catch (e) { return [] } })()
      : []
    if (key && owned.indexOf(key) === -1) {
      return NextResponse.json({ error: 'الكوزمتيك ده مش مملوك ليك' }, { status: 403 })
    }
    await db.$executeRawUnsafe(
      'INSERT INTO StreakState (studentId, equippedCosmetic, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(studentId) DO UPDATE SET equippedCosmetic = excluded.equippedCosmetic, updatedAt = CURRENT_TIMESTAMP',
      studentId, key
    )
    return NextResponse.json({ ok: true, equippedCosmetic: key })
  } catch (error) {
    console.error('game state POST error:', error)
    return NextResponse.json({ error: 'حصل خطأ في تجهيز الشكل' }, { status: 500 })
  }
}
