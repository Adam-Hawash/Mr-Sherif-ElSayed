'use client'

// ============================================================
// FILE: src/components/student/ProtectedYouTubePlayer.tsx
// PURPOSE: Protected custom YouTube player — same style as the
//          photo gallery (معرض الصور) modal player.
//
//          - NO YouTube branding at ANY state:
//              • Before play → our own poster
//              • While playing/paused → NO black covers anymore: just a
//                static WRITTEN YouTube mark (decorative only — tapping it
//                does NOTHING) + click-catch overlay blocks the iframe
//              • When ENDED → back to our poster (hides YouTube's
//                related-videos end screen)
//          - NO native controls, NO keyboard shortcuts, NO right-click
//          - Settings (gear) button → video quality control
//            (تلقائي 480p [DEFAULT] / تلقائي / 1080p / 720p / 480p / 360p / 240p / 144p)
//            "تلقائي 480p" = automatic quality CAPPED at 480p (opens fast,
//            never blurry-hd, saves data). The chosen quality is enforced:
//            soft hints first, then a HARD stream reload if YouTube ignores it.
//          - RESUME: on open the player fetches the saved progress for this
//            student+video and seeks there — progress is CUMULATIVE (max ever
//            reached), re-watching the start can never pull the % back down.
//          - FULLSCREEN on mobile: locks the phone into LANDSCAPE so the
//            16:9 video fills the screen (no tiny letterboxed strip).
//            If the phone can't rotate (auto-rotate off / iPhone) we FORCE
//            landscape with a CSS 90° rotation of the whole stage — the
//            student just turns the phone sideways and the video + controls
//            + watermark fill the screen edge-to-edge, always landscape.
//          - SINGLE play indicator: our big opaque play button sits EXACTLY
//            on top of YouTube's own big play button (same center point)
//            and covers it completely — students only ever see ONE button.
//          - Reports watch progress to /api/video-progress
// ============================================================

import { useState, useEffect, useRef } from 'react'
import { Maximize, Minimize, X, Settings, Check } from 'lucide-react'
import { VideoWatermark } from '@/components/student/VideoWatermark'

/* ---------- YouTube IFrame API loader (cached) ---------- */
var ytApiPromise: Promise<any> | null = null
function loadYouTubeAPI(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  var w = window as any
  if (w.YT && w.YT.Player) return Promise.resolve(w.YT)
  if (ytApiPromise) return ytApiPromise
  ytApiPromise = new Promise(function (resolve) {
    var prev = w.onYouTubeIframeAPIReady
    w.onYouTubeIframeAPIReady = function () {
      if (prev) try { prev() } catch (e) {}
      resolve(w.YT)
    }
    var tag = document.createElement('script')
    tag.src = 'https://www.youtube.com/iframe_api'
    document.head.appendChild(tag)
  })
  return ytApiPromise
}

function formatTime(sec: number) {
  if (!sec || !isFinite(sec)) return '0:00'
  var m = Math.floor(sec / 60)
  var s = Math.floor(sec % 60)
  return m + ':' + String(s).padStart(2, '0')
}

