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
//
// ===== الجودة للملف المفرد (2026-م — طلب المستر) =====
// الفيديو ده **ملف MP4 واحد** — مش بث متعدد الجودات (HLS/DASH):
//  • بيتشغل دايمًا **بأعلى جودة أصلية في الملف نفسه** — المتصفح بيرسم
//    الفيديو بدقته الأصلية الكاملة (object-contain) ومفيش أي تصغير للجودة.
//  • تبديل الجودات الديناميكي (360p/720p/1080p) محتاج ملفات متعددة —
//    فزرار الجودة بيعرض رسالة توضيحية صادقة بدل واجهة وهمية.
//
// ===== مدة الفيديو (2026-د — طلب المستر) =====
//  • شيب ⏱ بالمعة على الصورة من أول لحظة قبل التشغيل ("لما يتجاب يعرفوا
//    الفيديو قد إيه") + الوقت/المدة في الشريط دايمًا.
//  • أول ما المدة تتقرأ من الملف بتتبعت مرة واحدة لـ /api/video-duration
//    عشان بادج المدة يظهر على كارت الفيديو في القايمة. ============================================================
import { useState, useEffect, useRef } from 'react'
import { Maximize, Minimize, Settings } from 'lucide-react'
import { VideoWatermark } from '@/components/student/VideoWatermark'

