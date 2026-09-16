// ============================================================
// QUESTION-FIGURES — قص رسومات الأسئلة من صفحة المصدر ورفعها (2026-و40-w)
// ============================================================
// بعد الاستخراج، كل سؤال فيه figure.bbox (نسب من صورة الصفحة كلها 0..1)
// بيتقص من صفحة المصدر وبيترفع كصورة مستقلة (chunkedUpload → /api/files/<id>)
// وبيتخزن في figure.url — عشان شاشة الطالب والمراجعة تعرض الرسمة جاهزة.
//
// المصدر ممكن يكون:
//   • وضع الصفحات (كتاب): مستند pdf.js مفتوح (doc) — بنرندر الصفحات المطلوبة بس
//     مع كاش (الصفحة الواحدة بتتقص ليها أكتر من رسمة).
//   • وضع الملف: File — لو PDF بنفتحه بـ openPdf، لو صورة بنعاملها صفحة 1
//     عبر createImageBitmap.
//
// أي فشل في القص/الرفع مش بيوقف العملية: بنسيب bbox زي ما هو
// (الواجهة بتعرض placeholder محايد) — وبنكمل باقي الرسومات.
// ============================================================

import { openPdf, renderPageToJpeg } from '@/lib/pdf-pages'
import { chunkedUpload } from '@/lib/chunked-upload'

export interface FigureCropSource {
  file?: File | null   // ملف المصدر (PDF أو صورة) — وضع الملف
  doc?: any | null     // مستند pdf.js مفتوح — وضع الصفحات
}

/* ============================================================
 * (و45) تصنيف موحّد MCQ/مقالي — طلب المستر الحرفي:
 *   «الطالب يجي يحل الواجب ما يلاقيش الاختيارات، يلاقي السؤال اللي في
 *    اختيارات على شكل رسومات يلاقي سؤال مقالي»
 * السؤال اللي له اختيارات — حتى لو الاختيارات نفسها **صور/رسومات**
 * (optionFigures بدون نص) — لازم يتصنف اختياري (mcq) ومطلقًا مقالي.
 * ============================================================ */

/** هل السؤال ده له اختيارات مرئية (صور/رسومات في الاختيارات)؟ */
export function hasVisualOptions(q: any): boolean {
  if (!q || typeof q !== 'object') return false
  if (!Array.isArray(q.optionFigures)) return false
  return q.optionFigures.some(function (of: any) {
    return of && typeof of === 'object' && (of.url || of.bbox)
  })
}

/**
 * الحكم الموحد: هل السؤال مقالي؟
 * مقالي = مفيش اختيارات نصية مرة واحدة ومفيش رسومات اختيارات.
 * أي اختيارات (نص أو صور) → اختياري زي ما هو.
 */
export function isWritingQuestion(q: any): boolean {
  if (!q || typeof q !== 'object') return true
  if (hasVisualOptions(q)) return false
  if (Array.isArray(q.options) && q.options.length > 0) {
    // اختيارات موجودة — لو كلها فاضية/N/A من غير رسومات → مقالي
    var allNA = q.options.every(function (o: any) {
      return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === ''
    })
    return allNA
  }
  return true
}

/* تطبيع bbox: كل القيم 0..1 وw/h أكبر من صفر — وإلا null (مفيش قص) */
function sanitizeBbox(bbox: any): { x: number; y: number; w: number; h: number } | null {
  if (!bbox || typeof bbox !== 'object') return null
  var x = Number(bbox.x), y = Number(bbox.y), w = Number(bbox.w), h = Number(bbox.h)
  if (!isFinite(x) || !isFinite(y) || !isFinite(w) || !isFinite(h)) return null
  x = Math.min(1, Math.max(0, x)); y = Math.min(1, Math.max(0, y))
  w = Math.min(1, Math.max(0, w)); h = Math.min(1, Math.max(0, h))
  if (w <= 0.005 || h <= 0.005) return null
  if (x + w > 1) w = Math.max(0.01, 1 - x)
  if (y + h > 1) h = Math.max(0.01, 1 - y)
  return { x: x, y: y, w: w, h: h }
}

/* رسم bitmap/dataURL على canvas بمقاسه الطبيعي (مع كاب) */
async function sourceToCanvas(src: { kind: 'bitmap'; bitmap: ImageBitmap } | { kind: 'dataurl'; dataUrl: string }): Promise<HTMLCanvasElement> {
  var canvas = document.createElement('canvas')
  if (src.kind === 'bitmap') {
    canvas.width = src.bitmap.width
    canvas.height = src.bitmap.height
    var ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('canvas غير مدعم')
    ctx.drawImage(src.bitmap as any, 0, 0)
    return canvas
  }
  var img = new Image()
  img.src = src.dataUrl
  await new Promise<void>(function (resolve, reject) {
    img.onload = function () { resolve() }
    img.onerror = function () { reject(new Error('فشل تحميل صورة الصفحة')) }
  })
  canvas.width = img.naturalWidth || img.width
  canvas.height = img.naturalHeight || img.height
  var ctx2 = canvas.getContext('2d')
  if (!ctx2) throw new Error('canvas غير مدعم')
  ctx2.drawImage(img, 0, 0)
  return canvas
}

/**
 * التأكد إن كل figure.url معباية: لكل سؤال فيه figure.bbox ومن غير url
 * بنقص الرسمة من صفحة المصدر ونرفعها ونعبي figure.url بالمسار.
 * (و44) كمان بنقص رسومات الاختيارات (optionFigures[i].bbox) أوتوماتيك —
 * ده كان سبب «الاختيارات اللي فيها رسومات ما بتتضيفش» — القص كان
 * بيتعامل مع رسمة السؤال بس!
 * onProgress(done, total) — لتوست «جهز الرسومات X من Y…».
 */
