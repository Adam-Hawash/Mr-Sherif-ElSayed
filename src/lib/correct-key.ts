// FILE: src/lib/correct-key.ts
// PURPOSE: مصدر واحد لمفتاح الإجابة الصحيحة — بيتستخدم في السيرفر (تصحيح الواجب والامتحانات)
//          وفي العميل (شاشة مراجعة الواجب) عشان الاثنين يحسبوا نفس الحرف بالظبط.
//
// ليه الملف ده موجود؟ (2026-و33)
//   الإصلاح الأول (و32) طبّق التطبيع على السيرفر بس — شاشة المراجعة على العميل كانت لسه
//   بتحسب «الإجابة الصحيحة» بالمفتاح الخام: typeof q.correct === 'number' ? q.correct : 0
//   فأي مفتاح مخزن كنص "2" أو حرف "B" كان بيترجع 0 (يعني A) والطالب اللي حل صح
//   بيلاقي كارت «إجابتك صحيحة» واريله حرف إجابة غلط — وكده بيبان إن التصحيح غلط
//   حتى لو الدرجة نفسها محسوبة صح. من دلوقتي الاثنين بيستخدموا نفس الدالة دي بالظبط.
//
// (وN6) طلب المستر الحرفي: «مش عايز يكون في فرق ما بين الـ k السمول والكابتن،
//   الحروف السمول والكابتن تكون هي هي — المصحح يعمل بذكاء»
//   المطابقة بين نص المفتاح ونص الاختيار بقت بتطبيع كامل: الكابتن = السمول،
//   المسافات الزيادة = إزالة، الأرقام العربي = إنجليزي، علامات الترقيم الآخرة تتشال.
//   «K - 18» === «k - 18» === «k-18» — كلها نفس الاختيار.

/*
 * normalizeKeyText — تطبيع موحّد لأي نص مفتاح/اختيار قبل المقارنة:
 *   lowercase (الكابتن = السمول) + أرقام عربي → إنجليزي + ضغط المسافات
 *   + تشال علامات الترقيم في الآخر — عشان المقارنة تبقى بالقيمة مش بالشكل.
 */
export function normalizeKeyText(s: any): string {
  var t = String(s == null ? '' : s).toLowerCase()
  /* أرقام عربية-هندية وفارسية → إنجليزية */
  t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
  t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
  /* مسافات مكررة → واحدة، وحواف نضيفة */
  t = t.replace(/\s+/g, ' ').trim()
  /* علامات ترقيم في آخر النص — ما بتغيرش القيمة */
  t = t.replace(/[.,؛،]+$/g, '')
  return t
}

/*
 * normalizeCorrectKey — يحوّل أي صيغة مفتاح مخزنة لفهرس خيار صحيح:
 *   2 / "2" / "B" / "b" / نص الخيار نفسه → الفهرس الصح
 *   بيرجع -1 لو المفتاح مش موجود أو مش مفهوم (بدل ما يقع غلط على 0)
 *   عشان أي صيغة غريبة ما ترجعش لمفتاح غلط وتحكم على إجابة صح إنها غلط
 *   (ده كان سبب شكاوى «بحل صح وبيظهرلي غلط» في الواجب والامتحانات)
 */
export function normalizeCorrectKey(q: any, opts: any[]): number {
  var correctIdx = -1
  if (!q) return correctIdx
  var options = Array.isArray(opts) ? opts : []
  if (typeof q.correct === 'number') correctIdx = q.correct
  else if (typeof q.correct === 'string') {
    var cTrim = q.correct.trim()
    if (/^[0-9]+$/.test(cTrim)) {
      var n = parseInt(cTrim, 10)
      if (n >= 0 && n < options.length) correctIdx = n
      else if (options.length > 0) {
        /* (وN6) مطابقة نصية بتطبيع — مش indexOf حساسة للحروف */
        var cn = normalizeKeyText(q.correct)
        for (var ni = 0; ni < options.length; ni++) {
          if (normalizeKeyText(options[ni]) === cn) { correctIdx = ni; break }
        }
      }
    } else if (/^[A-Za-z]$/.test(cTrim)) correctIdx = cTrim.toUpperCase().charCodeAt(0) - 65
    else if (options.length > 0) {
      /* (وN6) المطابقة النصية بقيت بتطبيع كامل: الكابتن = السمول +
         المسافات موحّدة + الأرقام العربي = إنجليزي — «K - 18» === «k - 18» */
      var cn2 = normalizeKeyText(q.correct)
      for (var oi = 0; oi < options.length; oi++) {
        if (normalizeKeyText(options[oi]) === cn2) { correctIdx = oi; break }
      }
    }
  }
  return correctIdx
}
