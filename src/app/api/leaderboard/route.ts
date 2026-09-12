// @ts-nocheck
// FILE: src/app/api/leaderboard/route.ts
// PURPOSE: (2026-و16) لوحة شرف عامة — طلب المستر حرفيًا: «الصفحة الرئيسية خالص…
//   من غير تسجيل دخول — أول 3 طلاب من حيث عدد النقاط اللي معاهم».
//   • GET بدون أي توثيق — بتشتغل من صفحة الهبوط مباشرة
//   • النقاط = مجموع درجات الامتحانات (ExamResult.score) + مجموع درجات الواجبات
//     (HomeworkResult.score) — نفس أرقام لوحة الأدمن بالظبط
//   • خصوصية: ممنوع التليفون أو الإيميل أو أي بيانات شخصية — الاسم بس زي ما الطالب كاتبه
//     (2026-و21: تعديل بطلب المستر — الاسم كامل زي ما هو كاتبه مش كلمتين)
//   • الطلاب المقبولين بس (approved/paid) + نتايج امتحان/واجب لسه موجودين في
//     المنصة (لو المستر مسح امتحان/واجب نقاطه بتشيل معاه — نفس منطق الحذف المتسلسل)

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

// كاش داخلي بسيط (60 ثانية) — الصفحة الرئيسية بتتفتح كتير ومفيش داعي نضرب
// الداتابيز بكل زيارة. نفس نمط الكاش المحلي في باقي المنصة.
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
    var rows: any[] = await db.$queryRawUnsafe(
      'SELECT s.id, s.name, s.grade, ' +
      '( ' +
      '  (SELECT COALESCE(SUM(er.score), 0) FROM ExamResult er ' +
      '   WHERE er.studentId = s.id AND er.examId IN (SELECT id FROM Exam)) ' +
      '  + ' +
      '  (SELECT COALESCE(SUM(hr.score), 0) FROM HomeworkResult hr ' +
      '   WHERE hr.studentId = s.id AND hr.homeworkId IN (SELECT id FROM Homework)) ' +
      ') AS totalPoints ' +
      'FROM Student s ' +
      "WHERE s.status IN ('approved', 'paid') " +
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
