// @ts-nocheck
// FILE: src/app/api/leaderboard/route.ts
// PURPOSE: (2026-و16) لوحة شرف عامة — طلب المستر حرفيًا: «الصفحة الرئيسية خالص…
//   من غير تسجيل دخول — أول 3 طلاب من حيث عدد النقاط اللي معاهم».
//   • GET بدون أي توثيق — بتشتغل من صفحة الهبوط مباشرة
//   • النقاط = مجموع درجات الامتحانات (ExamResult.score) + مجموع درجات الواجبات
//     (HomeworkResult.score) — نفس أرقام لوحة الأدمن بالظبط
//   • خصوصية: ممنوع التليفون أو الإيميل أو أي بيانات شخصية — الاسم بس زي ما الطالب كاتبه
//     (2026-و21: تعديل بطلب المستر — الاسم كامل زي ما هو كاتبه مش كلمتين)
//   • الطلاب المقبولين بس (approved/paid)
//
//   (2026-و58) دفتر النقاط الدايم — طلب المستر حرفيًا:
//   «لما أنزل واجب جديد أو امتحان جديد النقط ما تتمسحش وتتعاد من الأول،
//    لا النقط تتضاف على الأولانية — عشان النقط تبقى كبيرة»
//   ------------------------------------------------------------
//   المشكلة: النقاط كانت بتتحسب مباشرة من ExamResult/HomeworkResult —
//   ودي جداول مربوطة بالامتحان/الواجب نفسه بحذف متسلسل (Cascade)،
//   فأول ما المستر يمسح امتحان/واجب قديم (حتى لو عشان ينزل واحد جديد
//   مكانه) كل نتايجه بتتمسح ودرجات الطلاب بتقل فجأة.
//   الحل: جدول PointsLedger — مرآة دايمة لكل نتيجة (بمعرّف النتيجة نفسه).
//   • أي نتيجة جديدة/معدلة (إعادة تصحيح/تصحيح مقالي) بتتحدّث في المرآة
//   • مسح الامتحان/الواجب **مش بيمسح** نقاطه من الدفتر — النقاط بتضل متراكمة
//   • مسح الطالب بيمسح نقاطه هو بس (عشان مفيش أشباح في الترتيب)
//   • امتحان جديد الطلاب يحلوه = نقاط جديدة بتتجمع فوق القديمة (تراكمي)

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureLedgerTable, syncLedger } from '@/lib/points-ledger'

// كاش داخلي بسيط (60 ثانية) — الصفحة الرئيسية بتتفتح كتير ومفيش داعي نضرب
// الداتابيز بكل زيارة. نفس نمط الكاش المحلي في باقي المنصة.
// (و60: منطق الدفتر نفسه اتنقل لـ lib/points-ledger.ts عشان يتشارك مع /api/points)
var CACHE_TTL_MS = 60000
var cachedAt = 0
var cachedRows: any[] | null = null

export async function GET() {
  // رد الكاش لو لسه صالح
  try {
    if (cachedRows && Date.now() - cachedAt < CACHE_TTL_MS) {
      return NextResponse.json({ leaderboard: cachedRows })
    }
  } catch (e) {}

  try {
    await syncLedger()

    var rows: any[] = await db.$queryRawUnsafe(
      'SELECT s.id, s.name, s.grade, COALESCE(SUM(pl.points), 0) AS totalPoints ' +
      'FROM PointsLedger pl ' +
      'INNER JOIN Student s ON s.id = pl.studentId ' +
      "WHERE s.status IN ('approved', 'paid') " +
      'GROUP BY s.id, s.name, s.grade ' +
      'HAVING totalPoints > 0 ' +
      'ORDER BY totalPoints DESC, s.name ASC ' +
      'LIMIT 3'
    ) || []

    // تنسيق الرد: الاسم كامل زي ما الطالب كاتبه (و21 بطلب المستر) + الصف + النقاط كرقم نظيف
    var leaderboard = (rows || []).map(function (r: any) {
      var displayName = String(r.name || 'طالب').trim().replace(/\s+/g, ' ') || 'طالب'
      var total = Number(r.totalPoints) || 0
      // تقريب نظيف: صحيح لو مقدرش كسور، وإلا رقم عشري واحد
      var totalClean = Math.round(total * 10) / 10
      if (totalClean % 1 === 0) totalClean = Math.round(totalClean)
      return {
        name: displayName,
        grade: String(r.grade || ''),
        totalPoints: totalClean,
      }
    })

    cachedRows = leaderboard
    cachedAt = Date.now()

    return NextResponse.json({ leaderboard: leaderboard })
  } catch (error) {
    console.error('Leaderboard error:', error)
    // حالة فاضية رشيقة — الصفحة بتعرض رسالة «لا يوجد طلاب بعد» بدل ما تبوظ
    return NextResponse.json({ leaderboard: [] })
  }
}
