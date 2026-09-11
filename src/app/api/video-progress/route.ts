import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/video-progress?studentId=xxx [&videoId=yyy]
// - with videoId → returns just that video's row (player resume)
// - without     → all rows for the student (list percentages)
export async function GET(request: NextRequest) {
  try {
    const studentId = request.nextUrl.searchParams.get('studentId')
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

    const videoId = request.nextUrl.searchParams.get('videoId')
    const progress = await db.videoProgress.findMany({
      where: videoId ? { studentId, videoId } : { studentId },
      orderBy: { lastWatchedAt: 'desc' },
    })

    // ** تصليح السجلات القديمة الحبسة على 98/99% ** — أي سجل الطالب شاف فيه
    // 97% أو أكتر بيتسنى 100% مظبوطة (نفس منطق التسنية في POST) — بتتصلح
    // في الداتابيز نفسها مرة واحدة وبترجع للمُشغّل/القائمة مصلحة.
    for (var i = 0; i < progress.length; i++) {
      var row: any = progress[i]
      if (row && row.totalSeconds > 0 && row.watchedSeconds < row.totalSeconds && row.watchedSeconds / row.totalSeconds >= 0.97) {
        row.watchedSeconds = row.totalSeconds
        row.completed = true
        db.videoProgress.update({
          where: { id: row.id },
          data: { watchedSeconds: row.totalSeconds, completed: true },
        }).catch(function () {})
      }
    }

    return NextResponse.json({ progress })
  } catch (error) {
    console.error('Video progress fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}

// POST /api/video-progress — save/update video progress.
// CUMULATIVE: the stored watchedSeconds is the MAX ever reached, so re-opening
// a video (or re-watching the beginning) can NEVER pull the percentage back.
// Watched 95% then closed → next session still starts from 95% and can only
// grow until the video reaches 100%.
export async function POST(request: NextRequest) {
  try {
    const { studentId, videoId, watchedSeconds, totalSeconds } = await request.json()

    if (!studentId || !videoId) {
      return NextResponse.json({ error: 'studentId and videoId required' }, { status: 400 })
    }

    // Cap watchedSeconds to never exceed totalSeconds
    var safeTotal = Math.max(Number(totalSeconds) || 0, 0)
    var safeWatched = Math.max(Number(watchedSeconds) || 0, 0)
    // ** علامة "خلص الفيديو" (999999) — بتبعت لما الفيديو يخلص للآخر **
    // لازم تتاخد مكان أي تقدم قديم فورًا — دي أهم حاجة في النظام:
    // من غيرها النسبة بتفضل حبسة على 98/99% والأقفال مبتفتحش أبدًا.
    var endedMarker = safeWatched >= 999000
    // Also cap totalSeconds to a reasonable max (24 hours = 86400 seconds)
    if (safeTotal > 86400) safeTotal = 86400
    if (safeTotal > 0 && safeWatched > safeTotal) safeWatched = safeTotal

    // ---- CUMULATIVE MERGE: never regress ----
    var existing: any = null
    try {
      existing = await db.videoProgress.findUnique({
        where: { studentId_videoId: { studentId, videoId } },
      })
    } catch (e) {
      existing = null
    }

    var finalTotal = Math.max(existing?.totalSeconds || 0, safeTotal)
    var finalWatched = Math.max(existing?.watchedSeconds || 0, safeWatched)
    if (finalTotal > 0 && finalWatched > finalTotal) finalWatched = finalTotal
    // ** علامة الخلص بتكسب دايمًا ** — الفيديو خلص للآخر ⇒ 100% مظبوطة
    if (endedMarker && finalTotal > 0) finalWatched = finalTotal
    if (endedMarker && finalTotal === 0) { finalTotal = 1; finalWatched = 1 }
    // ** تسنية 100% (إصلاح 'حبسة على 99%'): يوتيوب عمره ما بيرجّع آخر ~نص
    // ثانية (getCurrentTime بيقف عند duration-0.4 تقريبًا) فالنسبة بتفضل
    // 98/99% للأبد. لو الطالب شاف 97% أو أكتر يبقى شاف الفيديو كامل عمليًا
    // ⇒ نسجل 100% مظبوطة عشان العرض والقفل التسلسلي يشتغلوا صح. **
    if (!endedMarker && finalTotal > 0 && finalWatched / finalTotal >= 0.97) {
      finalWatched = finalTotal
    }
    const completed = finalTotal > 0 && (finalWatched / finalTotal) >= 0.9

    const progress = await db.videoProgress.upsert({
      where: { studentId_videoId: { studentId, videoId } },
      update: {
        watchedSeconds: finalWatched,
        totalSeconds: finalTotal,
        completed,
        lastWatchedAt: new Date(),
      },
      create: {
        studentId,
        videoId,
        watchedSeconds: finalWatched,
        totalSeconds: finalTotal,
        completed,
      },
    })

    return NextResponse.json({ progress, completed })
  } catch (error) {
    console.error('Video progress save error:', error)
    return NextResponse.json({ error: 'Failed to save progress' }, { status: 500 })
  }
}

// GET /api/video-progress/admin?grade=xxx - Admin: get all students' video progress
export async function ADMIN_GET(request: NextRequest) {
  // This is handled via query param in GET
  return GET(request)
}
