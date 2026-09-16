// ============================================================
// /api/videos — قوائم الفيديوهات
// ============================================================
// حماية اللينكات:
//  - الأدمن (adminId صالح) → بيشوف كل البيانات بما فيها url/filePath
//  - أي حد تاني → url و filePath بيترجعوا فاضيين + thumb عن طريق
//    بروكسي /api/video-thumb/[id] (معرف اليوتيوب مش بيظهر)
//  - الزوار غير المسجلين بيشوفوا الفيديوهات المجانية بس
// عمليات الكتابة (POST) للأدمن بس.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { isAdmin, getStudentAnyStatus, safeThumb, getYouTubeId, mediaIdFromPath, ensureVideoTable } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

/* اللينك المباشر لملف فيديو (MP4/WebM/M3U8/…) بيتشغل في المشغل العادي
   (من غير أي يوتيوب + إعدادات جودة ظاهرة) — فبيتصنف file مش link خارجي */
function isDirectMedia(u: string): boolean {
  if (!u) return false
  const s = String(u).trim()
  if (!/^https?:\/\//i.test(s) && !s.startsWith('/')) return false
  return /\.(mp4|webm|m3u8|mov|ogg|ogv)(\?.*)?$/i.test(s)
}

function stripVideo(v: { id: string; thumbnail: string; url: string; filePath: string; [k: string]: unknown }) {
  const kind = getYouTubeId(v.url || '') ? 'youtube' : mediaIdFromPath(v.filePath || '') ? 'file' : isDirectMedia(v.url) ? 'file' : v.url ? 'link' : 'none'
  return { ...v, url: '', filePath: '', kind, thumb: safeThumb(v) }
}

export async function GET(request: NextRequest) {
  try {
    /* (و45) ترميم دفاعي لجدول Video — أي عمود ناقص في الإنتاج بيفشل القايمة كلها */
    await ensureVideoTable()
    const { searchParams } = new URL(request.url)
    const grade = searchParams.get('grade')
    const keyword = searchParams.get('keyword')
    const page = parseInt(searchParams.get('page') || '1')
    const pageSize = parseInt(searchParams.get('pageSize') || '20')
    const adminId = searchParams.get('adminId')
    const studentId = searchParams.get('studentId')

    const admin = await isAdmin(adminId)
    const student = admin ? null : await getStudentAnyStatus(studentId)

    const where: Record<string, unknown> = {}
    if (grade) where.grade = grade
    if (keyword) {
      where.OR = [
        { title: { contains: keyword } },
      ]
    }
    // زائر بدون حساب → الفيديوهات المجانية بس (ومن غير أي لينكات)
    if (!admin && !student) where.price = 0

    const [videos, total] = await Promise.all([
      db.video.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.video.count({ where }),
    ])

    let visibleVideos = videos as any[]
    /* (2026-و29) جدولة المجموعات — على السيرفر خالص:
       فيديو له خطط مجموعات → يشوفه بس أعضاء المجموعات دي، وكل مجموعة
       يشوفه من موعدها. قبل الميعاد الفيديو **مختفي تمامًا** عن طلاب
       المجموعة (بدون عداد — طلب المستر صريح)، وغير أعضاء المجموعات
       المستهدفة ما يشوفوه أصلًا. الفيديو من غير خطط = ظاهر للكل زي ما هو. */
    if (!admin && student) {
      try {
        var schedRows = await db.$queryRawUnsafe('SELECT videoId, groupId, unlockAt FROM VideoGroupSchedule') as any[]
        if (schedRows && schedRows.length > 0) {
          var plansByVideo: Record<string, { groupId: string; unlockAt: string | null }[]> = {}
          for (var ri = 0; ri < schedRows.length; ri++) {
            var row = schedRows[ri]
            var vid = String(row.videoId || '')
            if (!plansByVideo[vid]) plansByVideo[vid] = []
            plansByVideo[vid].push({ groupId: String(row.groupId || ''), unlockAt: row.unlockAt || null })
          }
          var myGroup = String((student as any).groupId || '')
          var nowMs = Date.now()
          visibleVideos = visibleVideos.filter(function (v: any) {
            var plans = plansByVideo[v.id]
            if (!plans || plans.length === 0) return true // من غير جدولة مجموعات = للكل
            if (!myGroup) return false // الفيديو موجه لمجموعات والطالب مش في مجموعة
            for (var pi = 0; pi < plans.length; pi++) {
              if (plans[pi].groupId !== myGroup) continue
              if (!plans[pi].unlockAt) return true // مجموعته من غير ميعاد → ظاهر فورًا
              var t = new Date(plans[pi].unlockAt as string).getTime()
              if (isNaN(t)) return true
              if (nowMs >= t) return true // جه ميعاد مجموعته → ظاهر
              return false // لسه قبل الميعاد → مخفي تمامًا (بدون عداد)
            }
            return false // مجموعته مش مستهدفة في الفيديو ده
          })
        }
      } catch (gErr) {
        console.error('Videos group-schedule filter error:', gErr)
        // فشل الجدولة ما يمنعش عرض الفيديوهات العادية
      }
    }

    const safeVideos = admin ? visibleVideos : visibleVideos.map(stripVideo)

    return NextResponse.json({
      videos: safeVideos,
      total: admin ? total : visibleVideos.length,
      page,
      pageSize,
      totalPages: Math.ceil((admin ? total : visibleVideos.length) / pageSize),
    })
  } catch (error: any) {
    console.error('Videos fetch error:', error)
    return NextResponse.json({ error: 'قائمة الفيديوهات ما قدرتش تتحمل — السبب التقني: ' + String((error && error.message) || error).slice(0, 160) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  /* (و45) رسالة خطأ عربية وصفية — المستر لازم يعرف السبب الحقيقي،
     مفيش «في مشكلة» من غير سبب */
  const errOut = (msg: string, status = 500) => NextResponse.json({ error: msg }, { status })
  try {
    const body = await request.json()
    const { title, url, grade, filePath, fileType, thumbnail, price, adminId } = body

    // الكتابة للأدمن بس
    if (!(await isAdmin(adminId))) {
      return errOut('مسموح للأدمن بس — سجل الدخول من الأول', 401)
    }

    if (!title || !String(title).trim()) {
      return errOut('لازم تكتب عنوان الدرس الأول', 400)
    }
    if (!grade) {
      return errOut('لازم تختار الصف الدراسي الأول', 400)
    }

    // (ملغاة 2026-و4) ميزة «إضافة فيديو من كود HTML» اتلغت بطلب المستر
    // نفسه — الكود كان بيجيب واجهة يوتيوب ومفيش تحكم فعلي في الجودة.
    const finalUrl = String(url || '').trim()

    if (!finalUrl && !filePath) {
      return errOut('لازم لينك فيديو (يوتيوب أو أي موقع) أو ملف فيديو مرفوع — دوس واحدة منهم الأول', 400)
    }

    /* (و45) الصورة المصغرة الأوتوماتيكية — لو الأدمن ماحطش صورة وفيه لينك
       يوتيوب: بنخزّن صورة الفيديو من i.ytimg.com على السيرفر كمان
       (hqdefault) عشان تظهر في كل الشاشات من غير خطوة إضافية */
    let finalThumb = String(thumbnail || '').trim()
    if (!finalThumb) {
      const ytId = getYouTubeId(finalUrl)
      if (ytId) finalThumb = 'https://i.ytimg.com/vi/' + ytId + '/hqdefault.jpg'
    }

    /* (و45) ترميم دفاعي لجدول Video قبل الكتابة — درس و43: أي عمود ناقص
       في الإنتاج بيفشل الـ INSERT بصمت، فبنضمن الجدول كامل الأول */
    await ensureVideoTable()

    let video: any = null
    try {
      video = await safeWrite(function () {
        return db.video.create({
          data: {
            title: String(title).trim(),
            url: finalUrl,
            grade,
            filePath: filePath || '',
            fileType: fileType || '',
            thumbnail: finalThumb,
            price: Number(price) || 0,
          },
        })
      })
    } catch (createErr: any) {
      /* (و45) ترجمة أخطاء Prisma/Turso لأسباب عربية مفهومة */
      const code = String(createErr && createErr.code ? createErr.code : '')
      const raw = String((createErr && createErr.message) || createErr || '')
      console.error('Video create error:', raw)
      if (code === 'P2021') {
        return errOut('جدول الفيديوهات مش موجود في قاعدة البيانات — دوس حفظ تاني بعد ثانية (الترميم الأوتوماتيك هيشتغل)، ولو فضلت المشكلة كلمني', 500)
      }
      if (code === 'P2022' || raw.indexOf('no such column') !== -1) {
        return errOut('في عمود ناقص في جدول الفيديوهات بالقاعدة — جرب تاني بعد ثانية (الترميم الأوتوماتيك بيتكفل)، ولو فضلت المشكلة كلمني', 500)
      }
      if (raw.indexOf('database is locked') !== -1 || raw.indexOf('SQLITE_BUSY') !== -1) {
        return errOut('قاعدة البيانات كانت مشغولة لحظة الحفظ — جرب تاني كام ثانية وهتنجح', 503)
      }
      return errOut('الفيديو ما اتضافش — السبب التقني: ' + (raw.slice(0, 160) || 'غير معروف'), 500)
    }

    return NextResponse.json({ message: 'Video added', video }, { status: 201 })
  } catch (error: any) {
    const raw = String((error && error.message) || error || '')
    console.error('Video create error:', raw)
    if (raw.indexOf('JSON') !== -1 || raw.indexOf('json') !== -1) {
      return errOut('البيانات المتبعتة مش سليمة — جرب تحمّل الصفحة تاني وتعبّي الفورم من الأول', 400)
    }
    return errOut('الفيديو ما اتضافش — السبب التقني: ' + raw.slice(0, 160), 500)
  }
}
