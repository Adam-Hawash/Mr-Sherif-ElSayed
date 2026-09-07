import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
        var student = await db.student.findFirst({
          where: { phone },
          include: { _count: { select: { activities: true } } },
        })
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
        // المستر قال صراحة: "جهاز واحد اللي هو عامل منه الحساب من الأول".
        // الربط مزدوج: هوية فريدة (dev_) + بصمة ناتج الجهاز (dv3_) —
        // ومفيش أي جهاز تاني بيدخل غير لو المستر عمل "سماح" للحساب.
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
        // المطابقة: الهوية الفريدة أو البصمة — واحدة تكفي (نفس الجهاز)
        var uuidOk = !!storedId && !!current.uuid && current.uuid === storedId
        var fpOk = !!storedFp && !!current.fp && current.fp === storedFp
        var deviceTrusted = uuidOk || fpOk
        var hasBinding = !!storedId || !!storedFp
        // الجهاز الحالي مش جهاز الحساب → مرفوض (حتى لو المتصفح مبعتش قيم)
        if (hasBinding && !deviceTrusted && !(student as any).allowAllDevices) {
          return NextResponse.json(
            {
              students: [],
              deviceBlocked: true,
              error: 'الحساب ده مربوط بجهاز واحد بس (الجهاز اللي اتعمل بيه). الدخول من الجهاز ده محتاج المستر يعمل لك سماح من لوحة التحكم.',
            },
            { status: 403 }
          )
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
        return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
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
