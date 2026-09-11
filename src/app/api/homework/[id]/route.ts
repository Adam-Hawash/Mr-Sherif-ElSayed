
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

/* (25-ب1) جدولة الظهور — defensive ALTER بنفس نمط المشروع (ممنوع db:push) */
async function ensureHomeworkFeatureColumns() {
  try { await db.$executeRawUnsafe('ALTER TABLE Homework ADD COLUMN scheduledAt DATETIME') } catch (e) {}
  /* (2026-و26) استهداف الطلاب — نفس نمط الفيديوهات */
  try { await db.$executeRawUnsafe("ALTER TABLE Homework ADD COLUMN targetStudentIds TEXT DEFAULT ''") } catch (e) {}
}

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

/* (25-ب1) PATCH /api/homework/[id] — تعديل/إلغاء موعد ظهور الواجب:
   يقبل { adminId, scheduledAt } — scheduledAt = null يعني إلغاء الجدولة
   (يظهر فورًا). التحقق بنفس نمط auth الأدمن الموجود (adminId + isAdmin
   زي /api/videos بالظبط). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()

    // الكتابة للأدمن بس (نفس نمط /api/videos)
    if (!(await isAdmin(body && body.adminId))) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })
    }

    await ensureHomeworkFeatureColumns()

    const existing = await db.homework.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }

    if (body.scheduledAt === undefined && body.targetStudentIds === undefined) {
      return NextResponse.json({ error: 'لا توجد حقول للتعديل' }, { status: 400 })
    }

    var data: Record<string, unknown> = {}

    /* (2026-و26) استهداف الطلاب: array ids → JSON string (فاضي = الكل) */
    if (body.targetStudentIds !== undefined) {
      var tArr: unknown[] = []
      if (Array.isArray(body.targetStudentIds)) tArr = body.targetStudentIds
      else { try { var tp = JSON.parse(String(body.targetStudentIds)); if (Array.isArray(tp)) tArr = tp } catch (e) {} }
      var tClean = tArr.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
      tClean = tClean.filter(function (x: string, i: number) { return tClean.indexOf(x) === i })
      data.targetStudentIds = JSON.stringify(tClean)
    }

    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null || body.scheduledAt === '') {
        // إلغاء الجدولة — يظهر فورًا
        data.scheduledAt = null
      } else {
        try {
          var sd = new Date(String(body.scheduledAt))
          if (isNaN(sd.getTime())) throw new Error('bad date')
          data.scheduledAt = sd
        } catch (e) {
          return NextResponse.json({ error: 'صيغة الموعد غير صحيحة' }, { status: 400 })
        }
      }
    }

    const homework = await safeWrite(function () {
      return db.homework.update({ where: { id }, data })
    })

    return NextResponse.json({ message: 'تم تحديث إعدادات الواجب', homework })
  } catch (error) {
    console.error('PATCH homework error:', error)
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

    // (2026-و16) طلب المستر حرفيًا: «أي واجب أمسحه — النقاط بتاعته تختفي
    // والإجابات بتاعته تختفي من صفحة الأدمن». الحذف بقى عملية واحدة ذرّية
    // (transaction): تسليمات الطلاب (الإجابات + تصحيحات الـ AI جواهم) + الواجب
    // نفسه في نفس اللحظة — مفيش نتيجة يتيمة تفضل ظاهرة ولا نقاط بتتحسب من
    // واجب اتمسح. الفورين كي مش مفروض على داتابيز الإنتاج (اتعملت بـ raw SQL)
    // فبنمسح يدوي جوه transaction واحدة عشان النضيف يبقى كله أو لا حاجة.
    try {
      await safeWrite(async function () {
        await db.$transaction([
          db.$executeRawUnsafe('DELETE FROM HomeworkResult WHERE homeworkId = ?', id),
          db.$executeRawUnsafe('DELETE FROM Homework WHERE id = ?', id),
        ])
      })
    } catch (txErr) {
      // احتياط: نفس الحذف المتتابع القديم لو الـ transaction مش متاح على الداتابيز
      console.error('حذف الواجب المتسلسل فشل — رجوع للحذف المتتابع:', txErr)
      try {
        await db.$executeRawUnsafe('DELETE FROM HomeworkResult WHERE homeworkId = ?', id)
      } catch (e) {
        console.error('حذف تسليمات الواجب فشل:', e)
        try { await db.homeworkResult.deleteMany({ where: { homeworkId: id } }) } catch (e2) {}
      }
      await db.homework.delete({ where: { id } })
    }

    return NextResponse.json({ message: '作业删除成功' })
  } catch (error) {
    console.error('删除作业失败:', error)
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 })
  }
}
