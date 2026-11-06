// ============================================================
// (2026-غ1) نظام التحفيز الكامل — Gamification Ecosystem
// طلب المستر حرفيًا:
//  «عايز تحدي يومي + ستريك + صندوق كنز + شارات + مر Wegو + ترتيب XP منفصل»
//  • التحدي اليومي: سلسلة أسئلة مقسّمة على أيام (7/10 يوم) لكل صف
//    — أول يوم بيفتح أول ما الطالب يبدأ، وبعدها يوم ورا يوم
//    — الطالب لو فات يوم كامل من غير ما يحل خلال 24 ساعة → الستريك بيصفّر
//      ويرجع يبدأ من اليوم الأول تاني (إلا لو معاه درع حماية من صندوق الكنز)
//  • صندوق الكنز: كل 24 ساعة يفتحه، جوايه XP / درع ستريك / هالات نادرة
//    — جايزة 60 XP **نادرة** لأن أسئلة المستر مش بتعدّي 60 درجة
//  • الشارات: الصاروخ / الثابت / ساحر الرياضيات / جامع الكنوز / بطل التحدي
//    (محذوف نهائيًا: المقامر الشجاع — طلب المستر يشيله)
//  • الرهان (Prediction Bet): الطالب يراهن XP على عدد الإجابات الصحيحة قبل امتحان
//  • لوحة الترتيب: لوحة النقاط الدراسية (PointsLedger) منفصلة تمامًا عن
//    لوحة XP (GamifyProfile) — وطلب المستر: تصفير لوحة الترتيب **حاليًا**
//    وبعدها ترجع تشتغل عادي من الصفر
// ملاحظة مهمة: كل الجداول دي بتتعمل ذاتيًا (CREATE IF NOT EXISTS) — نفس
// نمط الشفاء الذاتي بتاع المنصة، أي نشر جديد بيشتغل من غير migration.
// ============================================================

import { db } from '@/lib/db'
import { notifyStudent } from '@/lib/notify'
import { notifyParentsOfGamify } from '@/lib/parent-notify'

/* ----------------------------- أدوات الوقت ----------------------------- */

/** تاريخ القاهرة YYYY-MM-DD — نافذة اليوم بتحسب بتوقيت مصر */
export function cairoDateKey(d?: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d || new Date())
  } catch (e) { return new Date().toISOString().slice(0, 10) }
}

/** الساعة الحالية بتوقيت القاهرة (0-23) + الدقايق */
export function cairoClock(): { hour: number; minute: number } {
  try {
    var parts = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date())
    var hour = 0, minute = 0
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') hour = parseInt(parts[i].value, 10) || 0
      if (parts[i].type === 'minute') minute = parseInt(parts[i].value, 10) || 0
    }
    return { hour: hour === 24 ? 0 : hour, minute }
  } catch (e) {
    var now = new Date()
    return { hour: now.getUTCHours(), minute: now.getUTCMinutes() }
  }
}

/** مليم ثانية لحد منتصف الليل بتوقيت القاهرة — نافذة اليوم */
export function msUntilCairoMidnight(): number {
  try {
    var nowParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
    var midnight = new Date(nowParts + 'T00:00:00+02:00')
    midnight.setDate(midnight.getDate() + 1)
    return Math.max(0, midnight.getTime() - Date.now())
  } catch (e) {
    return 6 * 3600 * 1000
  }
}

/** فرق الأيام بين تاريخين YYYY-MM-DD */
function daysBetween(a: string, b: string): number {
  try {
    var da = new Date(a + 'T00:00:00Z').getTime()
    var dbb = new Date(b + 'T00:00:00Z').getTime()
    return Math.round((dbb - da) / 86400000)
  } catch (e) { return 0 }
}

/** أمس بتوقيت القاهرة */
function cairoYesterday(): string {
  var d = new Date()
  d.setDate(d.getDate() - 1)
  return cairoDateKey(d)
}

/** تحويل قيمة DATETIME (Prisma بيرجع Date object أحيانًا وSQLite بيرجع نص) لملي ثانية UTC */
function tsToMs(v: any): number {
  if (!v) return NaN
  if (v instanceof Date) return v.getTime()
  var s = String(v).trim()
  // SQLite CURRENT_TIMESTAMP بصيغة 'YYYY-MM-DD HH:MM:SS' — دي UTC
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) {
    var t = new Date(s.replace(' ', 'T') + 'Z').getTime()
    return isNaN(t) ? NaN : t
  }
  var t2 = new Date(s).getTime()
  return isNaN(t2) ? NaN : t2
}

