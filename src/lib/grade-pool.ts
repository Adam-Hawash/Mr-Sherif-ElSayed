// ============================================================
// (2026-و44) runGradePool — تشغيل مهام التصحيح بتوازي صغير ومتحكم فيه
//
// طلب المستر: «تسرع لي عمليات التصحيح شوية».
// الدرس التاريخي (و25): نداءات AI كتير متوازية على نفس المفتاح = 429
// = فولباك كله غلط. الحل هنا: **اتنين بس** مع تأخير بسيط بين بداية
// كل عامل — تسريع ~1.8x على امتحان فيه كام سؤال مقالي/صور، ومفيش ضغط
// على المفتاح، وفشل أي سؤال بيفضل معزول بفولباكه الخاص (زي ما هو).
// ============================================================

export async function runGradePool(
  tasks: (() => Promise<void>)[],
  concurrency?: number,
  staggerMs?: number
): Promise<void> {
  var n = Math.max(1, Math.min(4, concurrency || 2))
  var stagger = typeof staggerMs === 'number' ? staggerMs : 400
  var next = 0
  var worker = async function (w: number) {
    /* تأخير بداية كل عامل عن اللي قبله — منع الاندفاع على المفتاح */
    if (w > 0) {
      try { await new Promise(function (r) { setTimeout(r, stagger * w) }) } catch (e) {}
    }
    while (true) {
      var my = next
      next = my + 1
      if (my >= tasks.length) return
      try { await tasks[my]() } catch (e) { /* كل مهمة بتتعامل مع فشلها بنفسها */ }
    }
  }
  var workers: Promise<void>[] = []
  for (var w = 0; w < n; w++) workers.push(worker(w))
  await Promise.all(workers)
}
