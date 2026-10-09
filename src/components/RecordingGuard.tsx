'use client'
// ============================================================
// RecordingGuard — حماية عامة من التسجيل والتصوير (طلب المستر 2026-ح)
// ============================================================
// شغال في **كل صفحات المنصة** (متحمّل في الـ root layout):
//  • كل زرار function من F1 لـ F12 — **فيهم F10** (طلب المستر 2026-ل:
//    "explicitly block the F10 key")
//  • Ctrl + Shift + R / S ممنوعين (طلب المستر 2026-ح: "منع كنترول شفت آر
//    وكنترول شيفت اس") — إعادة التحميل العنيدة + حفظ الصفحة/أداة القص
//  • زرار PrintScreen  → رسالة + تفريغ الحافظة
//  • F12 + Ctrl/Cmd+Shift+I/J/C/K + Ctrl+U → "🛡️ دي خاصية مقفولة"
//  • (2026-ط) رسالة الكليك اليمين = "كليك يمين ممنوع" (طلب المستر الحرفي:
//    "يقول كليك يمين ممنوع ما يقولش التسجيل ممنوع")
//  • كليك يمين + الضغط المطول ممنوعين (مفيش حفظ صورة/فيديو)
//  • -webkit-touch-callout:none → قائمة iOS المطولة مختفية
//  • تحديد النص ممنوع على المحتوى (مسموح بس في الحقول)
//  • مفيش أي شاشة أو تنبيه بيطلع لوحده — طلب المستر الحرفي:
//    "ما تجبهاليش خالص" — مفيش دروع ولا رسائل مفاجئة على الشاشة.
// ملاحظة صادقة: زرار السكرين شوت/التسجيل في الموبايل نفسه (الطاقة + الصوت
// أو مسجل الشاشة) وقصّة الشاشة في ويندوز نفسها فوق صلاحية أي موقع في
// العالم — حتى يوتيوب ونتفليكس مش قادرين يمنعوها — والووترمارك باسم
// الطالب ورقمه هو الخصم الحقيقي لأي صورة/فيديو مسرب.
// ============================================================
// (2026-ز11 — طلب المستر) كاشف أدوات المطوّر اللي كان بيقيس فرق مقاس
// نافذة المتصفح (outerWidth/innerWidth) والقفل الأسود **اتشالوا خالص**:
//   الكشف ده كان بيعمل إنذارات كاذبة كتير للناس الأبرياء — زووم المتصفح
//   125%/150% (شايع جدًا على اللابتوبات)، سايدبار إيدج/أوبرا/فايرفوكس،
//   شريط التنزيلات، وإنفوبارات الترجمة — فكان بيقفل الشاشة سودة برسالة
//   «أدوات المطوّر ممنوعة» لطلاب مافتحوش أي أدوات، والفيديوهات مش كانت
//   راضية تشتغل عندهم. الحمايات اللي مفيهاش إنذارات كاذبة (منع الاختصارات
//   + منع الكليك يمين + الووترمارك باسم الطالب) فاضلة زي ما هي.
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
          'position:fixed;top:18px;left:50%;transform:translateX(-50%);z-index:2147483646;' +
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
      /* Win/⌘ + Shift + R/S مش بيتمنعوا خالص (تعديل 2026-ك بقرار المستر
         الحرفي "دول ما تمنعوش"): دي اختصارات نظام التشغيل نفسه ومفيش
         أي موقع في العالم يقدر يمنعها فعلًا */
      /* Ctrl + Shift + R / S (طلب المستر حرفيًا 2026-ح) — إعادة التحميل
         العنيدة + حفظ الصفحة/أداة القص في متصفحات كتير — ممنوعين زي F12 */
      if (e.ctrlKey && e.shiftKey && (k === 'r' || k === 's')) {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي ممنوعة')
        return
      }
      /* F10 صراحةً بـ event.key === 'F10' — طلب المستر الحرفي 2026-م */
      if (e.key === 'F10') {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي ممنوعة')
        return
      }
      /* كل زرار function من F1 لـ F12 ممنوع — **فيهم F10** */
      if (/^f([1-9]|1[0-2])$/.test(k)) {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي ممنوعة')
        return
      }
      /* زرار PrintScreen → تنبيه + تفريغ الحافظة */
      if (k === 'printscreen' || e.keyCode === 44) {
        toast('🛡️ الخاصية دي ممنوعة')
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText('🔒 المحتوى محمي').catch(function () {})
        } catch (err) {}
        return
      }
      /* أدوات المطوّر — نفس رسالة مشغل الفيديو بالظبط
         (Ctrl+Shift+K = كونسول فايرفوكس — مضافة كمان) */
      if (
        k === 'f12' ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (k === 'i' || k === 'j' || k === 'c' || k === 'k')) ||
        ((e.ctrlKey || e.metaKey) && (k === 'u' || k === 's'))
      ) {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي مقفولة')
      }
    }
    /* منع السكرين شوت/حفظ المحتوى على الموبايل (2026-و):
       1) contextmenu ممنوع (الضغط المطول على أندرويد بينده الحدث ده)
       2) CSS: قائمة iOS المطولة مختفية + تحديد النص مقفول على المحتوى
          (مفتوح بس في input/textarea عشان الكتابة تفضل شغالة) */
    function onCtx(e: Event) { e.preventDefault(); toast('🚫 كليك يمين ممنوع') }
    var styleEl = document.createElement('style')
    styleEl.id = 'rg-guard-css'
    styleEl.textContent =
      'html{-webkit-touch-callout:none!important}' +
      'body{-webkit-user-select:none!important;user-select:none!important}' +
      'input,textarea,[contenteditable]{-webkit-user-select:text!important;user-select:text!important}' +
      'img,video{-webkit-touch-callout:none!important;-webkit-user-drag:none!important}'
    document.head.appendChild(styleEl)
    window.addEventListener('keydown', onKey, true)
    document.addEventListener('contextmenu', onCtx, true)

    return function () {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('contextmenu', onCtx, true)
      if (toastTimer) clearTimeout(toastTimer)
      var t = document.getElementById('rg-toast')
      if (t && t.parentNode) t.parentNode.removeChild(t)
      var s = document.getElementById('rg-guard-css')
      if (s && s.parentNode) s.parentNode.removeChild(s)
    }
  }, [])
  return null
}
