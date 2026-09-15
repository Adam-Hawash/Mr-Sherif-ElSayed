// ============================================================
// SEQUENTIAL GUARD — الترتيب التسلسلي للواجبات والامتحانات
// ============================================================
// (طلب المستر — نفس نظام الفيديوهات بالظبط)
// الواجب/الامتحان مينفعش يتفتح غير لما اللي قبله يتسلّم/يتقدّم.
// الترتيب: من الأقدم للأحدث (ترتيب النزول على المنصة نفسه).
// العناصر اللي مش قابلة للتسليم (من غير أسئلة — ملف بس) بتتخطى
// عشان التسلسل ميقلعش على حاجة الطالب مش قادر يسلمها.
//
// (2026-و40) إعادة كتابة من الجذر — سبب علة «الطالب سلّم الواجب الأول
// وبيتقاله سلّمه»:
//   1) السلسلة كانت كل الواجبات اللي grade بتاعها **مساوي حرفيًا** لصف
//      الواجب الحالي — من غير نفس فلاتر قايمة الطالب (تطابق الصف الضبابي
//      normalizeGrade + استهداف الطلاب/المجموعات + إخفاء المجدول مستقبلًا)
//      فكان بيحسب في "اللي قبله" عناصر الطالب مش شايفها أصلًا — والقايمة
//      على الشاشة والسيرفر بقوا بيشوفوا سلسلتين مختلفتين.
//   2) أي خطأ قاعدة بيانات وقت فحص التسليم كان بيرجّع "مش مسلّم" → قفل
//      423 لطالب بريء سلّم فعلًا. دلوقتي: **fail-open** — أي خطأ في فحص
//      تسليم سابق = نتعامل معاه كأنه مسلّم (console.warn + نكمل).
// الشين السيرفري دلوقتي بيطابق حرفيًا قايمة /api/homework و /api/exams
// اللي الطالب شايفها (نفس الفلاتر بنفس الترتيب) — فاللي شايفه هو اللي
// بيتحسب عليه، ولا حاجة تانية.
// الرد {ok,code,reason} + التوصيل 423 في مسارَي التسليم زي ما هما بالظبط.
// ============================================================
import { db, withRetry } from '@/lib/db'

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

/* (إصلاح 2026-و10 + تعزيز 2026-و40) الفحص الخام مباشرة من الداتابيز — سبب علة
   «الامتحان ده مش هيتسلم غير لما تاخد اللي قبله» رغم إن الطالب سلمه:
   كان findUnique بمفتاح مركب studentId_examId لكن ExamResult مفيهوش
   @@unique مركب في الـ schema → Prisma بيرمي ValidationError والـ catch
   كان بيبلعه ويرجّع null → الحارس بيفتكر إن التسليم مش موجود ويرفض
   كل تسليم جاي للأبد. الاستعلام الخام مفيهوش أي علاقة بالـ schema.
   (2026-و40) + غلاف withRetry (SQLITE_BUSY/انقطاع لحظي) + **fail-open**:
   أي خطأ بعد المعاودة = نرجّع true (اتعامل مع التسليم كأنه موجود) —
   ده اللي كان بيحصل بالعكس (false → قفل طالب بريء). الجدول نفسه مش موجود
   أصلاً بيدخل نفس المسار: ممنوع نمنع طالب على خطأ داخلي، ومسار التسليم
   بيعمل ensureTable بنفسه قبل الحارس. */
async function rowExists(table: 'ExamResult' | 'HomeworkResult', studentId: string, itemId: string): Promise<boolean> {
  var col = table === 'ExamResult' ? 'examId' : 'homeworkId'
  try {
    var rows: any[] = await withRetry(function () {
      return (db as any).$queryRawUnsafe(
        'SELECT id FROM ' + table + ' WHERE studentId = ? AND ' + col + ' = ? LIMIT 1',
        studentId,
        itemId
      )
    }, 3, 300)
    return Array.isArray(rows) && rows.length > 0
  } catch (e) {
    /* (2026-و40) fail-open — كانت ترجّع false فتقفل الطالب رغم إنه سلّم */
    console.warn('[SequentialGuard] rowExists failed — failing OPEN (' + table + ' ' + itemId + '):', e)
    return true
  }
}

/* (2026-و40) تطبيع الصف — نسخة مطابقة من normalizeGrade المعرّفة محليًا جوه
   /api/homework و /api/exams (مش في lib مشترك — لو اتعدلت هناك لازم تتعدل هنا)
   عشان السلسلة السيرفرية تطابق قايمة الطالب بنفس منطق المطابقة الضبابية */
