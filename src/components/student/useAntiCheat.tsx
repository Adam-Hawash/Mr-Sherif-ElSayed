'use client'

// ============================================================
// FILE: src/components/student/useAntiCheat.ts
// PURPOSE: (2026-و66) نظام منع الغش والتشتت الذكي — طلب المستر:
//   «يحسس لما الطالب يقلب على الجوال أو يسيب الامتحان ويودّع تحذير»
// المنطق:
//   • مراقبة مغادرة الصفحة: (2026-و92) document.visibilitychange بس —
//     التاب/التطبيق التاني هو الخروج الحقيقي الوحيد. الـ blur اتشال
//     (إشعارات النظام/برومبتات الأذونات كانت بتتحسب غلط)
//   • إعفاء كامل أثناء رفع الصور/الكاميرا (تعليق العدّاد و73/74)
//   • المغادرة 1 و 2 → تحذير لطيف («رايح فين يا بطل؟ كمل امتحانك 😅»)
//   • المغادرة 3 وأكتر → خصم نقاط (بيتطبق عند التسليم في السيرفر)
//   • المغادرة 4 → تسليم الامتحان تلقائيًا (onGiveUp مرة واحدة)
// المكونات:
//   • useAntiCheat(opts) — hook بيرجع strikes + حالة المودال
//   • AntiCheatModal — مودال التحذير (بيمنع أي تفاعل لحد الضغط)
//   • AntiCheatBadge — شارة المخالفات الظاهرة فوق شاشة الحل
// ============================================================

import { useEffect, useRef, useState, useCallback } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { motion, AnimatePresence } from 'framer-motion'

var MAX_AUTO_SUBMIT_STRIKES = 4 // المغادرة الرابعة → تسليم تلقائي
var PENALTY_FREE_STRIKES = 2 // أول تحذيرين بدون خصم

/* (2026-و73) اسم حدث منصة داخلي — MathKeyboard بيطلقه لما الطالب يدوس على
 * زرار رفع الصورة أو زرار الكاميرا عشان نعرف إن النافذة هتفقد الفوكس
 * لحظة (نافذة اختيار الملف/الكاميرا) — دي مش مغادرة امتحان خالص */
export var PICKER_OPEN_EVENT = 'mg-picker-open'
/* (2026-و74) حدث قفل المودال/النافذة — مودال الكاميرا الحقيقي بيفضل جوه
 * الصفحة (مفيش blur حقيقي) فلازم نرف التعليق يدوي عند القفل عشان أي
 * مغادرة حقيقية بعدها تتحسب طبيعي من غير ما نستنى الـ5 دقايق */
export var PICKER_CLOSE_EVENT = 'mg-picker-close'

export interface AntiCheatOptions {
  active: boolean
  /* أول اسم مخصص للرسالة (اسم الطالب) */
  studentName?: string
  /* (2026-و76) نوع الشاشة — الامتحان ولا الواجب — عشان رسايل التحذير تناسبه
     (افتراضي exam زي ما كان) */
  kind?: 'exam' | 'hw'
  /* بيتنادى مرة واحدة لما الطالب يتجاوز الحد → سلّم الامتحان/الواجب */
  onGiveUp?: () => void
  /* بيتنادى مع كل مخالفة جديدة (للتوست/اللوج) */
  onStrike?: (strikes: number) => void
}

