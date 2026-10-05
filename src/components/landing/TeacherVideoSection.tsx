'use client'

/* ============================================================
   (ص119) فيديو تعريف المستر — نفس ميزة Zicola-Math بالظبط:
   المفتاح في SiteConfig هو teacher_video_url (نفس منطق intro_video_url)
   وبيظهر قبل قسم المعرض في الصفحة الرئيسية — فاضي = القسم مخفي
   تمامًا من الـ DOM. العرض على المشغل الموحد ConfigVideoPlayer.
   الألوان بهوية منصة مستر شريف (خلفية الهيرو #12121F + برتقالي #F97316).
   ============================================================ */

import { useEffect, useState } from 'react'
import { GraduationCap } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useT } from '@/lib/i18n'
import { introVideoKind } from '@/lib/intro-video'
import { ConfigVideoPlayer } from '@/components/landing/ConfigVideoPlayer'

export function TeacherVideoSection() {
  const T = useT()
  var siteConfig = useAppStore(function (s) { return s.siteConfig })
  var setSiteConfig = useAppStore(function (s) { return s.setSiteConfig })
  var configLoaded = useAppStore(function (s) { return s.configLoaded })
  const [url, setUrl] = useState('')

  /* نفس آلية قراءة الكونفيج في باقي سكاشن المنصة */
  var initialCfg = (typeof window !== 'undefined' && (window as any).__INITIAL_CONFIG__) || {}
  var cfg = configLoaded ? siteConfig : (Object.keys(siteConfig).length > 0 ? siteConfig : initialCfg)

  useEffect(function () {
    if (!configLoaded && Object.keys(siteConfig).length === 0) {
      fetch('/api/config')
        .then(function (r) { return r.json() })
        .then(function (data) {
          if (data && data.error && data.defaults) data = data.defaults
          setSiteConfig(data)
          useAppStore.getState().setConfigLoaded(true)
        })
        .catch(function () {})
    }
  }, [configLoaded, siteConfig, setSiteConfig])

  useEffect(function () {
    setUrl(String((cfg as any)?.teacher_video_url || '').trim())
  }, [cfg])

  /* مفيش فيديو → مفيش سكشن أصلًا في الـ DOM (زي IntroVideoSection) */
  const kind = introVideoKind(url)
  if (kind === 'none') return null

  return (
    <section id="teacher-video" className="relative py-10 sm:py-14 bg-[#12121F] border-t border-white/5" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#F97316]/15 px-4 py-1.5 text-sm font-medium text-[#FFD9B8] border border-[#F97316]/25">
            <GraduationCap className="h-4 w-4" />
            {T('فيديو عن المستر', 'About the Teacher')}
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-white">
            {T('تعرّف على مستر شريف', 'Get to know Mr. Sherif')}
          </h2>
        </div>

        <div className="relative rounded-2xl overflow-hidden border-2 border-[#F97316]/30 shadow-2xl bg-black">
          <div className="aspect-video">
            <ConfigVideoPlayer url={url} title={T('فيديو عن المستر', 'About the Teacher')} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default TeacherVideoSection
