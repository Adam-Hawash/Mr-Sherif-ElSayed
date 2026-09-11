import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

/* (25-ب1) جدولة الظهور للواجبات — defensive ALTER بنفس نمط المشروع
   (ممنوع db:push — كل قاعدة بيانات بتترقّى تلقائيًا هنا) */
async function ensureHomeworkFeatureColumns() {
  try { await db.$executeRawUnsafe('ALTER TABLE Homework ADD COLUMN scheduledAt DATETIME') } catch (e) {}
  /* (2026-و26) استهداف الطلاب — نفس نمط الفيديوهات (VideoSchedule.studentIds) */
  try { await db.$executeRawUnsafe("ALTER TABLE Homework ADD COLUMN targetStudentIds TEXT DEFAULT ''") } catch (e) {}
}

/* (2026-و26) قراءة قايمة الاستهداف من صف */
function parseTargetIds(raw: unknown): string[] {
  try { var p = JSON.parse(String(raw || '[]')); return Array.isArray(p) ? p : [] } catch (e) { return [] }
}

// Normalize grade names so old and new naming conventions match
// e.g. "الصف الثالث الاعدادي" == "تالتة إعدادي" == "الصف الثالث الإعدادي"
function normalizeGrade(grade: string): string {
  if (!grade) return ''
  var g = grade.trim()
  // Remove "الصف " prefix
  g = g.replace(/^الصف\s+/i, '')
  // Normalize إعدادي variants
  g = g.replace(/الاعدادي/gi, 'إعدادي')
  g = g.replace(/الإعدادي/gi, 'إعدادي')
  // Normalize بكالوريا variants
  g = g.replace(/البكالوريا/gi, 'بكالوريا')
  g = g.replace(/بكالوريا/gi, 'بكالوريا')
  // Map old names to new
  if (g.includes('أولى') || g.includes('اولى') || g.includes('الأول')) g = 'أولى'
  if (g.includes('تانية') || g.includes('الثاني')) g = 'تانية'
  if (g.includes('تالتة') || g.includes('الثالث')) g = 'تالتة'
  if (g.includes('الرابع')) g = 'الرابع'
  if (g.includes('الخامس')) g = 'الخامس'
  if (g.includes('السادس')) g = 'السادس'
  // Add إعدادي/بكالوريا suffix
  if (g === 'أولى' && grade.includes('عداد')) g = 'أولى إعدادي'
  if (g === 'تانية' && grade.includes('عداد')) g = 'تانية إعدادي'
  if (g === 'تالتة' && grade.includes('عداد')) g = 'تالتة إعدادي'
  if (g === 'أولى' && grade.includes('كالور')) g = 'أولى بكالوريا'
  return g
}

export async function GET(request: NextRequest) {
  try {
    await ensureHomeworkFeatureColumns()
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    // (25-ب1) تمييز الأدمن بنفس النمط الموجود في المشروع (adminId + isAdmin
    // زي /api/videos بالظبط) — الأدمن بس اللي يشوف العناصر المجدولة
    const adminId = searchParams.get('adminId')
    const admin = await isAdmin(adminId)
    /* (2026-و26) طالب محدد؟ (للفلترة حسب الاستهداف) */
    const studentId = searchParams.get('studentId') || ''

    const where: Record<string, unknown> = {}
    if (grade) {
      // Fuzzy grade matching: normalize both sides
      const normalizedGrade = normalizeGrade(grade)
      where.OR = [
        { grade: grade },                                    // exact match
        { grade: normalizedGrade },                           // normalized match
        { grade: { contains: normalizedGrade.split(' ')[0] } }, // contains first word (e.g. "تالتة")
      ]
      // Also match if the homework grade contains the normalized grade's first word
      // This handles cases like "تالتة إعدادي" matching "الصف الثالث الاعدادي"
    }
    if (keyword) {
      where.OR = where.OR ? [...(where.OR as unknown[]), { title: { contains: keyword } }] : [{ title: { contains: keyword } }]
    }
    /* (25-ب1) جدولة الظهور: أي واجب موعده في المستقبل **متنزلش**
       لأي طلب مش من أدمن (الطالب/الزائر) — هو بس اللي يشوفه (ببادج مجدول).
       الفلتر الافتراضي = أمان: لو مفيش إثبات أدمن الرد نضيف. */
    if (!admin) {
      where.AND = [{ OR: [{ scheduledAt: null }, { scheduledAt: { lte: new Date() } }] }]
    }

    const [homework, total] = await Promise.all([
      db.homework.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.homework.count({ where }),
    ])

    /* (2026-و26) استهداف الطلاب (نفس نمط الفيديوهات): الواجب الموجه
       لطلاب محددين مش بيوصل غير للي اسمه في القايمة — فلترة على السيرفر */
    let visibleHw = homework as unknown as any[]
    if (!admin) {
      visibleHw = visibleHw.filter(function (h) {
        var t = parseTargetIds(h && (h as any).targetStudentIds)
        return t.length === 0 || (!!studentId && t.indexOf(studentId) !== -1)
      })
    }

    /* (25-ب1) للأدمن بس: بادج «مجدول» — العناصر اللي موعدها في المستقبل
       بترجع مع flag scheduled: true عشان اللوحة تعرضها بوضوح */
    const outHomework = admin
      ? visibleHw.map(function (h: any) {
          var isScheduled = h && h.scheduledAt ? new Date(h.scheduledAt).getTime() > Date.now() : false
          return { ...h, scheduled: isScheduled }
        })
      : visibleHw

    return NextResponse.json({ homework: outHomework, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error: any) {
    console.error('Homework fetch error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureHomeworkFeatureColumns()
    const body = await request.json()
    const { title, content, grade, filePath, fileType, answerKeyPath, answerKeyType, thumbnail, questions, scheduledAt, targetStudentIds } = body

    if (!title || !grade) {
      return NextResponse.json({ error: 'Title and grade are required' }, { status: 400 })
    }

    /* (25-ب1) موعد ظهور الواجب للطلاب (اختياري) — null/فاضي = يظهر فورًا */
    var scheduledDate: Date | null = null
    if (scheduledAt) {
      try {
        var d = new Date(String(scheduledAt))
        if (!isNaN(d.getTime())) scheduledDate = d
      } catch (e) {}
    }

    /* (2026-و26) استهداف الطلاب: array ids → JSON string (فاضي = الكل) */
    var targetIds = '[]'
    if (targetStudentIds !== undefined && targetStudentIds !== null) {
      var tArr: unknown[] = []
      if (Array.isArray(targetStudentIds)) tArr = targetStudentIds
      else { try { var tp = JSON.parse(String(targetStudentIds)); if (Array.isArray(tp)) tArr = tp } catch (e) {} }
      var tClean = tArr.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
      tClean = tClean.filter(function (x: string, i: number) { return tClean.indexOf(x) === i })
      targetIds = JSON.stringify(tClean)
    }

    const homework = await safeWrite(function () {
      return db.homework.create({
        data: { title, content: content || '', grade, filePath: filePath || '', fileType: fileType || '', thumbnail: thumbnail || '', answerKeyPath: answerKeyPath || '', answerKeyType: answerKeyType || '', questions: questions || '', scheduledAt: scheduledDate, targetStudentIds: targetIds },
      })
    })

    return NextResponse.json({ message: 'Homework added', homework }, { status: 201 })
  } catch (error: any) {
    console.error('Homework create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