/* ---------- Quality helpers ---------- */
var STANDARD_QUALITIES = ['hd2160', 'hd1440', 'hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']
function qualityLabel(q: string): string {
  if (q === 'auto480') return 'تلقائي 480p'
  if (q === 'auto' || q === 'default') return 'تلقائي'
  var map: any = { highres: '2160p+', hd2160: '2160p', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p' }
  return map[q] || q
}

/* ============================================================
 * ProtectedYouTubePlayer — the player box (aspect-video parent)
 * ============================================================ */
export function ProtectedYouTubePlayer({
  ytId,
  poster,
  videoId,
  studentId,
  studentName,
  studentPhone,
  onWatch,
  autoplay,
}: {
  ytId: string
  poster?: string
  videoId?: string
  studentId?: string
  studentName?: string
  studentPhone?: string
  onWatch?: () => void
  autoplay?: boolean
}) {
  const playerHostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const lastReportRef = useRef<number>(-1)

  const [ready, setReady] = useState(false)
  const [started, setStarted] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [fakeFs, setFakeFs] = useState(false)
  // الدوران القسري: لو الموبايل في وضع طولي جوه ملء الشاشة → ندوّر الستيج 90°
  // بالـ CSS عشان الفيديو يبان بالعرض دايمًا حتى لو الدوران التلقائي مقفول
  const [rotated, setRotated] = useState(false)
  const [vp, setVp] = useState({ w: 0, h: 0 })
  const hideTimerRef = useRef<any>(null)
  const pendingPlayRef = useRef(!!autoplay)
  const onWatchRef = useRef(onWatch)
  // حماية التشغيل: منع النقر المزدوج + مراقب إعادة المحاولة لو الأمر الأول فشل
  const lastToggleRef = useRef(0)
  const playWatchdogRef = useRef<any>(null)
  const mutedFallbackRef = useRef(false)
  const [needsUnmute, setNeedsUnmute] = useState(false)

  /* resume + cumulative progress state */
  const savedSecondsRef = useRef(0)
  const maxSeenRef = useRef(0)

  /* quality settings state — DEFAULT: 480p PINNED (طلب المستر: الجودة ثابتة
     على 480 — واضحة وبتفتح سريع وبتوفر داتا). الحارس بيفرضها باستمرار. */
  const [qualityLevels, setQualityLevels] = useState<string[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string>('large')
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  const selectedQualityRef = useRef('large')
  const lastQualityApplyRef = useRef(0)
  const mismatchSinceRef = useRef(0)
  const lastHardReloadRef = useRef(0)

  useEffect(function () { selectedQualityRef.current = selectedQuality }, [selectedQuality])
  useEffect(function () { onWatchRef.current = onWatch }, [onWatch])

  /* orientation helpers — rotate the phone to landscape while fullscreen so
     the 16:9 video FILLS the screen instead of a tiny letterboxed strip in
     portrait. Silently ignored on devices that don't support it. */
  function tryLockLandscape() {
    try {
      var so = (screen as any).orientation
      if (so && so.lock) {
        var pr = so.lock('landscape')
        if (pr && pr.catch) pr.catch(function () {})
      }
    } catch (e) {}
  }
  function tryUnlockOrientation() {
    try { var so = (screen as any).orientation; if (so && so.unlock) so.unlock() } catch (e) {}
  }

  /* fullscreen listener (native + webkit) — locks landscape on enter and
     releases it on exit (also covers Android's back-gesture exit) */
  useEffect(function () {
    var onFsChange = function () {
      var d = document as any
      var fs = !!(d.fullscreenElement || d.webkitFullscreenElement)
      setIsFullscreen(fs)
      if (fs) tryLockLandscape()
      else tryUnlockOrientation()
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return function () {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      tryUnlockOrientation()
    }
  }, [])

  /* مقتص الدوران: جوه ملء الشاشة لو الشاشة طولية → ندوّر الستيج 90°.
     لو الدوران التلقائي شغال والجهاز لفّ لوحده (بعد قفل landscape) → بيرجع
     عادي لأن innerWidth هتبقى أكبر من innerHeight. */
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
    /* إعادة محاولة — قفل landscape ممكن يلف الشاشة بعد لحظة */
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

  /* auto-hide controls (stay visible while the quality menu is open) */
  useEffect(function () {
    if (playing && !showQualityMenu) {
      hideTimerRef.current = setTimeout(function () { setShowControls(false) }, 3000)
    } else {
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    return function () { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [playing, showControls, showQualityMenu])

  function applyQuality(q: string) {
    var p = playerRef.current
    if (!p) return
    try {
      if (q === 'auto') {
        /* full automatic — YouTube adapts freely */
        if (p.setPlaybackQualityRange) p.setPlaybackQualityRange('auto', 'auto')
        if (p.setPlaybackQuality) p.setPlaybackQuality('auto')
      } else if (q === 'auto480') {
        /* automatic but CAPPED at 480p: suggested 360p, allowed 240p–480p.
           Called with both documented signatures — YouTube accepts one. */
        if (p.setPlaybackQualityRange) {
          try { p.setPlaybackQualityRange('medium', 'small', 'large') } catch (e) {}
          try { p.setPlaybackQualityRange('small', 'large') } catch (e) {}
        }
      } else {
        if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(q, q)
        if (p.setPlaybackQuality) p.setPlaybackQuality(q)
      }
    } catch (e) {}
    lastQualityApplyRef.current = Date.now()
  }

  /* create player */
  useEffect(function () {
    var cancelled = false
    loadYouTubeAPI()
      .then(function (YT) {
        if (cancelled || !playerHostRef.current) return
        playerRef.current = new YT.Player(playerHostRef.current, {
          videoId: ytId,
          width: '100%',
          height: '100%',
          playerVars: {
            controls: 0,
            disablekb: 1,
            modestbranding: 1,
            rel: 0,
            iv_load_policy: 3,
            fs: 0,
            playsinline: 1,
            cc_load_policy: 0,
            autoplay: autoplay ? 1 : 0,
          },
          events: {
            onReady: function (e: any) {
              if (cancelled) return
              setReady(true)
              /* captions OFF — always */
              try { e.target.unloadModule && e.target.unloadModule('captions') } catch (err) {}
              try { e.target.setOption && e.target.setOption('captions', 'track', {}) } catch (err) {}
              try { setDuration(e.target.getDuration() || 0) } catch (err) {}
              /* push the default quality BEFORE playback starts */
              applyQuality(selectedQualityRef.current)
              /* RESUME: pull the saved position for this student+video and seek
                 there — the student continues from where they stopped and the
                 percentage only ever grows (server keeps the max). */
              if (studentId && videoId) {
                fetch('/api/video-progress?studentId=' + encodeURIComponent(studentId) + '&videoId=' + encodeURIComponent(videoId))
                  .then(function (r) { return r.ok ? r.json() : null })
                  .then(function (data) {
                    if (cancelled) return
                    var row = data && data.progress && data.progress[0]
                    if (!row) return
                    var saved = Number(row.watchedSeconds) || 0
                    var total = Number(row.totalSeconds) || 0
                    if (!total) { try { total = e.target.getDuration() || 0 } catch (err) {} }
                    maxSeenRef.current = saved
                    if (saved > 5 && (!total || saved < total - 3)) {
                      savedSecondsRef.current = saved
                      try { e.target.seekTo(saved, true) } catch (err) {}
                      setCurrentTime(saved)
                      if (total) setDuration(total)
                    }
                  })
                  .catch(function () {})
              }
              /* available quality levels for the settings menu */
              try {
                var levels = e.target.getAvailableQualityLevels ? e.target.getAvailableQualityLevels() : []
                var clean: string[] = []
                for (var i = 0; i < levels.length; i++) {
                  if (levels[i] && levels[i] !== 'auto' && levels[i] !== 'default' && STANDARD_QUALITIES.indexOf(levels[i]) >= 0) clean.push(levels[i])
                }
                if (clean.length === 0) clean = ['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']
                setQualityLevels(clean)
              } catch (err) { setQualityLevels(['hd1080', 'hd720', 'large', 'medium', 'small', 'tiny']) }
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false
                startPlaybackWithWatchdog(e.target)
                if (onWatchRef.current) onWatchRef.current()
              }
            },
            onStateChange: function (e: any) {
              if (cancelled) return
              // -1 unstarted | 0 ended | 1 playing | 2 paused | 3 buffering | 5 cued
              if (e.data === 1) {
                setStarted(true); setPlaying(true); setShowControls(true)
                /* keep captions OFF + re-assert quality every time playback starts */
                try { e.target.unloadModule && e.target.unloadModule('captions') } catch (err) {}
                applyQuality(selectedQualityRef.current)
              }
              else if (e.data === 2) setPlaying(false)
              else if (e.data === 5) {
                /* cued قبل التشغيل — لو فيه طلب تشغيل معلق نبعت الأمر تاني */
                if (pendingPlayRef.current) {
                  pendingPlayRef.current = false
                  startPlaybackWithWatchdog(e.target)
                  if (onWatchRef.current) onWatchRef.current()
                }
              }
              else if (e.data === 0) {
                // Ended → back to our poster so YouTube's end screen
                // (related videos / links / logos) is NEVER visible
                setPlaying(false)
                setStarted(false)
                setShowControls(true)
                reportWatched(999999)
              }
            },
          },
        })
      })
      .catch(function () {})
    return function () {
      cancelled = true
      try { if (playerRef.current && playerRef.current.destroy) playerRef.current.destroy() } catch (e) {}
      playerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ytId])

  /* time + buffered polling + progress report every 5s + sticky quality */
  useEffect(function () {
    var timer = setInterval(function () {
      var p = playerRef.current
      if (!p || !p.getCurrentTime) return
      try {
        var t = p.getCurrentTime() || 0
        var d = p.getDuration() || 0
        setCurrentTime(t)
        if (d) setDuration(d)
        if (p.getVideoLoadedFraction) setBuffered((p.getVideoLoadedFraction() || 0) * 100)
        /* sticky quality + captions stay OFF */
        var wanted = selectedQualityRef.current
        if (wanted !== 'auto' && wanted !== 'auto480' && p.getPlaybackQuality) {
          var cur = p.getPlaybackQuality()
          if (cur && cur !== wanted) {
            /* HARD enforcement: if YouTube keeps ignoring the soft hints for
               8s, reload the stream at the chosen quality (cooldown 20s) */
            if (mismatchSinceRef.current === 0) mismatchSinceRef.current = Date.now()
            if (Date.now() - mismatchSinceRef.current > 8000 && Date.now() - lastHardReloadRef.current > 20000) {
              lastHardReloadRef.current = Date.now()
              mismatchSinceRef.current = 0
              try {
                var posNow = p.getCurrentTime ? p.getCurrentTime() : 0
                p.loadVideoById(ytId, Math.max(0, Math.floor(posNow)), wanted)
                try { p.playVideo && p.playVideo() } catch (err) {}
              } catch (e) {}
            } else {
              applyQuality(wanted)
            }
          } else {
            mismatchSinceRef.current = 0
          }
        }
        try { if (p.unloadModule) p.unloadModule('captions') } catch (e) {}
        try { if (p.setOption) p.setOption('captions', 'track', {}) } catch (e) {}
        if (studentId && videoId && t > 0) {
          /* CUMULATIVE: report the highest position ever reached this session
             (seeded with the saved position) — never a smaller one */
          if (t > maxSeenRef.current) maxSeenRef.current = t
          var bucket = Math.floor(t / 5)
          if (bucket !== lastReportRef.current) {
            lastReportRef.current = bucket
            reportWatched(maxSeenRef.current, d)
          }
        }
      } catch (e) {}
    }, 500)
    return function () { clearInterval(timer) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [studentId, videoId])

  function reportWatched(seconds: number, total?: number) {
    if (!studentId || !videoId) return
    fetch('/api/video-progress', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: studentId, videoId: videoId, watchedSeconds: seconds, totalSeconds: total || duration || 1 }),
    }).catch(function () {})
  }

  /* ===== مراقب التشغيل — علاج "الفيديو مش بيفتح" =====
     على موبايلات كتير أول أمر playVideo() المبعوت عبر postMessage بيتجاهل
     المتصفح (مفيش user gesture واصل للـ iframe). المراقب بيجرب تاني كل
     700ms، ولو 3 محاولات فشلوا → بيشغل **صامت** (مسموح دايمًا برمجيًا)
     ويظهر زرار "اضغط لتفعيل الصوت" — بكده الفيديو يفتح على أي جهاز. */
  function startPlaybackWithWatchdog(p: any) {
    if (playWatchdogRef.current) { clearInterval(playWatchdogRef.current); playWatchdogRef.current = null }
    try { p.playVideo() } catch (e) {}
    var attempts = 0
    playWatchdogRef.current = setInterval(function () {
      var st = -1
      try { st = p.getPlayerState ? p.getPlayerState() : -1 } catch (e) {}
      if (st === 1 || st === 3) {
        clearInterval(playWatchdogRef.current); playWatchdogRef.current = null
        return
      }
      attempts++
      if (attempts >= 3) {
        clearInterval(playWatchdogRef.current); playWatchdogRef.current = null
        try {
          p.mute(); mutedFallbackRef.current = true; setNeedsUnmute(true)
          p.playVideo()
        } catch (e) {}
      } else {
        try { p.playVideo() } catch (e) {}
      }
    }, 700)
  }

  function unmuteAudio() {
    var p = playerRef.current
    try {
      if (p) { p.unMute(); p.setVolume && p.setVolume(100) }
    } catch (e) {}
    mutedFallbackRef.current = false
    setNeedsUnmute(false)
  }

  function togglePlay() {
    var p = playerRef.current
    if (!p || !p.playVideo) return
    // منع النقر المزدوج: تجاهل أي نقرة تانية خلال 350ms (بعض المتصفحات بتبعت
    // touchend + click مع بعض — كان بيعمل تشغيل وإيقاف في نفس اللحظة)
    var now = Date.now()
    if (now - lastToggleRef.current < 350) return
    lastToggleRef.current = now
    if (!ready) { pendingPlayRef.current = true }
    try {
      if (playing) {
        if (playWatchdogRef.current) { clearInterval(playWatchdogRef.current); playWatchdogRef.current = null }
        p.pauseVideo()
      } else {
        startPlaybackWithWatchdog(p)
        if (!started && onWatchRef.current) onWatchRef.current()
      }
    } catch (e) {}
  }

  function handleVideoAreaClick() {
    /* first tap just closes the quality menu (if open) */
    if (showQualityMenu) { setShowQualityMenu(false); return }
    togglePlay()
  }

  function handleSeek(e: React.MouseEvent | React.TouchEvent) {
    var bar = progressRef.current
    var p = playerRef.current
    if (!bar || !p || !p.seekTo || !duration) return
    var rect = bar.getBoundingClientRect()
    var clientX = 'touches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    try { p.seekTo(ratio * duration, true) } catch (err) {}
    setCurrentTime(ratio * duration)
  }

  function handleFullscreen(e: React.MouseEvent | React.TouchEvent) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    var d = document as any
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      if (d.exitFullscreen) d.exitFullscreen().catch(function () {})
      else if (d.webkitExitFullscreen) d.webkitExitFullscreen()
      tryUnlockOrientation()
      return
    }
    if (fakeFs) { setFakeFs(false); tryUnlockOrientation(); return }
    var c = containerRef.current
    if (c && c.requestFullscreen) {
      var pr = c.requestFullscreen()
      if (pr && pr.then) pr.then(function () { tryLockLandscape() }).catch(function () {})
      else tryLockLandscape()
    } else if (c && (c as any).webkitRequestFullscreen) {
      ;(c as any).webkitRequestFullscreen()
      tryLockLandscape()
    } else {
      /* iPhone Safari has no element-fullscreen → CSS fake fullscreen */
      setFakeFs(true)
      tryLockLandscape()
    }
  }

  function handleQualitySelect(q: string) {
    setSelectedQuality(q)
    selectedQualityRef.current = q
    applyQuality(q)
    mismatchSinceRef.current = 0
    if (q !== 'auto' && q !== 'auto480') {
      /* HARD enforcement for explicit qualities: reload the same video at the
         same position with the chosen quality as the documented
         suggestedQuality — this actually switches streams */
      var p = playerRef.current
      try {
        var pos = 0
        try { pos = (p && p.getCurrentTime ? p.getCurrentTime() : 0) || 0 } catch (err) {}
        if (p && p.loadVideoById) {
          p.loadVideoById(ytId, Math.max(0, Math.floor(pos)), q)
          try { p.playVideo && p.playVideo() } catch (err) {}
        }
      } catch (e) {}
    }
    lastQualityApplyRef.current = Date.now()
    setShowQualityMenu(false)
  }

  var fsActive = isFullscreen || fakeFs
  var progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0
  var menuLevels = qualityLevels.length > 0 ? qualityLevels : STANDARD_QUALITIES

  /* الستيج: الطبقة اللي جوه الكونتينر — في الوضع الطولي بندوّرها 90° عشان
     الفيديو + الكنترولز + الووترمارك كلهم يبانوا بالعرض على الشاشة كلها */
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
      onContextMenu={function (e) { e.preventDefault() }}
    >
      {/* ===== الستيج الدوّار — كل الطبقات جواه فالدوران يشمل الكل ===== */}
      <div
        className={rotated ? 'absolute overflow-hidden' : 'absolute inset-0 overflow-hidden'}
        style={stageStyle || undefined}
      >
      {/* YouTube player — SCALED & CROPPED so NO native YouTube UI can ever
          be seen. The iframe is oversized and shifted so the crops are
          SYMMETRIC top/bottom — that keeps the iframe's center exactly on
          the container's center (±52% in fullscreen), which is where we pin
          our big play button to cover YouTube's own big play button.
          • Normal:  10% cropped top + bottom (title bar & pause watermark
            zones), 5% each side.
          • Fullscreen: 14% top + 18% bottom (kills YouTube's native
            fullscreen share/save/quality bar, ~48-56px on any phone),
            6% each side (mostly eats the pillarbox black bars). */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className={
            fsActive
              ? 'absolute w-[112%] h-[132%] top-[-14%] left-[-6%]'
              : 'absolute w-[110%] h-[120%] top-[-10%] left-[-5%]'
          }
        >
          <div ref={playerHostRef} className="w-full h-full" />
        </div>
      </div>

      {/* ملاحظة: شيلنا علامة "YouTube" المكتوبة خالص — طلب المستر الصريح:
          ممنوع كلمة يوتيوب أو اللوجو يبانوا. الكارت الطائر (الووترمارك)
          بيمر على الركن ده بانتظام وهو اللي بيغطي مكانه. */}

      {/* Click-catch overlay — blocks ALL interaction with the YouTube iframe */}
      <div
        className="absolute inset-0 z-20"
        onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleVideoAreaClick() }}
        onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); handleVideoAreaClick() }}
      />

      {/* زرار تفعيل الصوت — بيظهر بس لو التشغيل ابدأ صامت (احتياط المتصفحات
          اللي بترفض أول أمر تشغيل) — ضغطة واحدة بترجع الصوت */}
      {needsUnmute && started && (
        <button
          type="button"
          aria-label="اضغط لتفعيل الصوت"
          className="absolute z-[70] left-1/2 -translate-x-1/2 flex items-center gap-2 rounded-full bg-black/80 border border-white/25 text-white text-xs sm:text-sm font-bold px-4 py-2.5 min-h-[44px] shadow-2xl"
          style={{ top: '38%' }}
          onClick={function (e) { e.preventDefault(); e.stopPropagation(); unmuteAudio() }}
          onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); unmuteAudio() }}
        >
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" /></svg>
          اضغط لتفعيل الصوت
        </button>
      )}

      {/* PAUSED indicator — NO dark/blur cover (removed by request): the
          paused frame stays visible. Our big OPAQUE play button is pinned
          EXACTLY on the iframe's center — the same spot where YouTube draws
          its own big play button when paused — and is sized to fully cover
          it, so students see only ONE button, never two. */}
      {started && !playing && (
        <div
          className="absolute left-0 right-0 z-30 flex justify-center -translate-y-1/2 pointer-events-none"
          style={{ top: fsActive ? '52%' : '50%' }}
        >
          <div className={'rounded-full bg-white flex items-center justify-center shadow-2xl ' + (fsActive ? 'w-24 h-24' : 'w-20 h-20')}>
            <svg className={fsActive ? 'h-10 w-10 text-gray-800' : 'h-9 w-9 text-gray-800'} style={{ marginLeft: '4px' }} fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>
        </div>
      )}

      {/* Poster before first play AND after the video ends — our own look.
          IMPORTANT: this layer must be FULLY OPAQUE — before playback starts
          (and after it ends) YouTube paints its own chrome on the iframe
          (title bar, "Watch on YouTube", quality badge, control strip) and a
          translucent layer lets it bleed through. When a poster image exists
          we keep a 30% dim on top of it for play-button contrast. */}
      {!started && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {poster && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="فيديو الدرس" className="w-full h-full object-cover bg-black" draggable={false} />
          )}
          <div className={'absolute inset-0 ' + (poster ? 'bg-black/30' : 'bg-black')}>
            <div
              className="absolute left-0 right-0 flex justify-center -translate-y-1/2"
              style={{ top: fsActive ? '52%' : '50%' }}
            >
              <div className={'rounded-full bg-white flex items-center justify-center shadow-2xl ' + (fsActive ? 'w-24 h-24' : 'w-20 h-20')}>
                {!ready ? (
                  <svg className={fsActive ? 'h-9 w-9 animate-spin text-gray-800' : 'h-8 w-8 animate-spin text-gray-800'} viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                  </svg>
                ) : (
                  <svg className={fsActive ? 'h-10 w-10 text-gray-800' : 'h-9 w-9 text-gray-800'} style={{ marginLeft: '4px' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Custom controls bar — same style as the gallery modal player */}
      <div
        className={
          'absolute bottom-0 left-0 right-0 z-40 transition-opacity duration-300 ' +
          (showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none')
        }
        onClick={function (e) { e.stopPropagation() }}
        onTouchEnd={function (e) { e.stopPropagation() }}
      >
        {/* Quality menu (opens above the gear button) */}
        {showQualityMenu && (
          <div
            className="absolute bottom-full right-2 mb-3 min-w-[130px] rounded-xl bg-black/90 backdrop-blur-sm border border-white/10 py-1.5 shadow-2xl"
            role="menu"
            aria-label="جودة الفيديو"
          >
            <p className="px-3 py-1 text-[10px] text-white/50 font-bold">جودة الفيديو</p>
            <button
              type="button"
              role="menuitem"
              className={'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors min-h-[36px] ' + (selectedQuality === 'large' ? 'text-primary font-bold' : '')}
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleQualitySelect('large') }}
            >
              <span>480p (ثابتة)</span>
              {selectedQuality === 'large' && <Check className="w-4 h-4" />}
            </button>
            <button
              type="button"
              role="menuitem"
              className={'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors min-h-[36px] ' + (selectedQuality === 'auto480' ? 'text-primary font-bold' : '')}
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleQualitySelect('auto480') }}
            >
              <span>تلقائي 480p</span>
              {selectedQuality === 'auto480' && <Check className="w-4 h-4" />}
            </button>
            <button
              type="button"
              role="menuitem"
              className={'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors min-h-[36px] ' + (selectedQuality === 'auto' ? 'text-primary font-bold' : '')}
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleQualitySelect('auto') }}
            >
              <span>تلقائي</span>
              {selectedQuality === 'auto' && <Check className="w-4 h-4" />}
            </button>
            {menuLevels.map(function (q) {
              var active = selectedQuality === q
              return (
                <button
                  key={q}
                  type="button"
                  role="menuitem"
                  className={'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors min-h-[36px] ' + (active ? 'text-primary font-bold' : '')}
                  onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleQualitySelect(q) }}
                >
                  <span dir="ltr">{qualityLabel(q)}</span>
                  {active && <Check className="w-4 h-4" />}
                </button>
              )
            })}
          </div>
        )}

        <div
          ref={progressRef}
          className="w-full h-1.5 bg-white/30 cursor-pointer relative"
          onClick={handleSeek}
          onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); handleSeek(e) }}
        >
          <div className="absolute top-0 left-0 h-full bg-white/40 pointer-events-none" style={{ width: buffered + '%' }} />
          <div className="absolute top-0 left-0 h-full bg-primary pointer-events-none" style={{ width: progressPercent + '%' }} />
        </div>
        <div className="flex items-center gap-1 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
          <button
            type="button"
            aria-label={playing ? 'إيقاف مؤقت' : 'تشغيل'}
            className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
            onClick={function (e) { e.preventDefault(); e.stopPropagation(); togglePlay() }}
            onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); togglePlay() }}
          >
            {playing ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1" /><rect x="14" y="4" width="4" height="16" rx="1" /></svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
            )}
          </button>
          <span className="text-white text-sm tabular-nums" dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
          <div className="ml-auto flex items-center gap-1">
            {/* Settings — video quality */}
            <div className="relative">
              <button
                type="button"
                aria-label="إعدادات جودة الفيديو"
                aria-haspopup="menu"
                aria-expanded={showQualityMenu}
                className={'h-10 min-w-[44px] px-1 flex items-center justify-center gap-1 text-white hover:text-primary transition-colors shrink-0 ' + (selectedQuality !== 'auto' || showQualityMenu ? 'text-primary' : '')}
                onClick={function (e) { e.preventDefault(); e.stopPropagation(); setShowQualityMenu(function (v) { return !v }) }}
                onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); setShowQualityMenu(function (v) { return !v }) }}
              >
                <Settings className={'w-5 h-5 transition-transform ' + (showQualityMenu ? 'rotate-90' : '')} />
                {selectedQuality !== 'auto' && (
                  <span className="text-[10px] font-bold" dir="ltr">{qualityLabel(selectedQuality)}</span>
                )}
              </button>
            </div>
            <button
              type="button"
              aria-label={fsActive ? 'خروج من ملء الشاشة' : 'ملء الشاشة'}
              className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0"
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleFullscreen(e) }}
              onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); handleFullscreen(e) }}
            >
              {fsActive ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>

      {/* ووترمارك الطالب — جوه عنصر الـ fullscreen نفسه عشان تفضل ظاهرة
          في ملء الشاشة (دي كانت المشكلة: كانت بره الكونتينر فبتختفي) */}
      <VideoWatermark name={studentName} phone={studentPhone} />
      </div>
    </div>
  )
}

