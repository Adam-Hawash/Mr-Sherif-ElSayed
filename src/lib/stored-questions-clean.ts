// @ts-nocheck
// ============================================================
// FILE: src/lib/stored-questions-clean.ts
// (وN5) الصف النهائي لحرف الـ N والـ \na. \nb. — تنظيف تلقائي وقت القراءة
// ============================================================
// شكوى المستر (بالصورة): «rectangles.\na. \nb. \nc.» لسه ظاهرة.
// السبب: بيانات قديمة اتخزنت قبل إصلاح (ز44) — وزرار التنظيف اليدوي
// مش دايمًا بيتداس ومحدود بآخر 200 سجل.
//
// الحل هنا: أي واجب/امتحان/نموذج بيقرا من قاعدة البيانات (قائمة أو بالمعرف)
// بيمر على sanitize هنا **قبل ما يرجع للطالب أو الأدمن** — ولو اتغير حاجة
// النسخة النضيفة بتتكتب في القاعدة في الخلفية (fire-and-forget) — فالبيانات
// القديمة بتتنضف لوحدها من أول مرة تفتح، ومن غير أي تدخل يدوي.
// نفس عقل cleanup-extraction بالحرف — بس أوتوماتيك على كل قراءة.
// ============================================================
import { db, safeWrite } from '@/lib/db'
import { cleanTextDeep } from '@/lib/math-text'
import { splitEmbeddedOptions } from '@/lib/question-figures'

/* تنظيف مصفوفة أسئلة كاملة — بيرجع { arr, changed } (نفس عقل cleanup-extraction) */
export function cleanQuestionsArr(questions: any[]): { arr: any[]; changed: boolean } {
  var changed = false
  if (!Array.isArray(questions)) return { arr: questions, changed: false }
  var arr = questions.map(function (q: any) {
    if (!q || typeof q !== 'object') return q
    var r = cleanTextDeep(q)
    var qq = splitEmbeddedOptions(r.val)
    if (qq && typeof qq === 'object' && qq._figureSplitPending) delete qq._figureSplitPending
    /* إبادة حشو «N/A» في الاختيارات القديمة */
    if (qq && typeof qq === 'object' && Array.isArray(qq.options)) {
      var hadNA = false
      var optsC = qq.options.map(function (o: any) {
        var s = String(o == null ? '' : o)
        if (s === 'N/A') { hadNA = true; return '' }
        return o
      })
      if (hadNA) { qq = Object.assign({}, qq, { options: optsC }); changed = true }
    }
    if (r.changed || qq !== q) changed = true
    return qq
  })
  return { arr: arr, changed: changed }
}

/* تنظيف نص أسئلة JSON — بيرجع { str, changed } */
export function cleanQuestionsStr(raw: string): { str: string; changed: boolean } {
  if (!raw || String(raw).trim() === '' || String(raw).trim() === '[]') return { str: raw, changed: false }
  try {
    var qs = JSON.parse(String(raw))
    if (!Array.isArray(qs) || qs.length === 0) return { str: raw, changed: false }
    var r = cleanQuestionsArr(qs)
    if (!r.changed) return { str: raw, changed: false }
    return { str: JSON.stringify(r.arr), changed: true }
  } catch (e) { return { str: raw, changed: false } }
}

/* تنظيف نماذج الامتحان (models) — كل نموذج فيه questions */
export function cleanModelsStr(raw: string): { str: string; changed: boolean } {
  if (!raw || String(raw).trim() === '' || String(raw).trim() === '[]') return { str: raw, changed: false }
  try {
    var models = JSON.parse(String(raw))
    if (!Array.isArray(models) || models.length === 0) return { str: raw, changed: false }
    var changed = false
    for (var i = 0; i < models.length; i++) {
      var m = models[i]
      if (!m || typeof m !== 'object' || !Array.isArray(m.questions)) continue
      var r = cleanQuestionsArr(m.questions)
      if (r.changed) { m.questions = r.arr; changed = true }
    }
    if (!changed) return { str: raw, changed: false }
    return { str: JSON.stringify(models), changed: true }
  } catch (e) { return { str: raw, changed: false } }
}

/* تنظيف نص حر (content/شرح/ملاحظات) — بيمر على cleanTextDeep بس */
export function cleanFreeText(raw: string): { str: string; changed: boolean } {
  if (!raw || typeof raw !== 'string') return { str: raw, changed: false }
  var r = cleanTextDeep(raw)
  return { str: r.val, changed: r.changed }
}

/* (وN5) أوتوكليك للواجب — بينضف ويرجّع النسخة النضيفة فورًا ويحدّث القاعدة في الخلفية */
export function autoCleanHomework(id: string, hw: any): any {
  try {
    var out: any = Object.assign({}, hw)
    var touched = false
    if (out.questions) {
      var rQ = cleanQuestionsStr(String(out.questions))
      if (rQ.changed) { out.questions = rQ.str; touched = true }
    }
    if (out.content) {
      var rC = cleanFreeText(String(out.content))
      if (rC.changed) { out.content = rC.str; touched = true }
    }
    if (touched) {
      var data: any = {}
      if (out.questions !== hw.questions) data.questions = out.questions
      if (out.content !== hw.content) data.content = out.content
      var idCap = String(id || (hw && hw.id) || '')
      if (idCap && Object.keys(data).length > 0) {
        safeWrite(function () { return db.homework.update({ where: { id: idCap }, data: data }) })
          .catch(function () {})
      }
    }
    return out
  } catch (e) { return hw }
}

/* (وN5) أوتوكليك للامتحان — الأسئلة + النماذج + content */
export function autoCleanExam(id: string, ex: any): any {
  try {
    var out: any = Object.assign({}, ex)
    var touched = false
    if (out.questions) {
      var rQ = cleanQuestionsStr(String(out.questions))
      if (rQ.changed) { out.questions = rQ.str; touched = true }
    }
    if (out.models) {
      var rM = cleanModelsStr(String(out.models))
      if (rM.changed) { out.models = rM.str; touched = true }
    }
    if (out.content) {
      var rC = cleanFreeText(String(out.content))
      if (rC.changed) { out.content = rC.str; touched = true }
    }
    if (touched) {
      var data: any = {}
      if (out.questions !== ex.questions) data.questions = out.questions
      if (out.models !== ex.models) data.models = out.models
      if (out.content !== ex.content) data.content = out.content
      var idCap = String(id || (ex && ex.id) || '')
      if (idCap && Object.keys(data).length > 0) {
        safeWrite(function () { return db.exam.update({ where: { id: idCap }, data: data }) })
          .catch(function () {})
      }
    }
    return out
  } catch (e) { return ex }
}
