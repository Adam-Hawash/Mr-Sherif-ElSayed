// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// POST /api/video-access/grant - Admin grants free access to a student for a video
export async function POST(request: NextRequest) {
  try {
    const { videoId, studentId } = await request.json()

    if (!videoId || !studentId) {
      return NextResponse.json({ error: 'videoId and studentId required' }, { status: 400 })
    }

    await db.$executeRawUnsafe(
      `INSERT OR IGNORE INTO VideoAccess (id, studentId, videoId, grantedAt) VALUES (?, ?, ?, datetime('now'))`,
      'va_' + videoId + '_' + studentId, studentId, videoId
    )

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Grant access error:', error)
    return NextResponse.json({ error: 'Failed to grant access' }, { status: 500 })
  }
}

// DELETE /api/video-access/grant - Admin removes access
export async function DELETE(request: NextRequest) {
  try {
    const { videoId, studentId } = await request.json()

    if (!videoId || !studentId) {
      return NextResponse.json({ error: 'videoId and studentId required' }, { status: 400 })
    }

    await db.$executeRawUnsafe(
      `DELETE FROM VideoAccess WHERE studentId = ? AND videoId = ?`,
      studentId, videoId
    )
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Remove access error:', error)
    return NextResponse.json({ error: 'Failed to remove access' }, { status: 500 })
  }
}
