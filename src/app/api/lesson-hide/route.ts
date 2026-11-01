// @ts-nocheck
// ============================================================
// (2026-ز13 — طلب المستر): إخفاء «درس كامل» (جروب فيديوهات) عن طلاب
// بدل ما يخفي كل فيديو لوحده — الدرس بيبقى أكتر من 10 فيديوهات.
// نفس نمط VideoSchedule بالظبط: جدول SQL خام بيضمن وجوده لوحده
// (ممنوع db:push — ensure هنا بيتحمل) + DELETE/INSERT لكل groupKey.
// GET  ?studentId= → { hiddenGroupKeys: [...] } (واجهة الطالب)
// GET  ?groupKey=  → { studentIds: [...] } (تحميل الموجود في اللوحة)
// POST { groupKey, grade, studentIds: [] } → حفظ (قايمة فاضية = فك الإخفاء)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'
export const maxDuration = 30

var _lessonHideReady: Promise<void> | null = null
async function ensureTable() {
  if (!_lessonHideReady) {
    _lessonHideReady = (async function () {
      try {
        await db.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS LessonHide (
            id TEXT PRIMARY KEY,
            groupKey TEXT NOT NULL,
            grade TEXT DEFAULT '',
            studentIds TEXT DEFAULT '',
            createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS LessonHide_groupKey_idx ON LessonHide(groupKey)') } catch (e) {}
      } catch (e) {
        console.error('Ensure LessonHide table error:', e)
      }
    })()
  }
  await _lessonHideReady
}

// GET /api/lesson-hide?studentId=xxx — الدروس المخفية عن الطالب ده
// GET /api/lesson-hide?groupKey=xxx — الطلاب المخفي عنهم الدرس ده (لللوحة)
export async function GET(request: NextRequest) {
  try {
    await ensureTable()
    var searchParams = new URL(request.url).searchParams
    var studentId = searchParams.get('studentId')
    var groupKey = searchParams.get('groupKey')

    if (studentId) {
      var allRows = await db.$queryRawUnsafe('SELECT * FROM LessonHide ORDER BY createdAt DESC')
      var hiddenGroupKeys = []
      for (var s of (allRows || [])) {
        var ids = []
        try { ids = JSON.parse(s.studentIds || '[]') } catch (e) {}
        if (ids.includes(studentId)) hiddenGroupKeys.push(s.groupKey)
      }
      return NextResponse.json({ hiddenGroupKeys: hiddenGroupKeys })
    }

    if (groupKey) {
      var rows = await db.$queryRawUnsafe(
        'SELECT * FROM LessonHide WHERE groupKey = ? ORDER BY createdAt DESC',
        groupKey
      )
      var first = (rows || [])[0]
      var studentIds = []
      if (first) {
        try { studentIds = JSON.parse(first.studentIds || '[]') } catch (e) {}
      }
      return NextResponse.json({ studentIds: studentIds })
    }

    return NextResponse.json({ hiddenGroupKeys: [] })
  } catch (error) {
    console.error('LessonHide GET error:', error)
    return NextResponse.json({ hiddenGroupKeys: [] })
  }
}

// POST /api/lesson-hide
// Body: { groupKey, grade, studentIds: [] } — قايمة فاضية معناها فك إخفاء الدرس
export async function POST(request: NextRequest) {
  try {
    await ensureTable()
    var body = await request.json()
    var groupKey = body.groupKey
    var grade = body.grade || ''
    var studentIds = body.studentIds || []

    if (!groupKey) {
      return NextResponse.json({ error: 'groupKey مطلوب' }, { status: 400 })
    }

    // مسح القديم الأول — ولو مفيش طلاب محددين يبقى الدرس بقى ظاهر للكل
    try {
      await db.$executeRawUnsafe('DELETE FROM LessonHide WHERE groupKey = ?', groupKey)
    } catch (e) {}

    if (studentIds.length > 0) {
      var id = 'lh_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      await db.$executeRawUnsafe(
        'INSERT INTO LessonHide (id, groupKey, grade, studentIds) VALUES (?, ?, ?, ?)',
        id, groupKey, grade, JSON.stringify(studentIds)
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('LessonHide POST error:', error)
    return NextResponse.json({ error: 'فشل الحفظ' }, { status: 500 })
  }
}
