'use client'

// ============================================================
// حارس الفيديو — (ر7 ثم ر8 — طلب المستر الحرفي)
// ============================================================
// ر7: «انا عاوز اي حد يفتح في الفيديو سواء من التلات نقط أو الفيديو
//      يفتح ذات نفسه — يلاقي اشعار بعد تنازلي — لو ما قفلهوش
//      هحاول يجيب لينك الفيديو — حسابه هيترفض من المنصة تماما»
//
// ر8: «أنا بفتح الـ Developer Tools اهو بيظهر لي لينك اليوتيوب» —
//      الحارس بقى موحّد: فتح الفيديو = تنبيه بمهلة من إعدادات الأدمن
//      (افتراضي 8 ثواني)، وفتح أدوات المطوّر أثناء الفيديو = شاشة
//      سودة فورية بنفس المهلة — وقفل الأدوات خلال العدّ = مسامحة.
//
// الدالتين دول بيتبعتوا من كل نقطة فتح/قفل فيديو في المنصة (المشغل
// الآمن SecurePlayerModal في البورتال والجاليري وصفحة الفيديو) —
// والـ DevToolsGuard الموحّد المركب في layout.tsx بيسمع الإشارتين
// ويشغّل آلة الحالة على المنصة كلها.
// ============================================================

export var VIDEO_OPENED_EVENT = 'mg_video_opened'
export var VIDEO_CLOSED_EVENT = 'mg_video_closed'

export function notifyVideoOpened() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(VIDEO_OPENED_EVENT))
    }
  } catch (e) {}
}

export function notifyVideoClosed() {
  try {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(VIDEO_CLOSED_EVENT))
    }
  } catch (e) {}
}

/* مفتاح إعداد المهلة في إعدادات الموقع (site-config) — الأدمن يتحكم
   فيه من لوحة «حماية الفيديوهات» — القيمة بالثواني وافتراضيها 8 */
export var GUARD_COUNTDOWN_KEY = 'guard_countdown_seconds'
export var GUARD_COUNTDOWN_DEFAULT = 8
