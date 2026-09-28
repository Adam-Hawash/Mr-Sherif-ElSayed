// ============================================================
// FILE: src/app/api/points/route.ts
// PURPOSE: (2026-و60) تحكم المستر في نقاط كل طالب — طلب المستر حرفيًا:
//   «عاوز برضه إني أتحكم في النقاط، أتحكم في نقاط كل طالب أزود له أو
//    أخصم منه» + إظهار التراكمي القديم والجديد لكل طالب.
//   ------------------------------------------------------------
//   • GET  — كل الطلاب (المقبولين) بنقاطهم المتراكمة من الدفتر:
//       totalPoints = امتحانات + واجبات + تعديلات يدوية (كلها متراكمة للأبد)
//       + تفصيل (exam/homework/manual) + صفوف التعديلات اليدوية (للتراجع)
//   • POST — زود أو خصم: { studentId, delta, note } — delta موجب = زود،
//       سالب = خصم. بيتسجل صف دايم في الدفتر kind='manual' فبيظهر في
//       الترتيب العام أوتوماتيك (نفس /api/leaderboard SUM).
//   • DELETE — تراجع عن تعديل يدوي: { resultId } — بيشيل صف manual بس
//       (مستحيل يمسح نقاط امتحان/واجب حقيقية).
//   • ملاحظة: كاش لوحة الصدارة (60 ثانية) ممكن يتأخر بالتعديل لحظة قصيرة.
// ------------------------------------------------------------

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureLedgerTable, syncLedger, newManualLedgerId } from '@/lib/points-ledger'

// GET — نقاط كل الطلاب بالتفصيل (للوحة الأدمن)
export async function GET() {
  try {
    await syncLedger()

    // كل الطلاب المقبولين — حتى اللي نقاطهم صفر (المستر عايز يتحكم في أي طالب)
    var rows: any[] = await db.$queryRawUnsafe(
      'SELECT s.id, s.name, s.grade, s.phone, ' +
      'COALESCE(SUM(pl.points), 0) AS totalPoints, ' +
      "COALESCE(SUM(CASE WHEN pl.kind = 'exam' THEN pl.points ELSE 0 END), 0) AS examPoints, " +
      "COALESCE(SUM(CASE WHEN pl.kind = 'homework' THEN pl.points ELSE 0 END), 0) AS homeworkPoints, " +
      "COALESCE(SUM(CASE WHEN pl.kind = 'manual' THEN pl.points ELSE 0 END), 0) AS manualPoints " +
      'FROM Student s ' +
      'LEFT JOIN PointsLedger pl ON pl.studentId = s.id ' +
      "WHERE s.status IN ('approved', 'paid') " +
      'GROUP BY s.id, s.name, s.grade, s.phone ' +
      'ORDER BY totalPoints DESC, s.name ASC'
    ) || []

    // صفوف التعديلات اليدوية (عشان المستر يقدر يتراجع عن أي واحدة)
    var manualRows: any[] = await db.$queryRawUnsafe(
      'SELECT resultId, studentId, points, note, updatedAt FROM PointsLedger ' +
      "WHERE kind = 'manual' ORDER BY updatedAt DESC LIMIT 500"
    ) || []
    var manualByStudent: Record<string, any[]> = {}
    for (var i = 0; i < manualRows.length; i++) {
      var sid = String(manualRows[i].studentId || '')
      if (!manualByStudent[sid]) manualByStudent[sid] = []
      manualByStudent[sid].push({
        resultId: manualRows[i].resultId,
        points: Number(manualRows[i].points) || 0,
        note: String(manualRows[i].note || ''),
        updatedAt: manualRows[i].updatedAt,
      })
    }

    var clean = function (n: any): number {
      var v = Number(n) || 0
      var r = Math.round(v * 10) / 10
      return r % 1 === 0 ? Math.round(r) : r
    }

    var students = (rows || []).map(function (r: any) {
      var sid = String(r.id)
      return {
        id: sid,
        name: String(r.name || ''),
        grade: String(r.grade || ''),
        phone: String(r.phone || ''),
        totalPoints: clean(r.totalPoints),
        examPoints: clean(r.examPoints),
        homeworkPoints: clean(r.homeworkPoints),
        manualPoints: clean(r.manualPoints),
        manualRows: manualByStudent[sid] || [],
      }
    })

    return NextResponse.json({ students: students })
  } catch (error) {
    console.error('Points GET error:', error)
    return NextResponse.json({ students: [] })
  }
}

// POST — زود/خصم نقاط لطالب معين
export async function POST(req: NextRequest) {
  try {
    var body: any = null
    try { body = await req.json() } catch (e) {}
    var studentId = String((body && body.studentId) || '').trim()
    var delta = Number(body && body.delta)
    var note = String((body && body.note) || '').trim()

    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    if (!isFinite(delta) || delta === 0) return NextResponse.json({ error: 'قيمة النقاط مطلوبة (مش صفر)' }, { status: 400 })
    // سقف حماية من الغلط المطبعي — لو عايز أكتر يقسمها على مرتين
    if (Math.abs(delta) > 10000) return NextResponse.json({ error: 'أقصى قيمة في المرة 10000' }, { status: 400 })
    // الكسور النصفية مسموحة (الدرجات ممكن تكون عشرية) — بس لأقرب عُشر
    delta = Math.round(delta * 10) / 10

    await ensureLedgerTable()

    // الطالب لازم يكون موجود فعلًا — ممنوع نقاط لأشباح
    var st: any = await db.$queryRawUnsafe(
      'SELECT id, name FROM Student WHERE id = ? LIMIT 1', studentId
    )
    if (!st || (Array.isArray(st) && st.length === 0)) {
      return NextResponse.json({ error: 'الطالب مش موجود' }, { status: 404 })
    }

    var resultId = newManualLedgerId()
    await db.$executeRawUnsafe(
      'INSERT INTO PointsLedger (resultId, studentId, kind, points, note, updatedAt) ' +
      'VALUES (?, ?, \'manual\', ?, ?, CURRENT_TIMESTAMP)',
      resultId, studentId, delta, note || null
    )

    return NextResponse.json({ ok: true, resultId: resultId })
  } catch (error) {
    console.error('Points POST error:', error)
    return NextResponse.json({ error: 'حصل خطأ في حفظ التعديل' }, { status: 500 })
  }
}

// DELETE — تراجع عن تعديل يدوي (صفوف manual بس — النتايج الحقيقية محمية)
export async function DELETE(req: NextRequest) {
  try {
    var body: any = null
    try { body = await req.json() } catch (e) {}
    var resultId = String((body && body.resultId) || '').trim()
    if (!resultId || resultId.indexOf('manual_') !== 0) {
      return NextResponse.json({ error: 'معرف تعديل يدوي غير صحيح' }, { status: 400 })
    }
    await ensureLedgerTable()
    await db.$executeRawUnsafe(
      "DELETE FROM PointsLedger WHERE resultId = ? AND kind = 'manual'", resultId
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('Points DELETE error:', error)
    return NextResponse.json({ error: 'حصل خطأ في التراجع' }, { status: 500 })
  }
}
