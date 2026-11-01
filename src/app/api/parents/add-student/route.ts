// @ts-nocheck
/* ============================================================
   (2026-و79) إضافة طالب لحساب ولي الأمر — طلب المستر الحرفي:
   «ولي الأمر بعد ما يعمل حساب، يبقى عنده ابني ثاني يدوس إضافة
   طالب ويحط بيانات الطالب الثاني ويفضل يدوس إضافة طالب —
   والحساب واحد فيه كل الطلاب مدموجين»
   POST { parentId, mode: 'link' | 'create', ... }
   • link: ربط حساب ابن موجود (رقم + اسم مطابق + باسورد الطالب
     + رقم ولي الأمر مسجل على حساب الطالب) — نفس قواعد التسجيل
   • create: إنشاء حساب طالب جديد من الصفر (اسم/رقم/باسورد/صف)
     — الحالة pending في انتظار موافقة المستر + parentPhone = رقم
     ولي الأمر — وبعدها يتربط بحساب ولي الأمر فورًا
   الحماية: parentId لازم يكون جلسة ولي أمر شغالة
   ============================================================ */
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureParentStudentTable, linkParentStudent, listParentStudents, normPhone, normName, normPwd } from '@/lib/parent-students'

var parentDdlDone: Promise<void> | null = null
function ensureParentTable(): Promise<void> {
  if (!parentDdlDone) {
    parentDdlDone = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Parent (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT '', studentId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_parent_student ON Parent(studentId)') } catch (e) {}
      } catch (e) {
        parentDdlDone = null
      }
    })()
  }
  return parentDdlDone
}

function studentsOut(students: any[]): any[] {
  return (students || []).map(function (s: any) {
    return { id: s.id, name: s.name, grade: s.grade, status: s.status, isPaidAccess: !!s.isPaidAccess }
  })
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json().catch(function () { return ({} as any) })
    var parentId = String(body.parentId || '')
    var mode = String(body.mode || 'link')
    if (!parentId) return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })

    try { await ensureParentTable() } catch (eDdl) {}
    var parent: any = null
    try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (pErr) {}
    if (!parent) return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })

    /* (2026-و92) طلب المستر: «من جوه برده تدوس إضافة طالب — برضه أقصى عدد ست طلاب» */
    var currentCount = 1
    try {
      var curList = await listParentStudents(parent)
      currentCount = Math.max(1, (curList || []).length)
    } catch (eCnt) {}
    if (currentCount >= 6) {
      return NextResponse.json({ error: 'وصلت الحد الأقصى — الحساب الواحد بيشيل 6 طلاب كحد أقصى' }, { status: 400 })
    }

    var parentPhoneNorm = normPhone(parent.phone)

    /* ===== ربط حساب ابن موجود ===== */
    if (mode === 'link') {
      var studentName = String(body.studentName || '').trim()
      var studentPhone = normPhone(body.studentPhone)
      var studentPassword = String(body.studentPassword || '')
      if (!studentPhone || !studentName || !studentPassword) {
        return NextResponse.json({ error: 'اكتب اسم ابنك ورقم تليفونه والباسورد بتاع المنصة' }, { status: 400 })
      }
      var student: any = null
      try { student = await db.student.findFirst({ where: { phone: studentPhone } }) } catch (e1) {}
      if (!student) {
        return NextResponse.json({ error: 'مفيش طالب مسجل بالرقم ده في المنصة — لو ابنك لسه معندوش حساب اعمله من «حساب جديد»' }, { status: 404 })
      }
      var storedName = normName(student.name)
      var typedName = normName(studentName)
      var nameOk = storedName === typedName || (typedName.length >= 4 && storedName.indexOf(typedName) !== -1)
      if (!nameOk) {
        return NextResponse.json({ error: 'الاسم مش مطابق لحساب الطالب المسجل بالرقم ده' }, { status: 400 })
      }
      if (normPwd(student.password) !== normPwd(studentPassword)) {
        return NextResponse.json({ error: 'باسورد الطالب غلط — اكتب نفس الباسورد اللي ابنك بيدخل بيه في المنصة' }, { status: 400 })
      }
      var storedParentPhone = normPhone(String(student.parentPhone || ''))
      if (!storedParentPhone || storedParentPhone !== parentPhoneNorm) {
        return NextResponse.json({ error: 'الحساب ده مش مسجل عليه رقم تليفونك كولي أمر — كلمني أظبطه الأول' }, { status: 400 })
      }
      await linkParentStudent(parent.id, student.id)
      var students = await listParentStudents(parent)
      return NextResponse.json({ ok: true, students: studentsOut(students), added: { id: student.id, name: student.name } })
    }

    /* ===== إنشاء حساب طالب جديد ===== */
    if (mode === 'create') {
      var newName = String(body.studentName || '').trim().slice(0, 80)
      var newPhone = normPhone(body.studentPhone)
      var newPwd = String(body.studentPassword || '')
      var newGrade = String(body.grade || '').trim()
      if (!newName || !newPhone || !newPwd) {
        return NextResponse.json({ error: 'اكتب اسم ابنك ورقم تليفونه والباسورد' }, { status: 400 })
      }
      if (newPwd.length < 4) {
        return NextResponse.json({ error: 'الباسورد قصير — 4 حروف على الأقل' }, { status: 400 })
      }
      var dup: any = null
      try { dup = await db.student.findFirst({ where: { phone: newPhone } }) } catch (e2) {}
      if (dup) {
        return NextResponse.json({ error: 'الرقم ده مسجل به حساب طالب بالفعل — استخدم «ربط حساب موجود»' }, { status: 409 })
      }
      var pid = 'st_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "INSERT INTO Student (id, name, phone, password, grade, status, parentName, parentPhone, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
          pid, newName, newPhone, newPwd, newGrade || '', String(parent.name || ''), parentPhoneNorm
        )
      })
      await linkParentStudent(parent.id, pid)
      var students2 = await listParentStudents(parent)
      return NextResponse.json({ ok: true, students: studentsOut(students2), added: { id: pid, name: newName }, created: true })
    }

    return NextResponse.json({ error: 'نوع الطلب مش معروف' }, { status: 400 })
  } catch (err: any) {
    console.error('Parent add-student error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
