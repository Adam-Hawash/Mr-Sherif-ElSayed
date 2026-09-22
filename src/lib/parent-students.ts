// @ts-nocheck
/* ============================================================
   (2026-و79) حساب ولي الأمر بعدة أبناء — طلب المستر الحرفي:
   «بعد ما ولي الأمر يعمل حساب، عنده ابني ثاني يدوس إضافة طالب
   ويحط بيانات الطالب الثاني ويفضل يدوس إضافة طالب — والحساب
   الواحد فيه كل الطلاب دول مدموجين مع بعض»
   - جدول ParentStudent (parentId ↔ studentId) — الابن الأول بيفضل
     في Parent.studentId (توافق كامل مع النظام القديم)
   - أي API لولي الأمر بيقبّل ?studentId= عشان يختار ابن من أبنائه
     (بعد التأكد إن الابن ده فعلًا ليه)
   ============================================================ */
import { db } from '@/lib/db'

var parentStudentDdlDone: Promise<void> | null = null

export function ensureParentStudentTable(): Promise<void> {
  if (!parentStudentDdlDone) {
    parentStudentDdlDone = (async function () {
      await db.$executeRawUnsafe(
        'CREATE TABLE IF NOT EXISTS ParentStudent (id TEXT PRIMARY KEY, parentId TEXT NOT NULL, studentId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(parentId, studentId))'
      )
      try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_ps_parent ON ParentStudent(parentId)') } catch (e) {}
      try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_ps_student ON ParentStudent(studentId)') } catch (e) {}
    })().catch(function () {
      parentStudentDdlDone = null
    })
  }
  return parentStudentDdlDone
}

export function normPhone(v: any): string {
  var s = String(v || '').replace(/[^\d]/g, '')
  if (s.length > 11 && s.indexOf('20') === 0) s = '0' + s.slice(2)
  if (s.length === 10 && s.indexOf('1') === 0) s = '0' + s
  return s
}

export function normName(v: any): string {
  return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase()
}

export function normPwd(v: any): string {
  return String(v || '').trim()
}

/* كل أبناء ولي الأمر — الأقدم الأول (الابن الأول من Parent.studentId دايمًا الأول) */
export async function listParentStudents(parent: any): Promise<any[]> {
  var out: any[] = []
  var seen: Record<string, boolean> = {}
  async function push(studentId: string) {
    var sid = String(studentId || '')
    if (!sid || seen[sid]) return
    try {
      var s = await db.student.findUnique({ where: { id: sid } })
      if (s) { seen[sid] = true; out.push(s) }
    } catch (e) {}
  }
  await push(parent.studentId)
  try {
    await ensureParentStudentTable()
    var rows: any[] = await db.$queryRawUnsafe('SELECT studentId FROM ParentStudent WHERE parentId = ? ORDER BY createdAt ASC', parent.id)
    for (var i = 0; i < (rows || []).length; i++) await push(rows[i].studentId)
  } catch (e) {}
  return out
}

/* الابن المطلوب في الطلب — بـ studentId من الـ query، أو الابن الأول */
export async function resolveParentStudent(parent: any, studentIdParam: string): Promise<{ students: any[]; selected: any }> {
  var students = await listParentStudents(parent)
  var selected: any = null
  var want = String(studentIdParam || '').trim()
  if (want) {
    for (var i = 0; i < students.length; i++) {
      if (String(students[i].id) === want) { selected = students[i]; break }
    }
  }
  if (!selected && students.length > 0) selected = students[0]
  return { students: students, selected: selected }
}

/* ربط ابن جديد بحساب ولي الأمر — idempotent */
export async function linkParentStudent(parentId: string, studentId: string): Promise<void> {
  await ensureParentStudentTable()
  var existing: any[] = await db.$queryRawUnsafe(
    'SELECT id FROM ParentStudent WHERE parentId = ? AND studentId = ? LIMIT 1',
    parentId, studentId
  )
  if (existing && existing.length > 0) return
  await db.$executeRawUnsafe(
    'INSERT INTO ParentStudent (id, parentId, studentId, createdAt, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
    'ps_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9),
    parentId,
    studentId
  )
}
