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
//            (عالية [DEFAULT = أعلى جودة متاحة فعلًا في المصدر] / تلقائي /
//             كل المستويات المتاحة حقيقيًا في الفيديو)
//            الافتراضي = **أعلى جودة موجودة فعلًا على يوتيوب** (طلب المستر:
//            الجودة تبقى عالية) والطالب يقدر يغيّر من القائمة وده **بيشتغل
//            فعلًا** (إعادة تحميل التيار بالمستوى المختار). ملاحظة صادقة:
//            لو الفيديو نفسه مرفوع على يوتيوب بجودة ضعيفة (مثلاً 360p بس)
//            القائمة بتوضّح إن دي حدود الملف الأصلي — مفيش مشغل يقدر يخترع
//            بكسلات مش موجودة في المصدر.
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
  if (q === 'top') return 'عالية'
  if (q === 'auto' || q === 'default') return 'تلقائي'
  var map: any = { highres: '2160p+', hd2160: '2160p', hd1440: '1440p', hd1080: '1080p', hd720: '720p', large: '480p', medium: '360p', small: '240p', tiny: '144p' }
  return map[q] || q
}
/* أعلى جودة متاحة فعلًا في الفيديو — يوتيوب بيرجّع القائمة مرتبة من الأعلى
   للأقل (وآخر عنصر 'auto'). لو الملف الأصلي مرفوع بجودة ضعيفة، دي أعلى
   حاجة هتظهر — وده حدود المصدر مش حدود المشغل. */
