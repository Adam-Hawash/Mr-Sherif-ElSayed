'use client'

// ============================================================
// DevToolsGuard — الحارس الموحد (ر8 — طلب المستر الحرفي المحدّث)
// ============================================================
// «أنا بفتح الـ Developer Tools اهو بيظهر لي لينك اليوتيوب» —
// «أي حد يفتح الـ Developer Tools وهو شغال الفيديو → أول ما يفتح
//  DevTools فورًا: شاشة المنصة تقلب سودة + تحذير بعد تنازلي
//  8→7→6→...→0 بنص «إلا هتخرج من المنصة» — لو قفل الـ DevTools على
//  طول خلال العدّ يكمل عادي — لو العد خلص أو حاول يجيب لينك الفيديو
//  حسابه يترفض نهائيًا برسالة «حسابك مرفوض من المنصة» ويتقفل له كل
//  حاجة ولا يدخل تاني — والمستر فقط يقدر يرجّعه من صفحة الأدمن»
//  + «المهلة 8 ثواني بدل 10 — والمهلة أقدر أتحكم فيها من صفحة
//    الأدمن» → الإعداد guard_countdown_seconds في لوحة «حماية
//    الفيديوهات» (افتراضي 8 — يقبل من 3 لـ 120).
//
// سيناريوهات الحارس:
//   1) الطالب فتح فيديو → تنبيه حماية الفيديو بمهلة العدّ — قفل
//      التنبيه (زرار إغلاق) أو قفل الفيديو قبل الصفر = مسامحة
//   2) فتح أدوات المطوّر (الفيديو شغال أو لا) → **شاشة سودة فورية**
//      بنفس المهلة (لو مفيش فيديو مفتوح المهلة 35 ثواني زي قرار ز19)
//      — قفل الأدوات قبل الصفر = مسامحة وبيكمل عادي
//   3) الصفر من غير قفل → محاولة وصول للينك/الكود:
//      نضرب فورًا: تدمير كل الـ iframes والفيديوهات من الصفحة (منع
//      النسخ) + POST /api/security/reject-account بيحوّل الحساب
//      status=rejected (مش مسح — المستر يرجّعه من الأدمن) + قفل
//      الجلسات + شاشة «حسابك مرفوض من المنصة» دائمة في التاب حتى
//      بعد Refresh — والدخول بيتمنع من /api/students برسالة عربية
//
// الكشف — 4 إشارات مستقلة (درس 2026-ز11: صفر إنذارات كاذبة):
//   أ) فجوة مقاس النافذة معقّمة من الزووم: زووم المتصفح بيغيّر
//      devicePixelRatio — أي تغيير dpr = زووم/سيلينج نظام (بنعيد
//      ضبط المرجع) — أدوات مطوّرة مثبتة بيكبر الفجوة من غير أي
//      تغيير dpr = إشارة (الزووم 125%/150% والسايدبارات سليمة)
//   ب) توقيت جملة debugger — الأدوات مفتوحة والـ breakpoints شغالة
//      = التنفيذ بيفصل عند الجملة (من الحارس القديم ز19)
//   ج) فخ الكونسول: object بخاصية getter بنسجله كل ثانيتين والأدوات
//      مفتوحة — الكونسول لما يعرضه بيشغّل الـ getter حتى لو الأدوات
//      في نافذة منفصلة (undocked) أو موبايل بفحص عن بعد
//   د) صدمة البلاغات المتأخرة: مشغّل الفيديو المحمي بيبعت بلاغ
//      mg_vp بطابع زمني — لو وصل متأخر عن طابعه أكتر من 10 ثواني =
//      الصفحة كانت مجمّدة (خدعة إيقاف الـ debugger عشان يشوف
//      الفيديو في الـ iframe بس) → إشارة
//
// العدّ على **ساعة الحائط** (Date.now) مش عدّاد تيك — تجميد الصفحة
// من الـ debugger ما بيمددش ولا يوقفش العد: أول ما الصفحة تفضلش
// بتحصل على نفسها، العد بيتلاقى منتهي فورًا.
//
// الأدمن مستثنى (قرار ز19): جلسة أدمن بدون جلسة طالب = الحارس ما
// بيشتغلش أصلًا — المستر يفتح أدوات المطوّر براحته، وأولياء الأمور
// مش بيتهمسهم الحارس أصلًا (مفيش حساب طالب يترفض).
// ============================================================
import { useEffect } from 'react'
import { getDeviceCandidates, getDeviceId } from '@/lib/device'
import {
  VIDEO_OPENED_EVENT,
  VIDEO_CLOSED_EVENT,
  GUARD_COUNTDOWN_KEY,
  GUARD_COUNTDOWN_DEFAULT,
} from '@/lib/video-guard'

