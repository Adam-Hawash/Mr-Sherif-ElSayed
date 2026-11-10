// ============================================================
// (ز42) FIGURE-LOCATOR — كشف مناطق الرسمات الحقيقية في الصفحة
// ============================================================
// حل جذري لـ «المربع الأزرق بتاع قص الرسم حاطه في حتة تانية خالص» و
// «القص التلقائي مش بيقص»: إحداثيات الـ AI ساعات بتيجي مزحلقة أو غلط
// خالص — فبدل ما نثق فيها ثقة عمياء بنحلل بكسلات الصفحة نفسها ونكشف
// كتل المحتوى الحقيقية (رسومات/جداول/أشكال) وبنلتصق بيها:
//
//   1) detectBlocksFromPx   — كشف كل كتل المحتوى في الصفحة (XY-cut)
//   2) snapBoxFromPx        — لصق مربع القص على أقرب كتلة حقيقية لـ bbox
//   3) regionInkFromPx      — كثافة الحبر في منطقة (لكشف القص الفاضي)
//   4) snapCropFromPx       — لو منطقة القص فاضية → أقرب كتلة حقيقية
//
// الدوال كلها pure على بكسلات RGBA خام {d,w,h} — شغالة على المتصفح
// (DOM canvas) وعلى السيرفر (@napi-rs/canvas) بنفس الكود بالظبط.
// ============================================================

export interface NormBox { x: number; y: number; w: number; h: number }
export interface PxRegion { x: number; y: number; w: number; h: number }
export interface PixelMap { d: any; w: number; h: number }

/* عتبة الحبر: أقل من كده يعتبر بكسل محتوى (238 بتغطي رصاص فاتح وجيجا سكان ضعيفة) */
var INK_LUM = 238

/** كثافة الحبر في منطقة (0..1) — القص الفاضي بيرجع قريبة من صفر */
export function regionInkFromPx(pix: PixelMap, r: PxRegion): number {
  try {
    var x0 = Math.max(0, Math.floor(r.x)), y0 = Math.max(0, Math.floor(r.y))
    var x1 = Math.min(pix.w, Math.ceil(r.x + r.w)), y1 = Math.min(pix.h, Math.ceil(r.y + r.h))
    if (x1 - x0 < 4 || y1 - y0 < 4) return 1 /* منطقة تافهة → ماتلمسهاش */
    var d = pix.d, W = pix.w
    var ink = 0, total = 0
    var stepX = (x1 - x0) > 400 ? 2 : 1
    var stepY = (y1 - y0) > 400 ? 2 : 1
    for (var y = y0; y < y1; y += stepY) {
      var base = y * W * 4
      for (var x = x0; x < x1; x += stepX) {
        var i = base + x * 4
        var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        total++
        if (lum < INK_LUM) ink++
      }
    }
    if (total <= 0) return 1
    return ink / total
  } catch (e) { return 1 /* فشل القياس → اعتبرها فيها محتوى (آمن) */ }
}

/* ===== XY-cut: تقسيم الصفحة لكتل محتوى بفواصل الصفوف/الأعمدة البيضا ===== */

interface Block { x0: number; y0: number; x1: number; y1: number }

/** مفيش حبر في شريط صفوف/أعمدة؟ */
function stripEmpty(d: any, W: number, x0: number, y0: number, x1: number, y1: number, axis: 'row' | 'col', a: number, b: number): boolean {
  if (b - a <= 0) return true
  if (axis === 'row') {
    for (var y = a; y < b; y++) {
      var base = y * W * 4
      for (var x = x0; x < x1; x += 2) {
        var i = base + x * 4
        var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
        if (lum < INK_LUM) return false
      }
    }
    return true
  }
  for (var x2 = a; x2 < b; x2++) {
    for (var y2 = y0; y2 < y1; y2 += 2) {
      var i2 = (y2 * W + x2) * 4
      var lum2 = 0.299 * d[i2] + 0.587 * d[i2 + 1] + 0.114 * d[i2 + 2]
      if (lum2 < INK_LUM) return false
    }
  }
  return true
}

