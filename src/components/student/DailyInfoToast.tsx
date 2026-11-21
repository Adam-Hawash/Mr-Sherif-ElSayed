'use client'

// ============================================================
// FILE: src/components/student/DailyInfoToast.tsx
// (وN14) قاعدة الفتح الجديدة بطلب المستر حرفيًا: «اللي يدوس على الحبة دي
//   تفتح له المعلومة اللي هو الكارت الكبير بس يكون فوق زرار الـ install
//   app بالضبط، فوقيه بالضبط ما يكونش سايب مسافة وما يكونش عالي قوي»:
//   • الكارت المفتوح قاعده بييجي **فوق زرار «ثبّت التطبيق» بالضبط** —
//     الزرار نفسه bottom 1rem + ارتفاعه 44px → قمة الزرار عند 3.75rem،
//     والكارت قاعده على القمة دي بالظبط — صفر مسافة بينهم
//   • على الديسكتوب مفيش زرار تثبيت (موبايل بس) — الكارت بيقعد فوق
//     زرار الواتساب بالضبط بنفس قاعدة الصفر مسافة (الواتساب هنا ثابت
//     على 4.75rem في كل الشاشات → قمته 8.25rem)
//   • «ما يكونش عالي قوي» = سقف ارتفاع للكارت (60vh على الموبايل) —
//     الكلام الزياد بيسكرول جوه الكارت نفسه من غير ما الكارت يعلى
//   • والحبة في باقي المشاهد كانت بتقع ورا زرار التثبيت (نفس مكان).
//     بقت قاعدة فوقيه بالضبط زي الكارت — وفوق الواتساب في مشاهد الهيرو
//     (وكانت على الديسكتوب بتغطي الواتساب — اتظبطت كمان)
// (ر24) معلومة اليوم / حكمة اليوم — تصميم «الحبة الذكية» بطلب المستر حرفيًا:
//   «في اللابتوب او في الموبايل بتداري المستر مثلا... لما الطالب بيدخل
//    على مواعيد السنتر ويشوف البرايفت كلاس من على الموبايل ما بتبقاش
//    موجوده عشان مش بيعرف يدوس عليها... عاوز تكون حاجة فكرة بس تكون
//    شكلها حلو كديزاين»
//   • الحبة (Pill): زرار صغير مدور بييجي أول ما المنصة تفتح — حجمه صغير
//     فما بيغطيش صورة المستر ولا زرار التثبيت ولا أي زرار — وفيه نقطة
//     نابضة بتلفت نظر الطالب من غير ما تزعقه
//   • الدوس على الحبة = الكارت يفتح بنعومة بحجم أصغر على الموبايل
//   • الدوس في أي مكان بره الكارت أو زرار التصغير (⌄) = يرجع حبة تاني
//     (تصغير مش قفل — بيرجع بالدوس على الحبة)
//   • الـ X هو القفل النهائي الوحيد (localStorage) — من غير أي مؤقت ولا
//     إغلاق تلقائي — عقد المستر بالحرف: «تتقفل لما يدوس بس على حرف
//     الـ X — ما يكونش بوقت»
//   • عامة للكل حتى غير المسجلين وبتفضل ثابتة بعد تسجيل الدخول
//   • توقيع الكارت بخط صغير: «MR. Sherif El-Sayed» في ناحية و«Adam Hawash»
//     في ناحية — بالإنجليزي
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronDown, FileText, Lightbulb, Brain, X } from 'lucide-react'
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

/* توقيع الكارت بطلب المستر حرفيًا: «MR. Sherif El-Sayed» في ناحية و«Adam Hawash» في ناحية — بالإنجليزي على منصة مستر شريف */
var TEACHER_TAG = 'MR. Sherif El-Sayed'
var DEV_TAG = 'Adam Hawash'

/** معرفات الكروت المقفولة بالـ X — محفوظة محليًا فمش بتظهر تاني */
var CLOSED_KEY = 'daily_info_closed_ids'

/* المشاهد اللي الزاوية الشمال تحت فيها زرار تثبيت التطبيق + زرار الواتساب —
   الحبة بترتفع فوقهم بدل ما تغطيهم، وفي باقي المشاهد الزاوية فاضية فبتقعد تحت خالص */
