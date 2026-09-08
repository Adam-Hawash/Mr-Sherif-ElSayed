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
// ملاحظة صادقة: اختصارات النظام (Win+Shift+S) بتتشال من ويندوز قبل المتصفح
// فمينفعش نمنعها 100% من جوه صفحة ويب — لكن أول ما المحاولة توصل بنكشفها
// وننبّه فورًا، وفي مشغل الفيديو فيه طبقة تانية: أي فقدان فوكس (زي ما
// برنامج تصوير يفتح) بيوطّف الفيديو فورًا.
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
    window.addEventListener('keydown', onKey, true)
    return function () {
      window.removeEventListener('keydown', onKey, true)
      if (toastTimer) clearTimeout(toastTimer)
      var t = document.getElementById('rg-toast')
      if (t && t.parentNode) t.parentNode.removeChild(t)
    }
  }, [])
  return null
}
