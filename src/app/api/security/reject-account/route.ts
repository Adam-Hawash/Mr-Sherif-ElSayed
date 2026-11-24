import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// ============================================================
// (وN19) POST /api/security/reject-account
// ============================================================
// حارس الفيديو — طلب المستر الحرفي:
// «بعد 10 ثواني لما تخلص، خرجه بره المنصة تقول له حسابك اترفض من المنصة
//  ويتقفل له كل حاجة — وانا اللي اقدر أرجّعه من صفحة الأدمن بس»
//
// بيختلف عن devtools-strike (اللي بيمسح الحساب نهائيًا): هنا الحساب
// **بيترفض** (status='rejected') مش بيتمسح — عشان المستر يقدر يرجّعه
// من لوحة التحكم (تاب الطلاب المرفوضين → زرار القبول).
//
// الحماية من التلاعب: نفس أسلوب devtools-strike — الطلب لازم يجي
// **من جهاز الحساب نفسه** (deviceId/deviceFp/creationDeviceId/creationDeviceFp)
// — يعني مينفش بمعرّف الطالب ترفض حساب طالب تاني من جهازك.
// لو مفيش تطابق → بنرد ok:true من غير رفض (صامت).
// تسجيل الدخول بعد الرفض بيتمنع تلقائيًا من فحص status في /api/students.
// ============================================================

export async function POST(request: NextRequest) {
  try {
    var body: any = {}
    try { body = await request.json() } catch (e) { body = {} }
    var studentId = String(body.studentId || '')
    if (!studentId || studentId.indexOf('temp-') === 0) {
      return NextResponse.json({ ok: true, rejected: false })
    }

    var student: any = null
    try { student = await db.student.findUnique({ where: { id: studentId } }) } catch (e) { student = null }
    if (!student) return NextResponse.json({ ok: true, rejected: false })

    /* مرفوض أصلًا — مفيش حاجة نعملها */
    var curStatus = String((student as any).status || '')
    if (curStatus === 'rejected' || curStatus === 'refused') {
      return NextResponse.json({ ok: true, rejected: true, already: true })
    }

    // إثبات الجهاز: بصمة الجهاز المرسلة لازم تطابق بصمات جهاز الحساب
    var sent: string[] = []
    try {
      if (body.deviceId) sent.push(String(body.deviceId))
      if (Array.isArray(body.candidates)) {
        for (var i = 0; i < body.candidates.length; i++) {
          if (body.candidates[i]) sent.push(String(body.candidates[i]))
        }
      }
    } catch (e) {}
    var owned = [student.deviceId, student.deviceFp, student.creationDeviceId, student.creationDeviceFp]
      .filter(Boolean)
      .map(function (x: string) { return String(x) })
    var deviceMatch = false
    for (var s = 0; s < sent.length; s++) {
      if (sent[s] && owned.indexOf(sent[s]) !== -1) { deviceMatch = true; break }
    }
    /* الحساب اللي ملوش ربط جهاز خالص (نفس قاعدة الدخول) — بنقبل الطلب */
    var noBinding = owned.length === 0
    if (!deviceMatch && !noBinding) {
      return NextResponse.json({ ok: true, rejected: false, reason: 'device-mismatch' })
    }

    // الرفض — الحساب بيتقفل من المنصة كلها والمستر هو اللي يرجّعه من الأدمن
    try {
      await db.student.update({
        where: { id: studentId },
        data: { status: 'rejected' },
      })
    } catch (e) {
      return NextResponse.json({ ok: false, error: 'reject-failed' }, { status: 200 })
    }

    // سجل النشاط — بصيغة مفهومة للمستر في لوحة النشاطات
    try {
      await db.studentActivity.create({
        data: {
          studentId: studentId,
          action: 'account_rejected_video',
          details: 'اترفض تلقائيًا: العد التنازلي للفيديو (10 ثواني) خلص من غير ما يقفل التنبيه — بيتحسب محاولة يجيب لينك الفيديو',
        },
      })
    } catch (e) {}

    return NextResponse.json({ ok: true, rejected: true })
  } catch (error: any) {
    console.error('reject-account error:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Server error' }, { status: 200 })
  }
}
