// @ts-nocheck
// FILE: src/app/api/books/route.ts
// (2026-و40) قايمة الكتب والملازم العامة — تاب «الكتب والملازم» في بورتال الطالب.
// ?grade= اختياري → نفس المطابقة الضبابية للصف المستخدمة في /api/homework
// (normalizeGrade + OR contains) — من غيرها بنرجّع كل الكتب.
// بنرجّع الحقول الآمنة بس (من غير أي داتا داخلية).

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

var _bookTableReady: Promise<void> | null = null
function ensureBookTable() {
  if (!_bookTableReady) {
    _bookTableReady = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Book (id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', filePath TEXT NOT NULL DEFAULT '', sourceUrl TEXT NOT NULL DEFAULT '', fileName TEXT NOT NULL DEFAULT '', fileType TEXT NOT NULL DEFAULT 'application/pdf', sizeBytes INTEGER NOT NULL DEFAULT 0, grade TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL)")
        /* (و43) ترميم دفاعي للقواعد القديمة: عمود sourceUrl الناقص بيتضاف فورًا */
        try { await db.$executeRawUnsafe("ALTER TABLE Book ADD COLUMN sourceUrl TEXT NOT NULL DEFAULT ''") } catch (e2) {}
      } catch (e) {}
    })()
  }
  return _bookTableReady
}

// Normalize grade names so old and new naming conventions match
// e.g. "الصف الثالث الاعدادي" == "تالتة إعدادي" == "الصف الثالث الإعدادي"
// (نسخة مطابقة من normalizeGrade في /api/homework — لو اتعدلت هناك تتعدل هنا)
function normalizeGrade(grade: string): string {
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

export async function GET(request: NextRequest) {
  try {
    await ensureBookTable()
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')

    const where: Record<string, unknown> = {}
    if (grade) {
      // Fuzzy grade matching: نفس فلاتر /api/homework بالظبط
      const normalizedGrade = normalizeGrade(grade)
      where.OR = [
        { grade: grade },
        { grade: normalizedGrade },
        { grade: { contains: normalizedGrade.split(' ')[0] } },
      ]
    }

    const books = await db.book.findMany({ where, orderBy: { createdAt: 'desc' } })

    /* حقول آمنة بس */
    const safeBooks = (books || []).map(function (b: any) {
      return {
        id: b.id,
        title: b.title,
        description: b.description || '',
        filePath: b.filePath || '',
        sourceUrl: b.sourceUrl || '',
        fileName: b.fileName || '',
        fileType: b.fileType || 'application/pdf',
        sizeBytes: b.sizeBytes || 0,
        grade: b.grade || '',
        createdAt: b.createdAt,
      }
    })

    return NextResponse.json({ books: safeBooks })
  } catch (error: any) {
    console.error('Public books fetch error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
