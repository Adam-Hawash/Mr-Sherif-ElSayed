import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { makeLibsqlClient, ensureSchema } from '@/lib/ensure-schema'

// ============================================================
// نظام ربط الجهاز — إصدار 5 (البساطة نفسها)
// ============================================================
// طلب المستر الحرفي (المرة دي من غير أي تعقيد):
//   "أي طالب يعمل تسجيل دخول دلوقتي أو يعمل إنشاء حساب — تاخد بيانات
//    الجهاز بتاعته وهو ده الجهاز اللي يدخل بيه على طول، جهاز واحد بس"
//
// القواعد (كلها):
//   1) أول تسجيل دخول ناجح (أو إنشاء حساب) → الجهاز ده بيتسجل **للأبد**
//   2) أي جهاز تاني → مرفوض برسالة واضحة (يروح قسم الشكاوي)
//   3) المستر عنده زرار واحد بس في لوحة التحكم: "فك الربط" — بعد فك
//      الربط أول جهاز يدخل تاني بيبقى جهاز الحساب الجديد للأبد
//   4) مفيش أي إعادة ربط تلقائية لأي جهاز غريب — عمرها ما تحصل
// ============================================================

// ===== إصلاح ذاتي للجدول (مهم للإنتاج) =====
var schemaReady: Promise<void> | null = null
function ensureStudentSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async function () {
      // إصلاح الجدول الذاتي (أعمدة ناقصة في الإنتاج)
      try {
        var client = makeLibsqlClient()
        if (client) {
          try { await ensureSchema(client) } finally { try { await client.close() } catch (e2) {} }
        }
      } catch (e) {}
      // ============================================================
      // **فك ربط كل الأجهزة الموجودة — لمرة واحدة (طلب المستر 2026-ح)**
      // ============================================================
      // "بص من أول دلوقتي أنا عاوزك تعملي دي: لحاجة تفك الربط خالص
      //  من على كل الأجهزة اللي موجودة" — بنمسح كل الروابط القديمة
      // (اللي كانت متلخبطة وبتحجب طلاب من أجهزتهم) وبنبدأ صفحة جديدة:
      // أول جهاز يعمله تسجيل دخول بعد التحديث = جهاز الحساب للأبد.
      // العلم في SiteConfig بيمنع تكرار المسح.
      try {
        var flag = null as any
        try { flag = await db.siteConfig.findUnique({ where: { key: 'device_reset_v5' } }) } catch (e0) {}
        if (!flag || flag.value !== '1') {
          try {
            await db.student.updateMany({
              data: { deviceId: '', deviceFp: '', deviceTraits: '', creationDeviceId: '', creationDeviceFp: '', allowAllDevices: false },
            })
            try {
              await db.siteConfig.create({ data: { key: 'device_reset_v5', value: '1' } })
            } catch (e1) {
              try { await db.siteConfig.update({ where: { key: 'device_reset_v5' }, data: { value: '1' } }) } catch (e2) {}
            }
            console.log('[device-reset-v5] تم فك ربط كل الأجهزة القديمة — أول تسجيل دخول بعد كده بيربط الحساب بجهازه للأبد')
          } catch (e3) {
            console.error('[device-reset-v5] failed:', e3)
          }
        }
      } catch (eReset) {}
    })()
  }
  return schemaReady
}

// ===== أدوات تصنيف قيم الجهاز =====
// الهوية الفريدة (dev_) = رقم عشوائي لكل متصفح — الأساس في المطابقة
// البصمة (dv3_/dv2_) = ناتج خصائص الجهاز — بتنقذ الدخول لو بيانات المتصفح اتمسحت
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

// ===== مطابقة مكوّنات الجهاز (التعرف على نفس الموبايل/الكمبيوتر فعلًا) =====
// لو الهوية والبصمة اختلفوا (مسح بيانات المتصفح / لف الشاشة / تحديث المتصفح)
// بنقارن مكوّنات الجهاز المخزنة مع الواردة: الشاشة + المنصة لازم يتطابقوا،
// والباقي 70%+ — كده نفس الجهاز بيتعرف عليه حتى بعد مسح بيانات التصفح،
// وموبايل تاني مختلف بيرفض (ده اللي يمنع مشاركة الحسابات).
function parseTraitsJson(s: any): Record<string, string> | null {
  try {
    if (!s || typeof s !== 'string' || s.length < 10 || s.length > 4000) return null
    var o = JSON.parse(s)
    if (!o || typeof o !== 'object' || Array.isArray(o)) return null
    return o
  } catch (e) { return null }
}

