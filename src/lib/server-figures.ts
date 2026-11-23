// ============================================================
// SERVER-FIGURES (و49 → وN16) — قص رسومات الأسئلة **على السيرفر**
// ============================================================
// (وN16) محرك الصور بقى موحد يعمل في كل البيئات: Node + Cloudflare Workers
// - رندر PDF: mupdf WASM مسبق الترجمة (بدل pdf.js + napi canvas اللي ما
//   بيشتغلوش في workerd نهائيًا) — see src/lib/image-engine.ts
// - فك/ترميز الصور: @jsquash jpeg/png مسبق الترجمة (بدل @napi-rs/canvas)
// - القص والتكبير ومسح الحبر: pure JS على مصفوفة RGBA — نفس النتائج بالحرف
//
// سبب الإصلاح الجذري الأصلي: القص كان كله على متصفح المستر — أي فشل كان
// بيقع **بصمت** وبتفضل bbox من غير url. دلوقتي: ملف الاستخراج بيوصلك للسيرفر
// أصلًا فبنقص الرسمات هنا مباشرة ونرفعها على جدول Media.
//
// القص على المتصفح (ensureFigureUrls) فضل موجود كطبقة تانية للأمان —
// أي رسمة السيرفر قصّها بتبقى فيها url فالمتصفح بيتخطاها خالص.
// ============================================================

import { db } from '@/lib/db'
import { splitMergedRegion } from '@/lib/figure-demerger'
/* (ز42) حارس الحبر — لصق القص الفاضي على أقرب رسمة حقيقية (نفس منطق المتصفح) */
import { snapCropFromPx } from '@/lib/figure-locator'
/* (وN16) المحرك الموحد — mupdf + jsquash + pure JS — شغال Node وWorkers */
import {
  decodeImage,
  encodeJpeg,
  cropImage,
  resizeImage,
  regionPixels,
  renderPdfPage,
  type RawImage,
} from '@/lib/image-engine'

/* تطبيع bbox ذكي — النموذج ساعات بيرجع مقياس 0..1000 (بروتوكول Gemini)
   بدل 0..1 — بنكتشف ده ونحوّله، وإلا بيتقفل في sanitize (قيمة >1) والقص
   بيتلغي بصمت. برضه بيتعامل مع bbox مبعوث pixels (منفرد >1.5). */
function smartBbox(bbox: any): { x: number; y: number; w: number; h: number } | null {
  if (!bbox || typeof bbox !== 'object') return null
  var g = function (v: any): number { var n = Number(v); return isFinite(n) ? n : NaN }
  var x = g(bbox.x), y = g(bbox.y), w = g(bbox.w), h = g(bbox.h)
  if ([x, y, w, h].some(function (n) { return isNaN(n) })) return null
  /* 0..1000 → 0..1 (سمح بهامش: أي قيمة أكبر من 1.5 تعتبر من مقياس أكبر) */
  var maxV = Math.max(x, y, w, h)
  if (maxV > 1.5) { x = x / 1000; y = y / 1000; w = w / 1000; h = h / 1000 }
  /* Gemini ساعات بيرجع [ymin,xmin,ymax,xmax] كأن w/h نهايات مش أطوال —
     لو w أو h طلعوا أطوال مستحيلة (<=0 أو >1) والموضع بين 0..1، جرّب تفسير النهاية */
  if ((w <= 0 || w > 1.5) && x >= 0 && x <= 1 && w > x) { var w2 = w / 1000; if (w2 > 0 && w2 <= 1) { w = w2 - x } }
  if ((h <= 0 || h > 1.5) && y >= 0 && y <= 1 && h > y) { var h2 = h / 1000; if (h2 > 0 && h2 <= 1) { h = h2 - y } }
  x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y))
  w = Math.min(1, Math.max(0, w)); h = Math.min(1, Math.max(0, h))
  if (w <= 0.005 || h <= 0.005) return null
  if (x + w > 1) w = Math.max(0.01, 1 - x)
  if (y + h > 1) h = Math.max(0.01, 1 - y)
  return { x: x, y: y, w: w, h: h }
}

