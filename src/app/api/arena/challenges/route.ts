// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/challenges/route.ts
// PURPOSE: (2026-و66) تحدي المستر — سؤال صعب أسبوعي الطلاب يتسابقوا فيه
//   GET  → التحدي النشط (بدون الإجابة الصح!) + لوحة الترتيب + التاريخ
//          + myEntry لو الطالب جاوب بالفعل
//   POST {action: create|close|reopen|delete|teacherJoin|deleteEntry|setVideo}
//        → الأدمن بس (نفس نمط باقي APIs الأدمن في المنصة)
//   (2026-و68-إضافي) فيديو المستر: create/setVideo بياخدوا videoUrl+videoType
//   (youtube=لينك خام | file=/api/files/<id> وبيتسلم للطالب بتوكن موقّع) —
//   وGET بيرجعهم بس لما يكونوا موجودين فعلًا (ممنوع بلوك فيديو فاضي)
//   لوحة الترتيب: الصح الأول = الأسرع — المستر ظاهر بعلامة خاصة
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'
import { signVideoToken, mediaIdFromPath } from '@/lib/video-guard'

export const runtime = 'nodejs'

/* (2026-و68-إضافي) تحقق لينك يوتيوب — نفس صيغ المنصة كلها
   (watch?v= و youtu.be و shorts و live و embed و v/) */
function youTubeIdOf(url: string): string | null {
  var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}

/* (2026-و68-إضافي) ملفات الفيديو المرفوعة محمية ببوابة الفيديو —
   بنبعت للطالب رابط موقّع قصير العمر (نفس نمط /api/player) —
   والمسار الخام عمرو ما بيوصل للكلاينت */
function playableVideoUrl(rawUrl: string, videoType: string, requesterId: string): string {
  if (!rawUrl) return ''
  if (videoType === 'file') {
    var mid = mediaIdFromPath(rawUrl)
    if (!mid) return ''
    var req = String(requesterId || 'anon')
    return '/api/files/' + mid + '?token=' + signVideoToken(mid, req) + '&req=' + encodeURIComponent(req)
  }
  return rawUrl
}

function mapChallenge(c: any, includeAnswer: boolean, requesterId?: string) {
  var options: any[] = []
  try { options = JSON.parse(String(c.options || '[]')) } catch (e) {}
  var closesAt = c.closesAt ? String(c.closesAt) : null
  var closedByTime = closesAt ? (new Date(closesAt).getTime() <= Date.now()) : false
  var out: any = {
    id: c.id,
    title: String(c.title || ''),
    question: String(c.question || ''),
    options: options,
    points: Number(c.points || 30),
    durationMin: Number(c.durationMin || 0),
    active: !!Number(c.active || 0) && !closedByTime,
    closesAt: closesAt,
    createdAt: String(c.createdAt || ''),
  }
  if (includeAnswer) out.correctIndex = Number(c.correctIndex || 0)
  /* (2026-و68-إضافي) فيديو المستر — بيتبعت بس لو موجود فعلًا عشان
     الواجهة متعرضش بلوك فيديو فاضي أبدًا (نفس مبدأ زرار الخريطة الذهنية) */
  var vType = String(c.videoType || '')
  var vUrl = playableVideoUrl(String(c.videoUrl || ''), vType, requesterId || 'anon')
  if (vUrl) {
    out.videoUrl = vUrl
    out.videoType = vType
  }
  return out
}

