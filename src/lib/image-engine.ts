// ============================================================
// IMAGE-ENGINE (وN16) — محرك الصور الموحد للسيرفر: Node + Cloudflare Workers
// ============================================================
// سبب وجوده: القص السيرفري كان بيعتمد على @napi-rs/canvas (ملفات native .node
// ما بتشتغلش جوه Workers إطلاقًا) و pdf.js (محتاج canvas 2D موجود في الـ
// workerd مش موجود). المحرك ده بيستبدلهم كالتالي:
// - رندر PDF: mupdf (WASM رسمي من Artifex — بيشتغل Node وWorkers بنفس الكود)
// - فك/ترميز JPEG: @jsquash/jpeg (WASM مضمّن — مصمم لكلاود فلير)
// - فك/ترميز PNG: @jsquash/png (WASM مضمّن — مصمم لكلاود فلير)
// - القص والتكبير ومسح الحبر: pure JS على مصفوفة RGBA — نفس النتائج بالحرف
// صفر مكتبات native = البناء والتشغيل شغالين في كل مكان بنفس السلوك.
// ============================================================

function dbg(msg: string, err?: any): void {
  try {
    var p: any = (globalThis as any).process
    if (!p || !p.env || !p.env.FF_IMAGE_DEBUG) return
    console.error('[image-engine] ' + msg, err ? ((err && err.stack) || err) : '')
  } catch (e) {}
}

/* صورة خام RGBA8888 — نفس الشكل اللي refineByContent و snapCropFromPx بيتعاملوا معاه */
export interface RawImage {
  w: number
  h: number
  d: Uint8ClampedArray | Uint8Array
}

/* هل البايتات دي JPEG؟ */
export function isJpegBytes(buf: Buffer): boolean {
  return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
}

/* هل البايتات دي PNG؟ */
export function isPngBytes(buf: Buffer): boolean {
  return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
}

/* ------------------------------------------------------------
 * تهيئة كودكات jsquash حسب البيئة:
 * - كلاود فلير (workerd): الاستيراد العالي بيشتغل لوحده (wasm بيتحمل asset)
 * - Node (تطوير محلي): لازم نقرا ملفات الـ wasm من القرص ونمرر Module
 *   جاهز لدالة init — من غير كده الـ glue بيفشل صامت
 * ------------------------------------------------------------ */
var jpegEncRef: any = null
var jpegDecRef: any = null
var pngEncRef: any = null
var pngDecRef: any = null

function isWorkerd(): boolean {
  try {
    return typeof navigator !== 'undefined'
      && String((navigator as any).userAgent || '').indexOf('Cloudflare-Workers') !== -1
  } catch (eN) {
    return false
  }
}

function isNodeEnv(): boolean {
  try {
    if (isWorkerd()) return false
    return typeof process !== 'undefined'
      && !!((process as any).versions && (process as any).versions.node)
  } catch (eN) {
    return false
  }
}

function readNodeWasmBytes(relPkg: string): Uint8Array | null {
  try {
    var fsMod: any = null
    var pathMod: any = null
    try {
      fsMod = (globalThis as any).process.getBuiltinModule('fs')
      pathMod = (globalThis as any).process.getBuiltinModule('path')
    } catch (eB) {}
    if (!fsMod || !pathMod) return null
    var candidates = [
      pathMod.resolve(process.cwd(), 'node_modules', relPkg),
      pathMod.resolve(process.cwd(), '..', 'node_modules', relPkg),
    ]
    for (var i = 0; i < candidates.length; i++) {
      try {
        if (!fsMod.existsSync(candidates[i])) continue
        return new Uint8Array(fsMod.readFileSync(candidates[i]))
      } catch (eRead) { /* الجاي */ }
    }
    return null
  } catch (eAll) {
    return null
  }
}

