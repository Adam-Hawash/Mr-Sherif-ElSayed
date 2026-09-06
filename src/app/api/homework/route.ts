import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')

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
      where.OR = where.OR ? [...where.OR, { title: { contains: keyword } }] : [{ title: { contains: keyword } }]
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

    return NextResponse.json({ homework, total, page, pageSize, totalPages: Math.ceil(total / pageSize) })
  } catch (error: any) {
    console.error('Homework fetch error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, content, grade, filePath, fileType, answerKeyPath, answerKeyType, thumbnail, questions } = body

    if (!title || !grade) {
      return NextResponse.json({ error: 'Title and grade are required' }, { status: 400 })
    }

    const homework = await db.homework.create({
      data: { title, content: content || '', grade, filePath: filePath || '', fileType: fileType || '', thumbnail: thumbnail || '', answerKeyPath: answerKeyPath || '', answerKeyType: answerKeyType || '', questions: questions || '' },
    })

    return NextResponse.json({ message: 'Homework added', homework }, { status: 201 })
  } catch (error: any) {
    console.error('Homework create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
