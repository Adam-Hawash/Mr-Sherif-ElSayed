// ============================================================
// /api/video-play — البوابة الوحيدة لتشغيل الفيديو
// ============================================================
// المطلوب: videoId (+ studentId أو adminId)
// بيتحقق من الصلاحية على السيرفر وبس ساعتها بيرجّع:
//  - ytId للفيديوهات بتاعة يوتيوب (بدون اللينك الخام)
//  - fileUrl موقّع (HMAC + صلاحية ساعتين) للملفات المرفوعة
// من غير تحقق → 401/402 ومفيش أي معلومة تشغيل.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { computePlayback, isAdmin, getYouTubeId, mediaIdFromPath, signVideoToken } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get('videoId') || ''
    const studentId = searchParams.get('studentId') || ''
    const adminId = searchParams.get('adminId') || ''
    if (!videoId) return NextResponse.json({ error: 'videoId مطلوب' }, { status: 400 })

    // الأدمن بيشوف كل حاجة (معاينة لوحة التحكم)
    if (adminId && (await isAdmin(adminId))) {
      const video = await db.video.findUnique({ where: { id: videoId } })
      if (!video) return NextResponse.json({ error: 'الفيديو غير موجود' }, { status: 404 })
      return NextResponse.json(buildGrant(video, adminId))
    }

    const result = await computePlayback(videoId, studentId || null)
    if (!result.ok || !result.video) {
      return NextResponse.json({ error: result.reason }, { status: result.code })
    }
    return NextResponse.json(buildGrant(result.video, studentId))
  } catch (error: any) {
    console.error('video-play error:', error)
    return NextResponse.json({ error: 'خطأ في السيرفر' }, { status: 500 })
  }
}

function buildGrant(video: { id: string; title: string; url: string; filePath: string; price: number }, requesterId: string) {
  const ytId = getYouTubeId(video.url || '')
  const mediaId = mediaIdFromPath(video.filePath || '')
  const isVideoFile = Boolean(mediaId)
  var fileUrl = ''
  if (mediaId) {
    // توكن موقّع مرتبط بالملف + بالطالب + صلاحية ساعتين — مشاركته مع
    // حد تاني بعد انتهاء الصلاحية مش هتخدم، والملف نفسه مبيتخدمش من غيره
    fileUrl = '/api/files/' + mediaId + '?token=' + signVideoToken(mediaId, requesterId || 'anon') + '&req=' + encodeURIComponent(requesterId || 'anon')
  }
  return {
    ok: true,
    videoId: video.id,
    title: video.title,
    // ملاحظة صريحة: معرف اليوتيوب بيظهر للطالب وقت التشغيل الفعلي (طبيعة
    // اليوتيوب) — بس مبقاش موجود في أي API عام ولا في مصدر صفحة القوائم
    ytId: ytId || '',
    isYouTube: Boolean(ytId),
    isVideoFile,
    fileUrl,
    price: video.price,
  }
}
