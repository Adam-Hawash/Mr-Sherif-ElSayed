
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/announcements/[id] - جلب إعلان بالمعرف
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const announcement = await db.announcement.findUnique({ where: { id } })

    if (!announcement) {
      return NextResponse.json({ error: 'الإعلان غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ announcement })
  } catch (error) {
    console.error('فشل جلب الإعلان:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// PUT /api/announcements/[id] - تحديث الإعلان
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, content, grade } = body

    const existing = await db.announcement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الإعلان غير موجود' }, { status: 404 })
    }

    const announcement = await db.announcement.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(grade && { grade }),
      },
    })

    return NextResponse.json({ message: 'تم تحديث الإعلان بنجاح', announcement })
  } catch (error) {
    console.error('تحديث الإعلانفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// DELETE /api/announcements/[id] - حذف الإعلان
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.announcement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الإعلان غير موجود' }, { status: 404 })
    }

    await db.announcement.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف الإعلان بنجاح' })
  } catch (error) {
    console.error('حذف الإعلانفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}
