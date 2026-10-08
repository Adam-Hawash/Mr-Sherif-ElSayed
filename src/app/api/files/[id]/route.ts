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
// (تسريع رفع الفيديوهات) دعم الملفات المجزأة — الملف الكبير بيتبع
// أجزاء 3MB بتتخزن كل واحدة في صف تحت __chunks/<uploadId>/<i>، والملف
// المنطقي صف «مانيفست» خفيف (data فاضي + fileSize الكلي + filePath =
// '__file/<uploadId>').
//   - ليه؟ لأن النظام القديم كان بيجمع الأجزاء ويعيد كتابة الملف كله
//     في صف واحد ضخم عند نهاية الرفع — كتابة 133MB في ضربة = بطء
//     + timeout + فشل صامت. دلوقتي الرفع بينتهي بـ INSERT خفيف.
//   - القراءة: نفس سلوك المتصفح بالظبط — Range بيقرا الأجزاء اللي
//     تغطي الحتة المطلوبة بس (substr جوه SQL) والـ seek فوري.
//   - الملفات القديمة (صف واحد base64) بتخدم زي ما هي — سلوك قديم
//     محفوظ 100%.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin, verifyVideoToken } from '@/lib/video-guard'

var FILE_PREFIX = '__file/'
var CHUNK_PREFIX = '__chunks/'

/* (ص119) حذف ملف من جدول Media — محمي بمعرّف الأدمن (نفس بوابة isAdmin
   بتاعة تشغيل الفيديو). بيستخدمه كارت الفيديوهات التعريفية في لوحة الأدمن
   لمسح ملف الـ Media اليتيم لما لينك/ملف جديد يستبدل القديم أو عند الحذف
   عشان مايفضلش ياكل مساحة من قاعدة البيانات (نفس Zicola-Math) */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params
    const { searchParams } = new URL(request.url)
    const adminOk = await isAdmin(searchParams.get('adminId'))
    if (!adminOk) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
    }
    // المانيفست (ملف مجزأ) → امسح أجزاءه كمان عشان مافضلش حتام في القاعدة
    var rows: any[] = await db.$queryRawUnsafe(
      'SELECT filePath, length(data) AS L FROM Media WHERE id = ? LIMIT 1',
      id
    ) as any[]
    var row = rows && rows[0]
    if (row && String(row.filePath || '').indexOf(FILE_PREFIX) === 0 && Number(row.L) === 0) {
      var uid = String(row.filePath).substring(FILE_PREFIX.length)
      if (uid) {
        await db.media
          .deleteMany({ where: { filePath: { startsWith: CHUNK_PREFIX + uid + '/' } } })
          .catch(function () {})
      }
    }
    var removed = await db.media.delete({ where: { id } }).catch(function (e) {
      return null
    })
    if (!removed) {
      return NextResponse.json({ error: 'الملف مش موجود' }, { status: 404 })
    }
    return NextResponse.json({ ok: true, deleted: id })
  } catch (error: any) {
    console.error('File delete error:', error)
    return NextResponse.json({ error: 'حذف الملف فشل' }, { status: 500 })
  }
}

/* أجزاء ملف مجزأ مرتبة: [{ filePath, offset, size }] — offset = بداية الجزء بالبايت */
type ChunkedParts = { parts: { filePath: string; offset: number; size: number }[]; totalBytes: number }

