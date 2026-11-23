// ============================================================
// (Z-40e → وN16) /api/page-image — رندر صفحة من الملف الأصلي المخزن على السيرفر
// ============================================================
// الهدف: زرار «✂️ عدّل القص» يبقى مستحيل يفشل. لو المتصفح عجز (المستند
// اتقفل من الذاكرة أو pdf.js وقع) — السيرفر نفسه بيرندر صفحة الأصل من
// الملف المتخزن في Media ويرجّعها JPEG بجودة عالية — من غير أي pdf.js
// على جهاز المستر.
// (وN16) الرندر بقى عبر mupdf WASM مسبق الترجمة (src/lib/image-engine.ts)
// — بيشتغل على Cloudflare Workers وNode بنفس الكود، بدون napi canvas ولا
// pdf.js سيرفري ولا أي مكتبة native.
// مصدر الملف: Media.data (base64) — نفس مصدر /api/crop-figures.
// الحماية: isAdmin زي باقي راوتات الأدمن.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import { renderPdfPageToJpeg } from '@/lib/image-engine'

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

    /* PDF → رندر mupdf WASM سيرفري (وN16) */
    var outJpeg = await renderPdfPageToJpeg(buf, pageNo, 2000, 0.9)
    if (!outJpeg) {
      return NextResponse.json({ error: 'مقدرتش أفتح ملف الـ PDF على السيرفر' }, { status: 422 })
    }
    return new NextResponse(new Uint8Array(outJpeg), {
      status: 200,
      headers: { 'Content-Type': 'image/jpeg', 'Cache-Control': 'no-store' },
    })
  } catch (e: any) {
    console.error('[page-image] error:', e)
    return NextResponse.json({ error: 'فشل رندر الصفحة على السيرفر: ' + String((e && e.message) || e) }, { status: 500 })
  }
}
