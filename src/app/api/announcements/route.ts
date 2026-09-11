
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/announcements - جلب كل الإعلانات
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {}
    if (grade) where.grade = grade
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
      ]
    }

    const [announcements, total] = await Promise.all([
      db.announcement.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.announcement.count({ where }),
    ])

    return NextResponse.json({
      announcements,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('فشل جلب الإعلانات:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// POST /api/announcements - إنشاء الإعلان
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, grade } = body

    if (!title || !content || !grade) {
      return NextResponse.json({ error: 'العنوان والمحتوى والصف مطلوبين' }, { status: 400 })
    }

    const announcement = await db.announcement.create({
      data: { title, content, grade },
    })

    return NextResponse.json({ message: 'تم إنشاء الإعلان بنجاح', announcement }, { status: 201 })
  } catch (error) {
    console.error('فشل إنشاء الإعلان:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}