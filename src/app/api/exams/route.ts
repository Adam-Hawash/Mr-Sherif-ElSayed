import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
function applyRandomModel(exam: any, studentId: string) {
  try {
    var models = exam && exam.models ? JSON.parse(exam.models) : []
    if (!Array.isArray(models) || models.length === 0) return exam
    var idx = pickModelIdx(exam.id, studentId, models.length)
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
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    // لو الطلب من حساب طالب → امسح له النموذج المخصص عشوائيًا
    const studentId = searchParams.get('studentId') || ''
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

    const [exams, total] = await Promise.all([
      db.exam.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.exam.count({ where }),
    ])

    // توزيع النموذج العشوائي للطالب (لو فيه نماذج) — وإلا الامتحان زي ما هو
    const outExams = studentId ? exams.map(function (e: any) { return applyRandomModel(e, studentId) }) : exams

    return NextResponse.json({ exams: outExams, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error: any) {
    console.error('Exams fetch error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, grade, filePath, fileType, questions, models, passScore, answerKeyPath, answerKeyType, thumbnail } = body

    if (!title || !grade) {
      return NextResponse.json({ error: 'Title and grade are required' }, { status: 400 })
    }

    const exam = await db.exam.create({
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
        passScore: passScore ? parseFloat(passScore) : 50,
      },
    })

    return NextResponse.json({ message: 'Exam added', exam }, { status: 201 })
  } catch (error: any) {
    console.error('Exam create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
