/* ============================================================
   player-config — إعدادات شكل المشغل والووترمارك (MG-2 + MG-3 + MG-4 + MG-5)
   ============================================================
   (MG-5 — طلب المستر الحرفي 2026):
   «عاوز إن أقدر أحذفهم كلهم من صفحة الأدمن وأضيفهم وأقدر أضيف ووتر مارك
    رقم بس واسم بس وهكذا وأقدر أحركهم — واللي في النص دي تكون الاسم
    الثنائي وتحتها الرقم»:
   • عنصر اسم/رقم بقى له محتوى: both = اسم ثنائي فوق وتحته الرقم |
     name = اسم بس | number = رقم بس — المستر بيختار لكل عنصر
   • الحد الأعلى للعناصر بقى 10 بدل 6
   • اللوجو الوسطاني (اسم ثنائي + رقم) بقى ظاهر على طول بالافتراضي
     (من غير دورة اختفاء) — «تخليها باينة»
   • زرار «امسح كل العناصر» في اللوحة يفضّي كل حاجة ويبدأ من نضيف
   • ترقية تلقائية v:2 → v:3: العناصر القديمة بتاخد content=both
   (MG-4 — طلب المستر بعد ما شاف MG-3):
   • الشفافيات كلها اترفع لأن «الحاجات دي ميتة الشفافية بتاعتها بايظة»:
     QR 0.26 → 0.55 + اسم ورقم 0.3 → 0.55 + اللوجو الوسطاني 0.14 → 0.42
     والسقوف اتوسعت (QR/اسم لحد 0.85 واللوجو لحد 0.6) — «عللي أنت
     الشفافية من عندك»
   • اللوجو الوسطاني بقى: اسم الطالب الثنائي وتحتيه رقم تليفونه «زي ما
     كنا عاملينها» — content الافتراضي بقى 'name'
   • ترقية تلقائية v:1 → v:2: أي كونفج محفوظ قديم بياخد الشفافيات
     الجديدة (لو المستر كان حط قيمة أعلى فدي بتفضل زي ما هي)
   ============================================================
   الكونفج كله متخزن في جدول SiteConfig بالمفتاح 'player_config'
   كـ JSON — بيتقرأ في صفحة المشغل (/api/player/[ticket]) عند كل
   رندر وبيطبق: أطوال الشريط + خريطة الووترمارك كاملة.
   - لو مفيش كونفج محفوظ → FALLBACK_PLAYER_CONFIG = سلوك MG-1
     بالظبط (شريط 36/40 + كارتين QR فوق شمال وتحت يمين بس).
   - الافتراضي اللي بيبدأ بيه صاحب المنصة في لوحة التحكم =
     DEFAULT_PLAYER_CONFIG (شريط 40/46 + QR فوق شمال وتحت يمين
     + اسم ورقم فوق في النص وتحت في النص + لوجو المنصة في النص
     مكتوب عليه اسم الطالب ورقمه «زي الأول»).
   ============================================================
   (MG-3 — طلب المستر الجديد):
   • blink لكل عنصر: يظهر X ثانية ويختفي Y ثانية على طول —
     «أنا عاوز أتحكم في المدة بتاعة اختفائها»
   • محتوى اللوجو الوسطاني: لوجو بس / اسم ورقم بس / الاتنين —
     «الووترمارك اللي في النص مش مكتوب فيها اسم الطالب ورقم تليفونه زي الأول»
   • علامة يوتيوب في الشريط: تشغيل/إيقاف + حجم — «علامة يوتيوب تكبرها سنة بس»
   ============================================================ */

export type WmSize = 'sm' | 'md' | 'lg'

/* دورة الظهور والاختفاء (ثواني) — show = ظاهر، hide = مخفي
   (hide = 0 أو on = false → العنصر ثابت ظاهر على طول) */
export interface WmBlink {
  on: boolean
  show: number /* 1..120 ثانية */
  hide: number /* 0..120 ثانية */
}

/* كارت QR الطالب (بيتولد في السيرفر باسمه ورقمه) */
export interface WmQrItem {
  on: boolean
  x: number /* % من عرض الفيديو — مركز العنصر */
  y: number /* % من ارتفاع الفيديو — مركز العنصر */
  size: WmSize
  opacity: number /* 0.05 - 0.6 */
  blink: WmBlink
}

/* عنصر اسم الطالب + رقمه (بيترسم ديناميكيًا لكل طالب)
   (MG-5) content: both = اسم ثنائي فوق وتحته الرقم | name = اسم بس | number = رقم بس */
export type WmNameContent = 'both' | 'name' | 'number'

export interface WmNameItem {
  id: string
  x: number
  y: number
  size: WmSize
  opacity: number
  content: WmNameContent
  blink: WmBlink
}

