import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// ============================================================
// (ز19) POST /api/security/devtools-strike
// ============================================================
// بيتمسح حساب الطالب بعد ما مهلة أدوات المطوّر (35 ثانية) تخلص
// في DevToolsGuard — طلب المستر الحرفي: «لو ما قفلتش حسابك هيتمسح».
//
// الحماية من التلاعب: الطلب لازم يجي **من نفس جهاز إنشاء الحساب**
// (بصمة deviceId/deviceFp/creationDeviceId/creationDeviceFp) —
// يعني مينفش بمعرّف الطالب تمسح حساب طالب تاني من جهازك.
// لو مفيش تطابق → بنرد ok:true من غير مسح (صامت).
// ============================================================

var STUDENT_TABLES = [
  // جداول بعمود studentId — اللي ملهاش العمود بترمي خطأ وبيتم تجاهله
  'payment', 'examResult', 'studentActivity', 'videoProgress', 'videoAccess',
  'playTicket', 'complaint', 'notification', 'homeworkResult', 'assistantUse',
  'battlePlayer', 'challengeEntry', 'flashcardScore', 'parentNotification',
  'parentStudent', 'deviceMessage',
]

export async function POST(request: NextRequest) {
  try {
    var body: any = {}
    try { body = await request.json() } catch (e) { body = {} }
    var studentId = String(body.studentId || '')
    if (!studentId || studentId.indexOf('temp-') === 0) {
      return NextResponse.json({ ok: true, deleted: false })
    }

    var student: any = null
    try { student = await db.student.findUnique({ where: { id: studentId } }) } catch (e) { student = null }
    if (!student) return NextResponse.json({ ok: true, deleted: false })

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
    if (!deviceMatch) return NextResponse.json({ ok: true, deleted: false, reason: 'device-mismatch' })

    // مسح كل ما يخص الطالب (الجداول اللي ملهاش العمود بتفشل بصمت)
    var dbAny = db as any
    for (var t = 0; t < STUDENT_TABLES.length; t++) {
      try {
        if (dbAny[STUDENT_TABLES[t]] && dbAny[STUDENT_TABLES[t]].deleteMany) {
          await dbAny[STUDENT_TABLES[t]].deleteMany({ where: { studentId: studentId } })
        }
      } catch (e) {}
    }

    // ولي الأمر المرتبط — يتسحب بس لو مالوش أبناء تانيين مربوطين
    try {
      var parents: any[] = await dbAny.parent.findMany({ where: { studentId: studentId } })
      for (var p = 0; p < parents.length; p++) {
        var otherKids = 0
        try { otherKids = await dbAny.parentStudent.count({ where: { parentId: parents[p].id } }) } catch (e) { otherKids = 0 }
        try { if (!otherKids) await dbAny.parent.delete({ where: { id: parents[p].id } }) } catch (e) {}
      }
    } catch (e) {}

    try { await db.student.delete({ where: { id: studentId } }) } catch (e) {}
    return NextResponse.json({ ok: true, deleted: true })
  } catch (error: any) {
    console.error('devtools-strike error:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Server error' }, { status: 200 })
  }
}
