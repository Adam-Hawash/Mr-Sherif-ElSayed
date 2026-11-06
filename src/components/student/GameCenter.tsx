'use client'

/* ============================================================
   (2026-ز38) مركز الألعاب — Ultimate Student Engagement &
   Gamification Ecosystem — طلب المستر لمنصة ماث ستيشن بس:
   • تحدي يومي متدرج + ستريك بعقوبة اليوم الضايع + دروع من الصندوق
   • صندوق أسرار كل 24 ساعة (XP / درع / كوزمتيك) — صندوق متوهج متحرك
   • مراهنات XP على امتحانات وواجباته — «توقع نتيجتك» ×1.5/×2/×3
   • شارات إنجاز بثلاث ندرات (عادية/نادرة/أسطورية) بحالات قفل/فتح
   • لوحة ترتيب XP جيمنج منفصلة تمامًا عن لوحة الدرجة الأكاديمية
   • Gaming Vibe: نيون نابض + ذهبي لامع + أنيميشن لكل حاجة
   ============================================================ */

import { useState, useEffect, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  Gamepad2, Flame, Shield, Gift, Coins, Trophy, Crown, Lock, Sparkles,
  Target, Brain, Rocket, CalendarCheck, Timer, Zap, Medal, RefreshCw,
  Check, X, Wallet, History, ChevronUp, Award, Loader2, Swords,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'
import { useT } from '@/lib/i18n'

/* ---------- أنواع ---------- */
interface GameState {
  config: { grade: string; cycleDays: number; xpPerCorrect: number; mysteryEnabled: boolean; bettingEnabled: boolean }
  streak: {
    currentStreak: number; bestStreak: number; cycleDay: number; shields: number
    cosmetics: string[]; equippedCosmetic: string; solvedToday: boolean; resetToday: boolean; shieldSavedToday: boolean
  }
  today: { dayNumber: number; solved: boolean; correctCount: number; totalCount: number; xpEarned: number; questions: { text: string; options: string[]; xp: number }[] }
  xp: { balance: number; ledger: { kind: string; amount: number; note: string; createdAt: string }[] }
  mysteryBox: { lastOpenedAt: string | null; cooldownMs: number; boxesOpened: number }
  badges: { code: string; name: string; nameEn: string; description: string; rarity: string; icon: string; unlocked: boolean; unlockedAt: string | null }[]
  newBadges: { code: string; name: string; rarity: string }[]
  bets: BetRow[]
  betTiers: { pct: number; multiplier: number }[]
  msToMidnight: number
  dayKey: string
}
interface BetRow {
  id: string; targetType: string; targetId: string; targetTitle: string
  wageredXp: number; targetPct: number; multiplier: number; status: string
  payout: number; finalScore: number | null; finalMax: number | null; settledAt: string | null; createdAt: string
}
interface BetTarget { id: string; title: string; type: string }
interface LeaderRow { rank: number; id: string; name: string; grade: string; xp: number; streak: number; badgeCount: number; equipped: string }

var COSMETIC_LABELS: Record<string, string> = {
  aura_gold: 'هالة ذهبية', aura_neon: 'هالة نيون', aura_emerald: 'هالة زمردية',
  aura_rose: 'هالة نارية', crown_pro: 'تاج المحترف', shadow_violet: 'ظل بنفسجي',
}
var COSMETIC_CSS: Record<string, string> = {
  aura_gold: 'ring-2 ring-amber-400 shadow-[0_0_18px_rgba(251,191,36,0.55)]',
  aura_neon: 'ring-2 ring-fuchsia-400 shadow-[0_0_18px_rgba(232,121,249,0.55)]',
  aura_emerald: 'ring-2 ring-emerald-400 shadow-[0_0_18px_rgba(52,211,153,0.55)]',
  aura_rose: 'ring-2 ring-rose-400 shadow-[0_0_18px_rgba(251,113,133,0.55)]',
  crown_pro: 'ring-2 ring-yellow-300 shadow-[0_0_22px_rgba(253,224,71,0.7)]',
  shadow_violet: 'ring-2 ring-violet-400 shadow-[0_0_18px_rgba(167,139,250,0.55)]',
}

var BADGE_ICONS: Record<string, any> = {
  Rocket: Rocket, Flame: Flame, Gift: Gift, CalendarCheck: CalendarCheck,
  Coins: Coins, Target: Target, Sparkles: Sparkles, Brain: Brain, Crown: Crown, Award: Award,
}

function fmtCountdown(ms: number): string {
  if (ms <= 0) return '00:00:00'
  var totalSec = Math.floor(ms / 1000)
  var h = Math.floor(totalSec / 3600)
  var m = Math.floor((totalSec % 3600) / 60)
  var s = totalSec % 60
  var pad = function (n: number) { return String(n).padStart(2, '0') }
  return pad(h) + ':' + pad(m) + ':' + pad(s)
}

function kindLabel(kind: string, T: (ar: string, en: string) => string): string {
  switch (kind) {
    case 'daily': return T('تحدي يومي', 'Daily challenge')
    case 'mystery': return T('صندوق الأسرار', 'Mystery box')
    case 'bet_stake': return T('رهان (خصم)', 'Bet (stake)')
    case 'bet_win': return T('كسب رهان', 'Bet won')
    case 'bet_refund': return T('استرجاع رهان', 'Bet refund')
    case 'admin': return T('من المستر', 'From teacher')
    default: return kind
  }
}

function rarityClasses(rarity: string): { card: string; label: string; labelClass: string } {
  if (rarity === 'legendary') return { card: 'game-card-legendary', label: 'أسطورية', labelClass: 'bg-amber-400/15 text-amber-500 border-amber-400/40' }
  if (rarity === 'rare') return { card: 'game-card-rare', label: 'نادرة', labelClass: 'bg-violet-400/15 text-violet-500 border-violet-400/40' }
  return { card: 'game-card-common', label: 'عادية', labelClass: 'bg-slate-400/15 text-slate-500 border-slate-400/40' }
}

/* ============================================================ */

export function GameCenter() {
  const { currentStudent } = useAppStore()
  const T = useT()
  const studentId = currentStudent?.id || ''
  const grade = currentStudent?.grade || ''

  const [state, setState] = useState<GameState | null>(null)
  const [loading, setLoading] = useState(true)
  const [section, setSection] = useState<'challenge' | 'box' | 'bets' | 'badges' | 'board'>('challenge')

  // التحدي
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [submitting, setSubmitting] = useState(false)
  const [solveResult, setSolveResult] = useState<{ correctCount: number; totalCount: number; xpEarned: number; correctIndices: number[] } | null>(null)

  // الصندوق
  const [chestOpening, setChestOpening] = useState(false)
  const [reward, setReward] = useState<{ type: string; label: string; amount?: number } | null>(null)

  // المراهنات
  const [betTargets, setBetTargets] = useState<BetTarget[]>([])
  const [betFormFor, setBetFormFor] = useState<string | null>(null)
  const [betWager, setBetWager] = useState('50')
  const [betTier, setBetTier] = useState(70)
  const [betBusy, setBetBusy] = useState(false)

  // الترتيب
  const [board, setBoard] = useState<LeaderRow[]>([])
  const [meRank, setMeRank] = useState<{ rank: number; xp: number } | null>(null)
  const [boardLoading, setBoardLoading] = useState(false)

  // مؤقتات العدّ التنازلي (تيك كل ثانية)
  const [tick, setTick] = useState(0)
  const stateFetchedAt = useRef(Date.now())

  // +XP طاير فوق العداد
  const [xpPop, setXpPop] = useState<string | null>(null)
  var popTimer = useRef<any>(null)
  var showXpPop = useCallback(function (text: string) {
    setXpPop(text)
    if (popTimer.current) clearTimeout(popTimer.current)
    popTimer.current = setTimeout(function () { setXpPop(null) }, 1300)
  }, [])

  const loadState = useCallback(async function () {
    if (!studentId) return
    try {
      const res = await fetch('/api/game/state?studentId=' + encodeURIComponent(studentId) + '&grade=' + encodeURIComponent(grade))
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ في تحميل مركز الألعاب')); return }
      stateFetchedAt.current = Date.now()
      setState(data)
      // شارات جديدة؟ — إشعار ملون لكل واحدة
      if (Array.isArray(data.newBadges) && data.newBadges.length > 0) {
        for (var i = 0; i < data.newBadges.length; i++) {
          var b = data.newBadges[i]
          toast.success('🏅 شارة جديدة: ' + b.name + ' (' + rarityClasses(b.rarity).label + ')', { duration: 6000 })
        }
      }
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
  }, [studentId, grade])

  const loadBets = useCallback(async function () {
    if (!studentId) return
    try {
      const res = await fetch('/api/game/bet?studentId=' + encodeURIComponent(studentId) + '&grade=' + encodeURIComponent(grade))
      var data: any = await res.json()
      if (res.ok) { setBetTargets(Array.isArray(data.targets) ? data.targets : []) }
    } catch (e) {}
  }, [studentId, grade])

  const loadBoard = useCallback(async function () {
    if (!studentId) return
    setBoardLoading(true)
    try {
      const res = await fetch('/api/game/leaderboard?studentId=' + encodeURIComponent(studentId))
      var data: any = await res.json()
      if (res.ok) { setBoard(Array.isArray(data.leaderboard) ? data.leaderboard : []); setMeRank(data.me || null) }
    } catch (e) {}
    setBoardLoading(false)
  }, [studentId])

  useEffect(function () {
    if (!studentId) return
    setLoading(true)
    Promise.all([loadState(), loadBets()]).finally(function () { setLoading(false) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId])

  // تيك العدّاد
  useEffect(function () {
    var t = setInterval(function () { setTick(function (x) { return x + 1 }) }, 1000)
    return function () { clearInterval(t) }
  }, [])

  // لما الترتيب يتفتح أول مرة
  useEffect(function () {
    if (section === 'board' && board.length === 0) loadBoard()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section])

  if (!studentId) return null

  /* ---------- القيم المشتقة ---------- */
  var cfg = state ? state.config : null
  var streak = state ? state.streak : null
  var today = state ? state.today : null
  var balance = state ? state.xp.balance : 0

  // وقت متبقي لنهاية اليوم (بالقاهرة) — بيتكّم بالثانية مع كل تيك
  var msLeftToday = state ? Math.max(0, state.msToMidnight - (Date.now() - stateFetchedAt.current)) : 0
  var urgent = state && !today?.solved && today && today.questions.length > 0 && msLeftToday < 6 * 3600 * 1000

  // تهدئة الصندوق
  var boxCooldownMs = state ? Math.max(0, state.mysteryBox.cooldownMs - (Date.now() - stateFetchedAt.current)) : 0
  var boxReady = state ? boxCooldownMs <= 0 : false

  var dayNumber = today ? today.dayNumber : 1
  var cycleDays = cfg ? cfg.cycleDays : 7
  var solvedToday = today ? today.solved : false

  /* ---------- أفعال ---------- */

  async function submitSolve() {
    if (!today || submitting || solvedToday) return
    if (today.questions.length === 0) return
    var missing = -1
    for (var i = 0; i < today.questions.length; i++) {
      if (answers[i] == null) { missing = i; break }
    }
    if (missing !== -1) { toast.error(T('جاوب على كل الأسئلة الأول', 'Answer all questions first')); return }
    setSubmitting(true)
    try {
      const res = await fetch('/api/game/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, grade: grade, answers: today.questions.map(function (_q, i) { return answers[i] != null ? answers[i] : -1 }) }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ في التسليم')); return }
      setSolveResult({ correctCount: data.correctCount, totalCount: data.totalCount, xpEarned: data.xpEarned, correctIndices: data.correctIndices || [] })
      if (data.xpEarned > 0) showXpPop('+' + data.xpEarned + ' XP')
      toast.success('🔥 ' + (data.startedNewCycle ? T('بدأت ستريك جديد', 'New streak started') : T('ستريكك بيكبر', 'Streak growing')) + ' — ' + data.streak + ' ' + T('يوم', 'days'))
      if (Array.isArray(data.newBadges)) {
        for (var b = 0; b < data.newBadges.length; b++) {
          toast.success('🏅 شارة جديدة: ' + data.newBadges[b].name, { duration: 6000 })
        }
      }
      await loadState()
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
    setSubmitting(false)
  }

  async function openBox() {
    if (!boxReady || chestOpening) return
    setChestOpening(true)
    try {
      const res = await fetch('/api/game/mystery-box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId }),
      })
      var data: any = await res.json()
      if (!res.ok) {
        if (res.status === 429 && data.cooldownMs) toast.error(T('الصندوق لسه مقفول — استنى التهديئة', 'Box still locked — wait for cooldown'))
        else toast.error(String(data.error || 'حصل خطأ'))
        return
      }
      setReward(data.reward)
      if (data.reward && data.reward.type === 'xp' && data.reward.amount > 0) showXpPop('+' + data.reward.amount + ' XP')
      if (Array.isArray(data.newBadges)) {
        for (var b = 0; b < data.newBadges.length; b++) toast.success('🏅 شارة جديدة: ' + data.newBadges[b].name, { duration: 6000 })
      }
      await loadState()
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
    setChestOpening(false)
  }

  async function placeBet(target: BetTarget) {
    var wager = Math.floor(Number(betWager) || 0)
    if (wager < 10) { toast.error(T('أقل رهان 10 XP', 'Minimum bet is 10 XP')); return }
    if (wager > balance) { toast.error(T('رصيدك مش كفاية', 'Not enough XP')); return }
    setBetBusy(true)
    try {
      const res = await fetch('/api/game/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, targetType: target.type, targetId: target.id, grade: grade, wageredXp: wager, targetPct: betTier }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ في الرهان')); return }
      toast.success('🎲 ' + T('الرهان اتحط! لو نجبت هتجيب', 'Bet placed! If you hit it you get') + ' +' + data.potentialPayout + ' XP')
      setBetFormFor(null)
      await Promise.all([loadState(), loadBets()])
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
    setBetBusy(false)
  }

  async function cancelBet(bet: BetRow) {
    try {
      const res = await fetch('/api/game/bet?studentId=' + encodeURIComponent(studentId) + '&betId=' + encodeURIComponent(bet.id), { method: 'DELETE' })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'مقدرش تلغي')); return }
      toast.success(T('الرهان اتلغى والـ XP رجع', 'Bet cancelled — XP refunded'))
      await loadState()
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
  }

  async function equipCosmetic(key: string) {
    try {
      const res = await fetch('/api/game/state', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, action: 'equipCosmetic', key: key }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'مقدرش')); return }
      toast.success(key ? T('الكوزمتيك اتجاهز!', 'Cosmetic equipped!') : T('التجهيز اتشال', 'Unequipped'))
      await loadState()
    } catch (e) {}
  }

  /* ---------- واجهة ---------- */

  var secs = {
    challenge: { label: T('التحدي اليومي', 'Daily'), icon: Zap },
    box: { label: T('الصندوق', 'Mystery'), icon: Gift },
    bets: { label: T('المراهنات', 'Bets'), icon: Coins },
    badges: { label: T('الشارات', 'Badges'), icon: Medal },
    board: { label: T('ترتيب XP', 'XP Board'), icon: Trophy },
  }

  var equippedCss = streak && streak.equippedCosmetic && COSMETIC_CSS[streak.equippedCosmetic] ? COSMETIC_CSS[streak.equippedCosmetic] : ''
  var myRankRow = board.find(function (r) { return r.id === studentId })

  return (
    <div className="space-y-4" dir="rtl">
      {/* ======= شريط البطل — XP الذهبي + الستريك + الدروع ======= */}
      <Card className="game-card">
        <CardContent className="p-4 sm:p-5">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            {/* رصيد XP الذهبي */}
            <div className="relative flex items-center gap-2">
              <div className={'flex h-11 w-11 items-center justify-center rounded-full bg-amber-400/15 text-lg font-black text-amber-500 ' + equippedCss}>
                {(currentStudent?.name || '؟').trim().charAt(0)}
              </div>
              <div>
                <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1"><Coins className="h-3 w-3 text-amber-500" />{T('رصيد الخبرة', 'XP Balance')}</div>
                <div className="game-xp-gold text-2xl sm:text-3xl font-black leading-none tabular-nums">{balance.toLocaleString('en-US')}</div>
              </div>
              {xpPop && (
                <span className="game-xp-pop pointer-events-none absolute -top-2 right-10 text-lg font-black text-emerald-500">+{xpPop.replace('XP', '').trim()} XP</span>
              )}
            </div>
            {/* الستريك */}
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Flame className={'h-5 w-5 text-orange-500 ' + (streak && streak.currentStreak > 0 ? 'game-flame' : 'opacity-40')} />
                  <span className="text-2xl font-black text-orange-500 tabular-nums">{streak ? streak.currentStreak : 0}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{T('ستريك', 'Streak')}</div>
              </div>
              <div className="text-center">
                <div className="flex items-center justify-center gap-1">
                  <Shield className="h-5 w-5 text-sky-500" />
                  <span className="text-2xl font-black text-sky-500 tabular-nums">{streak ? streak.shields : 0}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{T('دروع', 'Shields')}</div>
              </div>
              <div className="text-center hidden sm:block">
                <div className="flex items-center justify-center gap-1">
                  <Crown className="h-5 w-5 text-amber-500" />
                  <span className="text-2xl font-black text-amber-500 tabular-nums">{streak ? streak.bestStreak : 0}</span>
                </div>
                <div className="text-[10px] text-muted-foreground">{T('أفضل ستريك', 'Best')}</div>
              </div>
            </div>
          </div>
          {/* شريط تقدم اليوم في الدورة */}
          <div className="mt-4">
            <div className="flex items-center justify-between text-[11px] text-muted-foreground mb-1">
              <span>{T('يوم', 'Day')} <b className="text-foreground">{dayNumber}</b> {T('من دورة', 'of cycle')} <b className="text-foreground">{cycleDays}</b> {T('يوم', 'days')}</span>
              <span>{T('أحلى نتيجة ستريك', 'Best streak')}: {streak ? streak.bestStreak : 0}</span>
            </div>
            <Progress value={Math.round(((dayNumber - 1) / Math.max(1, cycleDays)) * 100)} className="h-2" />
          </div>
        </CardContent>
      </Card>

      {/* ======= تنبيهات الإلحاح — نيون نابض ======= */}
      {state && streak && streak.resetToday && (
        <div className="game-urgent rounded-xl border-2 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <Flame className="h-5 w-5 shrink-0" />
          {T('الستريك بقى صفر! فاتك يوم من غير حل — يلا ابدأ من جديد من اليوم الأول', 'Your streak reset! You missed a day — start fresh from Day 1')}
        </div>
      )}
      {urgent && (
        <div className="game-urgent rounded-xl border-2 bg-rose-500/10 px-4 py-3 text-sm font-bold text-rose-600 dark:text-rose-400 flex items-center gap-2">
          <Timer className="h-5 w-5 shrink-0 animate-pulse" />
          <span>
            {T('الوقت بيجري! تحدي النهارده بينتهي خلال', 'Time is running out! Today’s challenge ends in')} <b className="tabular-nums">{fmtCountdown(msLeftToday)}</b> — {T('سترِيكك في خطر لو ما حليتش النهارده!', 'Your streak is in danger if you don’t solve today!')}
          </span>
        </div>
      )}
      {state && streak && streak.shieldSavedToday && (
        <div className="rounded-xl border border-sky-400/50 bg-sky-500/10 px-4 py-3 text-sm font-bold text-sky-600 dark:text-sky-400 flex items-center gap-2">
          <Shield className="h-5 w-5 shrink-0" />
          {T('درع غطّى يومك الضايع — الستريك نجا! (باقي', 'A shield covered your missed day — streak saved! (left')} {streak.shields})
        </div>
      )}

      {/* ======= تنقل الأقسام ======= */}
      <div className="flex gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden snap-x">
        {Object.keys(secs).map(function (key: string) {
          var S = (secs as Record<string, { label: string; icon: any }>)[key]
          var Icon = S.icon
          var active = section === key
          return (
            <button
              key={key}
              onClick={function () { setSection(key as any) }}
              className={'flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap snap-start transition-colors min-h-[44px] ' +
                (active ? 'bg-primary text-primary-foreground shadow-md' : 'bg-muted/60 text-muted-foreground hover:text-foreground')}
            >
              <Icon className="h-4 w-4" />
              {S.label}
            </button>
          )
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
      ) : !state ? (
        <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">{T('حصل خطأ في التحميل — اسحب لتحديث', 'Failed to load — refresh')}</CardContent></Card>
      ) : (
        <>
          {/* ================= التحدي اليومي ================= */}
          {section === 'challenge' && (
            <Card className={'game-card ' + (urgent ? 'game-urgent' : '')}>
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10"><Zap className="h-5 w-5 text-primary" /></div>
                    <div>
                      <div className="font-black">{T('التحدي اليومي', 'Daily Challenge')}</div>
                      <div className="text-[11px] text-muted-foreground">{T('يوم', 'Day')} {dayNumber}/{cycleDays} • {today?.questions.length || 0} {T('أسئلة', 'questions')} • {cfg ? '+' + cfg.xpPerCorrect : '+10'} XP {T('لكل إجابة صح', 'per correct')}</div>
                    </div>
                  </div>
                  {solvedToday && (
                    <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/40 border"><Check className="h-3 w-3 ml-1" />{T('خلصت النهارده', 'Done today')}</Badge>
                  )}
                </div>

                {/* نتيجة الحل */}
                {(solveResult || solvedToday) && (
                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
                    <Trophy className="h-5 w-5 shrink-0" />
                    {T('جبت', 'You scored')} {(solveResult ? solveResult.correctCount : today?.correctCount) || 0}/{(solveResult ? solveResult.totalCount : today?.totalCount) || 0} • +{(solveResult ? solveResult.xpEarned : today?.xpEarned) || 0} XP
                    {!(solveResult) && <span className="text-[11px] font-medium opacity-80">— {T('رجوع بكرة لتحدّي جديد', 'come back tomorrow for a new one')}</span>}
                  </div>
                )}

                {/* الأسئلة أو الحالة الفاضية */}
                {!solvedToday && today && today.questions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-muted-foreground/30 px-4 py-6 text-center text-sm text-muted-foreground">
                    <Gamepad2 className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    {T('التحدي مش متاح لسه — المستر معملش أسئلة للصف ده. لما ينزل الأسئلة هتلاقيها هنا يوميًا!', 'No challenge yet — your teacher hasn’t built questions for this grade yet')}
                  </div>
                )}

                {!solvedToday && today && today.questions.map(function (q, qi) {
                  var correctIdx = solveResult ? solveResult.correctIndices[qi] : -1
                  return (
                    <div key={qi} className={'rounded-xl border p-3 sm:p-4 space-y-3 ' + (solveResult && answers[qi] === correctIdx ? 'border-emerald-500/50 bg-emerald-500/5' : solveResult && answers[qi] !== correctIdx ? 'border-rose-500/50 bg-rose-500/5' : 'border-muted-foreground/20')}>
                      <div className="flex items-start gap-2">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-black text-primary">{qi + 1}</span>
                        <p className="text-sm font-bold leading-relaxed pt-0.5 whitespace-pre-wrap">{q.text}</p>
                        {q.xp > 0 && <span className="ms-auto shrink-0 text-[10px] font-bold text-amber-500">+{q.xp} XP</span>}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {q.options.map(function (opt, oi) {
                          var picked = answers[qi] === oi
                          var isCorrect = solveResult && correctIdx === oi
                          var isWrongPick = solveResult && picked && correctIdx !== oi
                          return (
                            <button
                              key={oi}
                              disabled={!!solveResult || solvedToday || submitting}
                              onClick={function () { setAnswers(function (prev) { var nx = { ...prev }; nx[qi] = oi; return nx }) }}
                              className={'flex items-center gap-2 rounded-lg border px-3 py-3 text-start text-sm font-medium transition-all min-h-[44px] ' +
                                (isCorrect ? 'border-emerald-500 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                                  : isWrongPick ? 'border-rose-500 bg-rose-500/15 text-rose-700 dark:text-rose-400'
                                  : picked ? 'border-primary bg-primary/10 text-primary'
                                  : 'border-muted-foreground/25 hover:border-primary/60 hover:bg-muted/50')}
                            >
                              <span className={'flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-black ' + (picked || isCorrect ? 'border-current' : 'border-muted-foreground/40 text-muted-foreground')}>
                                {String.fromCharCode(65 + oi)}
                              </span>
                              <span className="flex-1">{opt}</span>
                              {isCorrect && <Check className="h-4 w-4 shrink-0" />}
                              {isWrongPick && <X className="h-4 w-4 shrink-0" />}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}

                {!solvedToday && today && today.questions.length > 0 && !solveResult && (
                  <Button
                    onClick={submitSolve}
                    disabled={submitting}
                    className="w-full h-12 text-base font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white shadow-lg"
                  >
                    {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
                    {submitting ? T('بيصحح...', 'Grading...') : T('سلّم التحدي وخد الـ XP', 'Submit & claim XP')}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          {/* ================= صندوق الأسرار ================= */}
          {section === 'box' && (
            <Card className="game-card">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex items-center gap-2">
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-400/10"><Gift className="h-5 w-5 text-amber-500" /></div>
                  <div>
                    <div className="font-black">{T('صندوق الأسرار اليومي', 'Daily Mystery Box')}</div>
                    <div className="text-[11px] text-muted-foreground">{T('صندوق واحد كل 24 ساعة — XP أو درع ستريك أو شكل حصري لبروفايلك', 'One box every 24h — XP, a streak shield, or an exclusive profile cosmetic')}</div>
                  </div>
                </div>

                <div className="flex flex-col items-center py-6">
                  {boxReady && cfg && cfg.mysteryEnabled ? (
                    <button onClick={openBox} disabled={chestOpening} className="group flex flex-col items-center gap-3">
                      <span className={'text-7xl sm:text-8xl select-none ' + (chestOpening ? 'game-chest-opening' : 'game-chest-ready')} role="img" aria-label={T('صندوق الأسرار', 'mystery box')}>
                        🎁
                      </span>
                      <span className="rounded-full bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3 text-sm font-black text-white shadow-lg min-h-[44px] flex items-center gap-2">
                        {chestOpening ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                        {chestOpening ? T('جاي يفتح...', 'Opening...') : T('افتح الصندوق!', 'Open the box!')}
                      </span>
                    </button>
                  ) : (
                    <div className="flex flex-col items-center gap-3">
                      <span className="text-7xl sm:text-8xl select-none opacity-60 grayscale">🔒🎁</span>
                      <div className="rounded-full border border-muted-foreground/30 bg-muted/50 px-5 py-2.5 text-sm font-bold text-muted-foreground flex items-center gap-2">
                        <Timer className="h-4 w-4" />
                        {T('الصندوق الجاي بعد', 'Next box in')} <b className="tabular-nums text-foreground">{fmtCountdown(boxCooldownMs)}</b>
                      </div>
                    </div>
                  )}
                  {cfg && !cfg.mysteryEnabled && (
                    <p className="mt-3 text-xs text-muted-foreground">{T('الصناديق مقفولة لصفك حاليًا', 'Mystery boxes are disabled for your grade right now')}</p>
                  )}
                  <p className="mt-4 text-xs text-muted-foreground">{T('فتحت', 'You’ve opened')} <b className="text-amber-500">{state.mysteryBox.boxesOpened}</b> {T('صندوق لحد دلوقتي', 'boxes so far')}</p>
                </div>

                {/* ألوان الجوائز الممكنة */}
                <div className="grid grid-cols-3 gap-2 text-center text-[11px]">
                  <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-2 py-2 font-bold text-amber-600 dark:text-amber-400"><Coins className="mx-auto h-4 w-4 mb-1" />XP {T('مضمون', 'guaranteed')}</div>
                  <div className="rounded-lg border border-sky-400/30 bg-sky-400/10 px-2 py-2 font-bold text-sky-600 dark:text-sky-400"><Shield className="mx-auto h-4 w-4 mb-1" />{T('درع ستريك', 'Streak shield')}</div>
                  <div className="rounded-lg border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-2 font-bold text-fuchsia-600 dark:text-fuchsia-400"><Sparkles className="mx-auto h-4 w-4 mb-1" />{T('شكل حصري', 'Cosmetic')}</div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ================= المراهنات ================= */}
          {section === 'bets' && (
            <div className="space-y-4">
              <Card className="game-card">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-400/10"><Swords className="h-5 w-5 text-emerald-500" /></div>
                    <div>
                      <div className="font-black">{T('راهن على نتيجتك', 'Wager on your result')}</div>
                      <div className="text-[11px] text-muted-foreground">{T('قبل ما تحل امتحان أو واجب — حط جزء من XP على توقعك. لو نجبت بتضاعف، لو فشلت بتخسر الرهان', 'Before you take a quiz or homework — stake XP on your prediction. Hit it to multiply it, miss it and lose the stake')}</div>
                    </div>
                  </div>
                  {cfg && !cfg.bettingEnabled && (
                    <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs font-bold text-amber-600">{T('المراهنات مقفولة لصفك حاليًا', 'Betting is disabled for your grade right now')}</div>
                  )}
                  {/* مستويات التوقع */}
                  <div className="grid grid-cols-3 gap-2">
                    {state.betTiers.map(function (t) {
                      var active = betTier === t.pct
                      return (
                        <button key={t.pct} onClick={function () { setBetTier(t.pct) }}
                          className={'rounded-lg border px-2 py-3 text-center transition-all min-h-[52px] ' + (active ? 'border-primary bg-primary/10 shadow-md' : 'border-muted-foreground/25 hover:border-primary/50')}>
                          <div className={'text-lg font-black ' + (active ? 'text-primary' : 'text-foreground')}>{t.pct}%+</div>
                          <div className="text-[10px] text-muted-foreground">×{t.multiplier} {T('مضاعف', 'mult')}</div>
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* الأهداف المتاحة */}
              {cfg && cfg.bettingEnabled && (
                <Card className="game-card">
                  <CardContent className="p-4 sm:p-5 space-y-2">
                    <div className="text-sm font-black flex items-center gap-2"><Target className="h-4 w-4 text-primary" />{T('متاح للمراهنة', 'Available to bet on')} <span className="text-muted-foreground font-medium">({betTargets.length})</span></div>
                    {betTargets.length === 0 && (
                      <p className="py-4 text-center text-xs text-muted-foreground">{T('مفيش امتحانات أو واجبات متاحة للمراهنة دلوقتي — لما ينزل حاجة جديدة هتلاقيها هنا', 'Nothing to bet on right now — new exams/homework will appear here')}</p>
                    )}
                    {betTargets.map(function (t) {
                      var formOpen = betFormFor === t.id
                      var wagerNum = Math.floor(Number(betWager) || 0)
                      var tierMult = 1; var tierPct = betTier
                      for (var ti = 0; ti < state.betTiers.length; ti++) { if (state.betTiers[ti].pct === betTier) tierMult = state.betTiers[ti].multiplier }
                      return (
                        <div key={t.id} className="rounded-xl border border-muted-foreground/20 p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <Badge variant="outline" className={'shrink-0 text-[10px] ' + (t.type === 'exam' ? 'text-rose-500 border-rose-400/40' : 'text-sky-500 border-sky-400/40')}>
                                {t.type === 'exam' ? T('امتحان', 'Exam') : T('واجب', 'Homework')}
                              </Badge>
                              <span className="text-sm font-bold truncate">{t.title}</span>
                            </div>
                            <Button size="sm" variant={formOpen ? 'secondary' : 'default'} className="min-h-[40px] shrink-0" onClick={function () { setBetFormFor(formOpen ? null : t.id) }}>
                              <Coins className="h-3.5 w-3.5" />{T('راهن', 'Bet')}
                            </Button>
                          </div>
                          {formOpen && (
                            <div className="space-y-3 rounded-lg bg-muted/40 p-3">
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number" min={10} max={balance} value={betWager}
                                  onChange={function (e) { setBetWager(e.target.value) }}
                                  className="h-11 w-28 text-center font-black" dir="ltr"
                                  aria-label={T('قيمة الرهان', 'Wager amount')}
                                />
                                <div className="flex gap-1 flex-wrap">
                                  {[25, 50, 100].map(function (q) {
                                    return <Button key={q} size="sm" variant="outline" className="h-9 px-2 text-xs" onClick={function () { setBetWager(String(q)) }}>+{q}</Button>
                                  })}
                                  <Button size="sm" variant="outline" className="h-9 px-2 text-xs" onClick={function () { setBetWager(String(balance)) }}>{T('الكل', 'MAX')}</Button>
                                </div>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{T('لو نجبت بـ', 'If you hit')} <b className="text-foreground">{tierPct}%+</b>:</span>
                                <span className="font-black text-emerald-500">+{Math.round(wagerNum * tierMult).toLocaleString('en-US')} XP</span>
                              </div>
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">{T('لو فشلت بتحتمن', 'If you miss')}:</span>
                                <span className="font-black text-rose-500">−{wagerNum.toLocaleString('en-US')} XP</span>
                              </div>
                              <Button
                                onClick={function () { placeBet(t) }}
                                disabled={betBusy || wagerNum < 10 || wagerNum > balance}
                                className="w-full h-11 font-black bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white"
                              >
                                {betBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Coins className="h-4 w-4" />}
                                {T('ثبّت الرهان', 'Lock the bet')}
                              </Button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </CardContent>
                </Card>
              )}

              {/* المراهنات المفتوحة + التاريخ */}
              <Card className="game-card">
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="text-sm font-black flex items-center gap-2"><History className="h-4 w-4 text-primary" />{T('مراهناتي', 'My bets')}</div>
                  {state.bets.length === 0 && <p className="py-4 text-center text-xs text-muted-foreground">{T('لسه مفيش مراهنات', 'No bets yet')}</p>}
                  {state.bets.map(function (b) {
                    var canCancel = b.status === 'open' && (Date.now() - (Date.parse(b.createdAt.replace(' ', 'T') + 'Z') || 0)) < 10 * 60 * 1000
                    return (
                      <div key={b.id} className={'flex items-center justify-between gap-2 rounded-xl border p-3 flex-wrap ' + (b.status === 'won' ? 'border-emerald-500/40 bg-emerald-500/5' : b.status === 'lost' ? 'border-rose-500/40 bg-rose-500/5' : b.status === 'cancelled' ? 'border-muted-foreground/25 opacity-70' : 'border-amber-500/40 bg-amber-500/5')}>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="shrink-0 text-[10px]">{b.targetType === 'exam' ? T('امتحان', 'Exam') : T('واجب', 'Homework')}</Badge>
                            <span className="text-sm font-bold truncate max-w-[200px]">{b.targetTitle || T('هدف', 'target')}</span>
                          </div>
                          <div className="mt-1 text-[11px] text-muted-foreground">
                            {T('رهان', 'Wager')} <b className="text-foreground">{b.wageredXp}</b> XP • {T('توقع', 'Target')} <b className="text-foreground">{b.targetPct}%+</b> • ×{b.multiplier}
                            {b.status === 'won' && <span className="text-emerald-500 font-bold"> • {T('كسبت', 'WON')} +{b.payout} XP</span>}
                            {b.status === 'lost' && <span className="text-rose-500 font-bold"> • {T('خسرت الرهان', 'Lost the stake')}</span>}
                            {b.status === 'cancelled' && <span> • {T('ملغي', 'Cancelled')}</span>}
                            {b.status === 'open' && <span className="text-amber-500 font-bold"> • {T('مفتوح — بانتظار نتيجتك', 'Open — waiting for your result')}</span>}
                          </div>
                        </div>
                        {canCancel && (
                          <Button size="sm" variant="outline" className="min-h-[40px] shrink-0 text-rose-500 border-rose-400/40 hover:bg-rose-500/10" onClick={function () { cancelBet(b) }}>
                            <X className="h-3.5 w-3.5" />{T('إلغاء', 'Cancel')}
                          </Button>
                        )}
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================= الشارات + الكوزمتيك ================= */}
          {section === 'badges' && (
            <div className="space-y-4">
              <Card className="game-card">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="text-sm font-black flex items-center gap-2">
                    <Medal className="h-4 w-4 text-primary" />{T('مجموعة الشارات', 'Badge collection')}
                    <Badge className="ml-auto bg-primary/10 text-primary border border-primary/30">{state.badges.filter(function (b) { return b.unlocked }).length}/{state.badges.length}</Badge>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    {state.badges.map(function (b) {
                      var rc = rarityClasses(b.rarity)
                      var Icon = BADGE_ICONS[b.icon] || Award
                      return (
                        <div key={b.code} className={'rounded-xl border p-3 text-center space-y-1.5 transition-all ' + rc.card + ' ' + (b.unlocked ? '' : 'game-locked')}>
                          <Icon className={'mx-auto h-7 w-7 ' + (b.rarity === 'legendary' ? 'text-amber-500' : b.rarity === 'rare' ? 'text-violet-500' : 'text-slate-400')} />
                          <div className="text-xs font-black leading-tight">{b.name}</div>
                          <div className="text-[10px] text-muted-foreground leading-snug line-clamp-2">{b.description}</div>
                          <div className="flex items-center justify-center gap-1">
                            {b.unlocked ? <Check className="h-3 w-3 text-emerald-500" /> : <Lock className="h-3 w-3 text-muted-foreground" />}
                            <span className={'rounded border px-1.5 py-0.5 text-[9px] font-bold ' + rc.labelClass}>{rc.label}</span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* الكوزمتيك */}
              <Card className="game-card">
                <CardContent className="p-4 sm:p-5 space-y-3">
                  <div className="text-sm font-black flex items-center gap-2"><Sparkles className="h-4 w-4 text-fuchsia-500" />{T('أشكال البروفايل الحصرية', 'Exclusive profile cosmetics')}</div>
                  {streak && streak.cosmetics.length === 0 && (
                    <p className="text-xs text-muted-foreground">{T('لسه مفيش — افتح صناديق الأسرار وبتجيك أشكال حصرية تلبسها جنب اسمك', 'None yet — open mystery boxes to unlock exclusive profile cosmetics')}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {(streak ? streak.cosmetics : []).map(function (key) {
                      var equippedNow = (streak ? streak.equippedCosmetic : '') === key
                      return (
                        <button key={key} onClick={function () { equipCosmetic(equippedNow ? '' : key) }}
                          className={'flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-bold transition-all min-h-[40px] ' + (equippedNow ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/30 hover:border-primary/50')}>
                          <span className={'h-4 w-4 rounded-full bg-amber-400 ' + (COSMETIC_CSS[key] || '')} />
                          {COSMETIC_LABELS[key] || key}
                          {equippedNow && <Check className="h-3.5 w-3.5" />}
                        </button>
                      )
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* دفتر XP */}
              <Card className="game-card">
                <CardContent className="p-4 sm:p-5 space-y-2">
                  <div className="text-sm font-black flex items-center gap-2"><Wallet className="h-4 w-4 text-primary" />{T('آخر حركات الـ XP', 'Recent XP activity')}</div>
                  {state.xp.ledger.length === 0 && <p className="py-3 text-center text-xs text-muted-foreground">{T('لسه مفيش حركة', 'Nothing yet')}</p>}
                  {state.xp.ledger.map(function (l, i) {
                    return (
                      <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-muted-foreground/15 px-3 py-2 text-xs">
                        <span className="font-bold">{kindLabel(l.kind, T)}{l.note ? <span className="text-muted-foreground font-normal"> — {l.note}</span> : null}</span>
                        <span className={'font-black tabular-nums ' + (l.amount >= 0 ? 'text-emerald-500' : 'text-rose-500')} dir="ltr">
                          {l.amount >= 0 ? '+' : ''}{Math.round(l.amount)}
                        </span>
                      </div>
                    )
                  })}
                </CardContent>
              </Card>
            </div>
          )}

          {/* ================= لوحة ترتيب XP ================= */}
          {section === 'board' && (
            <Card className="game-card">
              <CardContent className="p-4 sm:p-5 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="text-sm font-black flex items-center gap-2"><Trophy className="h-4 w-4 text-amber-500" />{T('لوحة أبطال الـ XP', 'XP Champions Board')}</div>
                  <Button size="sm" variant="outline" className="min-h-[40px]" onClick={loadBoard} disabled={boardLoading}>
                    <RefreshCw className={'h-3.5 w-3.5 ' + (boardLoading ? 'animate-spin' : '')} />{T('تحديث', 'Refresh')}
                  </Button>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {T('دي لوحة XP الجيمنج (تحديات + صناديق + مراهنات) — منفصلة تمامًا عن لوحة الشرف الأكاديمية بالدرجات', 'This is the gaming XP board (challenges + boxes + bets) — completely separate from the academic scores leaderboard')}
                </p>
                {meRank && !myRankRow && (
                  <div className="rounded-xl border border-primary/40 bg-primary/5 px-4 py-2.5 text-sm font-bold text-primary flex items-center gap-2">
                    <ChevronUp className="h-4 w-4" />{T('مكانك', 'Your rank')} <b>#{meRank.rank}</b> — {meRank.xp.toLocaleString('en-US')} XP
                  </div>
                )}
                {boardLoading && board.length === 0 ? (
                  <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
                ) : board.length === 0 ? (
                  <p className="py-8 text-center text-xs text-muted-foreground">{T('لسه مفيش أبطال — كن أول واحد يجمع XP!', 'No champions yet — be the first to earn XP!')}</p>
                ) : (
                  <div className="space-y-1.5">
                    {board.map(function (r) {
                      var medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : null
                      var isMe = r.id === studentId
                      return (
                        <div key={r.id} className={'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 ' + (isMe ? 'border-primary bg-primary/10' : 'border-muted-foreground/15')}>
                          <div className="w-8 text-center text-sm font-black shrink-0">{medal || <span className="text-muted-foreground">#{r.rank}</span>}</div>
                          <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-400/15 text-sm font-black text-amber-500 ' + (r.equipped && COSMETIC_CSS[r.equipped] ? COSMETIC_CSS[r.equipped] : '')}>
                            {r.name.charAt(0)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-bold truncate">
                              {r.name}
                              {r.streak > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-orange-500"><Flame className="h-3 w-3" />{r.streak}</span>}
                              {r.badgeCount > 0 && <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-violet-500"><Medal className="h-3 w-3" />{r.badgeCount}</span>}
                            </div>
                            <div className="text-[10px] text-muted-foreground truncate">{r.grade}</div>
                          </div>
                          <div className="game-xp-gold text-lg font-black tabular-nums shrink-0">{r.xp.toLocaleString('en-US')}</div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </>
      )}

      {/* ======= مودال جايزة الصندوق ======= */}
      <Dialog open={!!reward} onOpenChange={function (o) { if (!o) setReward(null) }}>
        <DialogContent className="max-w-[320px] text-center" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-center">{T('🎁 مبروك! جايزة الصندوق', '🎁 Congrats! Box reward')}</DialogTitle>
          </DialogHeader>
          {reward && (
            <div className="game-reward-pop space-y-3 py-3">
              <div className="text-6xl">
                {reward.type === 'xp' ? '💰' : reward.type === 'shield' ? '🛡️' : '✨'}
              </div>
              <div className={'text-xl font-black ' + (reward.type === 'xp' ? 'game-xp-gold' : 'text-sky-500')}>
                {reward.label}
              </div>
              <p className="text-xs text-muted-foreground">
                {reward.type === 'xp' ? T('الـ XP اتضاف لرصيدك فورًا', 'XP added to your balance instantly')
                  : reward.type === 'shield' ? T('الدرع بيبان في شريط البطل — بيحمي ستريكك يوم ضايع واحد', 'Shield shows in your hero strip — protects your streak for one missed day')
                  : T('روح لتاب الشارات ولبس شكلك الجديد!', 'Go to the Badges tab and equip your new look!')}
              </p>
              <Button className="w-full h-11 font-black" onClick={function () { setReward(null) }}>{T('يا سلام!', 'Awesome!')}</Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
