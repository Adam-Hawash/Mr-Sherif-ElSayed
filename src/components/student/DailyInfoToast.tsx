'use client'

// ============================================================
// FILE: src/components/student/DailyInfoToast.tsx
// (2026-ت4) معلومة اليوم / حكمة اليوم — طلب المستر حرفيًا:
//   «زي اشعار كده كبير جاي من ناحية الشمال اول ما يفتح المنصة
//    وفي علامة اكس فوق عشان الطالب يقفله — هو بيقعد 30 ثانية وبعد كده يتقفل»
//   • إشعار كبير ينزلق من الشمال أول ما الطالب يفتح منصته
//   • علامة X فوق = يقفلها خالص ومش بتظهر تاني (تُسجّل كمشاهدة)
//   • لو ما قفلهاش: بتعيد العد 30 ثانية وتتقفل لوحدها
//   • كل معلومة بتظهر مرة واحدة بس لكل طالب (DailyInfoView)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Lightbulb, Brain, X } from 'lucide-react'

interface DailyInfo {
  id: string
  dateKey: string
  kind: string
  title: string
  body: string
  mediaPath: string
  mediaName: string
}

const AUTO_CLOSE_SECONDS = 30

export function DailyInfoToast({ studentId }: { studentId: string }) {
  const [info, setInfo] = useState<DailyInfo | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(AUTO_CLOSE_SECONDS)
  const closedRef = useRef(false)

  /* أول ما يفتح المنصة — نجيب آخر معلومة ما شافهاش */
  useEffect(function () {
    if (!studentId || closedRef.current) return
    var alive = true
    ;(async function () {
      try {
        const res = await fetch('/api/daily-info?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
        const data = await res.json().catch(function () { return null })
        if (alive && res.ok && data && data.info && data.info.id) {
          setInfo(data.info as DailyInfo)
          setSecondsLeft(AUTO_CLOSE_SECONDS)
        }
      } catch (e) { /* صامت — مفيش معلومة النهاردة */ }
    })()
    return function () { alive = false }
  }, [studentId])

  const close = useCallback(async function (markSeen: boolean) {
    const current = info
    setInfo(null)
    closedRef.current = true
    if (current && markSeen) {
      try {
        await fetch('/api/daily-info/seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: studentId, infoId: current.id }),
        })
      } catch (e) { /* صامت — مقفولة محليًا على أي حال */ }
    }
  }, [info, studentId])

  /* العد التنازلي 30 ثانية — وبعدها تتقفل لوحدها */
  useEffect(function () {
    if (!info) return
    setSecondsLeft(AUTO_CLOSE_SECONDS)
    var left = AUTO_CLOSE_SECONDS
    var timer = setInterval(function () {
      left = left - 1
      setSecondsLeft(Math.max(0, left))
      if (left <= 0) {
        clearInterval(timer)
        void close(true)
      }
    }, 1000)
    return function () { clearInterval(timer) }
  }, [info, close])

  const isWisdom = info ? info.kind === 'wisdom' : false

  return (
    <AnimatePresence>
      {info && (
        <motion.div
          key={info.id}
          initial={{ x: '-120%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '-120%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 260, damping: 26 }}
          className="fixed bottom-4 left-3 z-[60] w-[calc(100%-1.5rem)] max-w-sm sm:bottom-6 sm:left-6"
          role="alertdialog"
          aria-label={isWisdom ? 'حكمة اليوم' : 'معلومة اليوم'}
        >
          <div className="relative overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-white text-right shadow-[0_20px_60px_rgba(0,0,0,0.35)] dark:border-amber-500/50 dark:bg-zinc-900">
            {/* شريط العد التنازلي — بيفضى مع الـ 30 ثانية */}
            <div className="absolute inset-x-0 top-0 h-1 bg-amber-100 dark:bg-zinc-800">
              <div
                className="h-full bg-gradient-to-l from-amber-400 to-emerald-400 transition-all duration-1000 ease-linear"
                style={{ width: Math.max(0, (secondsLeft / AUTO_CLOSE_SECONDS) * 100) + '%' }}
              />
            </div>

            {/* علامة X فوق — طلب المستر: الطالب يقفلها بيها خالص */}
            <button
              onClick={function () { void close(true) }}
              aria-label="إغلاق"
              className="absolute left-2.5 top-2.5 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900/10 text-zinc-600 transition-colors hover:bg-zinc-900/20 hover:text-zinc-900 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20 dark:hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>

            <div className="px-4 pb-4 pt-5">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                {isWisdom ? <Brain className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                {isWisdom ? '🧠 حكمة اليوم' : '💡 معلومة اليوم'}
              </p>
              {info.title ? (
                <h3 className="mt-1.5 text-base font-extrabold leading-snug text-zinc-900 dark:text-zinc-100">{info.title}</h3>
              ) : null}
              {info.body ? (
                <p className="mt-1.5 max-h-56 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-relaxed text-zinc-700 dark:text-zinc-300">
                  {info.body}
                </p>
              ) : null}
              {info.mediaPath ? (
                info.mediaPath.toLowerCase().indexOf('.pdf') >= 0 ? (
                  <a
                    href={info.mediaPath}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2.5 inline-flex min-h-11 items-center gap-2 rounded-lg border border-sky-300 bg-sky-50 px-3 text-sm font-bold text-sky-700 hover:bg-sky-100 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-300"
                  >
                    <FileText className="h-4 w-4" />
                    افتح الملف {info.mediaName ? '— ' + info.mediaName.slice(0, 40) : ''}
                  </a>
                ) : (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={info.mediaPath}
                    alt={info.title || 'مرفق معلومة اليوم'}
                    className="mt-2.5 max-h-64 w-full rounded-xl border border-zinc-200 object-contain dark:border-zinc-700"
                  />
                )
              ) : null}
              <p className="mt-2.5 text-[10px] font-medium text-zinc-400">
                هتتقفل لوحدها بعد {secondsLeft} ثانية — أو اقفلها من الـ X
              </p>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