function id(): string {
  return 'gm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* ----------------------------- الشفاء الذاتي ----------------------------- */

var _tablesReady = false
export async function ensureGamifyTables(): Promise<void> {
  if (_tablesReady) return
  var DDL = [
    // ملف الطالب — XP + ستريك + دروع + هالات
    'CREATE TABLE IF NOT EXISTS GamifyProfile (studentId TEXT PRIMARY KEY, grade TEXT NOT NULL DEFAULT "", xp REAL NOT NULL DEFAULT 0, streak INTEGER NOT NULL DEFAULT 0, bestStreak INTEGER NOT NULL DEFAULT 0, lastActiveDate TEXT NOT NULL DEFAULT "", epoch INTEGER NOT NULL DEFAULT 0, shield INTEGER NOT NULL DEFAULT 0, cosmetics TEXT NOT NULL DEFAULT "[]", openedBoxAt DATETIME, lastNagDate TEXT NOT NULL DEFAULT "", lastParentNagDate TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // سلسلة التحدي — لكل صف سلسلة نشطة بأيام
    'CREATE TABLE IF NOT EXISTS ChallengeSeries (id TEXT PRIMARY KEY, grade TEXT NOT NULL, title TEXT NOT NULL, totalDays INTEGER NOT NULL DEFAULT 7, prize TEXT NOT NULL DEFAULT "", active INTEGER NOT NULL DEFAULT 0, publishedAt DATETIME, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // أسئلة التحدي — كل سؤال على يوم محدد
    'CREATE TABLE IF NOT EXISTS ChallengeQuestion (id TEXT PRIMARY KEY, seriesId TEXT NOT NULL, dayNumber INTEGER NOT NULL DEFAULT 1, orderInDay INTEGER NOT NULL DEFAULT 1, text TEXT NOT NULL, options TEXT NOT NULL DEFAULT "[]", correctIndex INTEGER NOT NULL DEFAULT -1, correctText TEXT NOT NULL DEFAULT "", xpReward REAL NOT NULL DEFAULT 20, difficulty TEXT NOT NULL DEFAULT "normal", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // محاولات الطالب — صف واحد لكل (طالب, سؤال, حقبة) — الحقبة بتزيد لما السلسلة تعاد من الأول
    'CREATE TABLE IF NOT EXISTS GamifyAttempt (id TEXT PRIMARY KEY, seriesId TEXT NOT NULL, studentId TEXT NOT NULL, questionId TEXT NOT NULL, dayNumber INTEGER NOT NULL DEFAULT 1, epoch INTEGER NOT NULL DEFAULT 0, correct INTEGER NOT NULL DEFAULT 0, rewarded INTEGER NOT NULL DEFAULT 0, xp REAL NOT NULL DEFAULT 0, dateKey TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attempt_unique ON GamifyAttempt(seriesId, studentId, questionId, epoch)',
    // الشارات — قابلة للتعديل من الأدمن (إضافة/حذف/تعديل النص)
    'CREATE TABLE IF NOT EXISTS Badge (id TEXT PRIMARY KEY, name TEXT NOT NULL, desc TEXT NOT NULL DEFAULT "", icon TEXT NOT NULL DEFAULT "🏅", rarity TEXT NOT NULL DEFAULT "common", conditionType TEXT NOT NULL DEFAULT "streak_days", threshold REAL NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS StudentBadge (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, badgeId TEXT NOT NULL, unlockedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(studentId, badgeId))',
    // سجل فتح صندوق الكنز
    'CREATE TABLE IF NOT EXISTS MysteryBoxLog (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, rewardType TEXT NOT NULL, rewardValue REAL NOT NULL DEFAULT 0, rewardLabel TEXT NOT NULL DEFAULT "", rarity TEXT NOT NULL DEFAULT "common", openedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // دفتر XP — مصدر كل نقطة (تحدي/صندوق/رهان/شارة)
    'CREATE TABLE IF NOT EXISTS XpLedger (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, source TEXT NOT NULL, amount REAL NOT NULL DEFAULT 0, note TEXT NOT NULL DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE INDEX IF NOT EXISTS idx_xp_ledger_student ON XpLedger(studentId, createdAt)',
    // رهانات XP — الطالب يتنبأ بعدد الإجابات الصحيحة قبل الامتحان **أو الواجب**
    // (ج2: «المراهنات تبقى على الواجبات والامتحانات، تبقى على الاثنين»)
    'CREATE TABLE IF NOT EXISTS XpBet (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, examId TEXT NOT NULL, examTitle TEXT NOT NULL DEFAULT "", stake REAL NOT NULL DEFAULT 0, prediction REAL NOT NULL DEFAULT 0, totalQuestions INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT "locked", payout REAL NOT NULL DEFAULT 0, actual REAL, settledAt DATETIME, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // (ج2) عمود نوع الهدف — exam أو homework — عمود متسامح للداتا القديمة (كلها امتحانات)
    // + جدول إخفاء إشعار السؤال بالـ X — «لما بدوس على الـ X ما بتبقاش موجودة»
    'CREATE TABLE IF NOT EXISTS GamifyPopupDismissal (studentId TEXT NOT NULL, seriesId TEXT NOT NULL, day INTEGER NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(studentId, seriesId, day))',
    // علامة تصفير لوحة الترتيب الدراسية — طلب المستر «تمسح حاليًا وبعدها تشتغل عادي»
    'CREATE TABLE IF NOT EXISTS LeaderboardReset (id TEXT PRIMARY KEY, resetAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  ]
  for (var i = 0; i < DDL.length; i++) {
    try { await db.$executeRawUnsafe(DDL[i]) } catch (e) { console.error('[gamify] DDL fail #' + i, e) }
  }
  // (ج2) عمود targetType للرهانات القديمة — كلها كانت امتحانات
  try { await db.$executeRawUnsafe("ALTER TABLE XpBet ADD COLUMN targetType TEXT NOT NULL DEFAULT 'exam'") } catch (e) { /* موجود أصلًا */ }
  _tablesReady = true
  try { await seedDefaultBadges() } catch (e) {}
}

/* ----------------------------- الشارات الافتراضية ----------------------------- */
/* المقامر الشجاع **محذوف نهائيًا** بطلب المستر — بدلها بالشارات دي */

var DEFAULT_BADGES = [
  { id: 'badge_rocket', name: 'الصاروخ 🚀', desc: 'سلّمت واجب بدرجة ممتازة خلال أول 24 ساعة من نزوله — سرعة خارقة!', icon: '🚀', rarity: 'common', conditionType: 'homework_speed', threshold: 24, sort: 1 },
  { id: 'badge_consistent', name: 'الثابت 🔥', desc: 'حليت تحدي اليوم 7 أيام متتالية من غير ما تفوت يوم — استمرارية من حديد!', icon: '🔥', rarity: 'rare', conditionType: 'streak_days', threshold: 7, sort: 2 },
  { id: 'badge_wizard', name: 'ساحر الرياضيات 🧙', desc: 'دقتك في تحدي اليوم وصلت 90%+ على 15 محاولة على الأقل — عقل رياضي خرافي!', icon: '🧙', rarity: 'legendary', conditionType: 'accuracy', threshold: 90, sort: 3 },
  { id: 'badge_collector', name: 'جامع الكنوز 💎', desc: 'جمعت 500 XP من التحدي اليومي والصندوق السري — أرشيف نقاط أسطوري!', icon: '💎', rarity: 'rare', conditionType: 'xp_total', threshold: 500, sort: 4 },
  { id: 'badge_champion', name: 'بطل التحدي 🏆', desc: 'خلّصت سلسلة تحدي كاملة من أول يوم لآخر يوم — انت الچامبيون!', icon: '🏆', rarity: 'legendary', conditionType: 'challenge_days', threshold: 10, sort: 5 },
]

/** زرع الشارات الافتراضية لو مش موجودة + تنظيف المقامر الشجاع لو موجود من قديم */
export async function seedDefaultBadges(): Promise<void> {
  try {
    await db.$executeRawUnsafe("DELETE FROM Badge WHERE name LIKE '%المقامر%'")
  } catch (e) {}
  for (var i = 0; i < DEFAULT_BADGES.length; i++) {
    var b = DEFAULT_BADGES[i]
    try {
      var exists: any = await db.$queryRawUnsafe('SELECT id FROM Badge WHERE id = ?', b.id)
      if (!exists || exists.length === 0) {
        await db.$executeRawUnsafe(
          'INSERT INTO Badge (id, name, desc, icon, rarity, conditionType, threshold, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)',
          b.id, b.name, b.desc, b.icon, b.rarity, b.conditionType, b.threshold, b.sort
        )
      }
    } catch (e) { console.error('[gamify] seed badge fail', b.id, e) }
  }
}

/* ----------------------------- ملف الطالب ----------------------------- */

export interface GamifyProfileRow {
  studentId: string; grade: string; xp: number; streak: number; bestStreak: number
  lastActiveDate: string; epoch: number; shield: number; cosmetics: string
  openedBoxAt: string | null; lastNagDate: string; lastParentNagDate: string
}

export async function getOrCreateProfile(studentId: string, grade?: string): Promise<GamifyProfileRow> {
  await ensureGamifyTables()
  try {
    var rows: any = await db.$queryRawUnsafe('SELECT * FROM GamifyProfile WHERE studentId = ?', studentId)
    if (rows && rows.length) return rows[0] as GamifyProfileRow
  } catch (e) {}
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO GamifyProfile (studentId, grade) VALUES (?, ?)',
      studentId, String(grade || '')
    )
  } catch (e) {}
  var created: any = await db.$queryRawUnsafe('SELECT * FROM GamifyProfile WHERE studentId = ?', studentId)
  return (created && created[0]) as GamifyProfileRow
}

