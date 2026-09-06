import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// GET /api/video-progress/admin?grade=xxx - Get all video progress for admin
export async function GET(request: NextRequest) {
  try {
    const grade = request.nextUrl.searchParams.get('grade')
    
    const where: any = {}
    if (grade) {
      const vids = await db.video.findMany({ where: { grade }, select: { id: true } })
      where.videoId = { in: vids.map(v => v.id) }
    }

    const progress = await db.videoProgress.findMany({
      where,
      orderBy: { lastWatchedAt: 'desc' },
      take: 200,
    })

    const studentIds = [...new Set(progress.map(p => p.studentId))]
    const videoIdsSet = [...new Set(progress.map(p => p.videoId))]

    const [students, vids] = await Promise.all([
      db.student.findMany({ where: { id: { in: studentIds } }, select: { id: true, name: true, grade: true } }),
      db.video.findMany({ where: { id: { in: videoIdsSet } }, select: { id: true, title: true, grade: true } }),
    ])

    const studentMap = Object.fromEntries(students.map(s => [s.id, s]))
    const videoMap = Object.fromEntries(vids.map(v => [v.id, v]))

    const enriched = progress.map(p => ({
      ...p,
      student: studentMap[p.studentId] || null,
      video: videoMap[p.videoId] || null,
      percent: p.totalSeconds > 0 ? Math.round((p.watchedSeconds / p.totalSeconds) * 100) : 0,
    }))

    return NextResponse.json({ progress: enriched })
  } catch (error) {
    console.error('Admin video progress error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
