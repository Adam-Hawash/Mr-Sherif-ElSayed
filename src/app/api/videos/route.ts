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
import { db } from '@/lib/db'
import { isAdmin, getStudentAnyStatus, safeThumb, getYouTubeId, mediaIdFromPath } from '@/lib/video-guard'

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
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { title, url, grade, filePath, fileType, thumbnail, price, adminId } = body

    // الكتابة للأدمن بس
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })
    }

    if (!title || !grade) {
      return NextResponse.json({ error: 'Title and grade are required' }, { status: 400 })
    }

    // (ملغاة 2026-و4) ميزة «إضافة فيديو من كود HTML» اتلغت بطلب المستر
    // نفسه — الكود كان بيجيب واجهة يوتيوب ومفيش تحكم فعلي في الجودة.
    const finalUrl = String(url || '').trim()

    if (!finalUrl && !filePath) {
      return NextResponse.json({ error: 'URL or file is required' }, { status: 400 })
    }

    const video = await db.video.create({
      data: {
        title,
        url: finalUrl,
        grade,
        filePath: filePath || '',
        fileType: fileType || '',
        thumbnail: thumbnail || '',
        price: Number(price) || 0,
      },
    })

    return NextResponse.json({ message: 'Video added', video }, { status: 201 })
  } catch (error: any) {
    console.error('Video create error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}