function highestAvailable(p: any): string {
  try {
    var levels = p && p.getAvailableQualityLevels ? p.getAvailableQualityLevels() : []
    for (var i = 0; i < levels.length; i++) {
      if (levels[i] && levels[i] !== 'auto' && levels[i] !== 'default') return levels[i]
    }
  } catch (e) {}
  return 'hd720'
}
/* الجودة (أهم حاجة للمستر — 2026-ز): **الإصلاح الجذري لمشكلة "الجودة مش
   بتعلى" على الموبايل**. يوتيوب بيحدد سقف الجودة بمقاس الـ iframe نفسه:
   مقاس 1280×720 = أقصى تيار 720p حتى لو الفيديو الأصلي 1080p (ده كان
   بيحصل على الموبايل لأن الصندوق أصغر من 640 فكان بيرندر 1280×720).
   **الحل: الـ iframe بيرندر دايمًا 1920×1080 على أي جهاز** (حتى لو الصندوق
   صغير) — يوتيوب يسمح بتيار 1080p فعلًا، والتصغير بـ CSS scale (contain)
   بيحافظ على الحدة 100% (supersampling) ومفيش أي قص للفيديو. */

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

  /* ===== منع التسجيل (طلب المستر 2026-ز) =====
     • Win/⌘ + Shift + R (تسجيل ويندوز) → رسالة "التسجيل ممنوع"
     • Win/⌘ + Shift + S (أداة القص) → رسالة "التسجيل ممنوع"
     • زرار PrintScreen → محاولة تفريغ الحافظة + رسالة
     • كليك يمين ممنوع
     ملاحظة حقيقية: اختصارات النظام نفسها فوق صلاحية المتصفح — لكن
     بنكتشف المحاولة ونبعت التحذير فورًا، والووترمارك باسم الطالب ورقمه
     على الفيديو نفسه هو الخصم الحقيقي لأي صورة/فيديو مسرب. */
  const [recMsg, setRecMsg] = useState('')
  const recTimerRef = useRef<any>(null)
  function warnRecording(msg: string) {
    setRecMsg(msg)
    if (recTimerRef.current) clearTimeout(recTimerRef.current)
    recTimerRef.current = setTimeout(function () { setRecMsg('') }, 2600)
  }
  useEffect(function () {
    function onKey(e: KeyboardEvent) {
      var k = (e.key || '').toLowerCase()
      var metaPressed = !!(e.metaKey || e.key === 'OS' || e.key === 'Meta' || e.keyCode === 91 || e.keyCode === 92)
      if (metaPressed && e.shiftKey && (k === 'r' || k === 's')) {
        e.preventDefault()
        warnRecording('🚫 التسجيل ممنوع')
      }
      if (k === 'printscreen' || e.keyCode === 44) {
        warnRecording('🚫 التسجيل ممنوع')
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('🔒 المحتوى محمي — Math Genius').catch(function () {})
        } catch (err) {}
      }
    }
    function onCtx(e: MouseEvent) {
      e.preventDefault()
      warnRecording('🚫 التسجيل ممنوع — كليك يمين مقفول')
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('contextmenu', onCtx, true)
    return function () {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('contextmenu', onCtx, true)
      if (recTimerRef.current) clearTimeout(recTimerRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* حماية الجودة: عداد إعادات التحميل القسرية (سقف 4 لكل فيديو عشان مفيش لوب) */
  const hardReloadCountRef = useRef(0)

  /* الجودة + الحدة (أهم حاجة للمستر — 2026-و): يوتيوب بيحدد **سقف الجودة بمقاس
     المشغل** — مشغل 1280×720 بيرفض 1080p+ حتى مع setPlaybackQuality/loadVideoById
     (اتختبر فعليًا). عشان كده الـ iframe بيرندر بمقاس **1920×1080 كحد أدنى**
     وبيتصغّر بالـ CSS بـ **min (contain)** — تصغير مش تكبير:
     • يوتيوب بيسمح بتيار 1080p فعلًا (المقاس الكبير)
     • مفيش أي تمديد بكسلات (التصغير بيحافظ على الحدة 100%)
     • مفيش أي قص (contain — الفيديو كامل دايمًا) */
  const cropRef = useRef<HTMLDivElement>(null)
  const [hostDim, setHostDim] = useState({ w: 1920, h: 1080 })
  const [hostScale, setHostScale] = useState(1)

  useEffect(function () {
    function measure() {
      var el = cropRef.current
      if (!el) return
      var w = el.clientWidth || 0
      var h = el.clientHeight || 0
      if (w <= 0 || h <= 0) return
      /* دايمًا 1920×1080 — مقاس أصغر بيقفل تيار 1080p عند يوتيوب (ده كان
         سبب "الجودة مش بتعلى" على الموبايل). التصغير بـ CSS بيحافظ على الحدة. */
      var dim = { w: 1920, h: 1080 }
      if (w > dim.w || h > dim.h) dim = { w: w, h: h } /* شاشة أكبر من 1080p → بمقاسها (scale=1 بلا تمديد) */
      setHostDim(dim)
      setHostScale(Math.min(w / dim.w, h / dim.h))
    }
    measure()
    var ro: any = null
    try { ro = new (window as any).ResizeObserver(measure); if (cropRef.current) ro.observe(cropRef.current) } catch (e) {}
    window.addEventListener('resize', measure)
    return function () {
      try { if (ro) ro.disconnect() } catch (e) {}
      window.removeEventListener('resize', measure)
    }
  }, [])

  /* resume + cumulative progress state */
  const savedSecondsRef = useRef(0)
  const maxSeenRef = useRef(0)

  /* quality settings state — DEFAULT: 'top' = أعلى جودة متاحة فعلًا في المصدر
     (طلب المستر: الجودة تبقى عالية). الطالب يقدر يختار من القائمة واختياره
     بيتنفذ فعلًا (إعادة تحميل التيار بالمستوى). */
  const [qualityLevels, setQualityLevels] = useState<string[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string>('top')
  const [showQualityMenu, setShowQualityMenu] = useState(false)
  /* الجودة الفعلية الشغالة دلوقتي — عشان زرار الجودة يعرض الحقيقة
     (مثلاً "1080p" تظهر بس لما التيار يكون 1080p فعلًا) */
  const [actualQuality, setActualQuality] = useState<string>('')
  const selectedQualityRef = useRef('top')
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
      if (q === 'top') {
        /* أعلى جودة متاحة فعلًا في المصدر — لو الملف الأصلي مرفوع بجودة
           ضعيفة يوتيوب هيرجّع أعلى حاجة عنده بس (حدود المصدر) */
        var best = highestAvailable(p)
        if (p.setPlaybackQualityRange) p.setPlaybackQualityRange(best, best)
        if (p.setPlaybackQuality) p.setPlaybackQuality(best)
      } else if (q === 'auto') {
        /* full automatic — YouTube adapts freely */
        if (p.setPlaybackQualityRange) p.setPlaybackQualityRange('auto', 'auto')
        if (p.setPlaybackQuality) p.setPlaybackQuality('auto')
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
              /* available quality levels for the settings menu — القائمة بتعرض
                 بس المستويات الموجودة فعلًا في الفيديو (صادق مع الطالب) */
              try {
                var levels = e.target.getAvailableQualityLevels ? e.target.getAvailableQualityLevels() : []
                var clean: string[] = []
                for (var i = 0; i < levels.length; i++) {
                  if (levels[i] && levels[i] !== 'auto' && levels[i] !== 'default' && STANDARD_QUALITIES.indexOf(levels[i]) >= 0) clean.push(levels[i])
                }
                setQualityLevels(clean)
              } catch (err) { setQualityLevels([]) }
              if (pendingPlayRef.current) {
                pendingPlayRef.current = false
                startPlaybackWithWatchdog(e.target)
                if (onWatchRef.current) onWatchRef.current()
              }
            },
            onPlaybackQualityChange: function (e: any) {
              /* لو يوتيوب نزّل الجودة لوحده بعد ما فرضناها → نعيد الأمر فورًا
                 (soft) — الحارس الدوري في الأسفل بيتولّي إعادة التحميل القسرية،
                 وبيتدخل بس لو الجودة نزلت **تحت** المطلوب (الترقية بس) */
              if (cancelled) return
              var wanted = selectedQualityRef.current
              if (wanted === 'auto') return
              try {
                var qRank: any = { highres: 10, hd2160: 10, hd1440: 9, hd1080: 8, hd720: 7, large: 6, medium: 5, small: 4, tiny: 3 }
                var effQ = wanted === 'top' ? highestAvailable(e.target) : wanted
                var curQ = e.target.getPlaybackQuality ? e.target.getPlaybackQuality() : ''
                if (effQ && curQ && curQ !== 'unknown' && (qRank[curQ] || 0) < (qRank[effQ] || 0) && Date.now() - lastQualityApplyRef.current > 3000) {
                  applyQuality(wanted)
                }
              } catch (err) {}
            },
            onStateChange: function (e: any) {
              if (cancelled) return
              // -1 unstarted | 0 ended | 1 playing | 2 paused | 3 buffering | 5 cued
              if (e.data === 1) {
                setStarted(true); setPlaying(true); setShowControls(true)
                /* keep captions OFF + re-assert quality every time playback starts
                   (مستويات الجودة بتبقى متاحة كاملة بعد أول تشغيل — فبنعيد
                   فرض الأعلى هنا تاني عشان الفيديو يفتح أعلى جودة من أول لحظة) */
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
        /* sticky quality + captions stay OFF — الحارس بيفضّل اختيار الطالب
           (أو 'top' = الأعلى المتاح) شغال، والـ HARD enforcement بيستخدم نفس
           المستوى المطلوب */
        var wanted = selectedQualityRef.current
        /* عرض الجودة الفعلية الحية على زرار الجودة (بدل المطلوب بس) */
        if (p.getPlaybackQuality) {
          try {
            var aq = p.getPlaybackQuality()
            if (aq && aq !== 'unknown' && aq !== 'auto') setActualQuality(function (prev) { return prev === aq ? prev : aq })
          } catch (e) {}
        }
        if (wanted !== 'auto' && p.getPlaybackQuality) {
          var eff = wanted === 'top' ? highestAvailable(p) : wanted
          var cur = p.getPlaybackQuality()
          /* الحارس بيفرض **الترقية بس**: لو الجودة الحالية أقل من المطلوب → فرض؛
             ولو أعلى من اختيار الطالب → تقبل من غير إعادات تحميل بلا لزوم */
          var qRank: any = { highres: 10, hd2160: 10, hd1440: 9, hd1080: 8, hd720: 7, large: 6, medium: 5, small: 4, tiny: 3 }
          var curRank = qRank[cur] || 0
          var effRank = qRank[eff] || 0
          if (eff && cur && cur !== 'unknown' && curRank < effRank) {
            /* HARD enforcement: لو يوتيوب استمر في تجاهل الأوامر 4 ثواني →
               نعيد تحميل التيار بالمستوى المطلوب (سقف 4 مرات للفيديو + كولداون
               15 ثانية عشان مفيش لوب إعادات تحميل) */
            if (mismatchSinceRef.current === 0) mismatchSinceRef.current = Date.now()
            if (Date.now() - mismatchSinceRef.current > 4000 && Date.now() - lastHardReloadRef.current > 15000 && hardReloadCountRef.current < 4) {
              lastHardReloadRef.current = Date.now()
              mismatchSinceRef.current = 0
              hardReloadCountRef.current++
              try {
                var posNow = p.getCurrentTime ? p.getCurrentTime() : 0
                p.loadVideoById(ytId, Math.max(0, Math.floor(posNow)), eff)
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
    hardReloadCountRef.current = 0 /* اختيار جديد من الطالب = ميزانية إعادة تحميل جديدة */
    var target = q === 'top' ? highestAvailable(playerRef.current) : q
    if (target && target !== 'auto') {
      /* HARD enforcement: reload the same video at the same position with the
         chosen quality as the documented suggestedQuality — this actually
         switches streams (بيشتغل فعلًا مش كلام) */
      var p = playerRef.current
      try {
        var pos = 0
        try { pos = (p && p.getCurrentTime ? p.getCurrentTime() : 0) || 0 } catch (err) {}
        if (p && p.loadVideoById) {
          p.loadVideoById(ytId, Math.max(0, Math.floor(pos)), target)
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
      {/* YouTube player — الفيديو **كامل 100% من غير أي قص** (طلب المستر
          الصريح 2026: "الفيديو مش كامل إنت قاصص منه الأطراف — لازم يبان كله").
          الجودة (أهم حاجة): الـ iframe بيرندر **بمقاس الصندوق الحقيقي 100%**
          (مفيش transform scale خالص — مفيش تمديد بكسلات) والجودة بيتفرض عليها
          بالـ API (الحارس + loadVideoById).
          الحماية (طلب المستر: "اسم القناة والشير واللينك محدش يشوفهم ولا يدوس
          عليهم — غطّيهم بأي حاجة بس ما تقصش الفيديو"):
          • درع علوي دايمًا شغال (مش بس وقت الوقف) بيغطي عنوان الفيديو واسم
            قناة يوتيوب وزرار الشير — مستحيل يبانوا ولا حد يقدر يدوس عليهم.
          • باتش تحت يمين بيغطي لوجو/لينك "Watch on YouTube".
          • طبقة التقاط النقرات بتمنع أي ضغطة توصل لليوتيوب أصلًا. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div ref={cropRef} className="absolute inset-0">
          <div
            ref={playerHostRef}
            style={{
              position: 'absolute',
              top: '50%',
              left: '50%',
              width: hostDim.w + 'px',
              height: hostDim.h + 'px',
              transform: 'translate(-50%, -50%) scale(' + hostScale + ')',
              transformOrigin: 'center center',
            }}
          />
        </div>
        {/* درع علوي دايمًا — عنوان يوتيوب/اسم القناة/زرار الشير عمرهم ما يظهروا */}
        <div
          className="absolute top-0 left-0 right-0 pointer-events-none"
          style={{ height: '56px', background: 'linear-gradient(to bottom, rgba(0,0,0,.92), rgba(0,0,0,.55) 55%, rgba(0,0,0,0))' }}
        />
        {/* باتش الركن العلوي (فوق يمين) — طلب المستر 2026-ز: علامة الشير
            و"Watch on YouTube" اللي بيوتيوب بيعرضهم فوق يمين وقت فتح/وقف
            الفيديو **متشالوش ولا حد يقدر يدوس عليهم** — متغطيين بباتش
            عليه ووترمارك (من غير أي قص للفيديو — طبقة فوق بس). ملاحظة:
            واجهة يوتيوب الداخلية LTR فالشير بيكون فوق يمين فعلًا. */}
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{ top: '6px', right: '8px', width: '170px', height: '46px', borderRadius: '10px', background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        >
          <span style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', fontWeight: 800, letterSpacing: 0, direction: 'rtl', whiteSpace: 'nowrap' }}>🔒 محتوى محمي</span>
        </div>
        {/* باتش لوجو/لينك يوتيوب (تحت يمين) — بلور + تعتيم + ووترمارك مكانه */}
        <div
          className="absolute pointer-events-none flex items-center justify-center"
          style={{ bottom: '8px', right: '8px', width: '150px', height: '46px', borderRadius: '10px', background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)' }}
        >
          <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: '9.5px', fontWeight: 800, letterSpacing: 0, direction: 'rtl', whiteSpace: 'nowrap' }}>🔒 محتوى محمي</span>
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
          translucent layer lets it bleed through.
          لو الفيديو ملهوش بوستر من الأدمن → **صورة الفيديو الحقيقية من يوتيوب**
          (طلب المستر 2026-و: صورة البرواز الدهبي ملهاش علاقة بالمنصة — اتشالت
          خالص وبقت favicon لمنصة مستر شريف). */}
      {!started && (
        <div className="absolute inset-0 z-30 pointer-events-none">
          {poster ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={poster} alt="فيديو الدرس" className="w-full h-full object-cover bg-black" draggable={false} />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={'https://i.ytimg.com/vi/' + ytId + '/maxresdefault.jpg'}
              alt="فيديو الدرس"
              className="w-full h-full object-cover bg-black"
              draggable={false}
              onError={function (e) {
                var el = e.currentTarget
                if (el.src.indexOf('maxresdefault') >= 0) {
                  el.src = 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg'
                } else {
                  el.style.visibility = 'hidden'
                }
              }}
            />
          )}
          <div className="absolute inset-0 bg-black/30">
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
              className={'w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-white hover:bg-white/10 transition-colors min-h-[36px] ' + (selectedQuality === 'top' ? 'text-primary font-bold' : '')}
              onClick={function (e) { e.preventDefault(); e.stopPropagation(); handleQualitySelect('top') }}
            >
              <span>عالية (الأعلى المتاح)</span>
              {selectedQuality === 'top' && <Check className="w-4 h-4" />}
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
            {/* ملاحظة صادقة: لو أعلى جودة في المصدر ضعيفة (الملف الأصلي على
                يوتيوب مرفوع بجودة ضعيفة) — مفيش مشغل يقدر يتحايل على ده */}
            {qualityLevels.length > 0 && ['large', 'medium', 'small', 'tiny'].indexOf(qualityLevels[0]) >= 0 && (
              <p className="px-3 pt-1.5 pb-1 text-[10px] leading-relaxed text-amber-300/90 border-t border-white/10 mt-1">
                أعلى جودة متاحة في الفيديو ده: {qualityLabel(qualityLevels[0])} — دي حدود الملف الأصلي على يوتيوب
              </p>
            )}
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
                {/* عرض الجودة **الفعلية الشغالة** (مش المطلوب بس) — عشان الرقم
                    يكون صادق: 1080p تظهر بس لما التيار يكون 1080p فعلًا */}
                <span className="text-[10px] font-bold" dir="ltr">{qualityLabel(actualQuality || selectedQuality)}</span>
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

      {/* رسالة "التسجيل ممنوع" — فوق كل حاجة وخارج الستيج الدوّار */}
      {recMsg && (
        <div
          role="alert"
          className="fixed top-4 left-1/2 -translate-x-1/2 z-[300] rounded-xl bg-black/90 border border-red-400/40 text-white text-sm font-bold px-5 py-3 shadow-2xl pointer-events-none"
          style={{ direction: 'rtl', whiteSpace: 'nowrap' }}
        >
          {recMsg}
        </div>
      )}
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
