// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId') || ''
    const videoId = searchParams.get('videoId') || ''

    // Case 1: Check access to specific video
    if (studentId && videoId) {
      const video = await db.video.findUnique({ where: { id: videoId } })
      if (!video) return NextResponse.json({ error: 'Video not found' }, { status: 404 })

      // Free video (price = 0 or not set) = always accessible
      if (!video.price || video.price === 0) {
        return NextResponse.json({ hasAccess: true, reason: 'free' })
      }

      // A student's paid status only means they are eligible to purchase.
      // Access is granted only after this specific video's payment is approved.
      const access = await db.videoAccess.findUnique({
        where: { studentId_videoId: { studentId, videoId } },
      })

      return NextResponse.json({
        hasAccess: Boolean(access),
        reason: access ? 'granted' : 'payment_required',
      })
    }

    // Case 2: List all accesses for a student
    if (studentId) {
      const accesses = await db.videoAccess.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
      })
      return NextResponse.json({ accesses })
    }

    return NextResponse.json({ error: 'studentId required' }, { status: 400 })
  } catch (error) {
    console.error('Video access error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