/** نقاط الفصل (بداية/نهاية كل run فيه حبر) على محور معين */
function inkRuns(d: any, W: number, x0: number, y0: number, x1: number, y1: number, axis: 'row' | 'col', a0: number, b0: number): { a: number; b: number }[] {
  var runs: { a: number; b: number }[] = []
  var cur: { a: number; b: number } | null = null
  for (var t = a0; t < b0; t++) {
    var has = !stripEmpty(d, W, x0, y0, x1, y1, axis, t, t + 1)
    if (has && !cur) cur = { a: t, b: t + 1 }
    else if (has && cur) cur.b = t + 1
    else if (!has && cur) { runs.push(cur); cur = null }
  }
  if (cur) runs.push(cur)
  return runs
}

function xyCut(d: any, W: number, x0: number, y0: number, x1: number, y1: number, gapMin: number, depth: number, out: Block[]) {
  if (depth > 14 || out.length > 60) return
  var rows = inkRuns(d, W, x0, y0, x1, y1, 'row', y0, y1)
  if (rows.length > 1) {
    for (var i = 0; i < rows.length; i++) {
      if (i > 0 && rows[i].a - rows[i - 1].b < gapMin) {
        /* فجوة صغيرة → الدفعتين كتلة واحدة — كمل على الاتحاد */
        var mergedA = rows[i - 1].a
        var j = i
        var mergedB = rows[i].b
        while (j + 1 < rows.length && rows[j + 1].a - mergedB < gapMin) { j++; mergedB = rows[j].b }
        xyCut(d, W, x0, mergedA, x1, mergedB, gapMin, depth + 1, out)
        i = j
        continue
      }
      xyCut(d, W, x0, rows[i].a, x1, rows[i].b, gapMin, depth + 1, out)
    }
    return
  }
  var cols = inkRuns(d, W, x0, y0, x1, y1, 'col', x0, x1)
  if (cols.length > 1) {
    for (var k = 0; k < cols.length; k++) {
      if (k > 0 && cols[k].a - cols[k - 1].b < gapMin) {
        var m2A = cols[k - 1].a
        var k2 = k
        var m2B = cols[k].b
        while (k2 + 1 < cols.length && cols[k2 + 1].a - m2B < gapMin) { k2++; m2B = cols[k2].b }
        xyCut(d, W, m2A, y0, m2B, y1, gapMin, depth + 1, out)
        k = k2
        continue
      }
      xyCut(d, W, cols[k].a, y0, cols[k].b, y1, gapMin, depth + 1, out)
    }
    return
  }
  if (x1 - x0 >= 4 && y1 - y0 >= 4) out.push({ x0: x0, y0: y0, x1: x1, y1: y1 })
}

/**
 * كشف كل كتل المحتوى في الصفحة — بيرجعها normalized (0..1) مرتبة بترتيب
 * القراءة (فوق لتحت) ومقصوفة: بلا كتل عملاقة (الصفحة كلها) ولا هجر صغيرة.
 */
export function detectBlocksFromPx(pix: PixelMap, maxBlocks: number): NormBox[] {
  try {
    if (!pix || !pix.d || pix.w < 8 || pix.h < 8) return []
    var gapMin = Math.max(5, Math.round(0.012 * Math.max(pix.w, pix.h)))
    var raw: Block[] = []
    xyCut(pix.d, pix.w, 0, 0, pix.w, pix.h, gapMin, 0, raw)
    var area = pix.w * pix.h
    var minA = area * 0.004
    var boxes: { b: NormBox; a: number }[] = []
    for (var i = 0; i < raw.length; i++) {
      var r = raw[i]
      var bw = r.x1 - r.x0, bh = r.y1 - r.y0
      var ba = bw * bh
      if (ba < minA) continue
      if (bw > pix.w * 0.97 && bh > pix.h * 0.97) continue /* الصفحة كلها */
      boxes.push({
        b: { x: r.x0 / pix.w, y: r.y0 / pix.h, w: bw / pix.w, h: bh / pix.h },
        a: ba,
      })
    }
    /* ترتيب قراءة (فوق لتحت، يمين لشمال RTL) مع سقف للعدد — الأكبر أولوية في البقاء */
    boxes.sort(function (p, q) { return q.a - p.a })
    var kept = boxes.slice(0, maxBlocks)
    kept.sort(function (p, q) {
      var dy = p.b.y - q.b.y
      if (Math.abs(dy) > 0.02) return dy
      return q.b.x - p.b.x
    })
    return kept.map(function (k) { return k.b })
  } catch (e) { return [] }
}

