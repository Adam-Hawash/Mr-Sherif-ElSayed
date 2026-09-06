import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/video-progress?studentId=xxx - Get all progress for a student
export async function GET(request: NextRequest) {
  try {
    const studentId = request.nextUrl.searchParams.get('studentId')
    if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 })

    const progress = await db.videoProgress.findMany({
      where: { studentId },
      orderBy: { lastWatchedAt: 'desc' },
    })

    return NextResponse.json({ progress })
  } catch (error) {
    console.error('Video progress fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch progress' }, { status: 500 })
  }
}

// POST /api/video-progress - Save/update video progress
export async function POST(request: NextRequest) {
  try {
    const { studentId, videoId, watchedSeconds, totalSeconds } = await request.json()

    if (!studentId || !videoId) {
      return NextResponse.json({ error: 'studentId and videoId required' }, { status: 400 })
    }

    // Cap watchedSeconds to never exceed totalSeconds
    var safeTotal = Math.max(totalSeconds, 0)
    var safeWatched = Math.max(watchedSeconds, 0)
    if (safeTotal > 0 && safeWatched > safeTotal) {
      safeWatched = safeTotal
    }
    // Also cap totalSeconds to a reasonable max (24 hours = 86400 seconds)
    if (safeTotal > 86400) {
      safeTotal = 86400
      if (safeWatched > safeTotal) safeWatched = safeTotal
    }

    const completed = safeTotal > 0 && (safeWatched / safeTotal) >= 0.9

    const progress = await db.videoProgress.upsert({
      where: { studentId_videoId: { studentId, videoId } },
      update: {
        watchedSeconds: safeWatched,
        totalSeconds: safeTotal,
        completed,
        lastWatchedAt: new Date(),
      },
      create: {
        studentId,
        videoId,
        watchedSeconds: safeWatched,
        totalSeconds: safeTotal,
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
