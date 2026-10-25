// @ts-nocheck
// ============================================================
// (و51) /api/backfill-figures — إصلاح جذري لـ «الصور مش بتظهر للطلاب»
// ============================================================
// الجذر: أسئلة اتحفظت في عهد القص المكسور (و45–و49) فيها bbox من غير url —
// فالطالب بيلاقي مفيش صورة (الحقل ناقص مش مشكلة عرض). الحل:
// نلف على كل الواجبات والامتحانات (وكل نموذج امتحان)، وأي سؤال فيه
// رسمة bbox من غير url → نجيب الملف الأصلي من Media (filePath بتاع
// الامتحان/النموذج = /api/files/<id> والـ Base64 كله متخزن) → نقص منه
// سيرفري → نكتب الأسئلة المصلحة في الداتابيز.
// الوضعان:
//   POST { adminId }             → فحص وإصلاح كل السجلات (دفعة حتى 40)
//   POST { adminId, kind, id }   → إصلاح سجل واحد (exam | homework)
// الرد: { scanned, withMissing, fixed, cropped, failed, remaining, details[] }
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { cropFiguresServerSide } from '@/lib/server-figures'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const maxDuration = 300

const BATCH_LIMIT = 40

function countMissing(qs: any[]): number {
  var n = 0
  if (!Array.isArray(qs)) return 0
  for (var i = 0; i < qs.length; i++) {
    var q = qs[i]
    if (!q) continue
    if (q.figure && q.figure.bbox && !q.figure.url) n++
    if (Array.isArray(q.optionFigures)) {
      for (var j = 0; j < q.optionFigures.length; j++) {
        var ofg = q.optionFigures[j]
        if (ofg && ofg.bbox && !ofg.url) n++
      }
    }
  }
  return n
}

function hasAnyFigure(qs: any[]): boolean {
  if (!Array.isArray(qs)) return false
  for (var i = 0; i < qs.length; i++) {
    var q = qs[i]
    if (!q) continue
    if (q.figure || (Array.isArray(q.optionFigures) && q.optionFigures.length > 0)) return true
  }
  return false
}

/* تحميل ملف المصدر من المسار: /api/files/<id> من Media أو لينك خارجي */
async function loadSource(path: string): Promise<{ buffer: Buffer; mime: string; name: string } | null> {
  var p = String(path || '').trim()
  if (!p) return null
  try {
    var m = p.match(/\/api\/files\/([\w-]+)/)
    if (m) {
      var media = await db.media.findUnique({ where: { id: m[1] } })
      if (!media || !media.data) return null
      var buf = Buffer.from(media.data, 'base64')
      if (!buf || buf.length === 0) return null
      var mime = String(media.fileType || '')
      var fname = String(media.filename || 'source')
      if (!mime) {
        if (/\.pdf$/i.test(fname)) mime = 'application/pdf'
        else if (/\.png$/i.test(fname)) mime = 'image/png'
        else if (/\.webp$/i.test(fname)) mime = 'image/webp'
        else mime = 'image/jpeg'
      }
      return { buffer: buf, mime: mime, name: fname }
    }
    if (/^https?:\/\//i.test(p)) {
      var res = await fetch(p)
      if (!res.ok) return null
      var ab = await res.arrayBuffer()
      var ct = res.headers.get('content-type') || ''
      var buf2 = Buffer.from(new Uint8Array(ab))
      return { buffer: buf2, mime: ct || (/\.pdf$/i.test(p) ? 'application/pdf' : 'image/jpeg'), name: p.split('?')[0].split('/').pop() || 'source' }
    }
  } catch (e) {
    return null
  }
  return null
}

/* إصلاح قائمة أسئلة واحدة من مصدر — بيرجع عدد اللي اتقص */
async function fixQuestionSet(questions: any[], sourcePath: string): Promise<{ cropped: number; failed: number; total: number; srcOk: boolean }> {
  var missing = countMissing(questions)
  if (missing === 0) return { cropped: 0, failed: 0, total: 0, srcOk: true }
  var src = await loadSource(sourcePath)
  if (!src) return { cropped: 0, failed: missing, total: missing, srcOk: false }
  var res = await cropFiguresServerSide({ buffer: src.buffer, mime: src.mime, name: src.name }, questions)
  return { cropped: res.cropped, failed: res.failed, total: res.total, srcOk: true }
}

