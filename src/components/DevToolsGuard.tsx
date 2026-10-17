'use client'
// ============================================================
// DevToolsGuard — (ز19 — طلب المستر الحرفي)
// ============================================================
// «لو أي حد فتح أدوات المطوّر سواء من صفحة تانية أو جابها من التلات
//  نقط اللي فوق — يلاقي شاشة سودة خالص مكتوب عليها إن أدوات المطوّر
//  ممنوعة + عداد 35 ثانية شغال قدامه — لو ما قفلهاش قبل الصفر،
//  حسابه بيتسحب من على المنصة نهائيًا.»
//
// إزاي بيكتشف؟ (بدون إنذارات كاذبة — اخد درس 2026-ز11):
//   كاشف مقاس النافذة القديم كان بيعمل إنذارات كاذبة لزووم المتصفح
//   125%/150% وسايدبارات إيدج/أوبرا — اتشال خالص. هنا بنستخدم
//   **توقيت جملة debugger بس**: لما أدوات المطوّر مقفولة الجملة بتنفّذ
//   فورًا (أقل من مللي)، ولما تكون مفتوحة المتصفح بيفصل التنفيذ عندها
//   فالوقت بيقفز فوق 50ms — وده مبيحصلش لأي سبب تاني (الزووم
//   والسايدبار مبيأثروش عليها خالص). بنطلب إيجابيتين ورا بعض
//   (~2 ثانية أدوات مفتوحة فعلًا) قبل ما الشاشة تظهر.
//
// سيناريو الشاشة:
//   1) شاشة سودة كاملة فوق كل حاجة + عداد 35 ثانية شغال قدامه
//   2) لو قفل أدوات المطوّر قبل الصفر → الشاشة بتختفي والحساب سالم
//   3) عند الصفر → POST /api/security/devtools-strike بيمسح الحساب
//      (محمي ببصمة جهاز إنشاء الحساب — مستحيل حد يمسح حساب غيره)
//      + قفل أسود دائم في التاب ده حتى بعد Refresh (sessionStorage)
//   4) الأدمن مستثنى تمامًا (المستر يفتح أدوات المطوّر براحته)
// ============================================================
import { useEffect } from 'react'
import { getDeviceCandidates, getDeviceId } from '@/lib/device'

const LOCK_KEY = 'dv_guard_locked'
const COUNT_SECONDS = 35

