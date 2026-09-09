'use client'
// ============================================================
// RecordingGuard — حماية عامة من التسجيل والتصوير (طلب المستر 2026-ح)
// ============================================================
// شغال في **كل صفحات المنصة** (متحمّل في الـ root layout) — زي منع F12
// اللي في مشغل الفيديو بالظبط:
//  • Win/⌘ + Shift + R → رسالة "🚫 التسجيل ممنوع" (تسجيل الشاشة)
//  • Win/⌘ + Shift + S → رسالة "🚫 التسجيل ممنوع" (أداة القص)
//  • زرار PrintScreen  → رسالة + تفريغ الحافظة
//  • F12 + Ctrl/Cmd+Shift+I/J/C + Ctrl+U → "🛡️ دي خاصية مقفولة"
//  • (2026-و) منع السكرين شوت على الموبايل — أقصى الممكن من موقع ويب:
//     • كليك يمين + الضغط المطول ممنوعين (مفيش حفظ صورة/فيديو)
//     • -webkit-touch-callout:none → قائمة iOS المطولة مختفية
//     • تحديد النص ممنوع على المحتوى (مسموح بس في الحقول)
//     • أول ما الصفحة تختفي (تبديل تطبيق/فتح مسجل) والرجوع → تنبيه
//       "المحتوى محمي" — والفيديوهات نفسها ليها درع أقوى جوه المشغل.
// ملاحظة صادقة: زرار السكرين شوت في الموبايل نفسه (الطاقة + الصوت) فوق
// صلاحية أي موقع — حتى يوتيوب ونتفليكس مش قادرين يمنعوه — لكن كل محاولات
// الحفظ/التسجيل من جوه التطبيق بتتكشف والمحتوى بيتغطى، والووترمارك باسم
// الطالب ورقمه واصلة في كل إطار.
// ============================================================
import { useEffect } from 'react'

export function RecordingGuard() {
  useEffect(function () {
    var toastTimer: any = null
    function toast(msg: string) {
      var t = document.getElementById('rg-toast')
      if (!t) {
        t = document.createElement('div')
        t.id = 'rg-toast'
        t.setAttribute('role', 'alert')
        t.style.cssText =
          'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:10000;' +
          'background:rgba(20,20,28,.95);color:#fff;border:1px solid rgba(255,255,255,.18);' +
          'padding:10px 18px;border-radius:12px;font-size:13px;font-weight:700;direction:rtl;' +
          'white-space:nowrap;opacity:0;transition:opacity .25s;box-shadow:0 6px 24px rgba(0,0,0,.5);' +
          'pointer-events:none;font-family:system-ui,-apple-system,sans-serif'
        document.body.appendChild(t)
      }
      t.textContent = msg
      ;(t as HTMLElement).style.opacity = '1'
      if (toastTimer) clearTimeout(toastTimer)
      toastTimer = setTimeout(function () { (t as HTMLElement).style.opacity = '0' }, 2400)
    }
    function onKey(e: KeyboardEvent) {
      var k = (e.key || '').toLowerCase()
      /* Win أو ⌘ — بنحاول نمسك المفتاح حتى لو المتصفح مبعتش metaKey كامل */
      var metaPressed = !!(e.metaKey || e.key === 'OS' || e.key === 'Meta' || e.keyCode === 91 || e.keyCode === 92)
      /* Win/⌘ + Shift + R أو S → تسجيل شاشة / أداة القص */
      if (metaPressed && e.shiftKey && (k === 'r' || k === 's')) {
        e.preventDefault()
        e.stopPropagation()
        toast('🚫 التسجيل ممنوع')
        return
      }
      /* Ctrl + Shift + R / S (طلب المستر حرفيًا 2026-ح: "منع كنترول شفت آر
         وكنترول شيفت اس") — إعادة التحميل العنيدة + حفظ الصفحة/أداة القص
         في متصفحات كتير — ممنوعين زي F12 بالظبط */
      if (e.ctrlKey && e.shiftKey && (k === 'r' || k === 's')) {
        e.preventDefault()
        e.stopPropagation()
        toast('🚫 العملية دي ممنوعة')
        return
      }
      /* زرار PrintScreen → تنبيه + تفريغ الحافظة */
      if (k === 'printscreen' || e.keyCode === 44) {
        toast('🚫 التسجيل ممنوع')
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('🔒 المحتوى محمي').catch(function () {})
        } catch (err) {}
        return
      }
      /* أدوات المطوّر — نفس رسالة مشغل الفيديو بالظبط */
      if (
        k === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c')) ||
        ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's'))
      ) {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي مقفولة')
      }
    }
    /* (2026-و) منع السكرين شوت/حفظ المحتوى على الموبايل:
       1) contextmenu ممنوع (الضغط المطول على أندرويد بينده الحدث ده)
       2) CSS: قائمة iOS المطولة مختفية + تحديد النص مقفول على المحتوى
          (مفتوح بس في input/textarea عشان الكتابة تفضل شغالة) */
    function onCtx(e: Event) { e.preventDefault(); toast('🛡️ المحتوى محمي — الحفظ ممنوع') }
    var styleEl = document.createElement('style')
    styleEl.id = 'rg-guard-css'
    styleEl.textContent =
      'html{-webkit-touch-callout:none!important}' +
      'body{-webkit-user-select:none!important;user-select:none!important}' +
      'input,textarea,[contenteditable]{-webkit-user-select:text!important;user-select:text!important}' +
      'img,video{-webkit-touch-callout:none!important;-webkit-user-drag:none!important}'
    document.head.appendChild(styleEl)
    /* الرجوع من خفاء الصفحة (تبديل تطبيق/مسجل شاشة) → تنبيه تحمي موثّق */
    var warnedReturn = 0
    function onVis() {
      try {
        if (!document.hidden && Date.now() - warnedReturn > 60000) {
          warnedReturn = Date.now()
          toast('🛡️ المحتوى محمي — التصوير والتسجيل ممنوع')
        }
      } catch (e) {}
    }
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('contextmenu', onCtx, true)
    document.addEventListener('visibilitychange', onVis, true)
    return function () {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('contextmenu', onCtx, true)
      document.removeEventListener('visibilitychange', onVis, true)
      if (toastTimer) clearTimeout(toastTimer)
      var t = document.getElementById('rg-toast')
      if (t && t.parentNode) t.parentNode.removeChild(t)
      var s = document.getElementById('rg-guard-css')
      if (s && s.parentNode) s.parentNode.removeChild(s)
    }
  }, [])
  return null
}
