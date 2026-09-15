// @ts-nocheck
// FILE: src/app/api/admin/books/route.ts
// (2026-و40) إدارة الكتب والملازم — تاب «الكتب والملازم» في لوحة الأدمن.
// الرفع نفسه بيتم من الكلينت بـ chunkedUpload('/api/upload/chunk' → Media)
// وبعدها بنسجل صف Book فيه filePath = /api/files/<mediaId>.
// (و43) وضع اللينك الخارجي: الكتاب الكبير (200MB+) مش بيتخزن في قاعدة
// البيانات خالص — بنسجل sourceUrl بس والطالب بيحمل منه مباشرة.
// DELETE بيشيل صف Book **و** صف Media اللي شايل الملف نفسه (لو لسه موجود).

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import { notifyStudents } from '@/lib/notify'

export const runtime = 'nodejs'

/* self-heal خفيف (مرة واحدة لكل instance): ضمان وجود جدول Book قبل أي عملية
   — زي نمط defensive ALTERs في /api/homework و /api/exams — عشان أول طلب
   بعد النشر على Turso ما يعتمدش على إن /api/health عدّى قبلها */
var _bookTableReady: Promise<void> | null = null
function ensureBookTable() {
  if (!_bookTableReady) {
    _bookTableReady = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Book (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', filePath TEXT NOT NULL DEFAULT '', sourceUrl TEXT NOT NULL DEFAULT '', fileName TEXT NOT NULL DEFAULT '', fileType TEXT NOT NULL DEFAULT 'application/pdf', sizeBytes INTEGER NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)")
        /* (و43) ترميم دفاعي للقواعد القديمة: عمود sourceUrl الناقص بيتضاف فورًا */
        try { await db.$executeRawUnsafe("ALTER TABLE Book ADD COLUMN sourceUrl TEXT NOT NULL DEFAULT ''") } catch (e2) {}
      } catch (e) {}
    })()
  }
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
    const { title, description, filePath, fileName, fileType, sizeBytes, grade, sourceUrl } = body || {}

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
    }
    /* (و43) وضع اللينك الخارجي: sourceUrl صالح (http/https) بيكفي لوحده —
       لينكات جوجل درايف بيتحولوا لتحميل مباشر، والمسار الخام بيفضل شغال
       زي ما هو للملفات المرفوعة */
    var link = String(sourceUrl || '').trim()
    if (link) {
      if (!/^https?:\/\//i.test(link)) {
        return NextResponse.json({ error: 'لينك الكتاب لازم يبدأ بـ http:// أو https://' }, { status: 400 })
      }
      var drv = link.match(/drive\.google\.com\/file\/d\/([\w-]+)/) || link.match(/drive\.google\.com\/open\?id=([\w-]+)/)
      if (drv && drv[1]) link = 'https://drive.google.com/uc?export=download&id=' + drv[1]
    }
    if (!link && (!filePath || String(filePath).indexOf('/api/files/') !== 0)) {
      return NextResponse.json({ error: 'مسار الملف مطلوب (ارفع الملف الأول أو ضيف لينك خارجي)' }, { status: 400 })
    }

    var sizeNum = parseInt(String(sizeBytes == null ? 0 : sizeBytes), 10)
    if (isNaN(sizeNum) || sizeNum < 0) sizeNum = 0

    const book = await safeWrite(function () {
      return db.book.create({
        data: {
          title: String(title).trim(),
          description: String(description || ''),
          /* (و43) وضع اللينك: filePath فاضي والحجم صفر — الملف مش متخزن عندنا */
          filePath: link ? '' : String(filePath),
          sourceUrl: link,
          fileName: String(fileName || ''),
          fileType: String(fileType || 'application/pdf'),
          sizeBytes: link ? 0 : sizeNum,
          grade: String(grade || ''),
        },
      })
    })

    /* (و44) إشعار للطلاب: كتاب جديد اتضاف */
    notifyStudents({ grade: String(grade || ''), type: 'book', title: '📕 كتاب جديد اتضاف: ' + String(title).trim(), body: String(description || '').slice(0, 200) || 'تقدر تفتحه أو تحمله من تاب الكتب والملازم' }).catch(function () {})

    return NextResponse.json({ message: 'تم إضافة الكتاب', book }, { status: 201 })
  } catch (error: any) {
    console.error('Book create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
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