async function ensureJpeg(): Promise<void> {
  if (jpegEncRef && jpegDecRef) return
  var encMod: any = await import('@jsquash/jpeg/encode.js')
  var decMod: any = await import('@jsquash/jpeg/decode.js')
  if (isNodeEnv()) {
    /* Node: نقرا ملفات الـ wasm من القرص ونجمّعها محليًا (مسموح في Node) */
    try {
      var encBytes = readNodeWasmBytes('@jsquash/jpeg/codec/enc/mozjpeg_enc.wasm')
      var decBytes = readNodeWasmBytes('@jsquash/jpeg/codec/dec/mozjpeg_dec.wasm')
      if (encBytes && encMod.init) await encMod.init(new WebAssembly.Module(encBytes))
      if (decBytes && decMod.init) await decMod.init(new WebAssembly.Module(decBytes))
    } catch (eInit) { dbg('jpeg node init failed', eInit) }
  } else {
    /* workerd/كلاود: الترجمة الديناميكية ممنوعة نهائيًا — بنستخدم النسخ
       .cf.js (بتتعمل في open-next.config.ts وقت البناء) اللي جواها
       استيراد ثابت لملف الـ wasm → wrangler بيحوله لموديول مسبق الترجمة */
    try {
      var specEnc: string = (typeof __FF_SPEC_JPEG_ENC__ !== 'undefined' ? __FF_SPEC_JPEG_ENC__ : '@jsquash/jpeg/codec/enc/mozjpeg_enc.cf.js') as any
      var encCf: any = await import(specEnc)
      if (encCf && encCf.init) await encCf.init()
      var specDec: string = (typeof __FF_SPEC_JPEG_DEC__ !== 'undefined' ? __FF_SPEC_JPEG_DEC__ : '@jsquash/jpeg/codec/dec/mozjpeg_dec.cf.js') as any
      var decCf: any = await import(specDec)
      if (decCf && decCf.init) await decCf.init()
      if (encCf && encCf.default) jpegEncRef = encCf.default
      if (decCf && decCf.default) jpegDecRef = decCf.default
    } catch (eInit2) { dbg('jpeg workerd cf init failed', eInit2) }
  }
  jpegEncRef = encMod.default || encMod
  jpegDecRef = decMod.default || decMod
}

async function ensurePng(): Promise<void> {
  if (pngEncRef && pngDecRef) return
  var encMod: any = await import('@jsquash/png/encode.js')
  var decMod: any = await import('@jsquash/png/decode.js')
  if (isNodeEnv()) {
    try {
      var bytes = readNodeWasmBytes('@jsquash/png/codec/pkg/squoosh_png_bg.wasm')
      if (bytes) {
        var wasmModule = new WebAssembly.Module(bytes)
        if (encMod.init) await encMod.init(wasmModule)
        if (decMod.init) await decMod.init(wasmModule)
      }
    } catch (eInit) { dbg('png node init failed', eInit) }
  } else {
    try {
      var specPng: string = (typeof __FF_SPEC_PNG__ !== 'undefined' ? __FF_SPEC_PNG__ : '@jsquash/png/codec/pkg/squoosh_png.cf.js') as any
      var pngCf: any = await import(specPng)
      if (pngCf && pngCf.init) await pngCf.init()
      if (pngCf && pngCf.default) pngEncRef = pngCf.default
      if (pngCf && pngCf.encode) pngEncRef = pngCf.encode
      if (pngCf && pngCf.decode) pngDecRef = pngCf.decode
    } catch (eInit2) { dbg('png workerd cf init failed', eInit2) }
  }
  pngEncRef = encMod.default || encMod
  pngDecRef = decMod.default || decMod
}

/* لصق الصورة على خلفية بيضا — نفس فعل fillRect الأبيض + drawImage في الكانفس */
function compositeOverWhite(img: RawImage): void {
  var d = img.d
  for (var i = 0; i < d.length; i += 4) {
    var a = d[i + 3]
    if (a >= 255) continue
    if (a <= 0) {
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 255; d[i + 3] = 255
      continue
    }
    var af = a / 255
    d[i] = Math.round(d[i] * af + 255 * (1 - af))
    d[i + 1] = Math.round(d[i + 1] * af + 255 * (1 - af))
    d[i + 2] = Math.round(d[i + 2] * af + 255 * (1 - af))
    d[i + 3] = 255
  }
}

