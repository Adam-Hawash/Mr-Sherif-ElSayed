// ============================================================
// SERVER-FIGURES (و49) — قص رسومات الأسئلة **على السيرفر**
// ============================================================
// سبب الإصلاح الجذري: القص كان كله على متصفح المستر (pdf.js + canvas +
// رفع) — أي فشل (متصفح قديم، ملف كبير، pdf.js وقع، الرفع وقع) كان بيقع
// **بصمت** وبتفضل bbox من غير url → placeholder «في صورة بس مش شايفها».
// دلوقتي: ملف الاستخراج بيوصلك للسيرفر أصلًا (FormData أو لينك) — فبنقص
// الرسمات هنا مباشرة ونرفعها على جدول Media ونرجّع figure.url معباية
// من غير ما أي حاجة تعتمد على متصفح المستر.
//
// القص على المتصفح (ensureFigureUrls) فضل موجود كطبقة تانية للأمان —
// أي رسمة السيرفر قصّها بتبقى فيها url فالمتصفح بيتخطاها خالص.
// ============================================================

import { db } from '@/lib/db'
import { splitMergedRegion } from '@/lib/figure-demerger'

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

export interface ServerCropResult { cropped: number; failed: number; total: number }

/* ============================================================
 * (و52) جودة القص — إصلاح «الرسومات متلخبطة وجودتها وحشة ومش كاملة»:
 * 1) padding حوالين bbox — الـ AI بيرجع bbox ضيّق فالقص بيقص من الرسمة نفسها
 * 2) رصّ على المحتوى الفعلي (refineByContent): جوّه المنطقة الموسعة بنلاقي
 *    البكسلات الغير بيضا ونعمل tight bounds حوالين الرسمة + هامش صغير —
 *    ده بيفسّر bbox المزاح أوتوماتيك بدل ما يطلع قص فاضي/ناقص
 * 3) الجودة: JPEG 0.92 + كاب 1600 بدل 0.85/1200 — ورندر صفحة أعلى (2000)
 * (و53) فك الالتحام (figure-demerger): «بيقص رسمتين جنب بعض والسؤال فيه
 *    رسمة واحدة» — بنحط الكتلة المطلوبة لوحدها بدل اتحاد الرسمتين
 * (و53) ترتيب المسار اتقلب: السيرفر بقى **إنقاذ فقط** — الاستخراج بيرجّع
 *    bbox من غير urls والمتصفح بيقص الأول من الملف الأصلي بجودته الكاملة
 *    (كان القص السيرفري وقت الاستخراج بيملا الـ urls وبيمنع قص المتصفح
 *    الأعلى جودة — وده اللي نزل جودة الرسمات — والمحرر اليدوي بيثبت ده:
 *    نفس القص من المتصفح بطلع أنضف)
 * ============================================================ */

/* منطقة قص بعد التنقيط — فشل التنقيط بيرجّع المنطقة الأصلية (آمن) */
interface CropRegion { x: number; y: number; w: number; h: number }

