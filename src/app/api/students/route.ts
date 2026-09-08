import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { makeLibsqlClient, ensureSchema } from '@/lib/ensure-schema'

// ===== إصلاح ذاتي للجدول (مهم للإنتاج) =====
// الدالة دي بتشتغل مرة واحدة كل تشغيل سيرفر: بتشغّل ensureSchema الكاملة —
// بتضيف الأعمدة الناقصة في Turso (زي أعمدة جهاز الإنشاء بعد الترقية) وبينفّذ
// الترحيلات (تثبيت ربط الإنشاء للحسابات الموجودة) وترتيبات الـ NULL — كلها
// idempotent فمفيش أي ضرر من إعادة التنفيذ.
var schemaReady: Promise<void> | null = null
function ensureStudentSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async function () {
      // بنشغّل الإصلاح الذاتي + الترحيل **مرة كل تشغيل سيرفر** دايمًا (مش بس
      // لما الاستعلام يفشل) — عشان الترحيلات الجديدة (زي أعمدة جهاز الإنشاء)
      // تتنفذ على قواعد بيانات من غير أعمدة جديدة من أول تشغيل بعد النشر.
      try {
        var client = makeLibsqlClient()
        if (client) {
          try { await ensureSchema(client) } finally { try { await client.close() } catch (e2) {} }
        }
      } catch (e) {}
    })()
  }
  return schemaReady
}

// ===== أدوات قفل الجهاز الصارم =====
// تصنيف قيم الجهاز: هوية فريدة (dev_) وبصمة ناتج الجهاز (dv3_/dv2_)
// **بنجمع كل القيم اللي بعتها المتصفح مش أول واحدة بس** — كانت دي حكاية
// حجب حسابات على جهازها: المتصفح بيقبط القديمة (dv2 / بصمة بصيغة أقدم /
// الكوكي) والسيرفر كان بيبص على أول قيمة بس فمابقاش بيتعرف على نفس الجهاز!
function pickDeviceIds(candidates: string[]): { uuid: string; fp: string; uuids: string[]; dv3: string[]; dv2: string[] } {
  var uuids: string[] = []
  var dv3: string[] = []
  var dv2: string[] = []
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i]
    if (!c) continue
    if (c.indexOf('dev_') === 0) { if (uuids.indexOf(c) === -1) uuids.push(c) }
    else if (c.indexOf('dv3_') === 0) { if (dv3.indexOf(c) === -1) dv3.push(c) }
    else if (c.indexOf('dv2_') === 0) { if (dv2.indexOf(c) === -1) dv2.push(c) }
  }
  return { uuid: uuids[0] || '', fp: (dv3[0] || dv2[0] || ''), uuids: uuids, dv3: dv3, dv2: dv2 }
}

// ===== مطابقة مكوّنات الجهاز (المرحلة التانية من التعرف) =====
// لو البصمات الدقيقة كلها اختلفوا (لفت الموبايل / تحديث المتصفح / مسح بيانات)
// بنقارن مكوّنات الجهاز الخام المخزنة مع الحساب ببعتة الجهاز الحالي.
// المكوّنات الحاكمة (الشاشة + المنصة) لازم تتطابق — دي اللي بتفصل موبايل عن موبايل —
// والباقي بنسبة 70%+ عشان تحديثات النظام أو تعريف كارت الشاشة ما تكسرش.
// **مكوّن اتجاه الشاشة (orient) مستثنى خالص** — لف الموبايل مبيغيرش هوية الجهاز.
// **كارت الشاشة (webgl) بقى ضمن المطابقة المرنة** — تحديث تعريف الـ GPU بيغير نصه
// وكان ده بيمنع صاحب الجهاز نفسه من الدخول (كان hard وممكن يفشل مطابقة).
function parseTraitsJson(s: any): Record<string, string> | null {
  try {
    if (!s || typeof s !== 'string' || s.length < 10 || s.length > 4000) return null
    var o = JSON.parse(s)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    return o
  } catch (e) { return null }
}

// مقاس الشاشة بيتقارن **من غير ترتيب** (الصغير×الكبير) — لف الموبايل طولي↔عرضي
// بيبدّل width/height ومكانها يكسر التعرف على نفس الجهاز (كانت حالة حجب حقيقية)
function dimsPair(t: Record<string, string>): string {
  var a = parseInt(t.sw || '0', 10) || 0
  var b = parseInt(t.sh || '0', 10) || 0
  return a < b ? a + 'x' + b : b + 'x' + a
}

