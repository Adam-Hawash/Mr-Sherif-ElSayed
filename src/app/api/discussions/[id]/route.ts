
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/discussions/[id] - 获取单个讨论
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const discussion = await db.discussion.findUnique({ where: { id } })

    if (!discussion) {
      return NextResponse.json({ error: '讨论不存在' }, { status: 404 })
    }

    return NextResponse.json({ discussion })
  } catch (error) {
    console.error('获取讨论详情失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// PUT /api/discussions/[id] - 更新讨论
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
      return NextResponse.json({ error: '讨论不存在' }, { status: 404 })
    }

    const discussion = await db.discussion.update({
      where: { id },
      data: {
        ...(studentName && { studentName }),
        ...(grade && { grade }),
        ...(content && { content }),
      },
    })

    return NextResponse.json({ message: '讨论更新成功', discussion })
  } catch (error) {
    console.error('更新讨论失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// DELETE /api/discussions/[id] - 删除讨论
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.discussion.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '讨论不存在' }, { status: 404 })
    }

    await db.discussion.delete({ where: { id } })

    return NextResponse.json({ message: '讨论删除成功' })
  } catch (error) {
    console.error('删除讨论失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
