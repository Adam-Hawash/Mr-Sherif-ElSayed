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

    /* ===== (تسريع الفيديو) القراءة بالبايت من غير تحميل الملف كله =====
       القديم: كل طلب — أول كل seek — بيجيب الـ base64 كامل من القاعدة ويفك
       تشفيره كله، فالفيديو الكبير بيقف ومبيجرش.
       الجديد: length() + substr() في SQL — كل طلب بيجيب الحتة المطلوبة بس
       (أقصى 4MB) — الـ seek فوري مهما كان حجم الفيديو. */
    var metaRows: any[] = await db.$queryRawUnsafe(
      'SELECT length(data) AS L, substr(data, length(data) - 3, 4) AS tail, fileType, filename, category FROM Media WHERE id = ? LIMIT 1',
      id
    ) as any[]
    var meta = metaRows && metaRows[0]
    if (!meta || !Number(meta.L)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    var dataLen = Number(meta.L)
    var tail64 = String(meta.tail || '')
    var padCount = 0
    for (var pi = tail64.length - 1; pi >= 0 && tail64[pi] === '='; pi--) padCount++
    var totalBytes = Math.max(0, Math.floor(dataLen / 4) * 3 - padCount)

    var contentType = meta.fileType || 'application/octet-stream'
    var fileName = meta.filename || 'download'

    /* (2026-و40) تحميل بدل عرض داخلي: ?dl=1 → Content-Disposition: attachment
       — بتاع «الكتب والملازم» زرار تحميل. اسم الملف من Media.filename */
    const wantDownload = searchParams.get('dl') === '1'
    const safeFileName = (fileName || 'download').replace(/[\r\n"\\]/g, '_')
    const asciiFallback = safeFileName.replace(/[^\x20-\x7E]/g, '_') || 'download'
    var disposition = (wantDownload ? 'attachment' : 'inline') + '; filename="' + asciiFallback + '"'
    if (safeFileName !== asciiFallback) {
      try { disposition += "; filename*=UTF-8''" + encodeURIComponent(safeFileName) } catch (e) {}
    }

    // ===== بوابة الفيديو: ملفات الفيديو محمية دايماً =====
    /* (و93) استثناء فيديوهات المعرض: category='gallery' عامة زي يوتيوب.
       (2026-و84) الفيديو التعريفي العام — بيبص على القيمة الحالية كل طلب. */
    if (String(contentType).startsWith('video/') && meta.category !== 'gallery') {
      const token = searchParams.get('token')
      const reqId = searchParams.get('req') || ''
      const adminId = searchParams.get('adminId') || ''
      const tokenOk = token ? verifyVideoToken(token, id, reqId) : false
      const adminOk = adminId ? await isAdmin(adminId) : false
      var isIntroPublic = false
      try {
        var introRows: any[] = await db.$queryRawUnsafe(
          "SELECT value FROM SiteConfig WHERE key = 'intro_video_url' LIMIT 1"
        ) as any[]
        var introVal = introRows && introRows[0] ? String(introRows[0].value || '') : ''
        isIntroPublic = !!introVal && introVal.indexOf(id) !== -1
      } catch (e) { /* جدول ناقص — نكمل بالحماية العادية */ }
      if (!tokenOk && !adminOk && !isIntroPublic) {
        return NextResponse.json(
          { error: 'غير مسموح — الفيديو بيتشغل من داخل المنصة بس' },
          { status: 403 }
        )
      }
    }

    // ===== دعم Range (seek في الفيديو) — فك تشفير الحتة المطلوبة بس =====
    const rangeHeader = request.headers.get('range')
    if (rangeHeader) {
      const m = rangeHeader.match(/bytes=(\d*)-(\d*)/)
      if (m) {
        var rStart = m[1] ? parseInt(m[1], 10) : 0
        var rEndReq = m[2] ? parseInt(m[2], 10) : totalBytes - 1
        if (isNaN(rStart) || rStart < 0) rStart = 0
        if (isNaN(rEndReq) || rEndReq >= totalBytes) rEndReq = totalBytes - 1
        if (rStart >= totalBytes || rStart > rEndReq) {
          return new NextResponse(null, {
            status: 416,
            headers: { 'Content-Range': 'bytes */' + totalBytes },
          })
        }
        /* أقصى 4MB في الرد الواحد — المتصفح بيطلب الباقي لوحده (زي البث) */
        var rEnd = Math.min(rEndReq, rStart + 4 * 1024 * 1024 - 1)
        /* محاذاة الـ base64: كل 4 حروف = 3 بايت */
        var b64Start = Math.floor(rStart / 3) * 4
        var b64End = Math.min(dataLen, Math.ceil((rEnd + 1) / 3) * 4)
        var partRows: any[] = await db.$queryRawUnsafe(
          'SELECT substr(data, ?, ?) AS part FROM Media WHERE id = ? LIMIT 1',
          b64Start + 1, b64End - b64Start, id
        ) as any[]
        var part64 = partRows && partRows[0] ? String(partRows[0].part || '') : ''
        var decoded = atob(part64)
        var innerOffset = rStart % 3
        var len = rEnd - rStart + 1
        var bytes = new Uint8Array(len)
        for (var bi = 0; bi < len; bi++) bytes[bi] = decoded.charCodeAt(innerOffset + bi)
        return new NextResponse(bytes, {
          status: 206,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': disposition,
            'Content-Range': 'bytes ' + rStart + '-' + rEnd + '/' + totalBytes,
            'Accept-Ranges': 'bytes',
            'Content-Length': String(len),
            'Cache-Control': 'private, no-store',
          },
        })
      }
    }

    /* من غير Range (صور/مستندات/طلبات كاملة) — الملف كامل زي ما هو */
    var fullRows: any[] = await db.$queryRawUnsafe(
      'SELECT data FROM Media WHERE id = ? LIMIT 1', id
    ) as any[]
    var full64 = fullRows && fullRows[0] ? String(fullRows[0].data || '') : ''
    if (!full64) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    var binaryStr = atob(full64)
    var bytes = new Uint8Array(binaryStr.length)
    for (var i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': disposition,
        // الفيديو محمي فمفيش كاش عام عليه — الصور تنكاش عادي
        'Cache-Control': String(contentType).startsWith('video/')
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