function traitsMatchSameDevice(stored: Record<string, string> | null, fresh: Record<string, string> | null): boolean {
  if (!stored || !fresh) return false
  if (stored.fallback === '1' || fresh.fallback === '1') return false
  // المكوّنات الحاكمة: المنصة (الشاشة بتتقارن من غير ترتيب فوق)
  if (dimsPair(stored) !== dimsPair(fresh)) return false
  var hard = ['platform']
  for (var i = 0; i < hard.length; i++) {
    if (String(stored[hard[i]] || '') !== String(fresh[hard[i]] || '')) return false
  }
  var keys = ['ua', 'lang', 'langs', 'cd', 'aw', 'ah', 'cores', 'mem', 'touch', 'tz', 'canvas', 'webgl']
  var hit = 0
  for (var j = 0; j < keys.length; j++) {
    if (String(stored[keys[j]] || '') === String(fresh[keys[j]] || '')) hit++
  }
  return hit / keys.length >= 0.7
}

// ===== فحص المشاركة الذكي (بدل الحجب الأعمى) =====
// كانت دي **المشكلة اللي المستر شوفها بنفسه**: موبايل واحد عليه أكتر من حساب
// (اتسجلوا في وقتين مختلفين بينهم مسح بيانات أو تحديث متصفح) — لما صاحب الموبايل
// يدخل على الحساب الأقدم، الحماية القديمة كانت تلاقي الهوية مربوطة بالحساب الأحدث
// فتحسبها "مشاركة حسابات" وتحجب **صاحب الجهاز نفسه**!
// الحل الصح: بنقارن مكوّنات الجهاز الفيزيائية للحسابات التانية المربوطة بنفس
// الهوية — لو متطابقة مع الجهاز الحالي يبقى ده نفس الموبايل فعلًا (موبايل واحد
// بأكتر من حساب) ومش مشاركة. المشاركة الحقيقية = جهاز تاني فعلًا (مكوّنات مختلفة).
function checkOthersSamePhysicalDevice(others: Array<{ deviceTraits?: string | null }>, fresh: Record<string, string> | null): boolean {
  if (!fresh) return false
  for (var i = 0; i < others.length; i++) {
    var ot = parseTraitsJson(others[i].deviceTraits || '')
    // حساب تاني مربوط بنفس الهوية لكن مكوّناته الفيزيائية مختلفة → مشاركة حقيقية
    if (!ot || !traitsMatchSameDevice(ot, fresh)) return false
  }
  return true
}

var LEGACY_IDS = ['null', 'undefined', 'dev_null', 'none', '']

// أنواع الأجهزة المسموح تخزينها (من المتصفح): موبايل/تابلت/كمبيوتر
var DEVICE_TYPES = ['mobile', 'tablet', 'computer']
function pickDeviceType(v: any): string {
  return typeof v === 'string' && DEVICE_TYPES.indexOf(v) !== -1 ? v : ''
}

