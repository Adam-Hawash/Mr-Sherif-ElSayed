'use client'

// ============================================================
// SecurePlayerModal — مشغّل الدروس الآمن (نظام التذاكر)
// ============================================================
// مفيش أي معرف يوتيوب أو رابط ملف بييجي للصفحة دي خالص:
//  - الفتح بيطلب تذكرة واحدة الاستخدام من /api/video-ticket
//  - التذكرة بتفتح /api/player/[ticket] — صفحة المشغل المحمية اللي
//    السيرفر هو اللي بيبنيها (تشويش للـ ID + ووترمارك ذكي + حماية فحص
//    + تقدم بيتقال بـ postMessage)
//  - الأب بيسمع رسائل التقدم وبيحفظها في /api/video-progress
//
// ===== ملء الشاشة 16:9 على الموبايل (بيcontrolled من الأب) =====
// المشكلة القديمة: ملء الشاشة كان بيحصل جوه الـ iframe بس — فإما مبيشتغلش
// خالص (آيفون) أو بيفضل محبوس في مقاس الصندوق والفيديو يبان طولي وحواليه
// حتت سودة. الحل: زرار ملء الشاشة جوه المشغل بي_bعت رسالة للأب، والأب هو
// اللي بيكبّر صندوق الفيديو على الشاشة كلها:
//  • متصفحات بتدعم ملء الشاشة (أندرويد/كمبيوتر) → requestFullscreen حقيقي
//    + قفل دوران landscape لو الاتبع، والفيديو يملّي الشاشة بالعرض.
//  • متصفحات مش بتدعم (آيفون سفاري / بعض الويب فيو) → "ملء شاشة وهمي":
//    الصندوق بيبقى fixed على الشاشة كلها + لو الموبايل طولي بنلف الصندوق
//    90° بالـ CSS — الفيديو يبان بالعرض 16:9 مالي الشاشة على أي جهاز.
//  • الووترمارك جوه الـ iframe فبيفضل ظاهر في الحالتين.
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

  // ===== ملء الشاشة (بيتحكم فيه الأب) =====
  var stageRef = useRef<HTMLDivElement>(null)
  var iframeRef = useRef<HTMLIFrameElement>(null)
  var ffState = useState(false) // ملء شاشة وهمي (للمتصفحات اللي مش بتدعم)
  var fakeFs = ffState[0]
  var setFakeFs = ffState[1]
  // ملء الشاشة الحقيقي — state عشان الرندر يتبع حالته فورًا
  var rfState = useState(false)
  var realFs = rfState[0]
  var setRealFs = rfState[1]
  // أبعاد الصندوق الملفوف 90° — لو الموبايل طولي بنلف الفيديو بالعرض
  var rdState = useState({ w: 0, h: 0 })
  var rotDims = rdState[0]
  var setRotDims = rdState[1]
  var fsActiveRef = useRef(false)

  // إبلاغ صفحة المشغل (الـ iframe) بحالة ملء الشاشة عشان يظبط مقاسه
  function postFsState(on: boolean) {
    try {
      if (iframeRef.current && iframeRef.current.contentWindow) {
        iframeRef.current.contentWindow.postMessage({ type: 'mg_fs_state', on: on }, '*')
      }
    } catch (e) {}
  }

  function isFsNow(): boolean {
    var d = document as any
    return !!(d.fullscreenElement || d.webkitFullscreenElement)
  }

  function exitFs() {
    var d = document as any
    try {
      if (d.fullscreenElement || d.webkitFullscreenElement) {
        if (d.exitFullscreen) d.exitFullscreen().catch(function () {})
        else if (d.webkitExitFullscreen) d.webkitExitFullscreen()
      }
    } catch (e) {}
    try { var so = screen as any; if (so.orientation && so.orientation.unlock) so.orientation.unlock() } catch (e) {}
    if (fakeFs) setFakeFs(false)
    fsActiveRef.current = false
    postFsState(false)
  }

  function enterFakeFs() {
    setFakeFs(true)
    fsActiveRef.current = true
    postFsState(true)
  }

  function toggleFs() {
    if (isFsNow() || fakeFs) { exitFs(); return }
    var stage = stageRef.current
    if (!stage) return
    // قفل الدوران على العرض — لو اشتغل الجهاز هيلف لوحده (أندرويد)
    function tryLock() {
      try {
        var so = (screen as any).orientation
        if (so && so.lock) { var pr = so.lock('landscape'); if (pr && pr.catch) pr.catch(function () {}) }
      } catch (e) {}
    }
    var req = (stage as any).requestFullscreen || (stage as any).webkitRequestFullscreen
    if (req) {
      var pr = req.call(stage)
      if (pr && pr.then) {
        pr.then(function () { fsActiveRef.current = true; postFsState(true); tryLock() })
          .catch(function () { enterFakeFs() })
      } else { fsActiveRef.current = true; postFsState(true); tryLock() }
    } else {
      // آيفون سفاري / ويب فيو من غير ملء شاشة → وضع وهمي على الشاشة كلها
      enterFakeFs()
    }
  }
  useEffect(function () {
    var onMsg = function (ev: MessageEvent) {
      var d: any = ev.data
      if (!d || d.type !== 'mg_fs_toggle') return
      toggleFs()
    }
    window.addEventListener('message', onMsg)
    return function () { window.removeEventListener('message', onMsg) }
  }, [fakeFs])

  // تتبع ملء الشاشة الحقيقي (دخول + خروج بزرار الرجوع في أندرويد مثلًا)
  useEffect(function () {
    var onFsChange = function () {
      var fs = isFsNow()
      setRealFs(fs)
      if (fs) { fsActiveRef.current = true; postFsState(true) }
      else if (!fakeFs && fsActiveRef.current) {
        fsActiveRef.current = false
        postFsState(false)
      }
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return function () {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
      try { var so = screen as any; if (so.orientation && so.orientation.unlock) so.orientation.unlock() } catch (e) {}
    }
  }, [fakeFs])

  // في وضع الملء: لو الشاشة طولي → نلف الصندوق 90° بالعرض (16:9 يملّي الشاشة)
  // ولو الجهاز لفّ لوحده (landscape) → بنرجع الصندوق عادي يملّي الشاشة
  useEffect(function () {
    var fsActive = fakeFs || realFs
    if (!fsActive) { setRotDims({ w: 0, h: 0 }); return }
    function measure() {
      try {
        var w = window.innerWidth || 0
        var h = window.innerHeight || 0
        if (h > w) setRotDims({ w: h, h: w })
        else setRotDims({ w: 0, h: 0 })
      } catch (e) {}
    }
    measure()
    var t1 = setTimeout(measure, 200)
    var t2 = setTimeout(measure, 700)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return function () {
      clearTimeout(t1); clearTimeout(t2)
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [fakeFs, realFs])

  // مكان وصلناه آخر مرة → نبدأ من هناك
  // (2026-ط) ممنوع إن جلب نقطة التكملة يأخّر أو يعلّق فتح الفيديو:
  // مهلة 3.5 ثواني بالكتير — بعدها المشغل بيفتح عادي من الأول مهما كانت
  // حالة الطلب (الشبكة البطيئة عمرها ما هتقفل الفيديو تاني)
  useEffect(function () {
    var alive = true
    if (!studentId || !videoId) { setResume(0); return }
    var settled = false
    var to = setTimeout(function () { if (!settled && alive) { settled = true; setResume(0) } }, 3500)
    fetch('/api/video-progress?studentId=' + encodeURIComponent(studentId) + '&videoId=' + encodeURIComponent(videoId))
      .then(function (r) { return r.json() })
      .then(function (d) {
        if (!alive || settled) return
        settled = true
        clearTimeout(to)
        var rows = (d && d.progress) || []
        var w = rows.length ? Number(rows[0].watchedSeconds) || 0 : 0
        // 999999 = علامة "خلص الفيديو" — مش نقطة تكملة → نبدأ من الأول
        setResume(w > 5 && w < 999000 ? w : 0)
      })
      .catch(function () { if (alive && !settled) { settled = true; clearTimeout(to); setResume(0) } })
    return function () { alive = false; clearTimeout(to) }
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
    var onKey = function (e: KeyboardEvent) { if (e.key === 'Escape') { if (!isFsNow()) onClose() } }
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

  // وضع الملء: الصندوق بيبقى على الشاشة كلها (حقيقي أو وهمي)
  var fsActive = fakeFs || realFs
  var rotated = fsActive && rotDims.w > 0 && rotDims.h > 0
  var stageCls = fsActive
    ? 'fixed inset-0 z-[210] bg-black'
    : 'relative w-full max-w-5xl aspect-video bg-black rounded-lg overflow-hidden'
  var innerStyle: any = rotated
    ? {
        position: 'absolute',
        top: '50%',
        left: '50%',
        width: rotDims.w + 'px',
        height: rotDims.h + 'px',
        transform: 'translate(-50%, -50%) rotate(90deg)',
      }
    : undefined

  return (
    <div
      className={'fixed inset-0 z-[100] flex items-center justify-center ' + (fsActive ? 'bg-black p-0' : 'bg-black/95 p-2 sm:p-4')}
      onClick={onClose}
      onContextMenu={function (e) { e.preventDefault() }}
    >
      {/* زرار القفل — ثابت فوق يمين زي مودال المعرض (فوق طبقة الملء كمان) */}
      <button
        type="button"
        aria-label="إغلاق"
        className="fixed top-4 right-4 z-[220] min-h-[48px] min-w-[48px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
        onClick={function (e) { e.stopPropagation(); exitFs(); onClose() }}
        onTouchEnd={function (e) { e.preventDefault(); e.stopPropagation(); exitFs(); onClose() }}
      >
        <X className="h-6 w-6" />
      </button>

      <div ref={stageRef} className={stageCls} onClick={function (e) { e.stopPropagation() }}>
        <div className={rotated ? 'absolute overflow-hidden' : 'absolute inset-0 overflow-hidden'} style={innerStyle}>
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
              ref={iframeRef}
              src={src}
              title={title || 'مشغل آمن'}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
              allowFullScreen
              style={{ border: 'none' }}
            />
          )}
        </div>
        {title && !fsActive && (
          <div className="absolute -bottom-8 left-0 right-0 text-center pointer-events-none">
            <p className="text-white/80 text-xs truncate px-4">{title}</p>
          </div>
        )}
      </div>
    </div>
  )
}