/** إضافة/خصم XP + كتابتها في الدفتر */
export async function awardXp(studentId: string, source: string, amount: number, note?: string): Promise<void> {
  await ensureGamifyTables()
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO XpLedger (id, studentId, source, amount, note) VALUES (?, ?, ?, ?, ?)',
      id(), studentId, source, amount, String(note || '').slice(0, 200)
    )
    await db.$executeRawUnsafe(
      'UPDATE GamifyProfile SET xp = xp + ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
      amount, studentId
    )
  } catch (e) { console.error('[gamify] awardXp fail', e) }
}

/* ----------------------------- السلسلة النشطة ----------------------------- */

export async function getActiveSeries(grade: string): Promise<any | null> {
  await ensureGamifyTables()
  try {
    var rows: any = await db.$queryRawUnsafe(
      'SELECT * FROM ChallengeSeries WHERE grade = ? AND active = 1 ORDER BY createdAt DESC LIMIT 1',
      grade
    )
    if (rows && rows.length) return rows[0]
    // احتياطي: أول سلسلة نشطة عامة (لو المستر نزّلها لكل الصفوف)
    var any: any = await db.$queryRawUnsafe(
      "SELECT * FROM ChallengeSeries WHERE grade IN ('', '*', 'all') AND active = 1 ORDER BY createdAt DESC LIMIT 1"
    )
    return (any && any[0]) || null
  } catch (e) { return null }
}

export async function getSeriesQuestions(seriesId: string): Promise<any[]> {
  try {
    var rows: any = await db.$queryRawUnsafe(
      'SELECT * FROM ChallengeQuestion WHERE seriesId = ? ORDER BY dayNumber ASC, orderInDay ASC, createdAt ASC',
      seriesId
    )
    return rows || []
  } catch (e) { return [] }
}

/* ----------------------------- الحالة الكاملة للطالب ----------------------------- */

/**
 * قلب النظام — بيرجع كل حاجة الـ UI محتاجها في نداء واحد:
 * الملف + السلسلة + اليوم المفتوح + أسئلة النهاردة (من غير الإجابة الصح!)
 * + حالة الستريك + صندوق الكنز + الشارات + الرهانات + علامة التحذير
 */
