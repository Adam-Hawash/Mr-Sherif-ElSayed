'use client'

// ============================================================
// VideoCountdownGuard — (وN19 — طلب المستر الحرفي)
// ============================================================
// «انا عاوز اي حد يفتح في الفيديو، سواء من التلات نقط أو الفيديو يفتح
//  ذات نفسه — 10 ثواني بالعد التنازلي 10 9 8 وهكذا — ان هو لو ما قفلش
//  هحاول اجيب لينك الفيديو، حسابه هيترفض من المنصة تماما ومش هيقدر
//  يدخل على المنصة تاني. ولو قفل على طول الاشعار ده بيروح بيكمل هو.
//  الاشعار ده بيبقى بيجيله المنصة بالكامل.
//  بعد 10 ثواني لما تخلص، خرجه بره المنصة تقول له حسابك اترفض من المنصة
//  ويتقفل له كل حاجة — وانا اللي اقدر أرجّعه من صفحة الأدمن بس»
//
// إزاي بيشتغل؟
//   1) أي فتح فيديو في المنصة (مشغل الدروس الآمن — دروس/صفحة فيديو/جاليري)
//      بيتبعت له إشارة mg_video_opened من src/lib/video-guard.ts
//   2) شاشة التنبيه بتظهر فوق المنصة كلها (fixed z-max) فيها العد التنازلي
//      10 → 9 → 8 ... وزرار «إغلاق التنبيه» واضح
//   3) قفل التنبيه قبل الصفر → بيختفي والطالب يكمل عادي
//   4) الصفر من غير قفل → محاولة يجيب لينك الفيديو:
//      POST /api/security/reject-account بيحول حساب الطالب لـ status=rejected
//      (محمي ببصمة الجهاز — مستحيل حد يرفض حساب غيره) + كل الجلسات بتتقفل
//      + شاشة «حسابك اترفض من المنصة» دائمة في التاب حتى بعد Refresh
//   5) تسجيل الدخول بعد الرفض بيتمنع من /api/students برسالة
//      «حسابك اترفض من المنصة» — والرجوع للشغل من صفحة الأدمن فقط
//      (تاب الطلاب المرفوضين → زرار القبول)
//   6) الأدمن مستثنى تمامًا — والأولياء مش بيتأثروا (الحساب المستهدف طالب)
// ============================================================
import { useEffect } from 'react'
import { getDeviceCandidates, getDeviceId } from '@/lib/device'
import { VIDEO_OPENED_EVENT } from '@/lib/video-guard'

const LOCK_KEY = 'vg_guard_locked'
const COUNT_SECONDS = 10

