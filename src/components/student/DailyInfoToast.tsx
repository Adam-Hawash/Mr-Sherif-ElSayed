'use client'

// ============================================================
// FILE: src/components/student/DailyInfoToast.tsx
// (وN11) معلومة اليوم / حكمة اليوم — نسخة عامة للجميع بطلب المستر حرفيًا:
//   «عايز كارت المعلومات يظهر في القسم أول ما الطالب يفتح المنصة —
//    العادية اللي فيها صورة المستر — تظهر لكل الطلاب حتى اللي مش مسجلين
//    معانا، تظهر عامة في الصفحة الرئيسية جنب الهيرو سيكشن وتفضل ثابتة
//    معاه حتى لما يعمل لوج ان — تتقفل لما يدوس بس على حرف الـ X»
//   «ما يكونش بوقت — مش بوقت ويختفي — لما أدوس X يختفي»
//   • بتنزلق من الشمال أول ما أي حد يفتح المنصة (زائر/طالب — حتى غير المسجلين)
//   • بتفضل ثابتة بعد تسجيل الدخول كمان — نفس الكارت بلا انقطاع
//   • من غير أي مؤقت ولا إغلاق تلقائي — الإغلاق الوحيد هو زرار الـ X
//   • الـ X = تتقفل خالص ومش بتظهر تاني (localStorage) + تسجيل مشاهدة للأدمن
//   • أسفل الكارت توقيع بخط صغير: «MR احمد شعبان» في ناحية و«أدهم حواش» في ناحية
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { FileText, Lightbulb, Brain, X } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'

interface DailyInfo {
  id: string
  dateKey: string
  kind: string
  title: string
  body: string
  mediaPath: string
  mediaName: string
}

/* توقيع الكارت بطلب المستر: اختصار اسم المدرس بالإنجليزي في ناحية واسم المطور في ناحية */
var TEACHER_TAG = 'MR شريف السيد'
var DEV_TAG = 'أدهم حواش'

/** معرفات الكروت المقفولة بالـ X — محفوظة محليًا فمش بتظهر تاني */
var CLOSED_KEY = 'daily_info_closed_ids'

function readClosed(): string[] {
  try {
    var raw = String(localStorage.getItem(CLOSED_KEY) || '[]')
    var arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr
      .filter(function (x) { return typeof x === 'string' && x.length > 0 })
      .slice(-200)
  } catch (e) { return [] }
}

function rememberClosed(id: string): void {
  try {
    var arr = readClosed().filter(function (x) { return x !== id })
    arr.push(id)
    if (arr.length > 200) arr = arr.slice(-200)
    localStorage.setItem(CLOSED_KEY, JSON.stringify(arr))
  } catch (e) { /* صامت — الإغلاق المحلي شغال على أي حال */ }
}

export function DailyInfoToast() {
  const [info, setInfo] = useState<DailyInfo | null>(null)
  const currentStudent = useAppStore(function (s) { return s.currentStudent })

  /* أول ما أي حد يفتح المنصة — نجيب معلومة النهاردة (عامة للكل من غير تسجيل دخول)
     والكروت المقفولة بالـ X على الجهاز ده عمرها ما بترجع تظهر */
  useEffect(function () {
    var alive = true
    ;(async function () {
      var closed = readClosed()
      try {
        const res = await fetch('/api/daily-info', { cache: 'no-store' })
        const data = await res.json().catch(function () { return null })
        if (alive && res.ok && data && data.info && data.info.id) {
          if (closed.indexOf(String(data.info.id)) < 0) {
            setInfo(data.info as DailyInfo)
          }
        }
      } catch (e) { /* صامت — مفيش معلومة النهاردة */ }
    })()
    return function () { alive = false }
  }, [])

  /* الإغلاق الوحيد = زرار الـ X — من غير أي وقت أو عد تنازلي (طلب المستر) */
  const close = useCallback(async function () {
    const current = info
    setInfo(null)
    if (!current) return
    rememberClosed(String(current.id))
    var sid = currentStudent && currentStudent.id ? String(currentStudent.id) : ''
    if (sid) {
      try {
        await fetch('/api/daily-info/seen', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: sid, infoId: current.id }),
        })
      } catch (e) { /* صامت — الإغلاق المحلي شغال على أي حال */ }
    }
  }, [info, currentStudent])

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
            {/* علامة X فوق — الإغلاق الوحيد للكارت بطلب المستر */}
            <button
              onClick={function () { void close() }}
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
              {/* (وN11) توقيع الكارت بطلب المستر: اسم المدرس في ناحية واسم المطور في ناحية — الاثنين بخط صغير */}
              <div className="mt-3 flex items-center justify-between border-t border-zinc-200/80 pt-2 dark:border-zinc-700/60">
                <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{TEACHER_TAG}</span>
                <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">{DEV_TAG}</span>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
