// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/rooms/[code]/route.ts
// PURPOSE: (2026-و66) قلب تحدي الجروبات — حالة الغرفة الحية.
//   (2026-و72) **إعادة كتابة كاملة: سباق فردي (RACE)** — كل لاعب ليه
//   مؤقّت وسؤال مستقل: ما فيش انتظار باقي اللاعبين خالص. اللي يخلص 15
//   سؤال أول يكسب — واللي يخلص بعده بيكمل لوحده.
//   GET  ?playerId=&token= → حالة كاملة + أسئلة الغرفة (من غير الإجابات!)
//        + بياناتي: qIndex / remainMs / finished + مكشول إجاباتي القديمة
//        + players + leaderboard «مين خلّص الأول»
//        مع «التحديث الكسول»: لو وقت سؤال أي لاعب خلص → بنتقدّم هو لوحده
//   POST {action: join|start|answer|next|leave|end}
//        • join: دخول بالاسم + studentId — لو نفس الطالب (نفس studentId)
//          موجود → REATTACH لنفس اللاعب (مش لاعب جديد). لو خرج قبل كده
//          (status=left) → ممنوع يرجع. الدخول بعد بدء السباق → مرفوض.
//        • start: للهوست بس — بيسجل startedAt ويصفّر مؤقتات كل اللاعبين
//        • answer: صالح لسؤالي أنا بس (idx === player.qIndex) — درجة =
//          سرعة + دقة + ستريك — وبعدها بتتقدم فورًا للسؤال اللي بعده
//        • leave: مسموح في أي مرحلة (لوبي أو لايف) — بيقطع الجلسة
//          (status=left) ومفيش رجوع بعدها. الهوست في اللوبي بيتم تسليمه.
//        • end: للهوست بس — إنهاء مبكر. • next: no-op (السباق تلقائي)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables, sweepArena } from '@/lib/arena'

export const runtime = 'nodejs'

var ONLINE_WINDOW_MS = 12000
var MAX_PLAYERS = 6
var ADVANCE_GRACE_MS = 900 /* سماحية زمنية قبل التقدّم التلقائي */

function parseObj(s: any): any {
  try { return JSON.parse(String(s || '{}')) || {} } catch (e) { return {} }
}

function questionLimitMs(q: any): number {
  return Math.max(5, Number(q && q.timeLimitSec || 25)) * 1000
}

/* (2026-و88) التوقيت بقى إعداد لكل غرفة — طلب المستر: في الأسئلة العامة
   «يقدر يحدد السؤال يبقى بوقت ولا من غير وقت ويختار الوقت بتاعه قد ايه»
   room.timed = 0 → من غير وقت (limit = 0 — مفيش تايم أوت ولا بونص سرعة)
   room.qSeconds → وقت السؤال الواحد المختار (5-180 ث) — الغرف القديمة
   (من غير العمود) بتتشاف بوقت افتراضي زي الأول */
function roomTimed(room: any): boolean {
  var raw = room ? room.timed : undefined
  if (raw === undefined || raw === null || raw === '') return true /* غرف قديمة = بوقت */
  return Number(raw) !== 0
}

function roomLimitMs(room: any, q: any): number {
  if (!roomTimed(room)) return 0
  var qs = Math.round(Number(room && room.qSeconds) || 0)
  if (qs >= 5) return qs * 1000
  return questionLimitMs(q)
}

function isActive(p: any): boolean {
  return String(p && p.status || 'active') !== 'left'
}

function isFinished(p: any): boolean {
  return Number(p && p.finished || 0) === 1
}

/* التحديث الكسول — السباق: كل لاعب بيتقدّم لوحده لما وقت سؤاله يخلص.
   لو كل اللاعبين النشطين خلصوا → الغرفة بتتنهي (الحارس على مستوى الغرفة). */