export async function computeStudentState(studentId: string, grade: string): Promise<any> {
  await ensureGamifyTables()
  var profile: any = await getOrCreateProfile(studentId, grade)

  // 1) فحص فجوة الستريك — لو فات يوم كامل من غير حل → تصفير أو درع
  var today = cairoDateKey()
  var yesterday = cairoYesterday()
  var streakReset = false
  if (profile.lastActiveDate && profile.lastActiveDate !== today) {
    var gap = daysBetween(profile.lastActiveDate, today)
    if (gap >= 2) {
      if (Number(profile.shield) > 0) {
        // درع من صندوق الكنز — الستريك ينجم عنه
        await db.$executeRawUnsafe(
          'UPDATE GamifyProfile SET shield = shield - 1, lastActiveDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
          yesterday, studentId
        )
        profile.shield = Number(profile.shield) - 1
        profile.lastActiveDate = yesterday
        try {
          await notifyStudent(studentId, 'gamify', '🛡️ الدرع أنقذ الستريك!', 'فاتك يوم من غير حل — بس الدرع اللي من صندوق الكنز حماية ستريكك. كمّل النهاردة!')
        } catch (e) {}
      } else {
        // الطالب فات 24 ساعة كاملة → ستريك صفر + رجوع من اليوم الأول
        await db.$executeRawUnsafe(
          'UPDATE GamifyProfile SET streak = 0, epoch = epoch + 1, lastActiveDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
          today, studentId
        )
        profile.streak = 0
        profile.epoch = Number(profile.epoch) + 1
        profile.lastActiveDate = today
        streakReset = true
        try {
          await notifyStudent(studentId, 'gamify', '💔 الستريك اتكسر!', 'فاتك يوم كامل من غير ما تحل سؤال اليوم — بانتقطع السلسلة وبدأنا من اليوم الأول. ورّينا انت بس! 🔥')
        } catch (e) {}
      }
    }
  }

  // 2) تسوية الرهانات المعلّة (نتيجة الامتحان نزلت → نحسم فورًا)
  try { await settleBets(studentId) } catch (e) {}

  // 3) السلسلة النشطة + اليوم المفتوح
  var series = await getActiveSeries(grade)
  var unlockedDay = 0
  var dayQuestions: any[] = []
  var todayAnsweredCount = 0
  var todayTotal = 0
  var totalQuestions = 0

  if (series) {
    var questions = await getSeriesQuestions(series.id)
    totalQuestions = questions.length
    // اليوم المفتوح = أول يوم مش مكتمل في الحقبة الحالية
    var byDay: Record<number, any[]> = {}
    for (var q of questions) {
      var dn = Number(q.dayNumber) || 1
      if (!byDay[dn]) byDay[dn] = []
      byDay[dn].push(q)
    }
    var attempts: any = []
    try {
      attempts = await db.$queryRawUnsafe(
        'SELECT * FROM GamifyAttempt WHERE seriesId = ? AND studentId = ? AND epoch = ? AND rewarded = 1',
        series.id, studentId, Number(profile.epoch) || 0
      ) || []
    } catch (e) {}
    var rewardedQids = new Set(attempts.map(function (a: any) { return String(a.questionId) }))
    var maxDay = Number(series.totalDays) || 10
    for (var d = 1; d <= maxDay; d++) {
      var dq = byDay[d] || []
      if (dq.length === 0) continue // يوم فاضي — نعدّي عليه
      var allDone = dq.every(function (qq: any) { return rewardedQids.has(String(qq.id)) })
      if (!allDone) { unlockedDay = d; break }
      unlockedDay = d
    }
    if (unlockedDay < maxDay && unlockedDay >= 1 && (byDay[unlockedDay] || []).length) {
      // مكتمل؟ اللي بعده هو المفتوح
      var cur = byDay[unlockedDay] || []
      var curAllDone = cur.every(function (qq: any) { return rewardedQids.has(String(qq.id)) })
      if (curAllDone && unlockedDay < maxDay) unlockedDay = unlockedDay + 1
    }
    dayQuestions = (byDay[unlockedDay] || []).map(function (qq: any) {
      // الأمان: ممنوع نرجّع الإجابة الصح للطالب — نرجّع بس المحتوى
      return {
        id: String(qq.id), dayNumber: Number(qq.dayNumber), text: String(qq.text || ''),
        options: safeParse(qq.options, []), xpReward: Number(qq.xpReward) || 20,
        difficulty: String(qq.difficulty || 'normal'),
        alreadyRewarded: rewardedQids.has(String(qq.id)),
      }
    })
    todayTotal = dayQuestions.length
    // محاولات النهاردة على أسئلة اليوم المفتوح
    var todayAttempts: any = []
    try {
      todayAttempts = await db.$queryRawUnsafe(
        'SELECT questionId FROM GamifyAttempt WHERE seriesId = ? AND studentId = ? AND epoch = ? AND dateKey = ? AND correct = 1',
        series.id, studentId, Number(profile.epoch) || 0, today
      ) || []
    } catch (e) {}
    var todaySet = new Set(todayAttempts.map(function (a: any) { return String(a.questionId) }))
    todayAnsweredCount = dayQuestions.filter(function (qq: any) { return todaySet.has(qq.id) }).length
  }

  // 4) صندوق الكنز — كولداون 24 ساعة
  var boxReady = true
  var boxCooldownMs = 0
  try {
    var openedMs = tsToMs(profile.openedBoxAt)
    if (!isNaN(openedMs)) {
      var elapsed = Date.now() - openedMs
      if (elapsed >= 0 && elapsed < 86400000) { boxReady = false; boxCooldownMs = 86400000 - elapsed }
    }
  } catch (e) { boxReady = true }

  // 5) علامة التحذير — النافذة بتقفل والطالب لسه ما حلّش
  var clock = cairoClock()
  var windowUrgent = todayTotal > 0 && todayAnsweredCount < todayTotal && clock.hour >= 18
  var hoursLeft = Math.max(0, Math.round(msUntilCairoMidnight() / 3600000))

  // 6) تذكير تلقائي مرة واحدة في اليوم (الطالب + ولي الأمر)
  if (windowUrgent && series && profile.lastNagDate !== today) {
    try {
      await notifyStudent(studentId, 'gamify_nag', '⚡ خش حل السؤال اليومي بسرعة!', 'السؤال بتاع اليوم لسه مستنياك والوقت بيجري — حله قبل منتصف الليل وإلا الستريك يضيع! 🔥')
      await db.$executeRawUnsafe('UPDATE GamifyProfile SET lastNagDate = ? WHERE studentId = ?', today, studentId)
    } catch (e) {}
    try {
      if (profile.lastParentNagDate !== today) {
        var st: any = await db.$queryRawUnsafe('SELECT name FROM Student WHERE id = ?', studentId)
        var sname = st && st.length ? String(st[0].name) : 'الطالب'
        await notifyParentsOfGamify({
          studentId: studentId, studentName: sname,
          message: 'تنبيه: ' + sname + ' لسه ما حلتش سؤال اليوم في التحدي اليومي — فكّره بالحل قبل منتصف الليل عشان الستريك ما يضيعش!',
        })
        await db.$executeRawUnsafe('UPDATE GamifyProfile SET lastParentNagDate = ? WHERE studentId = ?', today, studentId)
      }
    } catch (e) {}
  }

  // 7) الشارات — فحص فتح أي شارة جديدة
  try { await checkBadges(studentId, grade) } catch (e) {}

  var badges = await getStudentBadges(studentId)

  return {
    profile: {
      xp: Number(profile.xp) || 0,
      streak: Number(profile.streak) || 0,
      bestStreak: Number(profile.bestStreak) || 0,
      shield: Number(profile.shield) || 0,
      cosmetics: safeParse(profile.cosmetics, []),
      lastActiveDate: profile.lastActiveDate,
    },
    series: series ? {
      id: String(series.id), title: String(series.title || ''),
      totalDays: Number(series.totalDays) || 10,
      prize: String(series.prize || DEFAULT_PRIZE_TEXT),
    } : null,
    unlockedDay, dayQuestions, todayAnsweredCount, todayTotal, totalQuestions,
    // (ج2) إشعار السؤال اليومي: الطالب قفله بالـ X من قبل لليوم المفتوح ده؟
    popupDismissed: series ? await isPopupDismissed(studentId, String(series.id), unlockedDay) : false,
    streakReset, boxReady, boxCooldownMs, windowUrgent, hoursLeft,
    badges, today: today,
  }
}

export var DEFAULT_PRIZE_TEXT = '⚠️ الأسئلة دي عليها جوائز مادية قوية من المستر — اللي يجمع أعلى نقاط يكسب الجائزة الكبرى من مستر شريف السيد 💰'

function safeParse(raw: any, fallback: any): any {
  try {
    if (raw == null || raw === '') return fallback
    if (typeof raw === 'object') return raw
    return JSON.parse(String(raw))
  } catch (e) { return fallback }
}

