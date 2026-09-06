// ============================================================
// /api/files/[id] — خدمة الملفات المخزنة base64 في جدول Media
// ============================================================
// حماية الفيديوهات المرفوعة من الجهاز:
//  - صور/مستندات → عامة زي ما هي (ثمبنيلز وواجبات)
//  - ملفات فيديو → ممنوعة تماماً بدون توكن موقّع صالح من /api/video-play
//    (التوكن مرتبط بالملف + بالطالب + بصلاحية ساعتين)
//  - الأدمن يدخل بـ adminId
// + دعم Range عشان الـ seek في الفيديو يشتغل صح
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin, verifyVideoToken } from '@/lib/video-guard'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params
    const { searchParams } = new URL(request.url)

    var media = await db.media.findUnique({ where: { id } })
    if (!media || !media.data) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    const contentType = media.fileType || 'application/octet-stream'
    const fileName = media.filename || 'download'

    // ===== بوابة الفيديو: ملفات الفيديو محمية دايماً =====
    if (contentType.startsWith('video/')) {
      const token = searchParams.get('token')
      const reqId = searchParams.get('req') || ''
      const adminId = searchParams.get('adminId') || ''
      const tokenOk = token ? verifyVideoToken(token, id, reqId) : false
      const adminOk = adminId ? await isAdmin(adminId) : false
      if (!tokenOk && !adminOk) {
        return NextResponse.json(
          { error: 'غير مسموح — الفيديو بيتشغل من داخل المنصة بس' },
          { status: 403 }
        )
      }
    }

    // Decode base64 to buffer
    var binaryStr = atob(media.data)
    var bytes = new Uint8Array(binaryStr.length)
    for (var i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    // ===== دعم Range (seek في الفيديو) =====
    const rangeHeader = request.headers.get('range')
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (m) {
        const total = bytes.length
        var start = m[1] ? parseInt(m[1], 10) : 0
        var end = m[2] ? parseInt(m[2], 10) : total - 1
        if (isNaN(start) || start < 0) start = 0
        if (isNaN(end) || end >= total) end = total - 1
        if (start > end || start >= total) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': 'bytes */' + total },
          })
        }
        const slice = bytes.slice(start, end + 1)
        return new NextResponse(slice, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': 'inline; filename="' + fileName + '"',
            'Content-Range': 'bytes ' + start + '-' + end + '/' + total,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(slice.length),
            'Cache-Control': 'private, no-store',
          },
        })
      }
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="' + fileName + '"',
        // الفيديو محمي فمفيش كاش عام عليه — الصور تنكاش عادي
        'Cache-Control': contentType.startsWith('video/')
          ? 'private, no-store'
          : 'public, max-age=31536000, immutable',
        'Accept-Ranges': 'bytes',
      },
    })
  } catch (error: any) {
    console.error('File serve error:', error)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
