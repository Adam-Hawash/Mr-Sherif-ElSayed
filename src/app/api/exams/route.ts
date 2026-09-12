import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

/* (25-ب1) أعمدة الميزات الجديدة (إظهار الإجابات / المؤقت / جدولة الظهور) —
   defensive ALTERs بنفس نمط الكود في المشروع: لو العمود موجود الأصلًا
   الفشل بيتجاهل بصمت. ممنوع db:push — كل قاعدة بيانات بتترقّى تلقائيًا هنا. */
/* (2026-و29) كاش على مستوى الموديول: كل ALTER = نداء شبكة لقاعدة البيانات — تنفيذها في كل ريكوست كان بيدفع نداءات ضاية في كل تحميل (من أكبر أسباب بطء المنصة) — دلوقتي مرة واحدة لكل instance */
var _examColsReady: Promise<void> | null = null
async function ensureExamFeatureColumns() {
  if (!_examColsReady) {
    _examColsReady = (async function () {
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN showResult INTEGER DEFAULT 0') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN timeLimitMin INTEGER DEFAULT 0') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN scheduledAt DATETIME') } catch (e) {}
  try { await db.$executeRawUnsafe('ALTER TABLE Homework ADD COLUMN scheduledAt DATETIME') } catch (e) {}
  /* (2026-و26) استهداف الطلاب — نفس نمط الفيديوهات (VideoSchedule.studentIds):
     JSON array من ids الطلاب — فاضي = الكل يشوفه */
  try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetStudentIds TEXT DEFAULT ''") } catch (e) {}
  /* (2026-و29) استهداف المجموعات — نفس النمط: JSON array بids المجموعات */
  try { await db.$executeRawUnsafe("ALTER TABLE Exam ADD COLUMN targetGroupIds TEXT DEFAULT ''") } catch (e) {}
})()
  }
  await _examColsReady
}

/* (2026-و26) تطبيع قايمة الطلاب المستهدفين — بتوصل array أو JSON string
   والخروج JSON string نظيفة (بدون تكرار). undefined = مش متغيرة */
function normalizeTargetIds(v: unknown): string | undefined {
  if (v === undefined || v === null) return undefined
  var arr: unknown[] = []
  if (Array.isArray(v)) arr = v
  else {
    try { var p = JSON.parse(String(v)); if (Array.isArray(p)) arr = p } catch (e) { return '[]' }
  }
  var clean = arr.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
  clean = clean.filter(function (x, i) { return clean.indexOf(x) === i })
  return JSON.stringify(clean)
}

/* (2026-و26) قراءة قايمة الاستهداف من صف */
function parseTargetIds(raw: unknown): string[] {
  try { var p = JSON.parse(String(raw || '[]')); return Array.isArray(p) ? p : [] } catch (e) { return [] }
}

