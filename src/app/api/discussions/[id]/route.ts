
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/discussions/[id] - جلب مناقشة بالمعرف
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const discussion = await db.discussion.findUnique({ where: { id } })

    if (!discussion) {
      return NextResponse.json({ error: 'المناقشة غير موجودة' }, { status: 404 })
    }

    return NextResponse.json({ discussion })
  } catch (error) {
    console.error('فشل جلب المناقشة:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// PUT /api/discussions/[id] - تحديث المناقشة
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { studentName, grade, content } = body

    const existing = await db.discussion.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المناقشة غير موجودة' }, { status: 404 })
    }

    const discussion = await db.discussion.update({
      where: { id },
      data: {
        ...(studentName && { studentName }),
        ...(grade && { grade }),
        ...(content && { content }),
      },
    })

    return NextResponse.json({ message: 'تم تحديث المناقشة بنجاح', discussion })
  } catch (error) {
    console.error('تحديث المناقشةفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// DELETE /api/discussions/[id] - حذف المناقشة
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.discussion.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'المناقشة غير موجودة' }, { status: 404 })
    }

    await db.discussion.delete({ where: { id } })

    return NextResponse.json({ message: 'تم حذف المناقشة بنجاح' })
  } catch (error) {
    console.error('حذف المناقشةفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}
