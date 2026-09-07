'use client'

// ============================================================
// SecurePlayerModal — مشغّل الدروس الآمن (نظام التذاكر)
// ============================================================
// مفيش أي معرف يوتيوب أو رابط ملف بييجي للصفحة دي خالص:
//  - الفتح بيطلب تذكرة واحدة الاستخدام من /api/video-ticket
//  - التذكرة بتفتح /api/player/[ticket] — صفحة المشغل المحمية اللي
//    السيرفر هو اللي بيبنيها (تشويش للـ ID + ووترمارك ذكي + حماية فحص
//    + ملء شاشة الووترمارك فضاهر + تقدم بيتقال بـ postMessage)
//  - الأب بيسمع رسائل التقدم وبيحفظها في /api/video-progress
// ============================================================
import { useEffect, useRef, useState } from 'react'
import { X, Loader2, ShieldCheck } from 'lucide-react'

export function SecurePlayerModal({
  ticket,
  title,
  poster,
  videoId,
  studentId,
  onWatch,
  onClose,
}: {
  ticket: string
  title?: string
  poster?: string
  videoId?: string
  studentId?: string
  onWatch?: () => void
  onClose: () => void
}) {
  var rs = useState(-1) // resume seconds — -1 = لسه بيجيب
  var resume = rs[0]
  var setResume = rs[1]
  var onWatchRef = useRef(onWatch)
  useEffect(function () { onWatchRef.current = onWatch }, [onWatch])

  // مكان وصلناه آخر مرة → نبدأ من هناك
  useEffect(function () {
    var alive = true
    if (!studentId || !videoId) { setResume(0); return }
    fetch('/api/video-progress?studentId=' + encodeURIComponent(studentId) + '&videoId=' + encodeURIComponent(videoId))
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!alive) return
        var rows = (d && d.progress) || []
        var w = rows.length ? Number(rows[0].watchedSeconds) || 0 : 0
        setResume(w > 5 ? w : 0)
      })
      .catch(function () { if (alive) setResume(0) })
    return function () { alive = false }
  }, [studentId, videoId])

  // استقبال التقدم من صفحة المشغل المحمية + الحفظ
  useEffect(function () {
    var onMsg = function (ev: MessageEvent) {
      var d: any = ev.data
      if (!d || (d.type !== 'mg_vp' && d.type !== 'mg_ended')) return
      if (videoId && d.videoId && d.videoId !== videoId) return
      if (!studentId || !videoId) return
      if (d.type === 'mg_ended') {
        fetch('/api/video-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, videoId, watchedSeconds: 999999, totalSeconds: 1 }),
        }).catch(function () {})
        if (onWatchRef.current) onWatchRef.current()
      } else if (d.type === 'mg_vp' && d.cur > 0) {
        fetch('/api/video-progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId, videoId, watchedSeconds: d.cur, totalSeconds: d.dur || 0 }),
        }).catch(function () {})
      }
    }
    window.addEventListener('message', onMsg)
    return function () { window.removeEventListener('message', onMsg) }
  }, [studentId, videoId])

  // ESC يقفل + منع scroll الخلفية
  useEffect(function () {
    var onKey = function (e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    var prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return function () {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  var src = '/api/player/' + encodeURIComponent(ticket)
  if (resume > 5) src += '?resume=' + encodeURIComponent(String(Math.floor(resume)))

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/95 flex items-center justify-center p-2 sm:p-4"
      onClick={onClose}
      onContextMenu={function (e) { e.preventDefault() }}
    >
      {/* زرار القفل — ثابت فوق يمين زي مودال المعرض */}
      <button
        type="button"
        aria-label="إغلاق"
        className="fixed top-4 right-4 z-[200] min-h-[48px] min-w-[48px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
        onClick={function (e) { e.stopPropagation(); onClose() }}
        onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); onClose() }}
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden" onClick={function (e) { e.stopPropagation() }}>
        {poster && resume === -1 && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={poster} alt={title || 'Video'} className="absolute inset-0 w-full h-full object-cover opacity-60" />
        )}
        {resume === -1 ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/60">
            <Loader2 className="h-8 w-8 animate-spin text-white/80" />
            <p className="text-white/70 text-xs flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" />جاري فتح المشغل الآمن...</p>
          </div>
        ) : (
          <iframe
            src={src}
            title={title || 'مشغل آمن'}
            className="absolute inset-0 w-full h-full"
            allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
            allowFullScreen
            style={{ border: 'none' }}
          />
        )}
        {title && (
          <div className="absolute -bottom-8 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/80 text-xs truncate px-4">{title}</p>
          </div>
        )}
      </div>
    </div>
  )
}
