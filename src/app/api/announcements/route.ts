
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/announcements - 获取所有公告
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
    console.error('获取公告列表失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// POST /api/announcements - 创建公告
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, grade } = body

    if (!title || !content || !grade) {
      return NextResponse.json({ error: '标题、内容和年级不能为空' }, { status: 400 })
    }

    const announcement = await db.announcement.create({
      data: { title, content, grade },
    })

    return NextResponse.json({ message: '公告创建成功', announcement }, { status: 201 })
  } catch (error) {
    console.error('创建公告失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}