// مقاس الشاشة بيتقارن من غير ترتيب (الصغير×الكبير) — لف الموبايل ما يكسرش المطابقة
function dimsPair(t: Record<string, string>): string {
  var a = parseInt(t.sw || '0', 10) || 0
  var b = parseInt(t.sh || '0', 10) || 0
  return a < b ? a + 'x' + b : b + 'x' + a
}

function traitsMatchSameDevice(stored: Record<string, string> | null, fresh: Record<string, string> | null): boolean {
  if (!stored || !fresh) return false
  if (stored.fallback === '1' || fresh.fallback === '1') return false
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

var LEGACY_IDS = ['null', 'undefined', 'dev_null', 'none', '']
function cleanId(v: any): string {
  var s = String(v || '').trim()
  return LEGACY_IDS.indexOf(s) !== -1 ? '' : s
}

// أنواع الأجهزة المسموح تخزينها: موبايل/تابلت/كمبيوتر
var DEVICE_TYPES = ['mobile', 'tablet', 'computer']
function pickDeviceType(v: any): string {
  return typeof v === 'string' && DEVICE_TYPES.indexOf(v) !== -1 ? v : ''
}

export async function GET(request: NextRequest) {
  try {
    await ensureStudentSchema()
    var searchParams = new URL(request.url).searchParams
    var phone = searchParams.get('phone')
    var grade = searchParams.get('grade')
    var status = searchParams.get('status')
    var keyword = searchParams.get('keyword')
    var page = parseInt(searchParams.get('page') || '1')
    var pageSize = parseInt(searchParams.get('pageSize') || '20')

    if (phone) {
      // ===== تسجيل الدخول =====
      var password = searchParams.get('password') || ''
      var candidates: string[] = []
      try {
        var rawIds = JSON.parse(searchParams.get('deviceIds') || '[]')
        if (Array.isArray(rawIds)) {
          for (var ci = 0; ci < rawIds.length; ci++) {
            if (typeof rawIds[ci] === 'string' && rawIds[ci] && candidates.indexOf(rawIds[ci]) === -1) candidates.push(rawIds[ci])
          }
        }
      } catch (e) {}
      var deviceIdParam = searchParams.get('deviceId') || ''
      if (deviceIdParam && candidates.indexOf(deviceIdParam) === -1) candidates.unshift(deviceIdParam)
      var current = pickDeviceIds(candidates)
      try {
        var student = null as any
        try {
          student = await db.student.findFirst({
            where: { phone },
            include: { _count: { select: { activities: true } } },
          })
        } catch (qErr: any) {
          await ensureStudentSchema()
          student = await db.student.findFirst({
            where: { phone },
            include: { _count: { select: { activities: true } } },
          })
        }
        if (!student) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        // الباسورد الأول — لو غلط مفيش أي حاجة اسمها جهاز
        if (!password || student.password !== password) {
          return NextResponse.json({ students: [], total: 0, page: 1, pageSize: 1, totalPages: 0 })
        }
        // الحسابات المرفوضة ممنوع تدخل خالص
        var st = (student as any).status
        if (st === 'rejected' || st === 'refused') {
          return NextResponse.json(
            { students: [], deviceBlocked: false, error: '❌ الحساب بتاعك مرفوض من المنصة. لو عندك استفسار تواصل مع المستر' },
            { status: 403 }
          )
        }

        // ============================================================
        // قاعدة الجهاز الواحد — بأبسط شكل ممكن:
        //   مفيش ربط؟ → الجهاز ده بيتسجل دلوقتي للأبد ✅
        //   فيه ربط ومطابق؟ → دخول عادي ✅
        //   فيه ربط ومش مطابق؟ → رفض 403 🚫
        // ============================================================
        var allowAll = !!(student as any).allowAllDevices
        if (!allowAll) {
          var storedId = cleanId((student as any).deviceId)
          var storedFp = cleanId((student as any).deviceFp)
          // احتياط للنسخ القديمة: ربط مخزن في أعمدة الإنشاء
          if (!storedId) storedId = cleanId((student as any).creationDeviceId)
          if (!storedFp) storedFp = cleanId((student as any).creationDeviceFp)
          var freshTraits = parseTraitsJson(searchParams.get('deviceTraits') || '')
          var freshTraitsStr = freshTraits ? JSON.stringify(freshTraits) : ''
          var storedTraits = parseTraitsJson((student as any).deviceTraits || '')
          var inDeviceType = pickDeviceType(searchParams.get('deviceType'))

          // المطابقة: الهوية أولًا، بعدين البصمة، بعدين مكوّنات الجهاز
          var uuidOk = !!storedId && storedId.indexOf('dev_') === 0 && current.uuids.indexOf(storedId) !== -1
          var fpOk = !uuidOk && !!storedFp && current.dv3.concat(current.dv2).indexOf(storedFp) !== -1
          var traitsOk = !uuidOk && !fpOk && traitsMatchSameDevice(storedTraits, freshTraits)

          if (!storedId && !storedFp) {
            // ---------- أول تسجيل دخول (أول ما يتربط للأبد) ----------
            var bindId = current.uuid || ''
            var bindFp = current.fp || ''
            if (bindId || bindFp) {
              try {
                await db.student.update({
                  where: { id: student.id },
                  data: {
                    deviceId: bindId,
                    deviceFp: bindFp,
                    creationDeviceId: bindId,
                    creationDeviceFp: bindFp,
                    deviceTraits: freshTraitsStr,
                    deviceType: inDeviceType || (student as any).deviceType || '',
                  },
                })
                ;(student as any).deviceId = bindId
                ;(student as any).deviceFp = bindFp
                try {
                  await db.studentActivity.create({
                    data: { studentId: student.id, action: 'device_bound', details: 'الجهاز ده بقى جهاز الحساب — أول تسجيل دخول (نوع الجهاز: ' + (inDeviceType || 'غير معروف') + ')' },
                  })
                } catch (aErr) {}
              } catch (bErr) {
                console.error('Device bind error:', bErr)
                // فشل تخزين الربط ما يمنعش الدخول — الطالب أهم حاجة
              }
            }
            // لو المتصفح مبعتش أي قيم جهاز خالص → مسموح يدخل عادي (مفيش إيه نتحقق بيه)
          } else if (!uuidOk && !fpOk && !traitsOk) {
            // ---------- جهاز مختلف → رفض ----------
            try {
              var blockCount = await db.studentActivity.count({
                where: { studentId: student.id, action: 'device_blocked', createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } },
              })
              if (blockCount < 10) {
                // سجل نظيف للمستر من غير أي أكواد تقنية — النوع والتاريخ بس
                await db.studentActivity.create({
                  data: {
                    studentId: student.id,
                    action: 'device_blocked',
                    details: 'محاولة دخول من جهاز تاني (اتمنعت) — نوع الجهاز: ' + (inDeviceType || 'غير معروف'),
                  },
                })
              }
            } catch (bErr2) {}
            return NextResponse.json(
              {
                students: [],
                deviceBlocked: true,
                error: '🚫 الحساب ده مربوط بجهاز تاني — لازم تدخل من الجهاز اللي اتسجلت بيه أول مرة. لو غيرت الجهاز أو حصلت أي مشكلة اكتبها في قسم الشكاوي.',
              },
              { status: 403 }
            )
          } else {
            // ---------- نفس الجهاز اتأكد → دخول + نحدّث بيانات الربط لو اتغيرت ----------
            // مسح بيانات المتصفح / تحديث المتصفح بيغير الهوية أو البصمة —
            // بنحدّثها عشان الطالب ما يتحجبش غلط بعدين (نفس الجهاز فعلًا)
            var needUpdate = false
            var upd: Record<string, any> = {}
            if (uuidOk && current.uuid && current.uuid !== storedId) {
              upd.deviceId = current.uuid
              upd.creationDeviceId = current.uuid
              needUpdate = true
            }
            if (current.fp && current.fp !== ((student as any).deviceFp || '')) {
              upd.deviceFp = current.fp
              upd.creationDeviceFp = current.fp
              needUpdate = true
            }
            if (freshTraitsStr && freshTraitsStr !== ((student as any).deviceTraits || '')) {
              // بنحدّث المكوّنات بس لو نفس الجهاز الفيزيائي (بالمطابقة) — أمان
              if (traitsOk || uuidOk || fpOk) {
                upd.deviceTraits = freshTraitsStr
                needUpdate = true
              }
            }
            if (inDeviceType && !(student as any).deviceType) {
              upd.deviceType = inDeviceType
              needUpdate = true
            }
            if (needUpdate) {
              try {
                await db.student.update({ where: { id: student.id }, data: upd })
                if (upd.deviceId) (student as any).deviceId = upd.deviceId
                if (upd.deviceFp) (student as any).deviceFp = upd.deviceFp
              } catch (uErr) {
                console.error('Device refresh error:', uErr)
              }
            }
          }
        }

        return NextResponse.json({ students: [{ ...student, watchedVideoCount: 0 }], total: 1, page: 1, pageSize: 1, totalPages: 1 })
      } catch (loginErr: any) {
        console.error('Student login error:', loginErr)
        return NextResponse.json(
          { students: [], total: 0, page: 1, pageSize: 1, totalPages: 0, error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' },
          { status: 500 }
        )
      }
    }

    // ===== قائمة الطلاب (لوحة التحكم) =====
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

    var allStudentIds = students.map(function (s) { return s.id })
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

    // آخر محاولة دخول ممنوعة لكل طالب — المستر يشوف التاريخ بس (من غير أكواد)
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

    var studentsWithStats = students.map(function (s) {
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
    // ربط الجهاز: جهاز إنشاء الحساب بيتسجل من أول لحظة وهو ده جهاز الحساب
    var rawDeviceId = typeof body.deviceId === 'string' ? body.deviceId : ''
    var deviceId = ['null', 'undefined', 'dev_null', 'none'].indexOf(rawDeviceId) !== -1 ? '' : rawDeviceId
    var deviceFp = ''
    var deviceTraits = typeof body.deviceTraits === 'string' && body.deviceTraits.length <= 4000 ? body.deviceTraits : ''
    var deviceType = pickDeviceType(body.deviceType)
    var creationDeviceId = deviceId.indexOf('dev_') === 0 ? deviceId : ''
    var creationDeviceFp = ''
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
    if (!deviceId && deviceFp) deviceId = deviceFp

    if (!name || !phone || !grade) {
      return NextResponse.json({ error: 'الاسم ورقم الهاتف والصف مطلوبين' }, { status: 400 })
    }

    // ===== فحص الرقم قبل التسجيل (مهم جدًا) =====
    // لو الرقم متسجل قبل كده → رسالة عربية ودودة فورًا — عمرها ما يوصل
    // للطالب أي خطأ تقني (زي SQLite UNIQUE اللي ظهر على الموبايل)
    try {
      var dup = await db.student.findFirst({ where: { phone }, select: { id: true } })
      if (dup) {
        return NextResponse.json(
          { error: '⚠️ الرقم ده متسجل قبل كده في المنصة — لو الحساب ده بتاعك اعمل تسجيل دخول عادي بالرقم وكلمة السر، ولو نسيت كلمة السر أو قابلتك أي مشكلة اكتبها في قسم الشكاوي' },
          { status: 409 }
        )
      }
    } catch (dupErr) {
      console.error('Duplicate phone pre-check error:', dupErr)
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
      // حماية مزدوجة: بعض بيئات الإنتاج بترجّع خطأ القيد الفريد كرسالة خام
      // مش كخطأ P2002 معروف — فبنفحص نص الرسالة نفسها
      var cMsg = String((cErr && (cErr.message || '')) || '')
      if ((cErr && cErr.code === 'P2002') || cMsg.indexOf('UNIQUE constraint failed: Student.phone') !== -1) {
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
    }).catch(function () {})

    return NextResponse.json({ message: 'Student created', student: student }, { status: 201 })
  } catch (error: any) {
    console.error('Student create error:', error)
    return NextResponse.json({ error: 'Failed to create student: ' + (error.message || 'Unknown error') }, { status: 500 })
  }
}