export function useAntiCheat(opts: AntiCheatOptions) {
  var active = !!opts.active
  var [strikes, setStrikes] = useState(0)
  var [warningOpen, setWarningOpen] = useState(false)
  var strikesRef = useRef(0)
  var lastStrikeAtRef = useRef(0)
  var giveUpFiredRef = useRef(false)
  /* (2026-و73) عدّاد تعليق — أثناء فتح نافذة رفع الصورة/الكاميرا النافذة بتفقد
   * الفوكس (blur/hidden) وده كان بيتحسب مخالفة غلط. طلب المستر: «طالما رافع
   * الصورة ودايس على زرار إلغاء — دي مش خروج». العدّاد بيتزود مع كل سبب تعليق
   * وبيترجع صفر لما الأسباب تخلص */
  var suspendedRef = useRef(0)
  var optsRef = useRef(opts)
  optsRef.current = opts

  /* تصفير لما النظام يقفل (خلص الامتحان/خرج) */
  useEffect(function () {
    if (!active) {
      setWarningOpen(false)
    }
  }, [active])

  /* المسجل الموحد للمغادرة */
  var registerDeparture = useCallback(function () {
    var o = optsRef.current
    if (!o.active) return
    /* (2026-و73) أثناء رفع صورة/تصوير بالكاميرا مفيش أي مخالفة تتحسب */
    if (suspendedRef.current > 0) return
    var now = Date.now()
    /* حارس التكرار: blur + visibilitychange بيحصلوا مع بعض — واحد بس */
    if (now - lastStrikeAtRef.current < 800) return
    lastStrikeAtRef.current = now

    strikesRef.current = strikesRef.current + 1
    var s = strikesRef.current
    setStrikes(s)
    setWarningOpen(true)

    try {
      /* (2026-و76) رسايل حسب نوع الشاشة — الواجب «كمّل واجبك» مش «كمل امتحانك» */
      var kind = (optsRef.current.kind === 'hw') ? 'hw' : 'exam'
      if (s === 1) {
        if (kind === 'hw') toast('رايح فين يا بطل؟ 😅 رجوع كمّل واجبك — إحنا معاك!', { duration: 5000 })
        else toast('رايح فين يا بطل؟ 😅 رجوع كمل امتحانك — إحنا معاك!', { duration: 5000 })
      }
      else if (s === 2) toast.warning('تاني مرة! ⚠️ خد بالك — أي مغادرة بعد كده فيها خصم نقاط.', { duration: 5000 })
      else if (s === 3) {
        if (kind === 'hw') toast.error('⚠️ خصم نقاط! كل مغادرة بعد كده = −5 درجات. ماتبقاش غبي وانت جاي واجب 😤', { duration: 6000 })
        else toast.error('⚠️ خصم نقاط! كل مغادرة بعد كده = −5 درجات. ماتبقاش غبي وانت جاي امتحان 😤', { duration: 6000 })
      }
    } catch (e) {}

    if (o.onStrike) {
      try { o.onStrike(s) } catch (e) {}
    }

    /* تجاوز الحد → تسليم تلقائي مرة واحدة */
    if (s >= MAX_AUTO_SUBMIT_STRIKES && !giveUpFiredRef.current) {
      giveUpFiredRef.current = true
      if (o.onGiveUp) {
        try { o.onGiveUp() } catch (e) {}
      }
    }
  }, [])

  /* المراقبة — (2026-و92) طلب المستر الحرفي: «محاولة الخروج تتحسب لما يخرج
     من المنصة، لما يدخل تاب ثانية» — يعني visibilitychange hidden بس.
     مراقبة window blur اتشالت خالص: ضغطة X على إشعار النظام، برومبت
     إذن الكاميرا/الميك، وقوائم المتصفح كانت بتعمل blur والصفحة لسه
     ظاهرة وكانت بتتحسب مغادرة غلط وتوصل الطالب للتسليم التلقائي بالغلط.
     التاب/التطبيق التاني (hidden) = الخروج الحقيقي الوحيد المُحسوب. */
  useEffect(function () {
    if (!active) return
    var onVis = function () {
      if (document.visibilityState === 'hidden') registerDeparture()
    }
    document.addEventListener('visibilitychange', onVis)
    return function () {
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [active, registerDeparture])

  /* ===== (2026-و73) إعفاء نافذة رفع الصورة/الكاميرا من المغادرة =====
   * فتح نافذة اختيار الملف أو كاميرا الجهاز بتعمل blur/visibilitychange
   * لحظي — وده كان بيتحسب مخالفة ويوصّل الطالب للتسليم التلقائي غلط.
   * المنطق: أي كليك على input[type=file] (أو حدث PICKER_OPEN_EVENT من
   * MathKeyboard) بيعلّق العدّاد فورًا، ولما النافذة ترجع (focus/visible)
   * بنستنى 600ms مهلة أمان ونفك التعليق. حارس صلاحية 5 دقايق عشان
   * التعليق ما يفضلش معلق للأبد لو حدث فات أي حاجة.
   * الطالب اللي هيغش فعلاً هيخرج من نافذة الرفع لتطبيق تاني → الفوكس
   * بيرجع ونفك التعليق → أول blur حقيقي بعدها بيتحسب طبيعي. */
  useEffect(function () {
    if (!active) return
    var onPickerOpen = function () {
      suspendedRef.current = suspendedRef.current + 1
      var done = false
      var finish = function () {
        if (done) return
        done = true
        window.removeEventListener('focus', onBack)
        document.removeEventListener('visibilitychange', onVisBack)
        clearTimeout(safety)
        suspendedRef.current = Math.max(0, suspendedRef.current - 1)
        /* تصفير حارس التكرار عشان أي blur متأخر ما يحسبش */
        lastStrikeAtRef.current = 0
      }
      /* لما النافذة ترجع: مهلة 600ms ثم فك — بغطي إلغاء النافذة واختيار ملف
       * ورجوع الكاميرا على الموبايل (اللي ممكن يخفي الصفحة ثواني طويلة) */
      var onBack = function () { setTimeout(finish, 600) }
      var onVisBack = function () {
        if (document.visibilityState === 'visible') setTimeout(finish, 600)
      }
      /* (2026-و74) مودال الكاميرا اتقفل من غير أي blur حقيقي حصل —
       * نرف التعليق فورًا (بمهلة أمان 600ms) عشان المغادرة الحقيقية
       * اللي بعدها تتحسب طبيعي بدل ما تفضل معلقة للـ5 دقايق */
      var onCloseEvt = function () { setTimeout(finish, 600) }
      var safety = setTimeout(finish, 5 * 60 * 1000)
      window.addEventListener('focus', onBack)
      document.addEventListener('visibilitychange', onVisBack)
      document.addEventListener(PICKER_CLOSE_EVENT, onCloseEvt)
    }
    /* (1) حدث صريح من زرار رفع الصورة/الكاميرا في MathKeyboard */
    document.addEventListener(PICKER_OPEN_EVENT, onPickerOpen)
    /* (2) شبكة أمان: أي كليك على input[type=file] (حتى البرامجي) بيتنشر */
    var onDocClick = function (e: any) {
      try {
        var t = e && e.target
        if (t && t.tagName === 'INPUT' && t.type === 'file') onPickerOpen()
      } catch (err) {}
    }
    document.addEventListener('click', onDocClick, true)
    return function () {
      document.removeEventListener(PICKER_OPEN_EVENT, onPickerOpen)
      document.removeEventListener('click', onDocClick, true)
    }
  }, [active])

  var dismissWarning = useCallback(function () { setWarningOpen(false) }, [])

  return {
    strikes: strikes,
    maxStrikes: MAX_AUTO_SUBMIT_STRIKES,
    penaltyFreeStrikes: PENALTY_FREE_STRIKES,
    penaltyPoints: Math.max(0, strikes - PENALTY_FREE_STRIKES) * 5,
    warningOpen: warningOpen,
    dismissWarning: dismissWarning,
    reset: function () { strikesRef.current = 0; giveUpFiredRef.current = false; setStrikes(0); setWarningOpen(false) },
    /* (2026-و73) تعليق/فك يدوي — متاح لأي UI رفع ملفات جاي */
    suspend: function () { suspendedRef.current = suspendedRef.current + 1 },
    resume: function () { suspendedRef.current = Math.max(0, suspendedRef.current - 1); lastStrikeAtRef.current = 0 },
  }
}

/* مودال التحذير — بيقفل الشاشة لحد ما الطالب يضغط رجعت
   (2026-و76) kindLabel — «الامتحان» افتراضي، والواجب بيتبعت له «الواجب»
   عشان الرسايل تقول «كمّل واجبك» بدل «كمل امتحانك» — الستايل والأنيميشن
   والنقط الأربعة زي ما هي بالظبط */
export function AntiCheatModal({ open, strikes, studentName, kindLabel, onDismiss }: { open: boolean; strikes: number; studentName?: string; kindLabel?: string; onDismiss: () => void }) {
  var first = strikes <= 1
  var kind = kindLabel || 'الامتحان'
  var isHw = kind === 'الواجب'
  var yourThing = isHw ? 'واجبك' : 'امتحانك'
  var theThing = isHw ? 'الواجب' : 'الامتحان'
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          dir="rtl"
        >
          <motion.div
            initial={{ scale: 0.85, y: 24 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 320, damping: 24 }}
            className={`w-full max-w-sm rounded-2xl border-2 p-6 text-center shadow-2xl ${first ? 'bg-card border-amber-400' : 'bg-card border-rose-400'}`}
          >
            <div className="text-5xl mb-3">{first ? '👀' : '⚠️'}</div>
            <h3 className={`text-xl font-black mb-2 ${first ? 'text-amber-600' : 'text-rose-600'}`}>
              {first ? 'رايح فين يا بطل؟' : 'بالتالي بجد!'}
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              {first
                ? 'سيبت ' + kind + ' لحظة! ' + (studentName ? ('يا ' + studentName) : 'يا صاحبي') + ' — كمّل ' + yourThing + '، محدش بيسيب ' + kind + ' في النص 😅'
                : 'دي المغادرة رقم ' + strikes + '. لو عدّيت ' + 4 + ' مغادرات ' + kind + ' هيتسلم لوحده، وكل مغادرة بعد التانية بتفصلك 5 درجات!'}
            </p>
            <div className="flex items-center justify-center gap-1.5 mb-4">
              {[1, 2, 3, 4].map(function (n) {
                return (
                  <span key={n} className={`h-2.5 w-2.5 rounded-full ${n <= strikes ? 'bg-rose-500' : 'bg-muted'}`} />
                )
              })}
            </div>
            <Button onClick={onDismiss} className="w-full h-12 text-base font-bold">
              رجعت أكمل {theThing} 💪
            </Button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

/* شارة المخالفات — بتتحط في هيدر شاشة الحل */
export function AntiCheatBadge({ strikes, maxStrikes }: { strikes: number; maxStrikes: number }) {
  if (strikes <= 0) return null
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/15 border border-rose-500/40 px-2.5 py-1 text-[11px] font-bold text-rose-600 dark:text-rose-400" title="مخالفات مغادرة الامتحان">
      👁 {strikes}/{maxStrikes}
    </span>
  )
}

/* (2026-و73) مساعدة صغيرة — إطلاق حدث فتح نافذة الرفع (زرار الصورة/الكاميرا) */
export function notifyPickerOpen() {
  try { document.dispatchEvent(new CustomEvent(PICKER_OPEN_EVENT)) } catch (e) {}
}

/* (2026-و74) مساعدة — إطلاق حدث قفل مودال الكاميرا/الرفع لرفع التعليق */
export function notifyPickerClose() {
  try { document.dispatchEvent(new CustomEvent(PICKER_CLOSE_EVENT)) } catch (e) {}
}