/* فك أي صورة (JPEG أو PNG — sniff من الماجيك بايتس) → RawImage معايا أبيض */
export async function decodeImage(buf: Buffer): Promise<RawImage | null> {
  try {
    if (!buf || buf.length < 16) return null
    if (isJpegBytes(buf)) {
      await ensureJpeg()
      var jdata: any = await jpegDecRef(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
      var jimg: RawImage = { w: jdata.width, h: jdata.height, d: jdata.data }
      compositeOverWhite(jimg)
      return jimg
    }
    if (isPngBytes(buf)) {
      await ensurePng()
      var pdata: any = await pngDecRef(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength))
      var pimg: RawImage = { w: pdata.width, h: pdata.height, d: pdata.data }
      compositeOverWhite(pimg)
      return pimg
    }
    return null
  } catch (eD) {
    dbg('decodeImage failed', eD)
    return null
  }
}

/* ترميز JPEG بجودة محددة (0..1) — عبر mozjpeg من jsquash */
export async function encodeJpeg(img: RawImage, quality: number = 0.92): Promise<Buffer | null> {
  try {
    await ensureJpeg()
    var out: ArrayBuffer = await jpegEncRef(
      { data: img.d, width: img.w, height: img.h },
      { quality: Math.max(0.05, Math.min(1, quality)) }
    )
    if (!out || out.byteLength < 64) return null
    return Buffer.from(out)
  } catch (eE) {
    dbg('encodeJpeg failed', eE)
    return null
  }
}

/* نسخ بكسلات مستطيل داخلي من صورة — بديل getImageData بالحرف (بالخطوة row-wise) */
export function regionPixels(
  img: RawImage,
  x: number,
  y: number,
  w: number,
  h: number
): { d: Uint8ClampedArray | Uint8Array; w: number; h: number } | null {
  try {
    var sw = img.w
    x = Math.max(0, Math.min(sw, Math.round(x)))
    y = Math.max(0, Math.min(img.h, Math.round(y)))
    w = Math.max(1, Math.min(sw - x, Math.round(w)))
    h = Math.max(1, Math.min(img.h - y, Math.round(h)))
    var out = new Uint8ClampedArray(w * h * 4)
    for (var row = 0; row < h; row++) {
      var srcBase = ((y + row) * sw + x) * 4
      var dstBase = row * w * 4
      for (var c = 0; c < w * 4; c++) out[dstBase + c] = img.d[srcBase + c]
    }
    return { d: out, w: w, h: h }
  } catch (eR) {
    return null
  }
}

/* قص صورة كاملة RGBA (نفس regionPixels بس بيرجع RawImage) */
export function cropImage(img: RawImage, sx: number, sy: number, sw: number, sh: number): RawImage | null {
  var r = regionPixels(img, sx, sy, sw, sh)
  if (!r) return null
  return { w: r.w, h: r.h, d: r.d }
}

/* تكبير bilinear pure JS — بديل drawImage مع imageSmoothingEnabled */
export function resizeImage(img: RawImage, outW: number, outH: number): RawImage {
  var W = Math.max(1, Math.round(outW))
  var H = Math.max(1, Math.round(outH))
  if (W === img.w && H === img.h) return img
  var src = img.d
  var out = new Uint8ClampedArray(W * H * 4)
  var xRatio = img.w / W
  var yRatio = img.h / H
  for (var y = 0; y < H; y++) {
    var fy = y * yRatio
    var y0 = Math.floor(fy)
    var y1 = Math.min(img.h - 1, y0 + 1)
    var wy = fy - y0
    var row0 = y0 * img.w
    var row1 = y1 * img.w
    var dstRow = y * W * 4
    for (var x = 0; x < W; x++) {
      var fx = x * xRatio
      var x0 = Math.floor(fx)
      var x1 = Math.min(img.w - 1, x0 + 1)
      var wx = fx - x0
      var i00 = (row0 + x0) * 4
      var i01 = (row0 + x1) * 4
      var i10 = (row1 + x0) * 4
      var i11 = (row1 + x1) * 4
      var di = dstRow + x * 4
      for (var c = 0; c < 4; c++) {
        var top = src[i00 + c] * (1 - wx) + src[i01 + c] * wx
        var bottom = src[i10 + c] * (1 - wx) + src[i11 + c] * wx
        out[di + c] = Math.round(top * (1 - wy) + bottom * wy)
      }
    }
  }
  return { w: W, h: H, d: out }
}

/* رندر صفحة PDF → RawImage (mupdf WASM — نفس المحرك Node وWorkers)
   targetLongest: أقصى طول للضلع الأطول (نفس قاعدة رندر 2000 القديمة) */