/* ----------------------------- الإجابة على سؤال ----------------------------- */

export async function answerQuestion(opts: {
  studentId: string; seriesId: string; questionId: string
  choiceIndex: number; answerText: string
}): Promise<any> {
  await ensureGamifyTables()
  var profile: any = await getOrCreateProfile(opts.studentId)
  var today = cairoDateKey()

  var qRows: any = await db.$queryRawUnsafe('SELECT * FROM ChallengeQuestion WHERE id = ? AND seriesId = ?', opts.questionId, opts.seriesId)
  if (!qRows || !qRows.length) return { ok: false, error: 'not_found' }
  var q = qRows[0]
  var options = safeParse(q.options, [])
  var correct = false
  if (options && options.length > 0) {
    correct = Number(opts.choiceIndex) === Number(q.correctIndex)
  } else {
    var norm = function (s: any) { return String(s || '').trim().replace(/\s+/g, ' ').toLowerCase() }
    correct = norm(opts.answerText) !== '' && norm(opts.answerText) === norm(q.correctText)
  }

  // محاولة موجودة في نفس الحقبة؟ حدّثها — وإلا اعمل واحدة
  var prev: any = []
  try {
    prev = await db.$queryRawUnsafe(
      'SELECT * FROM GamifyAttempt WHERE seriesId = ? AND studentId = ? AND questionId = ? AND epoch = ?',
      opts.seriesId, opts.studentId, opts.questionId, Number(profile.epoch) || 0
    ) || []
  } catch (e) { prev = [] }

  var xpEarned = 0
  var alreadyRewarded = !!(prev && prev.length && Number(prev[0].rewarded) === 1)

  if (correct && !alreadyRewarded) {
    xpEarned = Number(q.xpReward) || 20
  }

  if (prev && prev.length) {
    var newRewarded = (correct || alreadyRewarded) ? 1 : Number(prev[0].rewarded) || 0
    var newXp = alreadyRewarded ? Number(prev[0].xp) : xpEarned
    await db.$executeRawUnsafe(
      'UPDATE GamifyAttempt SET correct = ?, rewarded = ?, xp = ?, dateKey = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      correct ? 1 : 0, newRewarded, newXp, today, String(prev[0].id)
    )
  } else {
    await db.$executeRawUnsafe(
      'INSERT INTO GamifyAttempt (id, seriesId, studentId, questionId, dayNumber, epoch, correct, rewarded, xp, dateKey) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id(), opts.seriesId, opts.studentId, opts.questionId, Number(q.dayNumber) || 1, Number(profile.epoch) || 0,
      correct ? 1 : 0, correct ? 1 : 0, xpEarned, today
    )
  }

  // XP مرة واحدة بس لكل سؤال في الحقبة
  if (xpEarned > 0) {
    await awardXp(opts.studentId, 'daily_challenge', xpEarned, 'سؤال اليوم ' + String(q.dayNumber))
  }

  // الستريك — أول إجابة صح في اليوم بتحدّثه
  var streakMsg = ''
  if (correct) {
    if (profile.lastActiveDate === today) {
      // كمل — مفيش تغيير
    } else if (profile.lastActiveDate === cairoYesterday()) {
      var ns = Number(profile.streak) + 1
      await db.$executeRawUnsafe(
        'UPDATE GamifyProfile SET streak = ?, bestStreak = MAX(bestStreak, ?), lastActiveDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
        ns, ns, today, opts.studentId
      )
      streakMsg = ns >= 3 ? '🔥 ستريك ' + ns + ' أيام متتالية — كمّل!' : '🔥 بدأت ستريك جديد!'
    } else {
      await db.$executeRawUnsafe(
        'UPDATE GamifyProfile SET streak = 1, bestStreak = MAX(bestStreak, 1), lastActiveDate = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
        today, opts.studentId
      )
      streakMsg = '🔥 بدأت ستريك جديد!'
    }
  }

  return {
    ok: true, correct,
    xpEarned,
    alreadyRewarded,
    message: correct
      ? (xpEarned > 0 ? '✅ إجابة صحيحة! كسبت ' + xpEarned + ' XP' + (streakMsg ? ' — ' + streakMsg : '') : '✅ إجابة صحيحة! (السؤال ده اتكافأت عليه قبل كده)')
      : '❌ إجابة غير صحيحة — مفيش XP النهاردة على السؤال ده. راجع وجرّب تاني، الكسب لسه قدامك! 💪',
  }
}

/* ----------------------------- صندوق الكنز ----------------------------- */

var BOX_REWARDS = [
  { type: 'xp', value: 10, label: '10 XP', rarity: 'common', weight: 30 },
  { type: 'xp', value: 20, label: '20 XP', rarity: 'common', weight: 22 },
  { type: 'xp', value: 30, label: '30 XP', rarity: 'uncommon', weight: 16 },
  // الجايزة النادرة — 60 XP (أسئلة المستر مش بتعدّي 60 درجة عشان كده دي نادرة جدًا)
  { type: 'xp', value: 60, label: '60 XP — جايزة نادرة!', rarity: 'rare', weight: 6 },
  { type: 'shield', value: 1, label: 'درع حماية الستريك 🛡️', rarity: 'rare', weight: 10 },
  { type: 'cosmetic', value: 0, label: 'هالة ذهبية ✨', rarity: 'uncommon', weight: 6, cosmetic: 'هالة ذهبية ✨' },
  { type: 'cosmetic', value: 0, label: 'إطار ناري 🔥', rarity: 'uncommon', weight: 5, cosmetic: 'إطار ناري 🔥' },
  { type: 'cosmetic', value: 0, label: 'تاج العبقرية 👑', rarity: 'rare', weight: 3, cosmetic: 'تاج العبقرية 👑' },
  { type: 'cosmetic', value: 0, label: 'هالة صديقة المتألق 💫', rarity: 'common', weight: 2, cosmetic: 'هالة المتألق 💫' },
]

