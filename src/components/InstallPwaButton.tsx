'use client'

// ============================================================
// (2026-و106) زر تثبيت المنصة كتطبيق على الموبايل/الكمبيوتر — PWA
// (2026-و108) الزر بقى ظاهر دايمًا بنصه «ثبّت التطبيق» — مش محتاج
// إشارة beforeinstallprompt عشان يظهر. الضغطة عليه:
//   - لو المتصفح جاهز للتثبيت → نافذة التثبيت الرسمية فورًا
//   - غير كده (آيفون/متصفح مؤجل) → تعليمات واضحة خطوة بخطوة
// (2026-و109) طلب المستر: «خلي الزرار ثابت» — FloatingInstallButton
// زرار عايم مثبت على الشاشة (شمال تحت) في كل الصفحات حتى مع النزول —
// وبيختفي بس لما التثبيت يتم فعليًا.
// ============================================================
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Smartphone, X, Download } from 'lucide-react'
import { toast } from 'sonner'

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

/* منطق التثبيت المشترك — نفس الحالة للأزرار كلها (الهيدر/القايمة/العايم) */
function usePwaInstall() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [isIos, setIsIos] = useState(false)
  const [installed, setInstalled] = useState(false)
  const [showHint, setShowHint] = useState(false)

  useEffect(function () {
    var standalone = false
    try {
      standalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone === true
    } catch (e) {}
    try {
      if (localStorage.getItem('mg-pwa-installed') === '1') standalone = true
    } catch (e) {}
    setInstalled(standalone)
    var ua = String(window.navigator.userAgent || '')
    setIsIos(/iphone|ipad|ipod/i.test(ua))
    var handler = function (e: Event) {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
    }
    window.addEventListener('beforeinstallprompt', handler)
    var done = function () {
      try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
      setInstalled(true)
    }
    window.addEventListener('appinstalled', done)
    return function () {
      window.removeEventListener('beforeinstallprompt', handler)
      window.removeEventListener('appinstalled', done)
    }
  }, [])

  var install = async function () {
    if (deferred) {
      try {
        /* (2026-و109) طلب المستر: رسالة/إشعار «تثبيت التطبيق» قبل فتح النافذة الرسمية */
        toast.info('تثبيت التطبيق — بنفتحلك نافذة التثبيت…', { description: 'دوس تثبيت/Install وأهم إيقونة التطبيق هتنزل على شاشتك' })
        await deferred.prompt()
        var choice = await deferred.userChoice
        if (choice.outcome === 'accepted') {
          try { localStorage.setItem('mg-pwa-installed', '1') } catch (e) {}
          setInstalled(true)
          toast.success('تم تثبيت التطبيق بنجاح 🎉', { description: 'افتح المنصة من أيقونة التطبيق — شاشة كاملة من غير متصفح' })
        }
      } catch (e) {}
      return
    }
    setShowHint(true)
  }

  return { isIos: isIos, installed: installed, showHint: showHint, setShowHint: setShowHint, install: install }
}

/* مودال التعليمات — آيفون: Safari + مشاركة / أندرويد: قائمة كروم */
function InstallHintModal({ isIos, onClose }: { isIos: boolean; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[95] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-4" onClick={onClose}>
      <div className="bg-card w-full max-w-sm rounded-2xl border shadow-2xl p-5 space-y-3" onClick={function (e) { e.stopPropagation() }}>
        <div className="flex items-center justify-between">
          <p className="font-bold text-sm">تثبيت التطبيق</p>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="إغلاق"><X className="h-4 w-4" /></button>
        </div>
        {isIos ? (
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
            <li>افتح المنصة في Safari (لو فاتحها من كروم افتحها في Safari)</li>
            <li>دوس على زرار المشاركة <span className="font-bold text-foreground">⬆️</span> تحت في النص</li>
            <li>انزل تحت ودوس <span className="font-bold text-foreground">Add to Home Screen / إضافة إلى الشاشة الرئيسية</span></li>
            <li>دوس <span className="font-bold text-foreground">Add / إضافة</span> — والتطبيق هيظهر على شاشة الموبايل</li>
          </ol>
        ) : (
          <ol className="text-sm space-y-2 text-muted-foreground list-decimal pr-5">
            <li>دوس على قائمة كروم <span className="font-bold text-foreground">⋮</span> (النقط التلاتة) فوق جنب العنوان</li>
            <li>اختار <span className="font-bold text-foreground">تثبيت التطبيق / Install app</span> أو <span className="font-bold text-foreground">إضافة إلى الشاشة الرئيسية</span></li>
            <li>دوس <span className="font-bold text-foreground">تثبيت / Install</span> — والتطبيق هيظهر على شاشة الموبايل</li>
          </ol>
        )}
        <p className="text-[11px] text-muted-foreground">بعد التثبيت افتح المنصة من أيقونة التطبيق مباشرة — شاشة كاملة من غير متصفح</p>
      </div>
    </div>
  )
}

/* زر عادي بيتركب في الهيدر/القايمة — زي ما هو من و106 */
export function InstallPwaButton({ variant = 'default', size, className = '', label = 'ثبّت التطبيق' }: { variant?: 'default' | 'outline' | 'ghost' | 'secondary'; size?: 'default' | 'sm' | 'lg' | 'icon'; className?: string; label?: string }) {
  var pwa = usePwaInstall()
  if (pwa.installed) return null
  return (
    <>
      <Button variant={variant} size={size} className={className} onClick={pwa.install} aria-label="ثبّت المنصة كتطبيق على جهازك">
        <Smartphone className="h-4 w-4 ml-1.5" />
        <span>{label}</span>
      </Button>
      {pwa.showHint && <InstallHintModal isIos={pwa.isIos} onClose={function () { pwa.setShowHint(false) }} />}
    </>
  )
}

/* (2026-و109) الزرار العايم الثابت — طلب المستر الحرفي: «خلي الزرار ثابت»
   مثبت شمال تحت في كل الصفحات حتى مع النزول، وباحترام safe-area للآيفون،
   وبيختفي بس بعد التثبيت الفعلي */
export function FloatingInstallButton() {
  var pwa = usePwaInstall()
  if (pwa.installed) return null
  return (
    <>
      <button
        onClick={pwa.install}
        aria-label="ثبّت المنصة كتطبيق على جهازك"
        className="fixed z-[90] left-4 bottom-[calc(1rem+env(safe-area-inset-bottom))] flex items-center gap-2 rounded-full bg-primary text-primary-foreground shadow-xl border border-primary/30 pl-4 pr-3.5 min-h-[44px] font-bold text-sm hover:shadow-2xl hover:scale-[1.04] active:scale-95 transition-all"
      >
        <Download className="h-4 w-4 animate-pulse" />
        ثبّت التطبيق
      </button>
      {pwa.showHint && <InstallHintModal isIos={pwa.isIos} onClose={function () { pwa.setShowHint(false) }} />}
    </>
  )
}
