// ============================================================
// /api/game/bet — (2026-ز38) مراهنات XP — «توقع نتيجتك»
// POST   { studentId, targetType: 'exam'|'homework', targetId, grade, wageredXp, targetPct }
// GET    ?studentId= → مراهنات الطالب + الأهداف المتاحة (امتحانات/واجبات صفه ما سلّمش)
// DELETE ?studentId=&betId= → إلغاء خلال 10 دقايق (استرجاع الرهان)
// ------------------------------------------------------------
// القواعد:
//   • الرهان ممنوع بعد التسليم (لازم مايكونش فيه نتيجة)
//   • رهان واحد مفتوح لكل هدف
//   • الرهان بيُخصم من رصيد XP فورًا (دفتر XpLedger) — الكسب يرجع ×المضاعف
//   • مستويات التوقع: 50% → ×1.5 | 70% → ×2 | 90% → ×3
//   • التسوية خاملة (lazy) في /api/game/state و /api/game/leaderboard
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ensureGameTables, addXp, xpBalance, evaluateBadges, settleOpenBets, BET_TIERS, parseDbDate,
} from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

var MIN_WAGER = 10
var CANCEL_WINDOW_MS = 10 * 60 * 1000

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) {}
    var studentId = String((body && body.studentId) || '').trim()
    var targetType = String((body && body.targetType) || '').trim()
    var targetId = String((body && body.targetId) || '').trim()
    var grade = String((body && body.grade) || '').trim()
    var wageredXp = Math.floor(Number((body && body.wageredXp) || 0))
    var targetPct = Number((body && body.targetPct) || 0)

    if (!studentId || !targetId || (targetType !== 'exam' && targetType !== 'homework')) {
      return NextResponse.json({ error: 'بيانات الرهان ناقصة' }, { status: 400 })
    }
    var tier = BET_TIERS.find(function (t) { return t.pct === targetPct })
    if (!tier) return NextResponse.json({ error: 'مستوى التوقع غير صحيح' }, { status: 400 })
    if (wageredXp < MIN_WAGER) return NextResponse.json({ error: 'أقل رهان ' + MIN_WAGER + ' XP' }, { status: 400 })

    await ensureGameTables()

    // الطالب + صفه + إعدادات الصف (المراهنات ممكن تتقفل من اللوحة)
    var stRows: any = await db.$queryRawUnsafe('SELECT grade, status FROM Student WHERE id = ? LIMIT 1', studentId)
    if (!Array.isArray(stRows) || stRows.length === 0) return NextResponse.json({ error: 'الطالب مش موجود' }, { status: 404 })
    var studentGrade = String(stRows[0].grade || '')
    if (grade && grade !== studentGrade) return NextResponse.json({ error: 'الصف غير متطابق' }, { status: 400 })
    if (!studentGrade) return NextResponse.json({ error: 'الصف مش معروف' }, { status: 400 })

    var cfgRows: any = await db.$queryRawUnsafe('SELECT bettingEnabled FROM GameConfig WHERE grade = ? LIMIT 1', studentGrade)
    if (Array.isArray(cfgRows) && cfgRows.length > 0 && Number(cfgRows[0].bettingEnabled) === 0) {
      return NextResponse.json({ error: 'المراهنات مقفولة للصف ده' }, { status: 403 })
    }

    // الهدف موجود فعلًا وبتاع صف الطالب؟
    var target: any = null
    if (targetType === 'exam') {
      var ex: any = await db.$queryRawUnsafe('SELECT id, title, grade FROM Exam WHERE id = ? LIMIT 1', targetId)
      if (Array.isArray(ex) && ex.length > 0) target = ex[0]
    } else {
      var hw: any = await db.$queryRawUnsafe('SELECT id, title, grade FROM Homework WHERE id = ? LIMIT 1', targetId)
      if (Array.isArray(hw) && hw.length > 0) target = hw[0]
    }
    if (!target) return NextResponse.json({ error: 'الهدف مش موجود' }, { status: 404 })
    if (String(target.grade || '') !== studentGrade) return NextResponse.json({ error: 'الهدف مش لصفك' }, { status: 403 })

    // ممنوع الرهان بعد التسليم
    var resultRows: any = targetType === 'exam'
      ? await db.$queryRawUnsafe('SELECT id FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1', studentId, targetId)
      : await db.$queryRawUnsafe('SELECT id FROM HomeworkResult WHERE studentId = ? AND homeworkId = ? LIMIT 1', studentId, targetId)
    if (Array.isArray(resultRows) && resultRows.length > 0) {
      return NextResponse.json({ error: 'سلّمت ده بالفعل — الرهان اتقفل' }, { status: 409 })
    }

    // رهان واحد مفتوح لكل هدف
    var openRows: any = await db.$queryRawUnsafe(
      "SELECT id FROM XpBet WHERE studentId = ? AND targetType = ? AND targetId = ? AND status = 'open' LIMIT 1",
      studentId, targetType, targetId
    )
    if (Array.isArray(openRows) && openRows.length > 0) {
      return NextResponse.json({ error: 'عندك رهان مفتوح على ده بالفعل' }, { status: 409 })
    }

    // الرصيد صادق — الرهان ما يتعداش الرصيد
    var balance = await xpBalance(studentId)
    if (wageredXp > balance) return NextResponse.json({ error: 'رصيدك ' + balance + ' XP بس' }, { status: 400 })

    // 1) خصم الرهان من الدفتر  2) فتح الرهان
    var betId = 'bet_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
    await addXp(studentId, 'bet_stake', -wageredXp, 'رهان على: ' + String(target.title || ''), betId)
    await db.$executeRawUnsafe(
      "INSERT INTO XpBet (id, studentId, targetType, targetId, targetTitle, wageredXp, targetPct, multiplier, status, payout, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'open', 0, CURRENT_TIMESTAMP)",
      betId, studentId, targetType, targetId, String(target.title || ''), wageredXp, tier.pct, tier.multiplier
    )

    var newBadges = await evaluateBadges(studentId)

    return NextResponse.json({
      ok: true,
      betId: betId,
      potentialPayout: Math.round(wageredXp * tier.multiplier),
      balance: await xpBalance(studentId),
      newBadges: newBadges,
    })
  } catch (error) {
    console.error('game bet POST error:', error)
    return NextResponse.json({ error: 'حصل خطأ في حفظ الرهان' }, { status: 500 })
  }
}

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var studentId = String(sp.get('studentId') || '').trim()
    var grade = String(sp.get('grade') || '').trim()
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })

    await ensureGameTables()
    await settleOpenBets(studentId)

    var betRows: any = await db.$queryRawUnsafe(
      'SELECT id, targetType, targetId, targetTitle, wageredXp, targetPct, multiplier, status, payout, finalScore, finalMax, settledAt, createdAt FROM XpBet WHERE studentId = ? ORDER BY createdAt DESC LIMIT 30',
      studentId
    )
    var bets = (betRows || []).map(function (r: any) {
      return {
        id: String(r.id), targetType: String(r.targetType), targetId: String(r.targetId), targetTitle: String(r.targetTitle || ''),
        wageredXp: Number(r.wageredXp) || 0, targetPct: Number(r.targetPct) || 70, multiplier: Number(r.multiplier) || 2,
        status: String(r.status || 'open'), payout: Number(r.payout) || 0,
        finalScore: r.finalScore == null ? null : Number(r.finalScore), finalMax: r.finalMax == null ? null : Number(r.finalMax),
        settledAt: r.settledAt, createdAt: r.createdAt,
      }
    })

    // الأهداف المتاحة: امتحانات/واجبات الصف اللي الطالب ما سلّمش فيها + مفيش رهان مفتوح عليها
    var targets: any[] = []
    try {
      if (!grade) {
        var gRows: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
        grade = Array.isArray(gRows) && gRows.length > 0 ? String(gRows[0].grade || '') : ''
      }
      if (grade) {
        // الطالب — عشان فلترة استهداف الطلاب والمجموعات (نفس فلترة GET /api/exams و /api/homework)
        var meRows: any = await db.$queryRawUnsafe('SELECT groupId FROM Student WHERE id = ? LIMIT 1', studentId)
        var myGroupId = Array.isArray(meRows) && meRows.length > 0 ? String(meRows[0].groupId || '') : ''
        var nowSql = new Date().toISOString().slice(0, 19).replace('T', ' ')
        var examRows: any = await db.$queryRawUnsafe(
          "SELECT e.id, e.title, e.scheduledAt, e.targetStudentIds, e.targetGroupIds, 'exam' AS t FROM Exam e WHERE e.grade = ? " +
          "AND (e.scheduledAt IS NULL OR e.scheduledAt <= ?) " +
          "AND NOT EXISTS (SELECT 1 FROM ExamResult er WHERE er.examId = e.id AND er.studentId = ?) " +
          "AND NOT EXISTS (SELECT 1 FROM XpBet b WHERE b.targetType = 'exam' AND b.targetId = e.id AND b.studentId = ? AND b.status = 'open') " +
          'ORDER BY e.createdAt DESC LIMIT 20', grade, nowSql, studentId, studentId
        )
        var hwRows: any = await db.$queryRawUnsafe(
          "SELECT h.id, h.title, h.scheduledAt, h.targetStudentIds, h.targetGroupIds, 'homework' AS t FROM Homework h WHERE h.grade = ? " +
          "AND (h.scheduledAt IS NULL OR h.scheduledAt <= ?) " +
          "AND NOT EXISTS (SELECT 1 FROM HomeworkResult hr WHERE hr.homeworkId = h.id AND hr.studentId = ?) " +
          "AND NOT EXISTS (SELECT 1 FROM XpBet b WHERE b.targetType = 'homework' AND b.targetId = h.id AND b.studentId = ? AND b.status = 'open') " +
          'ORDER BY h.createdAt DESC LIMIT 20', grade, nowSql, studentId, studentId
        )
        var allRows = ([] as any[]).concat(examRows || [], hwRows || [])
        for (var i = 0; i < allRows.length; i++) {
          var r0 = allRows[i]
          // استهداف الطلاب المحددين — لو في قايمة وأنا مش فيها → مش متاح
          var tIds = String(r0.targetStudentIds || '').trim()
          if (tIds && tIds !== '[]') {
            try { var arr = JSON.parse(tIds); if (Array.isArray(arr) && arr.indexOf(studentId) === -1) continue } catch (e) {}
          }
          // استهداف المجموعات — لو في قايمة وأنا مش عضو فيها → مش متاح
          var gIds = String(r0.targetGroupIds || '').trim()
          if (gIds && gIds !== '[]') {
            try {
              var gArr = JSON.parse(gIds)
              if (Array.isArray(gArr) && (myGroupId === '' || gArr.indexOf(myGroupId) === -1)) continue
            } catch (e) {}
          }
          targets.push({ id: String(r0.id), title: String(r0.title || ''), type: String(r0.t) })
        }
      }
    } catch (e) { console.error('bet targets error:', e) }

    return NextResponse.json({ bets: bets, targets: targets, tiers: BET_TIERS, balance: await xpBalance(studentId) })
  } catch (error) {
    console.error('game bet GET error:', error)
    return NextResponse.json({ bets: [], targets: [], tiers: BET_TIERS, balance: 0 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var studentId = String(sp.get('studentId') || '').trim()
    var betId = String(sp.get('betId') || '').trim()
    if (!studentId || !betId) return NextResponse.json({ error: 'بيانات ناقصة' }, { status: 400 })

    await ensureGameTables()
    var rows: any = await db.$queryRawUnsafe("SELECT id, wageredXp, createdAt FROM XpBet WHERE id = ? AND studentId = ? AND status = 'open' LIMIT 1", betId, studentId)
    if (!Array.isArray(rows) || rows.length === 0) return NextResponse.json({ error: 'الرهان مش مفتوح' }, { status: 404 })
    var createdMs = parseDbDate(rows[0].createdAt)
    if (isFinite(createdMs) && Date.now() - createdMs > CANCEL_WINDOW_MS) {
      return NextResponse.json({ error: 'الإلغاء متاح في أول 10 دقايق بس' }, { status: 400 })
    }
    var wager = Number(rows[0].wageredXp) || 0
    await addXp(studentId, 'bet_refund', wager, 'إلغاء رهان — استرجاع')
    await db.$executeRawUnsafe("UPDATE XpBet SET status = 'cancelled', settledAt = CURRENT_TIMESTAMP WHERE id = ?", betId)
    return NextResponse.json({ ok: true, balance: await xpBalance(studentId) })
  } catch (error) {
    console.error('game bet DELETE error:', error)
    return NextResponse.json({ error: 'حصل خطأ في الإلغاء' }, { status: 500 })
  }
}
