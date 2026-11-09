// @ts-nocheck
// FILE: src/app/api/admin/books/route.ts
// (2026-و40) إدارة الكتب والملازم — تاب «الكتب والملازم» في لوحة الأدمن.
// الرفع نفسه بيتم من الكلينت بـ chunkedUpload('/api/upload/chunk' → Media)
// وبعدها بنسجل صف Book فيه filePath = /api/files/<mediaId>.
// DELETE بيشيل صف Book **و** صف Media اللي شايل الملف نفسه (لو لسه موجود).

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import { notifyStudents } from '@/lib/notify'
import { notifyParentsOfNewContent } from '@/lib/parent-notify'

export const runtime = 'nodejs'

/* self-heal خفيف (مرة واحدة لكل instance): ضمان وجود جدول Book قبل أي عملية
   — زي نمط defensive ALTERs في /api/homework و /api/exams — عشان أول طلب
   بعد النشر على Turso ما يعتمدش على إن /api/health عدّى قبلها */
/* self-heal قوي (ز32): ضمان وجود جدول Book بكل أعمدته قبل أي عملية.
   العلة اللي كانت بتخلي «الكتب مش محفوظة» بلينك الدرايف: قواعد قديمة
   اتعملت من غير أعمدة sourceUrl/usage — والـ ALTERs القديمة كانت
   بتتنفذ **مرة واحدة لكل instance** وبيفشلوا بصمت (catch(e){}) —
   فأول فشل لحظي كان بيسيب القاعدة ناقصة للأبد والحفظ بيرجع 500.
   بقى: بنقرأ الأعمدة الحقيقية بـ PRAGMA ونضيف الناقص ونتحقق بعدها —
   وأي فشل بيرجّع _bookTableReady لـ null عشان الطلب اللي بعده يعيد */
