// @ts-nocheck
// ============================================================
// (ز43) /api/cleanup-extraction — تنظيف شامل لرموز الاستخراج الغريبة
// ============================================================
// شكوى المستر الحرفية: «في منصات بتحط رموز غريبة زي حرف الـ N ده بيعكس
// الهبد وحاجات غريبة… إيه حرف الـ N اللي أنت بتحطه لي في أي حته ده؟»
//
// الراوت ده بيلف على كل الواجبات والامتحانات (ونماذج الامتحانات) ويصلح:
//   1) بقايا escapes الاستخراج: \n \a \b \c … الحرفية → بتتشال صح
//      (سطر جديد للأولانية، والحروف ترجع نص عادي — الـ \frac و \sqrt
//      المشروعة بتفضل زي ما هي)
//   2) الاختيارات المدموجة جوه نص السؤال: «…\na. 2\nb. …\nc. …»
//      → سؤال + اختيارات حقيقية A B C (نفس عقل الاستخراج splitEmbeddedOptions)
//   3) كل نص جوه السؤال بيمر على cleanTextDeep — سؤال/اختيارات/موديل
//      أنسر/إجابات مقبولة/خلايا الجداول
//
// الرد: { success, scanned, fixed, homeworks, exams, models }
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { cleanTextDeep } from '@/lib/math-text'
import { splitEmbeddedOptions } from '@/lib/question-figures'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const maxDuration = 300

const TAKE = 200

/* تنظيف مصفوفة أسئلة كاملة — بيرجع { arr, changed } */
function cleanQuestionsArr(questions: any[]): { arr: any[]; changed: boolean } {
  var changed = false
  if (!Array.isArray(questions)) return { arr: questions, changed: false }
  var arr = questions.map(function (q: any) {
    if (!q || typeof q !== 'object') return q
    var r = cleanTextDeep(q)
    var qq = splitEmbeddedOptions(r.val)
    if (qq && typeof qq === 'object' && qq._figureSplitPending) delete qq._figureSplitPending
    if (r.changed || qq !== q) changed = true
    return qq
  })
  return { arr: arr, changed: changed }
}

/* تنظيف نص أسئلة JSON — بيرجع { str, changed } */
function cleanQuestionsStr(raw: string): { str: string; changed: boolean } {
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
function cleanModelsStr(raw: string): { str: string; changed: boolean } {
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

export async function POST(request: NextRequest) {
  try {
    var body = await request.json().catch(function () { return null })
    var adminId = String((body && body.adminId) || '')
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح — سجل دخول أدمن الأول' }, { status: 401 })
    }

    var stats = { scanned: 0, fixed: 0, homeworks: 0, exams: 0, models: 0 }

    /* 1) الواجبات */
    try {
      var hws = await db.homework.findMany({ orderBy: { createdAt: 'desc' }, take: TAKE })
      for (var i = 0; i < hws.length; i++) {
        var h = hws[i]
        stats.scanned++
        var rH = cleanQuestionsStr(h.questions)
        if (rH.changed) {
          var hRef = h
          var strH = rH.str
          await safeWrite(function () {
            return db.homework.update({ where: { id: hRef.id }, data: { questions: strH } })
          })
          stats.fixed++; stats.homeworks++
        }
      }
    } catch (eH) { /* جدول ناقص في منصة — نكمل */ }

    /* 2) الامتحانات (الأسئلة + النماذج) */
    try {
      var exs = await db.exam.findMany({ orderBy: { createdAt: 'desc' }, take: TAKE })
      for (var j = 0; j < exs.length; j++) {
        var e = exs[j]
        stats.scanned++
        var rQ = cleanQuestionsStr(e.questions)
        var rM = cleanModelsStr(e.models)
        if (rQ.changed || rM.changed) {
          var data: any = {}
          if (rQ.changed) { data.questions = rQ.str; stats.exams++ }
          if (rM.changed) { data.models = rM.str; stats.models++ }
          var exRef = e
          await safeWrite(function () {
            return db.exam.update({ where: { id: exRef.id }, data: data })
          })
          stats.fixed++
        }
      }
    } catch (eE) { /* جدول ناقص في منصة — نكمل */ }

    return NextResponse.json({
      success: true,
      scanned: stats.scanned,
      fixed: stats.fixed,
      homeworks: stats.homeworks,
      exams: stats.exams,
      models: stats.models,
    })
  } catch (error: any) {
    console.error('cleanup-extraction error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