/* أهداف القص لسؤال واحد: رسمة السؤال + رسومات الاختيارات */
interface CropTarget { q: any; kind: 'q' | 'of'; oi: number }

function collectTargets(questions: any[]): CropTarget[] {
  var targets: CropTarget[] = []
  if (!Array.isArray(questions)) return targets
  questions.forEach(function (q: any) {
    if (!q) return
    if (q.figure && q.figure.bbox && !q.figure.url) targets.push({ q: q, kind: 'q', oi: -1 })
    if (Array.isArray(q.optionFigures)) {
      q.optionFigures.forEach(function (of: any, oi: number) {
        if (of && of.bbox && !of.url) targets.push({ q: q, kind: 'of', oi: oi })
      })
    }
  })
  return targets
}

/* حفظ بافر صورة في جدول Media وإرجاع المسار /api/files/<id> */
async function saveFigure(buf: Buffer): Promise<string> {
  var media = await db.media.create({
    data: {
      filename: 'figure-' + Date.now() + '.jpg',
      filePath: 'exam-figures/' + Date.now() + '_server-crop.jpg',
      fileType: 'image/jpeg',
      fileSize: String(buf.length),
      data: buf.toString('base64'),
      category: 'exam-figures',
    },
  })
  return '/api/files/' + media.id
}

/* تطبيع مصفوفة bytes PDF/صورة من base64 أو Buffer */
function toBuffer(src: { base64?: string; buffer?: Buffer }): Buffer {
  if (src.buffer) return src.buffer
  return Buffer.from(src.base64 || '', 'base64')
}

export interface ServerCropResult {
  cropped: number; failed: number; total: number
  /* (وN4) رسمات مستوى السؤال المقصوصة مع buffers — بتفضع بس مع withBuffers */
  crops?: ServerCropCrop[]
}

/* (وN4) رسمة مقصوصة مع الـ buffer بتاعها — لإعادة قراءة الأرقام بالتكبير
   (figure-zoom) من غير ما نرجّع للجدول Media تاني — الصفر رخيص وسريع */
export interface ServerCropCrop { q: any; buf: Buffer }

/* ============================================================
 * (و52) جودة القص — padding + رصّ على المحتوى + JPEG 0.92 + كاب 1600
 * (و53) فك الالتحام + السيرفر إنقاذ فقط والمتصفح يقص الأول
 * (وN16) المحرك بقى mupdf + jsquash — شغال على كلاود فلير وNode بنفس الكود
 * ============================================================ */

/* منطقة قص بعد التنقيط — فشل التنقيط بيرجّع المنطقة الأصلية (آمن) */
interface CropRegion { x: number; y: number; w: number; h: number }