/** توسيع صندوق normalized بهامش بسيط مع التثبيت داخل الصفحة */
function padBox(b: NormBox, pad: number): NormBox {
  var x = Math.max(0, b.x - pad), y = Math.max(0, b.y - pad)
  var w = Math.min(1 - x, b.w + pad * 2), h = Math.min(1 - y, b.h + pad * 2)
  return { x: x, y: y, w: w, h: h }
}

/**
 * لصق bbox الـ AI على أقرب كتلة محتوى حقيقية:
 *  • لو bbox بيغطي كتلة (تداخل ≥ 25% من مساحته) → الكتلة دي
 *  • وإلا أقرب كتلة لمركزه جوه نصف قطر 0.30 من قطر الصفحة
 *  • مفيش لصاق منطقي → null (نسيب bbox زي ما هو)
 */
export function snapBoxFromPx(pix: PixelMap, bbox: NormBox | null, maxBlocks: number): NormBox | null {
  try {
    if (!bbox) return null
    var blocks = detectBlocksFromPx(pix, maxBlocks || 14)
    if (blocks.length === 0) return null
    var bx1 = bbox.x + bbox.w, by1 = bbox.y + bbox.h
    var cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
    var bestOverlap: NormBox | null = null
    var bestOverlapArea = 0
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i]
      var ox = Math.min(bx1, b.x + b.w) - Math.max(bbox.x, b.x)
      var oy = Math.min(by1, b.y + b.h) - Math.max(bbox.y, b.y)
      if (ox > 0 && oy > 0) {
        var inter = ox * oy
        var cov = inter / Math.max(0.0001, bbox.w * bbox.h)
        if (cov >= 0.25 && cov > bestOverlapArea) { bestOverlapArea = cov; bestOverlap = b }
      }
    }
    if (bestOverlap) return padBox(bestOverlap, 0.012)
    var bestD = 1e9, bestNear: NormBox | null = null
    for (var j = 0; j < blocks.length; j++) {
      var b2 = blocks[j]
      var bcx = b2.x + b2.w / 2, bcy = b2.y + b2.h / 2
      var dist = Math.sqrt((bcx - cx) * (bcx - cx) + (bcy - cy) * (bcy - cy))
      if (dist < bestD) { bestD = dist; bestNear = b2 }
    }
    if (bestNear && bestD <= 0.30) return padBox(bestNear, 0.012)
    return null
  } catch (e) { return null }
}

/**
 * حارس القص الفاضي: لو منطقة القص الحالية شبه فاضية (حبر < 1.5%)
 * وbbox الـ AI موجود → هات أقرب كتلة حقيقية وارجع منطقة بكسل جديدة.
 * بيرجع null لو مفيش تصحيح منطقي (المنطقة سليمة أو مفيش كتل).
 */