function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return '0:00'
  var s = Math.floor(sec)
  var h = Math.floor(s / 3600)
  var m = Math.floor((s % 3600) / 60)
  var ss = s % 60
  if (h > 0) return h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0')
  return m + ':' + String(ss).padStart(2, '0')
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
  // الجودة للملف المفرد: أعلى جودة أصلية دايمًا + رسالة توضيحية صادقة
  const [showQInfo, setShowQInfo] = useState(false)
  const [nativeRes, setNativeRes] = useState(0)
  // تقرير المدة (مرة واحدة) — عشان بادج ⏱ على الكروت (طلب المستر 2026-د)
  const durationReportedRef = useRef(false)

  /* ===== التحكم الكامل في الشريط الزمني (طلب المستر 2026-ص5) — زي
     المشغل الرئيسي: سحب بالإصبع/الماوس + ±10 ثواني + فقاعة معاينة ===== */
  const scrubbingRef = useRef(false)
  const [scrubbing, setScrubbing] = useState(false)
  const [scrubTime, setScrubTime] = useState<number | null>(null)

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
    /* أثناء سحب الطالب للشريط: العرض من إصبعه مش من الفيديو (مفيش رجفة) */
    if (scrubbingRef.current) return
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

  /* ===== السحب في الشريط (طلب المستر 2026-ص5): الضغطة بتقفز فورًا،
     والسحب بيحدّث المعاينة لحظة بلحظة وعند رفع الإصبع بيتم القفز النهائي ===== */
  var seekRatioFromClientX = function (clientX: number): number {
    var bar = progressRef.current
    if (!bar) return 0
    var rect = bar.getBoundingClientRect()
    if (rect.width <= 0) return 0
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
  }

  var handleSeekPointerDown = function (e: React.PointerEvent) {
    var v = videoRef.current
    if (!v || !v.duration) return
    e.preventDefault()
    e.stopPropagation()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch (err) {}
    scrubbingRef.current = true
    setScrubbing(true)
    var t = seekRatioFromClientX(e.clientX) * v.duration
    setScrubTime(t)
    setCurrentTime(t)
    try { v.currentTime = t } catch (err) {}
  }

  var handleSeekPointerMove = function (e: React.PointerEvent) {
    if (!scrubbingRef.current) return
    e.preventDefault()
    e.stopPropagation()
    var v = videoRef.current
    if (!v || !v.duration) return
    var t = seekRatioFromClientX(e.clientX) * v.duration
    setScrubTime(t)
    setCurrentTime(t)
  }

  var handleSeekPointerUp = function (e: React.PointerEvent) {
    if (!scrubbingRef.current) return
    e.preventDefault()
    e.stopPropagation()
    scrubbingRef.current = false
    setScrubbing(false)
    setScrubTime(null)
    var v = videoRef.current
    if (!v || !v.duration) return
    var t = seekRatioFromClientX(e.clientX) * v.duration
    try { v.currentTime = t } catch (err) {}
    setCurrentTime(t)
  }

  /* ±10 ثواني — تقديم/ترجيع بضغطة واحدة (طلب المستر 2026-ص5) */
  var skipSeconds = function (sec: number) {
    var v = videoRef.current
    if (!v) return
    var t = Math.max(0, Math.min((v.duration || 0) > 0 ? v.duration - 0.5 : v.currentTime + sec, v.currentTime + sec))
    try { v.currentTime = t } catch (err) {}
    setCurrentTime(t)
    /* الكنترولز تفضل ظاهرة بعد القفزة عشان الطالب يشوف الوقت الجديد */
    setShowControls(true)
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    hideTimerRef.current = setTimeout(function () { setShowControls(false) }, 3000)
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
        onLoadedMetadata={function () {
          if (videoRef.current) {
            setDuration(videoRef.current.duration)
            /* الجودة الأصلية الحقيقية للملف — بتتعرض في رسالة زرار الجودة */
            try { setNativeRes(videoRef.current.videoHeight || 0) } catch (e) {}
            /* تقرير المدة مرة واحدة — بيتخزن في durationSec عشان بادج ⏱
               يظهر على كارت الفيديو في القايمة (طلب المستر 2026-د) */
            var dur = videoRef.current.duration
            if (videoId && dur && isFinite(dur) && dur > 0 && !durationReportedRef.current) {
              durationReportedRef.current = true
              fetch('/api/video-duration', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ videoId: videoId, durationSec: Math.round(dur) }),
              }).catch(function () {})
            }
          }
        }}
      />

      {/* ووترمارك الطالب — جوه الكونتينر فبتفضل ظاهرة في ملء الشاشة */}
      <VideoWatermark name={studentName} phone={studentPhone} />

      {/* شيب مدة الفيديو قبل التشغيل (طلب المستر 2026-د: "لما يتجاب يعرفوا
          الفيديو قد إيه") — بيختفي أول ما التشغيل يبدأ */}
      {!started && duration > 0 && (
        <div
          className="absolute top-3 left-3 z-10 flex items-center gap-1 rounded-lg bg-black/80 border border-white/15 px-2 py-1 text-white text-[11px] font-bold pointer-events-none"
          dir="ltr"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" strokeLinecap="round" /></svg>
          {formatTime(duration)}
        </div>
      )}

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
        {/* ===== شريط التحكم الكامل (طلب المستر 2026-ص5) — الطالب يقدر يسحب
            الشريط بإصبعه أو بالماوس ويشوف الوقت في فقاعة معاينة وهو بيسحب
            ويرجّع أو يجري زي يوتيوب بالظبط. مساحة اللمس مكبّرة (8px فوق وتحت)
            + المقبض بيكبر أثناء السحب. النسبة المحفوظة cumulative (أعلى ثانية
            وصلها) — الرجوع للور مش بينزل نسبة الطالب أبدًا. ===== */}
        <div
          ref={progressRef}
          className="relative w-full cursor-pointer py-2 -my-2"
          style={{ touchAction: 'none' }}
          onPointerDown={handleSeekPointerDown}
          onPointerMove={handleSeekPointerMove}
          onPointerUp={handleSeekPointerUp}
          onPointerCancel={handleSeekPointerUp}
        >
          <div className="relative h-[5px] w-full rounded-full bg-white/30">
            <div className="absolute top-0 left-0 h-full rounded-full bg-white/40 pointer-events-none" style={{ width: buffered + '%' }} />
            <div className="absolute top-0 left-0 h-full rounded-full bg-primary pointer-events-none" style={{ width: progressPercent + '%' }} />
            <div
              className={'absolute top-1/2 -translate-y-1/2 -translate-x-1/2 rounded-full bg-primary shadow-lg pointer-events-none ' + (scrubbing ? 'w-4 h-4' : 'w-3 h-3')}
              style={{ left: progressPercent + '%' }}
            />
          </div>
          {scrubbing && scrubTime !== null && (
            <div
              className="absolute bottom-full mb-2 -translate-x-1/2 rounded-md bg-black/90 border border-white/15 px-2 py-0.5 text-[11px] font-bold text-white pointer-events-none"
              style={{ left: progressPercent + '%', direction: 'ltr' }}
            >
              {formatTime(scrubTime)}
            </div>
          )}
        </div>

        {/* 2026-و23 — الشريط بقى 60px بالظبط زي مشغل يوتيوب — الووترمارك السفلية على حدّه */}
        <div className="flex items-center gap-1 px-3 py-2 bg-gradient-to-t from-black/85 to-transparent">
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

          {/* ±10 ثواني — تقديم وترجيع بضغطة واحدة (طلب المستر 2026-ص5):
              الطالب يقدر يجري الفيديو أو يرجّعه بسهولة من الكنترولز */}
          <button
            type="button"
            aria-label="رجوع 10 ثواني"
            className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
            onClick={function (e) { e.preventDefault(); e.stopPropagation(); skipSeconds(-10) }}
            onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); skipSeconds(-10) }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
              <text x="12.5" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="bold">10</text>
            </svg>
          </button>
          <button
            type="button"
            aria-label="تقديم 10 ثواني"
            className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
            onClick={function (e) { e.preventDefault(); e.stopPropagation(); skipSeconds(10) }}
            onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); skipSeconds(10) }}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
              <path d="M21 3v5h-5" />
              <text x="11.5" y="15.5" fontSize="7.5" textAnchor="middle" fill="currentColor" stroke="none" fontWeight="bold">10</text>
            </svg>
          </button>
          <span className="text-white text-sm tabular-nums" dir="ltr">
            {formatTime(scrubbing && scrubTime !== null ? scrubTime : currentTime)} / {formatTime(duration)}
          </span>

          <div className="ml-auto flex items-center gap-1 relative">
            {/* الجودة للملف المفرد: أعلى جودة أصلية دايمًا + رسالة توضيحية صادقة
                (تبديل الجودات الديناميكي محتاج بث متعدد الجودات HLS/DASH) */}
            <button
              type="button"
              aria-label="معلومات جودة الفيديو"
              aria-expanded={showQInfo}
              className={'h-10 min-w-[44px] px-1 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0 ' + (showQInfo ? 'text-primary' : '')}
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); setShowQInfo(function (v) { return !v }) }}
              onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); setShowQInfo(function (v) { return !v }) }}
            >
              <Settings className={'w-5 h-5 transition-transform ' + (showQInfo ? 'rotate-90' : '')} />
            </button>
            {showQInfo && (
              <div
                role="note"
                aria-label="معلومات جودة الفيديو"
                className="absolute bottom-full right-0 mb-3 w-64 rounded-xl bg-black/90 backdrop-blur-sm border border-white/10 p-3 shadow-2xl"
                style={{ direction: 'rtl' }}
              >
                <p className="text-[11px] font-bold text-white mb-1.5">جودة الفيديو</p>
                <p className="text-[10.5px] leading-relaxed text-white/75">
                  الفيديو ده ملف واحد مرفوع — بيتشغل دايمًا بأعلى جودة أصلية فيه
                  {nativeRes ? <b className="text-white"> ({nativeRes}p)</b> : null}.
                  تبديل الجودات (360p/720p/1080p) محتاج ملفات متعددة الجودات — مش متاح للملف المفرد.
                </p>
              </div>
            )}
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
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
    </div>
  )
}