export async function openMysteryBox(studentId: string, grade?: string): Promise<any> {
  await ensureGamifyTables()
  var profile: any = await getOrCreateProfile(studentId, grade)
  if (profile.openedBoxAt) {
    try {
      var openedMs = tsToMs(profile.openedBoxAt)
      if (!isNaN(openedMs)) {
        var elapsed = Date.now() - openedMs
        if (elapsed >= 0 && elapsed < 86400000) {
          return { ok: false, error: 'cooldown', remainingMs: 86400000 - elapsed }
        }
      }
    } catch (e) {}
  }
  // عجلة الحظ بالأوزان
  var totalWeight = 0
  for (var i = 0; i < BOX_REWARDS.length; i++) totalWeight += BOX_REWARDS[i].weight
  var roll = Math.random() * totalWeight
  var picked = BOX_REWARDS[0]
  for (var j = 0; j < BOX_REWARDS.length; j++) {
    roll -= BOX_REWARDS[j].weight
    if (roll <= 0) { picked = BOX_REWARDS[j]; break }
  }
  // تنفيذ الجايزة
  if (picked.type === 'xp') {
    await awardXp(studentId, 'mystery_box', picked.value, 'صندوق الكنز — ' + picked.label)
  } else if (picked.type === 'shield') {
    await db.$executeRawUnsafe('UPDATE GamifyProfile SET shield = shield + 1, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?', studentId)
  } else if (picked.type === 'cosmetic') {
    var list = safeParse(profile.cosmetics, [])
    if (list.indexOf(picked.cosmetic) === -1) list.push(picked.cosmetic)
    await db.$executeRawUnsafe('UPDATE GamifyProfile SET cosmetics = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?', JSON.stringify(list), studentId)
  }
  await db.$executeRawUnsafe('UPDATE GamifyProfile SET openedBoxAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?', studentId)
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO MysteryBoxLog (id, studentId, rewardType, rewardValue, rewardLabel, rarity) VALUES (?, ?, ?, ?, ?, ?)',
      id(), studentId, picked.type, picked.value, picked.label, picked.rarity
    )
  } catch (e) {}
  try {
    await notifyStudent(studentId, 'gamify', '🎁 فتحت صندوق الكنز!', 'جايزتك: ' + picked.label)
  } catch (e) {}
  return { ok: true, reward: { type: picked.type, value: picked.value, label: picked.label, rarity: picked.rarity } }
}

/* ----------------------------- رهان XP ----------------------------- */
/* (ج2) الرهان بقى على الواجبات والامتحانات — الاثنين مع بعض بطلب المستر:
   «والمراهنات تبقى على الواجبات والامتحانات، تبقى على الاثنين»
   targetType: 'exam' | 'homework' — القديم كله امتحانات (Default exam) */

export async function placeBet(opts: {
  studentId: string; grade: string; examId: string; stake: number; prediction: number; targetType?: string
}): Promise<any> {
  await ensureGamifyTables()
  var profile: any = await getOrCreateProfile(opts.studentId, opts.grade)
  var stake = Math.floor(Number(opts.stake) || 0)
  var prediction = Math.floor(Number(opts.prediction) || 0)
  var targetType = String(opts.targetType || 'exam') === 'homework' ? 'homework' : 'exam'
  if (stake < 10) return { ok: false, error: 'أقل رهان 10 XP' }
  if (Number(profile.xp) < stake) return { ok: false, error: 'مش معاك XP كفاية للرهان ده' }

  // الهدف لازم يكون من نفس الصف وماكانش الطالب سلّمه
  var targetTitle = ''
  var totalQ = 10
  if (targetType === 'homework') {
    var hwRows: any = await db.$queryRawUnsafe('SELECT id, title, questions FROM Homework WHERE id = ?', opts.examId)
    if (!hwRows || !hwRows.length) return { ok: false, error: 'الواجب مش موجود' }
    targetTitle = String(hwRows[0].title || 'واجب')
    try {
      var hwQs = safeParse(hwRows[0].questions, [])
      if (Array.isArray(hwQs) && hwQs.length > 0) totalQ = hwQs.length
    } catch (e) {}
    var hwDone: any = []
    try { hwDone = await db.$queryRawUnsafe('SELECT id FROM HomeworkResult WHERE homeworkId = ? AND studentId = ?', opts.examId, opts.studentId) } catch (e) {}
    if (hwDone && hwDone.length) return { ok: false, error: 'سلّمت الواجب ده بالفعل — الرهان بقى بعد الحلبة ممنوع!' }
  } else {
    var examRows: any = await db.$queryRawUnsafe('SELECT id, title, questions FROM Exam WHERE id = ?', opts.examId)
    if (!examRows || !examRows.length) return { ok: false, error: 'الامتحان مش موجود' }
    targetTitle = String(examRows[0].title || 'امتحان')
    try {
      var qs = safeParse(examRows[0].questions, [])
      if (Array.isArray(qs) && qs.length > 0) totalQ = qs.length
    } catch (e) {}
    var hasResult: any = []
    try {
      hasResult = await db.$queryRawUnsafe('SELECT id FROM ExamResult WHERE examId = ? AND studentId = ?', opts.examId, opts.studentId)
    } catch (e) {}
    if (hasResult && hasResult.length) return { ok: false, error: 'سلّمت الامتحان ده بالفعل — الرهان بقى بعد الحلبة ممنوع!' }
  }
  if (prediction < 0 || prediction > totalQ) return { ok: false, error: 'التوقع لازم يكون بين 0 و ' + totalQ }
  var already: any = await db.$queryRawUnsafe(
    "SELECT id FROM XpBet WHERE studentId = ? AND examId = ? AND targetType = ? AND status = 'locked'", opts.studentId, opts.examId, targetType
  )
  if (already && already.length) return { ok: false, error: targetType === 'homework' ? 'عندك رهان شغال على الواجب ده بالفعل' : 'عندك رهان شغال على الامتحان ده بالفعل' }

  // خصم الـ XP فورًا (محتجز كرصيد رهان)
  await awardXp(opts.studentId, 'bet_lock', -stake, 'رهان على ' + targetTitle.slice(0, 60))
  await db.$executeRawUnsafe(
    'INSERT INTO XpBet (id, studentId, examId, examTitle, stake, prediction, totalQuestions, status, targetType) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    id(), opts.studentId, opts.examId, targetTitle, stake, prediction, totalQ, 'locked', targetType
  )
  return { ok: true, totalQuestions: totalQ }
}

/** تسوية الرهانات — بتتنادى تلقائيًا من computeStudentState
 *  (ج2) بتسوّى رهانات الواجبات والامتحانات حسب targetType */
