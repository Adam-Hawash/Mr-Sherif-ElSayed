'use client'

// ============================================================
// FILE: src/components/student/gamify/GamifyHub.tsx
// PURPOSE: (2026-غ1) «غرفة التحدي» — جسم تاب التحدي اليومي بالكامل:
//   1) بطاقة سؤال اليوم (اختيارات كبيرة أو إجابة نصية + نتيجة فورية)
//   2) صندوق الكنز — تفتيح بالأنيميشن + جوايز بالندرة + كولداون 24 ساعة
//   3) حائط الشارات — مقفولة/مفتوحة بتوهج حسب الندرة
//   4) ضاعف نقاطك — تحدي التوقعات (الاسم بطلب المستر: «ما تخليهاش توقع واربح — خليها ضاعف نقاطك» + no risk, no fun. صغيرة جنبه)
//      سلايدر النقاط + توقع النتيجة + قاعدة الأرباح
//   5) لوحات الترتيب المزدوجة — النقاط الدراسية / XP التحدي (منفصلتين)
// القواعد: عنبري/ذهبي للـ XP والكنز + زمردي للنجاح + أحمر/برتقالي للتحذير
//   + بنفسجي للنادر + مفيش أزرق/بنفسجي غامق + الإجابة الصح **عمرها ما بترجع
//   من السيرفر** — ممنوع نلوّن أي اختيار كأنه «الصح» قبل رد السيرفر
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode, Dispatch, SetStateAction } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { toast } from 'sonner'
import {
  Clock, Flame, Gift, Loader2, Lock, Medal, RefreshCw, Send, Shield,
  Sparkles, Target, Trophy, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { useGamifyState } from './useGamifyState'
import type { GamifyQuestion, GamifyState } from './useGamifyState'

/* حروف الاختيارات A=أ,B=ب,C=ج,D=د — 0-based زي choiceIndex */
const CHOICE_LETTERS = ['أ', 'ب', 'ج', 'د', 'هـ', 'و']

/* (ت1) عرض تاريخ YYYY-MM-DD بالعربي — «25 أكتوبر» */
const AR_MONTHS_SHORT = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
function fmtArabicDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''))
  if (!m) return String(v || '')
  return String(parseInt(m[3], 10)) + ' ' + AR_MONTHS_SHORT[parseInt(m[2], 10) - 1]
}

interface GamifyHubProps {
  studentId: string
  grade: string
  /* محفوظة للتنقل من داخل الغرفة (مثلًا: ارجع للدروس) */
  onNavigate?: (tab: string) => void
}

export function GamifyHub({ studentId, grade, onNavigate }: GamifyHubProps) {
  const { state, loading, error, refresh } = useGamifyState(studentId, grade)

  if (!studentId) return null

  return (
    <div className="mx-auto max-w-3xl space-y-4 sm:space-y-5">
      {/* ترويسة «غرفة التحدي» */}
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-lg sm:text-xl font-extrabold">
          <span className="bg-gradient-to-l from-amber-300 via-yellow-200 to-orange-400 bg-clip-text text-transparent">غرفة التحدي</span>
          <Flame className="h-5 w-5 text-orange-400" />
        </h1>
        {state && <span className="text-[11px] text-zinc-500">{formatToday(state.today)}</span>}
      </div>

      {/* شريط إحصائيات الطالب */}
      {state && (
        <div className="grid grid-cols-4 gap-2">
          <StatChip icon={<Zap className="h-3.5 w-3.5" />} label="XP" value={Number(state.profile.xp) || 0} cls="border-amber-500/40 bg-amber-500/15 text-amber-300" />
          <StatChip icon={<Flame className="h-3.5 w-3.5" />} label="ستريك" value={Number(state.profile.streak) || 0} cls="border-emerald-500/40 bg-emerald-500/15 text-emerald-300" />
          <StatChip icon={<Trophy className="h-3.5 w-3.5" />} label="أفضل سلسلة" value={Number(state.profile.bestStreak) || 0} cls="border-zinc-600 bg-zinc-800/80 text-zinc-200" />
          <StatChip icon={<Shield className="h-3.5 w-3.5" />} label="درع" value={Number(state.profile.shield) || 0} cls="border-violet-500/40 bg-violet-500/15 text-violet-300" />
        </div>
      )}

      {/* سكيليتون أول تحميل */}
      {loading && !state && <HubSkeleton />}

      {/* خطأ من غير حالة — إعادة محاولة */}
      {error && !state && (
        <Card className="items-center gap-3 rounded-2xl border-red-500/30 bg-red-950/40 py-6 text-center text-zinc-100">
          <CardContent className="flex flex-col items-center gap-3 px-4">
            <span className="text-3xl">😵</span>
            <p className="text-sm font-bold text-red-200">{error}</p>
            <Button onClick={refresh} variant="outline" className="min-h-11 gap-2 border-red-500/40 bg-red-500/10 text-red-200 hover:bg-red-500/20">
              <RefreshCw className="h-4 w-4" />
              حاول تاني
            </Button>
          </CardContent>
        </Card>
      )}

      {state && (
        <>
          {/* 1) سؤال اليوم */}
          <HeroSection state={state} studentId={studentId} onResult={refresh} onNavigate={onNavigate} />

          {/* 2) صندوق الكنز */}
          <MysteryBoxCard studentId={studentId} state={state} refresh={refresh} />

          {/* 3) حائط الشارات */}
          <BadgeWall badges={Array.isArray(state.badges) ? state.badges : []} progress={state.badgeProgress || {}} />

          {/* 4) ضاعف نقاطك (ت7) */}
          <BetSection studentId={studentId} grade={grade} onChanged={function () { refresh(); try { window.dispatchEvent(new Event('gamify-state-updated')) } catch (e) {} }} />

          {/* 5) لوحات الترتيب */}
          <LeaderboardsSection />
        </>
      )}
    </div>
  )
}

/* ============================================================
 * 1) سؤال اليوم — الهيرو
 * ============================================================ */