export async function POST(request: NextRequest) {
  try {
    var body: any = {}
    try { body = await request.json() } catch (e) {}
    var adminId = String(body.adminId || '')
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'مفيش جلسة أدمن — سجل دخول تاني' }, { status: 403 })
    }

    var singleKind = String(body.kind || '')
    var singleId = String(body.id || '')

    var details: any[] = []
    var scanned = 0
    var withMissing = 0
    var fixed = 0
    var croppedTotal = 0
    var failedTotal = 0

    /* ===== وضع السجل الواحد ===== */
    if (singleKind === 'exam' || singleKind === 'homework') {
      if (singleKind === 'exam') {
        var ex = await db.exam.findUnique({ where: { id: singleId } })
        if (!ex) return NextResponse.json({ error: 'الامتحان مش موجود' }, { status: 404 })
        scanned = 1
        var qs1: any[] = []
        try { qs1 = JSON.parse(ex.questions || '[]') } catch (e) { qs1 = [] }
        if (Array.isArray(qs1) && countMissing(qs1) > 0) {
          withMissing++
          var r1 = await fixQuestionSet(qs1, ex.filePath)
          croppedTotal += r1.cropped; failedTotal += r1.failed
          if (r1.cropped > 0) {
            var qs1Ref = qs1
            await safeWrite(function () { return db.exam.update({ where: { id: ex.id }, data: { questions: JSON.stringify(qs1Ref) } }) })
            fixed++
          }
          details.push({ kind: 'exam', id: ex.id, title: ex.title, cropped: r1.cropped, failed: r1.failed, srcOk: r1.srcOk })
        }
      } else {
        var hw = await db.homework.findUnique({ where: { id: singleId } })
        if (!hw) return NextResponse.json({ error: 'الواجب مش موجود' }, { status: 404 })
        scanned = 1
        var qs2: any[] = []
        try { qs2 = JSON.parse(hw.questions || '[]') } catch (e) { qs2 = [] }
        if (Array.isArray(qs2) && countMissing(qs2) > 0) {
          withMissing++
          var r2 = await fixQuestionSet(qs2, hw.filePath)
          croppedTotal += r2.cropped; failedTotal += r2.failed
          if (r2.cropped > 0) {
            var qs2Ref = qs2
            await safeWrite(function () { return db.homework.update({ where: { id: hw.id }, data: { questions: JSON.stringify(qs2Ref) } }) })
            fixed++
          }
          details.push({ kind: 'homework', id: hw.id, title: hw.title, cropped: r2.cropped, failed: r2.failed, srcOk: r2.srcOk })
        }
      }
      return NextResponse.json({ scanned: scanned, withMissing: withMissing, fixed: fixed, cropped: croppedTotal, failed: failedTotal, remaining: Math.max(0, failedTotal), details: details })
    }

    /* ===== الفحص/الإصلاح الشامل — الواجبات الأول (أخف) ===== */
    var homeworks = await db.homework.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
    for (var i = 0; i < homeworks.length && scanned < BATCH_LIMIT; i++) {
      var h = homeworks[i]
      var hqs: any[] = []
      try { hqs = JSON.parse(h.questions || '[]') } catch (e) { hqs = [] }
      if (!Array.isArray(hqs) || !hasAnyFigure(hqs)) continue
      scanned++
      var hMissing = countMissing(hqs)
      if (hMissing === 0) continue
      withMissing++
      var rh = await fixQuestionSet(hqs, h.filePath)
      croppedTotal += rh.cropped; failedTotal += rh.failed
      if (rh.cropped > 0) {
        var hqsRef = hqs; var hRef = h
        await safeWrite(function () { return db.homework.update({ where: { id: hRef.id }, data: { questions: JSON.stringify(hqsRef) } }) })
        fixed++
      }
      details.push({ kind: 'homework', id: h.id, title: h.title, cropped: rh.cropped, failed: rh.failed, srcOk: rh.srcOk })
    }

    /* ===== الامتحانات — السؤال الرئيسي + كل نموذج ===== */
    if (scanned < BATCH_LIMIT) {
      var exams = await db.exam.findMany({ orderBy: { createdAt: 'desc' }, take: 200 })
      for (var ei = 0; ei < exams.length && scanned < BATCH_LIMIT; ei++) {
        var e = exams[ei]
        var touched = false
        var eCropped = 0, eFailed = 0
        var mainQs: any[] = []
        var mainMissing = 0
        try { mainQs = JSON.parse(e.questions || '[]') } catch (er) { mainQs = [] }
        if (Array.isArray(mainQs) && hasAnyFigure(mainQs)) {
          scanned++
          mainMissing = countMissing(mainQs)
          if (mainMissing > 0) {
            var rm = await fixQuestionSet(mainQs, e.filePath)
            eCropped += rm.cropped; eFailed += rm.failed
            if (rm.cropped > 0) touched = true
          }
        }
        /* النماذج — كل نموذج بيتقص من ملفه هو */
        var models: any[] = []
        var modelsChanged = false
        try { models = JSON.parse(e.models || '[]') } catch (em) { models = [] }
        if (Array.isArray(models)) {
          for (var mi = 0; mi < models.length; mi++) {
            var mdl = models[mi]
            if (!mdl || !Array.isArray(mdl.questions) || !hasAnyFigure(mdl.questions)) continue
            if (mainMissing === 0) scanned++
            var mMissing = countMissing(mdl.questions)
            if (mMissing === 0) continue
            var rmm = await fixQuestionSet(mdl.questions, mdl.filePath || e.filePath)
            eCropped += rmm.cropped; eFailed += rmm.failed
            if (rmm.cropped > 0) {
              modelsChanged = true
              touched = true
            }
          }
        }
        if (eCropped > 0 || eFailed > 0) {
          withMissing++
          croppedTotal += eCropped; failedTotal += eFailed
        }
        if (touched) {
          var updateData: any = {}
          var mainQsRef = mainQs; var modelsRef = models; var eRef = e
          if (Array.isArray(mainQsRef) && mainMissing > 0) updateData.questions = JSON.stringify(mainQsRef)
          if (modelsChanged) updateData.models = JSON.stringify(modelsRef)
          if (Object.keys(updateData).length > 0) {
            await safeWrite(function () { return db.exam.update({ where: { id: eRef.id }, data: updateData }) })
            fixed++
          }
        }
        if (eCropped > 0 || eFailed > 0) {
          details.push({ kind: 'exam', id: e.id, title: e.title, cropped: eCropped, failed: eFailed, models: Array.isArray(models) ? models.length : 0 })
        }
      }
    }

    console.log('[Backfill Figures]', JSON.stringify({ scanned: scanned, withMissing: withMissing, fixed: fixed, cropped: croppedTotal, failed: failedTotal }))
    return NextResponse.json({ scanned: scanned, withMissing: withMissing, fixed: fixed, cropped: croppedTotal, failed: failedTotal, remaining: Math.max(0, failedTotal), details: details })
  } catch (error: any) {
    console.error('Backfill figures error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
