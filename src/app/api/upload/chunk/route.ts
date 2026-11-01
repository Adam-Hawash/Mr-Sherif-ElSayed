// @ts-nocheck
// Upload files to Media table (base64) - no external services needed
//
// 2026-و19 — إصلاح علة «الورقة مش كاملة» من جذرها:
//   الكود القديم كان بيحفظ كل chunk كصف Media مستقل ويرجّع done:true فورًا،
//   فالكلينت (chunked-upload.ts) بيوقف الرفع بعد أول جزء — أي صورة/ملف
//   أكبر من 2MB كان بيتم تخزينه **مقطوع** (أول 2MB بس) والباقي بيضيع
//   نهائيًا → ورقة حل الطالب بتوصل للتصحيح ناقصة والـ AI بيقول
//   «الورقة غير مكتملة» ويحسب غلط على حل صحيح.
//   الحل: الأجزاء بتتخزن في جدول Media بعلامة __chunks/<uploadId>/<i>.

// ============================================================
// (تسريع رفع الفيديوهات — طلب المستر: «الفيديوهات بتاخد وقت عقبال
//  ما بتترفع مع إن النت تمام»)
// العلة الجذرية في النظام القديم: لما آخر جزء بيوصله، السيرفر كان
// بيجيب **كل الأجزاء** وبيجمعهم وبيعيد كتابة الملف كله في **صف واحد
// ضخم base64** — فيديو 100MB يعني كتابة ~133MB في ضربة واحدة:
// دقايق انتظار + غالبًا timeout (60 ثانية) = فشل صامت والفيديو عمره
// ما بيوصل للمنصة.
// النظام الجديد — **الأجزاء هي الملف نفسه**:
//   1) كل جزء بيتبعت بيتبقى مخزن نهائيًا تحت __chunks/<uploadId>/<i>
//   2) لما الكل يخلص، الكلينت يبعت طلب finalize → بيتعمل صف «مانيفست»
//      خفيف (data فاضي + fileSize الكلي + filePath = '__file/<uploadId>')
//      في أقل من ثانية — **مفيش تجميع ولا إعادة كتابة خالص**
//   3) /api/files/<id> بيخدم الملف بقراءة الأجزاء المطلوبة بس (Range
//      شغال حصة بحصة) — نفس السلوك القديم من ناحية المتصفح
//   4) الأجزاء المهجورة (رفع اتقطع) بتتنضف بالـ TTL زي ما كان — بس
//      بشرط إن مفيش مانيفست بيخصها
// نتيجة: فيديو 200MB بيرفع بسرعة النت الفعلية (أجزاء متوازية من
// الكلينت) وبينتهي بـ INSERT خفيف بدل كتابة عملاقة قريبة من الـ timeout.
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const maxDuration = 60