/** تقليم الهوامش البيضا داخل منطقة القص — بيرجّع tight region حوالين المحتوى */
function refineByContent(canvas: any, sx: number, sy: number, sw: number, sh: number): CropRegion {
  var fallback: CropRegion = { x: sx, y: sy, w: sw, h: sh }
  try {
    var ctx = canvas.getContext('2d')
    if (!ctx || sw < 16 || sh < 16) return fallback
    var img = ctx.getImageData(sx, sy, sw, sh)
    var d = img.data
    var rowHas = new Uint8Array(sh)
    var colHas = new Uint8Array(sw)
    /* خطوة 2 للمستطيلات العريضة — سرعة من غير فقدان دقة ملموس */
    var step = sw > 1000 ? 2 : 1
    for (var y = 0; y < sh; y++) {
      var base = y * sw * 4
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
 *   من غير pdf.js ولا rasterizer — أسرع وأثبت.
 * بيرجع إحصائية (قصّ ناجح/فشل/إجمالي) عشان الرد يوضّح للأدمن لو حاجة فشلت.
 * أي فشل في رسمة واحدة مش بيوقف الباقي — والفشل الكلي مش بيكسر الاستخراج.
 */
export async function cropFiguresServerSide(
  src: { base64?: string; buffer?: Buffer; name?: string; mime?: string; pages?: { n: number; base64: string }[] },
  questions: any[]
): Promise<ServerCropResult> {
  var result: ServerCropResult = { cropped: 0, failed: 0, total: 0 }
  try {
    var targets = collectTargets(questions)
    result.total = targets.length
    if (targets.length === 0) return result

    /* (و50) وضع الصفحات الجاهزة (مسار ai-extract-pages) — قص مباشر من صور الصفحات */
    if (Array.isArray(src.pages) && src.pages.length > 0) {
      var canvasByPage: Record<number, any> = {}
      var { createCanvas: cc1 } = await import('@napi-rs/canvas')
      for (var pi = 0; pi < src.pages.length; pi++) {
        var pg = src.pages[pi]
        if (!pg || typeof pg.n !== 'number' || !pg.base64) continue
        try {
          var pbuf = Buffer.from(pg.base64, 'base64')
          if (!pbuf || pbuf.length === 0) continue
          var { loadImage: li1 } = await import('@napi-rs/canvas')
          var pimg = await li1(pbuf)
          var pc = cc1(pimg.width, pimg.height)
          var pctx = pc.getContext('2d')
          pctx.fillStyle = '#ffffff'
          pctx.fillRect(0, 0, pc.width, pc.height)
          pctx.drawImage(pimg, 0, 0)
          canvasByPage[pg.n] = pc
        } catch (eP) { /* صفحة فاسدة → رسماتها تفشل والباقي يتم */ }
      }
      var getFromPages = async function (pageNo: number): Promise<any | null> {
        return canvasByPage[pageNo] || null
      }
      for (var tpi = 0; tpi < targets.length; tpi++) {
        var okP = await cropOne(targets[tpi], getFromPages)
        if (okP) result.cropped++; else result.failed++
      }
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
      var imgCanvas = await imageToCanvas(buf)
      if (!imgCanvas) { result.failed = targets.length; return result }
      for (var ti = 0; ti < targets.length; ti++) {
        var ok = await cropOne(targets[ti], async function () { return imgCanvas })
        if (ok) result.cropped++; else result.failed++
      }
      return result
    }

    /* PDF: pdf.js legacy build + napi canvas — نفس المستند متقفل في الآخر
       (و49 مهم: الـ polyfills بتاعة napi canvas لازم تتنصب **قبل** استيراد
       pdf.js — pdf.js بياخد نسخة من الكلاسات العالمية وقت الاستيراد، لو
       Path2D/DOMMatrix مش موجودين بيستخدم شكله الداخلي وnapi canvas يرفضه
       بخطأ «Value is none of these types String, Path» والقص يفشل كله) */
    var { createCanvas, DOMMatrix, Path2D, ImageData } = await import('@napi-rs/canvas')
    if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix
    if (!(globalThis as any).Path2D) (globalThis as any).Path2D = Path2D
    if (!(globalThis as any).ImageData) (globalThis as any).ImageData = ImageData
    var pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

    var pathMod = await import('path')
    var fsMod = await import('fs')
    var standardFonts = ''
    try {
      var pkgJson = 'node_modules/pdfjs-dist/standard_fonts/'
      if (fsMod.existsSync(pkgJson)) standardFonts = pathMod.resolve(pkgJson)
    } catch (eF) { standardFonts = '' }

    var doc: any = null
    try {
      doc = await pdfjs.getDocument({
        data: new Uint8Array(buf),
        isEvalSupported: false,
        useSystemFonts: true,
        standardFontDataUrl: standardFonts || undefined,
      }).promise
    } catch (eOpen) {
      result.failed = targets.length
      return result
    }

    try {
      var numPages = Number(doc.numPages) || 0
      /* كاش صفحات — الصفحة الواحدة بتطلع منها أكتر من رسمة */
      var pageCache: Record<number, any> = {}
      var getPage = async function (pageNo: number): Promise<any | null> {
        if (pageCache[pageNo]) return pageCache[pageNo]
        var n = pageNo
        if (n < 1) n = 1
        if (numPages > 0 && n > numPages) n = numPages /* صفحة خارجة عن المستند → آخر صفحة (أفضل من الفشل الصامت) */
        try {
          var page = await doc.getPage(n)
          var base = page.getViewport({ scale: 1 })
          var longest = Math.max(base.width, base.height) || 1600
          /* (و52) رندر أعلى — مصدر القص نفسه هو اللي بيحدد نعومة الرسمة */
          var scale = Math.min(4, 2000 / longest)
          var vp = page.getViewport({ scale: scale })
          var canvas = createCanvas(Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)))
          var ctx = canvas.getContext('2d')
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, canvas.width, canvas.height)
          await page.render({ canvasContext: ctx, viewport: vp }).promise
          page.cleanup()
          pageCache[pageNo] = canvas
          return canvas
        } catch (ePage) { return null }
      }

      for (var i = 0; i < targets.length; i++) {
        var ok2 = await cropOne(targets[i], getPage)
        if (ok2) result.cropped++; else result.failed++
      }
    } finally {
      try { doc.destroy() } catch (eD) {}
    }
    return result
  } catch (eAll: any) {
    /* فشل شامل — بنسيب الـ bbox والعميل بيجرب (والواجهة فيها زرار إعادة المحاولة) */
    result.failed = result.total - result.cropped
    return result
  }
}

