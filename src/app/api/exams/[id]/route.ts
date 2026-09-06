
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/exams/[id] - 获取单个考试
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const exam = await db.exam.findUnique({ where: { id } })

    if (!exam) {
      return NextResponse.json({ error: '考试不存在' }, { status: 404 })
    }

    return NextResponse.json({ exam })
  } catch (error) {
    console.error('获取考试详情失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// PUT /api/exams/[id] - 更新考试
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, content, grade } = body

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '考试不存在' }, { status: 404 })
    }

    const exam = await db.exam.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(grade && { grade }),
      },
    })

    return NextResponse.json({ message: '考试更新成功', exam })
  } catch (error) {
    console.error('更新考试失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// DELETE /api/exams/[id] - 删除考试
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '考试不存在' }, { status: 404 })
    }

    await db.exam.delete({ where: { id } })

    return NextResponse.json({ message: '考试删除成功' })
  } catch (error) {
    console.error('删除考试失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
