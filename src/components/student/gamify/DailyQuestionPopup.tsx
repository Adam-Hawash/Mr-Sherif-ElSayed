'use client'

// ============================================================
// FILE: src/components/student/gamify/DailyQuestionPopup.tsx
// (2026-ج2) طلب المستر الحرفي:
//   «الأسئلة تيجي زي إشعار كده لما يدخل صفحة الطالب — السؤال ده
//    وكذا — وتقدمه يتحفظ»
//   • أول ما الطالب يدخل صفحته: سؤال اليوم يظهر زي إشعار فوق
//   • يجاوب من الإشعار على طول — التقدم بيتحفظ (ChallengeAttempt)
//   • زرار X = الإشعار يختفي خالص «ما بتبقاش موجودة» — والسؤال
//     يفضل متاح في تاب «التحدي اليومي» (الكلام ده مكتوب بوضوح)
//   • لو الوقت بيقرب يخلص أو الستريك اتكسر: شعار «خش حل السؤال
//     اليومي بسرعة!» بنبض أحمر
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, X, Zap, Trophy } from 'lucide-react'
import { useGamifyState, type GamifyQuestion } from './useGamifyState'
import BidiText from '@/components/BidiText'

interface DailyQuestionPopupProps {
  studentId: string
  grade: string
  /* مخفي مؤقتًا (مثلاً والطالب واقف في تاب التحدي نفسه) */
  suppressed?: boolean
}

