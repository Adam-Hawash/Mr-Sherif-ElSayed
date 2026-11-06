// ============================================================
// FILE: src/lib/game.ts
// PURPOSE: (2026-ز38) نواة نظام الجيميفيكيشن — «Ultimate Student
//   Engagement & Gamification Ecosystem» — طلب المستر الحرفي:
//   نظام تحدي يومي + ستريك + صناديق أسرار + مراهنات XP + شارات
//   إنجاز + لوحة ترتيب XP منفصلة عن لوحة الدرجة الأكاديمية.
// ------------------------------------------------------------
//   • الجداول بتتعمل تلقائيًا (CREATE IF NOT EXISTS) — نفس نمط
//     HomeworkGroupSchedule — عشان Turso الجديد ما يبوّظش
//   • XpLedger = دفتر XP الجيميفيكيشن (منفصل تمامًا عن PointsLedger
//     الأكاديمي — لوحة الترتيب العامة للدرجات، ودي للتحديات)
//   • StreakState: لو الطالب فاته يوم كامل من غير ما يحل → الستريك
//     بيرجع صفر وبيبدأ من اليوم الأول تاني (إلا لو عنده درع من الصندوق)
//   • المراهنات بتتسوى بشكل خامل (lazy) — مفيش أي لمسة في مسارات
//     تسليم الامتحان/الواجب الحساسة — التسوية تحصل عند قراءة الحالة
// ============================================================

import { db } from '@/lib/db'

/* ---------- DDL ---------- */

var _gameTablesReady: Promise<void> | null = null

