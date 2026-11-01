'use client'

/* ============================================================
   (ز20) مزوّد اتجاه Radix — إصلاح «الترتيب المعكوس» في لوحة التحكم
   ============================================================
   مكوّنات Radix (التابات/القوائم/الدايلوجات) بتطلع dir="ltr" مرشم
   عليها من المكتبة نفسها لما ميبقاش DirectionProvider — فجذر <Tabs>
   بيتقلب LTR جوه صفحة RTL وشكل التابات بيطلع معكوس (أول تاب على
   الشمال بدل اليمين). الحل: DirectionProvider حوالين المنصة كلها
   بياخد اتجاهه من ستور اللغة (نفس مصدر سكريبت الـ head وLangBoot). */
import * as React from 'react'
import { DirectionProvider } from '@radix-ui/react-direction'
import { useLangStore } from '@/lib/i18n'

export function RadixDirection({ children }: { children: React.ReactNode }) {
  var lang = useLangStore(function (s: { lang: 'ar' | 'en' }) { return s.lang })
  return (
    <DirectionProvider dir={lang === 'en' ? 'ltr' : 'rtl'}>
      {children}
    </DirectionProvider>
  )
}
