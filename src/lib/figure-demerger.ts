// ============================================================
// FIGURE-DEMERGER (و53) — فك الالتحام في قص الرسمات
// ============================================================
// شكوى المستر الحرفية: «ممكن يقص لي رسمتين جنب بعض مع ان السؤال فيه
// رسمه واحده». السبب: bbox الرسمة بيتمدد بهامش أمان وبعدها تقليم الأبيض
// بيرصّ على **اتحاد** المحتوى — فلو فيه رسمة تانية لاصقة جنب الرسمة
// المطلوبة، الاتحاد بيشملها وبتطلع في القص.
//
// الحل: بعد التقليم، بنفحص المنطقة على محورين (أفقي ثم رأسي):
//   • لو فيها كتلتين محتوى منفصلتين بفاصل أبيض نضيف وعريض
//   • و bbox السؤال الأصلي مركز على كتلة واحدة منهم بس (التانية
//     اتسحبت معاها بالغلط من الهامش)
// → بنقص الكتلة المطلوبة لوحدها + هامش صغير.
// القواعد محافظة عشان ما نقصنش رسمة سليمة: الفاصل لازم يكون نضيف،
// وكل كتلة كبيرة (≥18%)، و bbox هو الحكم النهائي.
//
// الملف ده pure-TS من غير أي اعتماديات — بيشتغل على السيرفر (napi canvas)
// وفي المتصفح (DOM canvas) بنفس الكود بالظبط.
// ============================================================

export interface DemergeReg { x: number; y: number; w: number; h: number }
export interface DemergeOrig { x0: number; y0: number; x1: number; y1: number }
export type DemergeGrab = (rx: number, ry: number, rw: number, rh: number) => { d: Uint8ClampedArray | Uint8Array; w: number; h: number } | null

/**
 * فك الالتحام — بياخد منطقة القص المقلّمة (refined) و bbox الأصلي بإحداثيات
 * صفحة المصدر بالبكسل، ويرجّع منطقة أنضف لو لقى التهام رسمة مجاورة.
 * أي شك → بيرجّع المنطقة الأصلية زي ما هي (آمن).
 */