export async function settleBets(studentId: string): Promise<void> {
  try {
    var pending: any = await db.$queryRawUnsafe("SELECT * FROM XpBet WHERE studentId = ? AND status = 'locked'", studentId) || []
    for (var i = 0; i < pending.length; i++) {
      var bet = pending[i]
      var betType = String(bet.targetType || 'exam')
      var res: any = []
      try {
        if (betType === 'homework') {
          res = await db.$queryRawUnsafe('SELECT score, maxScore FROM HomeworkResult WHERE homeworkId = ? AND studentId = ? LIMIT 1', bet.examId, studentId)
        } else {
          res = await db.$queryRawUnsafe('SELECT score, maxScore FROM ExamResult WHERE examId = ? AND studentId = ? LIMIT 1', bet.examId, studentId)
        }
      } catch (e) {}
      if (!res || !res.length) continue // لسه ما سلّمش
      var score = Number(res[0].score) || 0
      var maxScore = Number(res[0].maxScore) || 100
      var totalQ = Number(bet.totalQuestions) || 10
      var actual = Math.round((score / maxScore) * totalQ)
      var payout = 0
      var status = 'lost'
      if (actual === Number(bet.prediction)) { payout = Number(bet.stake) * 2; status = 'won' } // توقع تام → ضعف الرهان
      else if (Math.abs(actual - Number(bet.prediction)) === 1) { payout = Number(bet.stake); status = 'push' } // فارق سؤال واحد → رجعت رهانك
      if (payout > 0) await awardXp(studentId, 'bet_settle', payout, 'تسوية رهان ' + String(bet.examTitle || '').slice(0, 60))
      await db.$executeRawUnsafe(
        'UPDATE XpBet SET status = ?, payout = ?, actual = ?, settledAt = CURRENT_TIMESTAMP WHERE id = ?',
        status, payout, actual, String(bet.id)
      )
      var kind = betType === 'homework' ? 'الواجب' : 'الامتحان'
      var msg = status === 'won'
        ? '🎯 توقعك مظبوط بالحرف في ' + kind + ' «' + String(bet.examTitle || '').slice(0, 40) + '»! كسبت ' + payout + ' XP (ضعف رهانك)'
        : status === 'push'
          ? '😅 قربت جدًا — فارق سؤال واحد بس في ' + kind + '. رجعتلك رهانك كامل (' + payout + ' XP)'
          : '💸 التوقع بعيد في ' + kind + ' — خسرت رهان (' + Number(bet.stake) + ' XP). جرّب تاني وركّز أحسن!'
      try { await notifyStudent(studentId, 'gamify', status === 'won' ? '🏆 رهانك كسب!' : status === 'push' ? '🤝 رهان انعاد' : '💔 رهان خسر', msg) } catch (e) {}
    }
  } catch (e) { console.error('[gamify] settleBets fail', e) }
}

/** (ج2) إخفاء إشعار السؤال اليومي بالـ X — دايمًا للسلسلة/اليوم ده */
export async function dismissPopup(studentId: string, seriesId: string, day: number): Promise<boolean> {
  try {
    await db.$executeRawUnsafe(
      'INSERT OR IGNORE INTO GamifyPopupDismissal (studentId, seriesId, day) VALUES (?, ?, ?)',
      studentId, seriesId, Math.max(1, Math.floor(Number(day) || 1))
    )
    return true
  } catch (e) { return false }
}

export async function isPopupDismissed(studentId: string, seriesId: string, day: number): Promise<boolean> {
  try {
    var rows: any = await db.$queryRawUnsafe(
      'SELECT 1 as x FROM GamifyPopupDismissal WHERE studentId = ? AND seriesId = ? AND day = ? LIMIT 1',
      studentId, seriesId, Math.max(1, Math.floor(Number(day) || 1))
    )
    return !!(rows && rows.length)
  } catch (e) { return false }
}

export async function getStudentBets(studentId: string): Promise<any[]> {
  try {
    return await db.$queryRawUnsafe('SELECT * FROM XpBet WHERE studentId = ? ORDER BY createdAt DESC LIMIT 20', studentId) || []
  } catch (e) { return [] }
}

/* ----------------------------- الشارات ----------------------------- */

export async function getStudentBadges(studentId: string): Promise<any[]> {
  try {
    var badges: any = await db.$queryRawUnsafe('SELECT * FROM Badge WHERE active = 1 ORDER BY sort ASC, createdAt ASC') || []
    var unlocked: any = await db.$queryRawUnsafe('SELECT badgeId, unlockedAt FROM StudentBadge WHERE studentId = ?', studentId) || []
    var map: Record<string, string> = {}
    for (var u of unlocked) map[String(u.badgeId)] = String(u.unlockedAt)
    return badges.map(function (b: any) {
      return {
        id: String(b.id), name: String(b.name), desc: String(b.desc || ''), icon: String(b.icon || '🏅'),
        rarity: String(b.rarity || 'common'), conditionType: String(b.conditionType), threshold: Number(b.threshold) || 0,
        unlocked: !!map[String(b.id)], unlockedAt: map[String(b.id)] || null,
      }
    })
  } catch (e) { return [] }
}