/** تقليم الهوامش البيضا داخل منطقة القص — بيرجّع tight region حوالين المحتوى */
function refineByContent(img: RawImage, sx: number, sy: number, sw: number, sh: number): CropRegion {
  var fallback: CropRegion = { x: sx, y: sy, w: sw, h: sh }
  try {
    if (sw < 16 || sh < 16) return fallback
    var W = img.w
    var d = img.d
    var rowHas = new Uint8Array(sh)
    var colHas = new Uint8Array(sw)
    /* خطوة 2 للمستطيلات العريضة — سرعة من غير فقدان دقة ملموس */
    var step = sw > 1000 ? 2 : 1
    for (var y = 0; y < sh; y++) {
      var base = (sy + y) * W * 4 + sx * 4
      for (var x = 0; x < sw; x += step) {
        var i = base + x * 4
        var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        if (lum < 236) { rowHas[y] = 1; colHas[x] = 1 }
      }
    }
    var top = -1, bottom = -1, left = -1, right = -1
    for (var y2 = 0; y2 < sh; y2++) if (rowHas[y2]) { if (top < 0) top = y2; bottom = y2 }
    for (var x2 = 0; x2 < sw; x2++) if (colHas[x2]) { if (left < 0) left = x2; right = x2 }
    if (top < 0 || left < 0 || bottom < top || right < left) return fallback
    /* هامش أخير حوالين المحتوى — 1.5% من المنطقة أو 10px على الأقل */
    var mX = Math.max(10, Math.round(0.015 * sw))
    var mY = Math.max(10, Math.round(0.015 * sh))
    var rx = Math.max(sx, sx + left - mX)
    var ry = Math.max(sy, sy + top - mY)
    var rEx = Math.min(sx + sw, sx + right + 1 + mX)
    var rEy = Math.min(sy + sh, sy + bottom + 1 + mY)
    var rw = rEx - rx, rh = rEy - ry
    if (rw < 8 || rh < 8) return fallback
    return { x: rx, y: ry, w: rw, h: rh }
  } catch (eR) { return fallback }
}

/**
 * قص كل الرسمات الناقصة في الأسئلة من ملف المصدر — **على السيرفر**.
 * src: base64 أو Buffer للـ PDF/الصورة + اسم/نوع الملف — أو **صفحات جاهزة**:
 *   src.pages = [{ n: رقم الصفحة, base64: JPEG بدون dataURL prefix }] (و50)
 *   — مسار «الملفات الكبيرة/الكتاب» بيبعت صفحات متصورة أصلًا فبنقص منها مباشرة
 * بيرجع إحصائية (قصّ ناجح/فشل/إجمالي) عشان الرد يوضّح للأدمن لو حاجة فشلت.
 * أي فشل في رسمة واحدة مش بيوقف الباقي — والفشل الكلي مش بيكسر الاستخراج.
 */
