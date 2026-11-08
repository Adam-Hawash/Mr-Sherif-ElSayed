'use client'

// ============================================================
// FILE: src/components/student/gamify/GamifyNavbar.tsx
// PURPOSE: (2026-غ1) شريط التحدي اللاصق — أول حاجة الطالب يشوفها
//   في البورتفوليو (تحت شريط الاسم وفوق التابات):
//   • صف 1: عنوان السلسلة + «اليوم X من N» + شارة الستريك + شارة XP
//     + زرار صندوق الكنز (متوهج لما يبقى جاهز) + CTA «حل سؤال اليوم»
//   • صف 2: نقاط تقدم أيام السلسلة (مكتمل زمردي / الحالي عنبري نابض / مقفول رمادي)
//   • صف 3: تحذير «الوقت بيجري» النابض (بعد 6 مساءً من غير حل)
//   • صف 4: شريط جايزة السلسلة الذهبي
// القواعد: عنبري/ذهبي للـ XP والكنز + زمردي للنجاح + أحمر/برتقالي للتحذير فقط
//   + مفيش أزرق/بنفسجي + لمسات كبيرة على الموبايل
// ============================================================

import { AlertTriangle, ArrowLeft, Check, Flame, Gift, Lock, Sparkles, Zap } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useGamifyState } from './useGamifyState'

interface GamifyNavbarProps {
  studentId: string
  grade: string
  onOpenHub: () => void
}

/* (ت1) تاريخ بالعربي للشريط */
var NAV_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
function fmtNavArabicDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''))
  if (!m) return String(v || '')
  return String(parseInt(m[3], 10)) + ' ' + NAV_MONTHS[parseInt(m[2], 10) - 1]
}

