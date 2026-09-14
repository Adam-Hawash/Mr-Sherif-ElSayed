import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

// ============================================================
// (2026-و37) تسجيل حساب ولي أمر — طلب المستر الحرفي:
//   «لولي الأمر لما يجي يعمل حساب أول حاجة يكتب اسم الطالب ابنه لو موجود
//    في المنصة، ويكتب رقم التليفون اللي ابني مسجل فيه في المنصة، والباسورد
//    بتاعه ابنه اللي متسجلة في المنصة، ويكتب تليفون ولي الأمر اللي هو
//    التليفون الشخصي — لازم يكون التليفون ده هو المسجل على حساب ابنه في
//    المنصة — ويحط باسورد ليه هو. ولو الحاجات مش مربوطة يكتب له رسالة واضحة»
//
// التحقق من الولادة (كلها لازم تظبط على نفس حساب الطالب):
//   1) اسم الطالب — زي ما هو متسجل بالظبط (بتساهل بسيط: مسافات/حالة الحروف)
//   2) رقم تليفون الطالب — المسجل في المنصة
//   3) باسورد الطالب — نفس باسورد دخوله
//   4) رقم ولي الأمر — نفس الرقم المسجل على حساب ابنه (parentPhone)
// لو أي حاجة فيهم مش مظبوطة → رسالة واضحة مفصولة لكل حالة
// ============================================================

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'البيانات ناقصة — اكتب البيانات كلها وجرّب تاني' }, { status: 400 })
    }

    var studentName = String(body.studentName || '').trim()
    var studentPhone = String(body.studentPhone || '').trim()
    var studentPassword = String(body.studentPassword || '')
    var parentPhone = String(body.parentPhone || '').trim()
    var parentPassword = String(body.parentPassword || '')
    var parentPassword2 = String(body.parentPassword2 || '')

    // ===== تطبيع الرقم (نفس منطق تسجيل دخول الطالب) =====
    var normPhone = function (v: string): string {
      var t = String(v || '')
      t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
      t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
      var digits = t.replace(/[^0-9]/g, '')
      if (digits.length === 12 && digits.indexOf('20') === 0) digits = '0' + digits.slice(2)
      else if (digits.length > 11) digits = digits.slice(digits.length - 11)
      else if (digits.length === 10 && digits.indexOf('1') === 0) digits = '0' + digits
      return digits
    }
    var normPwd = function (v: string): string {
      var t = String(v || '')
      t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
      t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
      return t.replace(/\s+/g, '').trim().toLowerCase()
    }
    // اسم الطالب: مسافات مضبوطة + حالة حروف متساهلة — عشان الكتابة الطبيعية تتقبل
    var normName = function (v: string): string {
      return String(v || '').replace(/\s+/g, ' ').trim().toLowerCase()
    }

    if (!studentName) {
      return NextResponse.json({ error: 'اكتب اسم ابنك زي ما هو متسجل في المنصة' }, { status: 400 })
    }
    if (!studentPhone || !parentPhone) {
      return NextResponse.json({ error: 'لازم تكتب رقم تليفون ابنك ورقم تليفونك الشخصي' }, { status: 400 })
    }
    if (!parentPassword || parentPassword.length < 4) {
      return NextResponse.json({ error: 'باسوردك الشخصي لازم يكون 4 أحرف على الأقل' }, { status: 400 })
    }
    if (parentPassword2 && normPwd(parentPassword) !== normPwd(parentPassword2)) {
      return NextResponse.json({ error: 'تأكيد الباسورد مش مطابق — اكتب نفس الباسورد مرتين' }, { status: 400 })
    }

    var parentPhoneNorm = normPhone(parentPhone)
    var studentPhoneNorm = normPhone(studentPhone)
    if (!studentPhoneNorm || !parentPhoneNorm) {
      return NextResponse.json({ error: 'أرقام التليفون لازم تكون أرقام صحيحة' }, { status: 400 })
    }

    // ===== 1) جيب حساب ابنك =====
    var student = null as any
    try {
      student = await safeWrite(function () { return db.student.findFirst({ where: { phone: studentPhoneNorm } }) })
    } catch (e1) {
      try { student = await db.student.findFirst({ where: { phone: studentPhoneNorm } }) } catch (e2) {}
    }
    if (!student) {
      return NextResponse.json(
        { error: 'مفيش طالب مسجل بالرقم ده في المنصة — اتأكد إنك كاتب رقم تليفون ابنك الصح (نفس الرقم اللي اتسجل بيه)', field: 'studentPhone' },
        { status: 404 }
      )
    }

    // ===== 2) اسم الطالب لازم يطابق المسجل =====
    var storedName = normName(student.name)
    var typedName = normName(studentName)
    var nameOk = storedName === typedName || (typedName.length >= 4 && storedName.indexOf(typedName) !== -1)
    if (!nameOk) {
      return NextResponse.json(
        { error: 'الاسم مش مطابق لحساب الطالب المسجل بالرقم ده — اكتب اسم ابنك زي ما هو متسجل في المنصة بالظبط', field: 'studentName' },
        { status: 400 }
      )
    }

    // ===== 3) باسورد الطالب لازم يطابق =====
    if (!studentPassword || normPwd(student.password) !== normPwd(studentPassword)) {
      return NextResponse.json(
        { error: 'باسورد الطالب غلط — اكتب نفس الباسورد اللي ابنك بيدخل بيه في المنصة', field: 'studentPassword' },
        { status: 400 }
      )
    }

    // ===== 4) رقم ولي الأمر لازم يكون هو المسجل على حساب ابنه =====
    var storedParentPhone = normPhone(String(student.parentPhone || ''))
    if (!storedParentPhone) {
      return NextResponse.json(
        { error: 'حساب ابنك مش مسجل عليه رقم ولي أمر — كلمني أظبطه الأول', field: 'parentPhone' },
        { status: 400 }
      )
    }
    if (storedParentPhone !== parentPhoneNorm) {
      return NextResponse.json(
        { error: 'رقمك الشخصي مش هو المسجل على حساب ابنك في المنصة — لازم نفس الرقم اللي اتسجل بيه وقت ما ابنك عمل حسابه', field: 'parentPhone' },
        { status: 400 }
      )
    }

    // ===== منع التكرار: نفس الرقم كولي أمر قبل كده / أو كرقم طالب =====
    var existing = null as any
    try { existing = await db.parent.findFirst({ where: { phone: parentPhoneNorm } }) } catch (ep) {}
    if (existing) {
      return NextResponse.json(
        { error: 'انت مسجل قبل كده كولي أمر — سجل دخولك عادي برقمك وباسوردك' },
        { status: 409 }
      )
    }
    var asStudent = null as any
    try { asStudent = await db.student.findFirst({ where: { phone: parentPhoneNorm } }) } catch (es) {}
    if (asStudent) {
      return NextResponse.json(
        { error: 'الرقم ده متسجل كرقم طالب — لازم تليفونك الشخصي يكون مختلف عن تليفون ابنك' },
        { status: 409 }
      )
    }

    // ===== إنشاء الحساب =====
    var parentNameDefault = String(student.parentName || '').trim() || ('ولي أمر ' + String(student.name || '').split(' ')[0])
    var created = null as any
    try {
      created = await safeWrite(function () {
        return db.parent.create({
          data: {
            name: parentNameDefault,
            phone: parentPhoneNorm,
            password: parentPassword,
            studentId: student.id,
          },
        })
      })
    } catch (cErr: any) {
      console.error('Parent create error:', cErr)
      return NextResponse.json({ error: 'حصلت مشكلة في إنشاء الحساب — جرّب تاني بعد لحظات' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      parent: {
        id: created.id,
        name: created.name,
        phone: created.phone,
        studentId: created.studentId,
        student: { id: student.id, name: student.name, grade: student.grade, status: student.status, isPaidAccess: !!student.isPaidAccess },
      },
    })
  } catch (err: any) {
    console.error('Parent register error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
