'use client'

// ============================================================
// FILE: src/components/student/gamify/useGamifyState.ts
// PURPOSE: (2026-غ1) حالة التحفيز الكاملة للطالب — نداء واحد على
//   GET /api/gamify/state يجيب: ملف XP + الستريك + السلسلة النشطة +
//   اليوم المفتوح + أسئلة النهاردة + صندوق الكنز + الشارات + التحذيرات
//   + ريفريش تلقائي كل 60 ثانية (التنضيف صارم عند الخروج)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'

export interface GamifyQuestion {
  id: string
  dayNumber: number
  text: string
  /* options.length === 0 → سؤال إجابة نصية (input) بدل اختيارات */
  options: string[]
  xpReward: number
  difficulty: string
  alreadyRewarded: boolean
}

export interface GamifySeries {
  id: string
  title: string
  totalDays: number
  prize: string
}

export interface GamifyBadge {
  id: string
  name: string
  desc: string
  icon: string
  rarity: string
  conditionType: string
  threshold: number
  unlocked: boolean
  unlockedAt: string | null
}

export interface GamifyState {
  profile: {
    xp: number
    streak: number
    bestStreak: number
    shield: number
    cosmetics: string[]
    lastActiveDate: string
  }
  series: GamifySeries | null
  unlockedDay: number /* 0 = لا يوجد تحدي / سلسلة فاضية */
  dayQuestions: GamifyQuestion[]
  todayAnsweredCount: number
  todayTotal: number
  totalQuestions: number
  /* (2026-ج2) الطالب قفل إشعار سؤال اليوم بالـ X لليوم المفتوح ده؟ */
  popupDismissed?: boolean
  streakReset: boolean
  boxReady: boolean
  boxCooldownMs: number
  windowUrgent: boolean
  hoursLeft: number
  badges: GamifyBadge[]
  today: string
}

export function useGamifyState(studentId: string, grade: string) {
  const [state, setState] = useState<GamifyState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  /* منع النداءات المتداخلة — الرفريش التلقائي + اليدوي ما يتراكموش */
  const inFlight = useRef(false)
  /* (2026-غ2) لو حدث التزامن وصل والنداء شغال → نداء متأخر بدل تساقط التحديث */
  const pendingRefresh = useRef(false)

  const refresh = useCallback(async function () {
    if (!studentId) return
    if (inFlight.current) { pendingRefresh.current = true; return }
    inFlight.current = true
    try {
      const res = await fetch('/api/gamify/state?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
      const data = await res.json()
      if (!res.ok) throw new Error(String((data && data.error) || 'خطأ في تحميل حالة التحدي'))
      setState(data as GamifyState)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ في تحميل حالة التحدي')
    } finally {
      inFlight.current = false
      setLoading(false)
      if (pendingRefresh.current) {
        pendingRefresh.current = false
        void refresh()
      }
    }
  }, [studentId])

  useEffect(function () {
    /* grade ضمن الاعتماديات — تغيير الصف يعيد الجلب مع الطالب الجديد */
    if (!studentId) { return }
    /* تأجيل أول جلب — setState المتزامن جوه الـ effect بيولّد cascading renders */
    const kick = setTimeout(function () { setLoading(true); refresh() }, 0)
    const timer = setInterval(function () { refresh() }, 60000)
    /* (2026-غ1) مزامنة فورية — غرفة التحدي بتبعت 'gamify-state-updated'
       بعد كل إجراء (إجابة/صندوق/رهان) عشان شريط التحدي العلوي يتحدث لحظيًا */
    const onSync = function () { refresh() }
    window.addEventListener('gamify-state-updated', onSync)
    return function () { clearTimeout(kick); clearInterval(timer); window.removeEventListener('gamify-state-updated', onSync) }
  }, [studentId, grade, refresh])

  return { state, loading, error, refresh }
}
