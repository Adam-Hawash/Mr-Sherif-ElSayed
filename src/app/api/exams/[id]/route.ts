
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

/* (25-ب1) defensive ALTERs — نفس نمط المشروع: ممنوع db:push */
/* (2026-و29) كاش على مستوى الموديول: كل ALTER = نداء شبكة لقاعدة البيانات — تنفيذها في كل ريكوست كان بيدفع نداءات ضاية في كل تحميل (من أكبر أسباب بطء المنصة) — دلوقتي مرة واحدة لكل instance */
var _examColsReady: Promise<void> | null = null
async function ensureExamFeatureColumns() {
  if (!_examColsReady) {
    _examColsReady = (async function () {
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN showResult INTEGER DEFAULT 0') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN timeLimitMin INTEGER DEFAULT 0') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN scheduledAt DATETIME') } catch (e) {}
  try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetStudentIds TEXT DEFAULT ''") } catch (e) {}
  /* (2026-و29) استهداف المجموعات */
  try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetGroupIds TEXT DEFAULT ''") } catch (e) {}
})()
  }
  await _examColsReady
}

// GET /api/exams/[id] - جلب امتحان بالمعرف
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const exam = await db.exam.findUnique({ where: { id } })

    if (!exam) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    return NextResponse.json({ exam })
  } catch (error) {
    console.error('فشل جلب الامتحان:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

/* (25-ب1) PATCH /api/exams/[id] — تعديل إعدادات الامتحان لاحقًا:
   يقبل أي مجموعة من { showResult, timeLimitMin, scheduledAt } —
   scheduledAt = null يعني إلغاء الجدولة (يظهر فورًا).
   التحقق بنفس نمط auth الأدمن الموجود في المشروع (adminId + isAdmin
   زي /api/videos و /api/files بالظبط). */
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

    await ensureExamFeatureColumns()

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}

    // إظهار/إخفاء الإجابات بعد التسليم
    if (body.showResult !== undefined) {
      data.showResult = body.showResult === true || body.showResult === 'true' || body.showResult === 1
    }

    // المؤقت بالدقائق (0 أو فاضي = بلا وقت)
    if (body.timeLimitMin !== undefined) {
      var tl = parseInt(String(body.timeLimitMin === null || body.timeLimitMin === '' ? '0' : body.timeLimitMin), 10)
      if (isNaN(tl) || tl < 0) tl = 0
      data.timeLimitMin = tl
    }

    // موعد الظهور: null = إلغاء الجدولة، نص ISO = جدولة
    if (body.scheduledAt !== undefined) {
      if (body.scheduledAt === null || body.scheduledAt === '') {
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

    /* (2026-و26) استهداف الطلاب: array ids → JSON string (فاضي = الكل يشوفه) */
    if (body.targetStudentIds !== undefined) {
      var arr: unknown[] = []
      if (Array.isArray(body.targetStudentIds)) arr = body.targetStudentIds
      else { try { var pp = JSON.parse(String(body.targetStudentIds)); if (Array.isArray(pp)) arr = pp } catch (e) {} }
      var cleanIds = arr.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
      cleanIds = cleanIds.filter(function (x: string, i: number) { return cleanIds.indexOf(x) === i })
      data.targetStudentIds = JSON.stringify(cleanIds)
    }

    /* (2026-و29) استهداف المجموعات — نفس المنطق بالظبط */
    if (body.targetGroupIds !== undefined) {
      var garr: unknown[] = []
      if (Array.isArray(body.targetGroupIds)) garr = body.targetGroupIds
      else { try { var gp = JSON.parse(String(body.targetGroupIds)); if (Array.isArray(gp)) garr = gp } catch (e) {} }
      var cleanGids = garr.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
      cleanGids = cleanGids.filter(function (x: string, i: number) { return cleanGids.indexOf(x) === i })
      data.targetGroupIds = JSON.stringify(cleanGids)
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: 'لا توجد حقول للتعديل' }, { status: 400 })
    }

    const exam = await safeWrite(function () {
      return db.exam.update({ where: { id }, data })
    })

    return NextResponse.json({ message: 'تم تحديث إعدادات الامتحان', exam })
  } catch (error) {
    console.error('PATCH exam error:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// PUT /api/exams/[id] - تحديث الامتحان
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { title, content, grade, questions, models, modelMode, fixedModel } = body

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    const exam = await db.exam.update({
      where: { id },
      data: {
        ...(title && { title }),
        ...(content && { content }),
        ...(grade && { grade }),
        ...(questions !== undefined && { questions: typeof questions === 'string' ? questions : JSON.stringify(questions) }),
        // نماذج الامتحان العشوائية (اختياري)
        ...(models !== undefined && { models: typeof models === 'string' ? models : JSON.stringify(models) }),
        // طريقة التوزيع (2026-و): عشوائي أو نموذج واحد ثابت للكل
        ...(modelMode !== undefined && { modelMode: modelMode === 'fixed' ? 'fixed' : 'random' }),
        ...(fixedModel !== undefined && { fixedModel: modelMode === 'fixed' ? String(fixedModel || '') : '' }),
      },
    })

    return NextResponse.json({ message: 'تم تحديث الامتحان بنجاح', exam })
  } catch (error) {
    console.error('تحديث الامتحانفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}

// DELETE /api/exams/[id] - حذف الامتحان
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'الامتحان غير موجود' }, { status: 404 })
    }

    // (2026-و16) طلب المستر حرفيًا: «أي امتحان أمسحه — النقاط بتاعته تختفي
    // والإجابات بتاعته تختفي من صفحة الأدمن». الحذف بقى عملية واحدة ذرّية
    // (transaction): نتايج الامتحان (الإجابات + تصحيحات الـ AI جواهم) + الامتحان
    // نفسه في نفس اللحظة — مفيش نتيجة يتيمة تفضل ظاهرة ولا نقاط بتتحسب من
    // امتحان اتمسح، ولو فشل حاجة بيرجع كل زي ما كان.
    try {
      await safeWrite(async function () {
        await db.$transaction([
          db.$executeRawUnsafe('DELETE FROM ExamResult WHERE examId = ?', id),
          db.$executeRawUnsafe('DELETE FROM Exam WHERE id = ?', id),
        ])
      })
    } catch (txErr) {
      // احتياط: نفس الحذف المتتابع القديم لو الـ transaction مش متاح على الداتابيز
      console.error('حذف الامتحان المتسلسل فشل — رجوع للحذف المتتابع:', txErr)
      try {
        await db.$executeRawUnsafe('DELETE FROM ExamResult WHERE examId = ?', id)
      } catch (e) {
        console.error('حذف نتايج الامتحان فشل:', e)
        try { await db.examResult.deleteMany({ where: { examId: id } }) } catch (e2) {}
      }
      await db.exam.delete({ where: { id } })
    }

    return NextResponse.json({ message: 'تم حذف الامتحان بنجاح' })
  } catch (error) {
    console.error('حذف الامتحانفشل:', error)
    return NextResponse.json({ error: 'حدث خطأ في السيرفر' }, { status: 500 })
  }
}