export function snapCropFromPx(pix: PixelMap, bbox: NormBox | null, region: PxRegion): PxRegion | null {
  try {
    var ink = regionInkFromPx(pix, region)
    if (ink >= 0.015) return null /* فيها محتوى — سليمة */
    if (!bbox) return null
    var blocks = detectBlocksFromPx(pix, 14)
    if (blocks.length === 0) return null
    var cx = bbox.x + bbox.w / 2, cy = bbox.y + bbox.h / 2
    var bestD = 1e9, best: NormBox | null = null
    for (var i = 0; i < blocks.length; i++) {
      var b = blocks[i]
      var bcx = b.x + b.w / 2, bcy = b.y + b.h / 2
      var dist = Math.sqrt((bcx - cx) * (bcx - cx) + (bcy - cy) * (bcy - cy))
      if (dist < bestD) { bestD = dist; best = b }
    }
    if (!best || bestD > 0.42) return null
    var p = padBox(best, 0.012)
    var rx = Math.max(0, Math.floor(p.x * pix.w))
    var ry = Math.max(0, Math.floor(p.y * pix.h))
    var rx1 = Math.min(pix.w, Math.ceil((p.x + p.w) * pix.w))
    var ry1 = Math.min(pix.h, Math.ceil((p.y + p.h) * pix.h))
    if (rx1 - rx < 8 || ry1 - ry < 8) return null
    return { x: rx, y: ry, w: rx1 - rx, h: ry1 - ry }
  } catch (e) { return null }
}

/* ===== أداة المتصفح: بكسلات مصغرة من DOM canvas للتحليل السريع ===== */
export function analysisPixelsDom(canvas: HTMLCanvasElement, maxSide: number): PixelMap | null {
  try {
    var longest = Math.max(canvas.width, canvas.height) || 1
    var scale = Math.min(1, (maxSide || 760) / longest)
    var w = Math.max(8, Math.round(canvas.width * scale))
    var h = Math.max(8, Math.round(canvas.height * scale))
    var c = document.createElement('canvas')
    c.width = w; c.height = h
    var ctx = c.getContext('2d', { willReadFrequently: true })
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(canvas, 0, 0, w, h)
    var img = ctx.getImageData(0, 0, w, h)
    return { d: img.data, w: w, h: h }
  } catch (e) { return null }
}

/* ============================================================
 * (ز43) splitRegionIntoPartsFromPx — تقطيع bbox العريض لأجزاء
 * ============================================================
 * طلب المستر: «السؤال فيه A B C ويقص الرسومات زيهم — التلات رسومات
 * يكونوا في السؤال واحد» — لما الاستخراج يرجّع رسمة واحدة عريضة فيها
 * رسومات الاختيارات جنب بعض (أو تحت بعض)، بنقطّعها عند أوسع الفواصل
 * البيضا على المحور المهيمن — كل جزء يبقى bbox لاختيار.
 * بترجع null لو مفيش تقطيع منطقي (فواصل ناقصة/جزء فاضي) — والمتصل
 * يفضل يعرض الرسمة الواحدة زي ما هي (سلوك آمن).
 * ============================================================ */
