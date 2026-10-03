'use client'
// ============================================================
// RecordingGuard — حماية عامة من التسجيل والتصوير (طلب المستر 2026-ح)
// ============================================================
// شغال في **كل صفحات المنصة** (متحمّل في الـ root layout) — زي منع F12
// اللي في مشغل الفيديو بالظبط:
//  • كل زرار function من F1 لـ F12 — **فيهم F10** (طلب المستر 2026-ل:
//    "explicitly block the F10 key")
//  • Win/⌘ + Shift + R/S **مش بيتمنعوا خالص** (تعديل 2026-ك بقرار
//    المستر: "دول ما تمنعوش") — دي اختصارات نظام التشغيل نفسه ومفيش
//    أي موقع في العالم يقدر يمنعها فعلًا — والمحاولة كانت بتعمل رسايل كاذبة
//  • زرار PrintScreen  → رسالة + تفريغ الحافظة
//  • F12 + Ctrl/Cmd+Shift+I/J/C + Ctrl+U → "🛡️ دي خاصية مقفولة"
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
// (ص8) قفل أدوات المطوّر الأسود الخالص — طلب المستر الحرفي:
// «أول ما الـ دي تتفتح تكون سوداء خالص، اعملها في كل المنصات،
//  ولو ينفع ما يكونش فيه أي تعديلات بتطبق»
//  1) الخلفية #000 نقي 100% — مفيش أي شفافية زي النسخة القديمة (rgba .97)
//  2) وانتا مقفول: محتوى الصفحة نفسه **مختفي تمامًا** (visibility:hidden)
//     — يعني حتى لو حد لعب في الـ DevTools ما هيشوف أي حاجة من المنصة
//  3) حارس التعديلات (MutationObserver): أي محاولة حذف القفل أو تغيير
//     ستايله أو إظهار المحتوى أو تعديل الـ CSS → بتترجع لوضعها الآمن
//     في نفس اللحظة — التعديلات "متطبقش" فعليًا
//     (الإصلاح: الـ observer بيتفصل وقت الإصلاح نفسه + بنقارن بالقيمة
//      المطبّعة عشان مفيش لوب ميكروتاسك يجمّد الصفحة)
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
      /* (تعديل 2026-ك بقرار المستر الحرفي "دول ما تمنعوش"):
         Win/⌘ + Shift + R/S مش بيتمنعوا خالص — دي اختصارات نظام
         التشغيل نفسه ومفيش أي موقع في العالم يقدر يمنعها فعلًا،
         والمحاولة الوهمية كانت بتعمل رسايل كاذبة */
      /* Ctrl + Shift + R / S (طلب المستر حرفيًا 2026-ح: "منع كنترول شفت آر
         وكنترول شيفت اس") — إعادة التحميل العنيدة + حفظ الصفحة/أداة القص
         في متصفحات كتير — ممنوعين زي F12 بالظبط */
      if (e.ctrlKey && e.shiftKey && (k === 'r' || k === 's')) {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي ممنوعة')
        return
      }
      /* F10 صراحةً بـ event.key === 'F10' — طلب المستر الحرفي 2026-م:
         "explicitly intercept and prevent the F10 key (event.key === 'F10')
         from triggering any browser default behavior" */
      if (e.key === 'F10') {
        e.preventDefault()
        e.stopPropagation()
        toast('🛡️ الخاصية دي ممنوعة')
        return
      }
      /* كل زرار function من F1 لـ F12 ممنوع — **فيهم F10** (طلب المستر
         الحرفي 2026-ل: "explicitly block the F10 key") */
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
    /* (2026-و) منع السكرين شوت/حفظ المحتوى على الموبايل:
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

    /* ============================================================
       (ص8) كشف أدوات المطوّر + القفل الأسود الخالص المضاد للتعديلات.
       الحقيقة التقنية الصادقة: قايمة التلات نقط نفسها جزء من المتصفح
       مش من الصفحة — مفيش أي موقع في العالم يقدر يمنعها — لكن اللي
       بيتعمل من جواها (أدوات المطوّر) بنكشفه ونقفل كل حاجة.
       • ديسكتوب بس (الماوس دقيق + شاشة واسعة) — على الموبايل مفيش أدوات مطوّر أصلًا
       • بناخذ خط أساس (الفرق بين مقاس النافذة من بره ومن جوه) بعد التحميل
       • أدوات المطوّر المثبتة (يمين/تحت) بتزود محور **واحد بس** بمقدار كبير،
         بينما الزووم بيغير المحورين مع بعض — فبنمنع الزووم من يفتش إنذار كاذب
       • القفل: أسود خالص #000 + المحتوى مخفي + أي تعديل في الـ DevTools
         بيرجع فورًا (MutationObserver) — «ما يكونش فيه أي تعديلات بتطبق»
       ============================================================ */
    var LOCK_OVERLAY_CSS =
      'position:fixed;inset:0;z-index:2147483647;background:#000;' +
      'display:flex;align-items:center;justify-content:center;direction:rtl;' +
      'font-family:system-ui,-apple-system,sans-serif'
    var LOCK_MSG_HTML =
      '<div style="text-align:center;padding:32px;max-width:420px">' +
      '<div style="font-size:56px;margin-bottom:12px">🛡️</div>' +
      '<div style="color:#fff;font-size:20px;font-weight:800;margin-bottom:10px">أدوات المطوّر ممنوعة في المنصة</div>' +
      '<div style="color:rgba(255,255,255,.75);font-size:14px;line-height:1.8">اقفل نافذة أدوات المطوّر (DevTools) عشان تكمل تستخدم المنصة طبيعي.</div>' +
      '</div>'
    var LOCK_CSS_CONTENT =
      'html.rg-locked{background:#000!important}' +
      'html.rg-locked body{visibility:hidden!important;overflow:hidden!important;pointer-events:none!important}' +
      'html.rg-locked body *{visibility:hidden!important;pointer-events:none!important}'

    var devtoolsLocked = false
    var overlayEl: HTMLElement | null = null
    var lockCssEl: HTMLStyleElement | null = null
    var antiTamper: MutationObserver | null = null
    var baseW = 0
    var baseH = 0
    var baselineReady = false
    var isDesktop = false
    /* القيم المطبّعة (اللي المتصفح بيرجّعها بعد أول كتابة) — بنقارن بيها
       بدل النص الخام عشان الـ cssText/innerHTML بيتطبّعوا بصيغة تانية */
    var normOverlayCss = ''
    var normOverlayHtml = ''
    var overlayStyled = false
    var overlayFilled = false
    try {
      isDesktop = window.matchMedia('(pointer: fine)').matches && window.outerWidth >= 1024
    } catch (eM) { isDesktop = window.outerWidth >= 1024 }

    /* توصيل حارس التعديلات — بيتنده بعد ما الإصلاح يخلص عشان أي تعديل
       جاي من بره (DevTools) يرجّع القفل لحالته الآمنة */
    function connectTamperGuard() {
      if (antiTamper || !devtoolsLocked) return
      antiTamper = new MutationObserver(function () {
        /* أي تعديل من بره → إصلاح فوري (وصلObservation بيتفصل جوّه assertLock) */
        assertLock()
      })
      var root = document.documentElement
      antiTamper.observe(root, { childList: true, attributes: true, attributeFilter: ['class', 'style'] })
      if (document.body) antiTamper.observe(document.body, { attributes: true, attributeFilter: ['style', 'class'] })
      if (overlayEl) antiTamper.observe(overlayEl, { attributes: true, childList: true, attributeFilter: ['style', 'class', 'id'] })
      if (lockCssEl) antiTamper.observe(lockCssEl, { attributes: true, childList: true, characterData: true })
    }

    /* إعادة بناء القفل كامل — بيتفصل الـ observer أثناء الكتابة عشان
       تعديلاتنا الإصلاحية ما تولّدش records = مفيش لوب خالص */
    function assertLock() {
      if (!devtoolsLocked) return
      if (antiTamper) { antiTamper.disconnect(); antiTamper = null }
      try {
        var root = document.documentElement
        if (!root.classList.contains('rg-locked')) root.classList.add('rg-locked')
        /* CSS القفل: html أسود + كل محتوى الـ body مختفي */
        if (!lockCssEl) {
          lockCssEl = document.createElement('style')
          lockCssEl.id = 'rg-lock-css'
        }
        if (!lockCssEl.isConnected) (document.head || root).appendChild(lockCssEl)
        if (lockCssEl.textContent !== LOCK_CSS_CONTENT) lockCssEl.textContent = LOCK_CSS_CONTENT
        /* الاوفلاي الأسود — بيتحط جوه <html> مش جوه <body>
           عشان الـ body كله مخفي والاوفلاي يفضل ظاهر */
        if (!overlayEl) {
          overlayEl = document.createElement('div')
          overlayEl.id = 'rg-devtools-lock'
          overlayEl.setAttribute('role', 'alert')
          normOverlayCss = ''
          normOverlayHtml = ''
          overlayStyled = false
          overlayFilled = false
        }
        if (!overlayEl.isConnected) root.appendChild(overlayEl)
        if (!overlayStyled || overlayEl.style.cssText !== normOverlayCss) {
          overlayEl.style.cssText = LOCK_OVERLAY_CSS
          /* بنخزّن الصيغة المطبّعة اللي المتصفح رجّعها بعد أول كتابة */
          normOverlayCss = overlayEl.style.cssText
          overlayStyled = true
        }
        if (!overlayFilled || overlayEl.innerHTML !== normOverlayHtml) {
          overlayEl.innerHTML = LOCK_MSG_HTML
          normOverlayHtml = overlayEl.innerHTML
          overlayFilled = true
        }
      } finally {
        connectTamperGuard()
      }
    }

    function releaseLock() {
      devtoolsLocked = false
      if (antiTamper) { antiTamper.disconnect(); antiTamper = null }
      if (overlayEl && overlayEl.parentNode) overlayEl.parentNode.removeChild(overlayEl)
      if (lockCssEl && lockCssEl.parentNode) lockCssEl.parentNode.removeChild(lockCssEl)
      overlayEl = null
      lockCssEl = null
      document.documentElement.classList.remove('rg-locked')
    }

    function sampleDiff() {
      return {
        w: window.outerWidth - window.innerWidth,
        h: window.outerHeight - window.innerHeight,
      }
    }

    /* خط الأساس بعد ثانية ونص من التحميل (المفروض أدوات المطوّر مقفولة) */
    var baselineTimer = setTimeout(function () {
      if (!isDesktop) return
      var d = sampleDiff()
      baseW = d.w
      baseH = d.h
      baselineReady = true
    }, 1500)

    var devtoolsWatcher = setInterval(function () {
      try {
        if (!isDesktop || !baselineReady) return
        var d = sampleDiff()
        /* محور واحد بس اتزود بشكل كبير = أدوات مطوّر مثبتة (يمين/تحت).
           المحورين اتغيروا = زووم (مش إنذار) */
        var wGrow = d.w - baseW
        var hGrow = d.h - baseH
        var open = (wGrow > 170 && hGrow < 170) || (hGrow > 170 && wGrow < 170)
        if (open && !devtoolsLocked) {
          devtoolsLocked = true
          assertLock()
          toast('🛡️ أدوات المطوّر ممنوعة — اقفلها عشان تكمل')
        } else if (!open && devtoolsLocked) {
          releaseLock()
        }
      } catch (eW) {}
    }, 900)

    return function () {
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('contextmenu', onCtx, true)
      clearInterval(devtoolsWatcher)
      clearTimeout(baselineTimer)
      releaseLock()
      if (toastTimer) clearTimeout(toastTimer)
      var t = document.getElementById('rg-toast')
      if (t && t.parentNode) t.parentNode.removeChild(t)
      var s = document.getElementById('rg-guard-css')
      if (s && s.parentNode) s.parentNode.removeChild(s)
    }
  }, [])
  return null
}