export async function cropFiguresServerSide(
  src: { base64?: string; buffer?: Buffer; name?: string; mime?: string; pages?: { n: number; base64: string }[] },
  questions: any[],
  opts?: { withBuffers?: boolean }
): Promise<ServerCropResult> {
  var result: ServerCropResult = { cropped: 0, failed: 0, total: 0 }
  /* (وN4) بتفضع بس مع opts.withBuffers — رسمات مستوى السؤال اللي اتقصت فعلًا */
  var cropsOut: ServerCropCrop[] = []
  var wantBuf = !!(opts && opts.withBuffers)
  try {
    var targets = collectTargets(questions)
    result.total = targets.length
    if (targets.length === 0) return result

    /* (و50) وضع الصفحات الجاهزة (مسار ai-extract-pages) — قص مباشر من صور الصفحات */
    if (Array.isArray(src.pages) && src.pages.length > 0) {
      var imgByPage: Record<number, RawImage | null> = {}
      for (var pi = 0; pi < src.pages.length; pi++) {
        var pg = src.pages[pi]
        if (!pg || typeof pg.n !== 'number' || !pg.base64) continue
        try {
          var pbuf = toBuffer({ base64: pg.base64 })
          if (!pbuf || pbuf.length === 0) continue
          var pimg = await decodeImage(pbuf)
          imgByPage[pg.n] = pimg
        } catch (eP) { /* صفحة فاسدة → رسماتها تفشل والباقي يتم */ }
      }
      var getFromPages = async function (pageNo: number): Promise<RawImage | null> {
        return imgByPage[pageNo] || null
      }
      for (var tpi = 0; tpi < targets.length; tpi++) {
        var okP = await cropOne(targets[tpi], getFromPages, wantBuf, cropsOut)
        if (okP) result.cropped++; else result.failed++
      }
      if (wantBuf && cropsOut.length > 0) result.crops = cropsOut
      return result
    }

    var buf = toBuffer(src)
    if (!buf || buf.length === 0) {
      result.failed = targets.length
      return result
    }
    var mime = String(src.mime || '')
    var name = String(src.name || '')
    var isPdf = mime.indexOf('pdf') !== -1 || /\.pdf$/i.test(name)

    if (!isPdf) {
      /* صورة مفردة = صفحة 1 كاملة — القص منها مباشرة */
      var imgSingle = await decodeImage(buf)
      if (!imgSingle) { result.failed = targets.length; return result }
      for (var ti = 0; ti < targets.length; ti++) {
        var ok = await cropOne(targets[ti], async function () { return imgSingle }, wantBuf, cropsOut)
        if (ok) result.cropped++; else result.failed++
      }
      if (wantBuf && cropsOut.length > 0) result.crops = cropsOut
      return result
    }

    /* (وN16) PDF → رندر mupdf WASM مباشرة — نفس المستند متقفل في الآخر.
       رندر أعلى (2000) — مصدر القص نفسه هو اللي بيحدد نعومة الرسمة (و52) */
    var doc = null
    var numPages = 0
    try {
      var firstPage = await renderPdfPage(buf, 1, 2000)
      if (!firstPage) { result.failed = targets.length; return result }
      /* رندر الصفحة الأولى نجح — المستند مفتوح؛ نعرف عدد الصفحات من الرندر
         نفسه مش مطلوب — كل استدعاء رندر بيحصّر حد الصفحات لوحده */
      numPages = -1
    } catch (eOpen) {
      result.failed = targets.length
      return result
    }

    try {
      /* كاش صفحات — الصفحة الواحدة بتطلع منها أكتر من رسمة */
      var pageCache: Record<number, RawImage | null> = {}
      var getPage = async function (pageNo: number): Promise<RawImage | null> {
        if (pageCache[pageNo] !== undefined) return pageCache[pageNo]
        var n = pageNo
        if (n < 1) n = 1
        try {
          var img = await renderPdfPage(buf, n, 2000)
          pageCache[pageNo] = img
          return img
        } catch (ePage) { pageCache[pageNo] = null; return null }
      }

      for (var i = 0; i < targets.length; i++) {
        var ok2 = await cropOne(targets[i], getPage, wantBuf, cropsOut)
        if (ok2) result.cropped++; else result.failed++
      }
      if (wantBuf && cropsOut.length > 0) result.crops = cropsOut
    } finally {
      /* (وN16) مفيش مستند مفتوح يحتاج destroy — الرندر بيفتح ويقفل لكل صفحة */
    }
    return result
  } catch (eAll: any) {
    /* فشل شامل — بنسيب الـ bbox والعميل بيجرب (والواجهة فيها زرار إعادة المحاولة) */
    result.failed = result.total - result.cropped
    return result
  }
}

/* قص هدف واحد من صورة الصفحة ورفعه — يرجع true لو نجح
   (وN4) wantBuf + cropsOut: جمع buffer الرسمة المقصوصة (مستوى السؤال بس)
   عشان figure-zoom يقراها بالتكبير من غير DB إضافي */
