'use client'

// ============================================================
// (2026-و110) طلب المستر: «ما فيش اي زرار تطبيق جنب الدليل» — السبب الحقيقي:
// الزرار كان بيتخفي نهائيًا لو localStorage فيها mg-pwa-installed=1 —
// والمستر كان ثبّت التطبيق من قبل، فالعلامة قعدت في متصفحه حتى بعد ما
// بيمسح التطبيق — فالزرار عمره ما رجع يظهر عنده.
// الحل النهائي: **الزرار ظاهر دايمًا في كل الحالات من غير أي استثناء**
// (لا localStorage ولا standalone بيخفياه).
// الضغطة عليه:
//   1) المتصفح جاهز للتثبيت → نافذة التثبيت الرسمية فورًا — تدوس تثبيت وخلاص
//   2) التطبيق متثبت فعلًا على الجهاز → رسالة «مثبت بالفعل» (بدل كلام فاضي)
//   3) غير كده (آيفون/متصفح مؤجل) → تعليمات قصيرة خطوة بخطوة
// (2026-و111) النصوص بقت ثنائية اللغة عربي/إنجليزي — المستر بيفتح المنصة EN
// ============================================================
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smartphone, X, Download } from 'lucide-react'
import { toast } from 'sonner'
import { useT } from '@/lib/i18n'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* منطق التثبيت المشترك — نفس الحالة للأزرار كلها (الهيدر/القايمة/العايم) */
function usePwaInstall() {
  var T = useT()
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [standalone, setStandalone] = useState(false)
  const [showHint, setShowHint] = useState(false)

  useEffect(function () {
    var alone = false
    try {
      alone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    } catch (e) {}
    setStandalone(alone)
    var ua = String(window.navigator.userAgent || '')
    setIsIos(/iphone|ipad|ipod/i.test(ua))
    var handler = function (e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return function () {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  var alreadyInstalledToast = function () {
    toast.success(T('التطبيق مثبت عندك بالفعل ✅', 'The app is already installed ✅'), {
      description: T('افتح المنصة من أيقونة التطبيق على شاشتك', 'Open the platform from the app icon on your screen'),
    })
  }

  var install = async function () {
    /* 1) المتصفح جاهز → نافذة التثبيت الرسمية فورًا — من غير أي خطوات يدوية */
    if (deferred) {
      try {
        toast.info(T('تثبيت التطبيق — بنفتحلك نافذة التثبيت…', 'Installing the app — opening the install window…'), {
          description: T('دوس تثبيت / Install وأيقونة التطبيق هتنزل على شاشتك', 'Tap Install and the app icon will be added to your screen'),
        })
        await deferred.prompt()
        var choice = await deferred.userChoice
        if (choice.outcome === 'accepted') {
          toast.success(T('تم تثبيت التطبيق بنجاح 🎉', 'App installed successfully 🎉'), {
            description: T('افتح المنصة من أيقونة التطبيق — شاشة كاملة من غير متصفح', 'Open the platform from the app icon — full screen, no browser'),
          })
        }
      } catch (e) {}
      return
    }
    /* 2) التطبيق متثبت فعلًا (WebAPK/standalone) → رسالة واضحة بدل التعليمات */
    try {
      var nav = window.navigator as any
      if (typeof nav.getInstalledRelatedApps === 'function') {
        var related = await nav.getInstalledRelatedApps()
        if (related && related.length > 0) {
          alreadyInstalledToast()
          return
        }
      }
    } catch (e) {}
    if (standalone) {
      alreadyInstalledToast()
      return
    }
    /* 3) آخر حل — تعليمات قصيرة (آيفون أساسًا لأن أبل مش بتسمح بتثبيت تلقائي) */
    setShowHint(true)
  }

  return { isIos: isIos, standalone: standalone, showHint: showHint, setShowHint: setShowHint, install: install }
}

/* مودال التعليمات — بيظهر بس لما المتصفح مش قادر يفتح نافذة التثبيت بنفسه */
function InstallHintModal({ isIos, onClose }: { isIos: boolean; onClose: () => void }) {
  var T = useT()
  return (
    <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-3" onClick={function (e) { e.stopPropagation() }}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">{T('تثبيت التطبيق', 'Install the App')}</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label={T('إغلاق', 'Close')}><X className="h-4 w-4" /></button>
        </div>
        {isIos ? (
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
            <li>{T('افتح المنصة في Safari (لو فاتحها من كروم افتحها في Safari)', 'Open the platform in Safari (if you are using Chrome, switch to Safari)')}</li>
            <li>{T('دوس على زرار المشاركة', 'Tap the Share button')} <span className="font-bold text-foreground">⬆️</span> {T('تحت في النص', 'at the bottom middle')}</li>
            <li>{T('انزل تحت ودوس', 'Scroll down and tap')} <span className="font-bold text-foreground">{T('إضافة إلى الشاشة الرئيسية', 'Add to Home Screen')}</span></li>
            <li>{T('دوس', 'Tap')} <span className="font-bold text-foreground">{T('إضافة', 'Add')}</span> — {T('والتطبيق هيظهر على شاشة الموبايل', 'and the app will appear on your home screen')}</li>
          </ol>
        ) : (
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
            <li>{T('دوس على قائمة المتصفح', 'Open the browser menu')} <span className="font-bold text-foreground">⋮</span> {T('فوق جنب العنوان', 'next to the address bar')}</li>
            <li>{T('اختار', 'Choose')} <span className="font-bold text-foreground">{T('تثبيت التطبيق', 'Install app')}</span> {T('أو', 'or')} <span className="font-bold text-foreground">{T('إضافة إلى الشاشة الرئيسية', 'Add to Home Screen')}</span></li>
            <li>{T('دوس', 'Tap')} <span className="font-bold text-foreground">{T('تثبيت', 'Install')}</span> — {T('والتطبيق هيظهر على شاشة الموبايل', 'and the app will appear on your home screen')}</li>
          </ol>
        )}
        <p className="text-[11px] text-muted-foreground">{T('بعد التثبيت افتح المنصة من أيقونة التطبيق مباشرة — شاشة كاملة من غير متصفح', 'After installing, open the platform directly from the app icon — full screen, no browser')}</p>
      </div>
    </div>
  )
}

/* (2026-و110) زر عادي بيتركب في الهيدر/القايمة/فسحة الطالب
   — ظاهر دايمًا في كل الحالات، والافتراضي اسمه «التطبيق» زي طلب المستر */
export function InstallPwaButton({ variant = 'default', size, className = '', label }: { variant?: 'default' | 'outline' | 'ghost' | 'secondary'; size?: 'default' | 'sm' | 'lg' | 'icon'; className?: string; label?: string }) {
  var pwa = usePwaInstall()
  var T = useT()
  var finalLabel = label !== undefined && label !== null && label !== '' ? label : T('التطبيق', 'App')
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={pwa.install} aria-label={T('ثبّت المنصة كتطبيق على جهازك', 'Install the platform as an app on your device')}>
        <Smartphone className="h-4 w-4 ml-1.5" />
        <span>{finalLabel}</span>
      </Button>
      {pwa.showHint && <InstallHintModal isIos={pwa.isIos} onClose={function () { pwa.setShowHint(false) }} />}
    </>
  )
}

/* (2026-و109) الزرار العايم الثابت — شمال تحت في كل الصفحات حتى مع النزول
   (2026-و110) بقى ظاهر دايمًا كمان — مفيش حالة بيختفي فيها خالص */
export function FloatingInstallButton() {
  var pwa = usePwaInstall()
  var T = useT()
  return (
    <>
      <button
        onClick={pwa.install}
        aria-label={T('ثبّت المنصة كتطبيق على جهازك', 'Install the platform as an app on your device')}
        className="fixed z-[90] left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-xl border border-primary/30 pl-4 pr-3.5 min-h-[44px] font-bold text-sm hover:shadow-2xl hover:scale-[1.04] active:scale-95 transition-all"
      >
        <Download className="h-4 w-4 animate-pulse" />
        {T('ثبّت التطبيق', 'Install App')}
      </button>
      {pwa.showHint && <InstallHintModal isIos={pwa.isIos} onClose={function () { pwa.setShowHint(false) }} />}
    </>
  )
}