export function splitMergedRegion(grab: DemergeGrab, reg: DemergeReg, orig: DemergeOrig): DemergeReg {
  try {
    var onePass = function (r: DemergeReg, axis: 'x' | 'y'): DemergeReg {
      if (!r || r.w < 24 || r.h < 24) return r
      var px = grab(r.x, r.y, r.w, r.h)
      if (!px || !px.d || px.w < 8 || px.h < 8) return r
      var d = px.d, w = px.w, h = px.h
      var mainLen = axis === 'x' ? w : h
      var crossLen = axis === 'x' ? h : w

      /* إشغال كل خط على المحور الرئيسي (عدد البكسلات غير البيضا) */
      var cnt = new Int32Array(mainLen)
      var noiseMain = Math.max(1, Math.round(crossLen * 0.004))
      for (var a = 0; a < mainLen; a++) {
        var c = 0
        for (var b = 0; b < crossLen; b++) {
          var i = (axis === 'x' ? (b * w + a) : (a * w + b)) * 4
          var lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          if (lum < 236) c++
        }
        cnt[a] = c
      }

      /* كتل المحتوى المتفصلة بفواصل نضيفة */
      var gapMin = Math.max(4, Math.round(mainLen * 0.008))
      var segMin = Math.max(12, Math.round(mainLen * 0.18))
      var segs: { a: number; b: number }[] = []
      var s = -1, gapRun = 0
      for (var a2 = 0; a2 < mainLen; a2++) {
        if (cnt[a2] > noiseMain) {
          if (s < 0) s = a2
          gapRun = 0
        } else if (s >= 0) {
          gapRun++
          if (gapRun >= gapMin) { segs.push({ a: s, b: a2 - gapRun }); s = -1; gapRun = 0 }
        }
      }
      if (s >= 0) segs.push({ a: s, b: mainLen - 1 })
      var big: { a: number; b: number }[] = []
      for (var si = 0; si < segs.length; si++) {
        if ((segs[si].b - segs[si].a + 1) >= segMin) big.push(segs[si])
      }
      if (big.length < 2) return r

      /* bbox الأصلي بإحداثيات محلية على المحور الرئيسي */
      var oStart = axis === 'x' ? orig.x0 : orig.y0
      var oEnd = axis === 'x' ? orig.x1 : orig.y1
      var rStart = axis === 'x' ? r.x : r.y
      var o0 = Math.max(0, Math.min(mainLen, oStart - rStart))
      var o1 = Math.max(0, Math.min(mainLen, oEnd - rStart))
      var oW = o1 - o0
      if (oW <= 2) return r

      /* أفضل كتلة = أكبر تقاطع مع bbox (+أفضلية لو مركز bbox جواها) */
      var bestI = -1, bestScore = -1
      var overlaps: number[] = []
      for (var bi = 0; bi < big.length; bi++) {
        var ov = Math.min(big[bi].b + 1, o1) - Math.max(big[bi].a, o0)
        if (ov < 0) ov = 0
        overlaps.push(ov)
        var center = (o0 + o1) / 2
        var score = ov + (center >= big[bi].a && center <= big[bi].b ? mainLen * 0.35 : 0)
        if (score > bestScore) { bestScore = score; bestI = bi }
      }
      if (bestI < 0) return r
      var bestOv = overlaps[bestI]
      /* (و53) شرط الفصل: أحسن كتلة لازم يكون لها حضور حقيقي جوه bbox.
         ملاحظة مهمة: حالة المستر نفسها bbox الـ AI بيغطي الرسمتين مع بعض
         («بيقص رسمتين جنب بعض مع ان السؤال فيه رسمه واحده») — فمفيش شرط
         إن الكتل التانية تكون صغيرة، الفصل بيحصل والكتلة المختارة هي اللي
         لها أكبر تقاطع/مركز bbox. الرسمة النادرة اللي رسمتها فعلًا جزأين
         بتتظبط يدوي من «✂️ عدّل القص». */
      if (bestOv < 0.28 * oW) return r

      /* الكتلة المطلوبة اتحوّدت — هامش صغير حواليها */
      var keep = big[bestI]
      var mA = Math.max(6, Math.round(mainLen * 0.012))
      var kA = Math.max(0, keep.a - mA)
      var kB = Math.min(mainLen, keep.b + 1 + mA)

      /* إعادة تحديد المدى العرضي جوه الكتلة المبقاة (تقليم أبيض تاني) */
      var noiseCross = Math.max(1, Math.round((kB - kA) * 0.004))
      var c0 = -1, c1 = -1
      for (var c2 = 0; c2 < crossLen; c2++) {
        var cc = 0
        for (var a3 = kA; a3 < kB; a3++) {
          var i2 = (axis === 'x' ? (c2 * w + a3) : (a3 * w + c2)) * 4
          var lum2 = 0.299 * d[i2] + 0.587 * d[i2 + 1] + 0.114 * d[i2 + 2]
          if (lum2 < 236) cc++
        }
        if (cc > noiseCross) { if (c0 < 0) c0 = c2; c1 = c2 }
      }
      if (c0 < 0) return r
      var mC = Math.max(6, Math.round(crossLen * 0.015))
      var cA = Math.max(0, c0 - mC), cB = Math.min(crossLen, c1 + 1 + mC)

      if (axis === 'x') {
        var nw = kB - kA, nh = cB - cA
        if (nw < 12 || nh < 12) return r
        return { x: r.x + kA, y: r.y + cA, w: nw, h: nh }
      }
      var nw2 = cB - cA, nh2 = kB - kA
      if (nw2 < 12 || nh2 < 12) return r
      return { x: r.x + cA, y: r.y + kA, w: nw2, h: nh2 }
    }

    /* أفقي الأول (رسمتين جنب بعض — الشكوى الأساسية) ثم رأسي (فوق بعض) */
    var out = onePass(reg, 'x')
    out = onePass(out, 'y')
    return out
  } catch (eS) {
    return reg
  }
}
