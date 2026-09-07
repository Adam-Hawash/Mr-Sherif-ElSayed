
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/homework/[id] - 获取单个作业
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const homework = await db.homework.findUnique({ where: { id } })

    if (!homework) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 })
    }

    return NextResponse.json({ homework })
  } catch (error) {
    console.error('获取作业详情失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// PUT /api/homework/[id] - 更新作业
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, content, grade, questions } = body

    const existing = await db.homework.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 })
    }

    const homework = await db.homework.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(grade && { grade }),
        ...(questions !== undefined && { questions: typeof questions === 'string' ? questions : JSON.stringify(questions) }),
      },
    })

    return NextResponse.json({ message: '作业更新成功', homework })
  } catch (error) {
    console.error('更新作业失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}

// DELETE /api/homework/[id] - 删除作业
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.homework.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: '作业不存在' }, { status: 404 })
    }

    // المستر طلب: حذف الواجب من المنصة = حذف كل حاجة تخصه
    // (تسليمات الطالب + درجاته + تصحيحات الـ AI — عشان مفيش "واجب محذوف" يفضل ظاهر بدرجة)
    // الفورين كي مش مفروض على داتابيز الإنتاج (اتعملت بـ raw SQL) فبنمسح يدوي.
    try {
      await db.$executeRawUnsafe('DELETE FROM HomeworkResult WHERE homeworkId = ?', id)
    } catch (e) {
      console.error('حذف تسليمات الواجب فشل:', e)
      try { await db.homeworkResult.deleteMany({ where: { homeworkId: id } }) } catch (e2) {}
    }

    await db.homework.delete({ where: { id } })

    return NextResponse.json({ message: '作业删除成功' })
  } catch (error) {
    console.error('删除作业失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
