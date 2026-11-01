// @ts-nocheck
// (Z-35) Station — راوتر الرفع المجزأ (/api/upload/chunk)
// كان ناقص خالص من المستودع والمكتبة الكلينت (chunked-upload.ts) بينادي عليه،
// فكل رفع (كتاب/ملف/ورقة حل/فيديو) كان بيرجع 404 → «فشلت العملية».
//
// البروتوكول هنا متوافق مع مكتبة ستيشن بالظبط (رفع متوازي 3MB + فاينلايز صريح):
//  1) ملف صغير (totalChunks=1) → حفظ مباشر و done:true
//  2) جزء من ملف كبير → تخزين مؤقت في Media بعلامة __chunks/<uploadId>/<i>
//     وردّ {done:false, received} — **من غير تجميع على آخر جزء** (الرفع
//     متوازي فالترتيب مش مضمون — التجميع بيحصل في الفاينلايز بس)
//  3) finalize=1 (من غير ملف) → التأكد إن كل الأجزاء وصلت → تجميع بالترتيب
//     في صف Media واحد نهائي → تنظيف الأجزاء → {filePath, size, done:true}
// + كل الكتابات بـ safeWrite ضد SQLITE_BUSY/انقطاع Turso اللحظي
// + تنظيف الأجزاء المهجورة (رفع فاشل من أكتر من يوم)

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export const maxDuration = 300

var CHUNK_PREFIX = '__chunks/'
var CHUNK_TTL_MS = 24 * 60 * 60 * 1000

function chunkSlotPath(uploadId: string, index: number): string {
  return CHUNK_PREFIX + uploadId + '/' + index
}

function parseIndexFromPath(filePath: string): number {
  var tail = filePath.substring(filePath.lastIndexOf('/') + 1)
  var n = parseInt(tail, 10)
  return isNaN(n) ? -1 : n
}

export async function POST(req: NextRequest) {
  try {
    var formData = await req.formData()
    var file = formData.get('file') as File | null
    var uploadId = String(formData.get('uploadId') || '').replace(/[^a-zA-Z0-9\-]/g, '')
    var fileName = String(formData.get('fileName') || 'file')
    var category = String(formData.get('category') || 'general')
    var fileType = String(formData.get('fileType') || (file && file.type) || 'application/octet-stream')
    var chunkIndex = parseInt(String(formData.get('chunkIndex') ?? '0'), 10) || 0
    var totalChunks = parseInt(String(formData.get('totalChunks') ?? '1'), 10) || 1
    if (totalChunks < 1) totalChunks = 1
    if (chunkIndex < 0) chunkIndex = 0
    var isFinalize = String(formData.get('finalize') || '') === '1'

    // ================================================
    // الفاينلايز: مفيش ملف — تجميع الأجزاء كلها
    // ================================================
    if (isFinalize) {
      if (!uploadId) {
        return NextResponse.json({ error: 'uploadId مفقود لإتمام الرفع' }, { status: 400 })
      }
      await cleanupOrphanChunks()

      var parts = await db.media.findMany({
        where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
        orderBy: { createdAt: 'asc' },
      })
      // ترتيب رقمي بالفهرس (مش نصي عشان 10 ما تجيش قبل 2)
      parts.sort(function (a: any, b: any) {
        return parseIndexFromPath(a.filePath) - parseIndexFromPath(b.filePath)
      })

      if (parts.length < totalChunks) {
        return NextResponse.json(
          {
            error: 'اتستلم ' + parts.length + ' جزء من ' + totalChunks + ' — حاول ترفع الملف تاني',
            received: parts.length,
            totalChunks: totalChunks,
          },
          { status: 400 }
        )
      }

      var buffers: Buffer[] = []
      var totalSize = 0
      for (var i = 0; i < totalChunks; i++) {
        var chunkBuf = Buffer.from(String(parts[i].data || ''), 'base64')
        buffers.push(chunkBuf)
        totalSize += chunkBuf.length
      }
      var full = Buffer.concat(buffers)
      var fullBase64 = full.toString('base64')

      var safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
      var finalPath = category + '/' + Date.now() + '_' + safeName

      var finalMedia = await safeWrite(function () {
        return db.media.create({
          data: {
            filename: fileName,
            filePath: finalPath,
            fileType: fileType,
            fileSize: String(totalSize),
            data: fullBase64,
            category: category,
          },
        })
      })
      await safeWrite(function () {
        return db.media.deleteMany({
          where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
        })
      })

      return NextResponse.json({
        filePath: '/api/files/' + finalMedia.id,
        fileType: fileType,
        filename: fileName,
        size: totalSize,
        done: true,
      })
    }

    if (!file) {
      return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 })
    }

    var arrayBuffer = await file.arrayBuffer()
    var buffer = Buffer.from(arrayBuffer)
    var base64 = buffer.toString('base64')

    // ================================================
    // ملف صغير (جزء واحد) — حفظ مباشر
    // ================================================
    if (totalChunks === 1) {
      var safeName1 = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
      var filePath1 = category + '/' + Date.now() + '_' + safeName1
      var media = await safeWrite(function () {
        return db.media.create({
          data: {
            filename: fileName,
            filePath: filePath1,
            fileType: fileType,
            fileSize: String(buffer.length),
            data: base64,
            category: category,
          },
        })
      })
      return NextResponse.json({
        filePath: '/api/files/' + media.id,
        fileType: fileType,
        filename: fileName,
        size: buffer.length,
        done: true,
      })
    }

    // ================================================
    // جزء من ملف كبير — تخزين مؤقت بالفهرس (كتابة فوق آمنة عند retry)
    // من غير أي تجميع هنا — الرفع متوازي فالتجميع في الفاينلايز بس
    // ================================================
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId مفقود للرفع المجزأ' }, { status: 400 })
    }
    if (chunkIndex === 0) {
      // تنظيف مهجور مرة واحدة في أول جزء (بأمان — فشله مبيوقفش الرفع)
      await cleanupOrphanChunks()
    }

    var slotPath = chunkSlotPath(uploadId, chunkIndex)
    await safeWrite(function () {
      return db.media.deleteMany({ where: { filePath: slotPath } })
    })
    await safeWrite(function () {
      return db.media.create({
        data: {
          filename: fileName,
          filePath: slotPath,
          fileType: fileType,
          fileSize: String(buffer.length),
          data: base64,
          category: '__chunk__',
        },
      })
    })

    return NextResponse.json({
      done: false,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      received: buffer.length,
    })
  } catch (err: any) {
    console.error('Station upload error:', err)
    return NextResponse.json({ error: err.message || 'حصلت مشكلة في الرفع' }, { status: 500 })
  }
}

async function cleanupOrphanChunks() {
  try {
    await db.media.deleteMany({
      where: {
        filePath: { startsWith: CHUNK_PREFIX },
        createdAt: { lt: new Date(Date.now() - CHUNK_TTL_MS) },
      },
    })
  } catch (e) {}
}