function normalizeGradeSeq(grade: string): string {
  if (!grade) return ''
  var g = grade.trim()
  g = g.replace(/^الصف\s+/i, '')
  g = g.replace(/الاعدادي/gi, 'إعدادي')
  g = g.replace(/الإعدادي/gi, 'إعدادي')
  g = g.replace(/البكالوريا/gi, 'بكالوريا')
  g = g.replace(/بكالوريا/gi, 'بكالوريا')
  if (g.includes('أولى') || g.includes('اولى') || g.includes('الأول')) g = 'أولى'
  if (g.includes('تانية') || g.includes('الثاني')) g = 'تانية'
  if (g.includes('تالتة') || g.includes('الثالث')) g = 'تالتة'
  if (g.includes('الرابع')) g = 'الرابع'
  if (g.includes('الخامس')) g = 'الخامس'
  if (g.includes('السادس')) g = 'السادس'
  if (g === 'أولى' && grade.includes('عداد')) g = 'أولى إعدادي'
  if (g === 'تانية' && grade.includes('عداد')) g = 'تانية إعدادي'
  if (g === 'تالتة' && grade.includes('عداد')) g = 'تالتة إعدادي'
  if (g === 'أولى' && grade.includes('كالور')) g = 'أولى بكالوريا'
  return g
}

/* (2026-و40) قراءة قايمة الاستهداف — نفس parseTargetIds في مسارَي القايمة */
function parseTargetIds(raw: unknown): string[] {
  try { var p = JSON.parse(String(raw || '[]')); return Array.isArray(p) ? p : [] } catch (e) { return [] }
}

/* مجموعة الطالب — نفس استعلام القايمتين بالظبط (نداء واحد رخيص، فاضي لو مفيش) */
async function studentGroupOf(studentId: string): Promise<string> {
  try {
    var rows: any[] = await (db as any).$queryRawUnsafe('SELECT groupId FROM Student WHERE id = ? LIMIT 1', studentId)
    if (rows && rows.length > 0) return String(rows[0].groupId || '')
  } catch (e) {}
  return ''
}

/* (2026-و40) نفس فلتر الاستهداف في /api/homework و /api/exams حرفيًا:
   من غير استهداف = الكل — فيه استهداف طلاب/مجموعات = اسمه في الطلاب
   أو مجموعته في المجموعات بس */
function isVisibleToStudent(item: any, studentId: string, groupId: string): boolean {
  var t = parseTargetIds(item && item.targetStudentIds)
  var g = parseTargetIds(item && item.targetGroupIds)
  if (t.length === 0 && g.length === 0) return true
  var byStudent = !!studentId && t.indexOf(studentId) !== -1
  var byGroup = !!groupId && g.indexOf(groupId) !== -1
  return byStudent || byGroup
}

/* (2026-و40) الإخفاء المجدول — نفس سطر القايمتين: أي عنصر موعده في المستقبل
   مش موجود في قايمة الطالب أصلًا فمش بيدخل في التسلسل (زي isExamScheduledAhead
   على العميل بالظبط) */
function isScheduledAhead(item: any): boolean {
  try {
    var s = item && item.scheduledAt ? new Date(item.scheduledAt).getTime() : 0
    return !!s && s > Date.now()
  } catch (e) { return false }
}

/* (2026-و40) سلسلة العناصر المرئية لنفس الصف — **نفس فلاتر قايمة الطالب
   بالترتيب**: تطابق الصف الضبابي (exact + normalized + يحتوي أول كلمة —
   نفس where.OR في القايمتين) ← إخفاء المجدول ← فلتر الاستهداف ← تخطي
   اللي ملوش أسئلة — ومرتبة من الأقدم للأحدث زي orderedHw/orderedExams.
   أي فشل في تحميل السلسلة نفسها = فاضي = مفيش "قبله" = فتح (fail-open). */
