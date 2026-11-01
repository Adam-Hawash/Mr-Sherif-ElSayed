/* ============================================================
   نظام اللغة — عربي/إنجليزي حقيقي — طلب صاحب المنصة:
   الإنجليزي هو الافتراضي لأي زائر أول مرة، والتحويل للعربي
   بزرار واحد في النافبار — والاختيار محفوظ في localStorage
   (sh_lang) وبيرجع مع أول تحميل من غير وميض اتجاه غلط
   ============================================================ */
'use client'

import { useEffect } from 'react'
import { create } from 'zustand'

export type Lang = 'ar' | 'en'

var LANG_KEY = 'sh_lang'

function applyToDocument(l: Lang) {
  if (typeof document === 'undefined') return
  document.documentElement.lang = l
  document.documentElement.dir = l === 'en' ? 'ltr' : 'rtl'
}

export function readStoredLang(): Lang {
  if (typeof window === 'undefined') return 'en'
  try {
    var v = window.localStorage.getItem(LANG_KEY)
    if (v === 'en' || v === 'ar') return v
  } catch (e) { /* صامت */ }
  return 'en'
}

interface LangStore {
  lang: Lang
  setLang: (l: Lang) => void
}

export var useLangStore = create<LangStore>(function () {
  return {
    lang: 'en',
    setLang: function (l) {
      try { window.localStorage.setItem(LANG_KEY, l) } catch (e) { /* صامت */ }
      applyToDocument(l)
      useLangStore.setState({ lang: l })
    },
  }
})

/* useT — hook الترجمة: بيسجّل في ستور اللغة، فأي تبديل بيعيد رسم
   المكوّن فورًا. الاستخدام: var T = useT(); T('المجتمع', 'Community') */
export function useT() {
  var lang = useLangStore(function (s) { return s.lang })
  return function (ar: string, en: string): string {
    return lang === 'en' ? en : ar
  }
}

/* t — نسخة بدون hook (للكود اللي مش جوه رندر) — مش بيعيد الرسم لوحده */
export function t(ar: string, en: string): string {
  return useLangStore.getState().lang === 'en' ? en : ar
}

export function currentLang(): Lang {
  return useLangStore.getState().lang
}

/* LangBoot — بيركّب مرة واحدة في layout.tsx: بيقرأ اللغة المحفوظة
   ويطبّق dir/lang على <html> بعد أول تحميل (قبل كده سكريبت الـ head
   بيتكفل بالموضوع قبل الرسم عشان مفيش وميض اتجاه غلط) */
export function LangBoot() {
  useEffect(function () {
    var l = readStoredLang()
    applyToDocument(l)
    useLangStore.setState({ lang: l })
  }, [])
  return null
}
