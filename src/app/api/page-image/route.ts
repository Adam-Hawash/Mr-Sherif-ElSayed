// @ts-nocheck
// ============================================================
// (Z-40e) /api/page-image — رندر صفحة من الملف الأصلي المخزن على السيرفر
// ============================================================
// الهدف: زرار «✂️ عدّل القص» يبقى مستحيل يفشل. لو المتصفح عجز (المستند
// اتقفل من الذاكرة أو pdf.js وقع) — السيرفر نفسه بيرندر صفحة الأصل من
// الملف المتخزن في Media ويرجّعها JPEG بجودة عالية — من غير أي pdf.js
// على جهاز المستر.
// مصدر الملف: Media.data (base64) — نفس مصدر /api/crop-figures.
// الحماية: isAdmin زي باقي راوتات الأدمن.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var adminId = sp.get('adminId') || ''
    var mediaId = sp.get('mediaId') || ''
    var pageNo = parseInt(String(sp.get('page') || '1'), 10)
    if (isNaN(pageNo) || pageNo < 1) pageNo = 1

    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    if (!mediaId) {
      return NextResponse.json({ error: 'mediaId مطلوب' }, { status: 400 })
    }

    var media = await db.media.findUnique({ where: { id: mediaId } })
    if (!media || !media.data) {
      return NextResponse.json({ error: 'الملف الأصلي مش متخزن' }, { status: 404 })
    }

    var buf = Buffer.from(String(media.data), 'base64')
    if (!buf || buf.length < 32) {
      return NextResponse.json({ error: 'الملف الأصلي فاضي أو تالف' }, { status: 404 })
    }

    var isPdf = String(media.fileType || '').indexOf('pdf') !== -1
      || /\.pdf$/i.test(String(media.filename || ''))
      || (buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46)

    /* صورة مفردة → نرجّعها زي ما هي */
    if (!isPdf) {
      return new NextResponse(new Uint8Array(buf), {
        status: 200,
        headers: { 'Content-Type': media.fileType || 'image/jpeg', 'Cache-Control': 'no-store' },
      })
    }

    /* PDF → رندر سيرفري بنفس طبقة /api/crop-figures (napi canvas قبل استيراد pdf.js) */
    var { createCanvas, DOMMatrix, Path2D, ImageData } = await import('@napi-rs/canvas')
    if (!(globalThis as any).DOMMatrix) (globalThis as any).DOMMatrix = DOMMatrix
    if (!(globalThis as any).Path2D) (globalThis as any).Path2D = Path2D
    if (!(globalThis as any).ImageData) (globalThis as any).ImageData = ImageData
    /* (Z-40e) تسجيل worker الـ pdf.js صراحة — على فيرسل الـ import الداخلي
       بتاع pdf.worker.mjs مش بيتتبع فالملف بيتبعد عن النشر ويقع «fake worker».
       الاستيراد الصريح بيخلي الباندلر يشمله + بنسجله في globalThis زي ما
       pdf.js بيفحصه الأول في setupFakeWorkerGlobal */
    try {
      var wmod: any = await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      if (wmod && !(globalThis as any).pdfjsWorker) (globalThis as any).pdfjsWorker = wmod
    } catch (eW) {}
    var pdfjs: any = await import('pdfjs-dist/legacy/build/pdf.mjs')

    var pathMod = await import('path')
    var fsMod = await import('fs')
    var standardFonts = ''
    try {
      var pkgJson = 'node_modules/pdfjs-dist/standard_fonts/'
      if (fsMod.existsSync(pkgJson)) standardFonts = pathMod.resolve(pkgJson)
    } catch (eF) { standardFonts = '' }

    var doc: any = null
    try {
      doc = await pdfjs.getDocument({
        data: new Uint8Array(buf),
        isEvalSupported: false,
        useSystemFonts: true,
        standardFontDataUrl: standardFonts || undefined,
      }).promise
    } catch (eOpen: any) {
      return NextResponse.json({ error: 'مقدرتش أفتح ملف الـ PDF على السيرفر: ' + String((eOpen && eOpen.message) || eOpen) }, { status: 422 })
    }

    try {
      var numPages = Number(doc.numPages) || 1
      var n = Math.min(Math.max(1, pageNo), numPages)
      var page = await doc.getPage(n)
      var base = page.getViewport({ scale: 1 })
      var longest = Math.max(base.width, base.height) || 1600
      var scale = Math.min(4, 2000 / longest)
      var vp = page.getViewport({ scale: scale })
      var canvas = createCanvas(Math.max(1, Math.ceil(vp.width)), Math.max(1, Math.ceil(vp.height)))
      var ctx = canvas.getContext('2d')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, canvas.width, canvas.height)
      await page.render({ canvasContext: ctx, viewport: vp }).promise
      page.cleanup()
      var outJpeg = await canvas.encode('jpeg', 90)
      return new NextResponse(new Uint8Array(outJpeg), {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
      })
    } finally {
      try { doc.destroy() } catch (eD) {}
    }
  } catch (e: any) {
    console.error('[page-image] error:', e)
    return NextResponse.json({ error: 'فشل رندر الصفحة على السيرفر: ' + String((e && e.message) || e) }, { status: 500 })
  }
}