async function loadVisibleChain(
  kind: 'homework' | 'exam',
  grade: string,
  studentId: string
): Promise<any[]> {
  var table = kind === 'homework' ? 'Homework' : 'Exam'
  var normalized = normalizeGradeSeq(grade)
  var firstWord = String(normalized || grade || '').trim().split(' ')[0] || ''
  var rows: any[] = []
  try {
    rows = await withRetry(function () {
      return (db as any).$queryRawUnsafe(
        'SELECT id, title, questions, scheduledAt, targetStudentIds, targetGroupIds FROM ' + table +
        ' WHERE grade = ? OR grade = ? OR grade LIKE ? ORDER BY createdAt ASC',
        grade, normalized, '%' + firstWord + '%'
      )
    }, 3, 300) as any[]
  } catch (e) {
    console.warn('[SequentialGuard] chain load failed — failing OPEN (' + table + '):', e)
    return []
  }
  if (!Array.isArray(rows)) return []
  var groupId = await studentGroupOf(studentId)
  return rows.filter(function (item: any) {
    if (isScheduledAhead(item)) return false
    if (!isVisibleToStudent(item, studentId, groupId)) return false
    if (!hasQuestions(item.questions)) return false // ملف بس — مش قابل للتسليم، نتخطاه
    return true
  })
}

/** الواجب بيفتح بس لو الواجب اللي قبله (نفس قايمة الطالب المرئية، الأقدم الأول) متسلّم */
export async function checkHwSequential(
  homeworkId: string,
  studentId: string | null | undefined
): Promise<SeqCheckResult> {
  if (!studentId) return { ok: true }
  try {
    var hw: any = null
    try {
      var hwRows: any[] = await withRetry(function () {
        return (db as any).$queryRawUnsafe('SELECT id, title, grade FROM Homework WHERE id = ? LIMIT 1', homeworkId)
      }, 3, 300)
      hw = hwRows && hwRows.length > 0 ? hwRows[0] : null
    } catch (e) {
      /* فشل قراءة الواجب نفسه = مفيش سلسلة نقدر نتحكم بيها → فتح */
      console.warn('[SequentialGuard] target homework load failed — failing OPEN:', e)
      return { ok: true }
    }
    if (!hw) return { ok: true }
    var chain = await loadVisibleChain('homework', String(hw.grade || ''), studentId)
    var idx = chain.findIndex(function (h) { return h.id === homeworkId })
    if (idx <= 0) return { ok: true } // أول واجب مفتوح دايمًا
    for (var i = idx - 1; i >= 0; i--) {
      var prev = chain[i]
      /* (إصلاح 2026-و10) فحص خام — findUnique المركب كان بينكسر صامت
         (2026-و40) + retry + fail-open جوه rowExists نفسها */
      var done = await rowExists('HomeworkResult', studentId, prev.id)
      if (!done) {
        return {
          ok: false,
          code: 423,
          reason: 'الواجب ده هيتفتح أول ما تسلّم الواجب اللي قبله' + (prev.title ? ' — "' + prev.title + '"' : ''),
        }
      }
      break // أقرب واجب قبله قابل للتسليم اتسلّم → الواجب ده مفتوح
    }
    return { ok: true }
  } catch (e) {
    /* (2026-و40) fail-open نهائي — أي خطأ غير متوقع ممنوع يقفل طالب بريء */
    console.warn('[SequentialGuard] checkHwSequential failed — failing OPEN:', e)
    return { ok: true }
  }
}

/** الامتحان بيفتح بس لو الامتحان اللي قبله (نفس قايمة الطالب المرئية، الأقدم الأول) اتقدّم */
export async function checkExamSequential(
  examId: string,
  studentId: string | null | undefined
): Promise<SeqCheckResult> {
  if (!studentId) return { ok: true }
  try {
    var exam: any = null
    try {
      var examRows: any[] = await withRetry(function () {
        return (db as any).$queryRawUnsafe('SELECT id, title, grade FROM Exam WHERE id = ? LIMIT 1', examId)
      }, 3, 300)
      exam = examRows && examRows.length > 0 ? examRows[0] : null
    } catch (e) {
      console.warn('[SequentialGuard] target exam load failed — failing OPEN:', e)
      return { ok: true }
    }
    if (!exam) return { ok: true }
    var chain = await loadVisibleChain('exam', String(exam.grade || ''), studentId)
    var idx = chain.findIndex(function (e2) { return e2.id === examId })
    if (idx <= 0) return { ok: true }
    for (var i = idx - 1; i >= 0; i--) {
      var prev = chain[i]
      /* (إصلاح 2026-و10) فحص خام — findUnique المركب كان بينكسر صامت
         (ValidationError مبلوع → done دايماً null → رفض دائم)
         (2026-و40) + retry + fail-open جوه rowExists نفسها */
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
    console.warn('[SequentialGuard] checkExamSequential failed — failing OPEN:', e)
    return { ok: true }
  }
}