var _bookTableReady: Promise<void> | null = null
var BOOK_REQUIRED_COLUMNS: Array<[string, string]> = [
  ['description', "TEXT NOT NULL DEFAULT ''"],
  ['filePath', "TEXT NOT NULL DEFAULT ''"],
  ['fileName', "TEXT NOT NULL DEFAULT ''"],
  ['sourceUrl', "TEXT NOT NULL DEFAULT ''"],
  ['fileType', "TEXT NOT NULL DEFAULT 'application/pdf'"],
  ['sizeBytes', 'INTEGER NOT NULL DEFAULT 0'],
  ['grade', "TEXT NOT NULL DEFAULT ''"],
  ['usage', "TEXT NOT NULL DEFAULT 'both'"],
]
function ensureBookTable() {
  var run = (async function () {
    try {
      await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Book (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', filePath TEXT NOT NULL DEFAULT '', fileName TEXT NOT NULL DEFAULT '', sourceUrl TEXT NOT NULL DEFAULT '', fileType TEXT NOT NULL DEFAULT 'application/pdf', sizeBytes INTEGER NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)")
    } catch (e) {}
    var cols: any[] = []
    try {
      cols = await db.$queryRawUnsafe('PRAGMA table_info(Book)') as any[]
    } catch (e) { cols = [] }
    var have: Record<string, boolean> = {}
    ;(cols || []).forEach(function (c: any) { have[String(c.name)] = true })
    for (var i = 0; i < BOOK_REQUIRED_COLUMNS.length; i++) {
      var colName = BOOK_REQUIRED_COLUMNS[i][0]
      var colDef = BOOK_REQUIRED_COLUMNS[i][1]
      if (have[colName]) continue
      try {
        await db.$executeRawUnsafe('ALTER TABLE Book ADD COLUMN ' + colName + ' ' + colDef)
      } catch (e) {}
      /* تحقق بعد الـ ALTER — لو لسه ناقص اعرف فورًا بدل ما الحفظ يفشل برسالة غامضة */
      try {
        var re = await db.$queryRawUnsafe('PRAGMA table_info(Book)') as any[]
        have = {}
        ;(re || []).forEach(function (c: any) { have[String(c.name)] = true })
      } catch (e) {}
      if (!have[colName]) {
        throw new Error('Book table missing column: ' + colName)
      }
    }
  })()
  _bookTableReady = run.catch(function (e) {
    /* فشل الإصلاح الذاتي → الطلب اللي بعده يعيد المحاولة بدل ما يحفظ حالة مكسورة */
    _bookTableReady = null
    throw e
  })
  return _bookTableReady
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')
    const admin = await isAdmin(adminId)
    if (!admin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    await ensureBookTable()
    const books = await db.book.findMany({ orderBy: { createdAt: 'desc' } })
    return NextResponse.json({ books: books || [] })
  } catch (error: any) {
    console.error('Books list error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

/* (و43 → ز32) التحقق من لينك الكتاب — اللينك بيتخزن **زي ما هو** (مفيش أي
   إعادة كتابة): التحويل القديم لـ uc?export=download كان بيبوّظ الملفات
   الكبيرة (جوجل بترجّع صفحة تأكيد HTML) — القراءة الحقيقية بتحصل دلوقتي
   من خلال /api/books/proxy (مكتبة src/lib/drive بمرشحين التحميل وفك
   صفحة التأكيد)، والعرض للطالب جوه المنصة بالعارض المدمج */
function normalizeBookSourceUrl(raw: string): string | null {
  var url = String(raw || '').trim()
  if (!/^https?:\/\//i.test(url)) return null
  return url
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')
    const admin = await isAdmin(adminId)
    if (!admin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    await ensureBookTable()
    const body = await request.json()
    /* (2026-و79) usage: واجب (homework) / أسئلة (questions) / الاتنين (both) */
    const { title, description, filePath, fileName, fileType, sizeBytes, grade } = body || {}
    var usageRaw = String((body && body.usage) || 'both')
    var usage = usageRaw === 'homework' || usageRaw === 'questions' ? usageRaw : 'both'

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
    }

    /* (و43) وضع اللينك الخارجي: sourceUrl موجود → من غير رفع ملف خالص
       (الكتب الكبيرة 200MB+ مش بتتخزن في قاعدة البيانات — بنحفظ اللينك بس) */
    var sourceUrlRaw = body && body.sourceUrl ? String(body.sourceUrl) : ''
    if (sourceUrlRaw.trim()) {
      var sourceUrl = normalizeBookSourceUrl(sourceUrlRaw)
      if (!sourceUrl) {
        return NextResponse.json({ error: 'اللينك غير صالح — لازم يبدأ بـ http:// أو https://' }, { status: 400 })
      }
      const linkBook = await safeWrite(function () {
        return db.book.create({
          data: {
            title: String(title).trim(),
            description: String(description || ''),
            filePath: '',
            fileName: '',
            sourceUrl: sourceUrl,
            fileType: 'application/pdf',
            sizeBytes: 0,
            grade: String(grade || ''),
            usage: usage,
          },
        })
      })
      /* (و44) إشعار للطلاب: كتاب جديد اتضاف */
      /* (و45) await — الإشعار بيتكتب قبل الرد */
      try { await notifyStudents({ grade: String(grade || ''), type: 'book', title: '📕 كتاب جديد اتضاف: ' + String(title).trim(), body: String(description || '').slice(0, 200) || 'تقدر تفتحه أو تحمله من تاب الكتب والملازم' }) } catch (nE) {}
      /* (2026-ص5) إشعار ولي الأمر بالمحتوى الجديد — تيجي على ولي الأمر وللطالب */
      try { await notifyParentsOfNewContent({ grade: String(grade || ''), kind: 'book', title: String(title).trim(), body: String(description || '').slice(0, 160) || 'كتاب جديد في تاب الكتب والملازم' }) } catch (npE) {}
      return NextResponse.json({ message: 'تم إضافة الكتاب باللينك الخارجي', book: linkBook }, { status: 201 })
    }

    if (!filePath || String(filePath).indexOf('/api/files/') !== 0) {
      return NextResponse.json({ error: 'مسار الملف مطلوب (ارفع الملف الأول)' }, { status: 400 })
    }

    var sizeNum = parseInt(String(sizeBytes == null ? 0 : sizeBytes), 10)
    if (isNaN(sizeNum) || sizeNum < 0) sizeNum = 0

    const book = await safeWrite(function () {
      return db.book.create({
        data: {
          title: String(title).trim(),
          description: String(description || ''),
          filePath: String(filePath),
          fileName: String(fileName || ''),
          fileType: String(fileType || 'application/pdf'),
          sizeBytes: sizeNum,
          grade: String(grade || ''),
          usage: usage,
        },
      })
    })

    /* (و44) إشعار للطلاب: كتاب جديد اتضاف */
    /* (و45) await — الإشعار بيتكتب قبل الرد */
      try { await notifyStudents({ grade: String(grade || ''), type: 'book', title: '📕 كتاب جديد اتضاف: ' + String(title).trim(), body: String(description || '').slice(0, 200) || 'تقدر تفتحه أو تحمله من تاب الكتب والملازم' }) } catch (nE) {}
      /* (2026-ص5) إشعار ولي الأمر بالمحتوى الجديد — تيجي على ولي الأمر وللطالب */
      try { await notifyParentsOfNewContent({ grade: String(grade || ''), kind: 'book', title: String(title).trim(), body: String(description || '').slice(0, 160) || 'كتاب جديد في تاب الكتب والملازم' }) } catch (npE) {}

    return NextResponse.json({ message: 'تم إضافة الكتاب', book }, { status: 201 })
  } catch (error: any) {
    console.error('Book create error:', error)
    /* (ز32) رسالة واضحة لو العلة من أعمدة القاعدة بدل «Server error» الغامضة */
    var msg = error && error.message ? String(error.message) : String(error || '')
    if (msg.indexOf('missing column') !== -1) {
      return NextResponse.json({ error: 'قاعدة البيانات ناقصة عمود — جرب تاني بعد ثواني (الإصلاح الذاتي شغال)' }, { status: 503 })
    }
    return NextResponse.json({ error: 'Server error: ' + msg }, { status: 500 })
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const adminId = searchParams.get('adminId')
    const admin = await isAdmin(adminId)
    if (!admin) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    await ensureBookTable()
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    }

    var existing: any = null
    try { existing = await db.book.findUnique({ where: { id } }) } catch (e) {}
    if (!existing) {
      return NextResponse.json({ error: 'الكتاب غير موجود' }, { status: 404 })
    }

    await safeWrite(function () {
      return db.book.delete({ where: { id } })
    })

    /* حذف الملف الخلفي: filePath = /api/files/<mediaId> → نمسح صف Media
       (لو اتحذف قبل كده أو المسار مش من الملفات بنتجاهل بصمت) */
    try {
      var m = String(existing.filePath || '').match(/\/api\/files\/([\w-]+)/)
      if (m && m[1]) {
        await db.media.deleteMany({ where: { id: m[1] } })
      }
    } catch (mediaErr) {
      console.error('Book media cleanup error:', mediaErr)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Book delete error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