async function cropOne(
  tgt: CropTarget,
  getPageCanvas: (page: number) => Promise<RawImage | null>,
  wantBuf?: boolean,
  cropsOut?: ServerCropCrop[]
): Promise<boolean> {
  try {
    var q = tgt.q
    var fig: any = tgt.kind === 'q' ? q.figure : (q.optionFigures[tgt.oi] || null)
    var bbox = smartBbox(fig && fig.bbox)
    if (!bbox) return false
    var page = parseInt(String((fig && fig.page) || q.sourcePage || 1), 10) || 1
    var pageImg = await getPageCanvas(page)
    if (!pageImg) return false

    /* (و52) padding حوالين bbox — رسمة السؤال هامش أكبر، رسومات الاختيارات
       أقل (العناوين جنب بعض عشان ماحضنش رسمة الاختيار اللي جنبه) */
    var padFrac = tgt.kind === 'q' ? 0.025 : 0.012
    var pW = pageImg.w, pH = pageImg.h
    var sx = Math.max(0, Math.floor((bbox.x - padFrac) * pW))
    var sy = Math.max(0, Math.floor((bbox.y - padFrac) * pH))
    var ex = Math.min(pW, Math.ceil((bbox.x + bbox.w + padFrac) * pW))
    var ey = Math.min(pH, Math.ceil((bbox.y + bbox.h + padFrac) * pH))
    var sw = ex - sx, sh = ey - sy
    if (sw < 8 || sh < 8) return false

    /* (و52) رصّ القص على المحتوى الفعلي — تقليم البيض جوه المنطقة الموسعة */
    var reg = refineByContent(pageImg, sx, sy, sw, sh)
    /* (و53) فك الالتحام — لو المنطقة التهمت رسمة مجاورة (رسمتين جنب بعض
       والسؤال فيه رسمة واحدة) بنقص الكتلة اللي bbox السؤال بيشاور عليها بس */
    var regD = splitMergedRegion(function (gx: number, gy: number, gw: number, gh: number) {
      try {
        var r = regionPixels(pageImg, gx, gy, gw, gh)
        if (!r) return null
        return { d: r.d, w: r.w, h: r.h }
      } catch (eG) { return null }
    }, reg, { x0: bbox.x * pW, y0: bbox.y * pH, x1: (bbox.x + bbox.w) * pW, y1: (bbox.y + bbox.h) * pH })
    sx = regD.x; sy = regD.y; sw = regD.w; sh = regD.h
    if (sw < 8 || sh < 8) return false

    /* (ز42) حارس الحبر على السيرفر — لو منطقة القص شبه فاضية (bbox الـ AI
       في مكان غلط على الصفحة) بنلصقها على أقرب كتلة محتوى حقيقية مكشوفة
       من بكسلات الصفحة نفسها — نفس منطق المتصفح بالظبط */
    try {
      var longestA = Math.max(pageImg.w, pageImg.h) || 1
      var scaleA = Math.min(1, 760 / longestA)
      var wA = Math.max(8, Math.round(pageImg.w * scaleA))
      var hA = Math.max(8, Math.round(pageImg.h * scaleA))
      var smallA = resizeImage(pageImg, wA, hA)
      var snapS = snapCropFromPx({ d: smallA.d, w: wA, h: hA }, bbox, { x: sx, y: sy, w: sw, h: sh })
      if (snapS) { sx = snapS.x; sy = snapS.y; sw = snapS.w; sh = snapS.h }
    } catch (eInkS) {}

    var scale = Math.min(1, 1600 / Math.max(sw, sh))
    var outW = Math.max(8, Math.round(sw * scale))
    var outH = Math.max(8, Math.round(sh * scale))
    var cropped = cropImage(pageImg, sx, sy, sw, sh)
    if (!cropped) return false
    var out = resizeImage(cropped, outW, outH)
    var outBuf: Buffer | null = await encodeJpeg(out, 0.92)
    if (!outBuf || outBuf.length < 100) return false

    var url = await saveFigure(outBuf)
    if (tgt.kind === 'q') {
      q.figure = Object.assign({}, q.figure, { url: url })
      /* (وN4) buffer القص يتسجل — إعادة قراءة الأرقام بتستخدمه مباشرة */
      if (wantBuf && cropsOut) cropsOut.push({ q: q, buf: outBuf })
    } else {
      var ofs = Array.isArray(q.optionFigures) ? q.optionFigures : []
      while (ofs.length <= tgt.oi) ofs.push(null)
      ofs[tgt.oi] = Object.assign({}, ofs[tgt.oi] || {}, { url: url, bbox: fig.bbox, page: fig.page || q.sourcePage || 1 })
      q.optionFigures = ofs
    }
    return true
  } catch (e1) {
    return false
  }
}