var mupdfRef: any = null

/* (وN16) تجهيز wasm بتاع mupdf قبل أول استيراد — في workerd مفيش fs
   فبنجيبه من الأصل الثابت /mupdf-wasm.wasm (في public/) عبر ASSETS،
   ونمرره للـ hook الرسمي globalThis.$libmupdf_wasm_Module — الـ glue
   بيستخدمه مباشرة وبيتجاهل مسارات القرص خالص */
/* (وN16) استيراد mupdf حسب البيئة:
   - workerd/كلاود: النسخة mupdf.cf.js (بتتعمل في open-next.config.ts) —
     جواها استيراد ثابت لملف الـ wasm مسبق الترجمة + وضع Node متوقف
   - Node: النسخة الأصلية بتشتغل عادي بقراءة القرص */
async function getMupdf(): Promise<any> {
  if (mupdfRef) return mupdfRef
  var mod: any
  if (isNodeEnv()) {
    mod = await import('mupdf')
  } else {
    mod = await import(typeof __FF_SPEC_MUPDF_CF__ !== 'undefined' ? __FF_SPEC_MUPDF_CF__ : 'mupdf/dist/mupdf.cf.js')
  }
  mupdfRef = mod
  return mod
}

export async function renderPdfPage(
  buf: Buffer,
  pageNo: number,
  targetLongest: number = 2000
): Promise<RawImage | null> {
  try {
    var mupdf: any = await getMupdf()
    var doc: any = mupdf.Document.openDocument(new Uint8Array(buf), 'application/pdf')
    try {
      var numPages = Number(typeof doc.countPages === "function" ? doc.countPages() : (doc.countPages || 1)) || 1
      var n = pageNo
      if (n < 1) n = 1
      if (numPages > 0 && n > numPages) n = numPages
      var page: any = doc.loadPage(n - 1) /* mupdf بيفهرس من صفر */
      var bounds: number[] = page.getBounds()
      var w0 = Math.abs(Number(bounds[2]) - Number(bounds[0])) || 595
      var h0 = Math.abs(Number(bounds[3]) - Number(bounds[1])) || 842
      var longest = Math.max(w0, h0) || 1600
      var scale = Math.min(4, targetLongest / longest)
      var pixmap: any = page.toPixmap(mupdf.Matrix.scale(scale, scale), mupdf.ColorSpace.DeviceRGB, false)
      try {
        var W = pixmap.getWidth()
        var H = pixmap.getHeight()
        if (!W || !H) return null
        var stride = Number(pixmap.getStride()) || W * 3
        var comps = Number(pixmap.getNumberOfComponents()) || 3
        var src = pixmap.getPixels()
        /* mupdf بيرجّع RGB (من غير ألفا) — بنعمله RGBA ونلصق خلفية بيضا.
           النسخة لازم تتعمل قبل destroy عشان الذاكرة بتاعة الـ wasm */
        var out = new Uint8ClampedArray(W * H * 4)
        var rgba = comps === 4
        for (var y = 0; y < H; y++) {
          var rowBase = y * stride
          var dstRow = y * W * 4
          for (var x = 0; x < W; x++) {
            var si = rowBase + x * comps
            var di = dstRow + x * 4
            out[di] = src[si]
            out[di + 1] = src[si + 1]
            out[di + 2] = src[si + 2]
            out[di + 3] = rgba ? src[si + 3] : 255
          }
        }
        var img: RawImage = { w: W, h: H, d: out }
        compositeOverWhite(img)
        return img
      } finally {
        try { pixmap.destroy() } catch (eP) {}
      }
    } finally {
      try { doc.destroy() } catch (eD) {}
    }
  } catch (eRender) {
    dbg('renderPdfPage failed', eRender)
    return null
  }
}

/* رندر صفحة PDF → JPEG مباشر (اختصار لـ /api/page-image) */
export async function renderPdfPageToJpeg(
  buf: Buffer,
  pageNo: number,
  targetLongest: number = 2000,
  quality: number = 0.9
): Promise<Buffer | null> {
  var img = await renderPdfPage(buf, pageNo, targetLongest)
  if (!img) return null
  return encodeJpeg(img, quality)
}
