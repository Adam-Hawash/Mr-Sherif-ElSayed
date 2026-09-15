// @ts-nocheck
// FILE: src/app/api/admin/books/route.ts
// (2026-و40) إدارة الكتب والملازم — تاب «الكتب والملازم» في لوحة الأدمن.
// الرفع نفسه بيتم من الكلينت بـ chunkedUpload('/api/upload/chunk' → Media)
// وبعدها بنسجل صف Book فيه filePath = /api/files/<mediaId>.
// DELETE بيشيل صف Book **و** صف Media اللي شايل الملف نفسه (لو لسه موجود).

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

export const runtime = 'nodejs'

/* self-heal خفيف (مرة واحدة لكل instance): ضمان وجود جدول Book قبل أي عملية
   — زي نمط defensive ALTERs في /api/homework و /api/exams — عشان أول طلب
   بعد النشر على Turso ما يعتمدش على إن /api/health عدّى قبلها */
var _bookTableReady: Promise<void> | null = null
function ensureBookTable() {
  if (!_bookTableReady) {
    _bookTableReady = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Book (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', filePath TEXT NOT NULL DEFAULT '', fileName TEXT NOT NULL DEFAULT '', fileType TEXT NOT NULL DEFAULT 'application/pdf', sizeBytes INTEGER NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)")
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
    const { title, description, filePath, fileName, fileType, sizeBytes, grade } = body || {}

    if (!title || !String(title).trim()) {
      return NextResponse.json({ error: 'العنوان مطلوب' }, { status: 400 })
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
        },
      })
    })

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