const LOCK_KEY = 'dv_guard_locked'
/* قرار ز19: أدوات المطوّر من غير فيديو مفتوح = مهلة 35 ثواني */
const LEGACY_DT_MS = 35 * 1000
/* فجوة المقاس اللي بتعتبر أدوات مطوّرة (الدرس: 160 كان بيعمل إنذارات — 170 آمن) */
const Z_GAP = 170

export function DevToolsGuard() {
  useEffect(function () {
    if (typeof window === 'undefined') return

    /* ===== جلسات ===== */
    function hasAdminKey(): boolean {
      try {
        for (var li = 0; li < localStorage.length; li++) {
          var lk = localStorage.key(li) || ''
          if (/admin/i.test(lk)) return true
        }
      } catch (e) {}
      return false
    }

    function readStudent(): { id: string } | null {
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i) || ''
          if (/admin/i.test(k)) continue
          if (k === 'ln' || /student/i.test(k)) {
            var raw = localStorage.getItem(k) || ''
            if (raw && raw.charAt(0) === '{') {
              var o = JSON.parse(raw)
              if (o && o.id) return { id: String(o.id) }
            }
          }
        }
      } catch (e) {}
      return null
    }

    /* الأدمن مستثنى بس لو مفيش جلسة طالب على نفس المتصفح — لو الطالب
       مسجّل، الحارس شغال عادي (حماية الحساب أهم) */
    if (hasAdminKey() && !readStudent()) return

    /* تاب متقفل نهائي (الرفض حصل قبل كده في نفس التاب) */
    try {
      var lockedVal = sessionStorage.getItem(LOCK_KEY) || ''
      if (lockedVal === 'rejected') { renderFinal('rejected'); return }
      if (lockedVal === '1') { renderFinal('locked'); return }
    } catch (e) {}

    /* ===== الإعداد: مهلة العدّ من لوحة الأدمن (افتراضي 8 ثواني) ===== */
    var countMs = GUARD_COUNTDOWN_DEFAULT * 1000
    try {
      fetch('/api/site-config')
        .then(function (r) { return r.json() })
        .then(function (arr: any) {
          if (!Array.isArray(arr)) return
          for (var i = 0; i < arr.length; i++) {
            var c = arr[i]
            if (c && c.key === GUARD_COUNTDOWN_KEY && c.value !== '' && c.value != null) {
              var n = parseInt(String(c.value), 10)
              if (isNaN(n)) return
              if (n < 3) n = 3
              if (n > 120) n = 120
              countMs = n * 1000
            }
          }
        })
        .catch(function () {})
    } catch (e) {}

    /* ===== الحالة ===== */
    var done = false
    var running = false
    var videoOpen = false
    var dismissed = false
    var dtOpen = false
    var mode: '' | 'warn' | 'black' = ''
    var prevMode: '' | 'warn' | 'black' = ''
    var deadline = 0
    var armedDurMs = 0
    var lastShown = -1

    /* ===== إشارات أدوات المطوّر ===== */
    var dpr0 = (window.devicePixelRatio as number) || 1
    var gap0 = (window.outerWidth || 0) - (window.innerWidth || 0)
    var sizePos = 0
    var dbgPos = 0
    var cleanStreak = 0
    var lastGetterHit = 0
    var lastStaleHit = 0
    var tickNo = 0

    function sizeSignal(): boolean {
      try {
        var dpr = (window.devicePixelRatio as number) || 1
        if (Math.abs(dpr - dpr0) > 0.015) {
          /* زووم متصفح أو تغيير سيلينج النظام — سليم: بنعيد ضبط المرجع */
          dpr0 = dpr
          gap0 = (window.outerWidth || 0) - (window.innerWidth || 0)
          sizePos = 0
          return false
        }
        var gap = (window.outerWidth || 0) - (window.innerWidth || 0)
        return gap - gap0 > Z_GAP
      } catch (e) { return false }
    }

    function dbgSignal(): boolean {
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now()
      try {
        /* جملة debugger داخل دالة متولدة — الأدوات مفتوحة والـ
           breakpoints شغالة = التنفيذ بيفصل عند الجملة */
        (function () {} as any).constructor('debugger')()
      } catch (e) {}
      var dt = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0
      return dt > 50
    }

    /* فخ الكونسول — getter بيتشغل لما الكونسول يعرض الـ object */
    var trapObj: any = {}
    try {
      Object.defineProperty(trapObj, 'id', {
        get: function () { lastGetterHit = Date.now(); return '' },
        configurable: true,
      })
    } catch (e) {}

    /* بلاغات المشغل المتأخرة = الصفحة كانت مجمّدة */
    function onPlayerMessage(ev: MessageEvent) {
      try {
        var d: any = ev && ev.data
        if (!d || typeof d !== 'object') return
        if (d.type === 'mg_vp' && d.tm) {
          if (Date.now() - Number(d.tm) > 10000) lastStaleHit = Date.now()
        }
      } catch (e) {}
    }

    /* ===== منع النسخ: تدمير كل الـ iframes والفيديوهات من الصفحة =====
       بيتنفذ لحظة تأكيد فتح أدوات المطوّر وعند الرفض — عشان لينك
       المشغل/اليوتيوب يختفي من الـ DOM قبل ما حد يلحق ينسخه */
    function nukeMedia() {
      try {
        var fr = document.querySelectorAll('iframe')
        for (var i = 0; i < fr.length; i++) {
          var f = fr[i] as HTMLIFrameElement
          try { f.src = 'about:blank' } catch (e) {}
          try { if (f.parentNode) f.parentNode.removeChild(f) } catch (e) {}
        }
        var vd = document.querySelectorAll('video')
        for (var j = 0; j < vd.length; j++) {
          try { (vd[j] as HTMLVideoElement).pause() } catch (e) {}
          try { vd[j].removeAttribute('src') } catch (e) {}
          try { (vd[j] as HTMLVideoElement).load() } catch (e) {}
        }
      } catch (e) {}
    }

    /* ===== أحداث فتح/قفل الفيديو (من المشغل الآمن) ===== */
    function onVideoOpen() {
      if (done || videoOpen) return
      if (!readStudent()) return /* مفيش جلسة طالب — مفيش حساب نقدر نرفضه */
      videoOpen = true
      dismissed = false /* فيديو جديد = تنبيه جديد */
      recompute()
    }
    function onVideoClose() {
      if (done) return
      if (!videoOpen) return
      videoOpen = false
      recompute()
    }
    function onResizeEvt() { if (!done) tickBody() }
    try {
      window.addEventListener(VIDEO_OPENED_EVENT, onVideoOpen as EventListener)
      window.addEventListener(VIDEO_CLOSED_EVENT, onVideoClose as EventListener)
      window.addEventListener('message', onPlayerMessage as EventListener)
      window.addEventListener('resize', onResizeEvt as EventListener)
    } catch (e) {}

    /* ===== آلة الحالة — العدّ على ساعة الحائط ===== */
    function blackDurMs(): number {
      return videoOpen ? countMs : LEGACY_DT_MS
    }

    function recompute() {
      if (done) return
      var armedBlack = dtOpen
      var armedWarn = videoOpen && !dismissed
      if (!armedBlack && !armedWarn) {
        if (running) {
          /* المسامحة — الأدوات/الفيديو اتقفلوا قبل الصفر: الاشعار بيروح وبيكمل عادي */
          running = false
          deadline = 0
          mode = ''
          prevMode = ''
          removeUI()
        }
        return
      }
      if (armedBlack) {
        mode = 'black'
        if (prevMode !== 'black') {
          /* أول ما الأدوات تتفتح: سودة فورية + عدّ كامل من الأول */
          deadline = Date.now() + blackDurMs()
          armedDurMs = blackDurMs()
          running = true
          nukeMedia() /* منع النسخ: المشغل/اليوتيوب يختفي من الـ DOM فورًا */
          renderMode()
          lastShown = -1
          paintCount()
        }
      } else {
        mode = 'warn'
        if (prevMode !== 'warn') {
          deadline = Date.now() + countMs
          armedDurMs = countMs
          running = true
          renderMode()
          lastShown = -1
          paintCount()
        }
      }
      prevMode = mode
    }

    /* ===== حلقة التشغيل (500ms) ===== */
    var timer = setInterval(tickBody, 500)

    function tickBody() {
      if (done) return
      tickNo++

      if (tickNo % 2 === 0) { if (dbgSignal()) { dbgPos++; cleanStreak = 0 } else { dbgPos = 0; cleanStreak++ } }
      if (sizeSignal()) { sizePos++; cleanStreak = 0 } else { sizePos = 0; cleanStreak++ }

      /* فخ الكونسول — لما الفيديو مفتوح أو العدّ شغال.
         log عادي من غير %c عشان الكونسول يعرض الـ object ويشغّل الـ getter */
      if ((videoOpen || running) && tickNo % 4 === 0) {
        try { console.log(trapObj) } catch (e) {}
      }

      var getterFresh = (Date.now() - lastGetterHit) < 3000
      var staleFresh = (Date.now() - lastStaleHit) < 5000
      var pos = sizePos >= 2 || dbgPos >= 2 || getterFresh || staleFresh

      if (pos) {
        cleanStreak = 0
        if (!dtOpen) {
          if (readStudent()) { dtOpen = true; recompute() }
        }
      } else if (dtOpen && cleanStreak >= 6) {
        /* الأدوات اتقفلت 3 ثواني نضيفة = مسامحة (طلب المستر الحرفي) */
        dtOpen = false
        recompute()
      }

      recompute()

      if (running) {
        paintCount()
        /* لو حد شال العنصر نفسه من الـ DOM بالأدوات — بنرجّعه فورًا */
        if (mode === 'black' && !document.getElementById('mg-guard-black')) renderMode()
        if (mode === 'warn' && !document.getElementById('mg-guard-warn')) renderMode()
        /* الصفر على ساعة الحائط — تجميد الصفحة ما بينفعش */
        if (Date.now() >= deadline) { punish(); return }
      }
    }

    /* ===== الرسم ===== */
    var numEl: HTMLElement | null = null
    var barEl: HTMLElement | null = null

    function secsLeft(): number {
      var left = Math.ceil((deadline - Date.now()) / 1000)
      if (left < 0) left = 0
      return left
    }

    function paintCount() {
      if (!running || done) return
      var left = secsLeft()
      if (left === lastShown) return
      lastShown = left
      if (numEl) numEl.textContent = String(left)
      if (barEl) {
        var pct = armedDurMs > 0 ? Math.max(0, ((deadline - Date.now()) * 100) / armedDurMs) : 0
        if (pct > 100) pct = 100
        barEl.style.width = pct + '%'
      }
    }

    function removeUI() {
      try {
        var w = document.getElementById('mg-guard-warn')
        if (w && w.parentNode) w.parentNode.removeChild(w)
        var b = document.getElementById('mg-guard-black')
        if (b && b.parentNode) b.parentNode.removeChild(b)
      } catch (e) {}
      numEl = null
      barEl = null
    }

    function baseStyles(): string {
      return 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center;direction:rtl;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;padding:24px'
    }

    function renderMode() {
      removeUI()
      var secs = Math.max(1, Math.round((mode === 'black' ? blackDurMs() : countMs) / 1000))
      if (mode === 'black') {
        var o = document.createElement('div')
        o.id = 'mg-guard-black'
        o.setAttribute('role', 'alert')
        o.setAttribute('aria-live', 'assertive')
        o.style.cssText = baseStyles()
        o.innerHTML =
          '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:16px">' +
          '<div style="font-size:60px;line-height:1">🛡️</div>' +
          '<div style="font-size:24px;font-weight:900;letter-spacing:.5px">أدوات المطوّر ممنوعة على المنصة</div>' +
          '<div style="font-size:15px;color:#d4d4d8;line-height:1.9">عندك <b style="color:#fbbf24">' + secs + ' ثواني</b> بس — اقفل أدوات المطوّر فورًا<br/>' +
          '<b style="color:#f87171">إلا هتخرج من المنصة وحسابك هيترفض نهائيًا</b> ومش هتقدر تدخل تاني</div>' +
          '<div id="mg-num" style="font-size:92px;font-weight:900;color:#f87171;font-variant-numeric:tabular-nums;line-height:1">' + secs + '</div>' +
          '<div style="width:100%;max-width:340px;height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">' +
          '<div id="mg-bar" style="height:100%;width:100%;background:#f87171;border-radius:99px;transition:width .5s linear"></div>' +
          '</div>' +
          '<div style="font-size:12px;color:#71717a">المنصة بتحمي مجهود المستر وحق الطلاب اللي دفعوا</div>' +
          '</div>'
        document.body.appendChild(o)
        try { document.body.style.overflow = 'hidden' } catch (e) {}
        numEl = o.querySelector('#mg-num')
        barEl = o.querySelector('#mg-bar')
      } else if (mode === 'warn') {
        var w = document.createElement('div')
        w.id = 'mg-guard-warn'
        w.setAttribute('role', 'alert')
        w.setAttribute('aria-live', 'assertive')
        w.style.cssText = baseStyles()
        w.innerHTML =
          '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:18px">' +
          '<div style="font-size:60px;line-height:1">📹</div>' +
          '<div style="font-size:24px;font-weight:900;letter-spacing:.5px">تنبيه حماية الفيديو</div>' +
          '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">لو حاولت تجيب لينك الفيديو أو تصوره — ' +
          '<b style="color:#f87171">حسابك هيترفض من المنصة تمامًا ومش هتقدر تدخل تاني</b><br/>لو مش قصدك دوس «إغلاق التنبيه» قبل الصفر وكمّل عادي</div>' +
          '<div id="mg-num" style="font-size:88px;font-weight:900;color:#f87171;font-variant-numeric:tabular-nums;line-height:1">' + secs + '</div>' +
          '<div style="width:100%;max-width:340px;height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">' +
          '<div id="mg-bar" style="height:100%;width:100%;background:#f87171;border-radius:99px;transition:width .5s linear"></div>' +
          '</div>' +
          '<button id="mg-vg-dismiss" type="button" style="margin-top:6px;padding:14px 34px;border-radius:14px;border:0;cursor:pointer;font-size:16px;font-weight:900;font-family:inherit;background:#f87171;color:#fff;box-shadow:0 6px 18px rgba(248,113,113,.35)">إغلاق التنبيه ✓</button>' +
          '<div style="font-size:12px;color:#71717a">المنصة بتحمي مجهود المستر وحق الطلاب اللي دفعوا</div>' +
          '</div>'
        document.body.appendChild(w)
        try { document.body.style.overflow = 'hidden' } catch (e) {}
        numEl = w.querySelector('#mg-num')
        barEl = w.querySelector('#mg-bar')
        var btn = w.querySelector('#mg-vg-dismiss')
        if (btn) {
          btn.addEventListener('click', function (ev: any) {
            try { ev.preventDefault(); ev.stopPropagation() } catch (e) {}
            dismissed = true
            recompute()
          })
        }
      }
    }

    function renderFinal(kind: 'rejected' | 'locked') {
      done = true
      running = false
      removeUI()
      try { document.body.style.overflow = 'hidden' } catch (e) {}
      var o = document.getElementById('mg-guard-final') as HTMLElement | null
      if (!o) {
        o = document.createElement('div')
        o.id = 'mg-guard-final'
        o.setAttribute('role', 'alert')
        o.style.cssText = baseStyles()
        document.body.appendChild(o)
      }
      o.innerHTML =
        '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:16px">' +
        '<div style="font-size:64px;line-height:1">' + (kind === 'rejected' ? '🚫' : '🛡️') + '</div>' +
        (kind === 'rejected'
          ? '<div style="font-size:28px;font-weight:900">حسابك مرفوض من المنصة</div>' +
            '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">اتقفل كل حاجة — مش هتقدر تدخل على المنصة تاني<br/>إلا لما المستر يعيد تفعيل حسابك من صفحة الأدمن.<br/><b style="color:#fbbf24">لو ده حصل بالغلط — كلم المستر وهو هيرجّعك.</b></div>'
          : '<div style="font-size:26px;font-weight:900">اتقفل الدخول للمنصة</div>' +
            '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">أدوات المطوّر ممنوعة تمامًا على المنصة.</div>') +
        '</div>'
    }

    /* ===== العقوبة: الرفض النهائي (مش مسح — المستر يرجّعه من الأدمن) ===== */
    function punish() {
      if (done) return
      done = true
      running = false
      nukeMedia()
      removeUI()
      try { clearInterval(timer) } catch (e) {}
      var st = readStudent()
      if (st && st.id) {
        try { sessionStorage.setItem(LOCK_KEY, 'rejected') } catch (e) {}
        renderFinal('rejected')
        var payload: any = {
          studentId: st.id,
          reason: videoOpen ? 'video' : 'devtools',
        }
        try {
          payload.deviceId = getDeviceId()
          payload.candidates = getDeviceCandidates()
        } catch (e) {}
        try {
          fetch('/api/security/reject-account', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
            keepalive: true,
          }).catch(function () {})
        } catch (e) {}
        setTimeout(function () {
          try { clearSessions() } catch (e) {}
          try { location.replace('/') } catch (e) {}
        }, 900)
      } else {
        try { sessionStorage.setItem(LOCK_KEY, '1') } catch (e) {}
        clearSessions()
        renderFinal('locked')
      }
    }

    function clearSessions() {
      try {
        var kill: string[] = []
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i) || ''
          if (k === 'ln' || /student|parent/i.test(k)) kill.push(k)
        }
        for (var j = 0; j < kill.length; j++) localStorage.removeItem(kill[j])
      } catch (e) {}
    }

    /* بداية نظيفة */
    return function cleanup() {
      try {
        clearInterval(timer)
        window.removeEventListener(VIDEO_OPENED_EVENT, onVideoOpen as EventListener)
        window.removeEventListener(VIDEO_CLOSED_EVENT, onVideoClose as EventListener)
        window.removeEventListener('message', onPlayerMessage as EventListener)
        window.removeEventListener('resize', onResizeEvt as EventListener)
      } catch (e) {}
    }
  }, [])
  return null
}
