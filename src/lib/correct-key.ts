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
        var tn = options.indexOf(q.correct)
        if (tn >= 0) correctIdx = tn
      }
    } else if (/^[A-Za-z]$/.test(cTrim)) correctIdx = cTrim.toUpperCase().charCodeAt(0) - 65
    else if (options.length > 0) {
      var t = options.indexOf(q.correct)
      if (t >= 0) correctIdx = t
    }
  }
  return correctIdx
}