export function GamifyNavbar({ studentId, grade, onOpenHub }: GamifyNavbarProps) {
  const { state, loading } = useGamifyState(studentId, grade)

  const series = state ? state.series : null
  const totalDays = series ? Math.max(1, Number(series.totalDays) || 10) : 0
  const unlockedDay = state ? state.unlockedDay : 0
  const streak = state ? Number(state.profile.streak) || 0 : 0
  const xp = state ? Number(state.profile.xp) || 0 : 0
  const remainingToday = state ? Math.max(0, state.todayTotal - state.todayAnsweredCount) : 0

  return (
    <div className="sticky top-0 z-40 border-b border-amber-500/25 bg-zinc-950/95 text-zinc-100 shadow-[0_8px_28px_rgba(0,0,0,0.45)] backdrop-blur">
      {/* صف 1 — العنوان + الشارات + الصندوق + CTA */}
      <div className="px-3 sm:px-4 py-2 flex items-center gap-2 sm:gap-3">
        {/* عنوان السلسلة + «اليوم X من N» */}
        <button
          onClick={onOpenHub}
          className="min-h-[44px] min-w-0 flex-1 flex items-center gap-2 text-right focus:outline-none sm:min-h-0"
          title={series ? series.title : 'التحدي اليومي'}
        >
          <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
          <span className="min-w-0 flex flex-col items-start">
            <span className="truncate text-xs sm:text-sm font-bold text-amber-200">
              {loading && !state ? 'جاري تحميل التحدي…' : series ? series.title : 'التحدي اليومي'}
            </span>
            {series && (
              <span className="text-[10px] sm:text-xs text-zinc-400">
                اليوم {unlockedDay} من {totalDays}
                {/* (ت1) جدولة المستر: النهاردة مش يوم تحدي — التاريخ الجاي */}
                {state && state.scheduledMode && state.nextDayDate && !state.isScheduledToday
                  ? ' — التحدي بيرجع يوم ' + fmtNavArabicDate(String(state.nextDayDate))
                  : ''}
              </span>
            )}
          </span>
        </button>

        {/* شارة الستريك 🔥 */}
        <div
          className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-emerald-500/15 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold text-emerald-300 shrink-0"
          title={'الستريك: ' + streak + ' يوم — أفضل سلسلة: ' + (state ? state.profile.bestStreak : 0)}
        >
          <Flame className="h-3.5 w-3.5" />
          {streak}
        </div>

        {/* شارة XP */}
        <div
          className="flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/15 px-2 sm:px-2.5 py-1 text-[11px] sm:text-xs font-bold text-amber-300 shrink-0"
          title={'رصيد XP: ' + xp}
        >
          <Zap className="h-3.5 w-3.5" />
          {xp}
        </div>

        {/* صندوق الكنز — متوهج ونابض لما يبقى جاهز، مقفول رمادي في الكولداون */}
        <button
          onClick={onOpenHub}
          title={state && state.boxReady ? 'صندوق الكنز جاهز! افتحه من غرفة التحدي 🎁' : 'الصندوق بيرجع بعد 24 ساعة — افتح غرفة التحدي للمواعيد'}
          className={
            'relative flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border text-lg transition-colors sm:h-9 sm:w-9 ' +
            (state && state.boxReady
              ? 'border-amber-400/70 bg-gradient-to-b from-amber-500/30 to-orange-600/30 shadow-[0_0_16px_rgba(245,158,11,0.55)] animate-pulse hover:from-amber-400/40'
              : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600')
          }
        >
          {state && state.boxReady ? '🎁' : <Lock className="h-4 w-4" />}
        </button>

        {/* CTA — حل سؤال اليوم */}
        <Button
          size="sm"
          onClick={onOpenHub}
          className={
            'shrink-0 gap-1.5 h-11 sm:h-9 px-3 sm:px-4 text-xs sm:text-sm font-bold text-zinc-950 ' +
            'bg-gradient-to-l from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 ' +
            'shadow-[0_0_18px_rgba(245,158,11,0.35)] border-0'
          }
        >
          {remainingToday > 0 ? 'حل سؤال اليوم' : 'غرفة التحدي'}
          <ArrowLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* صف 2 — نقاط تقدم أيام السلسلة */}
      {series && (
        <div className="px-3 sm:px-4 pb-2 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {Array.from({ length: totalDays }, (_, i) => {
            const dayNum = i + 1
            const done = dayNum < unlockedDay
            const current = dayNum === unlockedDay
            /* (ت1) تاريخ اليوم من جدولة المستر لو محدد */
            const dDate = String((series.dayDates || {})[String(dayNum)] || '')
            const title = 'اليوم ' + dayNum + ' من ' + totalDays + (dDate ? ' — ' + fmtNavArabicDate(dDate) : '') + ' — ' + (done ? 'خلصت منه ✅' : current ? 'المفتوح دلوقتي ⚡' : 'لسه مقفول 🔒')
            return (
              <button
                key={dayNum}
                onClick={onOpenHub}
                title={title}
                className={
                  'flex min-w-[32px] h-8 shrink-0 items-center justify-center gap-1 rounded-full border px-2 transition-colors ' +
                  (done
                    ? 'border-emerald-400 bg-emerald-500 text-zinc-950 hover:bg-emerald-400'
                    : current
                      ? 'border-amber-300 bg-amber-400 text-zinc-950 ring-2 ring-amber-400/60 animate-pulse hover:bg-amber-300'
                      : 'border-zinc-700 bg-zinc-900 text-zinc-500 hover:border-zinc-600')
                }
              >
                {done ? (
                  <Check className="h-4 w-4" />
                ) : current ? (
                  <span className="text-[10px] font-bold">اليوم {dayNum}</span>
                ) : (
                  <Lock className="h-3.5 w-3.5" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {/* صف 3 — تحذير الوقت بيجري (نابض) — بس لما لسه فيه أسئلة ما اتحلتش */}
      {state && state.windowUrgent && remainingToday > 0 && (
        <div className="animate-pulse bg-gradient-to-l from-red-600 via-orange-500 to-red-600 px-3 sm:px-4 py-2 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 shrink-0 text-white" />
          <p className="text-[11px] sm:text-xs font-bold text-white leading-snug">
            ⚡ الوقت بيجري! لسه عندك {remainingToday} سؤال النهاردة — باقي {state.hoursLeft} ساعة على نهاية اليوم وإلا الستريك يضيع!
          </p>
        </div>
      )}

      {/* صف 4 — شريط جايزة السلسلة (ذهبي خفيف) */}
      {series && (
        <div className="border-t border-amber-500/20 bg-gradient-to-l from-amber-500/25 via-yellow-400/10 to-amber-500/25 px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <Gift className="h-3.5 w-3.5 shrink-0 text-amber-300" />
          <p className="truncate text-[11px] text-amber-200/90">{series.prize}</p>
        </div>
      )}

      {/* مفيش سلسلة شغالة — شريط استعداد */}
      {state && !series && (
        <div className="border-t border-zinc-800 bg-zinc-900/60 px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          <p className="text-[11px] text-zinc-300">مفيش تحدي شغال دلوقتي — استعد للتحدي الجاي 💪</p>
        </div>
      )}

      {/* الستريك اتكسر — شريط داكن مرة واحدة */}
      {state && state.streakReset && (
        <div className="border-t border-red-500/30 bg-gradient-to-l from-red-950 via-red-900/70 to-red-950 px-3 sm:px-4 py-1.5 flex items-center gap-2">
          <p className="text-[11px] font-bold text-red-200">💔 الستريك اتكسر… من غير درع، السلسلة بدأت من اليوم الأول. ورّينا انت النهاردة! 🔥</p>
        </div>
      )}

      {/* سكيليتون أول تحميل — صف رفيع مكان الشارات */}
      {loading && !state && (
        <div className="px-3 sm:px-4 py-2 flex items-center gap-2">
          <Skeleton className="h-6 w-36 bg-zinc-800" />
          <Skeleton className="h-6 w-14 rounded-full bg-zinc-800" />
          <Skeleton className="h-6 w-14 rounded-full bg-zinc-800" />
          <div className="flex-1" />
          <Skeleton className="h-6 w-10 rounded-xl bg-zinc-800" />
          <Skeleton className="h-9 w-28 rounded-md bg-zinc-800" />
        </div>
      )}
    </div>
  )
}
