'use client'
// ============================================================
// ProtectedFilePlayer — مشغّل الفيديوهات المرفوعة من الجهاز (محمي)
// ============================================================
// يستخدم في: بوابة الطالب (VideosTab) + صفحة الفيديو /videos/[id]
//
// المميزات (بطلب المستر):
//  - ووترمارك الطالب (رقمه المسجل + اسمه) جوه عنصر ملء الشاشة نفسه
//    → تفضل ظاهرة في الـ fullscreen (كانت بتختفي — دي كانت المشكلة)
//  - مفيش native controls خالص → مفيش زرار تحميل ولا fullscreen أصلي
//    بيطلع من غير الووترمارك
//  - iOS Safari (مفيش element-fullscreen) → fake fullscreen بالـ CSS
//    (بدل مشغّل أبل الأصلي اللي بيلغي أي طبقة فوق الفيديو)
//  - يحاول يقفل الشاشة على Landscape أثناء ملء الشاشة على الموبايل
//  - تقارير تقدم المشاهدة لـ /api/video-progress
// ============================================================
import { useState, useEffect, useRef } from 'react'
import { Maximize, Minimize } from 'lucide-react'
import { VideoWatermark } from '@/components/student/VideoWatermark'

function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return '0:00'
  var m = Math.floor(sec / 60)
  var s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