// بادئة صفوف الأجزاء — بتفضل هي التخزين النهائي للملفات الكبيرة
var CHUNK_PREFIX = '__chunks/'
// بادئة صفوف المانيفست (الملف المنطقي) — filePath = '__file/<uploadId>'
var FILE_PREFIX = '__file/'
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
    var fileName = String(formData.get('fileName') || 'file')
    var category = String(formData.get('category') || 'general')
    var chunkIndex = parseInt(String(formData.get('chunkIndex') ?? '0'), 10) || 0
    var totalChunks = parseInt(String(formData.get('totalChunks') ?? '1'), 10) || 1
    var isFinalize = String(formData.get('finalize') || '') === '1'
    if (totalChunks < 1) totalChunks = 1
    if (chunkIndex < 0) chunkIndex = 0

    /* ============ وضع finalize: إنشاء المانيفست بعد اكتمال كل الأجزاء ============
       مفيش ملف جوه الطلب ده — بيتحقق إن كل الأجزاء موجودة وبيسجل الملف المنطقي */
    if (isFinalize) {
      if (!uploadId) {
        return NextResponse.json({ error: 'uploadId مفقود' }, { status: 400 })
      }
      if (file) {
        return NextResponse.json({ error: 'طلب finalize مش المفروض يبعت فيه ملف' }, { status: 400 })
      }

      // تنظيف المهجور مرة واحدة هنا (مش مع كل جزء زي النظام القديم)
      await cleanupOrphanChunks()

      // الأجزاء: من غير عمود data خالص — بيتقروا خفيف (id/filePath/fileSize فقط)
      var parts: any[] = await db.media.findMany({
        where: { filePath: { startsWith: CHUNK_PREFIX + uploadId + '/' } },
        select: { id: true, filePath: true, fileSize: true },
      })

      // ترتيب رقمي بالفهرس والتحقق إن الأجزاء كاملة 0..N-1
      var byIndex: Record<number, any> = {}
      var totalSize = 0
      for (var pi = 0; pi < parts.length; pi++) {
        var idx = parseIndexFromPath(String(parts[pi].filePath || ''))
        if (idx >= 0 && idx < totalChunks && !byIndex[idx]) {
          byIndex[idx] = parts[pi]
          totalSize += Number(parts[pi].fileSize || 0)
        }
      }
      var missing: number[] = []
      for (var ci = 0; ci < totalChunks; ci++) {
        if (!byIndex[ci]) missing.push(ci)
      }
      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: 'اتستلم ' + (totalChunks - missing.length) + ' جزء من ' + totalChunks + ' — حاول ترفع الملف تاني',
            received: totalChunks - missing.length,
            totalChunks: totalChunks,
          },
          { status: 400 }
        )
      }

      // المانيفست: data فاضي = ملف مجزأ (القراءة بتبص على الأجزاء)
      var safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
      var manifest = await db.media.create({
        data: {
          filename: fileName,
          filePath: FILE_PREFIX + uploadId,
          fileType: String(formData.get('fileType') || 'application/octet-stream'),
          fileSize: String(totalSize),
          data: '',
          category: category,
        },
      })

      return NextResponse.json({
        filePath: '/api/files/' + manifest.id,
        fileType: manifest.fileType,
        filename: safeName,
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

    var safeName2 = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
    var filePath = category + '/' + Date.now() + '_' + safeName2
    var fileType = file.type || 'application/octet-stream'

    // =====================================================
    // الحالة 1: ملف صغير (جزء واحد) — حفظ مباشر زي ما هو
    // (الصور والملفات الصغيرة لسه بتتخزن صف واحد زي أي وقت)
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
        filename: safeName2,
        size: buffer.length,
        done: true,
      })
    }

    // =====================================================
    // الحالة 2: جزء من ملف كبير — تخزين نهائي (مش مؤقت زي قبل)
    // (delete ثم create = كتابة فوق آمنة لو حصل retry لنفس الجزء)
    // التنظيف الأولاني مرة واحدة على أول جزء بس — مش مع كل جزء
    // (كان بعمل سكان على جدول ضخم مع كل رفع جزء = بطء ببلاش)
    // =====================================================
    if (!uploadId) {
      return NextResponse.json({ error: 'uploadId مفقود للرفع المجزأ' }, { status: 400 })
    }

    if (chunkIndex === 0) {
      await cleanupOrphanChunks()
    }

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

    // الجزء اتحفظ — الفاينلايز بيبعته الكلينت بعد ما يخلص كل الأجزاء
    return NextResponse.json({
      done: false,
      chunkIndex: chunkIndex,
      totalChunks: totalChunks,
      received: buffer.length,
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message || 'حصلت مشكلة في الرفع' }, { status: 500 })
  }
}

// تنظيف الأجزاء المهجورة (رفع اتبدأ وماكملش خلال يوم) — بيشتغل مرة واحدة
// في بداية كل رفع مجزأ وعند الـ finalize، مش مع كل جزء زي النظام القديم.
// الأجزاء اللي ليها مانيفست (ملف كامل متسجل) **ماتتمسحش** — دي هي الملف نفسه.
async function cleanupOrphanChunks() {
  try {
    var cutoff = new Date(Date.now() - CHUNK_TTL_MS)
    // صفوف الأجزاء القديمة — من غير عمود data (خفيف)
    var oldParts: any[] = await db.media.findMany({
      where: { filePath: { startsWith: CHUNK_PREFIX }, createdAt: { lt: cutoff } },
      select: { id: true, filePath: true },
    })
    if (!oldParts || oldParts.length === 0) return

    // اجمع uploadIds المميزة واتأكد إن ملهاش مانيفست
    var uploadIds: Record<string, boolean> = {}
    for (var i = 0; i < oldParts.length; i++) {
      var p = String((oldParts[i] as any).filePath || '')
      // __chunks/<uploadId>/<i> → uploadId
      var rest = p.substring(CHUNK_PREFIX.length)
      var slash = rest.indexOf('/')
      if (slash > 0) uploadIds[rest.substring(0, slash)] = true
    }
    var ids = Object.keys(uploadIds)
    if (ids.length === 0) return

    var manifests: any[] = await db.media.findMany({
      where: { filePath: { in: ids.map(function (u) { return FILE_PREFIX + u }) } },
      select: { filePath: true },
    })
    var liveIds: Record<string, boolean> = {}
    for (var m = 0; m < manifests.length; m++) {
      var fp = String((manifests[m] as any).filePath || '')
      if (fp.indexOf(FILE_PREFIX) === 0) liveIds[fp.substring(FILE_PREFIX.length)] = true
    }

    // امسح أجزاء المهجورة فقط (اللي مالهاش مانيفست)
    var doomed: string[] = []
    for (var j = 0; j < oldParts.length; j++) {
      var pp = String((oldParts[j] as any).filePath || '')
      var rest2 = pp.substring(CHUNK_PREFIX.length)
      var slash2 = rest2.indexOf('/')
      var uid = slash2 > 0 ? rest2.substring(0, slash2) : ''
      if (uid && !liveIds[uid]) doomed.push(String((oldParts[j] as any).id))
    }
    if (doomed.length > 0) {
      await db.media.deleteMany({ where: { id: { in: doomed } } })
    }
  } catch (e) {
    // التنظيف خدمة إضافية — فشله مبيوقفش الرفع
  }
}