export function VideoCountdownGuard() {
  useEffect(function () {
    if (typeof window === 'undefined') return

    /* الأدمن مستثنى — أي مفتاح جلسة فيه كلمة admin = مش هنشغّل الحارس */
    function isAdminSession(): boolean {
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
          if (k === 'ln' || /student/i.test(k)) {
            if (/admin/i.test(k)) continue
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

    function clearSessions() {
      try {
        var kill: string[] = []
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i) || ''
          if (k === 'ln' || /student|parent/i.test(k)) kill.push(k)
        }
        for (var j = 0; j < kill.length; j++) localStorage.removeItem(kill[j])
        sessionStorage.setItem(LOCK_KEY, '1')
      } catch (e) {}
    }

    function baseStyles(): string {
      return 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center;direction:rtl;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;padding:24px'
    }

    /* ===== شاشة النهائي: الحساب اترفض ===== */
    function renderFinal() {
      try { document.body.style.overflow = 'hidden' } catch (e) {}
      var o = document.getElementById('vg-guard') as HTMLElement | null
      if (!o) {
        o = document.createElement('div')
        o.id = 'vg-guard'
        o.setAttribute('role', 'alert')
        o.setAttribute('aria-live', 'assertive')
        o.style.cssText = baseStyles()
        document.body.appendChild(o)
      }
      o.innerHTML =
        '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:16px">' +
        '<div style="font-size:64px;line-height:1">⛔</div>' +
        '<div style="font-size:28px;font-weight:900;color:#f87171">حسابك اترفض من المنصة</div>' +
        '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">المهلة خلصت والتنبيه ما اتقفلش — وده بيتحسب محاولة يجيب لينك الفيديو.<br/>كل حاجة اتقفلت والحساب مش هيقدر يدخل المنصة تاني.<br/>كلم المستر لو ده حصل بالغلط — هو اللي وحده اللي يقدر يرجّع حسابك من صفحة الأدمن.</div>' +
        '</div>'
    }

    /* ===== التنبيه بعد التنازلي + زرار القفل ===== */
    var left = COUNT_SECONDS
    var active = false
    var done = false
    var numEl: HTMLElement | null = null
    var barEl: HTMLElement | null = null
    var countdownTimer: any = null

    function stopCountdown() {
      if (countdownTimer) { clearInterval(countdownTimer); countdownTimer = null }
    }

    function hide() {
      stopCountdown()
      active = false
      var o = document.getElementById('vg-guard')
      if (o && o.parentNode) o.parentNode.removeChild(o)
      try { document.body.style.overflow = '' } catch (e) {}
    }

    function renderBanner() {
      var existing = document.getElementById('vg-guard') as HTMLElement | null
      if (!existing) {
        existing = document.createElement('div')
        existing.id = 'vg-guard'
        existing.setAttribute('role', 'alert')
        existing.setAttribute('aria-live', 'assertive')
        existing.style.cssText = baseStyles()
        document.body.appendChild(existing)
        try { document.body.style.overflow = 'hidden' } catch (e) {}
      }
      var o = existing as HTMLElement
      o.innerHTML =
        '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:18px">' +
        '<div style="font-size:60px;line-height:1">📹</div>' +
        '<div style="font-size:24px;font-weight:900;letter-spacing:.5px">تنبيه حماية الفيديو</div>' +
        '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">لو حاولت تجيب لينك الفيديو أو تصوره — ' +
        '<b style="color:#f87171">حسابك هيترفض من المنصة تمامًا ومش هتقدر تدخل تاني</b><br/>لو مش قصدك دوس «إغلاق التنبيه» قبل الصفر وكمّل عادي</div>' +
        '<div id="vg-num" style="font-size:88px;font-weight:900;color:#f87171;font-variant-numeric:tabular-nums;line-height:1">' + left + '</div>' +
        '<div style="width:100%;max-width:340px;height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">' +
        '<div id="vg-bar" style="height:100%;width:' + Math.max(0, (left / COUNT_SECONDS) * 100) + '%;background:#f87171;border-radius:99px;transition:width 1s linear"></div>' +
        '</div>' +
        '<button id="vg-close" type="button" style="margin-top:6px;padding:14px 34px;border-radius:14px;border:0;cursor:pointer;font-size:16px;font-weight:900;font-family:inherit;background:#f87171;color:#fff;box-shadow:0 6px 18px rgba(248,113,113,.35)">إغلاق التنبيه ✓</button>' +
        '<div style="font-size:12px;color:#71717a">المنصة بتحمي مجهود المستر وحق الطلاب اللي دفعوا</div>' +
        '</div>'
      numEl = o.querySelector('#vg-num')
      barEl = o.querySelector('#vg-bar')
      var closeBtn = o.querySelector('#vg-close')
      if (closeBtn) {
        closeBtn.addEventListener('click', function (ev: any) {
          try { ev.preventDefault(); ev.stopPropagation() } catch (e) {}
          hide()
        })
      }
      /* لو حد شال العنصر نفسه من الـ DOM بالأدوات — بنرجّعه فورًا */
      var watchdog = setInterval(function () {
        if (!active) { clearInterval(watchdog); return }
        if (!document.getElementById('vg-guard')) renderBanner()
      }, 900)
    }

    function startCountdown() {
      stopCountdown()
      countdownTimer = setInterval(function () {
        if (!active || done) { stopCountdown(); return }
        left--
        if (numEl) numEl.textContent = String(Math.max(0, left))
        if (barEl) barEl.style.width = Math.max(0, (left / COUNT_SECONDS) * 100) + '%'
        if (left <= 0) {
          punish()
        }
      }, 1000)
    }

    function punish() {
      stopCountdown()
      active = false
      done = true
      var st = readStudent()
      var payload: any = { studentId: st ? st.id : '' }
      try {
        /* بصمة الجهاز — عشان السيرفر يتأكد إن الطلب من جهاز صاحب الحساب نفسه */
        payload.deviceId = getDeviceId()
        payload.candidates = getDeviceCandidates()
      } catch (e) {}
      clearSessions()
      try {
        fetch('/api/security/reject-account', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function () {})
      } catch (e) {}
      renderFinal()
    }

    /* ===== مستمع إشارة فتح الفيديو ===== */
    function onVideoOpened() {
      try {
        if (sessionStorage.getItem(LOCK_KEY) === '1') return /* التاب مقفول نهائي */
      } catch (e) {}
      if (done) return
      if (isAdminSession()) return /* الأدمن مستثنى */
      if (!readStudent()) return /* مفيش جلسة طالب — مفيش حساب نقدر نرفضه */
      left = COUNT_SECONDS
      active = true
      renderBanner()
      startCountdown()
    }

    /* تاب متقفل نهائي (الرفض حصل قبل كده في نفس التاب) */
    try {
      if (sessionStorage.getItem(LOCK_KEY) === '1') {
        renderFinal()
        done = true
        return
      }
    } catch (e) {}

    window.addEventListener(VIDEO_OPENED_EVENT, onVideoOpened as any)
    return function () {
      window.removeEventListener(VIDEO_OPENED_EVENT, onVideoOpened as any)
      stopCountdown()
    }
  }, [])
  return null
}
