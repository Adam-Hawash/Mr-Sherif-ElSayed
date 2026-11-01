// @ts-nocheck
// FILE: src/lib/exam-models.ts
// PURPOSE: منطق اختيار نموذج الطالب الحتمي — **نسخة واحدة مشتركة** بتشتغل في:
//   • /api/exams (GET — الأسئلة اللي الطالب شافها فعلًا: applyModelForStudent)
//   • /api/exams/submit (التسليم والتصحيح على أسئلة نموذج الطالب)
//   • regrade-core (الإصلاح الذاتي + زرار إعادة التصحيح + sweep)
//   • /api/exam-results + /api/students/[id]/progress (شاشات الأدمن)
//
// WHY (علة «الورق بيتعرض في سؤال مش سؤاله» — 2026-و22):
//   التسليم بيصحح على أسئلة نموذج الطالب، لكن شاشات العرض/إعادة التصحيح
//   كانت بتقرأ أسئلة الامتحان الأساس → إجابات الطالب (وصور ورقته) بتتربط
//   بأسئلة تانية خالص. من غير helper مشترك، أي مكان بينسى النماذج بيعثر
//   العرض. الدالة دي بترجّع **أسئلة الطالب الفعلية** في كل مكان بنفس
//   الخوارزمية الحتمية (نفس الهاش) فالطالب بيشوف ويُصحح ويعرض على نفس
//   الأسئلة بالظبط.

export function pickModelIdx(examId: string, studentId: string, n: number): number {
  var s = String(examId) + '|' + String(studentId)
  var h = 5381
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return n > 0 ? h % n : 0
}

export function parseQuestions(rawQ: any): any[] {
  try {
    var raw = typeof rawQ === 'string' ? JSON.parse(rawQ) : rawQ
    if (Array.isArray(raw)) return raw
  } catch (e) {}
  return []
}

/* هل الامتحان ده فيه نماذج أصلاً؟ */
export function examHasModels(exam: any): boolean {
  try {
    var models = exam && exam.models ? (typeof exam.models === 'string' ? JSON.parse(exam.models) : exam.models) : []
    return Array.isArray(models) && models.length > 0
  } catch (e) {
    return false
  }
}

/* بترجّع أسئلة الطالب الفعلية (نموذجه) — نفس منطق applyModelForStudent
 * في /api/exams بالظبط (نفس الترتيب: fixed أولاً ثم الهاش الحتمي).
 * الفولباك دايمًا الأسئلة الأساس — ومفيش أي حالة بترجّع فاضي. */
export function resolveQuestionsForStudent(exam: any, studentId: string, examId: string): any[] {
  var base = parseQuestions(exam && exam.questions)
  try {
    var models = exam && exam.models ? (typeof exam.models === 'string' ? JSON.parse(exam.models) : exam.models) : []
    if (!Array.isArray(models) || models.length === 0) return base
    var idx = -1
    if (exam.modelMode === 'fixed' && exam.fixedModel) {
      for (var f = 0; f < models.length; f++) {
        if (models[f] && models[f].name === exam.fixedModel) { idx = f; break }
      }
      if (idx < 0) idx = 0
    } else {
      idx = pickModelIdx(examId, studentId, models.length)
    }
    var m = models[idx]
    if (!m) return base
    var mq = m.questions ? (typeof m.questions === 'string' ? parseQuestions(m.questions) : m.questions) : null
    if (Array.isArray(mq) && mq.length > 0) return mq
  } catch (e) {}
  return base
}

/* فصل الأسئلة اختياري/مقالي **بالفهرس الأصلي** — نفس منطق splitQuestions
 * في regrade-core ومسارات التسليم، عشان أي شاشة عرض تقرأ إجابة الطالب
 * بفهرسه الصحيح (قراية بأي ترقيم تاني = ورق في سؤال مش سؤاله) */
export function splitForDisplay(questions: any[], mcqOut: any[], writingOut: any[]): void {
  ;(Array.isArray(questions) ? questions : []).forEach(function (q, idx) {
    var isWriting = q.type === 'writing' || q.type === 'essay'
    if (!isWriting && Array.isArray(q.options)) {
      var allNA = q.options.length > 0 && q.options.every(function (o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
      if (allNA) isWriting = true
    }
    if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
    if (isWriting) writingOut.push({ q: q, origIdx: idx })
    else mcqOut.push({ q: q, origIdx: idx })
  })
}
