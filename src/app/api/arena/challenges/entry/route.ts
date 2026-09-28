// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/challenges/entry/route.ts
// PURPOSE: (2026-و66) مشاركة الطالب في تحدي المستر — إجابة واحدة بس
//   POST {challengeId, studentId, name, choice, timeMs}
//   → بنسجل الصح/الغلط + التوقيت، والرد مطلعوش الإجابة الصح
//     (النتيجة بتظهر في لوحة الترتيب بعد ما المستر يقفل أو من نفس اللوحة)
// ============================================================

import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var challengeId = String(body.challengeId || '')
    var studentId = String(body.studentId || '')
    var name = String(body.name || '').trim().slice(0, 40)
    var choice = Number(body.choice)
    var timeMs = Math.max(0, Math.min(Number(body.timeMs) || 0, 24 * 60 * 60 * 1000))

    if (!challengeId || !name || !(choice >= 0)) {
      return NextResponse.json({ ok: false, error: 'بيانات ناقصة' }, { status: 400 })
    }

    var rows = await db.$queryRawUnsafe('SELECT * FROM TeacherChallenge WHERE id = ? LIMIT 1', challengeId)
    if (!rows || rows.length === 0) {
      return NextResponse.json({ ok: false, error: 'التحدي مش موجود' }, { status: 404 })
    }
    var ch = rows[0]
    if (!Number(ch.active || 0)) {
      return NextResponse.json({ ok: false, error: 'التحدي ده اتقفل — استنى تحدي المستر الجديد' }, { status: 409 })
    }
    if (ch.closesAt && new Date(String(ch.closesAt)).getTime() <= Date.now()) {
      return NextResponse.json({ ok: false, error: 'ميعاد التحدي خلص' }, { status: 409 })
    }

    // إجابة واحدة بس لكل طالب في كل تحدي
    if (studentId) {
      var dup = await db.$queryRawUnsafe('SELECT id FROM ChallengeEntry WHERE challengeId = ? AND studentId = ? LIMIT 1', challengeId, studentId)
      if (dup && dup.length > 0) {
        return NextResponse.json({ ok: false, error: 'جاوبت في التحدي ده قبل كذا — إجابة واحدة بس' }, { status: 409 })
      }
    }

    var correct = choice === Number(ch.correctIndex || 0) ? 1 : 0
    var eid = 'ent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await safeWrite(function () {
      return db.$executeRawUnsafe(
        'INSERT INTO ChallengeEntry (id, challengeId, studentId, name, isTeacher, choice, correct, timeMs, createdAt) VALUES (?, ?, ?, ?, 0, ?, ?, ?, CURRENT_TIMESTAMP)',
        eid, challengeId, studentId, name, choice, correct, timeMs
      )
    })

    // من غير الإجابة الصح — الطالب يشوف النتيجة في لوحة الترتيب
    return NextResponse.json({ ok: true, registered: true })
  } catch (e: any) {
    console.error('[arena/challenges/entry POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تسجيل إجابتك' }, { status: 500 })
  }
}
