
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const studentId = searchParams.get('studentId')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {}
    if (grade) where.grade = grade
    if (studentId) where.studentId = studentId
    if (keyword) {
      where.OR = [
        { content: { contains: keyword } },
        { studentName: { contains: keyword } },
      ]
    }

    const [discussions, total] = await Promise.all([
      db.discussion.findMany({
        where,
        orderBy: { createdAt: 'asc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.discussion.count({ where }),
    ])

    return NextResponse.json({
      discussions,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Discussions fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch discussions' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId, studentName, grade, content, isAdminReply } = body

    if (!grade || !content) {
      return NextResponse.json({ error: 'grade and content are required' }, { status: 400 })
    }

    const discussion = await db.discussion.create({
      data: {
        studentId: studentId || 'admin',
        studentName: studentName || 'Mr Sherif Elsayed',
        grade,
        content,
        isAdminReply: isAdminReply || false,
      },
    })

    return NextResponse.json({ message: 'Discussion created', discussion }, { status: 201 })
  } catch (error) {
    console.error('Discussion create error:', error)
    return NextResponse.json({ error: 'Failed to create discussion' }, { status: 500 })
  }
}
