import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureParentStudentTable, linkParentStudent } from '@/lib/parent-students'

/* (2026-و38) شفاء ذاتي لجدول Parent — درس من الإنتاج: الجدول كان نازل
 * في SCHEMA_TABLES بس مش في CORE_TABLES فالترميم التلقائي اتخطاه
 * و«حصلت مشكلة في إنشاء الحساب» كانت النتيجة. هنا بنضمن وجود الجدول
 * والفهرس قبل أي استعلام (idempotent — CREATE IF NOT EXISTS). */
var parentDdlDone: Promise<void> | null = null
function ensureParentTable(): Promise<void> {
  if (!parentDdlDone) {
    parentDdlDone = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Parent (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT '', studentId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_parent_student ON Parent(studentId)') } catch (e) {}
      } catch (e) {
        /* فشل مؤقت (شبكة/اتصال) → نصفّي الميموري عشان الطلب الجاي يحاول تاني */
        parentDdlDone = null
      }
    })()
  }
  return parentDdlDone
}

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
    /* (و90) + تطبيع الحروف العربية المتشابهة (أ/ا، ى/ي، ة/ه، ؤ/و، ئ/ي) —
       الكيبورد بتكتبها مختلفة من موبايل لموبايل وكانت بتكسر مطابقة صحيحة */
    var foldArabic = function (t: string): string {
      return t
        .replace(/[أإآ]/g, 'ا')
        .replace(/ى/g, 'ي')
        .replace(/ة/g, 'ه')
        .replace(/ؤ/g, 'و')
        .replace(/ئ/g, 'ي')
    }
    var normPwd = function (v: string): string {
      var t = String(v || '')
      t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
      t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
      return foldArabic(t.replace(/\s+/g, '')).trim().toLowerCase()
    }
    // اسم الطالب: مسافات مضبوطة + حالة حروف متساهلة — عشان الكتابة الطبيعية تتقبل
    var normName = function (v: string): string {
      return foldArabic(String(v || '').replace(/\s+/g, ' ').trim().toLowerCase())
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
    /* (و90) درس من شكوى المستر: «كلمة مرور ابنك غلط» رغم إنها صح — الأسباب:
       (أ) الرقم ممكن يكون متخزن بصيغة تانية (20xxxxxxxxx / مسافات / أرقام عربية)
       (ب) لو فيه أكتر من حساب بنفس الرقم — findFirst بيرجّع حساب قديم باسورده مختلف
       (ج) حروف عربية متشابهة (أ/ا، ى/ي، ة/ه) في الباسورد أو الاسم
       الحل: بحث بكل صيغ الرقم على كل الحسابات المرشحة + فحص (اسم + باسورد
       + رقم ولي الأمر) على كل مرشح — أول واحد يطابق كلهم هو الحساب المعتمد. */
    try { await ensureParentTable() } catch (eDdl) {}

    /* (و92) مطابِق موحّد — نفس قواعد التحقق للأول والأبناء الإضافيين
       (زرار «إضافة طالب» في شاشة التسجيل): رقم بكل الصيغ + اسم مطابق
       + باسورد صحيح + رقم ولي الأمر مسجل على حساب الطالب */
    var matchStudent = async function (name: string, phone: string, password: string) {
      var phoneNorm = normPhone(phone)
      if (!phoneNorm) return { err: 'أرقام التليفون لازم تكون أرقام صحيحة', field: 'studentPhone' }
      var digits = String(phone || '').replace(/[^0-9]/g, '')
      var variants: string[] = []
      var pushV = function (v: string) { if (v && variants.indexOf(v) === -1) variants.push(v) }
      pushV(phoneNorm)
      if (digits.length === 12 && digits.indexOf('20') === 0) pushV('0' + digits.slice(2))
      if (phoneNorm.length === 11 && phoneNorm.indexOf('0') === 0) pushV('20' + phoneNorm.slice(1))
      pushV(digits)
      var cands: any[] = []
      var load = function () { return db.student.findMany({ where: { phone: { in: variants } } }) }
      try { cands = await safeWrite(load) } catch (e1) { try { cands = await load() } catch (e2) { cands = [] } }
      if (!cands || !cands.length) return { err: 'مفيش طالب مسجل بالرقم ده في المنصة — اتأكد إنك كاتب رقم تليفون ابنك الصح (نفس الرقم اللي اتسجل بيه)', field: 'studentPhone' }
      var typed = normName(name)
      var nameHit = function (s: any): boolean {
        var stored = normName(s.name)
        return stored === typed || (typed.length >= 4 && stored.indexOf(typed) !== -1)
      }
      var nameHitButWrongPwd = false
      var anyParentPhoneStored = false
      for (var i = 0; i < cands.length; i++) {
        var c = cands[i]
        if (!nameHit(c)) continue
        if (!password || normPwd(c.password) !== normPwd(password)) { nameHitButWrongPwd = true; continue }
        var cPar = normPhone(String(c.parentPhone || ''))
        if (!cPar) continue
        anyParentPhoneStored = true
        if (cPar !== parentPhoneNorm) continue
        return { student: c }
      }
      var anyName = false
      for (var j = 0; j < cands.length; j++) { if (nameHit(cands[j])) { anyName = true; break } }
      if (!anyName) return { err: 'الاسم مش مطابق لحساب الطالب المسجل بالرقم ده — اكتب اسم ابنك زي ما هو متسجل في المنصة بالظبط', field: 'studentName' }
      if (nameHitButWrongPwd) return { err: 'باسورد الطالب غلط — اكتب نفس الباسورد اللي ابنك بيدخل بيه في المنصة (اتأكد إنه هو نفسه اللي ابنك بيدخل بيه دلوقتي)', field: 'studentPassword' }
      if (!anyParentPhoneStored) return { err: 'حساب ابنك مش مسجل عليه رقم ولي أمر — كلمني أظبطه الأول', field: 'parentPhone' }
      return { err: 'رقمك الشخصي مش هو المسجل على حساب ابنك في المنصة — لازم نفس الرقم اللي اتسجل بيه وقت ما ابنك عمل حسابه', field: 'parentPhone' }
    }

    /* (و92) الأبناء الإضافيين من زرار «إضافة طالب» — بيتحققوا كلهم الأول
       قبل إنشاء أي حاجة، ولو واحد فيهم فيه مشكلة الرسالة بتقول مين بالظبط */
    var extraStudents: any[] = []
    if (Array.isArray(body.extraStudents)) {
      /* (2026-و92) طلب المستر: «أقصى عدد 6 طلاب» — الابن الأول + 5 إضافيين كحد أقصى */
      if (body.extraStudents.length > 5) {
        return NextResponse.json({ error: 'الحد الأقصى 6 طلاب في الحساب الواحد' }, { status: 400 })
      }
      var extrasIn = body.extraStudents.slice(0, 5)
      var seenPhones: string[] = [studentPhoneNorm]
      for (var ex = 0; ex < extrasIn.length; ex++) {
        var exName = String((extrasIn[ex] || {}).studentName || '').trim()
        var exPhone = String((extrasIn[ex] || {}).studentPhone || '').trim()
        var exPwd = String((extrasIn[ex] || {}).studentPassword || '')
        var label = 'الطالب رقم ' + (ex + 2)
        if (!exName || !exPhone || !exPwd) {
          return NextResponse.json({ error: label + ': اكتب اسمه ورقم تليفونه وباسورده كاملين' }, { status: 400 })
        }
        var exNorm = normPhone(exPhone)
        if (seenPhones.indexOf(exNorm) !== -1) {
          return NextResponse.json({ error: label + ': الرقم ده مكتوب قبل كده في نفس الطلب — كل ابن له رقم مختلف' }, { status: 400 })
        }
        seenPhones.push(exNorm)
        var matched = await matchStudent(exName, exPhone, exPwd)
        if (matched.err) {
          return NextResponse.json({ error: label + ': ' + matched.err }, { status: 400 })
        }
        extraStudents.push(matched.student)
      }
    }

    var digitsOnly = studentPhone.replace(/[^0-9]/g, '')
    var phoneVariants: string[] = []
    var pushVariant = function (v: string) { if (v && phoneVariants.indexOf(v) === -1) phoneVariants.push(v) }
    pushVariant(studentPhoneNorm)
    if (digitsOnly.length === 12 && digitsOnly.indexOf('20') === 0) pushVariant('0' + digitsOnly.slice(2))
    if (studentPhoneNorm.length === 11 && studentPhoneNorm.indexOf('0') === 0) pushVariant('20' + studentPhoneNorm.slice(1))
    pushVariant(digitsOnly)

    var candidates: any[] = []
    var loadCandidates = function () { return db.student.findMany({ where: { phone: { in: phoneVariants } } }) }
    try {
      candidates = await safeWrite(loadCandidates)
    } catch (e1) {
      try { candidates = await loadCandidates() } catch (e2) { candidates = [] }
    }
    if (!candidates || !candidates.length) {
      return NextResponse.json(
        { error: 'مفيش طالب مسجل بالرقم ده في المنصة — اتأكد إنك كاتب رقم تليفون ابنك الصح (نفس الرقم اللي اتسجل بيه)', field: 'studentPhone' },
        { status: 404 }
      )
    }

    // ===== 2+3+4) مطابقة الاسم والباسورد ورقم ولي الأمر على كل المرشحين =====
    var typedName = normName(studentName)
    var nameMatch = function (s: any): boolean {
      var storedName = normName(s.name)
      return storedName === typedName || (typedName.length >= 4 && storedName.indexOf(typedName) !== -1)
    }
    var pwdMatch = function (s: any): boolean {
      return !!studentPassword && normPwd(s.password) === normPwd(studentPassword)
    }
    var student = null as any
    var nameHitButWrongPwd = false
    var anyParentPhoneStored = false
    for (var ci = 0; ci < candidates.length; ci++) {
      var cand = candidates[ci]
      if (!nameMatch(cand)) continue
      if (!pwdMatch(cand)) { nameHitButWrongPwd = true; continue }
      var candParentPhone = normPhone(String(cand.parentPhone || ''))
      if (!candParentPhone) { continue }
      anyParentPhoneStored = true
      if (candParentPhone !== parentPhoneNorm) { continue }
      student = cand
      break
    }
    if (!student) {
      /* رسالة واضحة حسب السبب الحقيقي — بدل رسالة واحدة مضللة */
      var anyNameMatch = false
      for (var ai = 0; ai < candidates.length; ai++) { if (nameMatch(candidates[ai])) { anyNameMatch = true; break } }
      if (!anyNameMatch) {
        return NextResponse.json(
          { error: 'الاسم مش مطابق لحساب الطالب المسجل بالرقم ده — اكتب اسم ابنك زي ما هو متسجل في المنصة بالظبط', field: 'studentName' },
          { status: 400 }
        )
      }
      if (nameHitButWrongPwd) {
        return NextResponse.json(
          { error: 'باسورد الطالب غلط — اكتب نفس الباسورد اللي ابنك بيدخل بيه في المنصة (اتأكد إنه هو نفسه اللي ابنك بيدخل بيه دلوقتي)', field: 'studentPassword' },
          { status: 400 }
        )
      }
      if (!anyParentPhoneStored) {
        return NextResponse.json(
          { error: 'حساب ابنك مش مسجل عليه رقم ولي أمر — كلمني أظبطه الأول', field: 'parentPhone' },
          { status: 400 }
        )
      }
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
    // (و38) لو الجدول لسه مش موجود لأي سبب — محاولة أخيرة قبل الإنشاء
    try {
      await db.$executeRawUnsafe("SELECT 1 FROM Parent LIMIT 1")
    } catch (eTbl: any) {
      try { parentDdlDone = null; await ensureParentTable() } catch (eDdl2) {}
    }
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

    /* (و92) ربط الأبناء الإضافيين — نفس دمج «إضافة طالب» (ParentStudent)
       عشان الحساب واحد يشوف كل الأبناء من أول ما يتفتح */
    var linkedExtra = 0
    try {
      await ensureParentStudentTable()
      for (var li = 0; li < extraStudents.length; li++) {
        try {
          await linkParentStudent(created.id, String(extraStudents[li].id))
          linkedExtra++
        } catch (eLink) {
          console.error('Parent register extra link error (ignored):', eLink)
        }
      }
    } catch (eT) {}

    return NextResponse.json({
      success: true,
      parent: {
        id: created.id,
        name: created.name,
        phone: created.phone,
        studentId: created.studentId,
        student: { id: student.id, name: student.name, grade: student.grade, status: student.status, isPaidAccess: !!student.isPaidAccess },
      },
      linkedExtraStudents: linkedExtra,
    })
  } catch (err: any) {
    console.error('Parent register error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