/** محرك فتح الشارات — بيقيّم كل الشارات ويفتح الجديدة + يبعت إشعار */
export async function checkBadges(studentId: string, grade?: string): Promise<void> {
  try {
    await ensureGamifyTables()
    var profile: any = await getOrCreateProfile(studentId, grade)
    var badges: any = await db.$queryRawUnsafe('SELECT * FROM Badge WHERE active = 1') || []
    if (!badges.length) return

    // المقاييس
    var streak = Number(profile.streak) || 0
    var xp = Number(profile.xp) || 0
    var attempts: any = await db.$queryRawUnsafe(
      'SELECT COUNT(*) AS c, SUM(correct) AS cc FROM GamifyAttempt WHERE studentId = ?', studentId
    ) || []
    var totalAttempts = Number(attempts[0] && attempts[0].c) || 0
    var correctAttempts = Number(attempts[0] && attempts[0].cc) || 0
    var accuracy = totalAttempts > 0 ? (correctAttempts / totalAttempts) * 100 : 0
    var daysDone: any = await db.$queryRawUnsafe(
      'SELECT COUNT(DISTINCT dayNumber) AS d FROM GamifyAttempt WHERE studentId = ? AND rewarded = 1', studentId
    ) || []
    var challengeDays = Number(daysDone[0] && daysDone[0].d) || 0
    // سرعة الواجب — أول واجب بدرجة 70%+ خلال 24 ساعة من نزوله
    var rocketOk = false
    try {
      var fast: any = await db.$queryRawUnsafe(
        "SELECT hr.id FROM HomeworkResult hr INNER JOIN Homework h ON h.id = hr.homeworkId " +
        "WHERE hr.studentId = ? AND hr.submittedAt <= datetime(h.createdAt, '+24 hours') " +
        "AND COALESCE(hr.score, 0) >= 0.7 * COALESCE(NULLIF(hr.maxScore, 0), 100) LIMIT 1",
        studentId
      ) || []
      rocketOk = fast.length > 0
    } catch (e) {}

    var unlockedNow: any = await db.$queryRawUnsafe('SELECT badgeId FROM StudentBadge WHERE studentId = ?', studentId) || []
    var have = new Set(unlockedNow.map(function (r: any) { return String(r.badgeId) }))

    for (var i = 0; i < badges.length; i++) {
      var b = badges[i]
      if (have.has(String(b.id))) continue
      var ok = false
      var ct = String(b.conditionType)
      if (ct === 'streak_days') ok = streak >= (Number(b.threshold) || 7)
      else if (ct === 'xp_total') ok = xp >= (Number(b.threshold) || 500)
      else if (ct === 'accuracy') ok = totalAttempts >= 15 && accuracy >= (Number(b.threshold) || 90)
      else if (ct === 'challenge_days') ok = challengeDays >= (Number(b.threshold) || 10)
      else if (ct === 'homework_speed') ok = rocketOk
      if (!ok) continue
      await db.$executeRawUnsafe(
        'INSERT OR IGNORE INTO StudentBadge (id, studentId, badgeId) VALUES (?, ?, ?)',
        id(), studentId, String(b.id)
      )
      try {
        await notifyStudent(studentId, 'gamify_badge', '🏅 شارة جديدة اتفتحت: ' + String(b.name), String(b.desc || 'مبروك! شارة جديدة في معرض شاراتك'))
      } catch (e) {}
    }
  } catch (e) { console.error('[gamify] checkBadges fail', e) }
}

/* ----------------------------- لوحات الترتيب ----------------------------- */

/** لوحة XP — منفصلة تمامًا عن النقاط الدراسية */
export async function xpLeaderboard(limit?: number): Promise<any[]> {
  try {
    await ensureGamifyTables()
    var rows: any = await db.$queryRawUnsafe(
      'SELECT s.name, s.grade, gp.xp, gp.streak, gp.bestStreak ' +
      'FROM GamifyProfile gp INNER JOIN Student s ON s.id = gp.studentId ' +
      "WHERE s.status IN ('approved','paid') AND gp.xp > 0 " +
      'ORDER BY gp.xp DESC, gp.bestStreak DESC LIMIT ?',
      Math.min(Number(limit) || 10, 50)
    ) || []
    return rows.map(function (r: any, i: number) {
      return { rank: i + 1, name: String(r.name || 'طالب'), grade: String(r.grade || ''), xp: Math.round(Number(r.xp) || 0), streak: Number(r.streak) || 0, bestStreak: Number(r.bestStreak) || 0 }
    })
  } catch (e) { return [] }
}

/** وقت آخر تصفير للوحة الدراسية — عشان الكاش يتلغي فورًا */
export async function getLastLeaderboardReset(): Promise<string | null> {
  try {
    var rows: any = await db.$queryRawUnsafe("SELECT resetAt FROM LeaderboardReset WHERE id = 'reset' LIMIT 1") || []
    return rows.length ? String(rows[0].resetAt) : null
  } catch (e) { return null }
}

/* ----------------------------- تصفير لوحة الترتيب ----------------------------- */
/* طلب المستر حرفيًا: «عايزك تمسحه لي حاليًا وبعد كده تخليه شغال عادي»
   → كل النقاط القديمة بتتعلم عليها preReset=1 فبتختفي من اللوحة فورًا
   → أي نتيجة جديدة بعد التصفير بتتجمع عادي من الصفر (preReset=0) */

export async function resetAcademicLeaderboard(): Promise<{ ok: boolean; frozen: number }> {
  await ensureGamifyTables()
  var frozen = 0
  try {
    await db.$executeRawUnsafe('UPDATE PointsLedger SET preReset = 1 WHERE preReset IS NULL OR preReset = 0')
    var cnt: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM PointsLedger WHERE preReset = 1') || []
    frozen = Number(cnt[0] && cnt[0].c) || 0
  } catch (e) { console.error('[gamify] reset freeze fail', e) }
  try {
    await db.$executeRawUnsafe(
      "INSERT INTO LeaderboardReset (id, resetAt) VALUES ('reset', CURRENT_TIMESTAMP) " +
      "ON CONFLICT(id) DO UPDATE SET resetAt = CURRENT_TIMESTAMP"
    )
  } catch (e) {
    try { await db.$executeRawUnsafe("INSERT OR REPLACE INTO LeaderboardReset (id, resetAt) VALUES ('reset', CURRENT_TIMESTAMP)") } catch (e2) {}
  }
  return { ok: true, frozen }
}

/* ----------------------------- تنبيه جماعي (المستر) ----------------------------- */
/* المستر يبعت «خش حل السؤال اليومي بسرعة» لكل اللي لسه ما حلوش النهاردة */

export async function nagUnsolvedStudents(grade?: string, customMsg?: string): Promise<{ notified: number }> {
  await ensureGamifyTables()
  var today = cairoDateKey()
  var series: any = null
  var students: any = []
  try {
    students = await db.$queryRawUnsafe(
      "SELECT id, grade FROM Student WHERE status IN ('approved','paid')" + (grade ? ' AND grade = ?' : ''),
      ...(grade ? [grade] : [])
    ) || []
  } catch (e) { students = [] }
  var notified = 0
  var msg = String(customMsg || '⚡ خش حل السؤال اليومي بسرعة! السؤال لسه مستنياك والجوائز مستنية — حله قبل منتصف الليل 🔥')
  for (var i = 0; i < students.length; i++) {
    var st = students[i]
    try {
      series = await getActiveSeries(String(st.grade))
      if (!series) continue
      var state = await computeStudentState(String(st.id), String(st.grade))
      if (state.todayTotal > 0 && state.todayAnsweredCount < state.todayTotal) {
        await notifyStudent(String(st.id), 'gamify_nag', '📣 من مستر شريف', msg)
        notified++
      }
    } catch (e) { /* تجاهل طالب واحد فاشل */ }
  }
  return { notified }
}
