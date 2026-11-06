// ============================================================
// /api/game/solve — (2026-ز38) تسليم حل التحدي اليومي
// POST { studentId, grade, answers: number[] }
//   • بيقري الأسئلة الموكلّة للطالب النهارده (المثبتة من GET الحالة)
//   • بيصحح على السيرفر — بيدّي XP لكل إجابة صح (XP السؤال أو إعدادات الصف)
//   • الستريك +1 والدورة بتكمل (لو الستريك كان صفريًا → بيدأ من اليوم الأول)
//   • ممنوع الحل مرتين في نفس اليوم (UNIQUE dayKey)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  ensureGameTables, getGameConfig, getStreakState, addXp, evaluateBadges,
  parseQuestions, cairoDayKey, todayCycleDayNumber, getDayQuestions, xpBalance,
} from '@/lib/game'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) {}
    var studentId = String((body && body.studentId) || '').trim()
    var grade = String((body && body.grade) || '').trim()
    var answers: number[] = Array.isArray(body && body.answers) ? (body.answers || []).map(function (a: any) { return Number(a) || -1 }) : []
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })

    await ensureGameTables()

    // الصف من الداتابيس (مصدر الحقيقة)
    try {
      var stRows: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
      if (Array.isArray(stRows) && stRows.length > 0 && stRows[0].grade) grade = String(stRows[0].grade)
    } catch (e) {}
    if (!grade) return NextResponse.json({ error: 'الصف مش معروف' }, { status: 400 })

    var cfg = await getGameConfig(grade)
    // 1) الحالة — بتطبق قاعدة اليوم الضايع (ريست/درع) قبل الحساب
    var streak = await getStreakState(studentId)
    var todayKey = cairoDayKey()

    var rows: any = await db.$queryRawUnsafe('SELECT * FROM DailySolve WHERE studentId = ? AND dayKey = ? LIMIT 1', studentId, todayKey)
    var row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

    // 2) لو مفيش صف توكيل (نادر — الطالب ما فتحش الحالة الأول) → بنتوكل دلوقتي
    if (!row) {
      var dayNumber0 = todayCycleDayNumber(streak.cycleDay, cfg.cycleDays)
      var qs0 = await getDayQuestions(grade, dayNumber0, true)
      var id0 = 'ds_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
      try {
        await db.$executeRawUnsafe(
          'INSERT OR IGNORE INTO DailySolve (id, studentId, grade, dayKey, dayNumber, correctCount, totalCount, xpEarned, questions, createdAt) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, CURRENT_TIMESTAMP)',
          id0, studentId, grade, todayKey, dayNumber0, JSON.stringify(qs0)
        )
        rows = await db.$queryRawUnsafe('SELECT * FROM DailySolve WHERE studentId = ? AND dayKey = ? LIMIT 1', studentId, todayKey)
        row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
      } catch (e) { console.error('solve assign error:', e) }
      if (!row) return NextResponse.json({ error: 'مفيش أسئلة متاحة للتحدي النهارده — المستر معملش أسئلة لسه' }, { status: 409 })
    }

    if ((Number(row.totalCount) || 0) > 0) {
      return NextResponse.json({ error: 'حللت تحدي النهارده بالفعل — يلا استنى تحدي بكرة!', solved: true }, { status: 409 })
    }

    // 3) التصحيح — ولو الصف كان فاضي من الأسئلة (المستر نزلها متأخر) بنحاول نتوكّل تاني
    var assigned = parseQuestions(row.questions)
    if (assigned.length === 0 && (Number(row.totalCount) || 0) === 0) {
      var dayNumberR = Number(row.dayNumber) || todayCycleDayNumber(streak.cycleDay, cfg.cycleDays)
      assigned = await getDayQuestions(grade, dayNumberR, true)
      if (assigned.length > 0) {
        try {
          await db.$executeRawUnsafe('UPDATE DailySolve SET questions = ? WHERE id = ?', JSON.stringify(assigned), row.id)
        } catch (e) { console.error('solve refresh error:', e) }
      }
    }
    if (assigned.length === 0) return NextResponse.json({ error: 'مفيش أسئلة متاحة للتحدي النهارده — المستر معملش أسئلة لسه' }, { status: 409 })
    var correctCount = 0
    var xpEarned = 0
    for (var i = 0; i < assigned.length; i++) {
      var q = assigned[i]
      var isCorrect = answers[i] != null && answers[i] === q.correctIndex
      if (isCorrect) {
        correctCount++
        xpEarned += q.xp > 0 ? q.xp : cfg.xpPerCorrect
      }
    }

    // 4) تحديث الستريك والدورة
    var newStreak = streak.currentStreak === 0 ? 1 : streak.currentStreak + 1
    var newCycleDay = (Number(streak.cycleDay) || 0) + 1
    var newBest = Math.max(streak.bestStreak, newStreak)
    await db.$executeRawUnsafe(
      'INSERT INTO StreakState (studentId, grade, currentStreak, bestStreak, cycleDay, lastSolveDayKey, shields, cosmetics, equippedCosmetic, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP) ' +
      'ON CONFLICT(studentId) DO UPDATE SET grade = excluded.grade, currentStreak = excluded.currentStreak, bestStreak = excluded.bestStreak, cycleDay = excluded.cycleDay, lastSolveDayKey = excluded.lastSolveDayKey, updatedAt = CURRENT_TIMESTAMP',
      studentId, grade, newStreak, newBest, newCycleDay, todayKey, streak.shields, JSON.stringify(streak.cosmetics), streak.equippedCosmetic
    )

    // 5) حفظ النتيجة + XP في الدفتر
    await db.$executeRawUnsafe(
      'UPDATE DailySolve SET correctCount = ?, totalCount = ?, xpEarned = ? WHERE id = ?',
      correctCount, assigned.length, xpEarned, row.id
    )
    if (xpEarned > 0) {
      await addXp(studentId, 'daily', xpEarned, 'تحدي اليوم ' + todayKey + ' — ' + correctCount + '/' + assigned.length + ' صح')
    }

    // 6) شارات جديدة؟
    var newBadges = await evaluateBadges(studentId)

    return NextResponse.json({
      ok: true,
      correctCount: correctCount,
      totalCount: assigned.length,
      xpEarned: xpEarned,
      streak: newStreak,
      cycleDay: newCycleDay,
      cycleDays: cfg.cycleDays,
      startedNewCycle: streak.currentStreak === 0,
      balance: await xpBalance(studentId),
      newBadges: newBadges,
      // الإجابات الصحيحة للعرض (بعد التصحيح)
      correctIndices: assigned.map(function (q) { return q.correctIndex }),
    })
  } catch (error) {
    console.error('game solve error:', error)
    return NextResponse.json({ error: 'حصل خطأ في تسليم التحدي' }, { status: 500 })
  }
}
