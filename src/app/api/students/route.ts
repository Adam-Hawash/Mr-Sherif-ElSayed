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
function pickDeviceIds(candidates: string[]): { uuid: string; fp: string } {
  var uuid = ''
  var fp = ''
  for (var i = 0; i < candidates.length; i++) {
    var c = candidates[i]
    if (!uuid && c.indexOf('dev_') === 0) uuid = c
    if (!fp && (c.indexOf('dv3_') === 0 || c.indexOf('dv2_') === 0)) fp = c
  }
  return { uuid: uuid, fp: fp }
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
        // نوع جهاز الدخول الحالي (موبايل/تابلت/كمبيوتر) — للتسجيل وللحسابات
        // القديمة اللي اتعملت قبل ما نبدأ نحفظ النوع
        var inDeviceType = pickDeviceType(searchParams.get('deviceType'))

        // التحقق ضد **ربط الإنشاء الثابت** الأول، ولو فاضي (حساب قديم قبل الترحيل)
        // ضد الربط العادي — ومن غير أي إعادة ربط للأجهزة الغريبة في الحالتين
        var checkId = creationId || storedId
        var checkFp = creationFp || storedFp
        var uuidOk = !!checkId && checkId.indexOf('dev_') === 0 && !!current.uuid && current.uuid === checkId
        var fpOk = !!checkFp && checkFp.indexOf('dv3_') === 0 && !!current.fp && current.fp === checkFp && !uuidOk
        var legacyOk = !!checkFp && checkFp.indexOf('dv2_') === 0 && !!current.fp && current.fp === checkFp && !uuidOk && !fpOk
        var hasAnyBinding = !!(creationId || creationFp || storedId || storedFp)
        var deviceTrusted = uuidOk || fpOk || legacyOk
        // الجهاز الحالي مش جهاز إنشاء الحساب → مرفوض فورًا (حتى لو المتصفح مبعتش قيم)
        if (hasAnyBinding && !deviceTrusted && !allowAll) {
          return NextResponse.json(
            {
              students: [],
              deviceBlocked: true,
              error: '🚫 لازم تدخل بالجهاز اللي انت عملت من عليه الحساب — الحساب ده مربوط بجهاز واحد بس. لو حصلت معاك أي مشكلة كلم المستر.',
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
                data: { creationDeviceId: newCId, creationDeviceFp: newCFp, deviceType: inDeviceType || (student as any).deviceType || '' },
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
          if (fpOk && current.uuid && current.uuid !== storedId) {
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
          // جهاز الإنشاء نفسه (هوية مطابقة) وطلب بصمة أحدث (المتصفح اتحدّث)
          // → بنحدّث بصمة الإنشاء عشان الإنقاذ يفضل شغال بعد تحديثات المتصفح
          // (آمن: محتاج مطابقة الهوية الفريدة لجهاز الإنشاء نفسه)
          if (uuidOk && creationId && current.fp && current.fp !== creationFp) {
            try {
              await db.student.update({
                where: { id: student.id },
                data: { creationDeviceFp: current.fp, deviceFp: current.fp },
              })
              ;(student as any).creationDeviceFp = current.fp
              ;(student as any).deviceFp = current.fp
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

    var studentsWithStats = students.map(function(s) {
      return { ...s, watchedVideoCount: watchMap[s.id] || 0 }
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

    var student = await db.student.create({
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
        deviceType: deviceType,
        creationDeviceId: creationDeviceId,
        creationDeviceFp: creationDeviceFp,
      },
    })

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