async function lazyTickRace(room: any): Promise<boolean> {
  if (!room || room.status !== 'live') return false
  var questions: any[] = []
  try { questions = JSON.parse(String(room.questions || '[]')) } catch (e) {}
  if (questions.length === 0) return false

  var players: any[] = []
  try { players = await db.$queryRawUnsafe('SELECT * FROM BattlePlayer WHERE roomId = ?', room.id) } catch (e) {}
  if (!players || players.length === 0) return false

  var now = Date.now()
  var changed = false
  var activeCount = 0
  var finishedCount = 0

  for (var i = 0; i < players.length; i++) {
    var p = players[i]
    if (!isActive(p)) continue
    activeCount++
    if (isFinished(p)) { finishedCount++; continue }
    var qIndex = Math.max(0, Number(p.qIndex || 0))
    var advanceTo = -1
    if (qIndex >= questions.length) {
      /* أمان: لاعب عدّى آخر سؤال من غير ما يتسجل خلص */
      advanceTo = questions.length
    } else {
      var q = questions[qIndex] || {}
      var limit = roomLimitMs(room, q)
      var startAt = Number(p.qStartAt || room.startedAt || 0)
      /* (و88) من غير وقت → مفيش تقدّم تلقائي بالتايم أوت — اللاعب بياخد وقته */
      if (limit > 0 && startAt > 0 && now - startAt > limit + ADVANCE_GRACE_MS) {
        advanceTo = qIndex + 1
      }
    }
    if (advanceTo >= 0) {
      var willFinish = advanceTo >= questions.length
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          'UPDATE BattlePlayer SET qIndex = ?, qStartAt = ?, finished = ?, finishedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          advanceTo, String(now), willFinish ? 1 : 0, willFinish ? String(now) : '', p.id
        )
      })
      p.qIndex = advanceTo
      p.finished = willFinish ? 1 : 0
      if (willFinish) finishedCount++
      changed = true
    }
  }

  /* الحارس على مستوى الغرفة: كل النشطين خلصوا (أو مفيش نشطين) → خلصت */
  if (activeCount === 0 || finishedCount >= activeCount) {
    await safeWrite(function () {
      return db.$executeRawUnsafe("UPDATE BattleRoom SET status = 'ended', updatedAt = CURRENT_TIMESTAMP WHERE id = ?", room.id)
    })
    room.status = 'ended'
    changed = true
  }
  return changed
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  try {
    await ensureArenaTables()
    /* (2026-و84) سيف تلقائي مختنق (مرة كل 5 دقائق لكل instance) — غرف
       خلصت من 30 دقيقة أو مهجورة من 6 ساعات بتتمسح هي ولاعبيها تلقائيًا */
    try { await sweepArena() } catch (e) {}
    var code = String((await params).code || '').toUpperCase().trim()
    var url = new URL(request.url)
    var playerId = String(url.searchParams.get('playerId') || '')
    var token = String(url.searchParams.get('token') || '')

    var roomRows = await db.$queryRawUnsafe('SELECT * FROM BattleRoom WHERE code = ? LIMIT 1', code)
    if (!roomRows || roomRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'الغرفة مش موجودة — راجع الكود' }, { status: 404 })
    }
    var room = roomRows[0]
    await lazyTickRace(room)

    var players = await db.$queryRawUnsafe('SELECT * FROM BattlePlayer WHERE roomId = ? ORDER BY lastSeen ASC', room.id)
    players = players || []

    var questions: any[] = []
    try { questions = JSON.parse(String(room.questions || '[]')) } catch (e) {}

    // حدّث حضور اللاعب — (و72) اللاعب اللي خرج (status=left) بيمنع الجلسة القديمة
    var me: any = null
    if (playerId) {
      for (var i = 0; i < players.length; i++) {
        if (players[i].id === playerId) { me = players[i]; break }
      }
      if (me) {
        if (token && String(me.token || '') !== token) {
          return NextResponse.json({ ok: false, error: 'جلسة غير صالحة — ادخل من الأول' }, { status: 403 })
        }
        if (!isActive(me)) {
          return NextResponse.json({ ok: false, error: 'خرجت من التحدي ومش مسموح ترجع تاني' }, { status: 403 })
        }
        try { await db.$executeRawUnsafe('UPDATE BattlePlayer SET lastSeen = ? WHERE id = ?', String(Date.now()), me.id) } catch (e) {}
      }
    }

    var now = Date.now()
    var total = questions.length
    var live = room.status === 'live'
    var startedAt = Number(room.startedAt || 0)
    /* (و88) إعدادات التوقيت الفعّالة للغرفة */
    var effTimed = roomTimed(room)
    var effQSec = Math.round(Number(room.qSeconds) || 0)

    /* بياناتي في السباق — كل لاعب بيجري في سباقه الخاص */
    var myQIndex = 0
    var myFinished = false
    var myFinishedAt = ''
    var myRemainMs = 0
    var myAnswers: any = {}
    var myScore = 0
    var myStreak = 0
    if (me) {
      myQIndex = Math.max(0, Number(me.qIndex || 0))
      myFinished = isFinished(me)
      myFinishedAt = String(me.finishedAt || '')
      myAnswers = parseObj(me.answers)
      myScore = Number(me.score || 0)
      myStreak = Number(me.streak || 0)
      var curQ = questions[myQIndex]
      if (live && !myFinished && curQ) {
        var startAt = Number(me.qStartAt || room.startedAt || 0)
        /* (و88) من غير وقت → مفيش عداد متبقي (remainMs = 0) */
        myRemainMs = effTimed ? (startAt > 0 ? Math.max(0, roomLimitMs(room, curQ) - (now - startAt)) : roomLimitMs(room, curQ)) : 0
      }
    }

    /* مكشول الإجابات بتاعتي بس — الأسئلة اللي جاوبتها أو وقتها خلص عليّ (keyed by idx) */
    var myRevealed: Record<string, { correctIndex: number; explanation: string }> = {}
    if (me) {
      var revealUpTo = myFinished ? total : myQIndex
      for (var ri = 0; ri < revealUpTo && ri < total; ri++) {
        var rq = questions[ri]
        if (rq) myRevealed[String(ri)] = { correctIndex: Number(rq.correctIndex), explanation: String(rq.explanation || '') }
      }
      for (var ak in myAnswers) {
        var aq = questions[Number(ak)]
        if (aq && !myRevealed[String(ak)]) myRevealed[String(ak)] = { correctIndex: Number(aq.correctIndex), explanation: String(aq.explanation || '') }
      }
    }

    /* اللاعبين — بيانات السباق لكل واحد (من غير إجاباتهم!) */
    var playersOut = players.map(function (p: any) {
      var pa = parseObj(p.answers)
      var pq = Math.max(0, Number(p.qIndex || 0))
      var pOnline = isActive(p) && Number(p.lastSeen || 0) > now - ONLINE_WINDOW_MS
      return {
        id: p.id,
        name: String(p.name || ''),
        isHost: !!Number(p.isHost || 0),
        score: Number(p.score || 0),
        streak: Number(p.streak || 0),
        qIndex: pq,
        finished: isFinished(p),
        finishedAt: String(p.finishedAt || ''),
        status: String(p.status || 'active'),
        online: pOnline,
        isMe: !!(me && p.id === me.id),
        answeredCurrent: !!(pa && pa[String(pq)] !== undefined),
      }
    })

    /* لوحة «مين خلّص الأول» — الخالصين الأول (بالأسرع) وبعدين الباقي بالدرجة */
    var activeForBoard = players.filter(function (p: any) { return isActive(p) })
    var leaderboard = activeForBoard.slice().sort(function (a: any, b: any) {
      var fa = isFinished(a)
      var fb = isFinished(b)
      if (fa && fb) return Number(a.finishedAt || 0) - Number(b.finishedAt || 0)
      if (fa !== fb) return fa ? -1 : 1
      return Number(b.score || 0) - Number(a.score || 0)
    }).map(function (p: any, li: number) {
      return {
        rank: li + 1,
        id: p.id,
        name: String(p.name || ''),
        score: Number(p.score || 0),
        qIndex: Math.max(0, Number(p.qIndex || 0)),
        finished: isFinished(p),
        finishedAt: String(p.finishedAt || ''),
        online: isActive(p) && Number(p.lastSeen || 0) > now - ONLINE_WINDOW_MS,
        isHost: !!Number(p.isHost || 0),
        status: String(p.status || 'active'),
        isMe: !!(me && p.id === me.id),
      }
    })

    var ended = room.status === 'ended'

    /* نتايج نهائية كاملة بعد الختام */
    var finalQuestions: any[] | null = null
    var finalAnswers: Record<string, any> | null = null
    if (ended) {
      finalQuestions = questions.map(function (q: any) {
        return { text: String(q.text || ''), options: q.options || [], correctIndex: Number(q.correctIndex), explanation: String(q.explanation || '') }
      })
      finalAnswers = {}
      for (var pi = 0; pi < players.length; pi++) {
        finalAnswers[players[pi].id] = parseObj(players[pi].answers)
      }
    }

    return NextResponse.json({
      ok: true,
      room: {
        code: room.code,
        title: room.title,
        status: room.status,
        currentIndex: Number(room.currentIndex || 0),
        totalRounds: total,
        hostPlayerId: room.hostPlayerId,
        mode: String(room.mode || 'general'),
        difficulty: String(room.difficulty || 'mixed'),
        cardSeconds: Number(room.cardSeconds || 15),
        /* (و88) إعدادات التوقيت بتتنشر للواجهة */
        timed: effTimed ? 1 : 0,
        qSeconds: effQSec >= 5 ? effQSec : 25,
        startedAt: startedAt,
        currentQuestion: null, /* (و72) السؤال بقى لكل لاعب — في me بالأسفل */
        revealed: null,
        /* أسئلة الغرفة من غير الإجابات — العميل بيعرض سؤاله منه فورًا
           (و88) timeLimitSec = الفعّلي (اختيار صاحب الغرفة — صفر لو من غير وقت) */
        questions: questions.map(function (q: any, qi: number) {
          var eff = effTimed ? (effQSec >= 5 ? effQSec : Number(q.timeLimitSec || 25)) : 0
          return { index: qi, text: String(q.text || ''), options: q.options || [], timeLimitSec: eff }
        }),
        players: playersOut,
        leaderboard: leaderboard,
        finalQuestions: finalQuestions,
        finalAnswers: finalAnswers,
      },
      me: me
        ? {
            id: me.id,
            name: String(me.name || ''),
            token: String(me.token || ''),
            isHost: !!Number(me.isHost || 0),
            score: myScore,
            streak: myStreak,
            qIndex: myQIndex,
            total: total,
            finished: myFinished,
            finishedAt: myFinishedAt,
            qStartAt: Number(me.qStartAt || 0),
            remainMs: myRemainMs,
            myAnswer: myAnswers[String(myQIndex)] || null,
            lastResult: myAnswers[String(myQIndex - 1)] || null,
            answers: myAnswers,
            revealed: myRevealed,
          }
        : null,
      now: now,
    })
  } catch (e: any) {
    console.error('[arena/room GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تحديث الغرفة' }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ code: string }> }) {
  try {
    await ensureArenaTables()
    var code = String((await params).code || '').toUpperCase().trim()
    var body = await request.json().catch(function () { return ({} as any) })
    var action = String(body.action || '')

    var roomRows = await db.$queryRawUnsafe('SELECT * FROM BattleRoom WHERE code = ? LIMIT 1', code)
    if (!roomRows || roomRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'الغرفة مش موجودة' }, { status: 404 })
    }
    var room = roomRows[0]
    var questions: any[] = []
    try { questions = JSON.parse(String(room.questions || '[]')) } catch (e) {}

    /* ===== join ===== */
    if (action === 'join') {
      if (room.status === 'ended') return NextResponse.json({ ok: false, error: 'التحدي ده خلص خلاص' }, { status: 409 })
      var existingPlayers = await db.$queryRawUnsafe('SELECT * FROM BattlePlayer WHERE roomId = ?', room.id)
      existingPlayers = existingPlayers || []
      var activePlayers = existingPlayers.filter(function (p: any) { return isActive(p) })
      var name = String(body.name || '').trim().slice(0, 40)
      if (!name) return NextResponse.json({ ok: false, error: 'اكتب اسمك الأول' }, { status: 400 })
      var studentId = String(body.studentId || '').trim().slice(0, 64)

      /* (2026-و79) إصلاح علة «الصاحب دخل بحسابي تلقائي»:
         مفيش REATTACH بالـ studentId خالص — أي حد بيدخل بالكود الصحيح
         بيتعمله **لاعب جديد بحسابه هو** (اسمه + studentId بتاعته هو).
         استرجاع جلسة نفس اللاعب بعد الريفريش بيحصل بالـ playerId+token
         بس (في GET) — مش بالحساب. الكود الغلط مبيفتحش حاجة أصلًا (404). */

      /* (و72) دخول جديد بعد ما السباق بدأ → مرفوض (الدخول من اللوبي بس) */
      if (room.status === 'live') {
        return NextResponse.json({ ok: false, error: 'التحدي بدأ بالفعل' }, { status: 409 })
      }
      if (activePlayers.length >= MAX_PLAYERS) {
        return NextResponse.json({ ok: false, error: 'الغرفة كملت (' + MAX_PLAYERS + ' لاعبين كحد أقصى)' }, { status: 409 })
      }
      // لو نفس الاسم موجود → نميزه برقم (بين النشطين بس)
      var taken = activePlayers.some(function (p: any) { return String(p.name) === name })
      if (taken) name = name + ' ' + (activePlayers.length + 1)
      var pid = 'bp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9)
      var ptoken = Math.random().toString(36).slice(2) + Date.now().toString(36)
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "INSERT INTO BattlePlayer (id, roomId, name, token, isHost, score, streak, answers, lastSeen, studentId, qIndex, qStartAt, finishedAt, finished, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, 0, 0, 0, ?, ?, ?, 0, '', '', 0, 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
          pid, room.id, name, ptoken, '{}', String(Date.now()), studentId
        )
      })
      return NextResponse.json({
        ok: true,
        me: { id: pid, name: name, token: ptoken, isHost: false, score: 0, streak: 0 },
        room: { code: room.code, status: room.status, totalRounds: questions.length, mode: String(room.mode || 'general'), difficulty: String(room.difficulty || 'mixed'), cardSeconds: Number(room.cardSeconds || 15), timed: roomTimed(room) ? 1 : 0, qSeconds: Math.max(25, Math.round(Number(room.qSeconds) || 0)) },
      })
    }

    /* باقي الأفعال محتاجة لاعب + توكن */
    var playerId = String(body.playerId || '')
    var token = String(body.token || '')
    var meRows = await db.$queryRawUnsafe('SELECT * FROM BattlePlayer WHERE id = ? AND roomId = ? LIMIT 1', playerId, room.id)
    if (!meRows || meRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'مين انت؟ سجل في الغرفة الأول' }, { status: 403 })
    }
    var me = meRows[0]
    if (String(me.token || '') !== token) {
      return NextResponse.json({ ok: false, error: 'جلسة غير صالحة — ادخل من الأول' }, { status: 403 })
    }
    if (!isActive(me)) {
      return NextResponse.json({ ok: false, error: 'خرجت من التحدي ومش مسموح ترجع تاني' }, { status: 403 })
    }
    var isHost = !!Number(me.isHost || 0)

    /* ===== start (هوست) — بيسجل startedAt ويصفّر مؤقتات كل النشطين ===== */
    if (action === 'start') {
      if (!isHost) return NextResponse.json({ ok: false, error: 'الهوست بس اللي بيبدأ التحدي' }, { status: 403 })
      if (room.status !== 'lobby') return NextResponse.json({ ok: true, already: true })
      var startMs = String(Date.now())
      await safeWrite(function () {
        return db.$executeRawUnsafe("UPDATE BattleRoom SET status = 'live', currentIndex = 0, questionStartAt = ?, startedAt = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?", startMs, startMs, room.id)
      })
      await safeWrite(function () {
        return db.$executeRawUnsafe("UPDATE BattlePlayer SET qIndex = 0, qStartAt = ?, finished = 0, finishedAt = '', updatedAt = CURRENT_TIMESTAMP WHERE roomId = ? AND status != 'left'", startMs, room.id)
      })
      return NextResponse.json({ ok: true })
    }

    /* ===== answer — سؤالي أنا بس (idx === player.qIndex) وتقدّم فوري ===== */
    if (action === 'answer') {
      if (room.status !== 'live') return NextResponse.json({ ok: false, error: 'التحدي مش شغال دلوقتي' }, { status: 409 })
      if (isFinished(me)) return NextResponse.json({ ok: false, error: 'انت خلصت خلاص — استنى الباقيين 🏁' }, { status: 409 })
      var idx = Number(body.questionIndex)
      if (idx !== Number(me.qIndex || 0)) {
        return NextResponse.json({ ok: false, error: 'السؤال اتغير — كمل على اللي بعده' }, { status: 409 })
      }
      var q = questions[idx]
      if (!q) return NextResponse.json({ ok: false, error: 'سؤال غير موجود' }, { status: 404 })
      var limitMs = roomLimitMs(room, q)
      var startAt = Number(me.qStartAt || room.startedAt || 0)
      var elapsed = startAt > 0 ? Math.max(0, Date.now() - startAt) : 0
      /* (و88) من غير وقت → مفيش رفض بالوقت خالص */
      if (limitMs > 0 && elapsed > limitMs + ADVANCE_GRACE_MS) {
        return NextResponse.json({ ok: false, error: 'الوقت خلص على السؤال ده' }, { status: 409 })
      }
      var answersObj = parseObj(me.answers)
      if (answersObj[String(idx)]) {
        return NextResponse.json({ ok: false, error: 'جاوبت في السؤال ده قبل كذا' }, { status: 409 })
      }
      var choice = Number(body.choice)
      var ms = Math.max(0, Math.min(Number(body.ms) || elapsed, elapsed || Number(body.ms) || 0))
      var correct = choice === Number(q.correctIndex) ? 1 : 0
      var gained = 0
      var streak = Number(me.streak || 0)
      if (correct) {
        /* (و88) بوقت → بونص سرعة (كل ما تجاوب أسرع) / من غير وقت → 60 ثابتة */
        if (limitMs > 0) {
          var remainFrac = Math.max(0, 1 - ms / limitMs)
          gained = 60 + Math.round(40 * remainFrac)
        } else {
          gained = 60
        }
        streak = streak + 1
        if (streak >= 3) gained += 15 // بونص الستريك — تلات إجابات صح ورا بعض
      } else {
        streak = 0
      }
      answersObj[String(idx)] = { choice: choice, correct: correct, gained: gained, ms: ms }
      var nextIndex = idx + 1
      var willFinish = nextIndex >= questions.length
      var nowMs = String(Date.now())
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          'UPDATE BattlePlayer SET answers = ?, score = score + ?, streak = ?, qIndex = ?, qStartAt = ?, finished = ?, finishedAt = ?, lastSeen = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          JSON.stringify(answersObj), gained, streak, nextIndex, nowMs, willFinish ? 1 : 0, willFinish ? nowMs : '', nowMs, me.id
        )
      })
      /* (و72) لو كل النشطين خلصوا → الغرفة بتتنهي فورًا من غير ما نستنى GET */
      if (willFinish) {
        try {
          var all = await db.$queryRawUnsafe('SELECT finished, status FROM BattlePlayer WHERE roomId = ?', room.id)
          var act = 0
          var fin = 0
          for (var ai = 0; ai < (all || []).length; ai++) {
            if (!isActive(all[ai])) continue
            act++
            if (isFinished(all[ai])) fin++
          }
          if (act > 0 && fin >= act) {
            await safeWrite(function () {
              return db.$executeRawUnsafe("UPDATE BattleRoom SET status = 'ended', updatedAt = CURRENT_TIMESTAMP WHERE id = ?", room.id)
            })
          }
        } catch (e2) {}
      }
      return NextResponse.json({
        ok: true,
        correct: !!correct,
        gained: gained,
        streak: streak,
        correctIndex: Number(q.correctIndex), // للطالب اللي جاوب — محدش تاني بيشوفها
        explanation: String(q.explanation || ''),
        finished: willFinish,
        nextIndex: nextIndex,
      })
    }

    /* ===== next (هوست) — (و72) no-op: السباق بيقدّم نفسه لاعب لاعب ===== */
    if (action === 'next') {
      if (!isHost) return NextResponse.json({ ok: false, error: 'الهوست بس' }, { status: 403 })
      return NextResponse.json({ ok: true, noop: true })
    }

    /* ===== end (هوست) — إنهاء مبكر ===== */
    if (action === 'end') {
      if (!isHost) return NextResponse.json({ ok: false, error: 'الهوست بس' }, { status: 403 })
      await safeWrite(function () {
        return db.$executeRawUnsafe("UPDATE BattleRoom SET status = 'ended', updatedAt = CURRENT_TIMESTAMP WHERE id = ?", room.id)
      })
      return NextResponse.json({ ok: true })
    }

    /* ===== leave — (و72) مسموح في أي مرحلة: بنعلّم status='left' من غير مسح
       الصف — اللاعب اللي خرج ممنوع يرجع بنفس studentId/الجلسة، ومش بيظهر
       في اللوحة ولا في حسابات «الكل جاوب». تسليم الهوست في اللوبي بس. ===== */
    if (action === 'leave') {
      await safeWrite(function () {
        return db.$executeRawUnsafe("UPDATE BattlePlayer SET status = 'left', lastSeen = '0', updatedAt = CURRENT_TIMESTAMP WHERE id = ?", me.id)
      })
      // لو الهوست مشي من اللوبي → أول تاني نشيط بقي هوست
      if (isHost && room.status === 'lobby') {
        var rest = await db.$queryRawUnsafe("SELECT id FROM BattlePlayer WHERE roomId = ? AND status != 'left' AND id != ? ORDER BY lastSeen ASC LIMIT 1", room.id, me.id)
        if (rest && rest.length > 0) {
          await safeWrite(function () { return db.$executeRawUnsafe('UPDATE BattlePlayer SET isHost = 1 WHERE id = ?', rest[0].id) })
          await safeWrite(function () { return db.$executeRawUnsafe('UPDATE BattleRoom SET hostPlayerId = ? WHERE id = ?', rest[0].id, room.id) })
        }
      }
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'أكشن غير معروف' }, { status: 400 })
  } catch (e: any) {
    console.error('[arena/room POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تنفيذ الطلب' }, { status: 500 })
  }
}