/* قص هدف واحد من canvas الصفحة ورفعه — يرجع true لو نجح */
async function cropOne(
  tgt: CropTarget,
  getPageCanvas: (page: number) => Promise<any | null>
): Promise<boolean> {
  try {
    var q = tgt.q
    var fig: any = tgt.kind === 'q' ? q.figure : (q.optionFigures[tgt.oi] || null)
    var bbox = smartBbox(fig && fig.bbox)
    if (!bbox) return false
    var page = parseInt(String((fig && fig.page) || q.sourcePage || 1), 10) || 1
    var pageCanvas = await getPageCanvas(page)
    if (!pageCanvas) return false

    var { createCanvas } = await import('@napi-rs/canvas')
    /* (و52) padding حوالين bbox — رسمة السؤال هامش أكبر، رسومات الاختيارات
       أقل (العناوين جنب بعض عشان ماحضنش رسمة الاختيار اللي جنبه) */
    var padFrac = tgt.kind === 'q' ? 0.025 : 0.012
    var pW = pageCanvas.width, pH = pageCanvas.height
    var sx = Math.max(0, Math.floor((bbox.x - padFrac) * pW))
    var sy = Math.max(0, Math.floor((bbox.y - padFrac) * pH))
    var ex = Math.min(pW, Math.ceil((bbox.x + bbox.w + padFrac) * pW))
    var ey = Math.min(pH, Math.ceil((bbox.y + bbox.h + padFrac) * pH))
    var sw = ex - sx, sh = ey - sy
    if (sw < 8 || sh < 8) return false

    /* (و52) رصّ القص على المحتوى الفعلي — تقليم البيض جوه المنطقة الموسعة */
    var reg = refineByContent(pageCanvas, sx, sy, sw, sh)
    /* (و53) فك الالتحام — لو المنطقة التهمت رسمة مجاورة (رسمتين جنب بعض
       والسؤال فيه رسمة واحدة) بنقص الكتلة اللي bbox السؤال بيشاور عليها بس */
    var regD = splitMergedRegion(function (gx: number, gy: number, gw: number, gh: number) {
      try {
        var gctx = pageCanvas.getContext('2d')
        if (!gctx) return null
        var gimg = gctx.getImageData(gx, gy, gw, gh)
        return { d: gimg.data, w: gimg.width, h: gimg.height }
      } catch (eG) { return null }
    }, reg, { x0: bbox.x * pW, y0: bbox.y * pH, x1: (bbox.x + bbox.w) * pW, y1: (bbox.y + bbox.h) * pH })
    sx = regD.x; sy = regD.y; sw = regD.w; sh = regD.h
    if (sw < 8 || sh < 8) return false

    var scale = Math.min(1, 1600 / Math.max(sw, sh))
    var outW = Math.max(8, Math.round(sw * scale))
    var outH = Math.max(8, Math.round(sh * scale))
    var out = createCanvas(outW, outH)
    var octx = out.getContext('2d')
    octx.fillStyle = '#ffffff'
    octx.fillRect(0, 0, outW, outH)
    octx.imageSmoothingEnabled = true
    octx.imageSmoothingQuality = 'high'
    octx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, outW, outH)
    var outBuf: Buffer = out.toBuffer('image/jpeg', 0.92)
    if (!outBuf || outBuf.length < 100) return false

    var url = await saveFigure(outBuf)
    if (tgt.kind === 'q') {
      q.figure = Object.assign({}, q.figure, { url: url })
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

/* صورة مفردة → canvas (صفحة 1) */
async function imageToCanvas(buf: Buffer): Promise<any | null> {
  try {
    var { createCanvas, loadImage } = await import('@napi-rs/canvas')
    var img = await loadImage(buf)
    var canvas = createCanvas(img.width, img.height)
    var ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0)
    return canvas
  } catch (e) { return null }
}