/* ============================================================
 * ProtectedYouTubeModal — fullscreen overlay (gallery modal style)
 * ============================================================ */
export function ProtectedYouTubeModal({
  ytId,
  title,
  poster,
  videoId,
  studentId,
  studentName,
  studentPhone,
  onWatch,
  onClose,
}: {
  ytId: string
  title?: string
  poster?: string
  videoId?: string
  studentId?: string
  studentName?: string
  studentPhone?: string
  onWatch?: () => void
  onClose: () => void
}) {
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

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      onContextMenu={function (e) { e.preventDefault() }}
    >
      {/* close button — fixed top-right, same as gallery modal */}
      <button
        type="button"
        aria-label="إغلاق"
        className="fixed top-4 right-4 z-[200] min-h-[48px] min-w-[48px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
        onClick={function (e) { e.stopPropagation(); onClose() }}
        onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); onClose() }}
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative w-full max-w-5xl aspect-video" onClick={function (e) { e.stopPropagation() }}>
        <ProtectedYouTubePlayer
          ytId={ytId}
          poster={poster}
          videoId={videoId}
          studentId={studentId}
          studentName={studentName}
          studentPhone={studentPhone}
          onWatch={onWatch}
          autoplay
        />
        {title && (
          <div className="absolute -bottom-8 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/80 text-xs truncate px-4">{title}</p>
          </div>
        )}
      </div>
    </div>
  )
}
