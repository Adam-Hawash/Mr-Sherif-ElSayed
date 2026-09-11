// @ts-nocheck
// Upload files to Media table (base64) - no external services needed
//
// 2026-و19 — إصلاح علة «الورقة مش كاملة» من جذرها:
//   الكود القديم كان بيحفظ كل chunk كصف Media مستقل ويرجّع done:true فورًا،
//   فالكلينت (chunked-upload.ts) بيوقف الرفع بعد أول جزء — أي صورة/ملف
//   أكبر من 2MB كان بيتم تخزينه **مقطوع** (أول 2MB بس) والباقي بيضيع
//   نهائيًا → ورقة حل الطالب بتوصل للتصحيح ناقصة والـ AI بيقول
//   «الورقة غير مكتملة» ويحسب غلط على حل صحيح.
//   دلوقتي: الأجزاء بتتخزن مؤقتًا في جدول Media بعلامة __chunks/<uploadId>/<i>
//   ولما آخر جزء يوصل بتتجمع بالترتيب في صف واحد نهائي — الصورة كاملة
//   100% زي ما الطالب صوّرها، وأي retry لجزء بيكتب فوق القديم بأمان.

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const maxDuration = 60

// بادئة صفوف الأجزاء المؤقتة — مش بتظهر كملف نهائي أبدًا
var CHUNK_PREFIX = '__chunks/'
// الأجزاء اللي مكتملش رفعها من أكتر من يوم بتتشال أوتوماتيك (رفع فاشل مهجور)
var CHUNK_TTL_MS = 24 * 60 * 60 * 1000

function chunkSlotPath(uploadId: string, index: number): string {
  return CHUNK_PREFIX + uploadId + '/' + index
}

function parseIndexFromPath(filePath: string): number {
  // __chunks/<uploadId>/<index> → index رقمي (ترتيب رقمي مش نصي)
  var tail = filePath.substring(filePath.lastIndexOf('/') + 1)
  var n = parseInt(tail, 10)
  return isNaN(n) ? -1 : n
}

export async function POST(req: NextRequest) {
  try {
    var formData = await req.formData()
    var file = formData.get('file') as File | null
    var uploadId = String(formData.get('uploadId') || '').replace(/[^a-zA-Z0-9\-]/g, '')
    var fileName = (formData.get('fileName') as string) || 'file'
    var category = (formData.get('category') as string) || 'general'
    var chunkIndex = parseInt(String(formData.get('chunkIndex') ?? '0'), 10) || 0
    var totalChunks = parseInt(String(formData.get('totalChunks') ?? '1'), 10) || 1
    if (totalChunks < 1) totalChunks = 1
    if (chunkIndex < 0) chunkIndex = 0

    if (!file) {
      return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 })
    }

    var arrayBuffer = await file.arrayBuffer()
    var buffer = Buffer.from(arrayBuffer)
    var base64 = buffer.toString('base64')

    var safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
    var filePath = category + '/' + Date.now() + '_' + safeName
    var fileType = file.type || 'application/octet-stream'

    // =====================================================
    // الحالة 1: ملف صغير (جزء واحد) — حفظ مباشر زي ما هو
    // =====================================================
    if (totalChunks === 1) {
      var media = await db.media.create({
        data: {
          filename: fileName,
          filePath: filePath,
          fileType: fileType,
          fileSize: String(buffer.length),
          data: base64,
          category: category,
        },
      })

      return NextResponse.json({
        filePath: '/api/files/' + media.id,
        fileType: fileType,
        filename: fileName,
        size: buffer.length,
        done: true,
      })
    }

    // =====================================================
    // الحالة 2: رفع مجزأ — تخزين مؤقت للجزء الحالي
    // (delete ثم create = كتابة فوق آمنة لو حصل retry لنفس الجزء)
    // =====================================================
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId مفقود للرفع المجزأ' }, { status: 400 })
    }

    // تنظيف الأجزاء المهجورة من رفعات فاشلة قديمة (بأمان — لو فشل مبيأثرش)
    await cleanupOrphanChunks()

    var slotPath = chunkSlotPath(uploadId, chunkIndex)
    await db.media.deleteMany({ where: { filePath: slotPath } })
    await db.media.create({
      data: {
        filename: fileName,
        filePath: slotPath,
        fileType: fileType,
        fileSize: String(buffer.length),
        data: base64,
        category: '__chunk__',
      },
    })

    // لسه مش آخر جزء — الخزانة شغالة، الكلينت هيكمل باقي الأجزاء
    if (chunkIndex < totalChunks - 1) {
      return NextResponse.json({
        done: false,
        chunkIndex: chunkIndex,
        totalChunks: totalChunks,
        received: buffer.length,
      })
    }

    // =====================================================
    // الحالة 3: آخر جزء وصل — تجميع كل الأجزاء بالترتيب في ملف واحد
    // =====================================================
    var parts = await db.media.findMany({
      where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
      orderBy: { createdAt: 'asc' },
    })

    // ترتيب رقمي بالفهرس (مش نصي عشان 10 ما تجيش قبل 2)
    parts.sort(function (a: any, b: any) {
      return parseIndexFromPath(a.filePath) - parseIndexFromPath(b.filePath)
    })

    if (parts.length < totalChunks) {
      // جزء ناقص (فشل شبكة في جزء وسطى) — رسالة واضحة والكلينت يعرضها
      return NextResponse.json(
        {
          error: 'اتستلم ' + parts.length + ' جزء من ' + totalChunks + ' — حاول ترفع الملف تاني',
          received: parts.length,
          totalChunks: totalChunks,
        },
        { status: 400 }
      )
    }

    // التجميع بالترتيب — الصورة/الملف كاملة زي ما اتبعتت
    var buffers: Buffer[] = []
    var totalSize = 0
    for (var i = 0; i < totalChunks; i++) {
      var chunkData = parts[i].data || ''
      var chunkBuf = Buffer.from(chunkData, 'base64')
      buffers.push(chunkBuf)
      totalSize += chunkBuf.length
    }
    var full = Buffer.concat(buffers)
    var fullBase64 = full.toString('base64')

    // الصف النهائي + تنظيف الأجزاء المؤقتة
    var finalMedia = await db.media.create({
      data: {
        filename: fileName,
        filePath: filePath,
        fileType: fileType,
        fileSize: String(totalSize),
        data: fullBase64,
        category: category,
      },
    })
    await db.media.deleteMany({
      where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
    })

    return NextResponse.json({
      filePath: '/api/files/' + finalMedia.id,
      fileType: fileType,
      filename: fileName,
      size: totalSize,
      done: true,
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message || 'حصلت مشكلة في الرفع' }, { status: 500 })
  }
}

// تنظيف الأجزاء المهجورة (رفع اتبدأ وماكملش خلال يوم) — بيشتغل مع كل
// رفع مجزأ بس، والفحص على filePath فمبيقرأش البلوبات نفسها
async function cleanupOrphanChunks() {
  try {
    await db.media.deleteMany({
      where: {
        filePath: { startsWith: CHUNK_PREFIX },
        createdAt: { lt: new Date(Date.now() - CHUNK_TTL_MS) },
      },
    })
  } catch (e) {
    // التنظيف خدمة إضافية — فشله مبيوقفش الرفع
  }
}