export async function GET(request: NextRequest) {
  try {
    // الإصلاح الذاتي + الترحيل أول حاجة في **أي** استدعاء للـ API
    // (مرة واحدة كل تشغيل سيرفر) — عشان أول طلب بعد النشر يلاقي الجدول كامل
    await ensureStudentSchema()
    var searchParams = new URL(request.url).searchParams
    var phone = searchParams.get('phone')
    var grade = searchParams.get('grade')
    var status = searchParams.get('status')
    var keyword = searchParams.get('keyword')
    var page = parseInt(searchParams.get('page') || '1')
    var pageSize = parseInt(searchParams.get('pageSize') || '20')

    if (phone) {
      var password = searchParams.get('password') || ''
      var deviceId = searchParams.get('deviceId') || ''
      // كل قيم الجهاز اللي بعتها المتصفح (هوية فريدة + بصمات + كوكي)
      var candidates: string[] = []
      try {
        var rawIds = JSON.parse(searchParams.get('deviceIds') || '[]')
        if (Array.isArray(rawIds)) {
          for (var ci = 0; ci < rawIds.length; ci++) {
            if (typeof rawIds[ci] === 'string' && rawIds[ci] && candidates.indexOf(rawIds[ci]) === -1) candidates.push(rawIds[ci])
          }
        }
      } catch (e) {}
      if (deviceId && candidates.indexOf(deviceId) === -1) candidates.unshift(deviceId)
      var current = pickDeviceIds(candidates)
      try {
        await ensureStudentSchema()
        var student = null as any
        try {
          student = await db.student.findFirst({
            where: { phone },
            include: { _count: { select: { activities: true } } },
          })
        } catch (qErr: any) {
          // لو الاستعلام فشل (عمود ناقص في الإنتاج) → صلّح الجدول وجرب مرة كمان
          await ensureStudentSchema()
          student = await db.student.findFirst({
            where: { phone },
            include: { _count: { select: { activities: true } } },
          })
        }
        if (!student) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        // Password check for login
        if (!password || student.password !== password) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        // الحسابات المرفوضة ممنوع تدخل خالص (الصلاحية من المستر)
        var st = (student as any).status
        if (st === 'rejected' || st === 'refused') {
          return NextResponse.json(
            { students: [], deviceBlocked: false, error: '❌ الحساب بتاعك مرفوض من المنصة. لو عندك استفسار تواصل مع المستر' },
            { status: 403 }
          )
        }
        // ===== قفل الجهاز الصارم — جهاز إنشاء الحساب فقط (ثابت لا يتغير) =====
        // المشكلة اللي اتحلّت هنا: كان الربط بيتخزن في أعمدة عادية (deviceId/deviceFp)
        // وبيتعاد كتابته في مسارات كتير (إنقاذ بالبصمة / السماح / أول دخول) — فآخر
        // جهاز كسب السباق كان بيبقى "جهاز الحساب" حتى لو مش جهاز الإنشاء!
        // (وده اللي كان بيخلي: حساب اتعمل على اللابتوب يفتح من الموبايل ويحجب
        // اللابتوب نفسه — والعكس في حسابات تانية).
        //
        // الحل الجذري: أعمدة creationDeviceId/creationDeviceFp **ثابتة** بتتكتب
        // مرة واحدة وقت التسجيل فقط، والدخول بيتحقق ضدهم حصريًا:
        //   1) الهوية الفريدة (dev_) لجهاز الإنشاء — الأساس
        //   2) بصمة dv3 لجهاز الإنشاء — إنقاذ لو بيانات المتصفح اتمسحت على نفس الجهاز
        //   3) بصمة dv2 — ترقية الحسابات القديمة جدًا (مرة واحدة)
        // ومفيش أي مسار في الدخول بيكتب في أعمدة الإنشاء — إلا المستر نفسه
        // من لوحة التحكم (فك الربط / سماح ونقل جهاز).
        var storedId = ((student as any).deviceId || '').trim()
        var storedFp = ((student as any).deviceFp || '').trim()
        var creationId = ((student as any).creationDeviceId || '').trim()
        var creationFp = ((student as any).creationDeviceFp || '').trim()
        // إصدارات قديمة: "null" نصية → فاضية
        if (LEGACY_IDS.indexOf(storedId) !== -1) storedId = ''
        if (LEGACY_IDS.indexOf(storedFp) !== -1) storedFp = ''
        if (LEGACY_IDS.indexOf(creationId) !== -1) creationId = ''
        if (LEGACY_IDS.indexOf(creationFp) !== -1) creationFp = ''
        // هجرة قديمة: بصمة مخزنة في خانة الهوية → نعاملها كبصمة مش كهوية
        if (creationId.indexOf('dv2_') === 0 || creationId.indexOf('dv3_') === 0) {
          if (!creationFp) creationFp = creationId
          creationId = ''
        }
        if (storedId.indexOf('dv2_') === 0 || storedId.indexOf('dv3_') === 0) {
          if (!storedFp) storedFp = storedId
          storedId = ''
        }
        var allowAll = !!(student as any).allowAllDevices
        // مكوّنات جهاز الدخول الحالي — بتتخزن مع الحساب عشان مطابقة المكوّنات تقدر
        // تتعرف على نفس الجهاز لو البصمات الدقيقة اختلفوا (لف الشاشة/تحديث المتصفح)
        var freshTraits = parseTraitsJson(searchParams.get('deviceTraits') || '')
        var freshTraitsStr = freshTraits ? JSON.stringify(freshTraits) : ''
        // مكوّنات الجهاز المخزنة مع الحساب (بتتحمل هنا عشان التشخيص تحت يستخدمها)
        var storedTraits: Record<string, string> | null = parseTraitsJson((student as any).deviceTraits || '')
        // نوع جهاز الدخول الحالي (موبايل/تابلت/كمبيوتر) — للتسجيل وللحسابات
        // القديمة اللي اتعملت قبل ما نبدأ نحفظ النوع
        var inDeviceType = pickDeviceType(searchParams.get('deviceType'))

        // التحقق ضد **ربط الإنشاء الثابت** الأول، ولو فاضي (حساب قديم قبل الترحيل)
        // ضد الربط العادي — ومن غير أي إعادة ربط للأجهزة الغريبة في الحالتين
        var checkId = creationId || storedId
        var checkFp = creationFp || storedFp
        // بنقارن ضد **كل** قيم الجهاز اللي بعتها المتصفح (مش أول واحدة بس):
        // الهوية من التخزين أو الكوكي + البصمة الحالية أو القديمة أو dv2 القديمة
        var uuidOk = !!checkId && checkId.indexOf('dev_') === 0 && current.uuids.indexOf(checkId) !== -1
        var fpOk = !!checkFp && checkFp.indexOf('dv3_') === 0 && current.dv3.indexOf(checkFp) !== -1 && !uuidOk
        var legacyOk = !!checkFp && checkFp.indexOf('dv2_') === 0 && current.dv2.indexOf(checkFp) !== -1 && !uuidOk && !fpOk
        var hasAnyBinding = !!(creationId || creationFp || storedId || storedFp)
        var deviceTrusted = uuidOk || fpOk || legacyOk
        // الجهاز الحالي مش جهاز إنشاء الحساب → محاولة أخيرة: مطابقة مكوّنات الجهاز
        // (نفس الشاشة + نفس كارت الرسومات + نفس المنصة = نفس الجهاز فعلًا حتى لو
        // البصمات اختلفوا بسبب لف الشاشة أو تحديث المتصفح أو مسح بيانات التصفح)
        // بحماية ضد المشاركة: الهوية الجديدة ممنوع تكون مربوطة بحساب تاني.
        if (hasAnyBinding && !deviceTrusted && !allowAll) {
          var sameDevice = false
          // **الإنقاذ بمطابقة المكوّنات حتى من غير هوية**: بعض المتصفحات/الإعدادات
          // بتقفل localStorage والكوكيز مع بعض — فالمتصفح مبيبعتش أي dev_ خالص
          // (هوية جديدة كل مرة). لو مكوّنات الجهاز الواردة مطابقة للمخزنة مع الحساب
          // يبقى ده نفس الجهاز فعلًا — ومن غير الحركة دي الجهاز ده كان محجوب للأبد
          // (وهي بالظبط حالة "مش هيدخل على أي حاجة لحد" اللي المستر بلّغ عنها).
          var traitsHit = traitsMatchSameDevice(storedTraits, freshTraits)
          if (traitsHit && current.uuid) {
            try {
              var others = await db.student.findMany({
                where: { id: { not: student.id }, OR: [{ deviceId: current.uuid }, { creationDeviceId: current.uuid }] },
                select: { id: true, deviceTraits: true },
              })
              // نفس الموبايل ممكن يكون عليه أكتر من حساب (اتسجلوا في وقتين مختلفين
              // بينهم مسح بيانات/تحديث متصفح) — بنقارن مكوّنات الحسابات التانية
              // الفيزيائية: كلها متطابقة = نفس الجهاز فعلًا (مش مشاركة)
              sameDevice = checkOthersSamePhysicalDevice(others, freshTraits)
            } catch (gErr) { sameDevice = false }
          } else if (traitsHit && !current.uuid) {
            // مفيش هوية واردة أصلًا → مفيش خطر مشاركة نكشفه — المكوّنات كافية
            sameDevice = true
          }
          // حساب قديم اتسجل قبل نظام المكوّنات خالص (مكوّنات فاضية) ومفيش أي
          // هوية/بصمة مطابقة — مفيش أي طريقة نتحقق بيها من الجهاز ده نهائيًا،
          // ومن غير الحركة دي الحساب بيفضل محجوب للأبد على صاحبه نفسه!
          // أول حد يدخل بالباسورد الصح بيبقى جهاز الحساب (نفس فلسفة فك الربط)
          // وحماية ضد المشاركة: لو الهوية مربوطة بحساب تاني، بنقارن المكوّنات
          // الفيزيائية — متطابقة = نفس الموبايل (مسموح) / مختلفة = مشاركة (ممنوع)
          if (!sameDevice && !storedTraits && current.uuid) {
            try {
              var others2 = await db.student.findMany({
                where: { id: { not: student.id }, OR: [{ deviceId: current.uuid }, { creationDeviceId: current.uuid }] },
                select: { id: true, deviceTraits: true },
              })
              if (others2.length === 0 || checkOthersSamePhysicalDevice(others2, freshTraits)) {
                await db.student.update({
                  where: { id: student.id },
                  data: {
                    deviceId: current.uuid,
                    deviceFp: current.fp,
                    creationDeviceId: current.uuid,
                    creationDeviceFp: current.fp,
                    deviceTraits: freshTraitsStr,
                    deviceType: inDeviceType || (student as any).deviceType || '',
                  },
                })
                ;(student as any).deviceId = current.uuid
                ;(student as any).creationDeviceId = current.uuid
                try {
                  await db.studentActivity.create({
                    data: { studentId: student.id, action: 'device_legacy_rebind', details: 'حساب قديم من غير مكوّنات محفوظة — أول دخول ناجح بعد الترقية بقى هو جهاز الحساب' },
                  })
                } catch (aErr3) {}
                deviceTrusted = true
              }
            } catch (lErr) { console.error('Legacy rebind error:', lErr) }
          }
          if (sameDevice && freshTraits) {
            // نفس الجهاز فعلًا — نحدّث الهوية والبصمة المخزنة (جهاز واحد لسه واحد)
            // لو مفيش هوية واردة (تخزين متقفل) → نسيب المخزنة زي ما هي ومننشئش فاضية
            var newId2 = current.uuid || creationId || storedId
            var newFp2 = current.fp || creationFp || storedFp
            try {
              await db.student.update({
                where: { id: student.id },
                data: {
                  deviceId: newId2,
                  deviceFp: newFp2,
                  creationDeviceId: newId2,
                  creationDeviceFp: newFp2,
                  deviceTraits: JSON.stringify(freshTraits),
                  deviceType: inDeviceType || (student as any).deviceType || '',
                },
              })
              ;(student as any).deviceId = newId2
              ;(student as any).creationDeviceId = newId2
              try {
                await db.studentActivity.create({
                  data: { studentId: student.id, action: 'device_rescued', details: 'نفس الجهاز اتأكد منه بمطابقة مكوّنات الجهاز — اتحدّثت الهوية والبصمة' },
                })
              } catch (aErr2) {}
            } catch (rErr2) { console.error('Device traits rescue error:', rErr2) }
            deviceTrusted = true
          }
        }
        if (hasAnyBinding && !deviceTrusted && !allowAll) {
          // تسجيل محاولة الدخول المحجوبة — المستر يشوف مين حاول يفتح ومن أي جهاز
          try {
            var blockCount = await db.studentActivity.count({
              where: { studentId: student.id, action: 'device_blocked', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
            })
            if (blockCount < 10) {
              // تفاصيل تشخيصية كاملة — المستر يشوف من لوحة التحكم سبب الحجب بالظبط:
              // مين طابق ومين ما طابقش (الهوية/البصمة/مكوّنات الجهاز)
              var diagUuid = !!checkId && checkId.indexOf('dev_') === 0 && current.uuids.indexOf(checkId) !== -1
              var diagFp = !!checkFp && current.dv3.concat(current.dv2).indexOf(checkFp) !== -1
              var diagTraits = String(traitsMatchSameDevice(storedTraits, freshTraits))
              // تشخيص واضح للمستر: الهوية المخزنة مع الحساب مقابل الهوية الواردة —
              // كده أي حجب بيكون مفهوم من لوحة التحكم من غير تخمين
              await db.studentActivity.create({
                data: {
                  studentId: student.id,
                  action: 'device_blocked',
                  details: 'محاولة دخول من جهاز غريب — النوع: ' + (inDeviceType || 'غير معروف') + ' — الهوية الواردة: ' + ((current.uuid || current.fp || 'فاضية').slice(0, 24)) + ' — الهوية المخزنة: ' + ((checkId || checkFp || 'فاضية').slice(0, 24)) + ' — التطابق: هوية=' + (diagUuid ? 'نعم' : 'لا') + ' بصمة=' + (diagFp ? 'نعم' : 'لا') + ' مكوّنات=' + diagTraits,
                },
              })
            }
          } catch (bErr) {}
          return NextResponse.json(
            {
              students: [],
              deviceBlocked: true,
              error: '🚫 لازم تدخل بالجهاز اللي انت عملت من عليه الحساب — الحساب ده مربوط بجهاز واحد بس. لو حصلت معاك أي مشكلة اكتبها في قسم الشكاوي.',
            },
            { status: 403 }
          )
        }
        // المستر عمل سماح والجهاز مش جهاز الحساب → الجهاز ده بيبقى جهاز الإنشاء
        // الجديد نهائيًا (نقل جهاز) والسماح بيتقفل لوحده (مرة واحدة بس)
        if (allowAll && !deviceTrusted && (current.uuid || current.fp)) {
          try {
            await db.student.update({
              where: { id: student.id },
              data: {
                deviceId: current.uuid,
                deviceFp: current.fp,
                creationDeviceId: current.uuid,
                creationDeviceFp: current.fp,
                deviceTraits: freshTraitsStr || ((student as any).deviceTraits || ''),
                deviceType: inDeviceType || (student as any).deviceType || '',
                allowAllDevices: false,
              },
            })
            ;(student as any).deviceId = current.uuid
            ;(student as any).deviceFp = current.fp
            ;(student as any).allowAllDevices = false
            try {
              await db.studentActivity.create({
                data: { studentId: student.id, action: 'device_transferred', details: 'المستر سمح بنقل الحساب لجهاز جديد — اتفقل على الجهاز ده نهائيًا' },
              })
            } catch (aErr) {}
          } catch (bindErr) {
            console.error('Device transfer error:', bindErr)
          }
        } else {
          // ثبيت ربط الإنشاء (مرة واحدة بس):
          // أ) حساب قديم ملوش ربط إنشاء والجهاز اتحقق بنجاح → الربط ده بيثبت نهائي
          // ب) حساب من غير أي ربط خالص → أول جهاز يدخل بيه بيبقى جهاز الإنشاء
          if (!creationId && !creationFp && (current.uuid || current.fp)) {
            try {
              var newCId = current.uuid || (storedId && storedId.indexOf('dev_') === 0 ? storedId : '')
              var newCFp = current.fp || storedFp
              await db.student.update({
                where: { id: student.id },
                data: { creationDeviceId: newCId, creationDeviceFp: newCFp, deviceTraits: freshTraitsStr || ((student as any).deviceTraits || ''), deviceType: inDeviceType || (student as any).deviceType || '' },
              })
              ;(student as any).creationDeviceId = newCId
              ;(student as any).creationDeviceFp = newCFp
              try {
                await db.studentActivity.create({
                  data: { studentId: student.id, action: 'device_creation_bound', details: 'اتثبّت جهاز إنشاء الحساب نهائيًا (مرة واحدة)' },
                })
              } catch (aErr) {}
            } catch (cErr) {
              console.error('Device creation bind error:', cErr)
            }
          }
          // إنقاذ مسح بيانات المتصفح: نفس جهاز الإنشاء (نفس بصمة dv3) لكن هوية جديدة
          // → بنحدّث الهوية العادية **بس** — أعمدة الإنشاء الثابتة مبتتلمس خالص
          if ((fpOk || legacyOk) && current.uuid && current.uuid !== storedId) {
            try {
              await db.student.update({
                where: { id: student.id },
                data: { deviceId: current.uuid },
              })
              ;(student as any).deviceId = current.uuid
              try {
                await db.studentActivity.create({
                  data: { studentId: student.id, action: 'device_rescued', details: 'نفس جهاز الإنشاء (نفس البصمة) بعد مسح بيانات المتصفح — اتحدّثت الهوية بس' },
                })
              } catch (aErr) {}
            } catch (rErr) {
              console.error('Device rescue error:', rErr)
            }
          }
          // جهاز الإنشاء نفسه (هوية أو بصمة مطابقة) → بنحدّث بصمة الإنشاء + المكوّنات
          // عشان الإنقاذ يفضل شغال بعد تحديثات المتصفح أو لف الشاشة.
          // **قاعدة الأمان الجديدة (بعد ما كشفت ثغرة "تسمم المكوّنات")**: المكوّنات
          // المخزنة لازم تفضل دايمًا تمثل جهاز الإنشاء الأصلي — فبنحدّثها **فقط لو**
          // مكوّنات الجهاز الداخل مطابقة للمخزنة (نفس الجهاز الفيزيائي فعلًا).
          // لو جهاز مختلف (داخل بالهوية الصح من أي طريق) → بنحدّث الهوية/البصمة
          // من غير ما نلمس المكوّنات خالص — عشان مفيش جهاز غريب يبوّظ إنقاذ صاحب
          // الجهاز الأصلي بعد كده (دي كانت سبب حجب الحساب على موبايل صاحبه نفسه!)
          if (deviceTrusted && creationId && ((current.fp && current.fp !== creationFp) || (freshTraitsStr && freshTraitsStr !== (student as any).deviceTraits))) {
            var samePhysicalNow = !freshTraits || traitsMatchSameDevice(storedTraits, freshTraits)
            try {
              await db.student.update({
                where: { id: student.id },
                data: samePhysicalNow
                  ? { creationDeviceFp: current.fp || creationFp, deviceFp: current.fp || storedFp, deviceTraits: freshTraitsStr || ((student as any).deviceTraits || '') }
                  : { deviceFp: current.fp || storedFp },
              })
              if (current.fp) { (student as any).deviceFp = current.fp; if (samePhysicalNow) (student as any).creationDeviceFp = current.fp }
              if (samePhysicalNow && freshTraitsStr) (student as any).deviceTraits = freshTraitsStr
            } catch (uErr) {
              console.error('Device fp refresh error:', uErr)
            }
          }
          // ترقية الحساب القديم (dv2): نخزّن الهوية الفريدة الجديدة في الأعمدة العادية
          if (legacyOk && current.uuid && current.uuid !== storedId) {
            try {
              await db.student.update({
                where: { id: student.id },
                data: { deviceId: current.uuid, deviceFp: current.fp },
              })
              ;(student as any).deviceId = current.uuid
              ;(student as any).deviceFp = current.fp
            } catch (upErr) {
              console.error('Device legacy upgrade error:', upErr)
            }
          }
          // حساب قديم من غير نوع جهاز مسجل → نسجّل نوع جهاز الدخول الناجح
          // (بعد ما يتحقق — فمفيش أي طريقة حاجة غريبة تحطم النوع بالغلط)
          if (deviceTrusted && inDeviceType && !(student as any).deviceType) {
            try {
              await db.student.update({ where: { id: student.id }, data: { deviceType: inDeviceType } })
              ;(student as any).deviceType = inDeviceType
            } catch (dtErr) {}
          }
        }
        return NextResponse.json({ students: [{ ...student, watchedVideoCount: 0 }], total: 1, page: 1, pageSize: 1, totalPages: 1 })
      } catch (loginErr: any) {
        console.error('Student login error:', loginErr)
        // مش بنقول "الباسورد غلط" هنا — دي مشكلة سيرفر مش بيانات غلط
        return NextResponse.json(
          { students: [], total: 0, page: 1, pageSize: 1, totalPages: 0, error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' },
          { status: 500 }
        )
      }
    }

    var where: Record<string, unknown> = {}
    if (grade) where.grade = grade
    if (status) where.status = status
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { phone: { contains: keyword } },
      ]
    }

    var [students, total] = await Promise.all([
      db.student.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { _count: { select: { activities: true } } },
      }),
      db.student.count({ where }),
    ])

    var allStudentIds = students.map(function(s) { return s.id })
    var watchedVideos = allStudentIds.length > 0
      ? await db.studentActivity.groupBy({
          by: ['studentId'],
          where: { studentId: { in: allStudentIds }, action: 'watched_video' },
          _count: { id: true },
        })
      : []
    var watchMap: Record<string, number> = {}
    for (var w = 0; w < watchedVideos.length; w++) {
      watchMap[watchedVideos[w].studentId] = watchedVideos[w]._count.id
    }

    // آخر محاولة حجب جهاز لكل طالب — المستر يشوف **سبب الحجب** جوه الصف نفسه
    // (التطابق: هوية/بصمة/مكوّنات) من غير ما يفتح سجل الأنشطة
    var blockMap: Record<string, { details: string; createdAt: Date }> = {}
    if (allStudentIds.length > 0) {
      try {
        var recentBlocks = await db.studentActivity.findMany({
          where: { studentId: { in: allStudentIds }, action: 'device_blocked' },
          orderBy: { createdAt: 'desc' },
          take: 300,
        })
        for (var bi = 0; bi < recentBlocks.length; bi++) {
          var bStu = recentBlocks[bi].studentId
          if (!blockMap[bStu]) blockMap[bStu] = { details: recentBlocks[bi].details || '', createdAt: recentBlocks[bi].createdAt }
        }
      } catch (bkErr) {}
    }

    var studentsWithStats = students.map(function(s) {
      return { ...s, watchedVideoCount: watchMap[s.id] || 0, lastDeviceBlock: blockMap[s.id] || null }
    })

    return NextResponse.json({
      students: studentsWithStats,
      total: total,
      page: page,
      pageSize: pageSize,
      totalPages: Math.ceil(total / pageSize),
    })
  } catch (error) {
    console.error('Students fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch students' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureStudentSchema()
    var body = await request.json()
    var name = body.name || ''
    var phone = body.phone || ''
    var grade = body.grade || ''
    var status = body.status || 'pending'
    var parentName = body.parentName || body.fatherName || ''
    var parentPhone = body.parentPhone || body.motherPhone || ''
    var password = body.password || ''
    // ربط الجهاز: الحساب بيتقيد على الجهاز اللي اتعمل بيه
    // (نتعامل مع "null" النصية القديمة كأنها فاضية)
    var rawDeviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
    var deviceId = ['null', 'undefined', 'dev_null', 'none'].indexOf(rawDeviceId) !== -1 ? '' : rawDeviceId
    var deviceFp = ''
    // مكوّنات جهاز الإنشاء الخام — بتتخزن عشان التعرف على نفس الجهاز بعد كده
    // حتى لو البصمة الدقيقة اتغيرت (لف الشاشة / تحديث متصفح / مسح بيانات)
    var deviceTraits = typeof body.deviceTraits === 'string' && body.deviceTraits.length <= 4000 ? body.deviceTraits : ''
    // نوع جهاز إنشاء الحساب (موبايل/تابلت/كمبيوتر) — يظهر للمستر في لوحة التحكم
    var deviceType = pickDeviceType(body.deviceType)
    // جهاز الإنشاء الثابت: بيتكتب هنا **مرة واحدة** وعمرك ما يتغير بعد كده
    var creationDeviceId = deviceId.indexOf('dev_') === 0 ? deviceId : ''
    var creationDeviceFp = ''
    // نوزّع قايمة المرشحين: هوية فريدة (dev_) + بصمة ناتج الجهاز (dv3_/dv2_)
    if (Array.isArray(body.deviceIds)) {
      for (var di = 0; di < body.deviceIds.length; di++) {
        var cand = body.deviceIds[di]
        if (typeof cand !== 'string' || !cand || ['null', 'undefined', 'dev_null', 'none'].indexOf(cand) !== -1) continue
        if (!deviceId && cand.indexOf('dev_') === 0) deviceId = cand
        if (!deviceFp && (cand.indexOf('dv3_') === 0 || cand.indexOf('dv2_') === 0)) deviceFp = cand
        if (!creationDeviceId && cand.indexOf('dev_') === 0) creationDeviceId = cand
        if (!creationDeviceFp && (cand.indexOf('dv3_') === 0 || cand.indexOf('dv2_') === 0)) creationDeviceFp = cand
      }
    }
    // الهوية الفريدة هي الأساس — لو مش موجودة ناخد البصمة (في الأعمدة العادية)
    if (!deviceId && deviceFp) deviceId = deviceFp

    if (!name || !phone || !grade) {
      return NextResponse.json({ error: 'الاسم ورقم الهاتف والصف مطلوبين' }, { status: 400 })
    }

    var student: any = null
    try {
      student = await db.student.create({
        data: {
          name: name,
          phone: phone,
          grade: grade,
          status: status,
          parentName: parentName,
          parentPhone: parentPhone,
          password: password,
          deviceId: deviceId,
          deviceFp: deviceFp,
          deviceTraits: deviceTraits,
          deviceType: deviceType,
          creationDeviceId: creationDeviceId,
          creationDeviceFp: creationDeviceFp,
        },
      })
    } catch (cErr: any) {
      // الرقم متسجل قبل كده (unique) → رسالة عربية واضحة بدل الخطأ التقني —
      // دي كانت سبب "مشكلة تسجيل الحساب": الطالب بيجرب تاني فيفشل من غير ما يفهم
      if (cErr && cErr.code === 'P2002') {
        return NextResponse.json(
          { error: '⚠️ الرقم ده متسجل قبل كده في المنصة — لو الحساب ده بتاعك اعمل تسجيل دخول عادي بالرقم وكلمة السر، ولو نسيت كلمة السر أو قابلتك أي مشكلة اكتبها في قسم الشكاوي' },
          { status: 409 }
        )
      }
      throw cErr
    }

    try {
      await db.studentActivity.create({
        data: { studentId: student.id, action: 'registered', details: 'Registered as ' + grade },
      })
    } catch (_) {}

    fetch((process.env.NEXT_PUBLIC_BASE_URL || '') + '/api/notify-admin', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentName: name, studentPhone: phone, studentGrade: grade, parentName: parentName, parentPhone: parentPhone }),
    }).catch(function() {})

    return NextResponse.json({ message: 'Student created', student: student }, { status: 201 })
  } catch (error: any) {
    console.error('Student create error:', error)
    return NextResponse.json({ error: 'Failed to create student: ' + (error.message || 'Unknown error') }, { status: 500 })
  }
}
