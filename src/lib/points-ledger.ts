// ============================================================
// FILE: src/lib/points-ledger.ts
// PURPOSE: (2026-و60) الدفتر الدايم للنقاط — استخراج منطق و58 من
//   /api/leaderboard لمكتبة مشتركة عشان /api/points (تحكم المستر
//   في نقاط كل طالب) تشتغل على نفس الدفتر بالظبط من غير تكرار كود.
//   • PointsLedger: مرآة دايمة لكل نتيجة (resultId = معرف النتيجة نفسه)
//   • أي نتيجة جديدة/معدلة بتتزامن هنا، ومسح الامتحان/الواجب مبيمسحهاش
//   • kind: 'exam' | 'homework' | 'manual' — اليدوي هو تحكم المستر
//     (زود/خصم) وresultId بتاعه 'manual_...' فمستحيل يتضارب مع النتايج
//   • note: سبب التعديل اليدوي (عمود متسامح — ALTER في try/catch)
// ------------------------------------------------------------

import { db } from '@/lib/db'

// إنشاء جدول الدفتر لو مش موجود + عمود السبب للتعديلات اليدوية
export async function ensureLedgerTable() {
  await db.$executeRawUnsafe(
    'CREATE TABLE IF NOT EXISTS PointsLedger (' +
    'resultId TEXT PRIMARY KEY, ' +
    'studentId TEXT NOT NULL, ' +
    'kind TEXT NOT NULL, ' +
    'points REAL DEFAULT 0, ' +
    'updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP)'
  )
  // (و60) عمود السبب للتعديلات اليدوية — لو موجود أصلًا الكارت بيفشل بصمت
  try {
    await db.$executeRawUnsafe('ALTER TABLE PointsLedger ADD COLUMN note TEXT')
  } catch (e) { /* العمود موجود — عادي */ }
}

// مزامنة المرآة: أي نتيجة موجودة دلوقتي في ExamResult/HomeworkResult
// بتتكتب في الدفتر (INSERT OR REPLACE = التعديلات بتتحدث نفس الصف).
// صفوف نتايج اتمسحت من المصدر (امتحان/واجب اتشال) **بتفضل** في الدفتر عمدًا.
export async function syncLedger() {
  await ensureLedgerTable()
  try {
    await db.$executeRawUnsafe(
      'INSERT OR REPLACE INTO PointsLedger (resultId, studentId, kind, points, updatedAt) ' +
      "SELECT er.id, er.studentId, 'exam', COALESCE(er.score, 0), CURRENT_TIMESTAMP " +
      'FROM ExamResult er WHERE er.studentId IS NOT NULL AND er.studentId != \'\''
    )
  } catch (e) { console.error('ledger sync exam error:', e) }
  try {
    await db.$executeRawUnsafe(
      'INSERT OR REPLACE INTO PointsLedger (resultId, studentId, kind, points, updatedAt) ' +
      "SELECT hr.id, hr.studentId, 'homework', COALESCE(hr.score, 0), CURRENT_TIMESTAMP " +
      'FROM HomeworkResult hr WHERE hr.studentId IS NOT NULL AND hr.studentId != \'\''
    )
  } catch (e) { console.error('ledger sync homework error:', e) }
  // طالب اتمسح → نقاطه تتمسح من الدفتر (ممنوع أشباح في الترتيب)
  try {
    await db.$executeRawUnsafe(
      'DELETE FROM PointsLedger WHERE studentId NOT IN (SELECT id FROM Student)'
    )
  } catch (e) { console.error('ledger ghost cleanup error:', e) }
}

// توليد معرف فريد لصف تعديل يدوي — 'manual_' prefix يضمن عدم التضارب
// مع معرفات ExamResult/HomeworkResult في أي وقت
export function newManualLedgerId(): string {
  return 'manual_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10)
}