export function ProtectedFilePlayer({
  videoId,
  src,
  poster,
  studentId,
  studentName,
  studentPhone,
  onWatch,
  autoplay,
}: {
  videoId: string
  src: string
  poster?: string
  studentId?: string
  studentName?: string
  studentPhone?: string
  onWatch?: () => void
  autoplay?: boolean
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const onWatchRef = useRef(onWatch)
  const [playing, setPlaying] = useState(false)
  const [started, setStarted] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fakeFs, setFakeFs] = useState(false)
  // الدوران القسري: لو الموبايل في وضع طولي جوه ملء الشاشة → ندوّر الستيج 90°
  const [rotated, setRotated] = useState(false)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const hideTimerRef = useRef<any>(null)

  useEffect(function () { onWatchRef.current = onWatch }, [onWatch])

  /* fullscreen listener (native + webkit) — يقفل اللاندسكيب أثناء ملء الشاشة */
  useEffect(function () {
    var onFsChange = function () {
      var d = document as any
      var fs = !!(d.fullscreenElement || d.webkitFullscreenElement)
      setIsFullscreen(fs)
      try {
        var so = (screen as any).orientation
        if (fs && so && so.lock) { var pr = so.lock('landscape'); if (pr && pr.catch) pr.catch(function () {}) }
        else if (!fs && so && so.unlock) so.unlock()
      } catch (e) {}
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return function () {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  /* مقتص الدوران: جوه ملء الشاشة لو الشاشة طولية → ندوّر الستيج 90° عشان
     الفيديو يبان بالعرض دايمًا حتى لو الدوران التلقائي مقفول */
  useEffect(function () {
    var fsActiveNow = isFullscreen || fakeFs
    if (!fsActiveNow) { setRotated(false); return }
    function measure() {
      try {
        var w = window.innerWidth || 0
        var h = window.innerHeight || 0
        setVp({ w: w, h: h })
        setRotated(h > w)
      } catch (e) {}
    }
    measure()
    var t1 = setTimeout(measure, 250)
    var t2 = setTimeout(measure, 800)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return function () {
      clearTimeout(t1); clearTimeout(t2)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [isFullscreen, fakeFs])

  /* auto-hide controls */
  useEffect(function () {
    if (playing) {
      hideTimerRef.current = setTimeout(function () { setShowControls(false) }, 3000)
    } else {
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    return function () { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [playing, showControls])

  /* autoplay عند الفتح لو مطلوب */
  useEffect(function () {
    if (!autoplay) return
    var v = videoRef.current
    if (!v) return
    var pr = v.play()
    if (pr && pr.catch) pr.catch(function () {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  var reportProgress = function (seconds: number, total?: number) {
    if (!studentId || !videoId) return
    fetch('/api/video-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId, videoId: videoId, watchedSeconds: seconds, totalSeconds: total || 1 }),
    }).catch(function () {})
  }

  var togglePlay = function (e?: React.MouseEvent | React.TouchEvent) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    var v = videoRef.current
    if (!v) return
    if (v.paused) {
      var pr = v.play()
      if (pr && pr.catch) pr.catch(function () {})
    } else {
      v.pause()
    }
  }

  var handleTimeUpdate = function () {
    var v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    if (v.buffered.length > 0 && v.duration > 0) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
    }
    if (v.duration && studentId && Math.floor(v.currentTime) % 5 === 0 && v.currentTime > 0) {
      reportProgress(v.currentTime, v.duration)
    }
  }

  var handleEnded = function () {
    setPlaying(false)
    setStarted(false)
    setShowControls(true)
    reportProgress(999999, 1)
    if (onWatchRef.current) onWatchRef.current()
  }

  var handleSeek = function (e: React.MouseEvent | React.TouchEvent) {
    var bar = progressRef.current
    var v = videoRef.current
    if (!bar || !v || !v.duration) return
    var rect = bar.getBoundingClientRect()
    var clientX = 'touches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
    setCurrentTime(ratio * v.duration)
  }

  /* ملء الشاشة: element-fullscreen على الكونتينر (الووترمارك والتحكم جواه)
     ولو الجهاز ميدعمش (آيفون) → fake fullscreen بالـ CSS.
     ممنوع webkitEnterFullscreen — مشغّل أبل الأصلي بيلغي الووترمارك. */
  var handleFullscreen = function (e: React.MouseEvent | React.TouchEvent) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    var d = document as any
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      if (d.exitFullscreen) d.exitFullscreen().catch(function () {})
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen()
      return
    }
    if (fakeFs) { setFakeFs(false); return }
    var c = containerRef.current as any
    if (c && c.requestFullscreen) {
      var pr = c.requestFullscreen()
      if (pr && pr.catch) pr.catch(function () {})
    } else if (c && c.webkitRequestFullscreen) {
      c.webkitRequestFullscreen()
    } else {
      setFakeFs(true)
    }
  }

  var fsActive = isFullscreen || fakeFs
  var progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  var stageStyle: any = null
  if (rotated && vp.w > 0 && vp.h > 0) {
    stageStyle = {
      width: vp.h + 'px',
      height: vp.w + 'px',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%) rotate(90deg)',
    }
  }

  return (
    <div
      ref={containerRef}
      className={
        'select-none bg-black overflow-hidden ' +
        (fsActive ? 'fixed inset-0 z-[150]' : 'relative w-full h-full')
      }
      onClick={togglePlay}
      onTouchStart={function () { setShowControls(true) }}
      onContextMenu={function (e) { e.preventDefault() }}
      onDragStart={function (e) { e.preventDefault() }}
    >
      {/* الستيج الدوّار — كل الطبقات جواه فالدوران يشمل الفيديو والووترمارك والكنترولز */}
      <div
        className={rotated ? 'absolute overflow-hidden' : 'absolute inset-0 overflow-hidden'}
        style={stageStyle || undefined}
      >
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        src={src}
        poster={poster}
        preload="metadata"
        playsInline
        disablePictureInPicture
        disableRemotePlayback
        controlsList="nodownload noremoteplayback noplaybackrate"
        onPlay={function () { setPlaying(true); setStarted(true) }}
        onPause={function () { setPlaying(false) }}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleEnded}
        onLoadedMetadata={function () { if (videoRef.current) setDuration(videoRef.current.duration) }}
      />

      {/* ووترمارك الطالب — جوه الكونتينر فبتفضل ظاهرة في ملء الشاشة */}
      <VideoWatermark name={studentName} phone={studentPhone} />

      {!started && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className={'rounded-full bg-white/90 flex items-center justify-center shadow-2xl ' + (fsActive ? 'w-20 h-20' : 'w-16 h-16')}>
            <svg className={fsActive ? 'h-10 w-10 text-gray-800' : 'h-8 w-8 text-gray-800'} style={{ marginLeft: '3px' }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      <div
        className={
          'absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ' +
          (showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none')
        }
        onClick={function (e) { e.stopPropagation() }}
      >
        <div
          ref={progressRef}
          className="w-full h-1.5 bg-white/30 cursor-pointer relative"
          onClick={handleSeek}
          onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); handleSeek(e) }}
        >
          <div className="absolute top-0 left-0 h-full bg-white/40 pointer-events-none" style={{ width: buffered + '%' }} />
          <div className="absolute top-0 left-0 h-full bg-primary pointer-events-none" style={{ width: progressPercent + '%' }} />
        </div>

        <div className="flex items-center gap-1 px-3 py-2.5 bg-gradient-to-t from-black/85 to-transparent">
          <button
            type="button"
            aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
            className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
            onClick={togglePlay}
            onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); togglePlay() }}
          >
            {playing ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>

          <span className="text-white text-sm tabular-nums" dir="ltr">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>

          <button
            type="button"
            className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0 ml-auto"
            onClick={handleFullscreen}
            onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); handleFullscreen(e) }}
            aria-label={fsActive ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
          >
            {fsActive ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
          </button>
        </div>
      </div>
      </div>
    </div>
  )
}
