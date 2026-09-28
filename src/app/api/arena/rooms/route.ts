// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/rooms/route.ts
// PURPOSE: (2026-و66) تحدي الجروبات — إنشاء غرفة تحدي بكود مشترك
//   POST {name} → غرفة جديدة + اللاعب المؤسس (هوست)
//   POST {name, customCode} → (2026-و68) الطالب يكتب كود الغرفة بنفسه
//   (2026-و72) السباق الفردي — POST {name, mode, difficulty, rounds,
//     cardSeconds, studentId}:
//     • mode: 'general' (أسئلة عامة) | 'flash' (فلاش كاردز سريعة)
//     • difficulty: 'easy' | 'medium' | 'hard' (فلتر عائلات المولد)
//     • rounds: 3-15 (افتراضي 8) • cardSeconds: 5-90 (فلاش — افتراضي 15)
//     • studentId: ربط اللاعب بحساب الطالب (ريأتاتش بدل التكرار)
//   (2026-و88) طلب المستر: في الأسئلة العامة «يقدر يحدد السؤال يبقى
//     بوقت ولا من غير وقت ويختار الوقت بتاعه قد ايه»:
//     • timed: 1/0 (افتراضي 1 = بوقت)
//     • qSeconds: 5-180 ثواني للسؤال الواحد (افتراضي 25 — للـ general)
//   الأسئلة بتتولد لحظة الإنشاء من المحرك الرياضي المحلي
//   (أرقام جديدة كل مرة — مفيش غرفتين بنفس الأسئلة تقريبًا)
// ============================================================

import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables, makeRoomCode, makeId, sweepArena } from '@/lib/arena'
import { generateBattleQuestions } from '@/lib/question-gen'

export const runtime = 'nodejs'

var ROOM_ROUNDS = 8

/* (2026-و68) تطبيع كود مخصص: حروف كبيرة وأرقام من غير  O/0 و I/1 — 4-8 خانات */
function normalizeCustomCode(raw: string): string {
  return String(raw || '').toUpperCase().replace(/O/g, '0').replace(/[I|]/g, '1').replace(/[^A-Z0-9]/g, '').slice(0, 8)
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var name = String(body.name || '').trim().slice(0, 40)
    if (!name) return NextResponse.json({ ok: false, error: 'اكتب اسمك الأول يا بطل' }, { status: 400 })

    /* (و72) خيارات السباق — mode/difficulty/rounds/cardSeconds/studentId */
    var mode = String(body.mode || 'general') === 'flash' ? 'flash' : 'general'
    var difficulty = ['easy', 'medium', 'hard'].indexOf(String(body.difficulty || '')) !== -1 ? String(body.difficulty) : 'mixed'
    var rounds = Math.max(3, Math.min(Number(body.rounds) || ROOM_ROUNDS, 15))
    var cardSeconds = Math.max(5, Math.min(Math.round(Number(body.cardSeconds) || 15), 90))
    var studentId = String(body.studentId || '').trim().slice(0, 64)
    /* (و88) التوقيت — بوقت/من غير وقت + مدة السؤال (للأسئلة العامة) */
    var timed = (body.timed === 0 || body.timed === false || body.timed === '0' || body.timed === 'off') ? 0 : 1
    var qSeconds = Math.max(5, Math.min(Math.round(Number(body.qSeconds) || 25), 180))

    var questions = generateBattleQuestions(rounds, {
      difficulty: difficulty,
      style: mode === 'flash' ? 'flash' : 'general',
      cardSeconds: cardSeconds,
    })
    /* (و88) الأسئلة العامة + بوقت → وقت السؤال الواحد بيبقى اختيار صاحب الغرفة */
    if (mode === 'general' && timed) {
      questions = questions.map(function (q: any) {
        q.timeLimitSec = qSeconds
        return q
      })
    }

    /* (2026-و85) التنظيف موحد في sweepArena — غرف خلصت من أكتر من يوم +
       غرف مهجورة من يوم (طلب المستر: التحدي يعيش يوم عشان الطلاب يشوفوا
       نتايجهم)، وبيشتغل كمان من polling الغرفة مش من الإنشاء بس */
    try { await sweepArena() } catch (e) {}

    // (2026-و68) كود مخصص من الطالب — أو كود أوتوماتيكي
    var code = ''
    var custom = normalizeCustomCode(String(body.customCode || ''))
    if (custom) {
      if (custom.length < 4) {
        return NextResponse.json({ ok: false, error: 'الكود المخصص لازم يكون 4 حروف على الأقل' }, { status: 400 })
      }
      var taken = await db.$queryRawUnsafe('SELECT id FROM BattleRoom WHERE code = ? LIMIT 1', custom)
      if (taken && taken.length > 0) {
        return NextResponse.json({ ok: false, error: 'الكود «' + custom + '» مستخدم — جرب كود تاني' }, { status: 409 })
      }
      code = custom
    } else {
      for (var attempt = 0; attempt < 8; attempt++) {
        var cand = makeRoomCode()
        var exists = await db.$queryRawUnsafe('SELECT id FROM BattleRoom WHERE code = ? LIMIT 1', cand)
        if (!exists || exists.length === 0) { code = cand; break }
      }
      if (!code) code = makeRoomCode() + Math.floor(Math.random() * 10)
    }

    var roomId = makeId('brm')
    var hostId = makeId('bp')
    var token = Math.random().toString(36).slice(2) + Date.now().toString(36)

    await safeWrite(function () {
      return db.$executeRawUnsafe(
        'INSERT INTO BattleRoom (id, code, title, hostPlayerId, status, questions, currentIndex, questionStartAt, startedAt, mode, difficulty, cardSeconds, timed, qSeconds, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        roomId, code, 'تحدي ' + name, hostId, 'lobby', JSON.stringify(questions), 0, 0, '', mode, difficulty, cardSeconds, timed, qSeconds
      )
    })
    await safeWrite(function () {
      return db.$executeRawUnsafe(
        "INSERT INTO BattlePlayer (id, roomId, name, token, isHost, score, streak, answers, lastSeen, studentId, qIndex, qStartAt, finishedAt, finished, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 1, 0, 0, ?, ?, ?, 0, '', '', 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
        hostId, roomId, name, token, '{}', String(Date.now()), studentId
      )
    })

    return NextResponse.json({
      ok: true,
      room: { id: roomId, code: code, status: 'lobby', totalRounds: rounds, mode: mode, difficulty: difficulty, cardSeconds: cardSeconds, timed: timed, qSeconds: qSeconds },
      me: { id: hostId, name: name, token: token, isHost: true, score: 0 },
    })
  } catch (e: any) {
    console.error('[arena/rooms] create failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في إنشاء الغرفة — جرب تاني' }, { status: 500 })
  }
}
