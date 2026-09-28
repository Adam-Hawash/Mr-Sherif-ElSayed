'use client'

// ============================================================
// (2026-و107) إشعار تثبيت المنصة كتطبيق — بطلب المستر:
// «تظهر في الصفحة الرئيسية وتظهر للطالب — يدخل أول مرة يجيله
//  إشعار ثبت التطبيق باسم المنصة»
// - بيظهر في كل الصفحات (مركّب في layout.tsx): الرئيسية + الطالب + الأدمن
// - أول زيارة → كارت لطيف تحت باسم المنصة وزرار تثبيت مباشر
// - Android/Chrome: beforeinstallprompt → تثبيت بضغطة
// - iOS: تعليمات «إضافة إلى الشاشة الرئيسية»
// - بعد الإغلاق يختفي ٧ أيام، وبعد التثبيت يختفي للأبد
// ============================================================
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smartphone, X, Sparkles } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

var DISMISS_DAYS = 7
var RESHOW_DAYS = 3

export function PwaInstallBanner({ appName }: { appName: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [isIos, setIsIos] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)

  useEffect(function () {
    var installed = false
    try { installed = localStorage.getItem('mg-pwa-installed') === '1' } catch (e) {}
    if (installed) return
    var standalone = false
    try {
      standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    } catch (e) {}
    if (standalone) return
    /* مخفي مؤقتًا بعد الإغلاق (٧ أيام) — ويظهر تاني كل ٣ أيام لو لسه مثبتش */
    try {
      var rec = JSON.parse(localStorage.getItem('pwa-banner-v1') || '{}')
      var now = Date.now()
      if (rec.dismissedAt && (now - rec.dismissedAt) < DISMISS_DAYS * 24 * 3600 * 1000) return
      if (rec.shownAt && (now - rec.shownAt) < RESHOW_DAYS * 24 * 3600 * 1000) return
    } catch (e) {}
    var ua = String(window.navigator.userAgent || '')
    var ios = /iphone|ipad|ipod/i.test(ua)
    setIsIos(ios)
    var handler = function (e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setTimeout(function () { setVisible(true); markShown() }, 3000)
    }
    window.addEventListener('beforeinstallprompt', handler)
    /* iOS ومتصفحات من غير الحدث: نظهر بعد مهلة قصيرة بأزرار التعليمات */
    var t = setTimeout(function () {
      setVisible(true)
      markShown()
    }, 4500)
    function markShown() {
      try {
        localStorage.setItem('pwa-banner-v1', JSON.stringify({ shownAt: Date.now() }))
      } catch (e) {}
    }
    var installedHandler = function () {
      try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
      setVisible(false)
    }
    window.addEventListener('appinstalled', installedHandler)
    return function () {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', installedHandler)
      clearTimeout(t)
    }
  }, [])

  var dismiss = function () {
    setVisible(false)
    try {
      localStorage.setItem('pwa-banner-v1', JSON.stringify({ dismissedAt: Date.now() }))
    } catch (e) {}
  }

  var install = async function () {
    if (deferred) {
      try {
        await deferred.prompt()
        var choice = await deferred.userChoice
        if (choice.outcome === 'accepted') {
          try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
          setVisible(false)
        }
      } catch (e) {}
      return
    }
    setShowIosHint(true)
  }

  if (!visible) return null

  return (
    <>
      <div
        role="dialog"
        aria-label={'تثبيت تطبيق ' + appName}
        className="fixed bottom-4 inset-x-4 sm:inset-x-auto sm:right-4 sm:max-w-sm z-[94] rounded-2xl border bg-card shadow-2xl p-4 space-y-3"
        style={{ boxShadow: '0 12px 40px -8px rgba(0,0,0,0.35)' }}
      >
        <div className="flex items-start gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
            <Smartphone className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-amber-500" />
              جديد — ثبّت تطبيق {appName}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">افتح المنصة من أيقونة على شاشة موبايلك مباشرة — شاشة كاملة من غير متصفح</p>
          </div>
          <button onClick={dismiss} className="text-muted-foreground hover:text-foreground shrink-0" aria-label="إغلاق إشعار التثبيت">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1 h-9" onClick={install}>
            <Smartphone className="h-4 w-4 ml-1.5" />
            تثبيت الآن
          </Button>
          <Button size="sm" variant="ghost" className="h-9" onClick={dismiss}>مش الآن</Button>
        </div>
      </div>
      {showIosHint && (
        <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={function () { setShowIosHint(false) }}>
          <div className="bg-card w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-3" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm">تثبيت {appName} على الموبايل</p>
              <button onClick={function () { setShowIosHint(false) }} className="text-muted-foreground hover:text-foreground" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>
            <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
              <li>على الآيفون: افتح المنصة في Safari</li>
              <li>دوس على زرار المشاركة <span className="font-bold text-foreground">⬆️</span> تحت في النص</li>
              <li>انزل ودوس <span className="font-bold text-foreground">Add to Home Screen / إضافة إلى الشاشة الرئيسية</span></li>
              <li>دوس <span className="font-bold text-foreground">Add / إضافة</span> — وهتبقى أيقونة التطبيق على الشاشة</li>
              <li>على أندرويد (كروم): قايمة النقاط ⋮ ثم <span className="font-bold text-foreground">تثبيت التطبيق</span></li>
            </ol>
            <p className="text-[11px] text-muted-foreground">بعد التثبيت افتحها من الأيقونة مباشرة — شاشة كاملة من غير متصفح</p>
          </div>
        </div>
      )}
    </>
  )
}
