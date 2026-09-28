'use client'

// ============================================================
// FILE: src/components/student/BattleArena.tsx
// PURPOSE: (2026-و66) تاب «ساحة التحدي» للطالب — 3 أوضاع:
//   1) تحدي الجروبات — غرف لايف بالكود (polling كل 1.2 ثانية على
//      /api/arena/rooms/[code]) — idle → lobby → live → ended
//      مع حفظ الجلسة في localStorage (mg_battle_me_{code}) عشان
//      الريفريش أو تكسير التاب ما يخرجش اللاعب من الغرفة
//   2) تحدي المستر — سؤال المستر الأسبوعي + لوحة ترتيب بتتحدث كل 10 ث
//   3) فلاش كاردز سريعة — 10 بطاقات × 8 ثواني (التصحيح محلي فوري)
// القواعد: لمسة كبيرة (min-h-12) + RTL + ممنوع أزرق/بنفسجي غامق
//   + تنظيف صارم لكل الـ intervals في الـ useEffect returns
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Swords, Zap, Crown, Trophy, Timer, Flame, Copy, LogOut, LogIn,
  Play, Check, X, Loader2, RotateCcw, UserPlus, Plus, GraduationCap, ListChecks, RefreshCw,
  Sparkles,
} from 'lucide-react'
/* (2026-و71) عارض الماث بتاع المنصة نفسه — الأس ² والكسور المكدسة
   زي الامتحانات بالظبط — طلب المستر: «عاوز الحاجات تبقى بالماث
   زي الحاجات بتاعة الماث اللي إحنا عاملينها في منصتنا» */
import { FractionText } from '@/components/FractionText'
/* (2026-و89) زرار ✨ التلميح الذكي — والتلميح بقى بالإنجليزي (التحديات كلها إنجليزي) */

/* ============================================================
 * الأنواع — مطابقة لعقود الـ APIs الحية
 * (2026-و72) السباق الفردي: الغرفة بترجع أسئلتها (من غير الإجابات)
 * + بيانات سباقي (qIndex/remainMs/finished) + لوحة «مين خلّص الأول»
 * ============================================================ */
interface ArenaPlayer {
  id: string
  name: string
  isHost: boolean
  score: number
  streak: number
  online: boolean
  answeredCurrent: boolean
  /* (و72) بيانات السباق */
  qIndex?: number
  finished?: boolean
  finishedAt?: string
  status?: string
  isMe?: boolean
}

interface ArenaLiveQuestion {
  index: number
  text: string
  options: string[]
  timeLimitSec: number
  remainMs: number
}

/* (و72) سؤال السباق — من غير correctIndex (بتوصل بعد الإجابة بس) */
interface ArenaQ {
  index: number
  text: string
  options: string[]
  timeLimitSec: number
}

interface ArenaBoardRow {
  rank: number
  id?: string
  name: string
  score: number
  qIndex: number
  finished: boolean
  finishedAt: string
  online: boolean
  isHost: boolean
  status: string
  isMe: boolean
}

interface ArenaRoom {
  code: string
  title?: string
  status: 'lobby' | 'live' | 'ended'
  currentIndex: number
  totalRounds: number
  hostPlayerId?: string
  currentQuestion: ArenaLiveQuestion | null
  revealed: { correctIndex: number; explanation: string } | null
  players: ArenaPlayer[]
  finalQuestions: { text: string; options: string[]; correctIndex: number; explanation: string }[] | null
  finalAnswers: Record<string, Record<string, { choice: number; correct: number; gained: number; ms: number }>> | null
  /* (و72) بيانات السباق */
  mode?: string
  difficulty?: string
  cardSeconds?: number
  /* (و88) إعدادات التوقيت — بوقت/من غير وقت + ثواني السؤال (للأسئلة العامة) */
  timed?: number
  qSeconds?: number
  startedAt?: number
  questions?: ArenaQ[]
  leaderboard?: ArenaBoardRow[]
}

interface ArenaMe {
  id: string
  name: string
  token: string
  isHost: boolean
  score: number
  streak: number
  myAnswer?: { choice: number; correct: number; gained: number; ms: number } | null
  /* (و72) بيانات سباقي */
  qIndex?: number
  total?: number
  finished?: boolean
  finishedAt?: string
  qStartAt?: number
  remainMs?: number
  answers?: Record<string, { choice: number; correct: number; gained: number; ms: number }>
  revealed?: Record<string, { correctIndex: number; explanation: string }>
}

/* فيدباك لحظي على إجابتي في الجروبات — (و72) فيه الإجابة الصح من رد السيرفر */
interface MyFeedback {
  correct: boolean
  gained: number
  streak: number
  choice: number
  timeout?: boolean
  correctIndex?: number
  questionIndex?: number
}

/* تحدي المستر */
interface TeacherChallenge {
  id: string
  title: string
  question: string
  options: string[]
  points: number
  active: boolean
  closesAt: string | null
  createdAt: string
  /* (2026-و68-إضافي) فيديو المستر — بيرجع من السيرفر بس لو موجود فعلًا */
  videoUrl?: string
  videoType?: string
}
interface ChallengeRow {
  rank: number
  name: string
  isTeacher: boolean
  correct: boolean
  timeMs: number
  createdAt: string
}
interface ChallengeData {
  active: TeacherChallenge | null
  leaderboard: ChallengeRow[]
  history: { id: string; title: string; points: number; createdAt: string }[]
  myEntry: { choice: number; correct: boolean; timeMs: number } | null
}

/* فلاش كاردز */
interface FlashCard {
  id: string
  text: string
  options: string[]
  correctIndex: number
  timeLimitSec: number
}
interface BoardRow {
  rank: number
  name: string
  score: number
  correctCount: number
  totalCards: number
  createdAt: string
}
interface FcFeedback {
  choice: number // -1 = تايم أوت
  correct: boolean
  timeout: boolean
  gained: number
}

/* ============================================================
 * أدوات مشتركة صغيرة
 * ============================================================ */
var LETTERS = ['A', 'B', 'C', 'D']

/* (2026-و66) مفتاح حفظ جلسة اللاعب — قيمة = {playerId, token, ts}
   (2026-و79) **sessionStorage بدل localStorage** — إصلاح علة «الصاحب دخل
   بحسابي تلقائي»: الجلسة بقت بتاعة التاب الحالي بس — أي حد يفتح المنصة
   في تاب/جلسة جديدة بيدخل **بحسابه هو** كلاعب جديد، ومفيش استرجاع تلقائي
   لجلسة اللاعب اللي عملت الغرفة من نفس المتصفح. الريفريش في نفس التاب
   لسه بيرجّع نفس اللاعب زي ما هو. */
var ME_KEY_PREFIX = 'mg_battle_me_'

function battleStore(): Storage | null {
  try { return window.sessionStorage || null } catch (e) { return null }
}

function saveMeLocal(code: string, me: { id: string; token: string }): void {
  try {
    var st = battleStore()
    if (st) st.setItem(ME_KEY_PREFIX + code, JSON.stringify({ playerId: me.id, token: me.token, ts: Date.now() }))
  } catch (e) { /* التخزين ممكن يكون مقفول — مش مشكلة قاطعة */ }
}

function clearMeLocal(code: string): void {
  try { var st = battleStore(); if (st) st.removeItem(ME_KEY_PREFIX + code) } catch (e) {}
}

/* آخر جلسة محفوظة (لو الطالب فتح أكتر من غرفة بنآخذ الأحدث بالتوقيت) */
function readSavedMe(): { code: string; playerId: string; token: string } | null {
  try {
    var st = battleStore()
    if (!st) return null
    var best: { code: string; playerId: string; token: string; ts: number } | null = null
    for (var i = 0; i < st.length; i++) {
      var k = st.key(i)
      if (!k || k.indexOf(ME_KEY_PREFIX) !== 0) continue
      var v = JSON.parse(st.getItem(k) || 'null')
      if (v && v.playerId && v.token) {
        var ts = Number(v.ts || 0)
        if (!best || ts > best.ts) {
          best = { code: k.slice(ME_KEY_PREFIX.length), playerId: String(v.playerId), token: String(v.token), ts: ts }
        }
      }
    }
    return best
  } catch (e) { return null }
}

/* ميداليات الترتيب — أول 3 بس والباقي رقم */
function rankMedal(rank: number): string {
  if (rank === 1) return '🥇'
  if (rank === 2) return '🥈'
  if (rank === 3) return '🥉'
  return ''
}

/* عداد تنازلي m:ss أو h:mm:ss — بيتعرض dir=ltr */
function fmtCountdown(ms: number): string {
  var s = Math.max(0, Math.floor(ms / 1000))
  var h = Math.floor(s / 3600)
  var m = Math.floor((s % 3600) / 60)
  var sec = s % 60
  var mm = (m < 10 ? '0' : '') + m
  var ss = (sec < 10 ? '0' : '') + sec
  return h > 0 ? (h + ':' + mm + ':' + ss) : (mm + ':' + ss)
}

/* شريط تمرير ناعم للقايم الطويلة (مخصوص للساحة) */
var SCROLL_CLS = 'max-h-96 overflow-y-auto [&::-webkit-scrollbar]:w-2 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700'

async function postJson(url: string, body: any): Promise<{ status: number; data: any }> {
  var res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    cache: 'no-store',
  })
  var data: any = null
  try { data = await res.json() } catch (e) { data = null }
  return { status: res.status, data: data }
}

/* ============================================================
 * الوضع 1: تحدي الجروبات — (2026-و72) سباق فردي RACE:
 *   كل لاعب ليه مؤقّت وسؤال مستقل — ما فيش انتظار باقي اللاعبين.
 *   جاوب → فيدباك لحظي ~1 ثانية → السؤال اللي بعده فورًا.
 *   اللي يخلص أسئلته الأول يكسب (⏱ زمن الخلوص مسجل على السيرفر).
 * ============================================================ */

/* (و72) شيبس اختيار خيارات الغرفة — كبيرة تصلح للمس */
function OptionChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: any }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={'min-h-10 rounded-xl border-2 px-2 text-[13px] font-black transition-colors ' +
        (active
          ? 'border-emerald-500 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
          : 'border-stone-200 bg-white text-stone-500 hover:border-emerald-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400')}
    >
      {children}
    </button>
  )
}