/* لوجو المنصة في نص الفيديو — محتواه قابل للتحكم (MG-3/MG-4):
   brand = «Math Genius» بس | name = اسم الطالب الثنائي وتحتيه رقمه
   («زي الأول» — الافتراضي) | both = لوجو صغير فوق + اسم ورقم تحته */
export type WmLogoContent = 'brand' | 'name' | 'both'

export interface WmLogoItem {
  on: boolean
  x: number
  y: number
  size: WmSize
  opacity: number /* 0.03 - 0.6 (MG-4) */
  content: WmLogoContent
  blink: WmBlink
}

/* علامة اليوتيوب في شريط التحكم (ديكور — مفيش لينك) */
export interface WmYtMark {
  on: boolean
  size: WmSize
}

export interface PlayerConfig {
  v: 3 /* (MG-5) v3 = محتوى عنصر اسم/رقم — الكونفج الأقل بيتدرّع تلقائيًا */
  barHeightMobile: number /* px — 32..64 */
  barHeightDesktop: number /* px — 36..72 */
  topShieldHeight: number /* px — 40..96 (0 = المعادلة القديمة) */
  qrTL: WmQrItem
  qrBR: WmQrItem
  nameItems: WmNameItem[]
  centerLogo: WmLogoItem
  ytMark: WmYtMark
}

export const WM_SIZES: WmSize[] = ['sm', 'md', 'lg']

export function clampNum(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, n))
}

export function clampSize(v: any, fallback: WmSize = 'md'): WmSize {
  return v === 'sm' || v === 'md' || v === 'lg' ? v : fallback
}

export function clampOpacity(v: any, min: number, max: number, fallback: number): number {
  const n = Number(v)
  if (!isFinite(n)) return fallback
  return Math.min(max, Math.max(min, Math.round(n * 100) / 100))
}

/* تنظيف دورة الظهور/الاختفاء — المستر طلب التحكم في «مدة اختفائها»
   (لو الكونفج القديم من غير blink أصلًا → بياخد افتراضي العنصر كامل —
   عشان اللوجو الوسطاني يرجع لدورته «زي الأول» 10 ظاهر / 20 مخفي) */
export function clampBlink(v: any, fallback: WmBlink): WmBlink {
  if (!v || typeof v !== 'object') return { ...fallback }
  return {
    on: typeof v.on === 'boolean' ? v.on : fallback.on,
    show: clampNum(v.show, 1, 120, fallback.show),
    hide: clampNum(v.hide, 0, 120, fallback.hide),
  }
}

/* الافتراضي المقترح لصاحب المنصة (MG-5):
   QR فوق شمال وتحت يمين + كارت اسم ثنائي/رقم فوق وتحت في النص
   + **اللوجو الوسطاني = اسم الطالب الثنائي وتحتيه الرقم — ظاهر على طول**
   (من غير دورة اختفاء — «تخليها باينة» طلب حرفي) */
export const DEFAULT_PLAYER_CONFIG: PlayerConfig = {
  v: 3,
  barHeightMobile: 40,
  barHeightDesktop: 46,
  topShieldHeight: 60,
  /* (MG-4) الشفافيات اترفعت — «الحاجات دي ميتة الشفافية بتاعتها بايظة» */
  qrTL: { on: true, x: 7, y: 6, size: 'md', opacity: 0.55, blink: { on: false, show: 15, hide: 15 } },
  qrBR: { on: true, x: 93, y: 84, size: 'md', opacity: 0.55, blink: { on: false, show: 15, hide: 15 } },
  nameItems: [
    { id: 'nm-top', x: 50, y: 11, size: 'md', opacity: 0.6, content: 'both', blink: { on: false, show: 15, hide: 15 } },
    { id: 'nm-bottom', x: 50, y: 80, size: 'md', opacity: 0.6, content: 'both', blink: { on: false, show: 15, hide: 15 } },
  ],
  /* (MG-5) اللوجو الوسطاني: اسم الطالب الثنائي وتحتيه رقمه — باين على طول */
  centerLogo: { on: true, x: 50, y: 42, size: 'lg', opacity: 0.5, content: 'name', blink: { on: false, show: 10, hide: 20 } },
  ytMark: { on: true, size: 'lg' },
}

/* احتياط المشغل لو مفيش كونفج محفوظ = سلوك MG-1 بالظبط عشان مفيش حاجة تتبوظ */
export const FALLBACK_PLAYER_CONFIG: PlayerConfig = {
  v: 3,
  barHeightMobile: 36,
  barHeightDesktop: 40,
  topShieldHeight: 0,
  qrTL: { on: true, x: 6, y: 6, size: 'md', opacity: 0.55, blink: { on: false, show: 15, hide: 15 } },
  qrBR: { on: true, x: 94, y: 84, size: 'md', opacity: 0.55, blink: { on: false, show: 15, hide: 15 } },
  nameItems: [],
  centerLogo: { on: false, x: 50, y: 46, size: 'lg', opacity: 0.5, content: 'name', blink: { on: false, show: 10, hide: 20 } },
  ytMark: { on: true, size: 'lg' },
}