export async function ensureFigureUrls(
  questions: any[],
  source: FigureCropSource,
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  /* هدف القص: { q, kind: 'q' | 'of', oi? } — رسمة سؤال أو رسمة اختيار */
  var targets: { q: any; kind: 'q' | 'of'; oi?: number }[] = []
  if (Array.isArray(questions)) {
    questions.forEach(function (q: any) {
      if (!q) return
      if (q.figure && q.figure.bbox && !q.figure.url) targets.push({ q: q, kind: 'q' })
      if (Array.isArray(q.optionFigures)) {
        q.optionFigures.forEach(function (of: any, oi: number) {
          if (of && of.bbox && !of.url) targets.push({ q: q, kind: 'of', oi: oi })
        })
      }
    })
  }
  var total = targets.length
  if (total === 0) return

  /* تجهيز مصدر الصفحات: مستند PDF مفتوح أو bitmap صورة */
  var pdfDoc: any = null
  var imgBitmap: ImageBitmap | null = null
  try {
    if (source.doc) {
      pdfDoc = source.doc
    } else if (source.file) {
      var f = source.file
      var isPdf = /\.(pdf)$/i.test(f.name || '') || f.type === 'application/pdf'
      if (isPdf) {
        var opened = await openPdf(f)
        pdfDoc = opened.doc
      } else {
        imgBitmap = await createImageBitmap(f)
      }
    }
  } catch (e) {
    /* من غير مصدر نقدر نقص منه — بنسيب الـ bbox والواجهة تعرض placeholder */
    if (onProgress) onProgress(0, total)
    return
  }
  if (!pdfDoc && !imgBitmap) {
    if (onProgress) onProgress(0, total)
    return
  }

  /* كاش صفحات مرسومة (الصفحة الواحدة ممكن يطلع منها أكتر من رسمة) */
  var pageCanvasCache: Record<number, HTMLCanvasElement> = {}

  var getPageCanvas = async function (page: number): Promise<HTMLCanvasElement | null> {
    if (pageCanvasCache[page]) return pageCanvasCache[page]
    try {
      if (pdfDoc) {
        var numPages = Number(pdfDoc.numPages) || 0
        if (page < 1 || (numPages > 0 && page > numPages)) return null
        var dataUrl = await renderPageToJpeg(pdfDoc, page, 1600, 0.85)
        var canvas = await sourceToCanvas({ kind: 'dataurl', dataUrl: dataUrl })
        pageCanvasCache[page] = canvas
        return canvas
      }
      if (imgBitmap && page === 1) {
        var c2 = await sourceToCanvas({ kind: 'bitmap', bitmap: imgBitmap })
        pageCanvasCache[page] = c2
        return c2
      }
    } catch (e) {}
    return null
  }

  var done = 0
  for (var i = 0; i < targets.length; i++) {
    var tgt = targets[i]
    var q = tgt.q
    try {
      var fig = tgt.kind === 'q' ? q.figure : (q.optionFigures[tgt.oi || 0] || null)
      var bbox = sanitizeBbox(fig && fig.bbox)
      if (!bbox) { done++; if (onProgress) onProgress(done, total); continue }
      var page = parseInt(String((fig && fig.page) || q.sourcePage || 1), 10) || 1
      var pageCanvas = await getPageCanvas(page)
      if (!pageCanvas) { done++; if (onProgress) onProgress(done, total); continue }

      var sw = Math.round(bbox.w * pageCanvas.width)
      var sh = Math.round(bbox.h * pageCanvas.height)
      var sx = Math.min(Math.max(0, Math.round(bbox.x * pageCanvas.width)), pageCanvas.width - 1)
      var sy = Math.min(Math.max(0, Math.round(bbox.y * pageCanvas.height)), pageCanvas.height - 1)
      if (sw < 8 || sh < 8) { done++; if (onProgress) onProgress(done, total); continue }

      /* تصغير لأقصى ضلع 1200 — الحفاظ على النسبة */
      var scale = Math.min(1, 1200 / Math.max(sw, sh))
      var outW = Math.max(8, Math.round(sw * scale))
      var outH = Math.max(8, Math.round(sh * scale))
      var out = document.createElement('canvas')
      out.width = outW; out.height = outH
      var octx = out.getContext('2d')
      if (!octx) { done++; if (onProgress) onProgress(done, total); continue }
      octx.fillStyle = '#ffffff'
      octx.fillRect(0, 0, outW, outH)
      octx.drawImage(pageCanvas, sx, sy, sw, sh, 0, 0, outW, outH)

      var blob = await new Promise<Blob | null>(function (resolve) {
        out.toBlob(function (b: Blob | null) { resolve(b) }, 'image/jpeg', 0.85)
      })
      if (!blob) { done++; if (onProgress) onProgress(done, total); continue }

      var asFile = new File([blob], 'figure_q' + (i + 1) + '.jpg', { type: 'image/jpeg' })
      var up = await chunkedUpload(asFile, 'exam-figures')
      if (up && up.filePath && /^\/api\/files\//.test(up.filePath)) {
        if (tgt.kind === 'q') {
          q.figure.url = up.filePath
        } else {
          var ofs = Array.isArray(q.optionFigures) ? q.optionFigures : []
          while (ofs.length <= (tgt.oi || 0)) ofs.push(null)
          ofs[tgt.oi || 0] = Object.assign({}, ofs[tgt.oi || 0] || {}, { url: up.filePath, bbox: fig.bbox, page: fig.page })
          q.optionFigures = ofs
        }
      }
    } catch (eFig) {
      /* فشل سؤال واحد مش بيوقف الباقي — bbox بيفضل موجود */
    }
    done++
    if (onProgress) onProgress(done, total)
  }
}