export async function GET(request: NextRequest) {
  try {
    await ensureArenaTables()
    var url = new URL(request.url)
    var studentId = String(url.searchParams.get('studentId') || '')

    var rows = await db.$queryRawUnsafe('SELECT * FROM TeacherChallenge ORDER BY createdAt DESC LIMIT 30')
    var active: any = null
    var history: any[] = []
    for (var i = 0; i < (rows || []).length; i++) {
      var mapped = mapChallenge(rows[i], false, studentId)
      if (!active && mapped.active) active = mapped
      if (mapped.id !== (active && active.id)) history.push({
        id: mapped.id, title: mapped.title, active: mapped.active,
        points: mapped.points, createdAt: mapped.createdAt,
      })
    }

    var leaderboard: any[] = []
    var myEntry: any = null
    if (active) {
      var entries = await db.$queryRawUnsafe(
        'SELECT * FROM ChallengeEntry WHERE challengeId = ? ORDER BY correct DESC, timeMs ASC, createdAt ASC LIMIT 50',
        active.id
      )
      var rank = 0
      for (var e = 0; e < (entries || []).length; e++) {
        var en = entries[e]
        rank++
        leaderboard.push({
          rank: rank,
          name: String(en.name || 'طالب'),
          isTeacher: !!Number(en.isTeacher || 0),
          correct: !!Number(en.correct || 0),
          timeMs: Number(en.timeMs || 0),
          choice: Number(en.choice),
          createdAt: String(en.createdAt || ''),
        })
        if (studentId && String(en.studentId || '') === studentId) {
          myEntry = { choice: Number(en.choice), correct: !!Number(en.correct || 0), timeMs: Number(en.timeMs || 0) }
        }
      }
    }

    return NextResponse.json({ ok: true, active: active, leaderboard: leaderboard, history: history, myEntry: myEntry })
  } catch (e: any) {
    console.error('[arena/challenges GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تحميل تحدي المستر' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var action = String(body.action || '')

    /* ===== create — تحدي جديد (بيقفل القديم تلقائي) ===== */
    if (action === 'create') {
      var title = String(body.title || '').trim().slice(0, 120)
      var question = String(body.question || '').trim().slice(0, 1200)
      var options = Array.isArray(body.options) ? body.options.map(function (o: any) { return String(o || '').trim() }).slice(0, 4) : []
      var correctIndex = Number(body.correctIndex)
      if (!title || !question || options.length < 2 || options.some(function (o: string) { return !o })) {
        return NextResponse.json({ ok: false, error: 'كمّل بيانات التحدي: عنوان + سؤال + اختيارين على الأقل' }, { status: 400 })
      }
      if (!(correctIndex >= 0 && correctIndex < options.length)) correctIndex = 0
      var points = Math.max(10, Math.min(Number(body.points) || 30, 200))
      var durationMin = Math.max(0, Math.min(Number(body.durationMin) || 0, 10080))
      /* (2026-و68-إضافي) فيديو المستر — يوتيوب (لينك خام) أو ملف مرفوع (/api/files/<id>) */
      var videoType = String(body.videoType || '') === 'youtube' || String(body.videoType || '') === 'file' ? String(body.videoType) : ''
      var videoUrl = String(body.videoUrl || '').trim().slice(0, 600)
      if (videoUrl && videoType === 'youtube' && !youTubeIdOf(videoUrl)) {
        return NextResponse.json({ ok: false, error: 'لينك اليوتيوب مش صحيح — الصق اللينك كامل من يوتيوب' }, { status: 400 })
      }
      if (videoUrl && videoType === 'file' && !/^\/api\/files\/[\w-]+$/.test(videoUrl)) {
        return NextResponse.json({ ok: false, error: 'مسار ملف الفيديو مش صحيح — ارفع الفيديو تاني' }, { status: 400 })
      }
      if (!videoUrl) videoType = ''
      // قفل أي تحدي شغال
      try { await safeWrite(function () { return db.$executeRawUnsafe('UPDATE TeacherChallenge SET active = 0, updatedAt = CURRENT_TIMESTAMP WHERE active = 1') }) } catch (e) {}
      var id = 'tch_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      var closesAt = durationMin > 0 ? new Date(Date.now() + durationMin * 60 * 1000).toISOString() : null
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          'INSERT INTO TeacherChallenge (id, title, question, options, correctIndex, points, durationMin, active, closesAt, videoUrl, videoType, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          id, title, question, JSON.stringify(options), correctIndex, points, durationMin, closesAt, videoUrl, videoType
        )
      })
      return NextResponse.json({ ok: true, id: id })
    }

    /* ===== أفعال على تحدي موجود ===== */
    var id2 = String(body.id || '')
    if (action === 'close' || action === 'reopen' || action === 'delete') {
      if (!id2) return NextResponse.json({ ok: false, error: 'محددش التحدي' }, { status: 400 })
      if (action === 'delete') {
        await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM ChallengeEntry WHERE challengeId = ?', id2) })
        await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM TeacherChallenge WHERE id = ?', id2) })
        return NextResponse.json({ ok: true })
      }
      var act = action === 'open' ? 1 : 0
      if (action === 'reopen') {
        try { await safeWrite(function () { return db.$executeRawUnsafe('UPDATE TeacherChallenge SET active = 0 WHERE active = 1') }) } catch (e) {}
        act = 1
      } else {
        act = 0
      }
      await safeWrite(function () { return db.$executeRawUnsafe('UPDATE TeacherChallenge SET active = ?, closesAt = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', act, id2) })
      return NextResponse.json({ ok: true })
    }

    /* ===== teacherJoin — المستر ينزل يلعب بنفسه (بس اسمه) ===== */
    if (action === 'teacherJoin') {
      if (!id2) return NextResponse.json({ ok: false, error: 'محددش التحدي' }, { status: 400 })
      var rows2 = await db.$queryRawUnsafe('SELECT * FROM TeacherChallenge WHERE id = ? LIMIT 1', id2)
      if (!rows2 || rows2.length === 0) return NextResponse.json({ ok: false, error: 'التحدي مش موجود' }, { status: 404 })
      var ch = rows2[0]
      var already = await db.$queryRawUnsafe("SELECT id FROM ChallengeEntry WHERE challengeId = ? AND isTeacher = 1 LIMIT 1", id2)
      if (already && already.length > 0) {
        return NextResponse.json({ ok: false, error: 'انت نازل في التحدي ده بالفعل' }, { status: 409 })
      }
      var eid = 'ent_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "INSERT INTO ChallengeEntry (id, challengeId, studentId, name, isTeacher, choice, correct, timeMs, createdAt) VALUES (?, ?, '', 'المستر وائل 👨‍🏫', 1, ?, 1, ?, CURRENT_TIMESTAMP)",
          eid, id2, Number(ch.correctIndex || 0), Math.floor(Math.random() * 4000) + 2000
        )
      })
      return NextResponse.json({ ok: true })
    }

    /* ===== deleteEntry — الأدمن يشيل دخول غلط ===== */
    if (action === 'deleteEntry') {
      await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM ChallengeEntry WHERE id = ?', String(body.entryId || '')) })
      return NextResponse.json({ ok: true })
    }

    /* ===== (2026-و68-إضافي) setVideo — الأدمن يربط/يحدّث/يشيل فيديو
       التحدي الشغال من غير ما يعيد إنشاء التحدي (لوجو الطلاب مش بيضيع) ===== */
    if (action === 'setVideo') {
      if (!id2) return NextResponse.json({ ok: false, error: 'محددش التحدي' }, { status: 400 })
      var svType = String(body.videoType || '')
      var svUrl = String(body.videoUrl || '').trim().slice(0, 600)
      if (svUrl) {
        if (svType !== 'youtube' && svType !== 'file') {
          return NextResponse.json({ ok: false, error: 'نوع الفيديو مش معروف' }, { status: 400 })
        }
        if (svType === 'youtube' && !youTubeIdOf(svUrl)) {
          return NextResponse.json({ ok: false, error: 'لينك اليوتيوب مش صحيح — الصق اللينك كامل من يوتيوب' }, { status: 400 })
        }
        if (svType === 'file' && !/^\/api\/files\/[\w-]+$/.test(svUrl)) {
          return NextResponse.json({ ok: false, error: 'مسار ملف الفيديو مش صحيح — ارفع الفيديو تاني' }, { status: 400 })
        }
      } else {
        svType = ''
      }
      await safeWrite(function () {
        return db.$executeRawUnsafe('UPDATE TeacherChallenge SET videoUrl = ?, videoType = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', svUrl, svType, id2)
      })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'أكشن غير معروف' }, { status: 400 })
  } catch (e: any) {
    console.error('[arena/challenges POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تنفيذ الطلب' }, { status: 500 })
  }
}