function HeroSection({ state, studentId, onResult, onNavigate }: {
  state: GamifyState
  studentId: string
  onResult: () => void
  onNavigate?: (tab: string) => void
}) {
  const series = state.series

  /* مفيش سلسلة شغالة أصلًا */
  if (!series) {
    return (
      <Card className="items-center gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-8 text-center text-zinc-100">
        <CardContent className="flex flex-col items-center gap-3 px-4">
          <motion.span
            className="text-5xl"
            animate={{ rotate: [0, 8, -8, 0] }}
            transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
          >
            🛌
          </motion.span>
          <p className="text-base font-extrabold text-zinc-200">مفيش تحدي شغال دلوقتي</p>
          <p className="text-xs text-zinc-400">استعد للتحدي الجاي — أول ما مستر شريف يفتحه هتلاقيه هنا فورًا 💪</p>
          {onNavigate && (
            <Button
              onClick={() => onNavigate('videos')}
              variant="outline"
              className="min-h-11 gap-2 border-amber-500/40 bg-amber-500/10 text-amber-300 hover:bg-amber-500/20"
            >
              <Sparkles className="h-4 w-4" />
              راجع الدروس في الوقت الفاضي
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  /* السلسلة لسه فاضية — اليوم 0 */
  if (state.unlockedDay === 0) {
    return (
      <Card className="items-center gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-8 text-center text-zinc-100">
        <CardContent className="flex flex-col items-center gap-3 px-4">
          <span className="text-5xl">🗓️</span>
          <p className="text-base font-extrabold text-zinc-200">السلسلة لسه فاضية</p>
          {state.nextDayDate ? (
            <p className="text-xs text-amber-300 font-bold">التحدي هيبدأ يوم {fmtArabicDate(state.nextDayDate)} — جهّز نفسك! ⚡</p>
          ) : (
            <p className="text-xs text-zinc-400">{series.title} — أول يوم هيتفتح قريب جدًا. جهّز نفسك! ⚡</p>
          )}
        </CardContent>
      </Card>
    )
  }

  /* خلص السلسلة كلها — احتفال */
  if (state.todayTotal === 0) {
    return (
      <Card className="relative items-center gap-3 overflow-hidden rounded-2xl border-amber-400/50 bg-gradient-to-br from-amber-950/60 via-zinc-900 to-zinc-900 py-8 text-center text-zinc-100 shadow-[0_0_40px_rgba(245,158,11,0.25)]">
        <CardContent className="flex flex-col items-center gap-3 px-4">
          <motion.span
            className="text-6xl"
            animate={{ scale: [1, 1.15, 1], rotate: [0, -6, 6, 0] }}
            transition={{ repeat: Infinity, duration: 2.2, ease: 'easeInOut' }}
          >
            🏆
          </motion.span>
          <p className="text-lg font-extrabold text-amber-300">خلصت السلسلة كلها!</p>
          <p className="text-xs text-zinc-300">{series.title} — استنى الجايزة الكبرى من مستر شريف 🎁</p>
        </CardContent>
      </Card>
    )
  }

  /* اليوم المفتوح — أسئلة النهاردة */
  const pct = state.todayTotal > 0 ? Math.round((state.todayAnsweredCount / state.todayTotal) * 100) : 0
  const questions = Array.isArray(state.dayQuestions) ? state.dayQuestions : []
  /* (ت1) تاريخ اليوم المفتوح من جدولة المستر اليدوية */
  const openDayDate = String((series.dayDates || {})[String(state.unlockedDay)] || '')

  return (
    <Card className="gap-3 rounded-2xl border-amber-500/25 bg-gradient-to-br from-amber-950/40 via-zinc-900/60 to-zinc-900/80 py-4 text-zinc-100 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
      <CardHeader className="gap-2 px-4 pb-0">
        <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-base font-extrabold text-amber-200">
          <span className="flex flex-wrap items-center gap-2">
            <Zap className="h-5 w-5 text-amber-400" />
            سؤال اليوم — اليوم {state.unlockedDay} من {series.totalDays}
            {openDayDate ? (
              <Badge className="border-sky-500/40 bg-sky-500/15 text-[10px] font-bold text-sky-300">📅 {fmtArabicDate(openDayDate)}</Badge>
            ) : null}
          </span>
          <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">🔥 ستريك {Number(state.profile.streak) || 0}</Badge>
        </CardTitle>
        <div className="space-y-1.5">
          <Progress
            value={pct}
            className="h-2.5 bg-zinc-800 [&_[data-slot=progress-indicator]]:bg-gradient-to-l [&_[data-slot=progress-indicator]]:from-amber-400 [&_[data-slot=progress-indicator]]:to-emerald-400"
          />
          <p className="text-xs text-zinc-400">
            حلّيت <span className="font-bold text-amber-300">{state.todayAnsweredCount}</span> من{' '}
            <span className="font-bold text-zinc-200">{state.todayTotal}</span> سؤال النهاردة
            {state.todayAnsweredCount >= state.todayTotal && <span> — يوم مكتمل! 🎉</span>}
          </p>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {questions.map(function (q, i) {
          return (
            <QuestionCard
              key={q.id}
              q={q}
              index={i}
              total={questions.length}
              seriesId={series.id}
              studentId={studentId}
              onResult={onResult}
            />
          )
        })}
      </CardContent>
    </Card>
  )
}

/* بطاقة سؤال واحد — الاختيارات أو الإجابة النصية + النتيجة الفورية */

function QuestionCard({ q, index, total, seriesId, studentId, onResult }: {
  q: GamifyQuestion
  index: number
  total: number
  seriesId: string
  studentId: string
  onResult: () => void
}) {
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [result, setResult] = useState<{ correct: boolean; xpEarned: number; message: string } | null>(null)
  const [answeredOk, setAnsweredOk] = useState(false)
  const [okChoice, setOkChoice] = useState<number | null>(null)
  const [textAnswer, setTextAnswer] = useState('')

  const disabled = q.alreadyRewarded || answeredOk
  const isMcq = Array.isArray(q.options) && q.options.length > 0
  const diff = difficultyInfo(q.difficulty)

  async function submit(payload: { choiceIndex?: number; answerText?: string }, busyId: string) {
    if (disabled || busyKey) return
    setBusyKey(busyId)
    try {
      const res = await fetch('/api/gamify/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, seriesId, questionId: q.id, ...payload }),
      })
      const data = await res.json()
      if (!res.ok || (data && data.error)) throw new Error(String((data && data.error) || 'خطأ في تسجيل الإجابة'))
      const correct = !!data.correct
      const xpEarned = Number(data.xpEarned) || 0
      const message = String(data.message || '')
      setResult({ correct, xpEarned, message })
      if (correct) {
        setAnsweredOk(true)
        if (typeof payload.choiceIndex === 'number') setOkChoice(payload.choiceIndex)
        toast.success(message || 'إجابة صح! 🎉', { description: '+' + xpEarned + ' XP' })
        onResult()
      } else if (data.alreadyRewarded) {
        /* السيرفر متأكد إنه اتكافأ قبل كده — قفل السؤال */
        setAnsweredOk(true)
        if (typeof payload.choiceIndex === 'number') setOkChoice(payload.choiceIndex)
        toast.success('اتكافأت على السؤال ده قبل كده ✅')
        onResult()
      } else {
        toast.error(message || 'إجابة غلط — جرب تاني 💪')
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطأ في تسجيل الإجابة')
    } finally {
      setBusyKey(null)
    }
  }

  return (
    <div className="rounded-xl border border-zinc-700/70 bg-zinc-900/70 p-3 sm:p-4">
      {/* ترويسة السؤال — الرقم + الصعوبة + XP */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-500/20 text-xs font-extrabold text-amber-300">
            {index + 1}
          </span>
          <span className="text-[10px] text-zinc-500">سؤال {index + 1} من {total}</span>
          <Badge variant="outline" className={cn('border text-[10px]', diff.cls)}>{diff.label}</Badge>
        </div>
        <Badge className="border-amber-500/40 bg-amber-500/15 text-amber-300">+{q.xpReward} XP</Badge>
      </div>

      {/* نص السؤال — whitespace-pre-wrap زي ما المستر كتبه */}
      <p className="mb-3 whitespace-pre-wrap text-sm font-bold leading-relaxed text-zinc-100 sm:text-base">{q.text}</p>

      {/* اتكافأ قبل ما نعرض أي حاجة */}
      {q.alreadyRewarded && !result && (
        <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/15 px-4 py-3 text-sm font-bold text-emerald-200">
          ✅ اتكافأت على السؤال ده — XP: {q.xpReward}
        </div>
      )}

      {/* اختيارات كبيرة — لمسة مريحة (A=أ,B=ب,C=ج,D=د) */}
      {isMcq && (
        <div className="grid gap-2 sm:grid-cols-2">
          {q.options.map(function (opt, i) {
            const ok = answeredOk && okChoice === i
            return (
              <button
                key={i}
                onClick={() => submit({ choiceIndex: i }, 'c' + i)}
                disabled={disabled || !!busyKey}
                className={cn(
                  'flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-right text-sm transition-all',
                  ok
                    ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                    : 'border-zinc-700 bg-zinc-800/60 text-zinc-100 hover:border-amber-400/70 hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50',
                )}
              >
                <span
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-sm font-extrabold',
                    ok ? 'border-emerald-300 bg-emerald-400 text-zinc-950' : 'border-amber-500/40 bg-amber-500/10 text-amber-300',
                  )}
                >
                  {CHOICE_LETTERS[i] || String(i + 1)}
                </span>
                <span className="min-w-0 flex-1 break-words">{opt}</span>
                {busyKey === 'c' + i && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-300" />}
              </button>
            )
          })}
        </div>
      )}

      {/* سؤال إجابة نصية — Input + زرار إرسال */}
      {!isMcq && (
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            value={textAnswer}
            onChange={(e) => setTextAnswer(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submit({ answerText: textAnswer }, 'text') }}
            disabled={disabled || !!busyKey}
            placeholder="اكتب إجابتك هنا…"
            className="min-h-12 flex-1 rounded-xl border-zinc-700 bg-zinc-800/60 text-zinc-100 placeholder:text-zinc-500 focus-visible:ring-amber-400/40"
          />
          <Button
            onClick={() => submit({ answerText: textAnswer }, 'text')}
            disabled={disabled || !!busyKey || !textAnswer.trim()}
            className="min-h-12 gap-2 border-0 bg-gradient-to-l from-amber-500 to-orange-500 font-bold text-zinc-950 shadow-[0_0_16px_rgba(245,158,11,0.25)] hover:from-amber-400 hover:to-orange-400"
          >
            {busyKey === 'text' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            إرسال الإجابة
          </Button>
        </div>
      )}

      {/* النتيجة الفورية — زمردي للصح / برتقالي للغلط */}
      <AnimatePresence>
        {result && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              'mt-3 rounded-xl border px-4 py-3 text-sm font-bold leading-relaxed',
              result.correct
                ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-200'
                : 'border-orange-500/50 bg-orange-500/15 text-orange-200',
            )}
          >
            {result.correct
              ? '🎉 ' + result.message + (result.xpEarned > 0 ? ' — +' + result.xpEarned + ' XP' : '')
              : '💪 ' + result.message}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

/* ============================================================
 * 2) صندوق الكنز
 * ============================================================ */

interface BoxReward {
  type: string
  value: number
  label: string
  rarity: string
}

function MysteryBoxCard({ studentId, state, refresh }: {
  studentId: string
  state: GamifyState
  refresh: () => void
}) {
  const [phase, setPhase] = useState<'idle' | 'opening' | 'revealed'>('idle')
  const [reward, setReward] = useState<BoxReward | null>(null)
  const [bursting, setBursting] = useState(false)
  const [cooldownMs, setCooldownMs] = useState(Number(state.boxCooldownMs) || 0)
  const refreshedAfterCooldown = useRef(false)
  /* مزامنة الكولداون مع السيرفر — نمط "ضبط الحالة أثناء الرندر" الرسمي
     (بدل useEffect + setState المولّد للـ cascading renders) */
  const [lastSyncKey, setLastSyncKey] = useState('')
  const syncKey = String(state.boxCooldownMs) + '|' + String(state.boxReady)
  if (lastSyncKey !== syncKey) {
    setLastSyncKey(syncKey)
    setCooldownMs(Number(state.boxCooldownMs) || 0)
    if (state.boxReady) {
      setPhase('idle')
      setReward(null)
    }
  }
  /* إعادة تعيين علامة الريفريش بعد الكولداون — في effect عشان الـ refs ممنوعة أثناء الرندر */
  useEffect(function () {
    if (state.boxReady) refreshedAfterCooldown.current = false
  }, [state.boxReady])

  /* العدّاد التنازلي — كل ثانية */
  useEffect(function () {
    if (state.boxReady) return
    const timer = setInterval(function () {
      setCooldownMs(function (ms) { return Math.max(0, ms - 1000) })
    }, 1000)
    return function () { clearInterval(timer) }
  }, [state.boxReady])

  /* الكولداون خلص → ريفريش (مرة واحدة) */
  useEffect(function () {
    if (!state.boxReady && cooldownMs <= 0 && !refreshedAfterCooldown.current) {
      refreshedAfterCooldown.current = true
      refresh()
      try { window.dispatchEvent(new Event('gamify-state-updated')) } catch (e) {}
    }
  }, [cooldownMs, state.boxReady, refresh])

  async function openBox() {
    if (!state.boxReady || phase === 'opening') return
    setPhase('opening')
    setBursting(true)
    try {
      const res = await fetch('/api/gamify/box', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId }),
      })
      const data = await res.json()
      if (res.status === 429 && data && data.error === 'cooldown') {
        setCooldownMs(Number(data.remainingMs) || 0)
        toast.error('الصندوق لسه ما رجعش — استنى شوية ⏳')
        setPhase('idle')
        setBursting(false)
        return
      }
      if (!res.ok || !(data && data.ok)) throw new Error(String((data && data.error) || 'خطأ في فتح الصندوق'))
      const r = data.reward as BoxReward
      /* لحظة التفتيح — انفجار قصير ثم الكشف */
      setTimeout(function () {
        setBursting(false)
        setReward(r)
        setPhase('revealed')
        toast.success(String(r.label || 'جايزة!') + ' 🎉')
        refresh()
      try { window.dispatchEvent(new Event('gamify-state-updated')) } catch (e) {}
      }, 900)
    } catch (e) {
      setPhase('idle')
      setBursting(false)
      toast.error(e instanceof Error ? e.message : 'خطأ في فتح الصندوق')
    }
  }

  const ready = state.boxReady && phase !== 'opening'

  return (
    <Card className="gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-4 text-zinc-100">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-amber-200">
          <Gift className="h-5 w-5 text-amber-400" />
          صندوق الكنز
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col items-center gap-3 px-4">
        {/* الصندوق نفسه — تعويم/هز idle + انفجار عند التفتيح */}
        <motion.button
          onClick={openBox}
          disabled={!state.boxReady || phase === 'opening'}
          title={state.boxReady ? 'افتح الصندوق! 🎁' : 'الصندوق بيرجع بعد 24 ساعة'}
          animate={
            bursting
              ? { scale: [1, 1.3, 1.1, 1.35, 1], rotate: [0, -10, 10, -8, 8, 0] }
              : ready
                ? { y: [0, -7, 0], rotate: [-2, 2, -2] }
                : { y: 0, rotate: 0 }
          }
          transition={bursting ? { duration: 0.9, ease: 'easeInOut' } : { repeat: Infinity, duration: 2.6, ease: 'easeInOut' }}
          className={cn(
            'relative flex h-36 w-36 items-center justify-center rounded-3xl border-2 transition-colors sm:h-44 sm:w-44',
            state.boxReady
              ? 'border-amber-400/60 bg-gradient-to-b from-amber-500/20 to-orange-600/10 shadow-[0_0_40px_rgba(245,158,11,0.45)] hover:border-amber-300'
              : 'border-zinc-700 bg-zinc-800/50',
          )}
        >
          <span className={cn('text-6xl sm:text-7xl', state.boxReady ? 'drop-shadow-[0_0_18px_rgba(245,158,11,0.6)]' : 'opacity-50 grayscale')}>
            🎁
          </span>
          {phase === 'opening' && <Loader2 className="absolute h-6 w-6 animate-spin text-amber-300" />}
        </motion.button>

        {/* الحالة تحت الصندوق */}
        {state.boxReady && phase !== 'revealed' && (
          <p className="text-sm font-extrabold text-amber-300">{phase === 'opening' ? 'بيفتح… 🤲' : 'الصندوق جاهز! دوس عليه 🎉'}</p>
        )}
        {!state.boxReady && (
          <p className="text-sm font-bold text-zinc-400">
            الصندوق بيرجع بعد <span className="font-extrabold tabular-nums text-amber-300">{fmtCountdown(cooldownMs)}</span> ⏳
          </p>
        )}

        {/* كشف الجايزة — تلوين بالندرة */}
        <AnimatePresence>
          {phase === 'revealed' && reward && (
            <motion.div
              initial={{ opacity: 0, scale: 0.6, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={cn(
                'flex w-full max-w-xs flex-col items-center gap-1.5 rounded-2xl border px-5 py-4 text-center',
                rewardClasses(reward),
              )}
            >
              <span className="text-4xl">{reward.type === 'shield' ? '🛡️' : reward.type === 'cosmetic' ? '💎' : '⚡'}</span>
              <span className="text-base font-extrabold">{reward.label}</span>
              {reward.rarity === 'rare' && <span className="text-xs font-bold text-amber-300">نادرة! ✨</span>}
              {reward.rarity === 'legendary' && <span className="text-xs font-bold text-amber-300">أسطورية!! 👑</span>}
            </motion.div>
          )}
        </AnimatePresence>

        <p className="text-center text-xs leading-relaxed text-zinc-400">
          فيه جوايز XP… وأندر جايزة هي 60 XP 💎 — بس دي مش هتيجي بسهولة!
        </p>
        <p className="text-center text-[11px] text-zinc-500">كل 24 ساعة فرصة جديدة</p>
      </CardContent>
    </Card>
  )
}

function rewardClasses(r: BoxReward): string {
  if (r.type === 'shield') return 'border-violet-500/60 bg-violet-500/15 text-violet-200 shadow-[0_0_24px_rgba(139,92,246,0.3)]'
  if (r.rarity === 'legendary') return 'border-amber-400/70 bg-amber-500/20 text-amber-200 shadow-[0_0_28px_rgba(245,158,11,0.5)]'
  if (r.rarity === 'rare') return 'border-amber-400/60 bg-amber-500/15 text-amber-200 shadow-[0_0_24px_rgba(245,158,11,0.4)]'
  if (r.rarity === 'uncommon') return 'border-emerald-500/60 bg-emerald-500/15 text-emerald-200'
  return 'border-zinc-600 bg-zinc-800/80 text-zinc-200'
}

/* ============================================================
 * 3) حائط الشارات
 * ============================================================ */

/* (ت3) أسماء الشروط بالعربي — زي ما الطالب يفهم "إيه اللي مطلوب مني بالظبط" */
const STUDENT_COND_LABELS: Record<string, string> = {
  streak_days: 'أيام ستريك متتالية',
  accuracy: 'دقة التحدي %',
  homework_speed: 'تسليم واجب بدرجة 70%+ خلال أول 24 ساعة',
  xp_total: 'مجموع XP',
  challenge_days: 'أيام تحدي مكتملة',
}

function BadgeWall({ badges, progress }: { badges: GamifyState['badges']; progress: Record<string, number> }) {
  return (
    <Card className="gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-4 text-zinc-100">
      <CardHeader className="flex-row items-center justify-between px-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-amber-200">
          <Medal className="h-5 w-5 text-amber-400" />
          الشارات
        </CardTitle>
        <Badge className="border-emerald-500/40 bg-emerald-500/15 text-emerald-300">
          {badges.filter(function (b) { return b.unlocked }).length} / {badges.length}
        </Badge>
      </CardHeader>
      <CardContent className="px-4">
        {badges.length === 0 ? (
          <p className="py-3 text-center text-xs text-zinc-500">لسه مفيش شارات — حل سؤال اليوم وابدأ جمعها! 🏅</p>
        ) : (
          <div className="grid grid-cols-2 gap-2.5 md:grid-cols-4">
            {badges.map(function (b) {
              const unlocked = b.unlocked
              return (
                <div
                  key={b.id}
                  className={cn(
                    'relative rounded-xl border p-3 text-center transition-all',
                    unlocked
                      ? b.rarity === 'legendary'
                        ? 'border-amber-400/60 bg-amber-500/10 shadow-[0_0_24px_rgba(245,158,11,0.35)]'
                        : b.rarity === 'rare'
                          ? 'border-violet-500/60 bg-violet-500/10 shadow-[0_0_16px_rgba(139,92,246,0.25)]'
                          : 'border-slate-500/50 bg-slate-500/10'
                      : 'border-zinc-800 bg-zinc-900/60 opacity-60 grayscale',
                  )}
                >
                  {!unlocked && <Lock className="absolute right-2 top-2 h-3.5 w-3.5 text-zinc-500" />}
                  {unlocked && b.rarity === 'legendary' && (
                    <span className="absolute left-1.5 top-1.5 text-[9px] font-extrabold text-amber-400">⭐ أسطورية</span>
                  )}
                  <div className="text-3xl leading-none">{b.icon || '🏅'}</div>
                  <div className="mt-1.5 text-sm font-bold text-zinc-100">{b.name}</div>
                  <div className="mt-1 flex justify-center">
                    <span className={cn('rounded-full border px-2 py-0.5 text-[9px] font-bold', rarityChip(b.rarity, unlocked))}>
                      {rarityLabel(b.rarity)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-400">{unlocked ? b.desc : 'هدف: ' + b.desc}</p>
                  {/* (ت3) شرط الفتح الواضح + تقدم الطالب الحي */}
                  {unlocked ? (
                    <p className="mt-1 text-[10px] font-bold text-emerald-400">✅ خلّصت الشرط — مبروك!</p>
                  ) : b.conditionType === 'homework_speed' ? (
                    <p className="mt-1 text-[10px] font-bold text-amber-300/90">⚡ الشرط: {STUDENT_COND_LABELS.homework_speed}</p>
                  ) : (
                    <div className="mt-1.5 space-y-1">
                      <p className="text-[10px] font-bold text-amber-300/90">
                        الشرط: {STUDENT_COND_LABELS[b.conditionType] || b.conditionType} {b.threshold} — عندك {Number(progress[b.conditionType] || 0)}
                      </p>
                      <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                        <div
                          className="h-full rounded-full bg-gradient-to-l from-amber-400 to-emerald-400 transition-all"
                          style={{ width: Math.min(100, Math.round(((Number(progress[b.conditionType] || 0) / Math.max(1, b.threshold || 1)) * 100))) + '%' }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function rarityLabel(r: string): string {
  if (r === 'legendary') return 'أسطورية'
  if (r === 'rare') return 'نادرة'
  if (r === 'uncommon') return 'غير شائعة'
  if (r === 'common') return 'عادية'
  return r
}

function rarityChip(r: string, unlocked: boolean): string {
  if (!unlocked) return 'border-zinc-700 bg-zinc-800 text-zinc-500'
  if (r === 'legendary') return 'border-amber-500/50 bg-amber-500/20 text-amber-300'
  if (r === 'rare') return 'border-violet-500/50 bg-violet-500/20 text-violet-300'
  return 'border-slate-500/50 bg-slate-500/20 text-slate-300'
}

/* ============================================================
 * 4) ضاعف نقاطك (كان «توقع واربح XP» — اتغير بطلب المستر في ت7)
 * ============================================================ */

interface BetRow {
  id: string
  examTitle: string
  stake: number
  prediction: number
  totalQuestions: number
  status: string
  payout: number
  actual: number
  createdAt: string
  /* (ج2) نوع الهدف — امتحان أو واجب */
  targetType?: string
}

interface AvailableExam {
  id: string
  title: string
  totalQuestions: number
  /* (ج2) التوقع على الواجبات والامتحانات — الاثنين مع بعض */
  type?: 'exam' | 'homework'
}

function BetSection({ studentId, grade, onChanged }: {
  studentId: string
  grade: string
  onChanged: () => void
}) {
  const [bets, setBets] = useState<BetRow[]>([])
  const [available, setAvailable] = useState<AvailableExam[]>([])
  const [xp, setXp] = useState(0)
  const [loading, setLoading] = useState(true)
  const [stakes, setStakes] = useState<Record<string, number>>({})
  const [preds, setPreds] = useState<Record<string, string | null>>({})
  const [placing, setPlacing] = useState<string | null>(null)

  const load = useCallback(async function () {
    try {
      const res = await fetch('/api/gamify/bet?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
      const data = await res.json()
      setBets(Array.isArray(data && data.bets) ? data.bets : [])
      setAvailable(Array.isArray(data && data.available) ? data.available : [])
      setXp(Number(data && data.xp) || 0)
    } catch (e) {
      /* صامت — القسم بيرندر فاضي بشكل لطيف */
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(function () {
    if (!studentId) return
    /* تأجيل أول تحميل — setState المتزامن جوه الـ effect بيولّد cascading renders */
    const kick = setTimeout(function () { load() }, 0)
    return function () { clearTimeout(kick) }
  }, [studentId, load])

  async function placeBet(exam: AvailableExam) {
    const stake = safeStake(stakes[exam.id], xp)
    const predRaw = preds[exam.id]
    if (predRaw == null) { toast.error('اختار توقعك الأول — توقع عدد إجاباتك الصحيحة 🎯'); return }
    setPlacing(exam.id)
    try {
      const res = await fetch('/api/gamify/bet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, grade, targetId: exam.id, targetType: exam.type || 'exam', stake, prediction: Number(predRaw) }),
      })
      const data = await res.json()
      if (!res.ok || !(data && data.ok)) throw new Error(String((data && data.error) || 'خطأ في تسجيل التوقع'))
      toast.success('ثبّت توقعك ' + stake + ' XP على «' + exam.title + '» — بالتوفيق! 🍀')
      load()
      onChanged()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'خطأ في تسجيل التوقع')
    } finally {
      setPlacing(null)
    }
  }

  return (
    <Card className="gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-4 text-zinc-100">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-amber-200">
          <Target className="h-5 w-5 text-amber-400" />
          {/* (ت7) الاسم بقى «ضاعف نقاطك» بطلب المستر — «توقع واربح» ما عجبوش — وجنبه بخط صغير no risk, no fun. */}
          <span>ضاعف نقاطك</span>
          <span dir="ltr" className="text-[10px] font-medium text-zinc-500">no risk, no fun.</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 px-4">
        {/* قواعد تحدي التوقع */}
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200/90">
          توقع نتيجة واجباتك وامتحاناتك 📚📝 — توقع تام = ضعف النقاط ×2 • فارق سؤال واحد = رجوع نقاطك • توقع بعيد = نقاط المشاركة بتحرق 🔥
        </div>

        {/* المتاح للتوقع — واجبات وامتحانات (الاثنين مع بعض بطلب المستر) */}
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-24 w-full rounded-xl bg-zinc-800" />
            <Skeleton className="h-24 w-full rounded-xl bg-zinc-800" />
          </div>
        ) : available.length === 0 ? (
          <p className="py-2 text-center text-xs text-zinc-500">مفيش واجبات أو امتحانات متاحة للتوقع دلوقتي — أول ما المستر ينزل حاجة هتلاقيها هنا 👀</p>
        ) : (
          <div className="space-y-3">
            {/* (ج2) مجموعتين واضحتين: واجبات 📚 وامتحانات 📝 — سهلة الفهم */}
            {(['exam', 'homework'] as const).map(function (groupType) {
              const group = available.filter(function (a) { return (a.type || 'exam') === groupType })
              if (group.length === 0) return null
              return (
                <div key={groupType} className="space-y-2">
                  <p className="text-[11px] font-extrabold text-zinc-400">
                    {groupType === 'exam' ? '📝 امتحانات' : '📚 واجبات'}
                    <span className="text-zinc-600"> ({group.length})</span>
                  </p>
                  {group.map(function (ex) { return (
                    <BetTargetCard key={ex.id} ex={ex} xp={xp} placing={placing} stakes={stakes} preds={preds}
                      setStakes={setStakes} setPreds={setPreds} placeBet={placeBet} />
                  )})}
                </div>
              )
            })}
          </div>
        )}
        {/* توقعاتي */}
        <div className="space-y-2">
          <h3 className="text-sm font-extrabold text-zinc-200">توقعاتي</h3>
          {bets.length === 0 ? (
            <p className="text-xs text-zinc-500">لسه مفيش توقعات — جرّب أول توقع من فوق 👆</p>
          ) : (
            bets.map(function (b) {
              return (
                <div key={b.id} className="flex items-center justify-between gap-2 rounded-xl border border-zinc-800 bg-zinc-900/60 px-3 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-xs font-bold text-zinc-100 sm:text-sm">{String(b.targetType || 'exam') === 'homework' ? '📚 ' : '📝 '}{b.examTitle}</div>
                    <div className="text-[11px] text-zinc-400">
                      شاركت بـ {b.stake} XP • توقعت {b.prediction} من {b.totalQuestions}
                    </div>
                  </div>
                  <BetStatusChip b={b} />
                </div>
              )
            })
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* كارت هدف التوقع (امتحان أو واجب) — نفس الشكل للاتنين عشان يكون سهل ومألوف */
function BetTargetCard({ ex, xp, placing, stakes, preds, setStakes, setPreds, placeBet }: {
  ex: AvailableExam
  xp: number
  placing: string | null
  stakes: Record<string, number>
  preds: Record<string, string | null>
  setStakes: Dispatch<SetStateAction<Record<string, number>>>
  setPreds: Dispatch<SetStateAction<Record<string, string | null>>>
  placeBet: (ex: AvailableExam) => void
}) {
  const maxStake = Math.max(10, Math.min(xp, 500))
  const stake = safeStake(stakes[ex.id], xp)
  const pred = preds[ex.id] == null ? '' : String(preds[ex.id])
  const canBet = xp >= 10
  return (
    <div className="space-y-3 rounded-xl border border-zinc-700/70 bg-zinc-900/60 p-3">
      <div className="min-w-0">
        <div className="truncate text-sm font-bold text-zinc-100">{ex.type === 'homework' ? '📚 ' : '📝 '}{ex.title}</div>
        <div className="text-[11px] text-zinc-400">عدد الأسئلة: {ex.totalQuestions}</div>
      </div>

      {/* سلايدر نقاط المشاركة */}
      <div>
        <div className="mb-1.5 flex items-center justify-between text-xs text-zinc-300">
          <span>قيمة المشاركة</span>
          <span className="font-extrabold text-amber-300">{stake} XP</span>
        </div>
        <Slider
          min={10}
          max={maxStake}
          step={5}
          value={[stake]}
          onValueChange={function (v) {
            const val = Array.isArray(v) ? Number(v[0]) : 10
            setStakes(function (prev) { return { ...prev, [ex.id]: isNaN(val) ? 10 : val } })
          }}
          disabled={!canBet || placing === ex.id}
        />
        <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
          <span>10 XP</span>
          <span>{maxStake} XP</span>
        </div>
      </div>

      {/* توقع النتيجة */}
      <Select
        value={pred}
        onValueChange={function (v) {
          setPreds(function (prev) { return { ...prev, [ex.id]: v } })
        }}
        disabled={!canBet || placing === ex.id}
      >
        <SelectTrigger className="min-h-12 w-full rounded-xl border-zinc-700 bg-zinc-800/60 text-zinc-100">
          <SelectValue placeholder="توقع عدد إجاباتك الصحيحة" />
        </SelectTrigger>
        <SelectContent className="max-h-60 border-zinc-700 bg-zinc-900 text-zinc-100">
          {Array.from({ length: ex.totalQuestions + 1 }, function (_, i) {
            return (
              <SelectItem key={i} value={String(i)}>
                {i}{i === ex.totalQuestions ? ' — كلهم! 🔥' : ''}
              </SelectItem>
            )
          })}
        </SelectContent>
      </Select>

      <Button
        onClick={() => placeBet(ex)}
        disabled={!canBet || placing === ex.id || pred === ''}
        className="min-h-12 w-full gap-2 border-0 bg-gradient-to-l from-amber-500 to-orange-500 font-bold text-zinc-950 shadow-[0_0_16px_rgba(245,158,11,0.25)] hover:from-amber-400 hover:to-orange-400"
      >
        {placing === ex.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
        ثبّت توقعك {stake} XP
      </Button>
      {!canBet && (
        <p className="text-[11px] text-orange-300">محتاج 10 XP على الأقل عشان تشارك في التحدي — حل سؤال النهاردة الأول ⚡</p>
      )}
    </div>
  )
}

function safeStake(raw: number | undefined, xp: number): number {
  const maxStake = Math.max(10, Math.min(xp, 500))
  const base = Number(raw) || 10
  return Math.min(Math.max(10, base), maxStake)
}

function BetStatusChip({ b }: { b: BetRow }) {
  if (b.status === 'won') return <Badge className="shrink-0 border-emerald-500/50 bg-emerald-500/15 text-emerald-300">كسب {b.payout} XP ✅</Badge>
  if (b.status === 'lost') return <Badge className="shrink-0 border-red-500/50 bg-red-500/15 text-red-300">التوقع اتلقى بعيد 🔥</Badge>
  if (b.status === 'push') return <Badge className="shrink-0 border-zinc-500/50 bg-zinc-500/15 text-zinc-300">رجعت نقاطك ↩️</Badge>
  return (
    <Badge className="shrink-0 border-amber-500/50 bg-amber-500/15 text-amber-300">
      <Clock className="h-3 w-3" />
      شغال
    </Badge>
  )
}

/* ============================================================
 * 5) لوحات الترتيب المزدوجة
 * ============================================================ */

interface LbAcademicRow { rank: number; name: string; grade: string; points: number }
interface LbXpRow { rank: number; name: string; grade: string; xp: number; streak: number; bestStreak: number }

const RANK_MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' }

function LeaderboardsSection() {
  const [data, setData] = useState<{ academic: LbAcademicRow[]; xp: LbXpRow[] } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(function () {
    let alive = true
    ;(async function () {
      try {
        const res = await fetch('/api/gamify/leaderboards?limit=10', { cache: 'no-store' })
        const j = await res.json()
        if (alive) setData({
          academic: Array.isArray(j && j.academic) ? j.academic : [],
          xp: Array.isArray(j && j.xp) ? j.xp : [],
        })
      } catch (e) {
        if (alive) setData({ academic: [], xp: [] })
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return function () { alive = false }
  }, [])

  return (
    <Card className="gap-3 rounded-2xl border-zinc-800 bg-gradient-to-br from-zinc-900 via-zinc-900/95 to-zinc-900 py-4 text-zinc-100">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="flex items-center gap-2 text-base font-extrabold text-amber-200">
          <Trophy className="h-5 w-5 text-amber-400" />
          لوحات الترتيب
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        {loading ? (
          <Skeleton className="h-48 w-full rounded-xl bg-zinc-800" />
        ) : (
          <Tabs defaultValue="academic">
            <TabsList className="grid h-11 w-full grid-cols-2 rounded-xl border border-zinc-800 bg-zinc-900">
              <TabsTrigger
                value="academic"
                className="data-[state=active]:border-amber-500/40 data-[state=active]:bg-amber-500/15 data-[state=active]:text-amber-300 dark:data-[state=active]:text-amber-300"
              >
                النقاط الدراسية 📚
              </TabsTrigger>
              <TabsTrigger
                value="xp"
                className="data-[state=active]:border-emerald-500/40 data-[state=active]:bg-emerald-500/15 data-[state=active]:text-emerald-300 dark:data-[state=active]:text-emerald-300"
              >
                XP التحدي ⚡
              </TabsTrigger>
            </TabsList>

            {/* لوحة النقاط الدراسية */}
            <TabsContent value="academic" className="mt-3">
              <div className="overflow-hidden rounded-xl border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="w-12 text-right text-zinc-400">#</TableHead>
                      <TableHead className="text-right text-zinc-400">الاسم</TableHead>
                      <TableHead className="text-right text-zinc-400">الصف</TableHead>
                      <TableHead className="text-right text-zinc-400">النقاط</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data && data.academic.length > 0 ? (
                      data.academic.map(function (r) {
                        return (
                          <TableRow
                            key={r.rank + '-' + r.name}
                            className={cn('border-zinc-800 hover:bg-zinc-800/50', r.rank === 1 ? 'bg-amber-500/15' : r.rank === 2 ? 'bg-amber-500/10' : r.rank === 3 ? 'bg-amber-500/5' : '')}
                          >
                            <TableCell className="text-right text-sm">{RANK_MEDALS[r.rank] || r.rank}</TableCell>
                            <TableCell className="text-right text-sm font-bold text-zinc-100">{r.name}</TableCell>
                            <TableCell className="text-right text-xs text-zinc-400">{r.grade}</TableCell>
                            <TableCell className="text-right text-sm font-extrabold text-amber-300">{r.points}</TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableCell colSpan={4} className="py-4 text-center text-xs text-zinc-500">لسه مفيش ترتيب — كن انت الأول! 🚀</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            {/* لوحة XP التحدي — منفصلة تمامًا */}
            <TabsContent value="xp" className="mt-3">
              <div className="overflow-hidden rounded-xl border border-zinc-800">
                <Table>
                  <TableHeader>
                    <TableRow className="border-zinc-800 hover:bg-transparent">
                      <TableHead className="w-12 text-right text-zinc-400">#</TableHead>
                      <TableHead className="text-right text-zinc-400">الاسم</TableHead>
                      <TableHead className="text-right text-zinc-400">الصف</TableHead>
                      <TableHead className="text-right text-zinc-400">XP</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data && data.xp.length > 0 ? (
                      data.xp.map(function (r) {
                        return (
                          <TableRow
                            key={r.rank + '-' + r.name}
                            className={cn('border-zinc-800 hover:bg-zinc-800/50', r.rank === 1 ? 'bg-emerald-500/15' : r.rank === 2 ? 'bg-emerald-500/10' : r.rank === 3 ? 'bg-emerald-500/5' : '')}
                          >
                            <TableCell className="text-right text-sm">{RANK_MEDALS[r.rank] || r.rank}</TableCell>
                            <TableCell className="text-right text-sm font-bold text-zinc-100">{r.name}</TableCell>
                            <TableCell className="text-right text-xs text-zinc-400">{r.grade}</TableCell>
                            <TableCell className="text-right text-sm font-extrabold text-emerald-300">
                              {r.xp}
                              {Number(r.streak) > 0 && <span className="ms-1 text-[10px] text-orange-400">🔥{r.streak}</span>}
                            </TableCell>
                          </TableRow>
                        )
                      })
                    ) : (
                      <TableRow className="border-zinc-800 hover:bg-transparent">
                        <TableCell colSpan={4} className="py-4 text-center text-xs text-zinc-500">لسه مفيش ترتيب — حل سؤال النهاردة واصعد! ⚡</TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
              <p className="mt-2 text-[11px] text-zinc-500">لوحة نقاط التحدي اليومي — منفصلة تمامًا عن درجات الامتحانات</p>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>
    </Card>
  )
}

/* ============================================================
 * أدوات مشتركة
 * ============================================================ */

function StatChip({ icon, label, value, cls }: { icon: ReactNode; label: string; value: number; cls: string }) {
  return (
    <div className={cn('flex flex-col items-center gap-0.5 rounded-xl border px-2 py-2 text-center', cls)}>
      <span className="flex items-center gap-1 text-sm font-extrabold">{icon}{value}</span>
      <span className="text-[10px] opacity-80">{label}</span>
    </div>
  )
}

function difficultyInfo(d: string): { label: string; cls: string } {
  const key = String(d || '').toLowerCase()
  if (key === 'easy') return { label: 'سهل', cls: 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300' }
  if (key === 'hard') return { label: 'صعب', cls: 'border-red-500/40 bg-red-500/15 text-red-300' }
  return { label: 'عادي', cls: 'border-amber-500/40 bg-amber-500/15 text-amber-300' }
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(Number(ms) / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return [h, m, sec].map(function (v) { return String(v).padStart(2, '0') }).join(':')
}

function formatToday(key: string): string {
  const parts = String(key || '').split('-')
  if (parts.length === 3) return parts[2] + '/' + parts[1] + '/' + parts[0]
  return key
}

/* سكيليتون تحميل الغرفة — نفس ارتفاعات الأقسام تقريبًا */
function HubSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-20 w-full rounded-2xl bg-zinc-800/80" />
      <Skeleton className="h-48 w-full rounded-2xl bg-zinc-800/80" />
      <Skeleton className="h-64 w-full rounded-2xl bg-zinc-800/80" />
      <Skeleton className="h-40 w-full rounded-2xl bg-zinc-800/80" />
    </div>
  )
}
