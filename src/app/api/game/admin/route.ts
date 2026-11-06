// ============================================================
// /api/game/admin — (2026-ز38) لوحة المستر لمركز الألعاب
// GET  ?adminId= → إعدادات كل الصفوف + أسئلة التحدي المبنية + الشارات
//        + إحصائيات (XP المصروف/الصناديق/المراهنات المفتوحة/ستريكات نشيطة)
// POST { adminId, action, ... }:
//   • saveConfig { grade, cycleDays, xpPerCorrect, mysteryEnabled, bettingEnabled }
//     — المستر بيحدد دورة التحدي (7/10 يوم) لكل صف — طلب المستر الحرفي
//   • saveDay    { grade, dayNumber, questions: [{ text, options[4], correctIndex, xp }] }
//     — باني الأسئلة المتدرجة: يوم 1 سؤال، يوم 2 سؤالين… صعوبة تصاعدية
//   • deleteDay  { grade, dayNumber }
//   • adjustXp   { studentId, delta, note } — تحكم المستر في XP أي طالب
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import {
  ensureGameTables, addXp, evaluateBadges, BADGE_DEFS, parseQuestions,
} from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var adminId = String(sp.get('adminId') || '')
    if (!(await isAdmin(adminId))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    await ensureGameTables()

    var cfgRows: any = await db.$queryRawUnsafe('SELECT * FROM GameConfig ORDER BY grade ASC') || []
    var configs = (cfgRows || []).map(function (r: any) {
      return {
        grade: String(r.grade || ''),
        cycleDays: Number(r.cycleDays) || 7,
        xpPerCorrect: Number(r.xpPerCorrect) || 10,
        mysteryEnabled: Number(r.mysteryEnabled) !== 0,
        bettingEnabled: Number(r.bettingEnabled) !== 0,
        updatedAt: r.updatedAt,
      }
    })

    var dayRows: any = await db.$queryRawUnsafe('SELECT id, grade, dayNumber, questions, updatedAt FROM DailyChallengeDay ORDER BY grade ASC, dayNumber ASC') || []
    var days = (dayRows || []).map(function (r: any) {
      return {
        id: String(r.id), grade: String(r.grade || ''), dayNumber: Number(r.dayNumber) || 0,
        questions: parseQuestions(r.questions), updatedAt: r.updatedAt,
      }
    })

    // الشارات + عدد اللي فتحوها
    var badgeRows: any = await db.$queryRawUnsafe('SELECT code, name, nameEn, description, rarity, icon FROM Badge ORDER BY rarity DESC, code ASC') || []
    var badgeDefs = Array.isArray(badgeRows) && badgeRows.length > 0
      ? (badgeRows || []).map(function (r: any) { return { code: String(r.code), name: String(r.name), nameEn: String(r.nameEn || ''), description: String(r.description || ''), rarity: String(r.rarity || 'common'), icon: String(r.icon || 'Award') } })
      : BADGE_DEFS
    var badgeCounts: Record<string, number> = {}
    try {
      var bcRows: any = await db.$queryRawUnsafe('SELECT badgeCode, COUNT(*) AS c FROM StudentBadge GROUP BY badgeCode') || []
      for (var i = 0; i < bcRows.length; i++) badgeCounts[String(bcRows[i].badgeCode)] = Number(bcRows[i].c) || 0
    } catch (e) {}

    // إحصائيات عامة
    var stats = { activeStreaks: 0, totalXpIssued: 0, boxesOpened: 0, openBets: 0, dailySolves: 0, betWins: 0, betLosses: 0 }
    try {
      var s1: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM StreakState WHERE currentStreak > 0') || []
      stats.activeStreaks = Number((s1[0] || {}).c) || 0
    } catch (e) {}
    try {
      var s2: any = await db.$queryRawUnsafe('SELECT COALESCE(SUM(amount), 0) AS t FROM XpLedger WHERE amount > 0') || []
      stats.totalXpIssued = Math.round(Number((s2[0] || {}).t) || 0)
    } catch (e) {}
    try {
      var s3: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM MysteryBoxOpen') || []
      stats.boxesOpened = Number((s3[0] || {}).c) || 0
    } catch (e) {}
    try {
      var s4: any = await db.$queryRawUnsafe("SELECT COUNT(*) AS c FROM XpBet WHERE status = 'open'") || []
      stats.openBets = Number((s4[0] || {}).c) || 0
    } catch (e) {}
    try {
      var s5: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM DailySolve WHERE totalCount > 0') || []
      stats.dailySolves = Number((s5[0] || {}).c) || 0
    } catch (e) {}
    try {
      var s6: any = await db.$queryRawUnsafe("SELECT status, COUNT(*) AS c FROM XpBet WHERE status IN ('won','lost') GROUP BY status") || []
      for (var x = 0; x < s6.length; x++) {
        if (String(s6[x].status) === 'won') stats.betWins = Number(s6[x].c) || 0
        if (String(s6[x].status) === 'lost') stats.betLosses = Number(s6[x].c) || 0
      }
    } catch (e) {}

    return NextResponse.json({ configs: configs, days: days, badges: badgeDefs, badgeCounts: badgeCounts, stats: stats })
  } catch (error) {
    console.error('game admin GET error:', error)
    return NextResponse.json({ error: 'حصل خطأ في تحميل لوحة الألعاب' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) {}
    var adminId = String((body && body.adminId) || '')
    var action = String((body && body.action) || '')
    if (!(await isAdmin(adminId))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    await ensureGameTables()

    if (action === 'saveConfig') {
      var grade = String((body && body.grade) || '').trim()
      if (!grade) return NextResponse.json({ error: 'الصف مطلوب' }, { status: 400 })
      var cycleDays = Math.max(1, Math.min(30, Math.floor(Number((body && body.cycleDays) || 7))))
      var xpPerCorrect = Math.max(1, Math.min(500, Math.floor(Number((body && body.xpPerCorrect) || 10))))
      var mysteryEnabled = (body && body.mysteryEnabled === false) ? 0 : 1
      var bettingEnabled = (body && body.bettingEnabled === false) ? 0 : 1
      await db.$executeRawUnsafe(
        'INSERT INTO GameConfig (grade, cycleDays, xpPerCorrect, mysteryEnabled, bettingEnabled, updatedAt) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ' +
        'ON CONFLICT(grade) DO UPDATE SET cycleDays = excluded.cycleDays, xpPerCorrect = excluded.xpPerCorrect, mysteryEnabled = excluded.mysteryEnabled, bettingEnabled = excluded.bettingEnabled, updatedAt = CURRENT_TIMESTAMP',
        grade, cycleDays, xpPerCorrect, mysteryEnabled, bettingEnabled
      )
      return NextResponse.json({ ok: true })
    }

    if (action === 'saveDay') {
      var dGrade = String((body && body.grade) || '').trim()
      var dayNumber = Math.max(1, Math.min(30, Math.floor(Number((body && body.dayNumber) || 1))))
      var rawQuestions = (body && Array.isArray(body.questions)) ? body.questions : []
      if (!dGrade) return NextResponse.json({ error: 'الصف مطلوب' }, { status: 400 })
      var clean: any[] = []
      for (var q = 0; q < rawQuestions.length; q++) {
        var rq: any = rawQuestions[q] || {}
        var text = String(rq.text || '').trim()
        var opts = Array.isArray(rq.options) ? rq.options.map(function (o: any) { return String(o == null ? '' : o).slice(0, 300) }) : []
        var ci = Math.max(0, Math.min(Math.max(0, opts.length - 1), Math.floor(Number(rq.correctIndex) || 0)))
        var qx = Math.max(0, Math.min(1000, Math.floor(Number(rq.xp) || 0)))
        if (!text || opts.length < 2) continue
        clean.push({ text: text.slice(0, 2000), options: opts.slice(0, 6), correctIndex: ci, xp: qx })
      }
      if (clean.length === 0) return NextResponse.json({ error: 'لازم سؤال واحد على الأقل باختيارات صحيحة' }, { status: 400 })
      await db.$executeRawUnsafe('DELETE FROM DailyChallengeDay WHERE grade = ? AND dayNumber = ?', dGrade, dayNumber)
      var dayId = 'dcd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
      await db.$executeRawUnsafe(
        'INSERT INTO DailyChallengeDay (id, grade, dayNumber, questions, updatedAt) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)',
        dayId, dGrade, dayNumber, JSON.stringify(clean)
      )
      return NextResponse.json({ ok: true, savedQuestions: clean.length })
    }

    if (action === 'deleteDay') {
      var dlGrade = String((body && body.grade) || '').trim()
      var dlDay = Math.max(1, Math.min(30, Math.floor(Number((body && body.dayNumber) || 1))))
      await db.$executeRawUnsafe('DELETE FROM DailyChallengeDay WHERE grade = ? AND dayNumber = ?', dlGrade, dlDay)
      return NextResponse.json({ ok: true })
    }

    if (action === 'adjustXp') {
      var aStudentId = String((body && body.studentId) || '').trim()
      var delta = Math.round(Number((body && body.delta) || 0) * 10) / 10
      var note = String((body && body.note) || '').trim()
      if (!aStudentId) return NextResponse.json({ error: 'الطالب مطلوب' }, { status: 400 })
      if (!isFinite(delta) || delta === 0) return NextResponse.json({ error: 'قيمة XP مطلوبة (مش صفر)' }, { status: 400 })
      if (Math.abs(delta) > 10000) return NextResponse.json({ error: 'أقصى قيمة في المرة 10000' }, { status: 400 })
      var exists: any = await db.$queryRawUnsafe('SELECT id FROM Student WHERE id = ? LIMIT 1', aStudentId)
      if (!Array.isArray(exists) || exists.length === 0) return NextResponse.json({ error: 'الطالب مش موجود' }, { status: 404 })
      await addXp(aStudentId, 'admin', delta, note || 'تعديل من المستر')
      await evaluateBadges(aStudentId)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'أكشن غير معروف' }, { status: 400 })
  } catch (error) {
    console.error('game admin POST error:', error)
    return NextResponse.json({ error: 'حصل خطأ في حفظ إعدادات الألعاب' }, { status: 500 })
  }
}
