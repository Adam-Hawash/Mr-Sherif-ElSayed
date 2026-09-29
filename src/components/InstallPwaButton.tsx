'use client'

// ============================================================
// (2026-و106) زر تثبيت المنصة كتطبيق على الموبايل/الكمبيوتر — PWA
// بيظهر أول ما المتصفح يبقى جاهز للتثبيت (beforeinstallprompt)
// وفي iOS يعرض تعليمات «إضافة إلى الشاشة الرئيسية» يدويًا.
// بعد التثبيت بيختفي للأبد (localStorage) والمنصة بتفتح كتطبيق
// شاشة كاملة من غير بار المتصفح — بدل ما الطالب يدخل من جوجل كل مرة.
// ============================================================
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smartphone, X } from 'lucide-react'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function InstallPwaButton({ variant = 'default', size, className = '' }: { variant?: 'default' | 'outline' | 'ghost' | 'secondary'; size?: 'default' | 'sm' | 'lg' | 'icon'; className?: string }) {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [showIosHint, setShowIosHint] = useState(false)
  const [hidden, setHidden] = useState(true)

  useEffect(function () {
    try {
      if (localStorage.getItem('mg-pwa-installed') === '1') return
    } catch (e) {}
    var standalone = false
    try {
      standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    } catch (e) {}
    if (standalone) return
    var ua = String(window.navigator.userAgent || '')
    var ios = /iphone|ipad|ipod/i.test(ua)
    setIsIos(ios)
    var handler = function (e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setHidden(false)
    }
    window.addEventListener('beforeinstallprompt', handler)
    // على iOS مفيش حدث تثبيت — نظهر الزر ومعه تعليمات يدوية (بعد مهلة قصيرة)
    if (ios) {
      var t = setTimeout(function () { setHidden(false) }, 2500)
    }
    return function () {
      window.removeEventListener('beforeinstallprompt', handler)
      if (ios) clearTimeout(t)
    }
  }, [])

  useEffect(function () {
    var handler = function () {
      try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
      setHidden(true)
    }
    window.addEventListener('appinstalled', handler)
    return function () { window.removeEventListener('appinstalled', handler) }
  }, [])

  var install = async function () {
    if (deferred) {
      try {
        await deferred.prompt()
        var choice = await deferred.userChoice
        if (choice.outcome === 'accepted') {
          try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
          setHidden(true)
        }
      } catch (e) {}
      return
    }
    if (isIos) { setShowIosHint(true) }
  }

  if (hidden) return null

  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={install} aria-label="ثبّت المنصة كتطبيق على جهازك">
        <Smartphone className="h-4 w-4 ml-1.5" />
        <span className="hidden sm:inline">ثبّت التطبيق</span>
      </Button>
      {showIosHint && (
        <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={function () { setShowIosHint(false) }}>
          <div className="bg-card w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-3" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-sm">تثبيت المنصة على الآيفون</p>
              <button onClick={function () { setShowIosHint(false) }} className="text-muted-foreground hover:text-foreground" aria-label="إغلاق"><X className="h-4 w-4" /></button>
            </div>
            <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
              <li>افتح المنصة في Safari (لو فاتحها من كروم افتحها في Safari)</li>
              <li>دوس على زرار المشاركة <span className="font-bold text-foreground">⬆️</span> تحت في النص</li>
              <li>انزل تحت ودوس <span className="font-bold text-foreground">Add to Home Screen / إضافة إلى الشاشة الرئيسية</span></li>
              <li>دوس <span className="font-bold text-foreground">Add / إضافة</span> — والمنصة هتبقى أيقونة تطبيق على شاشة الموبايل</li>
            </ol>
            <p className="text-[11px] text-muted-foreground">بعد التثبيت افتحها من الأيقونة مباشرة — شاشة كاملة من غير متصفح</p>
          </div>
        </div>
      )}
    </>
  )
}
