import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

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
      // بصمة الجهاز — نسخ متعددة من نفس الجهاز (localStorage + cookie + بصمة ثابتة
      // محسوبة من خصائص الجهاز = "ناتج الجهاز"). أي نسخة تطابق الحساب تعدي.
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
      // الربط الدائم بيكون على بصمة "ناتج الجهاز" (dv2_) الأولويّة —
      // دي القيمة الثابتة اللي بترجع دايمًا حتى بعد مسح بيانات المتصفح
      var primaryDevice = ''
      for (var pi = 0; pi < candidates.length; pi++) {
        if (candidates[pi].indexOf('dv2_') === 0) { primaryDevice = candidates[pi]; break }
      }
      if (!primaryDevice) primaryDevice = candidates[0] || deviceId || ''
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
        // ===== قفل الجهاز الصارم (شغال دايمًا — من غير مفتاح) =====
        // المستر قال صراحة: "جهاز واحد اللي هو عامل منه الحساب من الأول".
        // القاعدة: الحساب بيتقفل على الجهاز اللي اتعمل بيه بس.
        // - نفس الجهاز بيدخل دايمًا حتى لو بيانات المتصفح اتمسحت، لأن بصمة
        //   "ناتج الجهاز" الثابتة (dv2) موجودة دايمًا في القائمة.
        // - أي جهاز تاني → مرفوض، والفتح الوحيد: المستر يعمل "سماح" للحساب
        //   (أول جهاز يدخل بعدها بيبقى جهاز الحساب الجديد بشكل دائم).
        // IDs بايظة من إصدارات قديمة (اتخزنت كنص "null" مثلاً) → نعتبرها زي ما تكون فاضية
        var LEGACY_IDS = ['null', 'undefined', 'dev_null', 'none', '']
        var storedId = (student as any).deviceId || ''
        var storedIsBroken = LEGACY_IDS.indexOf(storedId) !== -1
        var deviceTrusted = !storedIsBroken && !!storedId && candidates.indexOf(storedId) !== -1
        // الحساب مربوط بجهاز معين + المستر ماسمحش بكل الأجهزة + الجهاز الحالي
        // مش من الأجهزة المعروفة → مرفوض
        if (
          storedId &&
          !storedIsBroken &&
          !deviceTrusted &&
          !(student as any).allowAllDevices &&
          candidates.length > 0
        ) {
          return NextResponse.json(
            {
              students: [],
              deviceBlocked: true,
              error: 'الحساب ده مربوط بجهاز واحد بس (الجهاز اللي اتعمل بيه). الدخول من الجهاز ده محتاج المستر يعمل لك سماح من لوحة التحكم.',
            },
            { status: 403 }
          )
        }
        // أول تسجيل دخول (حساب عمله الأدمن مثلاً) أو ربط قديم بايظ → الجهاز ده بيتسجل
        if ((!storedId || storedIsBroken) && primaryDevice) {
          try {
            await db.student.update({ where: { id: student.id }, data: { deviceId: primaryDevice } })
            ;(student as any).deviceId = primaryDevice
          } catch (bindErr) {
            console.error('Device bind error:', bindErr)
          }
        } else if (!deviceTrusted && (student as any).allowAllDevices && primaryDevice) {
          // المستر عمل سماح للطالب → أول جهاز يدخل بيه بيبقى جهاز الحساب الجديد
          // (كده لو المستر شال السماح بعدين، الطالب يفضل شغال على جهازه)
          try {
            await db.student.update({ where: { id: student.id }, data: { deviceId: primaryDevice } })
            ;(student as any).deviceId = primaryDevice
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
    // بصمة الجهاز: الحساب بيتقيد على الجهاز اللي اتعمل بيه
    // (نتعامل مع "null" النصية القديمة كأنها فاضية)
    var rawDeviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
    var deviceId = ['null', 'undefined', 'dev_null', 'none'].indexOf(rawDeviceId) !== -1 ? '' : rawDeviceId
    // احتياطي: لو الـ ID الأساسي فاضي بس فيه قايمة مرشحين → ناخد أول واحد
    if (!deviceId && Array.isArray(body.deviceIds)) {
      for (var di = 0; di < body.deviceIds.length; di++) {
        var cand = body.deviceIds[di]
        if (typeof cand === 'string' && cand && ['null', 'undefined', 'dev_null', 'none'].indexOf(cand) === -1) {
          deviceId = cand
          break
        }
      }
    }

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
