// @ts-nocheck
// Video Schedule API
// POST: Create a video schedule for specific students with countdown
// GET: Get schedules for a video or for a student

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

async function ensureTable() {
  try {
    await db.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS VideoSchedule (
        id TEXT PRIMARY KEY,
        videoId TEXT NOT NULL,
        studentIds TEXT DEFAULT '',
        unlockAt DATETIME,
        hiddenStudentIds TEXT DEFAULT '',
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)
    try { await db.$executeRawUnsafe('ALTER TABLE VideoSchedule ADD COLUMN hiddenStudentIds TEXT DEFAULT ""') } catch(e) {}
  } catch (e) {
    console.error('Ensure VideoSchedule table error:', e)
  }
}

// GET /api/video-schedule?videoId=xxx - get schedules for a video
// GET /api/video-schedule?studentId=xxx - get schedules for a student
export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    var searchParams = new URL(request.url).searchParams
    var videoId = searchParams.get('videoId')
    var studentId = searchParams.get('studentId')

    if (videoId) {
      var rows = await db.$queryRawUnsafe(
        'SELECT * FROM VideoSchedule WHERE videoId = ? ORDER BY createdAt DESC',
        videoId
      )
      var schedules = (rows || []).map(function(r) {
        var ids = []
        var hiddenIds = []
        try { ids = JSON.parse(r.studentIds || '[]') } catch(e) {}
        try { hiddenIds = JSON.parse(r.hiddenStudentIds || '[]') } catch(e) {}
        return { ...r, studentIds: ids, hiddenStudentIds: hiddenIds }
      })
      return NextResponse.json({ schedules })
    }

    if (studentId) {
      var allRows = await db.$queryRawUnsafe('SELECT * FROM VideoSchedule ORDER BY createdAt DESC')
      var studentSchedules = []
      var hiddenVideoIds = []
      for (var s of (allRows || [])) {
        var ids = []
        var hiddenIds = []
        try { ids = JSON.parse(s.studentIds || '[]') } catch(e) {}
        try { hiddenIds = JSON.parse(s.hiddenStudentIds || '[]') } catch(e) {}
        if (ids.includes(studentId)) {
          studentSchedules.push({ ...s, studentIds: ids, hiddenStudentIds: hiddenIds })
        }
        if (hiddenIds.includes(studentId)) {
          hiddenVideoIds.push(s.videoId)
        }
      }
      return NextResponse.json({ schedules: studentSchedules, hiddenVideoIds: hiddenVideoIds })
    }

    return NextResponse.json({ schedules: [] })
  } catch (error) {
    console.error('VideoSchedule GET error:', error)
    return NextResponse.json({ schedules: [] })
  }
}

// POST /api/video-schedule
// Body: { videoId, studentIds: [], unlockAt, hiddenStudentIds: [] }
export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    var body = await request.json()
    var videoId = body.videoId
    var studentIds = body.studentIds || []
    var unlockAt = body.unlockAt
    var hiddenStudentIds = body.hiddenStudentIds || []

    if (!videoId) {
      return NextResponse.json({ error: 'videoId مطلوب' }, { status: 400 })
    }

    var id = 'vs_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    var studentIdsJson = JSON.stringify(studentIds)
    var hiddenStudentIdsJson = JSON.stringify(hiddenStudentIds)

    // Delete existing schedule for this video first
    try {
      await db.$executeRawUnsafe('DELETE FROM VideoSchedule WHERE videoId = ?', videoId)
    } catch (e) {}

    await db.$executeRawUnsafe(
      'INSERT INTO VideoSchedule (id, videoId, studentIds, unlockAt, hiddenStudentIds) VALUES (?, ?, ?, ?, ?)',
      id, videoId, studentIdsJson, unlockAt || null, hiddenStudentIdsJson
    )

    return NextResponse.json({ success: true, id: id })
  } catch (error) {
    console.error('VideoSchedule POST error:', error)
    return NextResponse.json({ error: 'فشل إنشاء الجدول' }, { status: 500 })
  }
}

// DELETE /api/video-schedule?id=xxx
export async function DELETE(request: NextRequest) {
  try {
    await ensureTable()
    var searchParams = new URL(request.url).searchParams
    var id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    }

    await db.$executeRawUnsafe('DELETE FROM VideoSchedule WHERE id = ?', id)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('VideoSchedule DELETE error:', error)
    return NextResponse.json({ error: 'فشل الحذف' }, { status: 500 })
  }
}
