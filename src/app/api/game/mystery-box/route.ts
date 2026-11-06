// ============================================================
// /api/game/mystery-box — (2026-ز38) صندوق الأسرار اليومي
// POST { studentId }
//   • صندوق واحد كل 24 ساعة (تهدئة من آخر فتح)
//   • جوائز عشوائية: XP (مستويات) + درع ستريك (حد أقصى 3) + كوزمتيك حصري
//   • لو الدروع مليانة أو الكوزمتيك خلص → الحالة بتتحول XP بديل
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ensureGameTables, addXp, xpBalance, evaluateBadges, COSMETIC_POOL,
} from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

var COOLDOWN_MS = 24 * 3600 * 1000

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) {}
    var studentId = String((body && body.studentId) || '').trim()
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })

    await ensureGameTables()

    // تهدئة الـ 24 ساعة
    var lastRows: any = await db.$queryRawUnsafe(
      'SELECT createdAt FROM MysteryBoxOpen WHERE studentId = ? ORDER BY createdAt DESC, rowid DESC LIMIT 1', studentId
    )
    if (Array.isArray(lastRows) && lastRows.length > 0) {
      var lastMs = Date.parse(String(lastRows[0].createdAt).replace(' ', 'T') + 'Z')
      if (isFinite(lastMs)) {
        var remaining = COOLDOWN_MS - (Date.now() - lastMs)
        if (remaining > 0) {
          return NextResponse.json({ error: 'الصندوق لسه مقفول — استنى التهديئة', cooldownMs: remaining }, { status: 429 })
        }
      }
    }

    // حالة الدروع + الكوزمتيك
    var streakRows: any = await db.$queryRawUnsafe('SELECT shields, cosmetics FROM StreakState WHERE studentId = ? LIMIT 1', studentId)
    var shields = Array.isArray(streakRows) && streakRows.length > 0 ? Number(streakRows[0].shields) || 0 : 0
    var owned: string[] = Array.isArray(streakRows) && streakRows.length > 0
      ? (function () { try { var p = JSON.parse(String(streakRows[0].cosmetics || '[]')); return Array.isArray(p) ? p.map(function (x: any) { return String(x) }) : [] } catch (e) { return [] } })()
      : []

    // سحبة الجايزة — أوزان: XP صغير 45% | متوسط 20% | كبير 10% | درع 15% | كوزمتيك 10%
    var roll = Math.random() * 100
    var reward: any = null

    if (roll < 45) {
      var small = [15, 20, 25, 40, 60][Math.floor(Math.random() * 5)]
      reward = { type: 'xp', amount: small, label: '+' + small + ' XP' }
    } else if (roll < 65) {
      var mid = 60 + Math.floor(Math.random() * 91) // 60–150
      reward = { type: 'xp', amount: mid, label: '+' + mid + ' XP' }
    } else if (roll < 75) {
      var big = 150 + Math.floor(Math.random() * 151) // 150–300
      reward = { type: 'xp', amount: big, label: '+' + big + ' XP' }
    } else if (roll < 90) {
      if (shields >= 3) {
        reward = { type: 'xp', amount: 60, label: '+60 XP (دروعك مليانة — الجايزة بقت XP)', note: 'بدل درع — الدروع مليانة (3/3)' }
      } else {
        reward = { type: 'shield', label: '🛡️ درع ستريك — بيغطي يوم ضايع واحد' }
      }
    } else {
      var notOwned = COSMETIC_POOL.filter(function (c) { return owned.indexOf(c.key) === -1 })
      if (notOwned.length === 0) {
        reward = { type: 'xp', amount: 80, label: '+80 XP (الكوزمتيك خلص — الجايزة بقت XP)', note: 'بدل كوزمتيك — معاك كل الأشكال' }
      } else {
        var pick = notOwned[Math.floor(Math.random() * notOwned.length)]
        reward = { type: 'cosmetic', cosmeticKey: pick.key, label: '✨ ' + pick.label + ' — شكل حصري لبروفايلك' }
      }
    }

    // تسجيل الفتح + تطبيق الجايزة
    var boxId = 'box_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
    var rewardValue = reward.type === 'xp' ? String(reward.amount) : reward.type === 'shield' ? 'shield' : String(reward.cosmeticKey)
    await db.$executeRawUnsafe(
      "INSERT INTO MysteryBoxOpen (id, studentId, rewardType, rewardValue, createdAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)",
      boxId, studentId, reward.type === 'xp' ? 'xp' : reward.type, rewardValue
    )

    if (reward.type === 'xp') {
      await addXp(studentId, 'mystery', reward.amount, 'صندوق الأسرار — ' + (reward.note || 'XP'))
    } else if (reward.type === 'shield') {
      // الحد الأقصى 3 دروع — بنضمنه بالقراءة والتحديث (SQLite آمن هنا)
      var shieldRows: any = await db.$queryRawUnsafe(
        'SELECT shields FROM StreakState WHERE studentId = ? LIMIT 1', studentId
      )
      var currentShields = Array.isArray(shieldRows) && shieldRows.length > 0 ? Number(shieldRows[0].shields) || 0 : 0
      var newShields = Math.min(3, currentShields + 1)
      await db.$executeRawUnsafe(
        "INSERT INTO StreakState (studentId, shields, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(studentId) DO UPDATE SET shields = excluded.shields, updatedAt = CURRENT_TIMESTAMP",
        studentId, newShields
      )
    } else if (reward.type === 'cosmetic') {
      owned.push(String(reward.cosmeticKey))
      await db.$executeRawUnsafe(
        "INSERT INTO StreakState (studentId, cosmetics, updatedAt) VALUES (?, ?, CURRENT_TIMESTAMP) " +
        "ON CONFLICT(studentId) DO UPDATE SET cosmetics = excluded.cosmetics, updatedAt = CURRENT_TIMESTAMP",
        studentId, JSON.stringify(owned)
      )
    }

    var newBadges = await evaluateBadges(studentId)
    var openedRows: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM MysteryBoxOpen WHERE studentId = ?', studentId)
    var boxesOpened = Number((openedRows || [{}])[0].c) || 0

    return NextResponse.json({
      ok: true,
      reward: reward,
      balance: await xpBalance(studentId),
      boxesOpened: boxesOpened,
      newBadges: newBadges,
    })
  } catch (error) {
    console.error('mystery box error:', error)
    return NextResponse.json({ error: 'حصل خطأ في فتح الصندوق' }, { status: 500 })
  }
}
