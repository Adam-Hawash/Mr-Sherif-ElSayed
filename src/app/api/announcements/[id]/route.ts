
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/announcements/[id] - 获取单个公告
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const announcement = await db.announcement.findUnique({ where: { id } })

    if (!announcement) {
      return NextResponse.json({ error: '公告不存在' }, { status: 404 })
    }

    return NextResponse.json({ announcement })
  } catch (error) {
    console.error('获取公告详情失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// PUT /api/announcements/[id] - 更新公告
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
      return NextResponse.json({ error: '公告不存在' }, { status: 404 })
    }

    const announcement = await db.announcement.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(grade && { grade }),
      },
    })

    return NextResponse.json({ message: '公告更新成功', announcement })
  } catch (error) {
    console.error('更新公告失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// DELETE /api/announcements/[id] - 删除公告
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.announcement.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '公告不存在' }, { status: 404 })
    }

    await db.announcement.delete({ where: { id } })

    return NextResponse.json({ message: '公告删除成功' })
  } catch (error) {
    console.error('删除公告失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