export function DailyQuestionPopup({ studentId, grade, suppressed }: DailyQuestionPopupProps) {
  const { state, refresh } = useGamifyState(studentId, grade)
  const [visible, setVisible] = useState(true)
  const [busy, setBusy] = useState(false)
  const [choice, setChoice] = useState<number | null>(null)
  const [textAnswer, setTextAnswer] = useState('')
  const [result, setResult] = useState<null | { correct: boolean; message: string }>(null)
  const closedRef = useRef(false)

  /* سؤال النهاردة = أول سؤال لسه مكافأتش (التقدم محفوظ من قبل) */
  const series = state ? state.series : null
  const day = state ? Number(state.unlockedDay) || 0 : 0
  const pending: GamifyQuestion[] = state
    ? (state.dayQuestions || []).filter(function (q) { return !q.alreadyRewarded })
    : []

  const dismissed = state ? !!state.popupDismissed : false
  const show = !!(
    !suppressed &&
    visible &&
    !closedRef.current &&
    state &&
    series &&
    day > 0 &&
    pending.length > 0 &&
    !dismissed
  )

  const current = pending.length > 0 ? pending[0] : null
  const remaining = pending.length

  /* إعادة فتح لما اليوم/السؤال يتغير (يوم جديد = إشعار جديد) */
  useEffect(function () {
    closedRef.current = false
    setVisible(true)
    setChoice(null)
    setTextAnswer('')
    setResult(null)
  }, [day, current ? current.id : ''])

  const dismiss = useCallback(async function () {
    closedRef.current = true
    setVisible(false)
    if (!series || !current) return
    try {
      await fetch('/api/gamify/popup-dismiss', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, seriesId: series.id, day: day }),
      })
    } catch (e) { /* صامت — الإشعار اتقفل محليًا على أي حال */ }
  }, [series, current, studentId, day])

  const answer = useCallback(async function (choiceIndex: number, answerText: string) {
    if (!series || !current || busy) return
    setBusy(true)
    setChoice(choiceIndex)
    try {
      const res = await fetch('/api/gamify/answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          studentId: studentId, seriesId: series.id, questionId: current.id,
          choiceIndex: choiceIndex, answerText: answerText,
        }),
      })
      const data = await res.json()
      if (res.ok && data && data.ok) {
        setResult({ correct: !!data.correct, message: String(data.message || '') })
        toast[data.correct ? 'success' : 'error'](String(data.message || ''), { duration: 4500 })
        try { window.dispatchEvent(new Event('gamify-state-updated')) } catch (e) {}
        /* بعدها سؤال؟ الإشعار يكمل عليه — خلصت؟ يقفل لوحده */
        setTimeout(async function () {
          setChoice(null); setTextAnswer(''); setResult(null)
          await refresh()
          try {
            const re = await fetch('/api/gamify/state?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
            const reData = await re.json()
            const stillPending = (reData && reData.dayQuestions || []).filter(function (q: GamifyQuestion) { return !q.alreadyRewarded })
            if (stillPending.length === 0) { closedRef.current = true; setVisible(false) }
          } catch (e) {}
        }, 1600)
      } else {
        toast.error(String((data && data.error) || 'جرب تاني'))
        setChoice(null)
      }
    } catch (e) {
      toast.error('حصلت مشكلة في الاتصال')
      setChoice(null)
    }
    setBusy(false)
  }, [series, current, busy, studentId, refresh])

  if (!show || !current || !series) return null

  const urgent = !!(state && (state.windowUrgent || state.streakReset))

  return (
    <div
      dir="rtl"
      role="alert"
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[60] w-[min(94vw,540px)] animate-in slide-in-from-top-4 fade-in duration-300"
    >
      <div className="relative overflow-hidden rounded-2xl border-2 border-amber-500/70 bg-zinc-950 shadow-[0_0_30px_rgba(245,158,11,0.35)]">
        {/* شريط التحفيز — نيون نابض لو الوقت بيجري أو الستريك اتكسر */}
        {urgent && (
          <div className="bg-red-500/15 border-b border-red-500/40 px-3 py-1.5 animate-pulse">
            <p className="text-[11px] font-bold text-red-300 text-center">🚨 خش حل السؤال اليومي بسرعة — سلسلتك في خطر!</p>
          </div>
        )}
        <div className="p-3 sm:p-4">
          {/* رأس الإشعار */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <span className="shrink-0 h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-base" aria-hidden>🎯</span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-extrabold text-amber-200 truncate">
                  {series.title || 'التحدي اليومي'} — اليوم {day}
                </p>
                <p className="text-[10px] text-zinc-400 flex items-center gap-1 flex-wrap">
                  <span className="inline-flex items-center gap-0.5"><Zap className="h-3 w-3 text-amber-400" /> +{current.xpReward} XP لو صح</span>
                  {remaining > 1 && <span className="text-zinc-500">• باقي {remaining} أسئلة النهاردة</span>}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={dismiss}
              className="shrink-0 h-8 w-8 rounded-lg hover:bg-white/10 flex items-center justify-center cursor-pointer transition-colors"
              aria-label="قفل الإشعار — مش هيظهر تاني النهاردة"
              title="قفل — مش هيظهر تاني"
            >
              <X className="h-4 w-4 text-zinc-300" />
            </button>
          </div>

          {/* نتيجة الإجابة السابقة */}
          {result ? (
            <div className="text-center py-4">
              <div className="text-3xl mb-1">{result.correct ? '🎉' : '💪'}</div>
              <p className={'text-sm font-extrabold ' + (result.correct ? 'text-emerald-300' : 'text-red-300')}>
                <BidiText text={result.message} />
              </p>
              <p className="text-[11px] text-zinc-500 mt-1">تقدمك محفوظ ✓</p>
            </div>
          ) : (
            <>
              {/* نص السؤال */}
              <div className="rounded-xl bg-black/50 border border-white/10 p-3 mb-2">
                <p className="text-sm font-bold leading-relaxed text-zinc-100">
                  <BidiText text={current.text} />
                </p>
              </div>
              {/* اختيارات / إجابة نصية */}
              {current.options && current.options.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {current.options.map(function (opt: string, i: number) {
                    return (
                      <button
                        key={'dqo' + i}
                        type="button"
                        disabled={busy}
                        onClick={function () { answer(i, '') }}
                        className="text-right rounded-xl border border-white/10 bg-black/40 px-3 py-2.5 text-xs sm:text-sm text-zinc-200 hover:border-amber-500/60 hover:bg-amber-500/10 transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
                      >
                        <span className="inline-flex items-center gap-2">
                          <span className="h-5 w-5 shrink-0 rounded-full border border-amber-500/50 text-[10px] flex items-center justify-center text-amber-300 font-bold">{i + 1}</span>
                          <BidiText text={opt} />
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : (
                <div className="flex gap-1.5">
                  <input
                    value={textAnswer}
                    onChange={function (e) { setTextAnswer(e.target.value) }}
                    onKeyDown={function (e) { if (e.key === 'Enter' && textAnswer.trim()) answer(-1, textAnswer) }}
                    placeholder="اكتب إجابتك هنا…"
                    disabled={busy}
                    className="flex-1 min-h-[44px] rounded-xl border border-white/10 bg-black/40 px-3 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-amber-500/60"
                    dir="auto"
                  />
                  <button
                    type="button"
                    disabled={busy || !textAnswer.trim()}
                    onClick={function () { answer(-1, textAnswer) }}
                    className="shrink-0 rounded-xl border-2 border-amber-500 bg-amber-500/20 px-4 text-xs font-extrabold text-amber-200 hover:bg-amber-500/30 transition-colors cursor-pointer disabled:opacity-40 min-h-[44px]"
                  >
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'جاوب'}
                  </button>
                </div>
              )}
              {/* الكلام الواضح — طلب المستر: «خلي الكلام واضح عشان لما بدوس على الـ X» */}
              <p className="text-[10px] text-zinc-500 mt-2 leading-relaxed">
                لو قفلت الإشعار بالـ ✕ مش هيظهر تاني — والسؤال يفضل محفوظ ليك في تاب «التحدي اليومي» وتقدر تحله في أي وقت.
              </p>
              {/* الجوايز — نص المستر الحرفي */}
              <p className="text-[10px] text-amber-200/70 mt-1 flex items-center gap-1">
                <Trophy className="h-3 w-3 shrink-0" />
                <span className="line-clamp-1"><BidiText text={series.prize || 'جوائز مادية قوية من المستر — أعلى نقاط يكسب الجائزة الكبرى 💰'} /></span>
              </p>
            </>
          )}
        </div>
        <div className="h-1 bg-gradient-to-l from-transparent via-amber-500 to-transparent opacity-70" />
      </div>
    </div>
  )
}

export default DailyQuestionPopup
