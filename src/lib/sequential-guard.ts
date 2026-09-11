// ============================================================
// SEQUENTIAL GUARD — الترتيب التسلسلي للواجبات والامتحانات
// ============================================================
// (طلب المستر — نفس نظام الفيديوهات بالظبط)
// الواجب/الامتحان مينفعش يتفتح غير لما اللي قبله يتسلّم/يتقدّم.
// الترتيب: من الأقدم للأحدث (ترتيب النزول على المنصة نفسه).
// العناصر اللي مش قابلة للتسليم (من غير أسئلة — ملف بس) بتتخطى
// عشان التسلسل ميقلعش على حاجة الطالب مش قادر يسلمها.
// أي خطأ داخلي → ممنوع نمنع طالب بريء (نفتح بدل ما نقفل).
// ============================================================
import { db } from '@/lib/db'

export interface SeqCheckResult {
  ok: boolean
  code?: number
  reason?: string
}

function hasQuestions(questionsJson: string | null | undefined): boolean {
  try {
    var qs = JSON.parse(String(questionsJson || '[]'))
    return Array.isArray(qs) && qs.length > 0
  } catch (e) {
    return false
  }
}

/* (إصلاح 2026-و10) الفحص الخام مباشرة من الداتابيز — سبب علة
   «الامتحان ده مش هيتسلم غير لما تاخد اللي قبله» رغم إن الطالب سلمه:
   كان findUnique بمفتاح مركب studentId_examId لكن ExamResult مفيهوش
   @@unique مركب في الـ schema → Prisma بيرمي ValidationError والـ catch
   كان بيبلعه ويرجّع null → الحارس بيفتكر إن التسليم مش موجود ويرفض
   كل تسليم جاي للأبد. الاستعلام الخام مفيهوش أي علاقة بالـ schema */
async function rowExists(table: 'ExamResult' | 'HomeworkResult', studentId: string, itemId: string): Promise<boolean> {
  try {
    var col = table === 'ExamResult' ? 'examId' : 'homeworkId'
    var rows: any[] = await (db as any).$queryRawUnsafe(
      'SELECT id FROM ' + table + ' WHERE studentId = ? AND ' + col + ' = ? LIMIT 1',
      studentId,
      itemId
    )
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    /* الجدول نفسه مش موجود أصلاً = مفيش أي تسليمات — نرجّع false عشان
       الحارس يشتغل طبيعي (التسليم الأول بيفتح اللي بعده) */
    return false
  }
}

/** الواجب بيفتح بس لو الواجب اللي قبله (نفس الصف، الأقدم الأول) متسلّم */
export async function checkHwSequential(
  homeworkId: string,
  studentId: string | null | undefined
): Promise<SeqCheckResult> {
  if (!studentId) return { ok: true }
  try {
    var hw: any = await db.homework.findUnique({ where: { id: homeworkId } })
    if (!hw) return { ok: true }
    var gradeHws: any[] = await db.homework.findMany({
      where: { grade: hw.grade },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, questions: true },
    })
    var idx = gradeHws.findIndex(function (h) { return h.id === homeworkId })
    if (idx <= 0) return { ok: true } // أول واجب مفتوح دايمًا
    for (var i = idx - 1; i >= 0; i--) {
      var prev = gradeHws[i]
      if (!hasQuestions(prev.questions)) continue // ملف بس — مش قابل للتسليم، نتخطاه
      /* (إصلاح 2026-و10) فحص خام — findUnique المركب كان بينكسر صامت */
      var done = await rowExists('HomeworkResult', studentId, prev.id)
      if (!done) {
        return {
          ok: false,
          code: 423,
          reason: 'الواجب ده هيتفتح أول ما تسلّم الواجب اللي قبله' + (prev.title ? ' — "' + prev.title + '"' : ''),
        }
      }
      break // أقرب واجب قبله قابل للتسليم اتسلّم → الفيديو ده مفتوح
    }
    return { ok: true }
  } catch (e) {
    return { ok: true }
  }
}

/** الامتحان بيفتح بس لو الامتحان اللي قبله (نفس الصف، الأقدم الأول) اتقدّم */
export async function checkExamSequential(
  examId: string,
  studentId: string | null | undefined
): Promise<SeqCheckResult> {
  if (!studentId) return { ok: true }
  try {
    var exam: any = await db.exam.findUnique({ where: { id: examId } })
    if (!exam) return { ok: true }
    var gradeExams: any[] = await db.exam.findMany({
      where: { grade: exam.grade },
      orderBy: { createdAt: 'asc' },
      select: { id: true, title: true, questions: true },
    })
    var idx = gradeExams.findIndex(function (e) { return e.id === examId })
    if (idx <= 0) return { ok: true }
    for (var i = idx - 1; i >= 0; i--) {
      var prev = gradeExams[i]
      if (!hasQuestions(prev.questions)) continue
      /* (إصلاح 2026-و10) فحص خام — findUnique المركب كان بينكسر صامت
         (ValidationError مبلوع → done دايماً null → رفض دائم) */
      var done = await rowExists('ExamResult', studentId, prev.id)
      if (!done) {
        return {
          ok: false,
          code: 423,
          reason: 'الامتحان ده هيتفتح أول ما تاخد الامتحان اللي قبله' + (prev.title ? ' — "' + prev.title + '"' : ''),
        }
      }
      break
    }
    return { ok: true }
  } catch (e) {
    return { ok: true }
  }
}
