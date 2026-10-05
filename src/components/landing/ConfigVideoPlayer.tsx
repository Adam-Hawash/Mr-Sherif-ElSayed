'use client'

/* ============================================================
   (Z-5) ConfigVideoPlayer — المشغل الموحد للفيديوهات التعريفية
   ============================================================
   طلب المستر حرفيًا: «عاوز الفيديو على المشغل بتاعنا من غير
   الستريميبل دي». فاللينكات بقت بتتوزع كده:
    • Streamable → بنجيب ملف الـ mp4 المباشر من /api/resolve-video
      (سيرفر-سايد + كاش ساعة) ونشغله على <video> بتاعنا بالحماية
      بتاعتنا (nodownload ومنع كليك يمين) — صفر براندينج ستريمابل.
      لو الـ API فشل نادرًا → آخر حل احتياطي iframe ستريمابل عشان
      ميبقاش صندوق أسود ميفتحش.
    • يوتيوب / جوجل درايف / فيميو / أرشايف → iframe embed الرسمية.
    • ملف مرفوع أو لينك mp4 مباشر → <video> بتاعنا على طول.
   ============================================================ */

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { introEmbedSrc, streamableId } from '@/lib/intro-video'

/* (و102) حماية المشغل بتاعنا: منع زرار التحميل + منع كليك يمين
   + منع picture-in-picture — نفس حماية فيديوهات المنصة بالظبط */
export function videoGuardProps() {
  return {
    controlsList: 'nodownload noremoteplayback' as const,
    disablePictureInPicture: true,
    onContextMenu: function (e: React.MouseEvent) { e.preventDefault() },
  }
}

export function ConfigVideoPlayer({ url, title, className }: { url: string; title?: string; className?: string }) {
  const stId = streamableId(url)
  const [mp4, setMp4] = useState('')
  const [poster, setPoster] = useState('')
  const [failed, setFailed] = useState(false)

  /* ستريمابل → نجيب الملف المباشر مرة واحدة لكل زيارة */
  useEffect(function () {
    if (!stId) return
    var alive = true
    setMp4(''); setPoster(''); setFailed(false)
    fetch('/api/resolve-video?url=' + encodeURIComponent(url))
      .then(function (r) { return r.ok ? r.json() : Promise.reject(new Error('resolve failed')) })
      .then(function (d) {
        if (!alive) return
        if (d && d.ok && d.mp4) { setMp4(String(d.mp4)); setPoster(String(d.poster || '')) }
        else setFailed(true)
      })
      .catch(function () { if (alive) setFailed(true) })
    return function () { alive = false }
  }, [url, stId])

  const boxClass = className || 'w-full h-full'

  /* ستريمابل — مشغلنا أو اللودر أو (نادرًا) الـ embed الاحتياطي */
  if (stId) {
    if (mp4) {
      return (
        <video
          key={mp4}
          src={mp4}
          poster={poster || undefined}
          controls
          preload="metadata"
          playsInline
          {...videoGuardProps()}
          className={boxClass}
        />
      )
    }
    if (failed) {
      /* آخر حل احتياطي لو API ستريمابل وقع — الأولوية للمشغل بتاعنا دايمًا */
      return (
        <iframe
          src={'https://streamable.com/e/' + stId}
          title={title || 'Video'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          className={boxClass}
        />
      )
    }
    return (
      <div className={boxClass + ' flex items-center justify-center bg-black'}>
        <Loader2 className="h-8 w-8 animate-spin text-white/60" />
      </div>
    )
  }

  /* يوتيوب / درايف / فيميو / أرشايف — embed الرسمية */
  const embed = introEmbedSrc(url)
  if (embed) {
    return (
      <iframe
        src={embed}
        title={title || 'Video'}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        loading="lazy"
        className={boxClass}
      />
    )
  }

  /* ملف مرفوع / لينك مباشر — مشغلنا */
  return <video src={url} controls preload="metadata" playsInline {...videoGuardProps()} className={boxClass} />
}

export default ConfigVideoPlayer
