'use client'

/* ============================================================
   زراير عامة في كل المنصة:
   1) الإضاءة الليلية والنهارية — شمس/قمر متاح في كل الصفحات
   2) تبديل اللغة عربي/إنجليزي — وبيترجم فعلًا (شوف lib/i18n.ts)
      سويتش حبتين EN | عربي — المفعّل متعلم عليه بالـ primary
   ============================================================ */

import { useSyncExternalStore } from 'react'
import { useTheme } from 'next-themes'
import { Moon, Sun } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLangStore } from '@/lib/i18n'

var emptySubscribe = function () { return function () {} }
function useMounted() {
  return useSyncExternalStore(emptySubscribe, function () { return true }, function () { return false })
}

/* زرار الإضاءة — شمس/قمر حسب الوضع الحالي */
export function ThemeToggle() {
  var mounted = useMounted()
  var themeRaw = useTheme()
  var theme = themeRaw.theme
  var setTheme = themeRaw.setTheme

  if (!mounted) {
    /* نفس المقاس لحد ما الجاهزية تتحسم — منع اختلاف الـ hydration */
    return <div className="h-9 w-9 shrink-0" aria-hidden="true" />
  }

  return (
    <Button
      variant="outline"
      size="icon"
      className="h-9 w-9 shrink-0"
      onClick={function () { setTheme(theme === 'dark' ? 'light' : 'dark') }}
      title="الإضاءة الليلية والنهارية | Dark / Light mode"
      aria-label="Toggle theme"
    >
      {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
    </Button>
  )
}

/* سويتش اللغة بستايل حبتين EN | عربي — المفعّل متعلم عليه بالـ primary */
export function LangToggle() {
  var lang = useLangStore(function (s) { return s.lang })
  var setLang = useLangStore(function (s) { return s.setLang })

  return (
    <div
      className="inline-flex items-center rounded-full border border-border bg-muted/60 p-0.5 text-[11px] font-bold shrink-0"
      role="group"
      aria-label="Language / اللغة"
    >
      <button
        type="button"
        onClick={function () { setLang('en') }}
        aria-pressed={lang === 'en'}
        className={'rounded-full px-2 sm:px-2.5 py-1 transition-colors cursor-pointer ' + (lang === 'en' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >
        EN
      </button>
      <button
        type="button"
        onClick={function () { setLang('ar') }}
        aria-pressed={lang === 'ar'}
        className={'rounded-full px-2 sm:px-2.5 py-1 transition-colors cursor-pointer ' + (lang === 'ar' ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}
      >
        عربي
      </button>
    </div>
  )
}

/* الاتنين جاهزين جنب بعض — للحاجة في أي هيدر */
export function PlatformToggles() {
  return (
    <div className="flex items-center gap-1.5">
      <ThemeToggle />
      <LangToggle />
    </div>
  )
}