export function ensureGameTables(): Promise<void> {
  if (!_gameTablesReady) {
    _gameTablesReady = (async function () {
      var stmts: string[] = [
        // إعدادات التحدي لكل صف — المستر بيحدد دورة التحدي (7/10 يوم) لكل صف
        `CREATE TABLE IF NOT EXISTS GameConfig (
          grade TEXT PRIMARY KEY,
          cycleDays INTEGER NOT NULL DEFAULT 7,
          xpPerCorrect INTEGER NOT NULL DEFAULT 10,
          mysteryEnabled INTEGER NOT NULL DEFAULT 1,
          bettingEnabled INTEGER NOT NULL DEFAULT 1,
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // بناء أسئلة التحدي اليومي — كل يوم في الدورة له أسئلته (يوم 1: سؤال، يوم 2: سؤالين…)
        `CREATE TABLE IF NOT EXISTS DailyChallengeDay (
          id TEXT PRIMARY KEY,
          grade TEXT NOT NULL,
          dayNumber INTEGER NOT NULL,
          questions TEXT NOT NULL DEFAULT '[]',
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(grade, dayNumber)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_dcd_grade ON DailyChallengeDay(grade)',
        // حلول التحدي اليومي — صف واحد لكل طالب في اليوم (بمفتاح يوم القاهرة)
        // questions = الأسئلة الموكلّة للطالب اليوم (بتتثبت أول ما يفتح التحدّي
        // عشان العرض والتصحيح يشوفوا نفس الأسئلة بالظبط حتى مع العينة العشوائية)
        `CREATE TABLE IF NOT EXISTS DailySolve (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          grade TEXT NOT NULL,
          dayKey TEXT NOT NULL,
          dayNumber INTEGER NOT NULL DEFAULT 1,
          correctCount INTEGER NOT NULL DEFAULT 0,
          totalCount INTEGER NOT NULL DEFAULT 0,
          xpEarned INTEGER NOT NULL DEFAULT 0,
          questions TEXT DEFAULT '',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(studentId, dayKey)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_ds_student ON DailySolve(studentId)',
        // حالة الستريك + الدروع + الكوزمتيك لكل طالب
        `CREATE TABLE IF NOT EXISTS StreakState (
          studentId TEXT PRIMARY KEY,
          grade TEXT DEFAULT '',
          currentStreak INTEGER NOT NULL DEFAULT 0,
          bestStreak INTEGER NOT NULL DEFAULT 0,
          cycleDay INTEGER NOT NULL DEFAULT 0,
          lastSolveDayKey TEXT DEFAULT '',
          shields INTEGER NOT NULL DEFAULT 0,
          cosmetics TEXT DEFAULT '[]',
          equippedCosmetic TEXT DEFAULT '',
          updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // سجل فتح صناديق الأسرار (الصندوق مرة كل 24 ساعة)
        `CREATE TABLE IF NOT EXISTS MysteryBoxOpen (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          rewardType TEXT DEFAULT 'xp',
          rewardValue TEXT DEFAULT '',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        'CREATE INDEX IF NOT EXISTS idx_mbo_student ON MysteryBoxOpen(studentId, createdAt)',
        // دفتر XP الجيميفيكيشن — مصدر لوحة ترتيب الألعاب (منفصل عن النقاط الأكاديمية)
        `CREATE TABLE IF NOT EXISTS XpLedger (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          kind TEXT NOT NULL,
          amount REAL NOT NULL DEFAULT 0,
          note TEXT DEFAULT '',
          betId TEXT DEFAULT '',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        'CREATE INDEX IF NOT EXISTS idx_xpl_student ON XpLedger(studentId)',
        // مراهنات XP — الطالب بيحط جزء من XP على نتيجته في امتحان/واجب
        `CREATE TABLE IF NOT EXISTS XpBet (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          targetType TEXT NOT NULL DEFAULT 'exam',
          targetId TEXT NOT NULL,
          targetTitle TEXT DEFAULT '',
          wageredXp REAL NOT NULL DEFAULT 0,
          targetPct INTEGER NOT NULL DEFAULT 70,
          multiplier REAL NOT NULL DEFAULT 2,
          status TEXT NOT NULL DEFAULT 'open',
          payout REAL NOT NULL DEFAULT 0,
          finalScore REAL,
          finalMax REAL,
          settledAt DATETIME,
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        'CREATE INDEX IF NOT EXISTS idx_xpb_student ON XpBet(studentId)',
        'CREATE INDEX IF NOT EXISTS idx_xpb_status ON XpBet(status)',
        // الشارات — مجموعة ثابتة بتتبذر أول مرة ( uncommon/rare/legendary )
        `CREATE TABLE IF NOT EXISTS Badge (
          code TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          nameEn TEXT DEFAULT '',
          description TEXT DEFAULT '',
          rarity TEXT NOT NULL DEFAULT 'common',
          icon TEXT DEFAULT 'Award',
          createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )`,
        // شارات الطلاب المفتوحة
        `CREATE TABLE IF NOT EXISTS StudentBadge (
          id TEXT PRIMARY KEY,
          studentId TEXT NOT NULL,
          badgeCode TEXT NOT NULL,
          unlockedAt DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(studentId, badgeCode)
        )`,
        'CREATE INDEX IF NOT EXISTS idx_sb_student ON StudentBadge(studentId)',
      ]
      for (var i = 0; i < stmts.length; i++) {
        try { await db.$executeRawUnsafe(stmts[i]) } catch (e) { console.error('game DDL stmt error:', e) }
      }
      try { await ensureBadgeSeed() } catch (e) { console.error('badge seed error:', e) }
    })()
  }
  return _gameTablesReady
}

/* ---------- يوم القاهرة — مفتاح اليوم (YYYY-MM-DD بتوقيت مصر) ---------- */

var cairoFmt: Intl.DateTimeFormat | null = null
function getCairoFmt(): Intl.DateTimeFormat {
  if (!cairoFmt) cairoFmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit' })
  return cairoFmt
}

// مفتاح اليوم بتوقيت القاهرة — الستريك بيتحسب بيوم مصر مش UTC
export function cairoDayKey(d?: Date): string {
  try { return getCairoFmt().format(d || new Date()) } catch (e) { return (d || new Date()).toISOString().slice(0, 10) }
}

// مفتاح يوم واحد (طابور الأيام) — عشان يحسب فرق الأيام بسهولة
function dayKeyToUtc(key: string): number {
  try { return Date.parse(key + 'T00:00:00Z') } catch (e) { return Date.parse(key) }
}

// فرق أيام كاملة بين مفتاحين (مثبت على UTC عشان ما يتأثرش بالتوقيت الصيفي)
export function dayKeysDiff(fromKey: string, toKey: string): number {
  var a = dayKeyToUtc(fromKey), b = dayKeyToUtc(toKey)
  if (!isFinite(a) || !isFinite(b)) return 0
  return Math.round((b - a) / 86400000)
}

// مفتاح اليوم اللي قبله (لو طرحناه) — بنستخدمه لما الدرع يغطي اليوم الضايع
export function prevDayKey(key: string): string {
  var t = dayKeyToUtc(key) - 86400000
  return new Date(t).toISOString().slice(0, 10)
}

// الميلي ثانية لآخر اليوم (توقيت القاهرة) — عشان التنبيه النيون «الوقت بيقف»
export function msToCairoMidnight(now?: Date): number {
  try {
    var nowD = now || new Date()
    var todayKey = cairoDayKey(nowD)
    // بنجيب الساعة/الدقيقة الحالية بالقاهرة من نفس الفورماتر بشكل منفصل
    var parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Africa/Cairo', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(nowD)
    var hh = 0, mm = 0, ss = 0
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].type === 'hour') hh = Number(parts[i].value) % 24
      else if (parts[i].type === 'minute') mm = Number(parts[i].value)
      else if (parts[i].type === 'second') ss = Number(parts[i].value)
    }
    var elapsed = ((hh * 60 + mm) * 60 + ss) * 1000
    return 86400000 - elapsed
  } catch (e) { return 0 }
}

/* ---------- الشارات الثابتة (بتتبذر أول مرة) ---------- */

export var BADGE_DEFS: { code: string; name: string; nameEn: string; description: string; rarity: string; icon: string }[] = [
  { code: 'first_challenge', name: 'البداية الجريئة', nameEn: 'First Blood', description: 'حلّت أول تحدي يومي في مركز الألعاب', rarity: 'common', icon: 'Rocket' },
  { code: 'streak_3', name: 'سخون المطبخ', nameEn: 'On Fire', description: 'ستريك 3 أيام متتالية في التحدي اليومي', rarity: 'common', icon: 'Flame' },
  { code: 'box_hunter', name: 'صياد الصناديق', nameEn: 'Box Hunter', description: 'فتحت 7 صناديق أسرار', rarity: 'common', icon: 'Gift' },
  { code: 'the_consistent', name: 'الثابت', nameEn: 'The Consistent', description: 'ستريك 7 أيام — ما فاتكش ولا يوم', rarity: 'rare', icon: 'CalendarCheck' },
  { code: 'the_rocket', name: 'الصاروخ', nameEn: 'The Rocket', description: 'سلّمت واجب بدرجة كاملة خلال 24 ساعة من نزوله', rarity: 'rare', icon: 'Rocket' },
  { code: 'high_roller', name: 'المقامر الشجاع', nameEn: 'High Roller', description: 'حطت مراهنة XP بقيمة 100 أو أكتر', rarity: 'rare', icon: 'Coins' },
  { code: 'predictor', name: 'العرّاف', nameEn: 'The Predictor', description: 'كسبت 3 مراهنات على نتيجتك', rarity: 'rare', icon: 'Target' },
  { code: 'xp_1000', name: 'جامع النقاط', nameEn: 'XP Collector', description: 'جمّعت 1000 نقطة XP من مركز الألعاب', rarity: 'rare', icon: 'Sparkles' },
  { code: 'math_wizard', name: 'ساحر الرياضة', nameEn: 'Math Wizard', description: 'متوسط دقتك في 5 امتحانات أو أكتر 90%+', rarity: 'legendary', icon: 'Brain' },
  { code: 'legend_streak', name: 'الأسطورة', nameEn: 'The Legend', description: 'ستريك 30 يوم — إنجاز أسطوري', rarity: 'legendary', icon: 'Crown' },
]

async function ensureBadgeSeed() {
  for (var i = 0; i < BADGE_DEFS.length; i++) {
    var b = BADGE_DEFS[i]
    try {
      await db.$executeRawUnsafe(
        'INSERT OR IGNORE INTO Badge (code, name, nameEn, description, rarity, icon, createdAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        b.code, b.name, b.nameEn, b.description, b.rarity, b.icon
      )
    } catch (e) { /* موجود أصلًا */ }
  }
}

/* ---------- دفتر XP ---------- */

export function newXpId(): string {
  return 'xp_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}

// تحويل تاريخ SQLite (نص 'YYYY-MM-DD HH:MM:SS' أو Date) لميلي ثانية — آمن لكل الأشكال
export function parseDbDate(v: any): number {
  if (v == null) return NaN
  if (v instanceof Date) return v.getTime()
  var s = String(v)
  try { var t = Date.parse(s); if (isFinite(t)) return t } catch (e) {}
  try { var t2 = Date.parse(s.replace(' ', 'T') + 'Z'); if (isFinite(t2)) return t2 } catch (e) {}
  return NaN
}

export async function addXp(studentId: string, kind: string, amount: number, note?: string, betId?: string) {
  await db.$executeRawUnsafe(
    'INSERT INTO XpLedger (id, studentId, kind, amount, note, betId, createdAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
    newXpId(), studentId, kind, Math.round(amount * 10) / 10, note || '', betId || ''
  )
}

// رصيد XP الحالي (مجموع الدفتر) — الرهان بيُخصم فورًا فالرصيد صادق دايمًا
export async function xpBalance(studentId: string): Promise<number> {
  var rows: any = await db.$queryRawUnsafe('SELECT COALESCE(SUM(amount), 0) AS bal FROM XpLedger WHERE studentId = ?', studentId)
  var v = 0
  if (Array.isArray(rows) && rows.length > 0) v = Number(rows[0].bal) || 0
  return Math.round(v)
}

/* ---------- حالة الستريك ---------- */

export interface StreakInfo {
  currentStreak: number
  bestStreak: number
  cycleDay: number
  shields: number
  cosmetics: string[]
  equippedCosmetic: string
  lastSolveDayKey: string
  solvedToday: boolean
  resetToday: boolean // الستريك اتقفل النهارده بسبب يوم فات (من غير درع)
  shieldSavedToday: boolean
}

// قاعدة الستريك الحرفية من المستر: «لو فات يوم كامل من غير ما يدخل ويحل
// السؤال اليومي → الستريك بيرجع صفر وبيبدأ من اليوم الأول من تاني»
// — الدرع (من صندوق الأسرار) بيغطي يوم واحد ضايع مرة واحدة.
export async function getStreakState(studentId: string): Promise<StreakInfo> {
  await ensureGameTables()
  var todayKey = cairoDayKey()
  var rows: any = await db.$queryRawUnsafe('SELECT * FROM StreakState WHERE studentId = ? LIMIT 1', studentId)
  var row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

  var st = {
    studentId: studentId,
    grade: row ? String(row.grade || '') : '',
    currentStreak: row ? Number(row.currentStreak) || 0 : 0,
    bestStreak: row ? Number(row.bestStreak) || 0 : 0,
    cycleDay: row ? Number(row.cycleDay) || 0 : 0,
    lastSolveDayKey: row ? String(row.lastSolveDayKey || '') : '',
    shields: row ? Number(row.shields) || 0 : 0,
    cosmetics: row ? safeJsonArray(row.cosmetics) : [],
    equippedCosmetic: row ? String(row.equippedCosmetic || '') : '',
  }

  var resetToday = false
  var shieldSavedToday = false
  var solvedToday = st.lastSolveDayKey === todayKey

  if (!solvedToday && st.lastSolveDayKey !== '') {
    var gap = dayKeysDiff(st.lastSolveDayKey, todayKey)
    if (gap > 1) {
      // فات يوم كامل (أكتر) — الدور على درع
      if (st.shields > 0) {
        st.shields -= 1
        // الدرع بيعتبر إنه حل امبارح — النهارده لسه مستنيه
        st.lastSolveDayKey = prevDayKey(todayKey)
        shieldSavedToday = true
        await db.$executeRawUnsafe(
          'UPDATE StreakState SET shields = ?, lastSolveDayKey = ?, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
          st.shields, st.lastSolveDayKey, studentId
        )
      } else {
        // الستريك بقى صفر — يبدأ من اليوم الأول تاني أول ما يحل
        st.currentStreak = 0
        st.cycleDay = 0
        resetToday = true
        await db.$executeRawUnsafe(
          'UPDATE StreakState SET currentStreak = 0, cycleDay = 0, updatedAt = CURRENT_TIMESTAMP WHERE studentId = ?',
          studentId
        )
      }
    }
  }

  return {
    currentStreak: st.currentStreak,
    bestStreak: st.bestStreak,
    cycleDay: st.cycleDay,
    shields: st.shields,
    cosmetics: st.cosmetics,
    equippedCosmetic: st.equippedCosmetic,
    lastSolveDayKey: solvedToday ? todayKey : st.lastSolveDayKey,
    solvedToday: solvedToday,
    resetToday: resetToday,
    shieldSavedToday: shieldSavedToday,
  }
}

function safeJsonArray(v: any): string[] {
  try {
    var p = typeof v === 'string' ? JSON.parse(v) : v
    if (Array.isArray(p)) return p.map(function (x) { return String(x) })
  } catch (e) {}
  return []
}

/* ---------- أسئلة التحدي اليومي ---------- */

export interface ChallengeQuestion {
  text: string
  options: string[]
  correctIndex: number
  xp: number
}

// أسئلة يوم معين — لو اليوم مفيهوش أسئلة مبنيين بنرجع عينة عشوائية من
// كل أسئلة الصف بعدد اليوم (تدرّج صعب) — ولو مفيش خالص بنرجع فاضي
export async function getDayQuestions(grade: string, dayNumber: number, needRandom: boolean): Promise<ChallengeQuestion[]> {
  var rows: any = await db.$queryRawUnsafe(
    'SELECT questions FROM DailyChallengeDay WHERE grade = ? AND dayNumber = ? LIMIT 1', grade, dayNumber
  )
  var exact = Array.isArray(rows) && rows.length > 0 ? parseQuestions(rows[0].questions) : []
  if (exact.length > 0) return exact

  if (!needRandom) return []
  var allRows: any = await db.$queryRawUnsafe(
    'SELECT questions FROM DailyChallengeDay WHERE grade = ? ORDER BY dayNumber ASC', grade
  )
  var pool: ChallengeQuestion[] = []
  for (var i = 0; i < (allRows || []).length; i++) {
    pool = pool.concat(parseQuestions((allRows[i] || {}).questions))
  }
  if (pool.length === 0) return []
  var n = Math.max(1, Math.min(dayNumber, pool.length, 5))
  // خلط عشوائي وبناخد n
  for (var s = pool.length - 1; s > 0; s--) {
    var j = Math.floor(Math.random() * (s + 1))
    var tmp = pool[s]; pool[s] = pool[j]; pool[j] = tmp
  }
  return pool.slice(0, n)
}

export function parseQuestions(raw: any): ChallengeQuestion[] {
  try {
    var p = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(p)) return []
    var out: ChallengeQuestion[] = []
    for (var i = 0; i < p.length; i++) {
      var q: any = p[i] || {}
      var opts = Array.isArray(q.options) ? q.options.map(function (x: any) { return String(x == null ? '' : x) }) : []
      out.push({
        text: String(q.text || ''),
        options: opts,
        correctIndex: Math.max(0, Math.min(opts.length - 1, Number(q.correctIndex) || 0)),
        xp: Math.max(0, Number(q.xp) || 0),
      })
    }
    return out
  } catch (e) { return [] }
}

// رقم يوم النهارده في الدورة — الدورة بتلف (بعد آخر يوم تبدأ من الأول تاني)
export function todayCycleDayNumber(cycleDay: number, cycleDays: number): number {
  var cd = Math.max(1, cycleDays)
  return (Math.max(0, cycleDay) % cd) + 1
}

/* ---------- توكيل أسئلة اليوم (تثبت الأسئلة بين العرض والتصحيح) ---------- */

export interface TodayAssignment {
  dayNumber: number
  questions: ChallengeQuestion[] // من غير الإجابة الصحيحة
  solved: boolean
  correctCount: number
  totalCount: number
  xpEarned: number
}

// بيشتغل في GET الحالة: لو مفيش صف حل للنهارده → بيتوكل أسئلة اليوم
// ويتسجلوا (أو بيرجّع الأسئلة المحفوظة) — التصحيح بعدين بيقرا نفس الصف
export async function ensureDailyAssignment(studentId: string, grade: string): Promise<TodayAssignment> {
  await ensureGameTables()
  var cfg = await getGameConfig(grade)
  var streak = await getStreakState(studentId)
  var todayKey = cairoDayKey()

  var dayNumber = todayCycleDayNumber(streak.cycleDay, cfg.cycleDays)

  var rows: any = await db.$queryRawUnsafe(
    'SELECT * FROM DailySolve WHERE studentId = ? AND dayKey = ? LIMIT 1', studentId, todayKey
  )
  var row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null

  if (!row) {
    var questions = await getDayQuestions(grade, dayNumber, true)
    var id = 'ds_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
    try {
      await db.$executeRawUnsafe(
        'INSERT OR IGNORE INTO DailySolve (id, studentId, grade, dayKey, dayNumber, correctCount, totalCount, xpEarned, questions, createdAt) VALUES (?, ?, ?, ?, ?, 0, 0, 0, ?, CURRENT_TIMESTAMP)',
        id, studentId, grade, todayKey, dayNumber, JSON.stringify(questions)
      )
      // لو INSERT OR IGNORE اتشال بسبب سباق مع طلب تاني → نقرا صفه
      rows = await db.$queryRawUnsafe('SELECT * FROM DailySolve WHERE studentId = ? AND dayKey = ? LIMIT 1', studentId, todayKey)
      row = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    } catch (e) { console.error('daily assignment insert error:', e) }
  }

  var assigned = row ? parseQuestions(row.questions) : []
  var correctCount = row ? Number(row.correctCount) || 0 : 0
  var totalCount = row ? Number(row.totalCount) || 0 : 0

  // لو صف اليوم موجود بس فاضي من الأسئلة (المستر كان معملش أسئلة وقت الفتح
  // وبعدين نزلها) → بنحاول نتوكّل تاني ونحدّث الصف — الطالب يشوف الأسئلة فورًا
  if (row && assigned.length === 0 && totalCount === 0) {
    var retry = await getDayQuestions(grade, dayNumber, true)
    if (retry.length > 0) {
      assigned = retry
      try {
        await db.$executeRawUnsafe('UPDATE DailySolve SET questions = ?, dayNumber = ? WHERE id = ?', JSON.stringify(retry), dayNumber, row.id)
      } catch (e) { console.error('daily assignment refresh error:', e) }
    }
  }
  if (assigned.length === 0) assigned = await getDayQuestions(grade, dayNumber, true)
  var solved = row ? totalCount > 0 : false

  // من غير الإجابة الصحيحة — التصحيح على السيرفر بس
  var safe = assigned.map(function (q) { return { text: q.text, options: q.options, xp: q.xp, correctIndex: -1 } })

  return {
    dayNumber: row ? Number(row.dayNumber) || dayNumber : dayNumber,
    questions: safe,
    solved: solved,
    correctCount: correctCount,
    totalCount: totalCount,
    xpEarned: row ? Number(row.xpEarned) || 0 : 0,
  }
}

/* ---------- تسوية المراهنات (خاملة — مفيش لمسة في مسارات التسليم) ---------- */

// قاعدة التسوية: النتيجة موجودة + (مرّت 10 دقايق من التسليم أو من الرهان)
// — التصحيح الذكي للمقالي بيكمل في after() خلال ثواني/دقايق فالقاعدة دي آمنة
export var BET_TIERS: { pct: number; multiplier: number }[] = [
  { pct: 50, multiplier: 1.5 },
  { pct: 70, multiplier: 2 },
  { pct: 90, multiplier: 3 },
]

export async function settleOpenBets(studentId?: string): Promise<number> {
  await ensureGameTables()
  var settled = 0
  try {
    var open: any = studentId
      ? await db.$queryRawUnsafe("SELECT * FROM XpBet WHERE status = 'open' AND studentId = ? LIMIT 100", studentId)
      : await db.$queryRawUnsafe("SELECT * FROM XpBet WHERE status = 'open' LIMIT 200")
    for (var i = 0; i < (open || []).length; i++) {
      var bet = open[i]
      try {
        var res: any = null
        if (String(bet.targetType) === 'exam') {
          res = await db.$queryRawUnsafe('SELECT score, maxScore, submittedAt FROM ExamResult WHERE studentId = ? AND examId = ? LIMIT 1', bet.studentId, bet.targetId)
        } else {
          res = await db.$queryRawUnsafe('SELECT score, maxScore, submittedAt FROM HomeworkResult WHERE studentId = ? AND homeworkId = ? LIMIT 1', bet.studentId, bet.targetId)
        }
        if (!Array.isArray(res) || res.length === 0) continue // لسه ما سلّمش — فاضل
        var score = Number((res[0] || {}).score) || 0
        var maxScore = Number((res[0] || {}).maxScore) || 100
        var submittedAt = (res[0] || {}).submittedAt
        var submittedMs = parseDbDate(submittedAt)
        var betMs = parseDbDate(bet.createdAt)
        var ageMs = isFinite(submittedMs) ? Date.now() - submittedMs : Date.now() - (isFinite(betMs) ? betMs : Date.now())
        if (ageMs < 10 * 60 * 1000) continue // التصحيح ممكن يكون لسه بيكمل — نستنى

        var pctAchieved = maxScore > 0 ? (score / maxScore) * 100 : 0
        var won = pctAchieved >= (Number(bet.targetPct) || 70)
        var payout = won ? Math.round((Number(bet.wageredXp) || 0) * (Number(bet.multiplier) || 2)) : 0
        if (won && payout > 0) {
          await addXp(bet.studentId, 'bet_win', payout, 'كسبت المراهنة: ' + String(bet.targetTitle || ''), bet.id)
        }
        await db.$executeRawUnsafe(
          'UPDATE XpBet SET status = ?, payout = ?, finalScore = ?, finalMax = ?, settledAt = CURRENT_TIMESTAMP WHERE id = ?',
          won ? 'won' : 'lost', payout, score, maxScore, bet.id
        )
        settled++
      } catch (eBet) { console.error('settle bet error:', eBet) }
    }
  } catch (e) { console.error('settleOpenBets error:', e) }
  return settled
}

/* ---------- تقييم الشارات (خامل — بيتقيّم عند قراءة الحالة) ---------- */

export interface NewBadge { code: string; name: string; rarity: string }

export async function evaluateBadges(studentId: string): Promise<NewBadge[]> {
  await ensureGameTables()
  var unlocked: NewBadge[] = []
  try {
    var streak = await getStreakState(studentId)
    var bal = await xpBalance(studentId)
    var boxesRows: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM MysteryBoxOpen WHERE studentId = ?', studentId)
    var boxes = Number((boxesRows || [{}])[0].c) || 0
    var solveRows: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM DailySolve WHERE studentId = ?', studentId)
    var solves = Number((solveRows || [{}])[0].c) || 0

    // متوسط دقة الامتحانات (ساحر الرياضة)
    var examRows: any = await db.$queryRawUnsafe('SELECT score, maxScore FROM ExamResult WHERE studentId = ?', studentId)
    var examAcc = 0, examCount = 0
    for (var i = 0; i < (examRows || []).length; i++) {
      var mx = Number((examRows[i] || {}).maxScore) || 0
      if (mx > 0) { examAcc += (Number((examRows[i] || {}).score) || 0) / mx; examCount++ }
    }
    var avgAcc = examCount > 0 ? (examAcc / examCount) * 100 : 0

    // الصاروخ — واجب بدرجة كاملة خلال 24 ساعة من نزوله
    var rocket = false
    try {
      var rocketRows: any = await db.$queryRawUnsafe(
        "SELECT hr.score, hr.maxScore, hr.submittedAt, hw.createdAt FROM HomeworkResult hr JOIN Homework hw ON hw.id = hr.homeworkId WHERE hr.studentId = ?",
        studentId
      )
      for (var r = 0; r < (rocketRows || []).length; r++) {
        var rr = rocketRows[r]
        var hMax = Number(rr.maxScore) || 0
        var hScore = Number(rr.score) || 0
        var created = parseDbDate(rr.createdAt)
        var subm = parseDbDate(rr.submittedAt)
        if (hMax > 0 && hScore >= hMax * 0.999 && isFinite(created) && isFinite(subm) && subm - created <= 86400000) { rocket = true; break }
      }
    } catch (e) {}

    // المراهنات
    var betWinRows: any = await db.$queryRawUnsafe("SELECT COUNT(*) AS c FROM XpBet WHERE studentId = ? AND status = 'won'", studentId)
    var betWins = Number((betWinRows || [{}])[0].c) || 0
    var highRollerRows: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM XpBet WHERE studentId = ? AND wageredXp >= 100', studentId)
    var highRoller = Number((highRollerRows || [{}])[0].c) || 0

    var conditions: Record<string, boolean> = {
      'first_challenge': solves >= 1,
      'streak_3': streak.currentStreak >= 3 || streak.bestStreak >= 3,
      'box_hunter': boxes >= 7,
      'the_consistent': streak.currentStreak >= 7 || streak.bestStreak >= 7,
      'the_rocket': rocket,
      'high_roller': highRoller >= 1,
      'predictor': betWins >= 3,
      'xp_1000': bal >= 1000,
      'math_wizard': examCount >= 5 && avgAcc >= 90,
      'legend_streak': streak.currentStreak >= 30 || streak.bestStreak >= 30,
    }

    var alreadyRows: any = await db.$queryRawUnsafe('SELECT badgeCode FROM StudentBadge WHERE studentId = ?', studentId)
    var already: Record<string, boolean> = {}
    for (var a = 0; a < (alreadyRows || []).length; a++) already[String(alreadyRows[a].badgeCode)] = true

    for (var d = 0; d < BADGE_DEFS.length; d++) {
      var def = BADGE_DEFS[d]
      if (!already[def.code] && conditions[def.code]) {
        try {
          await db.$executeRawUnsafe(
            'INSERT OR IGNORE INTO StudentBadge (id, studentId, badgeCode, unlockedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP)',
            'sbd_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8), studentId, def.code
          )
          unlocked.push({ code: def.code, name: def.name, rarity: def.rarity })
        } catch (e) {}
      }
    }
  } catch (e) { console.error('evaluateBadges error:', e) }
  return unlocked
}

/* ---------- كوزمتيك الصندوق ---------- */

export var COSMETIC_POOL: { key: string; label: string; css: string }[] = [
  { key: 'aura_gold', label: 'هالة ذهبية', css: 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.55)]' },
  { key: 'aura_neon', label: 'هالة نيون', css: 'ring-2 ring-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.55)]' },
  { key: 'aura_emerald', label: 'هالة زمردية', css: 'ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.55)]' },
  { key: 'aura_rose', label: 'هالة نارية', css: 'ring-2 ring-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.55)]' },
  { key: 'crown_pro', label: 'تاج المحترف', css: 'ring-2 ring-yellow-300 shadow-[0_0_22px_rgba(253,224,71,0.7)]' },
  { key: 'shadow_violet', label: 'ظل بنفسجي', css: 'ring-2 ring-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.55)]' },
]

export function cosmeticCss(key: string): string {
  for (var i = 0; i < COSMETIC_POOL.length; i++) {
    if (COSMETIC_POOL[i].key === key) return COSMETIC_POOL[i].css
  }
  return ''
}

export function cosmeticLabel(key: string): string {
  for (var i = 0; i < COSMETIC_POOL.length; i++) {
    if (COSMETIC_POOL[i].key === key) return COSMETIC_POOL[i].label
  }
  return ''
}

/* ---------- إعدادات الصف ---------- */

export interface GameConfigInfo {
  grade: string
  cycleDays: number
  xpPerCorrect: number
  mysteryEnabled: boolean
  bettingEnabled: boolean
}

export var DEFAULT_CONFIG: GameConfigInfo = { grade: '', cycleDays: 7, xpPerCorrect: 10, mysteryEnabled: true, bettingEnabled: true }

export async function getGameConfig(grade: string): Promise<GameConfigInfo> {
  await ensureGameTables()
  var rows: any = await db.$queryRawUnsafe('SELECT * FROM GameConfig WHERE grade = ? LIMIT 1', grade)
  if (Array.isArray(rows) && rows.length > 0) {
    var r = rows[0]
    return {
      grade: grade,
      cycleDays: Math.max(1, Math.min(30, Number(r.cycleDays) || 7)),
      xpPerCorrect: Math.max(1, Math.min(500, Number(r.xpPerCorrect) || 10)),
      mysteryEnabled: Number(r.mysteryEnabled) !== 0,
      bettingEnabled: Number(r.bettingEnabled) !== 0,
    }
  }
  return { grade: grade, cycleDays: DEFAULT_CONFIG.cycleDays, xpPerCorrect: DEFAULT_CONFIG.xpPerCorrect, mysteryEnabled: true, bettingEnabled: true }
}
