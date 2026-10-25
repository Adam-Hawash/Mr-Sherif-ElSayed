// @ts-nocheck
// ============================================================
// (و50) /api/crop-figures — إنقاذ الرسمات من السيرفر مباشرة
// ============================================================
// الفكرة الجذرية: ملف المصدر بيتخزن على السيرفر لحظة الاستخراج
// (Media — category: extraction-source) — فأي وقت ناقص رسمة:
// الأدمن/الحفظ/المراجعة يبعتوا الأسئلة + sourceMediaId والسيرفر
// يقص من الملف الأصلي ويرجع الأسئلة بالصور معباية.
// — مفيش أي اعتماد على متصفح المستر خالص.
//
// وضعين:
//  1) JSON:  { sourceMediaId, questions }        — المصدر متخزن من الاستخراج
//  2) FormData: file + questions (JSON string)   — الملف الأصلي من المستر
//     (زرار إصلاح الرسمات في محرر الأسئلة للاستخراجات القديمة)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { cropFiguresServerSide } from '@/lib/server-figures'

export const runtime = 'nodejs'
export const maxDuration = 120

function countMissing(qs: any[]): number {
  var n = 0
  if (!Array.isArray(qs)) return 0
  qs.forEach(function (q: any) {
    if (!q) return
    if (q.figure && q.figure.bbox && !q.figure.url) n++
    if (Array.isArray(q.optionFigures)) q.optionFigures.forEach(function (of: any) {
      if (of && of.bbox && !of.url) n++
    })
  })
  return n
}

export async function POST(request: NextRequest) {
  try {
    var contentType = request.headers.get('content-type') || ''
    var questions: any[] = []
    var cropSrc: { base64?: string; buffer?: Buffer; name?: string; mime?: string } | null = null

    if (contentType.indexOf('multipart/form-data') !== -1) {
      /* وضع الملف المرفوع مباشرة (محرر الأسئلة — استخراجات قديمة) */
      var fd = await request.formData()
      var qRaw = fd.get('questions')
      try {
        var parsed = JSON.parse(String(qRaw || '[]'))
        questions = Array.isArray(parsed) ? parsed : []
      } catch (e) { questions = [] }
      var file: any = fd.get('file')
      if (file && file.size > 0) {
        var ab = await file.arrayBuffer()
        var buf = Buffer.from(new Uint8Array(ab))
        var fname = String(file.name || 'source')
        var ftype = String(file.type || '')
        var isPdf = ftype.indexOf('pdf') !== -1 || /\.pdf$/i.test(fname)
        cropSrc = { buffer: buf, name: fname, mime: isPdf ? 'application/pdf' : (ftype || 'image/jpeg') }
      }
    } else {
      /* وضع المصدر المتخزن (الاستخراج الحديث بيرجّع sourceMediaId) */
      var body = await request.json().catch(function () { return null })
      if (!body || !Array.isArray(body.questions)) {
        return NextResponse.json({ error: 'questions مطلوبة' }, { status: 400 })
      }
      questions = body.questions
      var mid = String(body.sourceMediaId || '')
      if (!mid) return NextResponse.json({ error: 'sourceMediaId مطلوب' }, { status: 400 })
      var media = await db.media.findUnique({ where: { id: mid } })
      if (!media || !media.data) {
        return NextResponse.json({ error: 'الملف الأصلي مش متخزن — استخرج تاني أو ارفع الملف' }, { status: 404 })
      }
      var isPdfM = (media.fileType || '').indexOf('pdf') !== -1 || /\.pdf$/i.test(media.filename || '')
      cropSrc = { base64: media.data, name: media.filename || 'source', mime: isPdfM ? 'application/pdf' : (media.fileType || 'image/jpeg') }
    }

    if (questions.length === 0) return NextResponse.json({ error: 'مفيش أسئلة' }, { status: 400 })
    if (!cropSrc) return NextResponse.json({ error: 'مفيش ملف مصدر' }, { status: 400 })

    var before = countMissing(questions)
    if (before === 0) {
      return NextResponse.json({ success: true, questions: questions, figuresCrop: { cropped: 0, failed: 0, total: 0 }, message: 'كل الرسمات ظاهرة بالفعل' })
    }

    var cropRes = await cropFiguresServerSide(cropSrc, questions)
    var after = countMissing(questions)
    console.log('[Crop Figures] before=' + before + ' crop=' + JSON.stringify(cropRes) + ' after=' + after)
    return NextResponse.json({ success: true, questions: questions, figuresCrop: cropRes, stillMissing: after })
  } catch (error: any) {
    console.error('crop-figures error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