export function splitRegionIntoPartsFromPx(pix: PixelMap, bbox: NormBox, parts: number): NormBox[] | null {
  try {
    if (!pix || !pix.d || parts < 2) return null
    var rx0 = Math.max(0, Math.floor(bbox.x * pix.w))
    var ry0 = Math.max(0, Math.floor(bbox.y * pix.h))
    var rx1 = Math.min(pix.w, Math.ceil((bbox.x + bbox.w) * pix.w))
    var ry1 = Math.min(pix.h, Math.ceil((bbox.y + bbox.h) * pix.h))
    var rw = rx1 - rx0, rh = ry1 - ry0
    if (rw < 24 || rh < 24) return null

    /* كثافة الحبر لكل عمود/صف جوه المنطقة */
    var density = function (axis: 'col' | 'row'): number[] {
      var n = axis === 'col' ? rw : rh
      var m = axis === 'col' ? rh : rw
      var outArr = new Array(n)
      for (var i = 0; i < n; i++) outArr[i] = 0
      var d = pix.d, W = pix.w
      for (var j = 0; j < m; j += 1) {
        for (var i2 = 0; i2 < n; i2 += 1) {
          var x = axis === 'col' ? rx0 + i2 : rx0 + j
          var y = axis === 'col' ? ry0 + j : ry0 + i2
          var idx = (y * W + x) * 4
          var lum = 0.299 * d[idx] + 0.587 * d[idx + 1] + 0.114 * d[idx + 2]
          if (lum < INK_LUM) outArr[i2] += 1
        }
      }
      return outArr
    }

    var tryAxis = function (axis: 'col' | 'row'): NormBox[] | null {
      var prof = density(axis)
      var n = prof.length
      var m = axis === 'col' ? rh : rw
      var total = Math.max(1, n * m)
      /* حاجة واخدة حبر؟ */
      var inkAny = 0
      for (var i = 0; i < n; i++) if (prof[i] > 0) inkAny++
      if (inkAny < 2) return null
      /* الفواصل: رانات شبه فاضية — مستبعاد الهامش 12% من كل ناحية */
      var margin = Math.max(2, Math.round(0.12 * n))
      var gapMin = Math.max(2, Math.round(0.025 * n))
      var gaps: { a: number; b: number; w: number }[] = []
      var cur: { a: number; b: number } | null = null
      for (var t = margin; t < n - margin; t++) {
        var emptyCol = prof[t] <= Math.max(1, Math.round(0.02 * m))
        if (emptyCol && !cur) cur = { a: t, b: t + 1 }
        else if (emptyCol && cur) cur.b = t + 1
        else if (!emptyCol && cur) {
          if (cur.b - cur.a >= gapMin) gaps.push({ a: cur.a, b: cur.b, w: cur.b - cur.a })
          cur = null
        }
      }
      if (cur && cur.b - cur.a >= gapMin) gaps.push({ a: cur.a, b: cur.b, w: cur.b - cur.a })
      if (gaps.length < parts - 1) return null
      /* أوسع parts-1 فاصل — لازم يكونوا كفاية */
      gaps.sort(function (g1, g2) { return g2.w - g1.w })
      var chosen = gaps.slice(0, parts - 1)
      chosen.sort(function (g1, g2) { return g1.a - g2.a })
      /* بناء الأجزاء */
      var cuts = [0]
      for (var c = 0; c < chosen.length; c++) cuts.push(Math.round((chosen[c].a + chosen[c].b) / 2))
      cuts.push(n)
      var outBoxes: NormBox[] = []
      for (var p = 0; p < cuts.length - 1; p++) {
        var a0 = cuts[p], a1 = cuts[p + 1]
        if (a1 - a0 < 8) return null
        var bx = axis === 'col' ? rx0 + a0 : rx0
        var by = axis === 'col' ? ry0 : ry0 + a0
        var bw = axis === 'col' ? a1 - a0 : rw
        var bh = axis === 'col' ? rh : a1 - a0
        /* كل جزء لازم يكون فيه حبر فعلًا */
        var hasInk = false
        for (var yy = by; yy < by + bh && !hasInk; yy += 2) {
          for (var xx = bx; xx < bx + bw; xx += 2) {
            var idd = (yy * pix.w + xx) * 4
            var lm = 0.299 * pix.d[idd] + 0.587 * pix.d[idd + 1] + 0.114 * pix.d[idd + 2]
            if (lm < INK_LUM) { hasInk = true; break }
          }
        }
        if (!hasInk) return null
        outBoxes.push({
          x: Math.max(0, bx / pix.w),
          y: Math.max(0, by / pix.h),
          w: Math.min(1, bw / pix.w),
          h: Math.min(1, bh / pix.h),
        })
      }
      return outBoxes
    }

    /* المحور المهيمن الأول — ولو فشل نجرب التاني */
    var primary = (rw >= rh) ? 'col' : 'row'
    var secondary = primary === 'col' ? 'row' : 'col'
    var res = tryAxis(primary as any) || tryAxis(secondary as any)
    return res
  } catch (e) { return null }
}