async function loadChunkedParts(uploadId: string): Promise<ChunkedParts | null> {
  try {
    var rows: any[] = await db.media.findMany({
      where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
      select: { filePath: true, fileSize: true },
    })
    if (!rows || rows.length === 0) return null
    var list = rows.map(function (r: any) {
      var fp = String(r.filePath || '')
      var tail = fp.substring(fp.lastIndexOf('/') + 1)
      var idx = parseInt(tail, 10)
      return { idx: isNaN(idx) ? -1 : idx, filePath: fp, size: Number(r.fileSize || 0) }
    })
    list.sort(function (a, b) { return a.idx - b.idx })
    var parts: { filePath: string; offset: number; size: number }[] = []
    var off = 0
    for (var i = 0; i < list.length; i++) {
      if (list[i].size <= 0) continue
      parts.push({ filePath: list[i].filePath, offset: off, size: list[i].size })
      off += list[i].size
    }
    return { parts: parts, totalBytes: off }
  } catch (e) {
    return null
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params
    const { searchParams } = new URL(request.url)

    /* ===== (ص119) ميتاداتا الملف للوحة الأدمن — اسم/نوع/حجم/تاريخ بدون البلوب.
       كارتا الفيديوهات التعريفية بيعرضوا «الحالة الحالية» (اسم الملف وتاريخه) منها.
       محمي بـ adminId زي الحذف بالظبط (نفس Zicola-Math). ===== */
    if (searchParams.get('meta') === '1') {
      const adminOkMeta = await isAdmin(searchParams.get('adminId'))
      if (!adminOkMeta) {
        return NextResponse.json({ error: 'غير مصرح' }, { status: 403 })
      }
      var metaRowsOnly: any[] = await db.$queryRawUnsafe(
        'SELECT id, filename, fileType, fileSize, category, createdAt FROM Media WHERE id = ? LIMIT 1',
        id
      ) as any[]
      var metaOnly = metaRowsOnly && metaRowsOnly[0]
      if (!metaOnly) {
        return NextResponse.json({ error: 'الملف مش موجود' }, { status: 404 })
      }
      return NextResponse.json({
        id: metaOnly.id,
        filename: metaOnly.filename || '',
        fileType: metaOnly.fileType || '',
        fileSize: Number(metaOnly.fileSize || 0),
        category: metaOnly.category || '',
        createdAt: metaOnly.createdAt || null,
      })
    }

    /* الميتاداتا: L = طول base64 المخزن. L=0 + fileSize>0 = مانيفست ملف مجزأ */
    var metaRows: any[] = await db.$queryRawUnsafe(
      'SELECT length(data) AS L, substr(data, length(data) - 3, 4) AS tail, fileType, filename, category, filePath, fileSize FROM Media WHERE id = ? LIMIT 1',
      id
    ) as any[]
    var meta = metaRows && metaRows[0]
    if (!meta || (Number(meta.L) === 0 && !(String(meta.filePath || '').indexOf(FILE_PREFIX) === 0 && Number(meta.fileSize) > 0))) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    var isChunked = Number(meta.L) === 0
    var chunked: ChunkedParts | null = null
    if (isChunked) {
      var uid = String(meta.filePath).substring(FILE_PREFIX.length)
      chunked = await loadChunkedParts(uid)
      if (!chunked || chunked.parts.length === 0) {
        return NextResponse.json({ error: 'File not found' }, { status: 404 })
      }
    }

    var dataLen = Number(meta.L)
    var tail64 = String(meta.tail || '')
    var padCount = 0
    for (var pi = tail64.length - 1; pi >= 0 && tail64[pi] === '='; pi--) padCount++
    /* الملف القديم: الحجم الكلي محسوب من طول base64. المجزأ: من fileSize بتاع المانيفست */
    var totalBytes = isChunked
      ? Number(meta.fileSize || 0)
      : Math.max(0, Math.floor(dataLen / 4) * 3 - padCount)

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
       (2026-و84 + ص119) الفيديوهات التعريفية العامة — بيبصوا على القيمة الحالية كل طلب:
       أي مفتاح من (intro_video_url / teacher_video_url) قيمته الحالية فيها id الملف → عام */
    if (String(contentType).startsWith('video/') && meta.category !== 'gallery') {
      const token = searchParams.get('token')
      const reqId = searchParams.get('req') || ''
      const adminId = searchParams.get('adminId') || ''
      const tokenOk = token ? verifyVideoToken(token, id, reqId) : false
      const adminOk = adminId ? await isAdmin(adminId) : false
      var isPublicConfigVideo = false
      try {
        var pubRows: any[] = await db.$queryRawUnsafe(
          "SELECT value FROM SiteConfig WHERE key IN ('intro_video_url', 'teacher_video_url')"
        ) as any[]
        for (var ri = 0; ri < pubRows.length; ri++) {
          var pubVal = String(pubRows[ri].value || '')
          if (pubVal && pubVal.indexOf(id) !== -1) { isPublicConfigVideo = true; break }
        }
      } catch (e) { /* جدول ناقص — نكمل بالحماية العادية */ }
      if (!tokenOk && !adminOk && !isPublicConfigVideo) {
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

        var bytes: Uint8Array
        if (isChunked && chunked) {
          /* ===== ملف مجزأ: نجيب الأجزاء اللي تغطي المجال بس ===== */
          var chunksBytes: Uint8Array[] = []
          var produced = 0
          for (var p = 0; p < chunked.parts.length; p++) {
            var pt = chunked.parts[p]
            var pStart = pt.offset
            var pEnd = pt.offset + pt.size - 1
            if (pEnd < rStart || pStart > rEnd) continue
            var takeStart = Math.max(rStart, pStart)
            var takeEnd = Math.min(rEnd, pEnd)
            /* محاذاة الـ base64 جوه الجزء: كل 4 حروف = 3 بايت */
            var pb64Start = Math.floor((takeStart - pStart) / 3) * 4
            var pb64End = Math.ceil((takeEnd - pStart + 1) / 3) * 4
            var partRows: any[] = await db.$queryRawUnsafe(
              'SELECT substr(data, ?, ?) AS part FROM Media WHERE filePath = ? LIMIT 1',
              pb64Start + 1, pb64End - pb64Start, pt.filePath
            ) as any[]
            var part64 = partRows && partRows[0] ? String(partRows[0].part || '') : ''
            var decoded = atob(part64)
            var innerOffset = (takeStart - pStart) % 3
            var takeLen = takeEnd - takeStart + 1
            var seg = new Uint8Array(takeLen)
            for (var b = 0; b < takeLen; b++) seg[b] = decoded.charCodeAt(innerOffset + b)
            chunksBytes.push(seg)
            produced += takeLen
            if (produced >= rEnd - rStart + 1) break
          }
          var all = new Uint8Array(produced)
          var fill = 0
          for (var c = 0; c < chunksBytes.length; c++) {
            all.set(chunksBytes[c], fill)
            fill += chunksBytes[c].length
          }
          bytes = all
          var lenC = produced
          return new NextResponse(bytes as any, {
            status: 206,
            headers: {
              'Content-Type': contentType,
              'Content-Disposition': disposition,
              'Content-Range': 'bytes ' + rStart + '-' + (rStart + lenC - 1) + '/' + totalBytes,
              'Accept-Ranges': 'bytes',
              'Content-Length': String(lenC),
              'Cache-Control': String(contentType).startsWith('video/')
                ? 'private, no-store'
                : 'public, max-age=31536000, immutable',
            },
          })
        }

        /* ===== ملف قديم (صف واحد): نفس المنطق القديم بالظبط ===== */
        var b64Start = Math.floor(rStart / 3) * 4
        var b64End = Math.min(dataLen, Math.ceil((rEnd + 1) / 3) * 4)
        var partRows2: any[] = await db.$queryRawUnsafe(
          'SELECT substr(data, ?, ?) AS part FROM Media WHERE id = ? LIMIT 1',
          b64Start + 1, b64End - b64Start, id
        ) as any[]
        var part642 = partRows2 && partRows2[0] ? String(partRows2[0].part || '') : ''
        var decoded2 = atob(part642)
        var innerOffset2 = rStart % 3
        var len = rEnd - rStart + 1
        var bytes2 = new Uint8Array(len)
        for (var bi = 0; bi < len; bi++) bytes2[bi] = decoded2.charCodeAt(innerOffset2 + bi)
        return new NextResponse(bytes2, {
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
    if (isChunked && chunked) {
      /* ملف مجزأ: تجميع من الأجزاء بالترتيب (كتب/ملازم أكبر من 3MB بتتحمل كاملة) */
      var bufs: Uint8Array[] = []
      var totalLen = 0
      for (var fp = 0; fp < chunked.parts.length; fp++) {
        var fullPartRows: any[] = await db.$queryRawUnsafe(
          'SELECT data FROM Media WHERE filePath = ? LIMIT 1',
          chunked.parts[fp].filePath
        ) as any[]
        var p64 = fullPartRows && fullPartRows[0] ? String(fullPartRows[0].data || '') : ''
        if (!p64) continue
        var pBytes = atob(p64)
        var u8 = new Uint8Array(pBytes.length)
        for (var ub = 0; ub < pBytes.length; ub++) u8[ub] = pBytes.charCodeAt(ub)
        bufs.push(u8)
        totalLen += u8.length
      }
      var full = new Uint8Array(totalLen)
      var off2 = 0
      for (var fb = 0; fb < bufs.length; fb++) {
        full.set(bufs[fb], off2)
        off2 += bufs[fb].length
      }
      return new NextResponse(full as any, {
        status: 200,
        headers: {
          'Content-Type': contentType,
          'Content-Disposition': disposition,
          'Content-Length': String(totalLen),
          'Accept-Ranges': 'bytes',
          'Cache-Control': String(contentType).startsWith('video/')
            ? 'private, no-store'
            : 'public, max-age=31536000, immutable',
        },
      })
    }

    /* ملف قديم (صف واحد) — الملف كامل زي ما هو */
    var fullRows: any[] = await db.$queryRawUnsafe(
      'SELECT data FROM Media WHERE id = ? LIMIT 1', id
    ) as any[]
    var full64 = fullRows && fullRows[0] ? String(fullRows[0].data || '') : ''
    if (!full64) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }
    var binaryStr = atob(full64)
    var bytes3 = new Uint8Array(binaryStr.length)
    for (var i = 0; i < binaryStr.length; i++) {
      bytes3[i] = binaryStr.charCodeAt(i)
    }

    return new NextResponse(bytes3, {
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