// Normalize grade names so old and new naming conventions match
function normalizeGrade(grade: string): string {
  if (!grade) return ''
  var g = grade.trim()
  g = g.replace(/^الصف\s+/i, '')
  g = g.replace(/الاعدادي/gi, 'إعدادي').replace(/الإعدادي/gi, 'إعدادي')
  g = g.replace(/البكالوريا/gi, 'بكالوريا')
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

// ============================================================
// توزيع النماذج العشوائي (طلب المستر): لما الامتحان يكون فيه نماذج كتير
// (نموذج أ / نموذج ب ...) الطالب بيشوف **نموذج واحد بس** — عشوائي لكن
// **ثابت لحسابه** (نفس الطالب + نفس الامتحان = نفس النموذج دايمًا،
// مفيش إعادة لف لحد ما يلاقي النموذج السهل).
// الاختيار بيبقى **على السيرفر** — أسئلة النماذج التانية مش بتوصل للطالب أصلًا.
// ============================================================
function pickModelIdx(examId: string, studentId: string, n: number): number {
  var s = String(examId) + '|' + String(studentId)
  var h = 5381
  for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0
  return n > 0 ? h % n : 0
}
function applyModelForStudent(exam: any, studentId: string) {
  try {
    var models = exam && exam.models ? JSON.parse(exam.models) : []
    if (!Array.isArray(models) || models.length === 0) return exam
    /* (2026-و) طلب المستر: "ما يكونش أساسًا إنه عشوائي — ممكن أحط عشوائي
       ممكن أحط نموذج واحد بس" → لو المستر اختار "نموذج ثابت" كل الطلاب
       بيشوفوا **نفس النموذج** اللي هو حدده (fixedModel)، ولو عشوائي
       يفضل الوضع القديم (نموذج ثابت لكل حساب بالهاش) */
    var idx = -1
    if (exam.modelMode === 'fixed' && exam.fixedModel) {
      for (var f = 0; f < models.length; f++) {
        if (models[f] && models[f].name === exam.fixedModel) { idx = f; break }
      }
      if (idx < 0) idx = 0 /* النموذج المحدد اتمسح → الأول */
    } else {
      idx = pickModelIdx(exam.id, studentId, models.length)
    }
    var m = models[idx]
    if (!m) return exam
    // **مهم**: بنشيل حقل النماذج كله من الرد — أسئلة النماذج التانية
    // ما بتوصلش للطالب أصلًا (مفصولين فعليًا مش شكليًا)
    var out: any = { ...exam }
    delete out.models
    return {
      ...out,
      questions: m.questions ? (typeof m.questions === 'string' ? m.questions : JSON.stringify(m.questions)) : exam.questions,
      filePath: m.filePath || '',
      fileType: m.fileType || '',
      modelName: m.name || ('النموذج ' + (idx + 1)),
      modelsCount: models.length,
    }
  } catch (e) {
    return exam
  }
}

export async function GET(request: NextRequest) {
  try {
    await ensureExamFeatureColumns()
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    // لو الطلب من حساب طالب → امسح له النموذج المخصص عشوائيًا
    const studentId = searchParams.get('studentId') || ''
    // (25-ب1) تمييز الأدمن بنفس النمط الموجود في المشروع (adminId + isAdmin
    // زي /api/videos بالظبط) — الأدمن بس اللي يشوف العناصر المجدولة
    const adminId = searchParams.get('adminId')
    const admin = await isAdmin(adminId)
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

    const where: Record<string, unknown> = {}
    if (grade) {
      const normalizedGrade = normalizeGrade(grade)
      where.OR = [
        { grade: grade },
        { grade: normalizedGrade },
        { grade: { contains: normalizedGrade.split(' ')[0] } },
      ]
    }
    if (keyword) {
      where.OR = where.OR ? [...(where.OR as unknown[]), { title: { contains: keyword } }] : [{ title: { contains: keyword } }]
    }
    /* (25-ب1) جدولة الظهور: أي امتحان موعده في المستقبل **متنزلش**
       لأي طلب مش من أدمن (الطالب/الزائر) — هو بس اللي يشوفها (ببادج مجدول).
       الفلتر الافتراضي = أمان: لو مفيش إثبات أدمن الرد نضيف. */
    if (!admin) {
      where.AND = [{ OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }]
    }

    const [exams, total] = await Promise.all([
      db.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.exam.count({ where }),
    ])

    /* (2026-و26) استهداف الطلاب (نفس نمط الفيديوهات): الامتحان الموجه
       لطلاب محددين **مش بيوصل** غير للي اسمه في القايمة — الفلتر هنا
       على السيرفر فمفيش أي بيانات بتسرب للطالب المستبعد */
    let visibleExams = exams as unknown as any[]
    if (!admin) {
      /* (2026-و29) مجموعة الطالب — نداء واحد رخيص (فاضي لو مفيش مجموعة) */
      var studentGroup = ''
      if (studentId) {
        try {
          var sgRows = await db.$queryRawUnsafe('SELECT groupId FROM Student WHERE id = ? LIMIT 1', studentId) as any[]
          if (sgRows && sgRows.length > 0) studentGroup = String(sgRows[0].groupId || '')
        } catch (sgErr) {}
      }
      visibleExams = visibleExams.filter(function (e) {
        var t = parseTargetIds(e && (e as any).targetStudentIds)
        var g = parseTargetIds(e && (e as any).targetGroupIds)
        /* (2026-و29) من غير استهداف = الكل — لو فيه استهداف طلاب أو مجموعات:
           الطالب يشوفه لو اسمه في قايمة الطلاب أو مجموعته في قايمة المجموعات */
        if (t.length === 0 && g.length === 0) return true
        var byStudent = !!studentId && t.indexOf(studentId) !== -1
        var byGroup = !!studentGroup && g.indexOf(studentGroup) !== -1
        return byStudent || byGroup
      })
    }

    // توزيع النموذج للطالب (عشوائي ثابت أو نموذج واحد ثابت للكل حسب اختيار
    // المستر) — وإلا الامتحان زي ما هو
    let outExams = studentId ? visibleExams.map(function (e: any) { return applyModelForStudent(e, studentId) }) : visibleExams

    /* (25-ب1) للأدمن بس: بادج «مجدول» — العناصر اللي موعدها في المستقبل
       بترجع مع flag scheduled: true عشان اللوحة تعرضها بوضوح */
    if (admin) {
      outExams = (outExams as any[]).map(function (e: any) {
        var isScheduled = e && e.scheduledAt ? new Date(e.scheduledAt).getTime() > Date.now() : false
        return { ...e, scheduled: isScheduled }
      })
    }

    return NextResponse.json({ exams: outExams, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error: any) {
    console.error('Exams fetch error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureExamFeatureColumns()
    const body = await request.json()
    const { title, content, grade, filePath, fileType, questions, models, modelMode, fixedModel, passScore, answerKeyPath, answerKeyType, thumbnail, showResult, timeLimitMin, scheduledAt, targetStudentIds, targetGroupIds } = body

    if (!title || !grade) {
      return NextResponse.json({ error: 'Title and grade are required' }, { status: 400 })
    }

    /* (25-ب1) إعدادات الامتحان الجديدة:
       - showResult: إظهار الإجابات/النتيجة للطالب بعد التسليم (افتراضي مغطّأ)
       - timeLimitMin: مؤقت بالدقائق — 0 أو فاضي = بلا وقت
       - scheduledAt: موعد ظهور للطلاب (ISO string أو null = يظهر فورًا) */
    var scheduledDate: Date | null = null
    if (scheduledAt) {
      try {
        var d = new Date(String(scheduledAt))
        if (!isNaN(d.getTime())) scheduledDate = d
      } catch (e) {}
    }
    var timeLimit = parseInt(String(timeLimitMin === undefined || timeLimitMin === null || timeLimitMin === '' ? '0' : timeLimitMin), 10)
    if (isNaN(timeLimit) || timeLimit < 0) timeLimit = 0

    /* (2026-و26) استهداف الطلاب: array ids → JSON string (فاضي = الكل) */
    var targetIds = normalizeTargetIds(targetStudentIds)
    if (targetIds === undefined) targetIds = '[]'
    /* (2026-و29) استهداف المجموعات — نفس التطبيع بالظبط */
    var targetGids = normalizeTargetIds(targetGroupIds)
    if (targetGids === undefined) targetGids = '[]'

    const exam = await safeWrite(function () {
      return db.exam.create({
        data: {
          title,
          content: content || '',
          grade,
          filePath: filePath || '',
          fileType: fileType || '',
          answerKeyPath: answerKeyPath || '',
          answerKeyType: answerKeyType || '',
          thumbnail: thumbnail || '',
          questions: questions || '',
          models: models || '',
          modelMode: modelMode === 'fixed' ? 'fixed' : 'random',
          fixedModel: (modelMode === 'fixed' && fixedModel) ? String(fixedModel) : '',
          passScore: passScore ? parseFloat(passScore) : 50,
          showResult: showResult === true || showResult === 'true' || showResult === 1,
          timeLimitMin: timeLimit,
          scheduledAt: scheduledDate,
          targetStudentIds: targetIds,
          targetGroupIds: targetGids,
        },
      })
    })

    return NextResponse.json({ message: 'Exam added', exam }, { status: 201 })
  } catch (error: any) {
    console.error('Exam create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
