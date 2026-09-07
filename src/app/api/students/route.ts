import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { makeLibsqlClient, ensureSchema } from '@/lib/ensure-schema'

// ===== إصلاح ذاتي للجدول (مهم للإنتاج) =====
// لو عمود ناقص في قاعدة Turso (زي deviceFp بعد الترقية)، أي استعلام طالب
// كان بيفشل صامتةً والدخول كان بيبان كأن "الباسورد غلط" لكل الناس من كل
// الأجهزة. الدالة دي بتشتغل مرة واحدة لكل سيرفر: بتجرب استعلام خفيف، ولو
// فشلت بتشغّل ensureSchema الكاملة وبتصلّح الجدول فورًا.
var schemaReady: Promise<void> | null = null
function ensureStudentSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async function () {
      try {
        await db.$queryRawUnsafe('SELECT deviceFp, deviceId, allowAllDevices FROM Student LIMIT 1')
      } catch (e) {
        try {
          var client = makeLibsqlClient()
          if (client) {
            try { await ensureSchema(client) } finally { try { await client.close() } catch (e2) {} }
          }
        } catch (e2) {}
      }
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

export async function GET(request: NextRequest) {
  try {
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
        // ===== قفل الجهاز الصارم (شغال دايمًا — من غير مفتاح) =====
        // المستر قال صراحة (4 مرات): "جهاز واحد بس — الجهاز اللي اتعمل بيه
        // الحساب هو اللي يقدر يدخل". يعني أي جهاز تاني (حتى لو موبايل من
        // نفس الموديل) لازم يتمنع فورًا ويظهر له رسالة حمراء.
        //
        // الدرس اللي اتاخد: المطابقة بالبصمة (dv3_) كانت بتفتح الحساب من أي
        // موبايل شبهه — لأن موبايلين من نفس الموديل بيطلعوا نفس البصمة
        // (نفس الشاشة + نفس الكانفس + نفس كارت الشاشة). فالمطابقة دلوقتي
        // **بالهمية الفريدة (dev_) بس** — مفيش جهازين في الدنيا ليهم نفس الـ ID.
        // البصمة (dv3_) بتتحفظ للتشخيص عند المستر بس، ومبتفتحش حاجة.
        //
        // الاستثناء الوحيد: الحسابات القديمة جدًا المربوطة ببصمة dv2_ بس
        // (قبل نظام الهوية الفريدة) — أول ما تدخل من جهازها بترتبط بالهوية
        // الفريدة الجديدة وترجع مقفولة زي أي حساب (ترقية لمرة واحدة).
        var storedId = ((student as any).deviceId || '').trim()
        var storedFp = ((student as any).deviceFp || '').trim()
        // إصدارات قديمة: "null" نصية → فاضية
        if (LEGACY_IDS.indexOf(storedId) !== -1) storedId = ''
        if (LEGACY_IDS.indexOf(storedFp) !== -1) storedFp = ''
        // هجرة قديمة: حسابات اتربطت ببصمة dv2_ في خانة deviceId (إصدار سابق)
        // → نعاملها كبصمة مش كهوية فريدة
        if (storedId.indexOf('dv2_') === 0 || storedId.indexOf('dv3_') === 0) {
          if (!storedFp) storedFp = storedId
          storedId = ''
        }
        // المطابقة الصارمة + مسارات إنقاذ محدودة (الكل بيقفل الحساب على جهاز واحد في الآخر):
        // 1) الهوية الفريدة (dev_) — الطريق الأساسي
        var uuidOk = !!storedId && !!current.uuid && current.uuid === storedId
        // 2) إنقاذ بالبصمة dv3_: نفس الجهاز الفعلي بس مسح بيانات المتصفح
        //    (الهوية بتتولد من جديد لكن البصمة ثابتة) → بنسمح ونعيد الربط
        //    بالهوية الجديدة فالحساب يفضل مقفول على نفس الجهاز الفعلي.
        var fpOk = !!storedFp && storedFp.indexOf('dv3_') === 0 && !!current.fp && current.fp === storedFp && !uuidOk
        // 3) ترقية dv2_: حسابات عصر البصمة القديمة لسه بيبعت نفس القيمة
        var legacyUpgrade = !storedId && !!storedFp && storedFp.indexOf('dv2_') === 0 && !!current.fp && current.fp === storedFp
        // 4) استصحار حسابات dv2_: الجهاز الأصلي نفسه مش بيبعت القيمة القديمة تاني
        //    (الكود الجديد بيكتب فوقها) فكانت بتفضل مقفولة للأبد حتى على جهازها —
        //    أول جهاز يدخل بالرقم والباسورد الصح بياخد الربط نهائيًا، والحساب
        //    يرجع مقفول على جهازه زي أي حساب (مرة واحدة بس).
        var legacyClaim = !storedId && !!storedFp && storedFp.indexOf('dv2_') === 0 && (!!current.uuid || !!current.fp) && !legacyUpgrade
        var deviceTrusted = uuidOk || fpOk || legacyUpgrade || legacyClaim
        var hasBinding = !!storedId || !!storedFp
        // الجهاز الحالي مش جهاز الحساب → مرفوض فورًا (حتى لو المتصفح مبعتش قيم)
        if (hasBinding && !deviceTrusted && !(student as any).allowAllDevices) {
          return NextResponse.json(
            {
              students: [],
              deviceBlocked: true,
              error: '🚫 لازم تدخل بالجهاز اللي انت عملت من عليه الحساب — الحساب ده مربوط بجهاز واحد بس. لو جهازك اتغيّر، كلمن المستر يعمل لك سماح من لوحة التحكم.',
            },
            { status: 403 }
          )
        }
        // ترقية/استصحار الحساب القديم: بيتقفل على هوية الجهاز ده نهائيًا
        if ((legacyUpgrade || legacyClaim) && (current.uuid || current.fp)) {
          try {
            await db.student.update({
              where: { id: student.id },
              data: { deviceId: current.uuid || current.fp, deviceFp: current.fp || storedFp },
            })
            ;(student as any).deviceId = current.uuid || current.fp
            try {
              await db.studentActivity.create({
                data: { studentId: student.id, action: 'device_rebound', details: 'ترقية ربط الحساب القديم لجهاز جديد نهائيًا' },
              })
            } catch (aErr) {}
          } catch (upErr) {
            console.error('Device legacy upgrade error:', upErr)
          }
        }
        // إنقاذ بالبصمة: نفس الجهاز الفعلي بعد مسح بيانات المتصفح → نعيد ربط
        // الهوية الفريدة الجديدة عشان الدخول يفضل شغال من نفس الجهاز
        if (fpOk && current.uuid && current.uuid !== storedId) {
          try {
            await db.student.update({
              where: { id: student.id },
              data: { deviceId: current.uuid },
            })
            ;(student as any).deviceId = current.uuid
            try {
              await db.studentActivity.create({
                data: { studentId: student.id, action: 'device_rescued', details: 'نفس الجهاز (نفس البصمة) بعد مسح بيانات المتصفح — اتاعاد الربط تلقائيًا' },
              })
            } catch (aErr) {}
          } catch (rErr) {
            console.error('Device rescue rebind error:', rErr)
          }
        }
        // أول تسجيل دخول (حساب عمله الأدمن) → الجهاز ده بيتسجل بشكل دائم
        if (!hasBinding && (current.uuid || current.fp)) {
          try {
            await db.student.update({
              where: { id: student.id },
              data: { deviceId: current.uuid, deviceFp: current.fp },
            })
            ;(student as any).deviceId = current.uuid
            ;(student as any).deviceFp = current.fp
          } catch (bindErr) {
            console.error('Device bind error:', bindErr)
          }
        } else if (!deviceTrusted && (student as any).allowAllDevices && (current.uuid || current.fp)) {
          // المستر عمل سماح → أول جهاز يدخل بيه بيبقى جهاز الحساب الجديد
          // والسماح بيتقفل لوحده (مرة واحدة بس) — الحساب يرجع مقفول على جهازه
          try {
            await db.student.update({
              where: { id: student.id },
              data: { deviceId: current.uuid, deviceFp: current.fp, allowAllDevices: false },
            })
            ;(student as any).deviceId = current.uuid
            ;(student as any).deviceFp = current.fp
            ;(student as any).allowAllDevices = false
          } catch (bindErr) {
            console.error('Device rebind error:', bindErr)
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
    // نوزّع قايمة المرشحين: هوية فريدة (dev_) + بصمة ناتج الجهاز (dv3_/dv2_)
    if (Array.isArray(body.deviceIds)) {
      for (var di = 0; di < body.deviceIds.length; di++) {
        var cand = body.deviceIds[di]
        if (typeof cand !== 'string' || !cand || ['null', 'undefined', 'dev_null', 'none'].indexOf(cand) !== -1) continue
        if (!deviceId && cand.indexOf('dev_') === 0) deviceId = cand
        if (!deviceFp && (cand.indexOf('dv3_') === 0 || cand.indexOf('dv2_') === 0)) deviceFp = cand
      }
    }
    // الهوية الفريدة هي الأساس — لو مش موجودة ناخد البصمة
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
