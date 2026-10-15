// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// ============================================================
// (24-b منقول من Maths-Genius) نشر إعادة تسمية الصف الدراسي —
// لما الأدمن يغير اسم صف من لوحة الصفوف، الاسم الجديد لازم
// ينتشر على كل البيانات القديمة (الطلاب والفيديوهات والواجبات
// والامتحانات والإعلانات والمجتمعات والشكاوي والمدفوعات)
// عشان محتوى الصف ميبقاش «يتم» بعد التسمية.
//
// POST { renames: [{ from: 'أولى إعدادي', to: 'الصف الأول الإعدادي' }] }
// كل جدول بيتحدث لوحده بـ try/catch مستقل — لو الجدول مش موجود
// أو مفيهوش العمود بنتجاهل الفشل بصمت والباقي بيتحدث عادي.
// ============================================================

// الجداول المستهدفة: (جدول، عمود)
var GRADE_TABLES: Array<{ table: string; column: string }> = [
  { table: 'Student', column: 'grade' },
  { table: 'Video', column: 'grade' },
  { table: 'Homework', column: 'grade' },
  { table: 'Exam', column: 'grade' },
  { table: 'Announcement', column: 'grade' },
  { table: 'Discussion', column: 'grade' },
  { table: 'Complaint', column: 'grade' },
  // Payment بيخزن صف الطالب في عمود باسم مختلف
  { table: 'Payment', column: 'studentGrade' },
]

// إسكيب بسيط لقيم أسماء الصفوف جوه SQL: علامة الاقتباس الواحدة بتتضاعف
function esc(value: string): string {
  return String(value == null ? '' : value).split("'").join("''")
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var renames = body && body.renames
    if (!Array.isArray(renames) || renames.length === 0) {
      return NextResponse.json({ success: true, updated: {} })
    }

    var updated: Record<string, number> = {}

    for (var r = 0; r < renames.length; r++) {
      var item = renames[r] || {}
      var from = typeof item.from === 'string' ? item.from.trim() : ''
      var to = typeof item.to === 'string' ? item.to.trim() : ''
      // ممنوع نغير اسم فاضي أو نعمل rename لنفس الاسم
      if (!from || !to || from === to) continue

      for (var t = 0; t < GRADE_TABLES.length; t++) {
        var target = GRADE_TABLES[t]
        try {
          var sql =
            'UPDATE "' + target.table + '" SET "' + target.column + '" = \'' + esc(to) +
            '\' WHERE "' + target.column + '" = \'' + esc(from) + '\''
          var n = await db.$executeRawUnsafe(sql)
          var prev = typeof updated[target.table] === 'number' ? updated[target.table] : 0
          updated[target.table] = prev + Number(n || 0)
        } catch (e) {
          // الجدول ممكن ما يكونش موجود أو مفيهوش العمود ده — بنتجاهل ونكمل
        }
      }
    }

    return NextResponse.json({ success: true, updated: updated })
  } catch (error) {
    console.error('grades/apply-rename error:', error)
    return NextResponse.json({ error: 'Failed to apply grade rename' }, { status: 500 })
  }
}