var CROWDED_VIEWS = ['landing', 'auth-login', 'auth-register']

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
  const [open, setOpen] = useState(false)
  const currentStudent = useAppStore(function (s) { return s.currentStudent })
  const currentView = useAppStore(function (s) { return s.currentView })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  /* أول ما أي حد يفتح المنصة — نجيب معلومة النهاردة (عامة للكل من غير تسجيل دخول)
     وبتظهر كحبة صغيرة مش كارت كبير — والكروت المقفولة بالـ X عمرها ما بترجع */
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
            setOpen(false)
          }
        }
      } catch (e) { /* صامت — مفيش معلومة النهاردة */ }
    })()
    return function () { alive = false }
  }, [])

  /* الدوس في أي مكان بره الكارت = يرجع حبة (تصغير — مش قفل) */
  useEffect(function () {
    if (!open) return
    function onDown(e: MouseEvent) {
      if (wrapRef.current && e.target instanceof Node && wrapRef.current.contains(e.target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return function () { document.removeEventListener('mousedown', onDown) }
  }, [open])

  /* الإغلاق النهائي الوحيد = زرار الـ X — من غير أي وقت أو عد تنازلي (طلب المستر) */
  const closeForever = useCallback(async function () {
    const current = info
    setOpen(false)
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

  /* (وN14) مكان الحبة والكارت — طلب المستر حرفيًا:
     الحبة: فوق زرار التثبيت والواتساب في مشاهد الهيرو (وعلى الديسكتوب فوق
     الواتساب بالضبط — كانت بتغطيه)، وفي باقي المشاهد قاعدة **فوق زرار
     التثبيت بالضبط** (كانت بتقع وراه من قبل) */
  var crowded = CROWDED_VIEWS.indexOf(String(currentView)) >= 0
  var pillAnchor = crowded
    ? 'bottom-[calc(9.75rem+env(safe-area-inset-bottom))] md:bottom-[8.25rem]'
    : 'bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-[1.25rem]'
  /* (وN14) الكارت: فوق زرار «ثبّت التطبيق» بالضبط — صفر مسافة (1rem + 44px
     = 3.75rem قمة الزرار). ديسكتوب: فوق الواتساب بالضبط (4.75rem + h-14
     = 8.25rem قمة الواتساب) — نفس قاعدة الصفر مسافة */
  var cardAnchor = 'bottom-[calc(3.75rem+env(safe-area-inset-bottom))] md:bottom-[8.25rem]'

  return (
    <div ref={wrapRef}>
      {/* (وN14) حاوية الحبة — مكانها لوحدها عشان الكارت لما يفتح ينزل يقعد
          فوق زرار التثبيت بالضبط من غير ما الحبة تتحرك من مكانها أثناء الخروج */}
      <div className={'fixed left-3 z-[85] sm:left-4 ' + pillAnchor}>
        <AnimatePresence mode="wait">
          {info && !open && (
            <motion.button
              key="pill"
              initial={{ opacity: 0, y: 18, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.94 }}
              transition={{ type: 'spring', stiffness: 320, damping: 24 }}
              onClick={function () { setOpen(true) }}
              aria-expanded={false}
              aria-label={isWisdom ? 'حكمة اليوم — اضغط تفتحها' : 'معلومة اليوم — اضغط تفتحها'}
              className="flex items-center gap-2 rounded-full border-2 border-amber-400/70 bg-white/95 py-2 pl-3.5 pr-3 shadow-[0_10px_35px_rgba(0,0,0,0.35)] backdrop-blur transition-transform hover:scale-[1.05] active:scale-95 dark:border-amber-500/60 dark:bg-zinc-900/95"
            >
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              {isWisdom ? <Brain className="h-3.5 w-3.5" /> : <Lightbulb className="h-3.5 w-3.5" />}
            </span>
            <span className="text-[11px] font-extrabold text-zinc-800 dark:text-zinc-100">
              {isWisdom ? 'حكمة اليوم' : 'معلومة اليوم'}
            </span>
            {/* نقطة نابضة — بتلفت النظر من غير صوت ولا حركة مزعجة */}
              <span className="relative flex h-2 w-2 shrink-0" aria-hidden="true">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      {/* (وN14) حاوية الكارت — قاعده على قمة زرار «ثبّت التطبيق» بالضبط (صفر مسافة) */}
      <div className={'fixed left-4 z-[85] ' + cardAnchor}>
        <AnimatePresence mode="wait">
          {info && open && (
            /* ==================== الكارت المفتوح — فوق زرار التثبيت بالضبط،
               بسقف ارتفاع (ما يكونش عالي قوي) وسكرول للمحتوى الزياد ==================== */
            <motion.div
              key="card"
              initial={{ opacity: 0, y: 14, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 300, damping: 26 }}
              style={{ transformOrigin: 'bottom left' }}
              role="alertdialog"
              aria-label={isWisdom ? 'حكمة اليوم' : 'معلومة اليوم'}
              className="flex max-h-[min(60vh,24rem)] w-[calc(100vw-1.5rem)] max-w-[330px] flex-col overflow-hidden rounded-2xl border-2 border-amber-400/60 bg-white text-right shadow-[0_20px_60px_rgba(0,0,0,0.35)] dark:border-amber-500/50 dark:bg-zinc-900 sm:max-h-[26rem] sm:max-w-sm"
            >
              {/* شريط تدرج علوي — لمسة ديزاين ثابتة من غير أي وقت */}
              <div className="h-1 w-full shrink-0 bg-gradient-to-l from-amber-400 via-emerald-400 to-amber-400" aria-hidden="true" />

              {/* رأس الكارت ثابت: العنوان يمين + أزرار التصغير والـ X شمال —
                  ما بيتغطوش لما المحتوى ييسكرول تحتهم */}
              <div dir="rtl" className="flex shrink-0 items-center justify-between gap-2 px-3.5 pt-3 sm:px-4 sm:pt-4">
                <p className="flex items-center gap-1.5 text-xs font-extrabold text-amber-600 dark:text-amber-400">
                  {isWisdom ? <Brain className="h-4 w-4" /> : <Lightbulb className="h-4 w-4" />}
                  {isWisdom ? '🧠 حكمة اليوم' : '💡 معلومة اليوم'}
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={function () { setOpen(false) }}
                    aria-label="تصغير — ترجع تاني من الحبة"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/10 text-zinc-600 transition-colors hover:bg-zinc-900/20 hover:text-zinc-900 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-white/20 dark:hover:text-white"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                  <button
                    onClick={function () { void closeForever() }}
                    aria-label="إغلاق نهائي"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-zinc-900/10 text-zinc-600 transition-colors hover:bg-red-500/20 hover:text-red-600 dark:bg-white/10 dark:text-zinc-300 dark:hover:bg-red-500/30 dark:hover:text-red-300"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>

              {/* المحتوى بيسكرول جوه الكارت — الكارت نفسه عمره ما يعلى فوق السقف */}
              <div className="min-h-0 flex-1 overflow-y-auto px-3.5 pb-3 pt-1 sm:px-4 sm:pb-4">
                {info.title ? (
                  <h3 className="text-sm font-extrabold leading-snug text-zinc-900 dark:text-zinc-100 sm:text-base">{info.title}</h3>
                ) : null}
                {info.body ? (
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-zinc-700 dark:text-zinc-300 sm:text-sm">
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
                      className="mt-2.5 max-h-40 w-full rounded-xl border border-zinc-200 object-contain dark:border-zinc-700 sm:max-h-64"
                    />
                  )
                ) : null}
                {/* توقيع الكارت بطلب المستر: اسم المستر في ناحية واسم المطور في ناحية — الاثنين بخط صغير */}
                <div className="mt-3 flex items-center justify-between border-t border-zinc-200/80 pt-2 dark:border-zinc-700/60">
                  <span className="text-[10px] font-bold text-zinc-500 dark:text-zinc-400">{TEACHER_TAG}</span>
                  <span className="text-[9px] font-semibold text-zinc-400 dark:text-zinc-500">{DEV_TAG}</span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
