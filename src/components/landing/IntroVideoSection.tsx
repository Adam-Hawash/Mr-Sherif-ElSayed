'use client'

/* ============================================================
   (ص119) الفيديو التعريفي — إزاي تستخدم المنصة
   نفس ميزة Zicola-Math بالظبط (مرجع الميزة): المفتاح في SiteConfig
   هو intro_video_url (لينك يوتيوب/درايف/فيميو/ستريمابل/أرشايف أو
   ملف مرفوع من الجهاز) — ولو فاضي القسم مش بيظهر خالص من الـ DOM
   (لا صندوق فاضي ولا placeholder).
   العرض كله على المشغل الموحد ConfigVideoPlayer: ستريمابل بيتشغل
   على مشغلنا من غير براندينج، ويوتيوب/درايف/فيميو بـ embed،
   والملفات بـ <video> بتاعنا بحماية nodownload ومنع كليك يمين.
   الألوان بهوية منصة مستر شريف (خلفية الهيرو #12121F + برتقالي #F97316).
   ============================================================ */

import { useEffect, useState } from 'react'
import { PlayCircle } from 'lucide-react'
import { useAppStore } from '@/stores/app-store'
import { useT } from '@/lib/i18n'
import { introVideoKind } from '@/lib/intro-video'
import { ConfigVideoPlayer } from '@/components/landing/ConfigVideoPlayer'

export function IntroVideoSection() {
  const T = useT()
  var siteConfig = useAppStore(function (s) { return s.siteConfig })
  var setSiteConfig = useAppStore(function (s) { return s.setSiteConfig })
  var configLoaded = useAppStore(function (s) { return s.configLoaded })
  const [url, setUrl] = useState('')

  /* نفس آلية قراءة الكونفيج في باقي سكاشن المنصة:
     كاش سيرفر-سايد __INITIAL_CONFIG__ + fetch احتياطي لو الستور فاضي */
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
    setUrl(String((cfg as any)?.intro_video_url || '').trim())
  }, [cfg])

  /* إخفاء شرطي: مفيش فيديو → مفيش سكشن أصلًا في الـ DOM */
  const kind = introVideoKind(url)
  if (kind === 'none') return null

  return (
    <section id="intro" className="relative py-10 sm:py-14 bg-[#12121F] border-t border-white/5" dir="rtl">
      <div className="mx-auto max-w-4xl px-4 sm:px-6">
        <div className="text-center mb-6">
          <span className="inline-flex items-center gap-2 rounded-full bg-[#F97316]/15 px-4 py-1.5 text-sm font-medium text-[#FFD9B8] border border-[#F97316]/25">
            <PlayCircle className="h-4 w-4" />
            {T('الفيديو التعريفي', 'Intro Video')}
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold text-white">
            {T('اتعرف على المنصة في دقائق', 'Get to know the platform in minutes')}
          </h2>
        </div>

        <div className="relative rounded-2xl overflow-hidden border-2 border-[#F97316]/30 shadow-2xl bg-black">
          <div className="aspect-video">
            <ConfigVideoPlayer url={url} title={T('الفيديو التعريفي', 'Intro Video')} />
          </div>
        </div>
      </div>
    </section>
  )
}

export default IntroVideoSection
