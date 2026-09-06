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
    if (safeTotal > 0 && safeWatched > safeTotal) {
      safeWatched = safeTotal
    }
    // Also cap totalSeconds to a reasonable max (24 hours = 86400 seconds)
    if (safeTotal > 86400) {
      safeTotal = 86400
      if (safeWatched > safeTotal) safeWatched = safeTotal
    }

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