export function DevToolsGuard() {
  useEffect(function () {
    if (typeof window === 'undefined') return

    /* الأدمن مستثنى — أي مفتاح جلسة فيه كلمة admin = مش هنشغّل الحارس */
    try {
      for (var li = 0; li < localStorage.length; li++) {
        var lk = localStorage.key(li) || ''
        if (/admin/i.test(lk)) return
      }
    } catch (e) {}

    var overlay: HTMLElement | null = null
    var numEl: HTMLElement | null = null
    var barEl: HTMLElement | null = null
    var hits = 0
    var cleanStreak = 0
    var left = COUNT_SECONDS
    var active = false
    var done = false

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

    /* كشف واحد — true يعني أدوات المطوّر مفتوحة فعلًا دلوقتي */
    function detectOnce(): boolean {
      var t0 = (window.performance && performance.now) ? performance.now() : Date.now()
      try {
        /* جملة debugger داخل دالة متولدة — لو الأدوات مفتوحة التنفيذ بيفصل عندها */
        (function () {} as any).constructor('debugger')()
      } catch (e) {}
      var dt = ((window.performance && performance.now) ? performance.now() : Date.now()) - t0
      return dt > 50
    }

    function baseStyles(): string {
      return 'position:fixed;inset:0;z-index:2147483647;background:#000;display:flex;align-items:center;justify-content:center;direction:rtl;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#fff;text-align:center;padding:24px'
    }

    function render() {
      var existing = document.getElementById('dv-guard') as HTMLElement | null
      if (!existing) {
        overlay = document.createElement('div')
        overlay.id = 'dv-guard'
        overlay.setAttribute('role', 'alert')
        overlay.setAttribute('aria-live', 'assertive')
        overlay.style.cssText = baseStyles()
        document.body.appendChild(overlay)
        try { document.body.style.overflow = 'hidden' } catch (e) {}
      } else {
        overlay = existing
      }
      var o = overlay as HTMLElement
      o.innerHTML =
        '<div style="max-width:520px;display:flex;flex-direction:column;align-items:center;gap:18px">' +
        '<div style="font-size:64px;line-height:1">🛡️</div>' +
        '<div style="font-size:24px;font-weight:900;letter-spacing:.5px">أدوات المطوّر ممنوعة على المنصة</div>' +
        '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">لو ما قفلتش أدوات المطوّر قبل الصفر — ' +
        '<b style="color:#f87171">حسابك هيتسحب من على المنصة نهائيًا</b><br/>اقفل الأدوات دلوقتي ورجّع العد للصفر</div>' +
        '<div id="dv-num" style="font-size:88px;font-weight:900;color:#f87171;font-variant-numeric:tabular-nums;line-height:1">' + left + '</div>' +
        '<div style="width:100%;max-width:340px;height:8px;border-radius:99px;background:rgba(255,255,255,.14);overflow:hidden">' +
        '<div id="dv-bar" style="height:100%;width:' + Math.max(0, (left / COUNT_SECONDS) * 100) + '%;background:#f87171;border-radius:99px;transition:width 1s linear"></div>' +
        '</div>' +
        '<div style="font-size:12px;color:#71717a">المنصة بتحمي مجهود المستر وحق الطلاب اللي دفعوا</div>' +
        '</div>'
      numEl = o.querySelector('#dv-num')
      barEl = o.querySelector('#dv-bar')
    }

    function renderFinal(studentWasDeleted: boolean) {
      done = true
      active = false
      try { document.body.style.overflow = 'hidden' } catch (e) {}
      var o = document.getElementById('dv-guard') as HTMLElement | null
      if (!o) {
        o = document.createElement('div')
        o.id = 'dv-guard'
        o.setAttribute('role', 'alert')
        o.style.cssText = baseStyles()
        document.body.appendChild(o)
      }
      o.innerHTML =
        '<div style="max-width:560px;display:flex;flex-direction:column;align-items:center;gap:16px">' +
        '<div style="font-size:64px;line-height:1">🛡️</div>' +
        (studentWasDeleted
          ? '<div style="font-size:26px;font-weight:900">تم مسح حسابك من على المنصة</div>' +
            '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">المهلة خلصت وأدوات المطوّر كانت مفتوحة — كل بيانات الحساب اتسحبت.<br/>كلم المستر لو ده حصل بالغلط وهو هيرجّعهولك.</div>'
          : '<div style="font-size:26px;font-weight:900">اتقفل الدخول للمنصة</div>' +
            '<div style="font-size:14px;color:#d4d4d8;line-height:1.9">أدوات المطوّر ممنوعة تمامًا على المنصة.</div>') +
        '</div>'
    }

    function hide() {
      var o = document.getElementById('dv-guard')
      if (o && o.parentNode) o.parentNode.removeChild(o)
      overlay = null
      try { document.body.style.overflow = '' } catch (e) {}
    }

    function punish() {
      var st = readStudent()
      var wasStudent = !!st
      clearSessions()
      var payload: any = { studentId: st ? st.id : '' }
      try {
        /* بصمة الجهاز — عشان السيرفر يتأكد إن الطلب من جهاز صاحب الحساب نفسه */
        payload.candidates = getDeviceCandidates()
        payload.deviceId = getDeviceId()
      } catch (e) {}
      try {
        fetch('/api/security/devtools-strike', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          keepalive: true,
        }).catch(function () {})
      } catch (e) {}
      renderFinal(wasStudent)
    }

    function tick() {
      if (done) return
      var open = detectOnce()
      if (open) { cleanStreak = 0; hits++ } else { cleanStreak++; hits = 0 }
      if (!active) {
        if (hits >= 2) {
          active = true
          left = COUNT_SECONDS
          render()
        }
      } else {
        if (open) {
          left--
          if (left <= 0) { punish(); return }
          if (numEl) numEl.textContent = String(left)
          if (barEl) barEl.style.width = Math.max(0, (left / COUNT_SECONDS) * 100) + '%'
        } else if (cleanStreak >= 2) {
          /* قفل الأدوات قبل الصفر — المسامحة: الشاشة بتختفي والحساب سالم */
          active = false
          hits = 0
          cleanStreak = 0
          left = COUNT_SECONDS
          hide()
        }
      }
      /* لو حد شال العنصر نفسه من الـ DOM بالأدوات — بنرجّعه فورًا */
      if (active && !document.getElementById('dv-guard')) render()
    }

    /* تاب متقفل نهائي (المهلة خلصت قبل كده في نفس التاب) */
    try {
      if (sessionStorage.getItem(LOCK_KEY) === '1') {
        renderFinal(false)
        done = true
        return
      }
    } catch (e) {}

    var timer = setInterval(tick, 1000)
    return function () { clearInterval(timer) }
  }, [])
  return null
}