function GroupsMode({ studentId, studentName }: { studentId: string; studentName: string }) {
  /* الحالة الرئيسية — الغرفة هي مصدر الحقيقة (idle = مفيش غرفة) */
  var [gRoom, setGRoom] = useState<ArenaRoom | null>(null)
  var [gMe, setGMe] = useState<ArenaMe | null>(null)
  var [playerName, setPlayerName] = useState(studentName)
  var [joinCode, setJoinCode] = useState('')
  /* (2026-و68) كود مخصص — الطالب يكتب كود الغرفة بنفسه */
  var [customCode, setCustomCode] = useState('')
  /* (2026-و72) خيارات إنشاء الغرفة */
  var [optMode, setOptMode] = useState<'general' | 'flash'>('general')
  var [optDiff, setOptDiff] = useState<'easy' | 'medium' | 'hard'>('medium')
  var [optRounds, setOptRounds] = useState(8)
  var [optCardSec, setOptCardSec] = useState(15)
  /* (2026-و88) الأسئلة العامة: بوقت ولا من غير وقت + مدة السؤال — طلب المستر */
  var [optTimed, setOptTimed] = useState(true)
  var [optQSec, setOptQSec] = useState(25)
  var [busy, setBusy] = useState('') // create | join | start | end | leave
  var [sendingAnswer, setSendingAnswer] = useState(false)
  var [pendingChoice, setPendingChoice] = useState(-1)
  var [myFeedback, setMyFeedback] = useState<MyFeedback | null>(null)
  var [gNow, setGNow] = useState(Date.now())
  /* (و72) السباق الفردي — سؤالي الحالي (myQIdx) والسؤال المعروض (shownIdx):
     بعد الإجابة myQIdx بيتقدّم فورًا و shownIdx بيستنى الفيدباك (~1 ثانية) */
  var [myQIdx, setMyQIdx] = useState(0)
  var [shownIdx, setShownIdx] = useState(0)
  var [raceDone, setRaceDone] = useState(false)
  var [localFinishAt, setLocalFinishAt] = useState(0)

  /* مراجع — عشان الـ polling ميقعش في stale closures */
  var gMeRef = useRef<ArenaMe | null>(null)
  var gRoomRef = useRef<ArenaRoom | null>(null)
  var gRoomCodeRef = useRef('')
  var roomQRef = useRef<ArenaQ[]>([])
  var myQIdxRef = useRef(0)
  var shownIdxRef = useRef(0)
  var raceDoneRef = useRef(false)
  var sendingRef = useRef(false)
  var feedbackQIdxRef = useRef(-999)
  var advanceTimerRef = useRef<number | null>(null)
  /* أساس عدّاد سؤالي: {remainMs, at, limitMs} — بيتزامن من البولينج ويجري محليًا */
  var qRemainBaseRef = useRef<{ remainMs: number; at: number; limitMs: number } | null>(null)

  useEffect(function () { gMeRef.current = gMe }, [gMe])
  useEffect(function () { gRoomRef.current = gRoom }, [gRoom])
  useEffect(function () { gRoomCodeRef.current = gRoom ? gRoom.code : '' }, [gRoom])
  useEffect(function () { roomQRef.current = (gRoom && gRoom.questions) ? gRoom.questions : [] }, [gRoom])
  useEffect(function () { myQIdxRef.current = myQIdx }, [myQIdx])
  useEffect(function () { shownIdxRef.current = shownIdx }, [shownIdx])
  useEffect(function () { raceDoneRef.current = raceDone }, [raceDone])
  useEffect(function () { sendingRef.current = sendingAnswer }, [sendingAnswer])

  function killAdvanceTimer(): void {
    if (advanceTimerRef.current !== null) {
      clearTimeout(advanceTimerRef.current)
      advanceTimerRef.current = null
    }
  }

  /* صفّر حالة الجروبات والرجوع لشاشة البداية */
  function resetGroups(): void {
    if (gRoom) clearMeLocal(gRoom.code)
    gRoomCodeRef.current = ''
    setGRoom(null)
    setGMe(null)
    setMyFeedback(null)
    setPendingChoice(-1)
    setJoinCode('')
    setCustomCode('')
    myQIdxRef.current = 0
    setMyQIdx(0)
    shownIdxRef.current = 0
    setShownIdx(0)
    raceDoneRef.current = false
    setRaceDone(false)
    setLocalFinishAt(0)
    feedbackQIdxRef.current = -999
    qRemainBaseRef.current = null
    killAdvanceTimer()
  }

  /* تسجيل اللاعب في الغرفة (إنشاء أو دخول أو رجوع لجلسة) */
  function applyJoined(code: string, me: ArenaMe, room: ArenaRoom): void {
    saveMeLocal(code, me)
    gRoomCodeRef.current = code
    feedbackQIdxRef.current = -999
    qRemainBaseRef.current = null
    killAdvanceTimer()
    var qi = Math.max(0, Number(me.qIndex || 0))
    myQIdxRef.current = qi
    setMyQIdx(qi)
    shownIdxRef.current = qi
    setShownIdx(qi)
    var fin = !!me.finished
    raceDoneRef.current = fin
    setRaceDone(fin)
    setLocalFinishAt(0)
    setGMe(me)
    setGRoom(room)
  }

  /* ===== استرجاع الجلسة بعد ريفريش/تبديل تاب — re-GET بالـ playerId/token ===== */
  useEffect(function () {
    var saved = readSavedMe()
    if (!saved || !saved.code) return
    var alive = true
    ;(async function () {
      try {
        var res = await fetch('/api/arena/rooms/' + encodeURIComponent(saved.code) + '?playerId=' + encodeURIComponent(saved.playerId) + '&token=' + encodeURIComponent(saved.token), { cache: 'no-store' })
        if (!alive) return
        if (!res.ok) {
          /* (و72) جلسة ماتت أو الطالب كان خرج → نمسح التخزين ونعرض الرسالة */
          clearMeLocal(saved.code)
          var err: any = null
          try { err = await res.json() } catch (e2) {}
          if (err && err.error) toast.error(String(err.error))
          return
        }
        var data: any = await res.json()
        if (!alive || !data || !data.ok || !data.me || !data.room) { clearMeLocal(saved.code); return }
        var m = data.me
        applyJoined(String(data.room.code), {
          id: m.id, name: m.name, token: m.token, isHost: !!m.isHost, score: Number(m.score || 0), streak: Number(m.streak || 0),
          qIndex: Number(m.qIndex || 0), total: Number(m.total || 0), finished: !!m.finished, finishedAt: String(m.finishedAt || ''),
          qStartAt: Number(m.qStartAt || 0), remainMs: Number(m.remainMs || 0), answers: m.answers || {}, revealed: m.revealed || {},
        }, data.room)
        toast.success('رجعناك لغرفة ' + String(data.room.code) + ' 🎮')
      } catch (e) { /* الشبكة — السترك الجاي في البولينج يعوض */ }
    })()
    return function () { alive = false }
  }, [])

  /* تنظيف التايمرات عند الخروج — ممنوع تايمر يفضل عايش */
  useEffect(function () {
    return function () { killAdvanceTimer() }
  }, [])

  /* ===== البولينج — قلب الوضع اللاتمزامي (1.2 ثانية) ===== */
  var gPhase = gRoom ? gRoom.status : ''
  var meId = gMe ? gMe.id : ''
  useEffect(function () {
    if (!gPhase || (gPhase !== 'lobby' && gPhase !== 'live')) return
    var alive = true
    async function tick(): Promise<void> {
      var me = gMeRef.current
      var code = gRoomCodeRef.current
      if (!me || !code) return
      try {
        var res = await fetch('/api/arena/rooms/' + encodeURIComponent(code) + '?playerId=' + encodeURIComponent(me.id) + '&token=' + encodeURIComponent(me.token), { cache: 'no-store' })
        if (!alive) return
        if (res.status === 404) {
          /* الغرفة اتقفلت أو اتمسحت — نرجع لشاشة البداية بلطف */
          clearMeLocal(code)
          setGRoom(null)
          setGMe(null)
          setMyFeedback(null)
          myQIdxRef.current = 0
          setMyQIdx(0)
          shownIdxRef.current = 0
          setShownIdx(0)
          raceDoneRef.current = false
          setRaceDone(false)
          feedbackQIdxRef.current = -999
          toast.error('الغرفة اتقفلت — ابدأ واحدة جديدة 💪')
          return
        }
        if (res.status === 403) {
          /* (و72) الطالب خرج من التحدي أو الجلسة بقت غير صالحة */
          clearMeLocal(code)
          var err403: any = null
          try { err403 = await res.json() } catch (e3) {}
          setGRoom(null)
          setGMe(null)
          setMyFeedback(null)
          myQIdxRef.current = 0
          setMyQIdx(0)
          shownIdxRef.current = 0
          setShownIdx(0)
          raceDoneRef.current = false
          setRaceDone(false)
          feedbackQIdxRef.current = -999
          toast.error(String((err403 && err403.error) || 'جلسة غير صالحة — ادخل من الأول'))
          return
        }
        var data: any = await res.json()
        if (!alive || !data || !data.ok) return
        var room: ArenaRoom = data.room
        setGRoom(room)
        if (!data.me) {
          /* اللاعب مش موجود في الغرفة — خروج نظيف */
          clearMeLocal(code)
          setGRoom(null)
          setGMe(null)
          setMyFeedback(null)
          toast.error('انت مش في الغرفة دي — ادخل تاني')
          return
        }
        var m = data.me
        setGMe({
          id: m.id, name: m.name, token: m.token, isHost: !!m.isHost, score: Number(m.score || 0), streak: Number(m.streak || 0),
          myAnswer: m.myAnswer || null,
          qIndex: Number(m.qIndex || 0), total: Number(m.total || 0), finished: !!m.finished, finishedAt: String(m.finishedAt || ''),
          qStartAt: Number(m.qStartAt || 0), remainMs: Number(m.remainMs || 0),
          answers: m.answers || {}, revealed: m.revealed || {},
        })
        /* (و72) مزامنة تقدّمي — السيرفر هو الحكم: لو قدّم أكتر مني (تايم أوت مثلًا) نلحقه.
           لو إحنا اللي قدمنا بالفيدباك (محليًا) والسيرفر لسه بيلحق → مش بنرجع لورا. */
        var serverQ = Math.max(0, Number(m.qIndex || 0))
        var limitOf = function (idx: number): number {
          var qs = room.questions || []
          var qq = qs[idx]
          return qq ? Math.max(5, Number(qq.timeLimitSec || 25)) * 1000 : 30000
        }
        if (m.finished && !raceDoneRef.current) {
          raceDoneRef.current = true
          setRaceDone(true)
          setLocalFinishAt(Number(m.finishedAt) || Date.now())
          killAdvanceTimer()
          feedbackQIdxRef.current = -999
          setMyFeedback(null)
        }
        if (serverQ > myQIdxRef.current) {
          myQIdxRef.current = serverQ
          setMyQIdx(serverQ)
          if (!myFeedback && advanceTimerRef.current === null) {
            shownIdxRef.current = serverQ
            setShownIdx(serverQ)
            qRemainBaseRef.current = { remainMs: Number(m.remainMs || 0) || limitOf(serverQ), at: Date.now(), limitMs: limitOf(serverQ) }
          }
        } else if (serverQ === myQIdxRef.current && shownIdxRef.current === serverQ && !myFeedback && advanceTimerRef.current === null && !m.finished) {
          /* نفس السؤال → زامن العدّاد المحلي (عشان يجري صح بين البولينجات) */
          qRemainBaseRef.current = { remainMs: Number(m.remainMs || 0), at: Date.now(), limitMs: limitOf(serverQ) }
        }
      } catch (e) { /* خطأ شبكة عابر — السترك الجاي يعوض */ }
    }
    tick()
    var iv = setInterval(function () { tick() }, 1200)
    return function () { alive = false; clearInterval(iv) }
  }, [gPhase, meId])

  /* ===== مؤقّت محلي — يجري كل 300ms طول ما إحنا في اللايف (ساعة + عدّاد) ===== */
  useEffect(function () {
    if (gPhase !== 'live') return
    setGNow(Date.now())
    var iv = setInterval(function () { setGNow(Date.now()) }, 300)
    return function () { clearInterval(iv) }
  }, [gPhase])

  /* ===== (و72) مؤقّت سؤالي — لما يخلص: فيدباك ⌛ + تقدّم تلقائي زي السيرفر
     (و88) الغرف «من غير وقت» مفيهاش مؤقّت سؤالي خالص — الطالب بياخد وقته */
  function onMyTimeUp(): void {
    if (raceDoneRef.current || sendingRef.current) return
    var cur = myQIdxRef.current
    if (feedbackQIdxRef.current === cur) return
    feedbackQIdxRef.current = cur
    setMyFeedback({ correct: false, gained: 0, streak: 0, choice: -1, timeout: true, questionIndex: cur })
    /* السيرفر بيتقدّم بعد سماحية قصيرة — نقدّم معاه بنفس الإيقاع */
    var next = cur + 1
    myQIdxRef.current = next
    setMyQIdx(next)
    var qs = roomQRef.current
    var isLast = next >= qs.length
    var nl = qs[next] ? Math.max(5, Number(qs[next].timeLimitSec || 25)) * 1000 : 30000
    qRemainBaseRef.current = { remainMs: nl, at: Date.now(), limitMs: nl }
    if (isLast) scheduleFinish(950)
    else scheduleAdvance(950)
  }

  useEffect(function () {
    if (gPhase !== 'live' || raceDone || myFeedback || shownIdx !== myQIdx) return
    /* (و88) من غير وقت → مفيش تايم أوت على السؤال خالص */
    var curRoom = gRoomRef.current
    if (curRoom && curRoom.timed === 0) return
    var base = qRemainBaseRef.current
    if (!base) return
    var left = Math.max(0, base.remainMs - (Date.now() - base.at))
    if (left > 0) {
      var t = window.setTimeout(function () { onMyTimeUp() }, left + 60)
      return function () { clearTimeout(t) }
    }
    onMyTimeUp()
  }, [gPhase, shownIdx, myQIdx, raceDone, myFeedback, gNow])

  /* الانتقال للسؤال اللي بعده بعد الفيدباك (~1 ثانية راحة) */
  function scheduleAdvance(delayMs: number): void {
    killAdvanceTimer()
    advanceTimerRef.current = window.setTimeout(function () {
      advanceTimerRef.current = null
      if (raceDoneRef.current) return
      feedbackQIdxRef.current = -999
      setMyFeedback(null)
      setPendingChoice(-1)
      shownIdxRef.current = myQIdxRef.current
      setShownIdx(myQIdxRef.current)
    }, delayMs)
  }

  /* الخلوص: بعد فيدباك آخر سؤال → شاشة «خلصت» */
  function scheduleFinish(delayMs: number): void {
    killAdvanceTimer()
    advanceTimerRef.current = window.setTimeout(function () {
      advanceTimerRef.current = null
      feedbackQIdxRef.current = -999
      setMyFeedback(null)
      setPendingChoice(-1)
      raceDoneRef.current = true
      setRaceDone(true)
      setLocalFinishAt(Date.now())
      shownIdxRef.current = myQIdxRef.current
      setShownIdx(myQIdxRef.current)
    }, delayMs)
  }

  /* الوقت اللي خدته لحد لحظة الإجابة (للسرعة) */
  function myQElapsedMs(): number {
    var base = qRemainBaseRef.current
    if (!base) return 0
    var remain = Math.max(0, base.remainMs - (Date.now() - base.at))
    return Math.max(0, base.limitMs - remain)
  }

  /* ===== الأفعال ===== */
  async function createRoom(): Promise<void> {
    var name = playerName.trim()
    if (!name) { toast.error('اكتب اسمك الأول يا بطل'); return }
    var custom = customCode.trim().toUpperCase().replace(/[^A-Z0-9]/g, '')
    if (custom && custom.length < 4) { toast.error('الكود المخصص لازم 4 حروف على الأقل'); return }
    setBusy('create')
    try {
      /* (و72) خيارات السباق بتتبعت مع الطلب — (و88) + التوقيت للأسئلة العامة */
      var out = await postJson('/api/arena/rooms', {
        name: name,
        customCode: custom || undefined,
        studentId: studentId || '',
        mode: optMode,
        difficulty: optDiff,
        rounds: optRounds,
        cardSeconds: optCardSec,
        timed: optMode === 'general' ? (optTimed ? 1 : 0) : 1,
        qSeconds: optQSec,
      })
      var data = out.data
      if (out.status === 404 || !out.data) { toast.error('مشكلة في إنشاء الغرفة — جرب تاني'); return }
      if (!data.ok) { toast.error(String(data.error || 'مشكلة في إنشاء الغرفة')); return }
      applyJoined(String(data.room.code), { id: data.me.id, name: data.me.name, token: data.me.token, isHost: true, score: 0, streak: 0 }, {
        code: String(data.room.code),
        status: 'lobby',
        currentIndex: 0,
        totalRounds: Number(data.room.totalRounds || 0),
        currentQuestion: null,
        revealed: null,
        players: [],
        finalQuestions: null,
        finalAnswers: null,
        mode: String(data.room.mode || optMode),
        difficulty: String(data.room.difficulty || optDiff),
        cardSeconds: Number(data.room.cardSeconds || optCardSec),
        timed: Number(data.room.timed != null ? data.room.timed : 1),
        qSeconds: Number(data.room.qSeconds || optQSec),
        startedAt: 0,
        questions: [],
        leaderboard: [],
      })
      setCustomCode('')
      toast.success('اتعملت الغرفة! شارك الكود مع صحابك 🎉')
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  async function joinRoom(): Promise<void> {
    var code = joinCode.trim().toUpperCase()
    var name = playerName.trim()
    if (code.length < 4) { toast.error('اكتب الكود كامل (4 حروف على الأقل)'); return }
    if (!name) { toast.error('اكتب اسمك الأول'); return }
    setBusy('join')
    try {
      /* (و72) studentId بيتبعت — نفس الحساب بيرجع لنفس اللاعب (ريأتاتش) */
      var out = await postJson('/api/arena/rooms/' + encodeURIComponent(code), { action: 'join', name: name, studentId: studentId || '' })
      var data = out.data
      if (out.status === 404) { toast.error('الغرفة مش موجودة — راجع الكود'); return }
      if (!data || !data.ok) { toast.error(String((data && data.error) || 'مشكلة في الدخول')); return }
      applyJoined(String(data.room.code), { id: data.me.id, name: data.me.name, token: data.me.token, isHost: !!data.me.isHost, score: Number(data.me.score || 0), streak: Number(data.me.streak || 0) }, {
        code: String(data.room.code),
        status: (data.room.status === 'live' ? 'live' : data.room.status === 'ended' ? 'ended' : 'lobby'),
        currentIndex: 0,
        totalRounds: Number(data.room.totalRounds || 0),
        currentQuestion: null,
        revealed: null,
        players: [],
        finalQuestions: null,
        finalAnswers: null,
        mode: String(data.room.mode || 'general'),
        difficulty: String(data.room.difficulty || 'mixed'),
        cardSeconds: Number(data.room.cardSeconds || 15),
        timed: Number(data.room.timed != null ? data.room.timed : 1),
        qSeconds: Number(data.room.qSeconds || 25),
        startedAt: 0,
        questions: [],
        leaderboard: [],
      })
      setJoinCode('')
      toast.success('دخلت الغرفة ' + String(data.room.code) + ' 🔥')
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  async function hostAction(action: 'start' | 'end'): Promise<void> {
    var me = gMeRef.current
    var room = gRoomRef.current
    if (!me || !room) return
    if (action === 'end' && !window.confirm('متأكد إنك عايز تنهي التحدي؟')) return
    setBusy(action)
    try {
      var out = await postJson('/api/arena/rooms/' + encodeURIComponent(room.code), { action: action, playerId: me.id, token: me.token })
      var data = out.data
      if (out.status === 404) { resetGroups(); toast.error('الغرفة اتقفلت'); return }
      if (!data || !data.ok) { toast.error(String((data && data.error) || 'مشكلة في تنفيذ الطلب')); return }
      if (action === 'start') toast.success('يلا يا شباب — السباق بدأ! 🚀')
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  async function answerQuestion(i: number): Promise<void> {
    var me = gMeRef.current
    var room = gRoomRef.current
    var qIdx = myQIdxRef.current
    var qs = roomQRef.current
    var q = qs[qIdx]
    if (!me || !room || room.status !== 'live' || raceDoneRef.current || !q) return
    if (sendingRef.current || myFeedback || shownIdxRef.current !== qIdx) return
    var ms = myQElapsedMs()
    setSendingAnswer(true)
    setPendingChoice(i)
    try {
      var out = await postJson('/api/arena/rooms/' + encodeURIComponent(room.code), {
        action: 'answer', playerId: me.id, token: me.token, questionIndex: qIdx, choice: i, ms: ms,
      })
      var data = out.data
      if (out.status === 404) { resetGroups(); toast.error('الغرفة اتقفلت'); return }
      if (out.status === 403) {
        var msg403 = String((data && data.error) || 'جلسة غير صالحة')
        resetGroups()
        toast.error(msg403)
        return
      }
      if (out.status === 409) {
        /* الوقت خلص على السؤال ده — فيدباك ⌛ والتقدّم هيجي من السيرفر */
        var msg = String((data && data.error) || 'الوقت خلص')
        toast.error(msg + ' ⌛')
        feedbackQIdxRef.current = qIdx
        setMyFeedback({ correct: false, gained: 0, streak: 0, choice: i, timeout: true, questionIndex: qIdx })
        scheduleAdvance(1100)
        return
      }
      if (!data || !data.ok) { toast.error(String((data && data.error) || 'حصلت مشكلة في إجابتك')); return }
      /* (و72) فيدباك لحظي ~1 ثانية → السؤال اللي بعده فورًا (من غير انتظار حد) */
      feedbackQIdxRef.current = qIdx
      setMyFeedback({ correct: !!data.correct, gained: Number(data.gained || 0), streak: Number(data.streak || 0), choice: i, correctIndex: Number(data.correctIndex), questionIndex: qIdx })
      var nextIdx = Number(data.nextIndex != null ? data.nextIndex : qIdx + 1)
      myQIdxRef.current = nextIdx
      setMyQIdx(nextIdx)
      var nq = qs[nextIdx]
      var nl = nq ? Math.max(5, Number(nq.timeLimitSec || 25)) * 1000 : 30000
      qRemainBaseRef.current = { remainMs: nl, at: Date.now(), limitMs: nl }
      if (data.finished) scheduleFinish(950)
      else scheduleAdvance(950)
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setSendingAnswer(false)
      setPendingChoice(-1)
    }
  }

  /* (و72) الخروج — مسموح في أي مرحلة (لوبي أو لايف) + ممنوع الرجوع بعده */
  async function exitRoom(ask: boolean): Promise<void> {
    if (ask && !window.confirm('متأكد إنك عايز تخرج من التحدي؟ مش هتقدر ترجع تاني!')) return
    var me = gMeRef.current
    var code = gRoomCodeRef.current
    if (me && code) {
      setBusy('leave')
      try {
        await postJson('/api/arena/rooms/' + encodeURIComponent(code), { action: 'leave', playerId: me.id, token: me.token })
      } catch (e) { /* خروج محلي برضه */ }
      setBusy('')
    }
    resetGroups()
    toast('خرجت من التحدي')
  }

  async function copyCode(): Promise<void> {
    if (!gRoom) return
    var code = gRoom.code
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(code)
        toast.success('اتنسخ الكود ✅')
        return
      }
      throw new Error('no clipboard')
    } catch (e) {
      try {
        var ta = document.createElement('textarea')
        ta.value = code
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        toast.success('اتنسخ الكود ✅')
      } catch (e2) {
        toast.error('انسخ الكود يدوي: ' + code)
      }
    }
  }

  /* ===== مشتقات العرض ===== */
  var players = gRoom ? gRoom.players : []
  var activeCount = players.filter(function (p) { return p.status !== 'left' }).length
  var isHost = !!(gMe && gMe.isHost)
  var totalQ = gRoom ? (gRoom.totalRounds || (gRoom.questions ? gRoom.questions.length : 0)) : 0
  var myQ = (gRoom && gRoom.questions && shownIdx >= 0 && shownIdx < gRoom.questions.length) ? gRoom.questions[shownIdx] : null
  var boardRows = gRoom && gRoom.leaderboard ? gRoom.leaderboard : []

  /* عدّاد سؤالي الحالي */
  var remainMs = 0
  var remainLimitMs = 1
  var feedbackOnShown = !!(myFeedback && Number(myFeedback.questionIndex || -1) === shownIdx)
  if (gPhase === 'live' && !raceDone && myQ && shownIdx === myQIdx && qRemainBaseRef.current) {
    remainLimitMs = Math.max(1, qRemainBaseRef.current.limitMs)
    remainMs = Math.max(0, qRemainBaseRef.current.remainMs - (gNow - qRemainBaseRef.current.at))
  } else if (myQ) {
    remainLimitMs = Math.max(1, Number(myQ.timeLimitSec || 25) * 1000)
    remainMs = feedbackOnShown ? 0 : remainLimitMs
  }
  var remainSec = Math.ceil(remainMs / 1000)
  var remainPct = Math.max(0, Math.min(100, (remainMs / remainLimitMs) * 100))

  /* ساعة التوقيت — من بداية السباق */
  var swMs = gRoom && Number(gRoom.startedAt || 0) > 0 ? Math.max(0, gNow - Number(gRoom.startedAt || 0)) : 0

  var optionsLocked = sendingAnswer || !!myFeedback || raceDone || shownIdx !== myQIdx

  /* ===== الشاشات ===== */
  var phase = gRoom ? gRoom.status : 'idle'

  /* ---------- idle: كرتين (إنشاء / دخول) + خيارات السباق ---------- */
  if (phase === 'idle') {
    return (
      <div className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* اعمل غرفة جديدة */}
          <Card className="overflow-hidden border-emerald-200 dark:border-emerald-900/70">
            <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-4 text-white flex items-center gap-2">
              <Plus className="size-5" />
              <h3 className="font-black text-lg">اعمل غرفة جديدة</h3>
            </div>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                اعمل غرفة وابعته الكود لصحابك — سباق فردي: كل واحد على موبايله واللي يخلص الأول يكسب! 🏁
              </p>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block">اسمك في اللعبة</label>
                <Input
                  value={playerName}
                  onChange={function (e) { setPlayerName(e.target.value) }}
                  placeholder="اسمك"
                  maxLength={40}
                  className="h-12 text-base"
                />
              </div>
              {/* (2026-و68) كود مخصص — اختياري */}
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block">
                  كود مخصص (اختياري) — اكتب الكود اللي يعجبك
                </label>
                <Input
                  value={customCode}
                  onChange={function (e) { setCustomCode(e.target.value.toUpperCase().replace(/[^A-Za-z0-9]/g, '').slice(0, 8)) }}
                  placeholder="مثلاً: MATH7"
                  dir="ltr"
                  maxLength={8}
                  className="h-11 text-center font-mono font-bold tracking-widest"
                />
                <p className="mt-1 text-[11px] text-muted-foreground">من 4 لـ 8 حروف/أرقام — لو مستخدم هيجيلك رسالة تختار غيره</p>
              </div>

              {/* (2026-و72) خيارات السباق */}
              <div className="rounded-2xl border-2 border-dashed border-emerald-200 dark:border-emerald-900/70 p-3 space-y-3">
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-1.5">نوع الأسئلة</p>
                  <div className="grid grid-cols-2 gap-2">
                    <OptionChip active={optMode === 'general'} onClick={function () { setOptMode('general') }}>📝 أسئلة عامة</OptionChip>
                    <OptionChip active={optMode === 'flash'} onClick={function () { setOptMode('flash') }}>⚡ فلاش كاردز</OptionChip>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-1.5">الصعوبة</p>
                  <div className="grid grid-cols-3 gap-2">
                    <OptionChip active={optDiff === 'easy'} onClick={function () { setOptDiff('easy') }}>سهل</OptionChip>
                    <OptionChip active={optDiff === 'medium'} onClick={function () { setOptDiff('medium') }}>متوسط</OptionChip>
                    <OptionChip active={optDiff === 'hard'} onClick={function () { setOptDiff('hard') }}>صعب</OptionChip>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-bold text-muted-foreground mb-1.5">عدد الأسئلة</p>
                  <div className="grid grid-cols-4 gap-2">
                    {[5, 8, 10, 15].map(function (n) {
                      return (
                        <OptionChip key={n} active={optRounds === n} onClick={function () { setOptRounds(n) }}>
                          <span dir="ltr">{n}</span>
                        </OptionChip>
                      )
                    })}
                  </div>
                </div>
                {optMode === 'general' ? (
                  /* (2026-و88) طلب المستر: السؤال يبقى بوقت ولا من غير وقت + يختار الوقت قد ايه */
                  <>
                    <div>
                      <p className="text-xs font-bold text-muted-foreground mb-1.5">⏱ التوقيت</p>
                      <div className="grid grid-cols-2 gap-2">
                        <OptionChip active={optTimed} onClick={function () { setOptTimed(true) }}>⏱ بوقت</OptionChip>
                        <OptionChip active={!optTimed} onClick={function () { setOptTimed(false) }}>♾️ من غير وقت</OptionChip>
                      </div>
                    </div>
                    {optTimed ? (
                      <div>
                        <p className="text-xs font-bold text-muted-foreground mb-1.5">⏱ وقت السؤال الواحد</p>
                        <div className="grid grid-cols-4 gap-2">
                          {[10, 15, 20, 25, 30, 45, 60, 90].map(function (s) {
                            return (
                              <OptionChip key={s} active={optQSec === s} onClick={function () { setOptQSec(s) }}>
                                <span dir="ltr">{s}</span> ث
                              </OptionChip>
                            )
                          })}
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : null}
                {optMode === 'flash' ? (
                  <div>
                    <p className="text-xs font-bold text-muted-foreground mb-1.5">⚡ وقت البطاقة الواحدة</p>
                    <div className="grid grid-cols-5 gap-2">
                      {[8, 10, 15, 20, 30].map(function (s) {
                        return (
                          <OptionChip key={s} active={optCardSec === s} onClick={function () { setOptCardSec(s) }}>
                            <span dir="ltr">{s}</span> ث
                          </OptionChip>
                        )
                      })}
                    </div>
                  </div>
                ) : null}
              </div>

              <Button
                onClick={function () { createRoom() }}
                disabled={busy === 'create'}
                className="w-full min-h-12 bg-gradient-to-l from-emerald-500 to-teal-600 text-white font-black text-base shadow-lg shadow-emerald-500/20"
              >
                {busy === 'create' ? <Loader2 className="size-5 animate-spin" /> : <Swords className="size-5" />}
                اعمل الغرفة
              </Button>
            </CardContent>
          </Card>

          {/* ادخل بكود */}
          <Card className="overflow-hidden border-teal-200 dark:border-teal-900/70">
            <div className="bg-gradient-to-l from-teal-500 to-emerald-600 px-5 py-4 text-white flex items-center gap-2">
              <UserPlus className="size-5" />
              <h3 className="font-black text-lg">ادخل بكود</h3>
            </div>
            <CardContent className="p-5 space-y-4">
              <p className="text-sm text-muted-foreground leading-relaxed">
                صحابك عملوا غرفة؟ اكتب الكود اللي بعتهولك ودوس ادخل 🚪
              </p>
              <div>
                <label className="text-xs font-bold text-muted-foreground mb-1.5 block">كود الغرفة</label>
                <Input
                  value={joinCode}
                  onChange={function (e) { setJoinCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)) }}
                  onKeyDown={function (e) { if (e.key === 'Enter') joinRoom() }}
                  placeholder="ABC123"
                  dir="ltr"
                  inputMode="text"
                  autoCapitalize="characters"
                  className="h-14 text-center text-2xl font-mono font-black tracking-[0.4em]"
                />
              </div>
              <Button
                onClick={function () { joinRoom() }}
                disabled={busy === 'join' || joinCode.trim().length < 4}
                className="w-full min-h-12 bg-gradient-to-l from-teal-500 to-emerald-600 text-white font-black text-base shadow-lg shadow-teal-500/20"
              >
                {busy === 'join' ? <Loader2 className="size-5 animate-spin" /> : <LogIn className="size-5" />}
                ادخل الغرفة
              </Button>
            </CardContent>
          </Card>
        </div>
        <p className="text-center text-xs text-muted-foreground font-bold">من 2 لـ 6 لاعبين — سباق فردي: الدقة + السرعة + اللي يخلص الأول 🏁</p>
      </div>
    )
  }

  /* ---------- lobby: استنى صحابك ---------- */
  if (phase === 'lobby') {
    return (
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-4 text-white text-center">
          <h3 className="font-black text-lg">{gRoom?.title || 'غرفة التحدي'}</h3>
          <p className="text-sm text-emerald-50/90 font-bold">
            {gRoom?.mode === 'flash' ? '⚡ فلاش كاردز' : '📝 أسئلة عامة'}
            {' • '}
            {gRoom?.difficulty === 'easy' ? 'سهل' : gRoom?.difficulty === 'hard' ? 'صعب' : 'متوسط'}
            {' • '}
            <span dir="ltr">{gRoom?.totalRounds || 0}</span> أسئلة
            {gRoom?.mode === 'flash' ? (
              <> • <span dir="ltr">{gRoom?.cardSeconds || 15}</span> ث للبطاقة</>
            ) : (
              /* (و88) عرض وضع التوقيت للأسئلة العامة */
              gRoom?.timed === 0 ? (
                <> • ♾️ من غير وقت</>
              ) : (
                <> • <span dir="ltr">{gRoom?.qSeconds || 25}</span> ث للسؤال</>
              )
            )}
          </p>
          <p className="text-sm text-emerald-50/90 font-bold">شارك الكود مع صحابك 👇</p>
        </div>
        <CardContent className="p-5 space-y-4">
          {/* الكود الضخم */}
          <div className="flex items-center justify-center gap-3" dir="ltr">
            <span className="text-4xl sm:text-5xl font-mono font-black tracking-widest select-all text-emerald-700 dark:text-emerald-300">
              {gRoom?.code}
            </span>
            <Button variant="outline" size="sm" onClick={function () { copyCode() }} className="min-h-10 font-bold shrink-0">
              <Copy className="size-4" /> نسخ
            </Button>
          </div>

          {/* اللاعبين */}
          <div className={'rounded-2xl border p-2 space-y-1.5 ' + SCROLL_CLS}>
            {players.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">استنى اللاعبين يدخلوا… ⏳</p>
            ) : (
              players.map(function (p) {
                return (
                  <div key={p.id} className={'flex items-center gap-2 rounded-xl px-3 py-2 ' + (p.status === 'left' ? 'bg-stone-100 dark:bg-stone-900/30 opacity-60' : 'bg-stone-50 dark:bg-stone-900/50')}>
                    <span className={'size-2.5 rounded-full shrink-0 ' + (p.status === 'left' ? 'bg-stone-300 dark:bg-stone-700' : p.online ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-stone-300 dark:bg-stone-700')} />
                    <span className={'flex-1 font-bold text-sm truncate ' + (p.status === 'left' ? 'line-through' : '')}>
                      {p.name}
                      {gMe && p.id === gMe.id ? <span className="text-xs text-muted-foreground font-normal"> (انت)</span> : null}
                    </span>
                    {p.status === 'left' ? (
                      <Badge variant="outline" className="text-[11px] font-black text-stone-500 border-stone-300 dark:border-stone-700 gap-1">
                        <LogOut className="size-3" /> خرج
                      </Badge>
                    ) : null}
                    {p.streak >= 2 ? <span className="text-orange-500 text-xs font-black">🔥 ×{p.streak}</span> : null}
                    {p.isHost ? (
                      <Badge className="bg-amber-100 text-amber-700 border border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 gap-1">
                        <Crown className="size-3" /> الهوست
                      </Badge>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>

          {/* الهوست يبدأ — أو استنى */}
          {isHost ? (
            <div className="space-y-2">
              <Button
                onClick={function () { hostAction('start') }}
                disabled={activeCount < 1 || busy === 'start'}
                className="w-full min-h-14 bg-gradient-to-l from-emerald-500 to-teal-600 text-white font-black text-lg shadow-lg shadow-emerald-500/25"
              >
                {busy === 'start' ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
                ابدأ السباق 🚀
              </Button>
              {activeCount < 2 ? (
                <p className="text-xs text-amber-600 dark:text-amber-400 text-center font-bold">
                  تقدر تجري لوحدك ضد الوقت ⏱ — أو استنى صحابك والأحلى 3-4! ⏳
                </p>
              ) : null}
            </div>
          ) : (
            <motion.div
              animate={{ opacity: [0.6, 1, 0.6] }}
              transition={{ repeat: Infinity, duration: 1.8 }}
              className="rounded-xl bg-stone-100 dark:bg-stone-900 py-4 text-center font-black text-muted-foreground"
            >
              استنى الهوست يبدأ… ⏳
            </motion.div>
          )}

          {/* (و72) زرار الخروج — واضح لكل اللاعبين */}
          <Button
            variant="outline"
            onClick={function () { exitRoom(true) }}
            disabled={busy === 'leave'}
            className="w-full min-h-12 border-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40 font-black"
          >
            {busy === 'leave' ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
            خروج من التحدي
          </Button>
        </CardContent>
      </Card>
    )
  }

  /* ---------- live: خلصت أسئلتي — زمني + «مين خلّص الأول» ---------- */
  if (phase === 'live' && gRoom && raceDone) {
    var startMsDone = Number(gRoom.startedAt || 0)
    var myFinishMs = Number((gMe && gMe.finishedAt) || localFinishAt || 0)
    var myTimeTxt = myFinishMs > 0 && startMsDone > 0 ? fmtCountdown(Math.max(0, myFinishMs - startMsDone)) : '—'
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <Card className="overflow-hidden self-start">
          <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-4 text-white text-center">
            <h3 className="font-black text-lg">خلصت كل أسئلتك! 🏁</h3>
            <p className="text-sm text-emerald-50/90 font-bold">
              زمنك: <span className="font-black" dir="ltr">⏱ {myTimeTxt}</span> — نقاطك: <span className="font-black" dir="ltr">{gMe ? gMe.score : 0}</span>
            </p>
          </div>
          <CardContent className="p-5 space-y-4">
            <div className="rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 px-4 py-3 text-center font-black text-amber-700 dark:text-amber-300">
              استنى الباقيين يخلصوا — الترتيب بيتحدث لايف 👇
            </div>

            {/* مين خلّص الأول */}
            <div>
              <h4 className="font-black flex items-center gap-1.5 mb-2">
                <Trophy className="size-4 text-amber-500" /> مين خلّص الأول
              </h4>
              <div className={'space-y-1.5 ' + SCROLL_CLS}>
                {boardRows.map(function (r) {
                  var rt = r.finished && startMsDone > 0 && r.finishedAt ? fmtCountdown(Math.max(0, Number(r.finishedAt) - startMsDone)) : ''
                  return (
                    <div
                      key={r.id || String(r.rank)}
                      className={'flex items-center gap-2 rounded-xl px-3 py-2 border ' +
                        (r.isMe
                          ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                          : 'bg-stone-50 dark:bg-stone-900/50 border-transparent')}
                    >
                      <span className="w-7 text-center text-base shrink-0">{rankMedal(r.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{r.rank}</span>}</span>
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm truncate flex items-center gap-1">
                          {r.name}
                          {r.isHost ? <Crown className="size-3.5 text-amber-500 shrink-0" /> : null}
                          {r.isMe ? <span className="text-[10px] text-muted-foreground font-normal">(انت)</span> : null}
                        </p>
                        <p className="text-[11px] font-bold">
                          {r.finished ? (
                            <span className="text-emerald-600" dir="ltr">⏱ {rt}</span>
                          ) : (
                            <span className="text-stone-400">بيحل… سؤال <span dir="ltr">{Math.min(r.qIndex + 1, totalQ)}/{totalQ}</span></span>
                          )}
                        </p>
                      </div>
                      <span className="font-black text-emerald-600" dir="ltr">{r.score}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            {isHost ? (
              <Button
                variant="outline"
                onClick={function () { hostAction('end') }}
                disabled={busy === 'end'}
                className="w-full min-h-11 font-black text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-950/40"
              >
                إنهاء التحدي للكل (هوست)
              </Button>
            ) : null}

            {/* (و72) زرار الخروج — تحت وخاص بكل لاعب */}
            <Button
              variant="outline"
              onClick={function () { exitRoom(true) }}
              disabled={busy === 'leave'}
              className="w-full min-h-12 border-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40 font-black"
            >
              {busy === 'leave' ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
              خروج من التحدي
            </Button>
          </CardContent>
        </Card>

        {/* شريط اللاعبين — موبايل */}
        <div className="lg:hidden -mx-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700">
          <div className="flex gap-2 px-1 w-max">
            {boardRows.map(function (r, i) {
              return (
                <div key={r.id || i} className="flex items-center gap-1.5 rounded-full border bg-white dark:bg-stone-900 px-3 py-1.5 shadow-sm shrink-0">
                  <span className="text-sm">{rankMedal(r.rank) || (r.rank)}</span>
                  <span className="font-bold text-xs max-w-[90px] truncate">{r.name}</span>
                  {r.finished ? <span className="text-xs">🏁</span> : <span className="text-[10px] text-stone-400 font-bold" dir="ltr">{r.qIndex + 1}/{totalQ}</span>}
                  <span className="font-black text-xs text-emerald-600" dir="ltr">{r.score}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    )
  }

  /* ---------- live: سباقي — سؤالي الحالي ومؤقتي ---------- */
  if (phase === 'live' && gRoom && myQ) {
    var shownQ: ArenaQ = myQ
    /* (و88) الفلاش كارد في السباق بياخد شكل الصورة + الأسئلة العامة بتعرض وضع التوقيت */
    var isFlashRace = gRoom.mode === 'flash'
    var roomUntimed = gRoom.timed === 0
    var dotCount = Math.max(1, Math.min(totalQ || 1, 20))
    return (
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {isFlashRace ? (
          /* ===== (و88) فلاش كاردز — شكل الصورة: نقاط تقدم + «نقطة» + بار بنفسجي بعداد + كارت أبيض سؤال في النص واختيارات 2×2 ===== */
          <Card className="overflow-hidden self-start">
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {Array.from({ length: dotCount }).map(function (_, di) {
                    var ans = gMe && gMe.answers ? (gMe.answers as any)[String(di)] : null
                    var cls = 'rounded-full transition-all '
                    if (di === shownIdx) cls += 'size-3 bg-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
                    else if (ans && Number(ans.correct) === 1) cls += 'size-2.5 bg-emerald-500'
                    else if (ans) cls += 'size-2.5 bg-red-400'
                    else cls += 'size-2.5 bg-stone-300 dark:bg-stone-700'
                    return <span key={di} className={cls} />
                  })}
                </div>
                <div className="flex items-center gap-2 text-sm font-black">
                  {gMe && gMe.streak >= 2 ? <span className="text-orange-500 flex items-center gap-1"><Flame className="size-4" /> ×{gMe.streak}</span> : null}
                  <Badge variant="outline" className="font-black" dir="ltr">{gMe ? gMe.score : 0} نقطة</Badge>
                </div>
              </div>
              {/* البار البنفسجي + عدد الثواني — زي الصورة */}
              <div className="flex items-center gap-3">
                <div className="flex-1 h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-l from-fuchsia-500 to-violet-500 transition-[width] duration-100 ease-linear"
                    style={{ width: remainPct + '%' }}
                  />
                </div>
                <span dir="ltr" className={'font-black text-2xl w-10 text-center shrink-0 ' + (remainSec <= 3 ? 'text-red-600' : 'text-violet-600')}>{remainSec}</span>
              </div>
              {/* الكارت الأبيض: السؤال في النص + اختيارات 2×2 بحواف دائرية */}
              <div className="rounded-3xl border-2 border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm p-5 sm:p-7 space-y-5">
                <p dir="auto" className="text-lg sm:text-xl font-bold leading-relaxed text-center">
                  <FractionText text={shownQ.text} />
                </p>
                {myFeedback ? (
                  <motion.div
                    initial={{ scale: 0.92, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className={'rounded-xl px-4 py-2.5 font-black text-sm text-center ' +
                      (myFeedback.timeout
                        ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                        : myFeedback.correct
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                          : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300')}
                  >
                    {myFeedback.timeout ? (
                      <>⌛ الوقت خلص! الإجابة الصح: {myFeedback.correctIndex != null && myFeedback.correctIndex >= 0 ? <span dir="ltr" className="inline-block"><FractionText text={shownQ.options[myFeedback.correctIndex] || ''} /></span> : '—'}</>
                    ) : myFeedback.correct ? (
                      <>صح! <span dir="ltr">+{myFeedback.gained}</span>{myFeedback.streak >= 3 ? ' 🔥' : ''}</>
                    ) : (
                      <>غلط — الإجابة الصح: {myFeedback.correctIndex != null && myFeedback.correctIndex >= 0 ? <span dir="ltr" className="inline-block"><FractionText text={shownQ.options[myFeedback.correctIndex] || ''} /></span> : '—'}</>
                    )}
                  </motion.div>
                ) : null}
                <div className="grid grid-cols-2 gap-3">
                  {shownQ.options.map(function (opt, i) {
                    var cls = 'min-h-[52px] justify-center text-base font-bold border-2 rounded-xl'
                    if (myFeedback && !myFeedback.timeout && i === myFeedback.choice) {
                      cls += myFeedback.correct ? ' border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : ' border-red-400 bg-red-50 dark:bg-red-950/40'
                    }
                    if (myFeedback && !myFeedback.timeout && myFeedback.correctIndex != null && i === myFeedback.correctIndex) {
                      cls += ' border-emerald-500 bg-emerald-100 dark:bg-emerald-950/50'
                    }
                    if (myFeedback && !myFeedback.timeout && i !== myFeedback.choice && i !== myFeedback.correctIndex) {
                      cls += ' opacity-50'
                    }
                    return (
                      <Button
                        key={i}
                        variant="outline"
                        disabled={optionsLocked}
                        onClick={function () { answerQuestion(i) }}
                        className={cls}
                      >
                        <span dir="auto" className="leading-snug break-words"><FractionText text={opt} /></span>
                        {sendingAnswer && pendingChoice === i ? <Loader2 className="size-4 animate-spin shrink-0" /> : null}
                      </Button>
                    )
                  })}
                </div>
              </div>
              {/* زرار الخروج */}
              <div className="pt-1 space-y-2">
                {isHost ? (
                  <Button
                    variant="ghost"
                    onClick={function () { hostAction('end') }}
                    disabled={busy === 'end'}
                    className="w-full min-h-10 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold"
                  >
                    إنهاء التحدي للكل (هوست)
                  </Button>
                ) : null}
                <Button
                  variant="outline"
                  onClick={function () { exitRoom(true) }}
                  disabled={busy === 'leave'}
                  className="w-full min-h-12 border-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40 font-black"
                >
                  {busy === 'leave' ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                  خروج من التحدي
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
        /* ===== الأسئلة العامة — كرت السباق (و88: دعم «من غير وقت») ===== */
        <Card className="overflow-hidden self-start">
          <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-3 text-white space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="font-black text-sm">سؤال <span dir="ltr">{Math.min(myQIdx + 1, totalQ || 1)}</span> من <span dir="ltr">{totalQ || 1}</span></span>
              {/* (و72) ساعة التوقيت — من بداية السباق */}
              <span className="flex items-center gap-1.5 font-black text-lg" dir="ltr">
                <Timer className="size-5" />
                {fmtCountdown(swMs)}
              </span>
              <span className="font-black text-sm">🎯 <span dir="ltr">{gMe ? gMe.score : 0}</span></span>
            </div>
            {/* بار الوقت — (و88) مخفي في وضع «من غير وقت» */}
            {roomUntimed ? (
              <p className="text-[11px] font-black text-emerald-50/90">♾️ السؤال ده من غير وقت — خد وقتك براحتك</p>
            ) : (
              <div className="h-1.5 rounded-full bg-white/25 overflow-hidden">
                <div
                  className="h-full rounded-full bg-white transition-[width] duration-150 ease-linear"
                  style={{ width: remainPct + '%' }}
                />
              </div>
            )}
          </div>
          <CardContent className="p-5 space-y-4">
            {/* (و71) السؤال والاختيارات بـ FractionText زي امتحانات المنصة */}
            <h3 dir="ltr" className="text-left text-xl font-bold leading-relaxed">
              <FractionText text={shownQ.text} />
            </h3>

            {/* (و72) فيدباك لحظي — وبعده السؤال اللي بعده فورًا */}
            {myFeedback ? (
              <motion.div
                initial={{ scale: 0.92, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className={'rounded-xl px-4 py-3 font-black text-sm space-y-1 ' +
                  (myFeedback.timeout
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : myFeedback.correct
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200'
                      : 'bg-red-100 text-red-700 dark:bg-red-950/60 dark:text-red-300')}
              >
                <p className="flex items-center gap-2">
                  {myFeedback.timeout ? (
                    <><Timer className="size-4 shrink-0" /> الوقت خلص على السؤال ده ⌛</>
                  ) : myFeedback.correct ? (
                    <><Check className="size-4 shrink-0" /> صح! <span dir="ltr">+{myFeedback.gained}</span> نقطة{myFeedback.streak >= 2 ? ' — ستريك ×' + myFeedback.streak + '! 🔥' : ''}</>
                  ) : (
                    <><X className="size-4 shrink-0" /> غلط — الإجابة الصح: {myFeedback.correctIndex != null && myFeedback.correctIndex >= 0 ? <span dir="ltr" className="inline-block"><FractionText text={shownQ.options[myFeedback.correctIndex] || ''} /></span> : '—'}</>
                  )}
                </p>
                <p className="text-[11px] font-bold opacity-80">جاري نقلك للسؤال اللي بعده…</p>
              </motion.div>
            ) : null}

            {/* الاختيارات — (و72) مفيش انتظار حد: دوس وتقدّم */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {shownQ.options.map(function (opt, i) {
                var cls = 'min-h-14 justify-start gap-2.5 text-base font-bold border-2'
                if (myFeedback && !myFeedback.timeout && i === myFeedback.choice) {
                  cls += myFeedback.correct ? ' border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40' : ' border-red-400 bg-red-50 dark:bg-red-950/40'
                }
                if (myFeedback && !myFeedback.timeout && myFeedback.correctIndex != null && i === myFeedback.correctIndex) {
                  cls += ' border-emerald-500 bg-emerald-100 dark:bg-emerald-950/50'
                }
                return (
                  <Button
                    key={i}
                    variant="outline"
                    disabled={optionsLocked}
                    onClick={function () { answerQuestion(i) }}
                    className={cls}
                  >
                    <span className="grid place-items-center size-7 rounded-lg bg-stone-100 dark:bg-stone-800 font-mono text-sm shrink-0" dir="ltr">
                      {LETTERS[i] || '•'}
                    </span>
                    <span dir="ltr" className="flex-1 text-left leading-snug break-words"><FractionText text={opt} /></span>
                    {sendingAnswer && pendingChoice === i ? <Loader2 className="size-4 animate-spin shrink-0" /> : null}
                  </Button>
                )
              })}
            </div>

            {/* (و72) زرار الخروج — تحت وخاص بكل لاعب في اللوبي واللايف */}
            <div className="pt-2 border-t space-y-2">
              {isHost ? (
                <Button
                  variant="ghost"
                  onClick={function () { hostAction('end') }}
                  disabled={busy === 'end'}
                  className="w-full min-h-10 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-950/40 text-xs font-bold"
                >
                  إنهاء التحدي للكل (هوست)
                </Button>
              ) : null}
              <Button
                variant="outline"
                onClick={function () { exitRoom(true) }}
                disabled={busy === 'leave'}
                className="w-full min-h-12 border-2 border-red-300 text-red-600 hover:bg-red-50 hover:text-red-700 dark:border-red-900 dark:hover:bg-red-950/40 font-black"
              >
                {busy === 'leave' ? <Loader2 className="size-4 animate-spin" /> : <LogOut className="size-4" />}
                خروج من التحدي
              </Button>
            </div>
          </CardContent>
        </Card>
        )}
        {/* (و88) نهاية اختيار كرت السؤال (فلاش / عام) */}

        {/* شريط اللاعبين الأفقي — موبايل بس */}
        <div className="lg:hidden -mx-1 overflow-x-auto pb-1 [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700">
          <div className="flex gap-2 px-1 w-max">
            {boardRows.map(function (r, i) {
              return (
                <div key={r.id || i} className="flex items-center gap-1.5 rounded-full border bg-white dark:bg-stone-900 px-3 py-1.5 shadow-sm shrink-0">
                  <span className="text-sm">{rankMedal(r.rank) || (r.rank)}</span>
                  <span className="font-bold text-xs max-w-[90px] truncate">{r.name}{r.isMe ? ' (انت)' : ''}</span>
                  {r.finished ? <span className="text-xs">🏁</span> : <span className="text-[10px] text-stone-400 font-bold" dir="ltr">{r.qIndex + 1}/{totalQ}</span>}
                  <span className="font-black text-xs text-emerald-600" dir="ltr">{r.score}</span>
                </div>
              )
            })}
          </div>
        </div>

        {/* الترتيب الحي — جانبي على الشاشات الكبيرة */}
        <Card className="hidden lg:block self-start sticky top-4">
          <CardContent className="p-4">
            <h4 className="font-black flex items-center gap-1.5 mb-1">
              <Trophy className="size-4 text-amber-500" /> مين خلّص الأول
            </h4>
            <p className="text-[11px] text-muted-foreground font-bold mb-3 flex items-center gap-1">
              <Timer className="size-3" /> السباق شغال — <span dir="ltr">{fmtCountdown(swMs)}</span>
            </p>
            <div className={'space-y-2 ' + SCROLL_CLS}>
              {boardRows.map(function (r) {
                return (
                  <motion.div
                    layout
                    key={r.id || String(r.rank)}
                    transition={{ type: 'spring', stiffness: 500, damping: 35 }}
                    className={'flex items-center gap-2 rounded-xl px-3 py-2 border ' +
                      (r.isMe
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-700 dark:bg-emerald-950/40'
                        : 'bg-stone-50 dark:bg-stone-900/50 border-transparent')}
                  >
                    <span className="w-7 text-center text-base shrink-0">{rankMedal(r.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{r.rank}</span>}</span>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm truncate flex items-center gap-1">
                        {r.name}
                        {r.isHost ? <Crown className="size-3.5 text-amber-500 shrink-0" /> : null}
                        {r.isMe ? <span className="text-[10px] text-muted-foreground font-normal">(انت)</span> : null}
                      </p>
                      <div className="flex items-center gap-2 text-[11px]">
                        {r.finished ? (
                          <span className="text-emerald-600 font-black">خلّص 🏁</span>
                        ) : (
                          <span className="text-stone-400 font-bold" dir="ltr">سؤال {Math.min(r.qIndex + 1, totalQ)}/{totalQ}</span>
                        )}
                        {!r.online && r.status !== 'left' ? <span className="text-stone-400">أوفلاين</span> : null}
                        {r.status === 'left' ? <span className="text-stone-400">خرج</span> : null}
                      </div>
                    </div>
                    <span className="font-black text-emerald-600" dir="ltr">{r.score}</span>
                  </motion.div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ---------- ended: البوديوم + المراجعة ---------- */
  if (phase === 'ended' && gRoom) {
    var finals = gRoom.finalQuestions || []
    var myAnswers = gRoom.finalAnswers && gMe ? gRoom.finalAnswers[gMe.id] : null
    var startMsEnd = Number(gRoom.startedAt || 0)
    var myBoardRow: ArenaBoardRow | null = null
    for (var bi = 0; bi < boardRows.length; bi++) {
      if (boardRows[bi].isMe) { myBoardRow = boardRows[bi]; break }
    }
    var myRank = myBoardRow ? myBoardRow.rank : 0
    var myEndTime = myBoardRow && myBoardRow.finished && startMsEnd > 0 && myBoardRow.finishedAt
      ? fmtCountdown(Math.max(0, Number(myBoardRow.finishedAt) - startMsEnd))
      : ''
    var first = boardRows[0]
    var second = boardRows[1]
    var third = boardRows[2]
    var podium = [
      second ? { p: second, rank: 2, h: 64, delay: 0.15 } : null,
      first ? { p: first, rank: 1, h: 96, delay: 0 } : null,
      third ? { p: third, rank: 3, h: 48, delay: 0.3 } : null,
    ].filter(Boolean) as { p: ArenaBoardRow; rank: number; h: number; delay: number }[]

    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-4 text-white text-center">
            <h3 className="font-black text-xl">خلص السباق! 🎉</h3>
            <p className="text-sm text-emerald-50/90 font-bold">{gRoom.title || 'غرفة ' + gRoom.code}</p>
          </div>
          <CardContent className="p-5 space-y-5">
            {/* البوديوم — التاني شمال والأول في النص والتالت يمين */}
            {podium.length > 0 ? (
              <div dir="ltr" className="flex items-end justify-center gap-3 sm:gap-6 pt-2">
                {podium.map(function (cell) {
                  return (
                    <motion.div
                      key={cell.p.id || String(cell.p.rank)}
                      initial={{ y: 70, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      transition={{ type: 'spring', stiffness: 220, damping: 16, delay: cell.delay }}
                      className="flex flex-col items-center gap-1.5 flex-1 max-w-[150px] min-w-0"
                    >
                      <span className="text-2xl">{rankMedal(cell.p.rank)}</span>
                      <p className="font-black text-sm truncate max-w-full" title={cell.p.name}>{cell.p.name}</p>
                      <div
                        className={'w-full rounded-t-xl bg-gradient-to-t from-emerald-600 to-teal-400 flex flex-col items-start justify-start pt-2 px-2 shadow-lg shadow-emerald-500/20'}
                        style={{ height: cell.h + 'px' }}
                      >
                        <span className="font-black text-white" dir="ltr">{cell.p.score}</span>
                        {cell.p.finished && startMsEnd > 0 && cell.p.finishedAt ? (
                          <span className="text-[10px] font-bold text-white/90" dir="ltr">⏱ {fmtCountdown(Math.max(0, Number(cell.p.finishedAt) - startMsEnd))}</span>
                        ) : null}
                      </div>
                    </motion.div>
                  )
                })}
              </div>
            ) : (
              <p className="text-center text-sm text-muted-foreground">مفيش لاعبين في النتيجة</p>
            )}

            {/* مكاني */}
            {gMe && myRank > 0 ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="rounded-xl border-2 border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/40 p-4 flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="font-black">مكانك: {rankMedal(myRank) || '#' + myRank} من {boardRows.length}</p>
                  <p className="text-sm text-muted-foreground font-bold truncate">
                    {gMe.name} — كسبت <span dir="ltr">{gMe.score}</span> نقطة
                    {gMe.streak >= 2 ? ' 🔥' : ''}
                  </p>
                  {myEndTime ? (
                    <p className="text-xs font-black text-emerald-600" dir="ltr">⏱ {myEndTime}</p>
                  ) : null}
                </div>
                <Trophy className="size-8 text-amber-500 shrink-0" />
              </motion.div>
            ) : null}

            {/* مراجعة كاملة */}
            {finals.length > 0 ? (
              <div className="space-y-2">
                <h4 className="font-black flex items-center gap-1.5">
                  <ListChecks className="size-4 text-emerald-600" /> مراجعة الأسئلة
                </h4>
                <div className={SCROLL_CLS + ' space-y-2.5 pe-1'}>
                  {finals.map(function (q, qi) {
                    var ans = myAnswers ? myAnswers[String(qi)] : null
                    var myChoiceText = ans && ans.choice >= 0 && ans.choice < q.options.length ? q.options[ans.choice] : '—'
                    return (
                      <div key={qi} className="rounded-xl border p-3 space-y-1.5">
                        <p dir="ltr" className="text-left font-bold text-sm leading-relaxed">{qi + 1}. <FractionText text={q.text} /></p>
                        {ans ? (
                          <p className={'text-sm font-black ' + (Number(ans.correct) ? 'text-emerald-600' : 'text-red-600')}>
                            {Number(ans.correct) ? '✅ إجابتك: ' : '❌ إجابتك: '}<span dir="ltr" className="inline-block"><FractionText text={myChoiceText} /></span>
                          </p>
                        ) : (
                          <p className="text-sm text-stone-400 font-bold">⌛ ما جاوبتش في السؤال ده</p>
                        )}
                        {!ans || !Number(ans.correct) ? (
                          <p className="text-sm text-emerald-600 font-bold">الإجابة الصح: <span dir="ltr" className="inline-block"><FractionText text={q.options[q.correctIndex]} /></span></p>
                        ) : null}
                        {q.explanation ? (
                          <p className="text-xs text-muted-foreground leading-relaxed">💡 <FractionText text={q.explanation} /></p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="grid grid-cols-2 gap-2">
              <Button
                onClick={function () { resetGroups() }}
                className="min-h-12 bg-gradient-to-l from-emerald-500 to-teal-600 text-white font-black"
              >
                <RotateCcw className="size-4" /> العب تاني 🔁
              </Button>
              <Button variant="outline" onClick={function () { exitRoom(false) }} className="min-h-12 font-black">
                <LogOut className="size-4" /> خروج
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  /* live بدون سؤال حالي (لحظة انتقال نادرة) — لودينج بسيط */
  return (
    <div className="py-10 flex items-center justify-center text-muted-foreground">
      <Loader2 className="size-6 animate-spin" />
    </div>
  )
}

/* ============================================================
 * (2026-و68) تحدي بنك الملفات — طلب المستر:
 * «الطالب أول ما يخش يعمل تحدي… يظهر له أسئلة ياخد أسئلة من
 *  الملفات دي كلها بشكل عشوائي» — 10 أسئلة عشوائية من كل ملفات
 *  المستر (بالإنجليزي) + مؤقت لكل سؤال + درجة (دقة + سرعة) + لوحة ترتيب.
 * ============================================================ */
var BANK_ROUND_COUNT = 10
var BANK_Q_LIMIT_MS = 60 * 1000

interface BankQ { id: string; question: string; options: string[]; points: number }
interface BankBoardRow { rank: number; name: string; score: number; correctCount: number; totalQuestions: number; timeMs: number; createdAt: string }

function BankChallenge({ studentId, studentName }: { studentId: string; studentName: string }) {
  var [bankCount, setBankCount] = useState<number | null>(null)
  var [phase, setPhase] = useState<'idle' | 'play' | 'done'>('idle')
  var [loadingRound, setLoadingRound] = useState(false)
  var [questions, setQuestions] = useState<BankQ[]>([])
  var [idx, setIdx] = useState(0)
  var [remainMs, setRemainMs] = useState(BANK_Q_LIMIT_MS)
  var [picked, setPicked] = useState(-1)
  var [submitting, setSubmitting] = useState(false)
  var [result, setResult] = useState<{ score: number; correctCount: number; total: number; timeMs: number } | null>(null)
  var [board, setBoard] = useState<BankBoardRow[]>([])
  var [myRankKey, setMyRankKey] = useState('')

  var qRef = useRef<BankQ[]>([])
  var idxRef = useRef(0)
  var answersRef = useRef<{ id: string; choice: number; ms: number }[]>([])
  var qStartRef = useRef(0)
  var lockRef = useRef(false)

  useEffect(function () {
    var alive = true
    ;(async function () {
      try {
        var r1 = await fetch('/api/arena/challenges/bank?mode=info', { cache: 'no-store' })
        var d1: any = await r1.json()
        if (alive && d1 && d1.ok) setBankCount(Number(d1.bankCount || 0))
        var r2 = await fetch('/api/arena/challenges/attempt?mode=board', { cache: 'no-store' })
        var d2: any = await r2.json()
        if (alive && d2 && d2.ok) setBoard(d2.board || [])
      } catch (e) { /* شبكة */ }
    })()
    return function () { alive = false }
  }, [])

  async function refreshBoard(): Promise<void> {
    try {
      var r = await fetch('/api/arena/challenges/attempt?mode=board', { cache: 'no-store' })
      var d: any = await r.json()
      if (d && d.ok) setBoard(d.board || [])
    } catch (e) {}
  }

  /* تسجيل إجابة (أو تجاوز بالتايم) والتقدم للسؤال الجاي — أو التسليم */
  var recordAndAdvance = useCallback(function (choice: number): void {
    if (lockRef.current) return
    lockRef.current = true
    var qs = qRef.current
    var i = idxRef.current
    var q = qs[i]
    if (q) {
      answersRef.current.push({ id: q.id, choice: choice, ms: Math.max(0, Date.now() - qStartRef.current) })
    }
    var next = i + 1
    if (next >= qs.length) {
      setIdx(next)
      submitAll()
      return
    }
    idxRef.current = next
    setIdx(next)
    setPicked(-1)
    qStartRef.current = Date.now()
    setRemainMs(BANK_Q_LIMIT_MS)
    setTimeout(function () { lockRef.current = false }, 150)
  }, [])

  /* مؤقت السؤال — لما يخلص يجاوب لوحده (choice -1) */
  useEffect(function () {
    if (phase !== 'play') return
    var startedAt = Date.now()
    var iv = setInterval(function () {
      var left = BANK_Q_LIMIT_MS - (Date.now() - startedAt)
      if (left <= 0) {
        setRemainMs(0)
        recordAndAdvance(-1)
      } else {
        setRemainMs(left)
      }
    }, 250)
    return function () { clearInterval(iv) }
  }, [phase, idx, recordAndAdvance])

  async function startRound(): Promise<void> {
    if (loadingRound) return
    setLoadingRound(true)
    try {
      var res = await fetch('/api/arena/challenges/bank?mode=round&count=' + BANK_ROUND_COUNT, { cache: 'no-store' })
      var d: any = await res.json()
      var qs: BankQ[] = (d && d.ok && Array.isArray(d.questions)) ? d.questions : []
      if (!d || !d.ok || qs.length === 0) {
        toast.error('البنك فاضي — استنى المستر يرفع ملفات التحدي')
        return
      }
      qRef.current = qs
      idxRef.current = 0
      answersRef.current = []
      qStartRef.current = Date.now()
      lockRef.current = false
      setQuestions(qs)
      setIdx(0)
      setPicked(-1)
      setResult(null)
      setRemainMs(BANK_Q_LIMIT_MS)
      setPhase('play')
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setLoadingRound(false)
    }
  }

  async function submitAll(): Promise<void> {
    setSubmitting(true)
    try {
      var answers = answersRef.current.slice()
      var totalMs = answers.reduce(function (a, b) { return a + (Number(b.ms) || 0) }, 0)
      var out = await postJson('/api/arena/challenges/attempt', {
        studentId: studentId,
        name: studentName,
        answers: answers,
      })
      var d = out.data
      if (!d || !d.ok) {
        toast.error(String((d && d.error) || 'مشكلة في تسليم التحدي'))
        setPhase('idle')
        return
      }
      setResult({ score: Number(d.score || 0), correctCount: Number(d.correctCount || 0), total: Number(d.total || answers.length), timeMs: Number(d.timeMs || totalMs) })
      setMyRankKey(studentName + '-' + Number(d.score || 0))
      setPhase('done')
      toast.success('خلصت التحدي! درجتك: ' + String(d.score || 0) + ' 🎯')
      await refreshBoard()
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
      setPhase('idle')
    } finally {
      setSubmitting(false)
    }
  }

  /* البنك فاضي (أو لسه بيتفحص) → مفيش حاجة تتعرض */
  if (bankCount === 0) return null

  /* ===== شاشة اللعب ===== */
  if (phase === 'play') {
    var qs = questions
    var q = qs[idx]
    if (!q) {
      return (
        <div className="py-10 flex items-center justify-center">
          <Loader2 className="size-7 animate-spin text-muted-foreground" />
        </div>
      )
    }
    var pct = Math.max(0, Math.min(100, (remainMs / BANK_Q_LIMIT_MS) * 100))
    var remainSec = Math.ceil(remainMs / 1000)
    return (
      <Card className="overflow-hidden border-violet-300 dark:border-violet-800">
        <div className="bg-gradient-to-l from-violet-600 to-fuchsia-600 px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge className="bg-white/25 text-white border-0 font-black">🎯 تحدي ملفات المستر</Badge>
            <span className="text-sm font-black" dir="ltr">{idx + 1} / {qs.length}</span>
          </div>
          <div className="mt-3 h-2 w-full rounded-full bg-white/20">
            <div
              className={'h-full rounded-full transition-[width] duration-200 ease-linear ' + (remainSec <= 10 ? 'bg-red-400' : 'bg-white')}
              style={{ width: pct + '%' }}
            />
          </div>
        </div>
        <CardContent className="p-5 space-y-4">
          {/* نقاط التقدم */}
          <div className="flex items-center justify-center gap-1.5">
            {qs.map(function (_, i) {
              return (
                <span
                  key={i}
                  className={'h-2 w-2 rounded-full ' + (i < idx ? 'bg-emerald-500' : i === idx ? 'bg-violet-500 ring-2 ring-violet-300' : 'bg-stone-300 dark:bg-stone-700')}
                />
              )
            })}
          </div>
          <p dir="ltr" className="text-left text-lg font-bold leading-relaxed sm:text-xl"><FractionText text={q.question} /></p>
          {submitting ? (
            <div className="py-8 flex flex-col items-center gap-2">
              <Loader2 className="size-7 animate-spin text-violet-500" />
              <p className="text-sm font-bold text-muted-foreground">بتسلّم المحاولة…</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {q.options.map(function (opt, i) {
                return (
                  <Button
                    key={i}
                    variant="outline"
                    onClick={function () { setPicked(i); recordAndAdvance(i) }}
                    className={'min-h-12 justify-start gap-2.5 text-base font-bold border-2 text-left ' +
                      (picked === i
                        ? 'border-violet-500 bg-violet-50 dark:bg-violet-950/40'
                        : 'border-violet-200 hover:border-violet-500 hover:bg-violet-50 dark:border-violet-900 dark:hover:bg-violet-950/30')}
                  >
                    <span className="grid place-items-center size-7 rounded-lg bg-violet-100 dark:bg-violet-900/50 font-mono text-sm shrink-0" dir="ltr">
                      {LETTERS[i] || '•'}
                    </span>
                    <span dir="ltr" className="flex-1 text-left leading-snug break-words"><FractionText text={opt} /></span>
                  </Button>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  /* ===== شاشة النتيجة ===== */
  if (phase === 'done' && result) {
    return (
      <Card className="overflow-hidden border-emerald-300 dark:border-emerald-800">
        <div className="bg-gradient-to-l from-emerald-500 to-teal-600 px-5 py-4 text-white text-center">
          <h3 className="font-black text-lg">خلصت التحدي! 🎉</h3>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] font-bold text-muted-foreground">الدرجة</p>
              <p className="text-2xl font-black text-teal-600 dark:text-teal-400" dir="ltr">{result.score}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] font-bold text-muted-foreground">صح</p>
              <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400" dir="ltr">{result.correctCount}/{result.total}</p>
            </div>
            <div className="rounded-xl border bg-muted/40 p-3">
              <p className="text-[11px] font-bold text-muted-foreground">الزمن</p>
              <p className="text-2xl font-black" dir="ltr">{Math.round(result.timeMs / 1000)}s</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button onClick={function () { startRound() }} disabled={loadingRound} className="flex-1 min-h-12 bg-gradient-to-l from-violet-600 to-fuchsia-600 text-white font-black">
              {loadingRound ? <Loader2 className="size-5 animate-spin" /> : <RefreshCw className="size-5" />}
              جولة تانية — أسئلة جديدة
            </Button>
            <Button variant="outline" onClick={function () { setPhase('idle') }} className="min-h-12 font-black">رجوع</Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  /* ===== شاشة البداية + لوحة الترتيب ===== */
  return (
    <Card className="overflow-hidden border-violet-300 dark:border-violet-800">
      <div className="bg-gradient-to-l from-violet-600 to-fuchsia-600 px-5 py-4 text-white">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Badge className="bg-white/25 text-white border-0 font-black">🎯 تحدي ملفات المستر</Badge>
          <Badge className="bg-white text-violet-700 border-0 font-black" dir="ltr">{bankCount} سؤال</Badge>
        </div>
        <h3 className="mt-2 font-black text-lg leading-snug">أسئلة عشوائية من كل ملفات المستر — كل جولة مختلفة!</h3>
        <p className="text-sm text-violet-100 font-bold">10 أسئلة إنجليزي • دقيقة لكل سؤال • الدرجة = الدقة + السرعة</p>
      </div>
      <CardContent className="p-5 space-y-4">
        <Button
          onClick={function () { startRound() }}
          disabled={loadingRound}
          className="w-full min-h-14 bg-gradient-to-l from-violet-600 to-fuchsia-600 text-white font-black text-lg shadow-lg shadow-violet-500/25"
        >
          {loadingRound ? <Loader2 className="size-5 animate-spin" /> : <Swords className="size-5" />}
          ابدأ التحدي 🚀
        </Button>

        <div className="rounded-2xl border p-3 space-y-2">
          <h4 className="font-black flex items-center gap-1.5 text-sm">
            <Trophy className="size-4 text-violet-500" /> لوحة ترتيب التحدي
          </h4>
          {board.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-2 font-bold">لسه محدش خلص — كن انت الأول! 🏃</p>
          ) : (
            <div className={SCROLL_CLS + ' space-y-1.5'}>
              {board.map(function (row) {
                var isMe = row.name === studentName && (myRankKey === studentName + '-' + String(row.score))
                return (
                  <div
                    key={row.rank + '-' + row.name + '-' + row.createdAt}
                    className={'flex items-center gap-2 rounded-xl px-3 py-2 ' + (isMe ? 'bg-violet-50 dark:bg-violet-950/40 border border-violet-300' : 'bg-stone-50 dark:bg-stone-900/50')}
                  >
                    <span className="w-8 text-center text-base shrink-0">
                      {rankMedal(row.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{row.rank}</span>}
                    </span>
                    <span className="flex-1 truncate text-sm font-bold">
                      {row.name}
                      {isMe ? <span className="text-[10px] text-muted-foreground font-normal"> (انت)</span> : null}
                    </span>
                    <span dir="ltr" className="text-xs text-muted-foreground font-bold shrink-0">{row.correctCount}/{row.totalQuestions}</span>
                    <Badge variant="outline" className="font-black shrink-0" dir="ltr">{row.score}</Badge>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/* ============================================================
 * (2026-و68-إضافي) فيديو المستر في التحدي — طلب المستر: «يصور فيديو
 * ويعمله في التحديات». يوتيوب (embed) أو ملف مرفوع (بتوكن موقّع من
 * السيرفر). بيتعرض **فوق السؤال** — ولما مفيش فيديو المكون بيرجع null
 * فمفيش بلوك فاضي أبدًا (نفس مبدأ زرار الخريطة الذهنية في و67).
 * ============================================================ */
function youTubeEmbedIdOf(url: string): string {
  var m = String(url || '').match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : ''
}

function ChallengeVideo({ url, type }: { url: string; type: string }) {
  if (!url) return null
  if (type === 'youtube') {
    var ytId = youTubeEmbedIdOf(url)
    if (!ytId) return null
    return (
      <div className="overflow-hidden rounded-xl border border-amber-200 bg-black shadow-sm dark:border-amber-800" dir="ltr">
        <iframe
          src={'https://www.youtube.com/embed/' + ytId + '?modestbranding=1&rel=0&playsinline=1'}
          title="فيديو المستر"
          className="aspect-video w-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
        />
      </div>
    )
  }
  if (type === 'file') {
    return (
      <video
        src={url}
        controls
        playsInline
        preload="metadata"
        className="w-full rounded-xl border border-amber-200 bg-black shadow-sm dark:border-amber-800"
      />
    )
  }
  return null
}

/* ============================================================
 * الوضع 2: تحدي المستر
 * ============================================================ */
function TeacherMode({ studentId, studentName }: { studentId: string; studentName: string }) {
  var [data, setData] = useState<ChallengeData | null>(null)
  var [loading, setLoading] = useState(true)
  var [submitting, setSubmitting] = useState(false)
  var [chNow, setChNow] = useState(Date.now())

  /* مؤقّت "منامت السؤال" — بنحسب منه سرعة إجابة الطالب */
  var seenIdRef = useRef('')
  var seenAtRef = useRef(Date.now())

  async function loadChallenges(): Promise<void> {
    try {
      var res = await fetch('/api/arena/challenges?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
      var d: any = await res.json()
      if (d && d.ok) {
        setData({ active: d.active || null, leaderboard: d.leaderboard || [], history: d.history || [], myEntry: d.myEntry || null })
        /* تحدي جديد ظهر → صفّر مؤقّت الرؤية (ده الـ mountedAt بتاع السؤال) */
        var aid = d.active ? String(d.active.id) : ''
        if (aid !== seenIdRef.current) {
          seenIdRef.current = aid
          seenAtRef.current = Date.now()
        }
      }
    } catch (e) { /* الشبكة — التحديث الجاي يعوض */ } finally {
      setLoading(false)
    }
  }

  /* تحميل أول مرة + تحديث تلقائي كل 10 ثواني طول ما الطالب واقف على التاب */
  useEffect(function () {
    loadChallenges()
    var iv = setInterval(function () { loadChallenges() }, 10000)
    return function () { clearInterval(iv) }
  }, [studentId])

  /* عداد الـ closesAt — ثانية بثانية */
  var closesAt = data && data.active ? data.active.closesAt : null
  useEffect(function () {
    if (!closesAt) return
    var iv = setInterval(function () { setChNow(Date.now()) }, 1000)
    return function () { clearInterval(iv) }
  }, [closesAt])

  async function submitChoice(i: number): Promise<void> {
    var d = data
    if (!d || !d.active || d.myEntry || submitting) return
    setSubmitting(true)
    try {
      var out = await postJson('/api/arena/challenges/entry', {
        challengeId: d.active.id,
        studentId: studentId,
        name: studentName,
        choice: i,
        timeMs: Date.now() - seenAtRef.current,
      })
      var res = out.data
      if (out.status === 404) { toast.error('التحدي مش موجود'); await loadChallenges(); return }
      if (!res || !res.ok) { toast.error(String((res && res.error) || 'مشكلة في تسجيل إجابتك')); return }
      toast.success('اتسجلت! شوف نفسك في اللوحة 🎯')
      await loadChallenges()
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setSubmitting(false)
    }
  }

  if (loading && !data) {
    return (
      <div className="py-12 flex items-center justify-center text-muted-foreground">
        <Loader2 className="size-7 animate-spin" />
      </div>
    )
  }

  var active = data ? data.active : null
  var remainMs = 0
  if (active && active.closesAt) {
    remainMs = new Date(active.closesAt).getTime() - chNow
  }

  /* ===== مفيش تحدي شغال ===== */
  if (!active) {
    return (
      <div className="space-y-4">
        <BankChallenge studentId={studentId} studentName={studentName} />
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-2">
            <div className="text-5xl">😴</div>
            <p className="font-black text-lg">مفيش تحدي شغال دلوقتي</p>
            <p className="text-sm text-muted-foreground font-bold">استنى تحدي المستر الجديد!</p>
          </CardContent>
        </Card>
        {data && data.history.length > 0 ? (
          <Card>
            <CardContent className="p-4">
              <h4 className="font-black text-sm text-muted-foreground mb-2.5 flex items-center gap-1.5">
                <GraduationCap className="size-4" /> تحديات قديمة
              </h4>
              <div className="space-y-1.5">
                {data.history.slice(0, 8).map(function (h) {
                  return (
                    <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg px-3 py-2 bg-stone-50 dark:bg-stone-900/50 text-sm">
                      <span className="truncate font-bold">{h.title}</span>
                      <Badge variant="outline" className="font-black shrink-0" dir="ltr">+{h.points}</Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        ) : null}
      </div>
    )
  }

  /* ===== فيه تحدي شغال ===== */
  return (
    <div className="space-y-4">
      <BankChallenge studentId={studentId} studentName={studentName} />
      <Card className="overflow-hidden border-amber-300 dark:border-amber-800">
        <div className="bg-gradient-to-l from-amber-500 to-orange-600 px-5 py-4 text-white space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <Badge className="bg-white/25 text-white border-0 font-black">👨‍🏫 تحدي المستر</Badge>
            <Badge className="bg-white text-amber-700 border-0 font-black" dir="ltr">+{active.points} نقطة</Badge>
          </div>
          <h3 className="font-black text-lg leading-snug">{active.title}</h3>
          {active.closesAt && remainMs > 0 ? (
            <p className="text-sm font-black flex items-center gap-1.5 text-amber-100">
              <Timer className="size-4" /> الوقت المتبقي: <span dir="ltr">{fmtCountdown(remainMs)}</span>
            </p>
          ) : null}
        </div>
        <CardContent className="p-5 space-y-4">
          {/* (2026-و68-إضافي) فيديو المستر — فوق السؤال، بس لو فيه فيديو فعلًا */}
          <ChallengeVideo url={String(active.videoUrl || '')} type={String(active.videoType || '')} />
          {/* (و71) سؤال المستر بـ FractionText — dir=auto عشان كلام المستر العربي
              يفضل RTL والماث جواه بيتعزل LTR ويترسم صح */}
          <p dir="auto" className="text-xl font-bold leading-relaxed"><FractionText text={active.question} /></p>

          {data && data.myEntry ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 p-4 text-center font-black text-emerald-700 dark:text-emerald-300"
            >
              جاوبت خلاص ✅ — شوف نتيجتك في لوحة الترتيب 👇
            </motion.div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {active.options.map(function (opt, i) {
                return (
                  <Button
                    key={i}
                    variant="outline"
                    disabled={submitting}
                    onClick={function () { submitChoice(i) }}
                    className="min-h-12 justify-start gap-2.5 text-base font-bold border-2 border-amber-300 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/30 dark:border-amber-800"
                  >
                    <span className="grid place-items-center size-7 rounded-lg bg-amber-100 dark:bg-amber-900/50 font-mono text-sm shrink-0" dir="ltr">
                      {LETTERS[i] || '•'}
                    </span>
                    <span dir="ltr" className="flex-1 text-left leading-snug break-words"><FractionText text={opt} /></span>
                    {submitting ? <Loader2 className="size-4 animate-spin shrink-0" /> : null}
                  </Button>
                )
              })}
            </div>
          )}

          {/* لوحة الترتيب */}
          <div className="rounded-2xl border p-3 space-y-2">
            <h4 className="font-black flex items-center gap-1.5 text-sm">
              <Trophy className="size-4 text-amber-500" /> لوحة الترتيب
            </h4>
            {!data || data.leaderboard.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2 font-bold">لسه محدش جاوب — كن انت الأول! 🏃</p>
            ) : (
              <div className={SCROLL_CLS + ' space-y-1.5'}>
                {data.leaderboard.map(function (row) {
                  var isMe = !row.isTeacher && row.name === studentName
                  return (
                    <div
                      key={row.rank + '-' + row.name + '-' + row.createdAt}
                      className={'flex items-center gap-2 rounded-xl px-3 py-2 ' +
                        (row.isTeacher
                          ? 'bg-gradient-to-l from-amber-100 to-orange-100 dark:from-amber-950/60 dark:to-orange-950/60 border border-amber-400'
                          : isMe
                            ? 'bg-amber-50 dark:bg-amber-950/30 border border-amber-300'
                            : 'bg-stone-50 dark:bg-stone-900/50')}
                    >
                      <span className="w-8 text-center text-base shrink-0">
                        {rankMedal(row.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{row.rank}</span>}
                      </span>
                      <span className={'flex-1 truncate text-sm ' + (row.isTeacher ? 'font-black text-amber-800 dark:text-amber-300' : 'font-bold')}>
                        {row.isTeacher ? 'المستر وائل 👨‍🏫' : row.name}
                        {isMe ? <span className="text-[10px] text-muted-foreground font-normal"> (انت)</span> : null}
                      </span>
                      <span dir="ltr" className="text-xs text-muted-foreground font-bold shrink-0">{Math.round(row.timeMs / 1000)} ث</span>
                      {row.correct ? <Check className="size-4 text-emerald-600 shrink-0" /> : <X className="size-4 text-red-500 shrink-0" />}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ============================================================
 * الوضع 3: فلاش كاردز سريعة
 * ============================================================ */
function FlashcardsMode({ studentId, studentName }: { studentId: string; studentName: string }) {
  var [phase, setPhase] = useState<'idle' | 'play' | 'end'>('idle')
  var [board, setBoard] = useState<BoardRow[]>([])
  var [boardLoading, setBoardLoading] = useState(true)
  var [loadingRound, setLoadingRound] = useState(false)
  var [cards, setCards] = useState<FlashCard[]>([])
  var [idx, setIdx] = useState(0)
  var [score, setScore] = useState(0)
  var [correctCount, setCorrectCount] = useState(0)
  var [streak, setStreak] = useState(0)
  var [bestStreak, setBestStreak] = useState(0)
  var [results, setResults] = useState<('correct' | 'wrong' | null)[]>([])
  var [feedback, setFeedback] = useState<FcFeedback | null>(null)
  var [remainMs, setRemainMs] = useState(0)
  var [submitting, setSubmitting] = useState(false)
  var [myRowKey, setMyRowKey] = useState('')
  /* (و70-ج) مصدر الكروت: كروت المستر المرفوعة أو تدريب مولّد */
  var [deckSource, setDeckSource] = useState('generated')
  /* (و72) الطالب يظبط جولته لوحده: العدد + وقت البطاقة + الصعوبة */
  var [fcCount, setFcCount] = useState(10)
  var [fcSeconds, setFcSeconds] = useState(15)
  var [fcDiff, setFcDiff] = useState<'easy' | 'medium' | 'hard' | 'mixed'>('mixed')
/* (2026-و89) التحديات كلها بالإنجليزي بطلب المستر — زرار الترجمة اتنشال نهائيًا
   (اتشالت lib/flash-translate.ts) — دي منصة ماث: الأسئلة إنجليزي من غير ترجمة */
  var [hint, setHint] = useState('')
  var [hintLoading, setHintLoading] = useState(false)

  /* مراجع — الحكم اللحظي ميبقاش فيه state قديم */
  var cardsRef = useRef<FlashCard[]>([])
  var idxRef = useRef(0)
  var streakRef = useRef(0)
  var scoreRef = useRef(0)
  var correctRef = useRef(0)
  var bestRef = useRef(0)
  var startRef = useRef(0)
  var feedbackRef = useRef<FcFeedback | null>(null)
  var advanceTimerRef = useRef<number | null>(null)
  var resultsRef = useRef<('correct' | 'wrong' | null)[]>([])
  var submittedRef = useRef(false)

  /* تنظيف صارم عند الخروج — ممنوع تايمر يفضل عايش */
  useEffect(function () {
    return function () {
      if (advanceTimerRef.current !== null) {
        clearTimeout(advanceTimerRef.current)
        advanceTimerRef.current = null
      }
    }
  }, [])

  async function refreshBoard(): Promise<void> {
    try {
      var res = await fetch('/api/arena/flashcards?mode=board', { cache: 'no-store' })
      var d: any = await res.json()
      if (d && d.ok) setBoard(d.board || [])
    } catch (e) { /* الشبكة — الزر متاح تاني */ } finally {
      setBoardLoading(false)
    }
  }

  /* لوحة الشرف أول ما ندخل الوضع */
  useEffect(function () {
    refreshBoard()
  }, [])

  /* بدء جولة جديدة */
  async function startRound(): Promise<void> {
    if (advanceTimerRef.current !== null) { clearTimeout(advanceTimerRef.current); advanceTimerRef.current = null }
    setLoadingRound(true)
    try {
      var res = await fetch('/api/arena/flashcards?mode=round&count=' + fcCount + '&seconds=' + fcSeconds + '&difficulty=' + fcDiff, { cache: 'no-store' })
      var d: any = await res.json()
      if (!d || !d.ok || !(d.cards || []).length) {
        toast.error(String((d && d.error) || 'مشكلة في تجهيز الجولة'))
        return
      }
      setDeckSource(String(d.source || 'generated'))
      cardsRef.current = d.cards
      setCards(d.cards)
      idxRef.current = 0
      setIdx(0)
      streakRef.current = 0
      setStreak(0)
      scoreRef.current = 0
      setScore(0)
      correctRef.current = 0
      setCorrectCount(0)
      bestRef.current = 0
      setBestStreak(0)
      resultsRef.current = d.cards.map(function () { return null })
      setResults(resultsRef.current.slice())
      feedbackRef.current = null
      setFeedback(null)
      submittedRef.current = false
      setMyRowKey('')
      setPhase('play')
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setLoadingRound(false)
    }
  }

  /* الانتقال للبطاقة اللي بعد الفيدباك (900ms راحة) */
  function fcAdvance(): void {
    advanceTimerRef.current = null
    feedbackRef.current = null
    setFeedback(null)
    /* (و88) نضيف التلميح مع كل بطاقة جديدة — (و89) مفيش ترجمة تاني */
    setHint('')
    setHintLoading(false)
    var next = idxRef.current + 1
    if (next >= cardsRef.current.length) {
      setPhase('end')
      submitResult()
    } else {
      idxRef.current = next
      setIdx(next)
    }
  }

  /* (و88) ✨ تلميح ذكي — نداء واحد لكل بطاقة، من غير الإجابة */
  async function askHint(): Promise<void> {
    if (feedbackRef.current || hintLoading || hint) return
    var c = cardsRef.current[idxRef.current]
    if (!c) return
    setHintLoading(true)
    try {
      var out = await postJson('/api/arena/hint', { question: c.text, options: c.options || [] })
      var d = out.data
      if (d && d.ok && d.hint) {
        setHint(String(d.hint).slice(0, 200))
      } else {
        toast.error(String((d && d.error) || 'التلميح مش متاح دلوقتي'))
      }
    } catch (e) {
      toast.error('الشبكة بتلحس — جرب تاني')
    } finally {
      setHintLoading(false)
    }
  }

  /* التسوية: صح/غلط/تايم أوت — حساب نقاط فوري محلي (نفس صيغة السيرفر) */
  function fcSettle(choice: number): void {
    if (feedbackRef.current) return
    var c = cardsRef.current[idxRef.current]
    if (!c) return
    var limitMs = Math.max(3, Number(c.timeLimitSec || 8)) * 1000
    var remain = Math.max(0, limitMs - (Date.now() - startRef.current))
    var frac = limitMs > 0 ? remain / limitMs : 0
    var isCorrect = choice >= 0 && choice === Number(c.correctIndex)
    var newStreak = isCorrect ? streakRef.current + 1 : 0
    var gained = isCorrect ? 60 + Math.round(40 * frac) + (newStreak >= 3 ? 15 : 0) : 0
    var fb: FcFeedback = { choice: choice, correct: isCorrect, timeout: choice < 0, gained: gained }
    feedbackRef.current = fb
    setFeedback(fb)
    streakRef.current = newStreak
    setStreak(newStreak)
    resultsRef.current[idxRef.current] = isCorrect ? 'correct' : 'wrong'
    setResults(resultsRef.current.slice())
    if (isCorrect) {
      scoreRef.current += gained
      setScore(scoreRef.current)
      correctRef.current += 1
      setCorrectCount(correctRef.current)
      bestRef.current = Math.max(bestRef.current, newStreak)
      setBestStreak(bestRef.current)
    }
    if (advanceTimerRef.current !== null) clearTimeout(advanceTimerRef.current)
    advanceTimerRef.current = window.setTimeout(function () { fcAdvance() }, 900)
  }

  /* حفظ النتيجة في لوحة الشرف */
  async function submitResult(): Promise<void> {
    if (submittedRef.current) return
    submittedRef.current = true
    setSubmitting(true)
    try {
      var out = await postJson('/api/arena/flashcards', {
        action: 'submit',
        studentId: studentId || '',
        name: studentName || 'طالب',
        score: scoreRef.current,
        correctCount: correctRef.current,
        totalCards: Math.max(1, cardsRef.current.length),
      })
      var d = out.data
      if (out.status === 200 && d && d.ok) {
        setMyRowKey((studentName || 'طالب') + '|' + scoreRef.current)
        await refreshBoard()
        toast.success('اتحفظت نتيجتك في لوحة الشرف 🏆')
      } else {
        toast.error(String((d && d.error) || 'مشكلة في حفظ النتيجة'))
      }
    } catch (e) {
      toast.error('الشبكة بتلحس — النتيجة ماتحفظتش')
    } finally {
      setSubmitting(false)
    }
  }

  /* عدّاد البطاقة الحالية — بيقف فورًا مع أول فيدباك */
  var curCard = phase === 'play' ? cards[idx] : null
  useEffect(function () {
    if (phase !== 'play' || feedback) return
    var c = cardsRef.current[idxRef.current]
    if (!c) return
    var limitMs = Math.max(3, Number(c.timeLimitSec || 8)) * 1000
    startRef.current = Date.now()
    setRemainMs(limitMs)
    var iv = setInterval(function () {
      var r = limitMs - (Date.now() - startRef.current)
      setRemainMs(Math.max(0, r))
      if (r <= 0) {
        clearInterval(iv)
        fcSettle(-1) /* تايم أوت = غلط */
      }
    }, 100)
    return function () { clearInterval(iv) }
  }, [phase, idx, feedback])

  var remainSec = Math.ceil(remainMs / 1000)
  var remainPct = curCard ? Math.max(0, Math.min(100, (remainMs / Math.max(1, Number(curCard.timeLimitSec || 8) * 1000)) * 100)) : 0

  /* ===== idle: الشرح + اللوحة ===== */
  if (phase === 'idle') {
    var top10 = board.slice(0, 10)
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden border-violet-200 dark:border-violet-900/70">
          <div className="bg-gradient-to-l from-violet-500 to-fuchsia-600 px-5 py-4 text-white flex items-center gap-2">
            <Zap className="size-5" />
            <h3 className="font-black text-lg">فلاش كاردز سريعة</h3>
          </div>
          <CardContent className="p-5 space-y-4">
            <p className="leading-relaxed text-sm font-bold">
              <span dir="ltr">{fcCount}</span> بطاقة سريعة — انت اللي بتظبط وقت كل بطاقة والصعوبة! الدقة + السرعة = نقاط. <span dir="ltr">3</span> صح ورا بعض = بونص 🔥
            </p>
            {/* (و72) تحكم الطالب في جولته: العدد + وقت البطاقة + الصعوبة */}
            <div className="rounded-2xl border-2 border-dashed border-violet-200 dark:border-violet-900/70 p-3 space-y-3">
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1.5">عدد البطاقات</p>
                <div className="grid grid-cols-4 gap-2">
                  {[5, 10, 15, 20].map(function (n) {
                    return (
                      <button key={n} type="button" onClick={function () { setFcCount(n) }}
                        className={'min-h-10 rounded-xl border-2 px-2 text-[13px] font-black transition-colors ' + (fcCount === n ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'border-stone-200 bg-white text-stone-500 hover:border-violet-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400')}>
                        <span dir="ltr">{n}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1.5">وقت البطاقة الواحدة</p>
                <div className="grid grid-cols-5 gap-2">
                  {[8, 10, 15, 20, 30].map(function (s) {
                    return (
                      <button key={s} type="button" onClick={function () { setFcSeconds(s) }}
                        className={'min-h-10 rounded-xl border-2 px-2 text-[13px] font-black transition-colors ' + (fcSeconds === s ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'border-stone-200 bg-white text-stone-500 hover:border-violet-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400')}>
                        <span dir="ltr">{s}</span> ث
                      </button>
                    )
                  })}
                </div>
              </div>
              <div>
                <p className="text-xs font-bold text-muted-foreground mb-1.5">الصعوبة</p>
                <div className="grid grid-cols-4 gap-2">
                  {([['easy', 'سهل'], ['medium', 'متوسط'], ['hard', 'صعب'], ['mixed', 'مختلط']] as [string, string][]).map(function (d) {
                    return (
                      <button key={d[0]} type="button" onClick={function () { setFcDiff(d[0] as 'easy' | 'medium' | 'hard' | 'mixed') }}
                        className={'min-h-10 rounded-xl border-2 px-2 text-[13px] font-black transition-colors ' + (fcDiff === d[0] ? 'border-violet-500 bg-violet-50 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300' : 'border-stone-200 bg-white text-stone-500 hover:border-violet-300 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-400')}>
                        {d[1]}
                      </button>
                    )
                  })}
                </div>
              </div>
              {deckSource === 'deck' ? (
                <p className="rounded-xl bg-fuchsia-500/10 px-3 py-2 text-[12px] font-black text-fuchsia-700 dark:text-fuchsia-300 ring-1 ring-fuchsia-400/30">
                  🎯 كروت المستر الجاهزة ليها الأولوية — ووقت البطاقة اللي اخترته بيتطبق عليها
                </p>
              ) : null}
            </div>
            <Button
              onClick={function () { startRound() }}
              disabled={loadingRound}
              className="w-full min-h-14 bg-gradient-to-l from-violet-500 to-fuchsia-600 text-white font-black text-lg shadow-lg shadow-violet-500/25"
            >
              {loadingRound ? <Loader2 className="size-5 animate-spin" /> : <Play className="size-5" />}
              ابدأ الجولة ⚡
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <h4 className="font-black flex items-center gap-1.5 mb-3">
              <Trophy className="size-4 text-violet-500" /> لوحة الشرف — أعلى <span dir="ltr">10</span>
            </h4>
            {boardLoading ? (
              <div className="py-6 flex justify-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
            ) : top10.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3 font-bold">لسه مفيش نتيجات — كن انت أول واحد! 🚀</p>
            ) : (
              <div className={SCROLL_CLS + ' space-y-1.5'}>
                {top10.map(function (r) {
                  return (
                    <div key={r.rank + '-' + r.createdAt} className="flex items-center gap-2 rounded-xl px-3 py-2 bg-stone-50 dark:bg-stone-900/50">
                      <span className="w-8 text-center text-base shrink-0">
                        {rankMedal(r.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{r.rank}</span>}
                      </span>
                      <span className="flex-1 truncate text-sm font-bold">{r.name}</span>
                      <span className="text-xs text-muted-foreground font-bold shrink-0" dir="ltr">{r.correctCount}/{r.totalCards}</span>
                      <span className="font-black text-violet-600 shrink-0" dir="ltr">{r.score}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    )
  }

  /* ===== play: البطاقات — (و88) شكل الصورة: نقاط تقدم + «نقطة» + بار بنفسجي بعداد + كارت أبيض سؤال في النص واختيارات 2×2 + زرار ✨
     (2026-و89) التحديات كلها بالإنجليزي — زرار الترجمة اتنشال نهائيًا بطلب المستر ===== */
  if (phase === 'play' && curCard) {
    /* نسخة غير-nullable — عشان TS ما يضيّعش الـ narrowing جوه الـ callbacks */
    var cardNow: FlashCard = curCard
    return (
      <div className="space-y-4 relative">
        {/* شريط علوي: نقاط التقدم + سكور + ستريك */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-1.5">
            {results.map(function (res, i) {
              var cls = 'rounded-full transition-all '
              if (i === idx) cls += 'size-3 bg-violet-500 ring-2 ring-violet-300 dark:ring-violet-700'
              else if (res === 'correct') cls += 'size-2.5 bg-emerald-500'
              else if (res === 'wrong') cls += 'size-2.5 bg-red-400'
              else cls += 'size-2.5 bg-stone-300 dark:bg-stone-700'
              return <span key={i} className={cls} />
            })}
          </div>
          <div className="flex items-center gap-2 text-sm font-black">
            {streak >= 2 ? (
              <span className="text-orange-500 flex items-center gap-1"><Flame className="size-4" /> ×{streak}</span>
            ) : null}
            <Badge variant="outline" className="font-black" dir="ltr">{score} نقطة</Badge>
          </div>
        </div>

        {/* البار البنفسجي + عدد الثواني — زي الصورة */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-3 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-l from-fuchsia-500 to-violet-500 transition-[width] duration-100 ease-linear"
              style={{ width: remainPct + '%' }}
            />
          </div>
          <span dir="ltr" className={'font-black text-2xl w-10 text-center shrink-0 ' + (remainSec <= 3 ? 'text-red-600' : 'text-violet-600')}>{remainSec}</span>
        </div>

        {/* الكارد — سلايد بين البطاقات — أبيض نضيف زي الصورة */}
        <AnimatePresence mode="wait">
          <motion.div
            key={idx}
            initial={{ x: -60, opacity: 0, scale: 0.98 }}
            animate={{ x: 0, opacity: 1, scale: 1 }}
            exit={{ x: 60, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.16 }}
            className="relative"
          >
            <div className="rounded-3xl border-2 border-stone-100 dark:border-stone-800 bg-white dark:bg-stone-900 shadow-sm p-5 sm:p-7 space-y-5">
              {/* (و71) نص الكارد بـ FractionText — أس/كسور بتترسم زي المنصة.
                  dir=auto: كروت المحرك الإنجليزي LTR وكروت المستر العربي RTL.
                  (2026-و89) مفيش ترجمة — السؤال بالإنجليزي زي ما هو بطلب المستر */}
              <p dir="auto" className="text-lg sm:text-xl font-bold leading-relaxed text-center">
                <FractionText text={cardNow.text} />
              </p>
              {/* (و88) 💡 فقاعة التلميح الذكي */}
              {hint ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-xl bg-violet-500/10 px-3 py-2 text-center text-[13px] font-bold text-violet-700 dark:text-violet-300 ring-1 ring-violet-400/30"
                >
                  💡 {hint}
                </motion.p>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                {cardNow.options.map(function (opt, i) {
                  var cls = 'min-h-[52px] text-base font-bold border-2 justify-center rounded-xl'
                  if (feedback) {
                    if (i === Number(cardNow.correctIndex)) {
                      cls += ' border-emerald-500 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200'
                    } else if (i === feedback.choice) {
                      cls += ' border-red-400 bg-red-100 dark:bg-red-950/50 text-red-700 dark:text-red-300'
                    } else {
                      cls += ' opacity-50'
                    }
                  }
                  return (
                    <Button key={i} variant="outline" disabled={!!feedback} onClick={function () { fcSettle(i) }} className={cls}>
                      <span dir="auto" className="leading-snug break-words"><FractionText text={opt} /></span>
                    </Button>
                  )
                })}
              </div>
              {feedback ? (
                <motion.p
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={'text-center font-black text-sm ' + (feedback.correct ? 'text-emerald-600' : 'text-red-500')}
                >
                  {feedback.correct ? (
                    <>صح! <span dir="ltr">+{feedback.gained}</span>{streak >= 3 ? ' 🔥 بونص الستريك' : ''}</>
                  ) : feedback.timeout ? (
                    <>⌛ الوقت خلص! الإجابة الصح: <span dir="ltr" className="inline-block"><FractionText text={cardNow.options[Number(cardNow.correctIndex)]} /></span></>
                  ) : (
                    <>❌ غلط — الإجابة الصح: <span dir="ltr" className="inline-block"><FractionText text={cardNow.options[Number(cardNow.correctIndex)]} /></span></>
                  )}
                </motion.p>
              ) : null}
            </div>
          </motion.div>
        </AnimatePresence>

        {/* ✨ زرار المساعدة الذكية — دايرة بنفسجية ثابتة (زي الصورة) — فوق زرار «مساعد ذكي» العالمي عشان ما يتغطيش */}
        <button
          type="button"
          onClick={function () { askHint() }}
          disabled={!!feedback || hintLoading || !!hint}
          aria-label="مساعدة ذكية"
          title="تلميح ذكي ✨"
          className="fixed bottom-24 right-5 z-50 size-14 rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-600 text-white shadow-xl shadow-violet-500/30 grid place-items-center active:scale-95 transition-transform disabled:opacity-60"
        >
          {hintLoading ? <Loader2 className="size-6 animate-spin" /> : <Sparkles className="size-6" />}
        </button>
      </div>
    )
  }

  /* ===== end: ملخص النتيجة + اللوحة ===== */
  var top10End = board.slice(0, 10)
  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="bg-gradient-to-l from-violet-500 to-fuchsia-600 px-5 py-6 text-white text-center space-y-1">
          <p className="text-3xl">🎉</p>
          <h3 className="font-black text-xl">خلصت الجولة!</h3>
          <p className="text-5xl font-black pt-1" dir="ltr">{score}</p>
          <p className="text-sm text-violet-100 font-bold">نقطة</p>
        </div>
        <CardContent className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-center">
            <div className="rounded-xl bg-stone-50 dark:bg-stone-900/50 p-3">
              <p className="font-black text-lg" dir="ltr">{correctCount}/{cards.length || 10}</p>
              <p className="text-xs text-muted-foreground font-bold">إجابات صح</p>
            </div>
            <div className="rounded-xl bg-stone-50 dark:bg-stone-900/50 p-3">
              <p className="font-black text-lg flex items-center justify-center gap-1">
                <Flame className="size-4 text-orange-500" /><span dir="ltr">{bestStreak}</span>
              </p>
              <p className="text-xs text-muted-foreground font-bold">أطول ستريك</p>
            </div>
          </div>

          {submitting ? (
            <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1.5 font-bold">
              <Loader2 className="size-3.5 animate-spin" /> بيحفظ نتيجتك…
            </p>
          ) : null}

          <div className="rounded-2xl border p-3">
            <h4 className="font-black text-sm flex items-center gap-1.5 mb-2">
              <Trophy className="size-4 text-violet-500" /> لوحة الشرف
            </h4>
            {top10End.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-2 font-bold">{submitting ? 'بنجهز اللوحة…' : 'اللوحة فاضية لسه'}</p>
            ) : (
              <div className={SCROLL_CLS + ' space-y-1.5'}>
                {top10End.map(function (r) {
                  var isMeRow = myRowKey === (r.name + '|' + r.score)
                  return (
                    <div
                      key={r.rank + '-' + r.createdAt}
                      className={'flex items-center gap-2 rounded-xl px-3 py-2 ' +
                        (isMeRow
                          ? 'ring-2 ring-violet-400 bg-violet-50 dark:bg-violet-950/40 font-black'
                          : 'bg-stone-50 dark:bg-stone-900/50')}
                    >
                      <span className="w-8 text-center text-base shrink-0">
                        {rankMedal(r.rank) || <span dir="ltr" className="font-black text-sm text-muted-foreground">{r.rank}</span>}
                      </span>
                      <span className="flex-1 truncate text-sm font-bold">
                        {r.name}{isMeRow ? ' (انت)' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground font-bold shrink-0" dir="ltr">{r.correctCount}/{r.totalCards}</span>
                      <span className="font-black text-violet-600 shrink-0" dir="ltr">{r.score}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <Button
              onClick={function () { startRound() }}
              disabled={loadingRound}
              className="min-h-12 bg-gradient-to-l from-violet-500 to-fuchsia-600 text-white font-black"
            >
              {loadingRound ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />} جولة تانية 🔁
            </Button>
            <Button variant="outline" onClick={function () { setPhase('idle') }} className="min-h-12 font-black">
              <Trophy className="size-4" /> اللوحة الكاملة
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

/* ============================================================
 * المكون الرئيسي — التابات الثلاثة
 * ============================================================ */
export function BattleArena({ studentId, studentName, grade }: { studentId: string; studentName: string; grade: string }) {
  var [tab, setTab] = useState<'groups' | 'teacher' | 'flash'>('groups')

  var TABS: { id: 'groups' | 'teacher' | 'flash'; label: string; grad: string }[] = [
    { id: 'groups', label: '👥 تحدي الجروبات', grad: 'from-emerald-500 to-teal-600' },
    { id: 'teacher', label: '👨‍🏫 تحدي المستر', grad: 'from-amber-500 to-orange-600' },
    { id: 'flash', label: '⚡ فلاش كاردز', grad: 'from-violet-500 to-fuchsia-600' },
  ]

  return (
    <div dir="rtl" className="space-y-5">
      {/* الهيدر */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2.5">
          <span className="grid place-items-center size-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/20 shrink-0">
            <Swords className="size-6" />
          </span>
          <div>
            <h2 className="text-xl sm:text-2xl font-black leading-tight">⚔️ ساحة التحدي</h2>
            <p className="text-xs text-muted-foreground font-bold">اتسابق مع صحابك واكسب نقاط</p>
          </div>
        </div>
        {grade ? <Badge variant="outline" className="font-black shrink-0">{grade}</Badge> : null}
      </div>

      {/* التابات — حبوب كبيرة مناسبة للمس */}
      <div className="grid grid-cols-3 gap-1.5 p-1.5 rounded-2xl bg-stone-100 dark:bg-stone-900 border border-stone-200 dark:border-stone-800">
        {TABS.map(function (t) {
          var activeTab = tab === t.id
          return (
            <button
              key={t.id}
              onClick={function () { setTab(t.id) }}
              className={'relative min-h-12 rounded-xl font-black text-[11px] sm:text-sm flex items-center justify-center gap-1 px-1 transition-colors ' +
                (activeTab ? 'text-white' : 'text-stone-600 dark:text-stone-300 hover:text-stone-900 dark:hover:text-white')}
            >
              {activeTab ? (
                <motion.span
                  layoutId="arena-tab-pill"
                  transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                  className={'absolute inset-0 rounded-xl bg-gradient-to-l shadow-md ' + t.grad}
                />
              ) : null}
              <span className="relative z-10 whitespace-nowrap">{t.label}</span>
            </button>
          )
        })}
      </div>

      {/* المحتوى — انتقالات ناعمة بين الأوضاع */}
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.18 }}
        >
          {tab === 'groups' ? <GroupsMode studentId={studentId} studentName={studentName} /> : null}
          {tab === 'teacher' ? <TeacherMode studentId={studentId} studentName={studentName} /> : null}
          {tab === 'flash' ? <FlashcardsMode studentId={studentId} studentName={studentName} /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