/* تنظيف أي JSON جاي من قاعدة البيانات أو من الـ API — أي قيمة ناقصة أو غلط ترجع للافتراضي
   (MG-4) ترقية v:1 → v:2: الكونفج القديم كان شفافياته ضعيفة (QR 0.26/اسم 0.3/لوجو 0.14)
   — المستر قال «الحاجات دي ميتة» — فبيترفعوا للافتراضي الجديد، وأي قيمة
   أعلى المستر حطها بنفسه بتفضل زي ما هي (max) */
export function sanitizePlayerConfig(raw: any): PlayerConfig {
  var d = DEFAULT_PLAYER_CONFIG
  var fb = FALLBACK_PLAYER_CONFIG
  var src = raw && typeof raw === 'object' ? raw : {}
  /* نسخة الكونفج المحفوظ — أقل من 2 = ترقية شفافيات، أقل من 3 = ترقية محتوى العناصر */
  var savedVer = Number(src.v) || 1
  var upgrade = savedVer < 2
  var out: PlayerConfig = {
    v: 3,
    barHeightMobile: clampNum(src.barHeightMobile, 32, 64, d.barHeightMobile),
    barHeightDesktop: clampNum(src.barHeightDesktop, 36, 72, d.barHeightDesktop),
    topShieldHeight: clampNum(src.topShieldHeight, 0, 96, d.topShieldHeight),
    qrTL: sanitizeQr(src.qrTL, d.qrTL, upgrade),
    qrBR: sanitizeQr(src.qrBR, d.qrBR, upgrade),
    nameItems: [],
    centerLogo: sanitizeLogo(src.centerLogo, d.centerLogo, upgrade),
    ytMark: sanitizeYtMark(src.ytMark, (raw && raw.__fallback ? fb : d).ytMark),
  }
  var items = Array.isArray(src.nameItems) ? src.nameItems : []
  /* (MG-5) الحد بقى 10 عناصر + كل عنصر له محتوى (اسم بس/رقم بس/الاتنين) */
  for (var i = 0; i < items.length && out.nameItems.length < 10; i++) {
    var it = items[i]
    if (!it || typeof it !== 'object') continue
    var nmOp = clampOpacity(it.opacity, 0.05, 0.85, 0.55)
    if (upgrade) nmOp = Math.max(nmOp, 0.55)
    out.nameItems.push({
      id: String(it.id || 'nm-' + (i + 1)).slice(0, 24),
      x: clampNum(it.x, 0, 100, 50),
      y: clampNum(it.y, 0, 100, 10),
      size: clampSize(it.size, 'md'),
      opacity: nmOp,
      content: it.content === 'name' || it.content === 'number' ? it.content : 'both',
      blink: clampBlink(it.blink, { on: false, show: 15, hide: 15 }),
    })
  }
  if (!out.nameItems.length && items.length === 0 && raw && raw.__fallback) {
    /* الاحتياط بيرجع لسلوك MG-1 من غير عناصر اسم */
    out.nameItems = []
    out.centerLogo = sanitizeLogo(raw.centerLogo, fb.centerLogo, upgrade)
  }
  return out
}

function sanitizeQr(v: any, d: WmQrItem, upgrade?: boolean): WmQrItem {
  var src = v && typeof v === 'object' ? v : {}
  var op = clampOpacity(src.opacity, 0.05, 0.85, d.opacity)
  if (upgrade && src.opacity !== undefined) op = Math.max(op, 0.55) /* ترقية: القديم 0.26 كان باهت */
  return {
    on: src.on !== false,
    x: clampNum(src.x, 0, 100, d.x),
    y: clampNum(src.y, 0, 100, d.y),
    size: clampSize(src.size, d.size),
    opacity: op,
    blink: clampBlink(src.blink, d.blink),
  }
}

function sanitizeLogo(v: any, d: WmLogoItem, upgrade?: boolean): WmLogoItem {
  var src = v && typeof v === 'object' ? v : {}
  var op = clampOpacity(src.opacity, 0.03, 0.6, d.opacity)
  if (upgrade && src.opacity !== undefined && src.opacity <= 0.2) op = Math.max(op, 0.42) /* القديم 0.14 كان مختفي */
  return {
    on: src.on === true,
    x: clampNum(src.x, 0, 100, d.x),
    y: clampNum(src.y, 0, 100, d.y),
    size: clampSize(src.size, d.size),
    opacity: op,
    content: src.content === 'brand' || src.content === 'name' || src.content === 'both' ? src.content : d.content,
    blink: clampBlink(src.blink, d.blink),
  }
}

function sanitizeYtMark(v: any, d: WmYtMark): WmYtMark {
  var src = v && typeof v === 'object' ? v : {}
  return {
    on: src.on !== false,
    size: clampSize(src.size, d.size),
  }
}
