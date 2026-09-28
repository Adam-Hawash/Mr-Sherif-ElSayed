'use client'

// ============================================================
// (2026-و66) TeacherChallengePanel — إدارة «تحدي المستر» للأدمن
// ============================================================
// • GET /api/arena/challenges (بدون studentId) → {active, leaderboard, history}
//   ملاحظة: السيرفر بيخفي correctIndex عن الطلاب — الأدمن بيظهرها لو متاحة
//   في الاستجابة أو من آخر إنشاء محلي (knownCorrect).
// • إنشاء تحدي جديد (بيقفل النشط تلقائي على السيرفر) + قفل + دخول المستر
//   بنفسه + مسح دخول طالب + إعادة فتح/مسح من التاريخ.
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Database, FileText, Film, Flame, Loader2, Plus, RotateCcw, Swords, Timer, Trash2, Trophy, Upload, XCircle, Youtube } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { chunkedUpload } from '@/lib/chunked-upload'

const LETTERS = ['أ', 'ب', 'ج', 'د']
const MEDALS = ['🥇', '🥈', '🥉']

interface Challenge {
  id: string
  title: string
  question: string
  options: string[]
  points: number
  durationMin: number
  active: boolean
  closesAt: string | null
  createdAt: string
  correctIndex?: number
  /* (2026-و68-إضافي) فيديو المستر — بيرجع من السيرفر بس لو موجود فعلًا */
  videoUrl?: string
  videoType?: string
}

interface LeaderEntry {
  rank: number
  name: string
  isTeacher: boolean
  correct: boolean
  timeMs: number
  choice: number
  createdAt: string
}

interface HistItem {
  id: string
  title: string
  active: boolean
  points: number
  createdAt: string
}

function fmtDateTime(s: string | null): string {
  if (!s) return ''
  try {
    return new Date(s).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
  } catch (e) {
    return String(s).slice(0, 16)
  }
}

export function TeacherChallengePanel() {
  const [active, setActive] = useState<Challenge | null>(null)
  const [board, setBoard] = useState<LeaderEntry[]>([])
  const [history, setHistory] = useState<HistItem[]>([])
  const [loading, setLoading] = useState(true)
  const [knownCorrect, setKnownCorrect] = useState<Record<string, number>>({})

  /* فورم الإنشاء */
  const [fTitle, setFTitle] = useState('')
  const [fQuestion, setFQuestion] = useState('')
  const [fOpts, setFOpts] = useState<string[]>(['', '', '', ''])
  const [fCorrect, setFCorrect] = useState(0)
  const [fPoints, setFPoints] = useState('30')
  const [fDur, setFDur] = useState('0')

  /* (2026-و68-إضافي) فيديو المستر — يوتيوب أو ملف مرفوع (نفس الميكانيزم
     بتاع رفع فيديوهات المعرض/الدرس: chunkedUpload → /api/files/<id>) */
  const [fYoutube, setFYoutube] = useState('')
  const [fVideoFile, setFVideoFile] = useState<{ url: string; name: string } | null>(null)
  const [fVideoUploading, setFVideoUploading] = useState(false)
  const fVideoInputRef = useRef<HTMLInputElement>(null)

  /* اختيار ملف فيديو — رفع فوري بالأجزاء (2MB) زي باقي المنصة */
  const pickChallengeVideo = async function (file: File | null) {
    if (!file) return
    if (file.type && file.type.indexOf('video/') !== 0) {
      toast.error('لازم ملف فيديو (MP4/MOV…)')
      return
    }
    if (file.size > 150 * 1024 * 1024) {
      toast.error('الفيديو كبير أوي (الحد 150MB) — ارفعه على يوتيوب والصق اللينك')
      return
    }
    setFVideoUploading(true)
    try {
      const up = await chunkedUpload(file, 'videos', undefined, function () { /* التقديم داخلي */ })
      setFVideoFile({ url: String(up.filePath || ''), name: file.name })
      setFYoutube('')
      toast.success('الفيديو اترفع ✅ — متسيبش لينك يوتيوب في نفس الوقت')
    } catch (err: any) {
      toast.error(String((err && err.message) || 'فشل رفع الفيديو — جرب تاني'))
    } finally {
      setFVideoUploading(false)
      if (fVideoInputRef.current) fVideoInputRef.current.value = ''
    }
  }

  /* قرارات الفيديو النهائية لفورم الإنشاء أو الربط — حاجة واحدة بس */
  const resolveVideoPayload = function (): { videoUrl: string; videoType: string } | { error: string } {
    const yt = fYoutube.trim()
    if (yt && fVideoFile) return { error: 'اختار حاجة واحدة — لينك يوتيوب أو ملف مرفوع (امسح واحد منهم)' }
    if (yt) return { videoUrl: yt, videoType: 'youtube' }
    if (fVideoFile) return { videoUrl: fVideoFile.url, videoType: 'file' }
    return { videoUrl: '', videoType: '' }
  }

  const clearVideoFields = function () {
    setFYoutube('')
    setFVideoFile(null)
  }

  /* (2026-و68) بنك أسئلة التحدي + إعدادات الفلاش كاردز */
  const [bankCount, setBankCount] = useState(0)
  const [bankQs, setBankQs] = useState<Array<{ id: string; fileName: string; question: string; options: string[]; correctIndex: number; active: boolean }>>([])
  const [bankLoading, setBankLoading] = useState(true)
  const [bankUploading, setBankUploading] = useState(false)
  const [bankOpen, setBankOpen] = useState(false)
  const bankFileRef = useRef<HTMLInputElement>(null)
  const [fcSeconds, setFcSeconds] = useState('15')
  const [fcSaving, setFcSaving] = useState(false)
  const [bankBusy, setBankBusy] = useState('')
  /* (و70-ج) كروت الفلاش بتاعة المستر — تحدي على اللي احنا بنحطه */
  const [deckCards, setDeckCards] = useState<Array<{ id: string; front: string; back: string; active: boolean }>>([])
  const [deckOpen, setDeckOpen] = useState(false)
  const [deckFront, setDeckFront] = useState('')
  const [deckBack, setDeckBack] = useState('')
  const [deckBulk, setDeckBulk] = useState('')
  const [deckBulkOpen, setDeckBulkOpen] = useState(false)
  const [deckBusy, setDeckBusy] = useState('')

  const loadBank = useCallback(async function () {
    try {
      const res = await fetch('/api/arena/challenges/bank?mode=list')
      const data = await res.json()
      if (res.ok && data.ok) {
        setBankQs((data.questions || []).slice(0, 100))
        setBankCount(Number(data.count || 0))
      }
    } catch (e) { /* شبكة */ } finally {
      setBankLoading(false)
    }
  }, [])

  const loadFcSeconds = useCallback(async function () {
    try {
      const res = await fetch('/api/arena/flashcards?mode=settings')
      const data = await res.json()
      if (res.ok && data.ok) setFcSeconds(String(Number(data.seconds) || 15))
    } catch (e) { /* شبكة */ }
  }, [])

  useEffect(function () {
    loadBank()
    loadFcSeconds()
  }, [loadBank, loadFcSeconds])

  /* رفع ملف للبنك — PDF أو صورة → استخراج إنجليزي */
  const uploadBankFile = async function (f: File | null) {
    if (!f) return
    setBankUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', f)
      const res = await fetch('/api/arena/challenges/bank', { method: 'POST', body: fd })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتضاف ' + String(data.added || 0) + ' سؤال من «' + String(data.fileName || f.name) + '» — البنك بقى ' + String(data.bankCount || 0) + ' سؤال 🎯')
        await loadBank()
      } else {
        toast.error(String((data && data.error) || 'فشل رفع الملف — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBankUploading(false)
      if (bankFileRef.current) bankFileRef.current.value = ''
    }
  }

  const bankAction = async function (payload: Record<string, unknown>, msg: string) {
    setBankBusy(String(payload.id || payload.action || 'x'))
    try {
      const res = await fetch('/api/arena/challenges/bank', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success(msg)
        await loadBank()
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال')
    } finally {
      setBankBusy('')
    }
  }

  const saveFcSeconds = async function () {
    const n = Math.round(Number(fcSeconds) || 0)
    if (!(n >= 5 && n <= 90)) {
      toast.error('المدة لازم تكون من 5 لـ 90 ثانية')
      return
    }
    setFcSaving(true)
    try {
      const res = await fetch('/api/arena/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'setTime', seconds: n }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('بقت مدة الفلاش كاردز ' + String(n) + ' ثانية ⚡')
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال')
    } finally {
      setFcSaving(false)
    }
  }

  /* (و70-ج) تحميل قايمة كروت المستر */
  const loadDeck = useCallback(async function () {
    try {
      const res = await fetch('/api/arena/flashcards?mode=deck')
      const d = await res.json()
      if (res.ok && d.ok) setDeckCards(d.cards || [])
    } catch (e) { /* شبكة */ }
  }, [])

  useEffect(function () {
    loadDeck()
  }, [loadDeck])

  const deckAction = async function (payload: Record<string, unknown>, msg: string) {
    setDeckBusy(String(payload.id || payload.action || 'x'))
    try {
      const res = await fetch('/api/arena/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const d = await res.json().catch(function () { return null })
      if (res.ok && d && d.ok) {
        toast.success(msg)
        await loadDeck()
      } else {
        toast.error(String((d && d.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال')
    } finally {
      setDeckBusy('')
    }
  }

  const addDeckCard = async function () {
    if (!deckFront.trim() || !deckBack.trim()) {
      toast.error('اكتب الأمام (السؤال) والظهر (الإجابة)')
      return
    }
    await deckAction({ action: 'addCard', front: deckFront, back: deckBack }, 'الكارت اتضاف ✅')
    setDeckFront('')
    setDeckBack('')
  }

  const addBulkCards = async function () {
    if (!deckBulk.trim()) {
      toast.error('اكتب الكروت — كل سطر: السؤال | الإجابة')
      return
    }
    setDeckBusy('bulk')
    try {
      const res = await fetch('/api/arena/flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'bulkCards', text: deckBulk }),
      })
      const d = await res.json().catch(function () { return null })
      if (res.ok && d && d.ok) {
        toast.success('اتضاف ' + String(d.added || 0) + ' كارت ✅')
        setDeckBulk('')
        setDeckBulkOpen(false)
        await loadDeck()
      } else {
        toast.error(String((d && d.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال')
    } finally {
      setDeckBusy('')
    }
  }

  /* مفتاح العملية الشغالة (create | close | join | entry:{rank} | reopen:{id} | del:{id}) */
  const [busy, setBusy] = useState('')

  const load = useCallback(async function () {
    try {
      const res = await fetch('/api/arena/challenges')
      const data = await res.json()
      if (res.ok && data.ok) {
        setActive((data.active || null) as Challenge | null)
        setBoard((data.leaderboard || []) as LeaderEntry[])
        setHistory((data.history || []) as HistItem[])
      } else {
        toast.error(String(data.error || 'مشكلة في تحميل التحدي'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setLoading(false)
  }, [])

  useEffect(function () {
    // (2026-و66) تحميل أولي — الفيتش async (كل setState بعد await)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load()
  }, [load])

  /* POST عام لأفعال الأدمن + رسالة نجاح اختيارية — بيرجع بيانات الاستجابة لو نجحت */
  const post = async function (payload: Record<string, unknown>, successMsg?: string): Promise<any | null> {
    try {
      const res = await fetch('/api/arena/challenges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      let data: any = {}
      try { data = await res.json() } catch (e) { /* استجابة فاضية */ }
      if (res.ok && data.ok) {
        if (successMsg) toast.success(successMsg)
        await load()
        return data
      }
      toast.error(String(data.error || 'حصلت مشكلة — جرب تاني'))
      return null
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
      return null
    }
  }

  /* ===== إنشاء تحدي جديد ===== */
  const create = async function () {
    const title = fTitle.trim()
    const question = fQuestion.trim()
    const filled = fOpts.map(function (o) { return o.trim() })
    const filledCount = filled.filter(function (o) { return o }).length
    if (!title || !question) {
      toast.error('اكتب عنوان وسؤال التحدي')
      return
    }
    if (filledCount < 2) {
      toast.error('لازم اختيارين على الأقل مش فاضيين')
      return
    }
    if (!filled[fCorrect]) {
      toast.error('اختار الإجابة الصح من الاختيارات المكتوبة')
      return
    }
    // السيرفر بيرفض الاختيارات الفاضية — نبعت المليانة بس ونظبط رقم الصح
    const payloadOpts: string[] = []
    let payloadCorrect = 0
    for (let i = 0; i < filled.length; i++) {
      if (!filled[i]) continue
      if (i === fCorrect) payloadCorrect = payloadOpts.length
      payloadOpts.push(filled[i])
    }
    // (2026-و68-إضافي) فيديو المستر — يوتيوب أو ملف مرفوع (حاجة واحدة بس)
    const video = resolveVideoPayload()
    if ('error' in video) {
      toast.error(video.error)
      return
    }
    setBusy('create')
    const resp = await post(
      {
        action: 'create',
        title: title,
        question: question,
        options: payloadOpts,
        correctIndex: payloadCorrect,
        points: Number(fPoints) || 30,
        durationMin: Number(fDur) || 0,
        videoUrl: video.videoUrl || undefined,
        videoType: video.videoType || undefined,
      },
      'نزل التحدي! التحدي القديم اتقفل تلقائي 🎯'
    )
    if (resp) {
      // نخزن الإجابة الصح للتحدي الجديد محليًا — عشان الهايلايت يظهر فورًا
      // (السيرفر بيرجع id الجديد، وcorrectIndex مش بيبعتها في GET عشان الطالب)
      if (resp.id) {
        setKnownCorrect(function (prev) {
          const next = Object.assign({}, prev)
          next[String(resp.id)] = payloadCorrect
          return next
        })
      }
      setFTitle('')
      setFQuestion('')
      setFOpts(['', '', '', ''])
      setFCorrect(0)
      setFPoints('30')
      setFDur('0')
      clearVideoFields()
    }
    setBusy('')
  }

  /* ===== أفعال التحدي النشط ===== */
  const closeActive = async function () {
    if (!active) return
    setBusy('close')
    await post({ action: 'close', id: active.id }, 'اتقفل التحدي ✋')
    setBusy('')
  }

  /* ===== (2026-و68-إضافي) ربط/تحديث/شيل فيديو التحدي الشغلان ===== */
  const applyActiveVideo = async function () {
    if (!active) return
    const video = resolveVideoPayload()
    if ('error' in video) {
      toast.error(video.error)
      return
    }
    setBusy('setVideo')
    await post(
      { action: 'setVideo', id: active.id, videoUrl: video.videoUrl, videoType: video.videoType },
      video.videoUrl ? 'الفيديو اتربط بالتحدي 🎬 — هيثبت فوق السؤال عند الطلاب' : 'الفيديو اتشال من التحدي'
    )
    setBusy('')
  }

  const removeActiveVideo = async function () {
    if (!active) return
    setBusy('setVideo')
    await post({ action: 'setVideo', id: active.id, videoUrl: '', videoType: '' }, 'الفيديو اتشال من التحدي')
    setBusy('')
  }

  const teacherJoin = async function () {
    if (!active) return
    setBusy('join')
    await post({ action: 'teacherJoin', id: active.id }, 'نزلت في التحدي! 👨‍🏫')
    setBusy('')
  }

  /* ===== مسح دخول طالب من لوحة الترتيب ===== */
  const deleteEntry = async function (en: LeaderEntry) {
    // (2026-و66) ملاحظة: لو نسخة السيرفر مش بتبعت id في لوحة الترتيب
    // مش هنعرف تمسح — لما الـ id يتضاف هيشتغل من غير أي تعديل
    const entryId = String((en as any).id || '')
    if (!entryId) {
      toast.error('السيرفر مش بيبعت معرف الدخول — مش هنعرف نمسحه من هنا')
      return
    }
    setBusy('entry:' + en.rank)
    await post({ action: 'deleteEntry', entryId: entryId }, 'اتشال الدخول')
    setBusy('')
  }

  /* ===== أفعال التاريخ ===== */
  const reopen = async function (h: HistItem) {
    if (!window.confirm('إعادة فتح «' + h.title + '» هتقفل التحدي النشط الحالي — تكمل؟')) return
    setBusy('reopen:' + h.id)
    await post({ action: 'reopen', id: h.id }, 'اتفتح التحدي تاني 🔁')
    setBusy('')
  }

  const removeHist = async function (h: HistItem) {
    if (!window.confirm('متأكد من مسح «' + h.title + '»؟ هتمسح كل دخولات الطلبة معاه')) return
    setBusy('del:' + h.id)
    await post({ action: 'delete', id: h.id }, 'اتمسح التحدي')
    setBusy('')
  }

  /* رقم الإجابة الصح اللي الأدمن يشوفه (لو متاح) */
  const getCorrectIndex = function (ch: Challenge): number {
    if (typeof ch.correctIndex === 'number') return ch.correctIndex
    if (knownCorrect[ch.id] !== undefined) return knownCorrect[ch.id]
    return -1
  }

  if (loading) {
    return (
      <Card dir="rtl">
        <CardContent className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          بنحمّل تحدي المستر…
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ============ (2026-و68) بنك أسئلة التحدي + الفلاش كاردز ============ */}
      <Card className="border-violet-300 dark:border-violet-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-violet-600" />
            🎯 بنك أسئلة التحدي — من ملفاتك (بالإنجليزي)
            <Badge variant="outline" className="font-black" dir="ltr">{bankCount}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            ارفع ملف (PDF أو صورة) فيه أسئلة — المنصة هتستخرج الأسئلة <b>بالإنجليزي</b> تلقائيًا،
            والطالب أول ما يخش «تحدي المستر» هياخد <b>10 أسئلة عشوائية من كل الملفات</b> كل جولة.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={bankFileRef}
              type="file"
              accept=".pdf,image/*"
              className="hidden"
              onChange={function (e) { uploadBankFile(e.target.files && e.target.files[0]) }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <Button
              type="button"
              onClick={function () { bankFileRef.current?.click() }}
              disabled={bankUploading}
              className="min-h-11 gap-2 bg-gradient-to-l from-violet-600 to-fuchsia-600 font-black text-white"
            >
              {bankUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {bankUploading ? 'بيستخرج الأسئلة… (من 10 لـ 60 ث)' : 'ارفع ملف أسئلة (PDF / صورة)'}
            </Button>
            {bankCount > 0 ? (
              <Button
                type="button"
                variant="outline"
                onClick={function () { setBankOpen(function (v) { return !v }) }}
                className="min-h-11 gap-2 font-bold"
              >
                <FileText className="h-4 w-4" />
                {bankOpen ? 'اخفي الأسئلة' : 'شوف الأسئلة'}
              </Button>
            ) : null}
            {bankCount > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={bankBusy === 'clearAll'}
                onClick={function () { if (window.confirm('متأكد إنك عايز تمسح كل أسئلة البنك؟')) bankAction({ action: 'clearAll' }, 'البنك اتمسح خلاص') }}
                className="min-h-11 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              >
                {bankBusy === 'clearAll' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                امسح الكل
              </Button>
            ) : null}
          </div>

          {bankOpen && bankCount > 0 ? (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-2">
              {bankLoading ? (
                <p className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> بنحمّل…</p>
              ) : (
                bankQs.map(function (q) {
                  return (
                    <div key={q.id} className="rounded-lg border bg-card p-3">
                      <div className="flex items-start gap-2">
                        <Badge variant="outline" className="shrink-0 text-[10px]" dir="ltr">{q.options[q.correctIndex] || '—'}</Badge>
                        <p dir="ltr" className="min-w-0 flex-1 text-left text-sm font-bold leading-relaxed break-words">{q.question}</p>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            title={q.active ? 'إخفاء من الطالب' : 'تفعيل تاني'}
                            onClick={function () { bankAction({ action: 'toggle', id: q.id, active: !q.active }, q.active ? 'اتخفى السؤال' : 'اتفع السؤال') }}
                            className={'flex h-7 w-7 items-center justify-center rounded-full ' + (q.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-stone-500/15 text-stone-500')}
                          >
                            {q.active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                          </button>
                          <button
                            type="button"
                            title="مسح السؤال"
                            onClick={function () { bankAction({ action: 'delete', id: q.id }, 'اتمسح السؤال') }}
                            className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"
                          >
                            {bankBusy === q.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                          </button>
                        </div>
                      </div>
                      <p className="mt-1 text-[10px] text-muted-foreground" dir="ltr">📎 {q.fileName || '—'}</p>
                    </div>
                  )
                })
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card className="border-amber-300 dark:border-amber-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Timer className="h-5 w-5 text-amber-600" />
            ⚡ فلاش كاردز — مدة البطاقة
            <Badge variant="outline" className="font-black" dir="ltr">{fcSeconds}s</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            حدد كام ثانية للطالب يشوف كل بطاقة في تحدي الفلاش كاردز (من 5 لـ 90 — الافتراضي 15 ثانية).
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              type="number"
              min={5}
              max={90}
              value={fcSeconds}
              onChange={function (e) { setFcSeconds(e.target.value) }}
              className="h-11 w-28 text-center font-black"
              dir="ltr"
            />
            <Button
              type="button"
              onClick={saveFcSeconds}
              disabled={fcSaving}
              className="min-h-11 gap-2 bg-gradient-to-l from-amber-500 to-orange-600 font-black text-white"
            >
              {fcSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              احفظ المدة
            </Button>
            <div className="flex items-center gap-1.5">
              {[10, 15, 20, 30].map(function (s) {
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={function () { setFcSeconds(String(s)) }}
                    className={'h-9 rounded-full border px-3 text-xs font-black transition-colors ' + (Number(fcSeconds) === s ? 'border-amber-500 bg-amber-500/15 text-amber-700 dark:text-amber-300' : 'text-muted-foreground hover:border-amber-400')}
                    dir="ltr"
                  >
                    {s}s
                  </button>
                )
              })}
            </div>
          </div>
        </CardContent>
      </Card>
      {/* ============ (و70-ج) كروت الفلاش بتاعة المستر — تحدي على اللي احنا بنحطه ============ */}
      <Card className="border-violet-300 dark:border-violet-800">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Database className="h-5 w-5 text-fuchsia-600" />
            ⚡ كروت الفلاش بتاعتك — تحدي على محتواك (بالإنجليزي)
            <Badge variant="outline" className="font-black" dir="ltr">{deckCards.filter(function (c) { return c.active }).length}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed text-muted-foreground">
            حط كروت (سؤال ← إجابة) من اللي بتحطه في المنصة — أول ما يكون فيه <b>4 كروت نشطة</b>،
            تحدي «⚡ فلاش كاردز» عند الطلاب هيبقى <b>على كروتك بالإنجليزي</b> بنفس المدة اللي فوق
            ولوحة الشرف. لو مفيش كروت، الطالب بياخد تدريب سريع مولّد تلقائي.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-black text-muted-foreground">الأمام — السؤال (Front)</label>
              <Input
                value={deckFront}
                onChange={function (e) { setDeckFront(e.target.value) }}
                placeholder="What is 7 × 8?"
                className="min-h-11"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-black text-muted-foreground">الظهر — الإجابة (Back)</label>
              <Input
                value={deckBack}
                onChange={function (e) { setDeckBack(e.target.value) }}
                placeholder="56"
                className="min-h-11"
                dir="ltr"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              onClick={addDeckCard}
              disabled={deckBusy === 'addCard'}
              className="min-h-11 gap-2 bg-gradient-to-l from-fuchsia-600 to-violet-600 font-black text-white"
            >
              {deckBusy === 'addCard' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              ضيف كارت
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={function () { setDeckBulkOpen(function (v) { return !v }) }}
              className="min-h-11 gap-2 font-bold"
            >
              <FileText className="h-4 w-4" />
              لزق كروت كتير
            </Button>
            {deckCards.length > 0 ? (
              <Button type="button" variant="outline" onClick={function () { setDeckOpen(function (v) { return !v }) }} className="min-h-11 gap-2 font-bold">
                {deckOpen ? 'اخفي الكروت' : 'شوف الكروت'} ({deckCards.length})
              </Button>
            ) : null}
            {deckCards.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                disabled={deckBusy === 'clearDeck'}
                onClick={function () { if (window.confirm('متأكد إنك عايز تمسح كل الكروت؟')) deckAction({ action: 'clearDeck' }, 'كل الكروت اتمسحت') }}
                className="min-h-11 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
              >
                {deckBusy === 'clearDeck' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                امسح الكل
              </Button>
            ) : null}
          </div>

          {deckBulkOpen ? (
            <div className="space-y-2 rounded-xl border bg-muted/30 p-3">
              <p className="text-xs font-bold text-muted-foreground">كل سطر كارت واحد — السؤال ثم علامة | ثم الإجابة:</p>
              <Textarea
                value={deckBulk}
                onChange={function (e) { setDeckBulk(e.target.value) }}
                placeholder={'What is 7 × 8? | 56\nWhat is the square root of 81? | 9\nSolve: 2x + 3 = 11 | x = 4'}
                rows={6}
                dir="ltr"
                className="font-mono text-left"
              />
              <Button type="button" onClick={addBulkCards} disabled={deckBusy === 'bulkCards'} className="min-h-11 gap-2 bg-gradient-to-l from-fuchsia-600 to-violet-600 font-black text-white">
                {deckBusy === 'bulkCards' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                ضيف كل السطور
              </Button>
            </div>
          ) : null}

          {deckOpen && deckCards.length > 0 ? (
            <div className="max-h-96 space-y-2 overflow-y-auto rounded-xl border bg-muted/30 p-2">
              {deckCards.map(function (c) {
                return (
                  <div key={c.id} className="rounded-lg border bg-card p-3">
                    <div className="flex items-start gap-2" dir="ltr">
                      <p className="min-w-0 flex-1 text-left text-sm font-bold leading-relaxed break-words">{c.front}</p>
                      <Badge variant="outline" className="shrink-0 font-black" dir="ltr">{c.back}</Badge>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          title={c.active ? 'إخفاء الكارت' : 'تفعيل تاني'}
                          onClick={function () { deckAction({ action: 'toggleCard', id: c.id, active: !c.active }, c.active ? 'الكارت اتخفى' : 'الكارت اتفعل') }}
                          className={'flex h-7 w-7 items-center justify-center rounded-full ' + (c.active ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-stone-500/15 text-stone-500')}
                        >
                          {c.active ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                        </button>
                        <button
                          type="button"
                          title="مسح الكارت"
                          onClick={function () { deckAction({ action: 'deleteCard', id: c.id }, 'الكارت اتمسح') }}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-red-500/15 text-red-600 dark:text-red-400"
                        >
                          {deckBusy === c.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          ) : null}
        </CardContent>
      </Card>

      {/* ============ الفورم: نزّل تحدي جديد ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Swords className="h-5 w-5 text-amber-600" />
            ➕ نزّل تحدي جديد
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="mb-1.5 block text-sm font-medium">عنوان التحدي</label>
            <Input
              value={fTitle}
              onChange={function (e) { setFTitle(e.target.value) }}
              placeholder="مثال: تحدي الأسبوع — معادلة ذكية"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-medium">السؤال</label>
            <Textarea
              rows={3}
              value={fQuestion}
              onChange={function (e) { setFQuestion(e.target.value) }}
              placeholder="اكتب السؤال الصعب هنا…"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium">الاختيارات — علّم على الصح ✅</label>
            {fOpts.map(function (o, i) {
              return (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">{LETTERS[i]}</span>
                  <Input
                    value={o}
                    onChange={function (e) {
                      const next = fOpts.slice()
                      next[i] = e.target.value
                      setFOpts(next)
                    }}
                    placeholder={i < 2 ? 'اختيار ' + LETTERS[i] + ' (مطلوب)' : 'اختيار ' + LETTERS[i] + ' (اختياري)'}
                  />
                  <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                    <input
                      type="radio"
                      name="tc-correct"
                      className="accent-emerald-600"
                      checked={fCorrect === i}
                      onChange={function () { setFCorrect(i) }}
                    />
                    الصح
                  </label>
                </div>
              )
            })}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">النقاط</label>
              <Input
                type="number"
                min={10}
                max={200}
                value={fPoints}
                onChange={function (e) { setFPoints(e.target.value) }}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">المدة بالدقايق</label>
              <Input
                type="number"
                min={0}
                value={fDur}
                onChange={function (e) { setFDur(e.target.value) }}
              />
              <p className="mt-1 text-[11px] text-muted-foreground">0 = مفتوح لحد ما تقفله بنفسك</p>
            </div>
          </div>

          {/* ===== (2026-و68-إضافي) فيديو المستر — يوتيوب أو ملف مرفوع ===== */}
          <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm font-bold">
                <Youtube className="h-4 w-4 text-red-600" />
                فيديو التحدي (اختياري)
              </label>
              {fVideoFile ? (
                <Badge variant="outline" className="text-[10px] font-bold" dir="ltr">📎 {fVideoFile.name.slice(0, 28)}</Badge>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground">
              صوّر فيديو وابعته للطلاب: الصق لينك يوتيوب <b>أو</b> ارفع ملف فيديو — هيظهر فوق السؤال في تحدي المستر.
            </p>
            <Input
              value={fYoutube}
              onChange={function (e) { setFYoutube(e.target.value); if (e.target.value.trim()) setFVideoFile(null) }}
              placeholder="https://www.youtube.com/watch?v=..."
              dir="ltr"
              className="text-left text-sm"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={fVideoInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={function (e) { pickChallengeVideo(e.target.files && e.target.files[0]) }}
                aria-hidden="true"
                tabIndex={-1}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={fVideoUploading}
                onClick={function () { fVideoInputRef.current?.click() }}
                className="min-h-9 gap-1.5"
              >
                {fVideoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                {fVideoUploading ? 'بينرفع…' : 'ارفع ملف فيديو'}
              </Button>
              {fYoutube.trim() || fVideoFile ? (
                <Button type="button" variant="ghost" size="sm" onClick={clearVideoFields} className="min-h-9 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400">
                  <Trash2 className="h-3.5 w-3.5" />
                  شيل الفيديو
                </Button>
              ) : null}
            </div>
          </div>

          <Button
            onClick={create}
            disabled={busy === 'create'}
            className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto"
          >
            {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Swords className="h-4 w-4" />}
            نزّل التحدي
          </Button>
          <p className="text-[11px] text-muted-foreground">
                ملاحظة: تنزيل تحدي جديد بيقفل التحدي الشغال تلقائي — والطالب اللي جاوب قبل كده مش هيتأثر
          </p>
        </CardContent>
      </Card>

      {/* ============ التحدي النشط ============ */}
      {active ? (
        <Card className="overflow-hidden p-0">
          {/* هيدر أمبر متدرج */}
          <div className="bg-gradient-to-l from-amber-500 via-orange-500 to-amber-600 px-4 py-3 text-white">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-bold">
                <Flame className="h-4 w-4" />
                {active.title}
              </h3>
              <div className="flex items-center gap-1.5">
                <Badge className="border-white/30 bg-white/20 text-white">{active.points} نقطة</Badge>
                <Badge className="border-white/30 bg-white/20 text-white">
                  {active.closesAt ? '⏳ لحد ' + fmtDateTime(active.closesAt) : '♾️ مفتوح'}
                </Badge>
              </div>
            </div>
          </div>
          <CardContent className="space-y-3 pt-4">
            <p className="whitespace-pre-wrap text-sm font-medium leading-relaxed">{active.question}</p>

            {/* ===== (2026-و68-إضافي) فيديو التحدي الشغلان — ربط/تحديث/شيل ===== */}
            <div className="rounded-xl border bg-muted/30 p-3 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-1.5 text-sm font-bold">
                  <Youtube className="h-4 w-4 text-red-600" />
                  فيديو التحدي
                </label>
                {active.videoUrl ? (
                  <Badge className="border-0 bg-emerald-500/15 text-[10px] font-black text-emerald-700 dark:text-emerald-300">متصل بالتحدي ✅</Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px] font-bold text-muted-foreground">مفيش فيديو</Badge>
                )}
              </div>
              {active.videoUrl && active.videoType === 'youtube' ? (
                <div className="overflow-hidden rounded-lg border bg-black" dir="ltr">
                  <iframe
                    src={'https://www.youtube.com/embed/' + (active.videoUrl.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/)?.[1] || '') + '?modestbranding=1&rel=0&playsinline=1'}
                    title="فيديو التحدي"
                    className="aspect-video w-full"
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                    allowFullScreen
                  />
                </div>
              ) : null}
              {active.videoUrl && active.videoType === 'file' ? (
                <video src={active.videoUrl} controls playsInline preload="metadata" className="w-full rounded-lg border bg-black" />
              ) : null}
              <Input
                value={fYoutube}
                onChange={function (e) { setFYoutube(e.target.value); if (e.target.value.trim()) setFVideoFile(null) }}
                placeholder="لينك يوتيوب جديد (اختياري)…"
                dir="ltr"
                className="text-left text-sm"
              />
              <div className="flex flex-wrap items-center gap-2">
                <input
                  ref={fVideoInputRef}
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={function (e) { pickChallengeVideo(e.target.files && e.target.files[0]) }}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={fVideoUploading}
                  onClick={function () { fVideoInputRef.current?.click() }}
                  className="min-h-9 gap-1.5"
                >
                  {fVideoUploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Film className="h-3.5 w-3.5" />}
                  {fVideoUploading ? 'بينرفع…' : 'ارفع ملف فيديو'}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={busy === 'setVideo' || (!fYoutube.trim() && !fVideoFile)}
                  onClick={applyActiveVideo}
                  className="min-h-9 gap-1.5 bg-red-600 text-white hover:bg-red-700"
                >
                  {busy === 'setVideo' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Youtube className="h-3.5 w-3.5" />}
                  {active.videoUrl ? 'حدّث الفيديو' : 'اربط الفيديو بالتحدي'}
                </Button>
                {active.videoUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy === 'setVideo'}
                    onClick={removeActiveVideo}
                    className="min-h-9 gap-1.5 text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    شيل الفيديو من التحدي
                  </Button>
                ) : null}
              </div>
            </div>

            {/* الاختيارات — الصح متعلّم بالأخضر للأدمن */}
            <div className="space-y-1.5">
              {(Array.isArray(active.options) ? active.options : []).map(function (o, i) {
                const isCorrect = i === getCorrectIndex(active as Challenge)
                return (
                  <div
                    key={i}
                    className={
                      'flex items-center gap-2 rounded-lg border px-3 py-2 text-sm ' +
                      (isCorrect
                        ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200'
                        : 'border-border bg-card text-card-foreground')
                    }
                  >
                    <span className="w-4 shrink-0 text-center text-xs font-bold text-muted-foreground">{LETTERS[i]}</span>
                    <span className="flex-1">{o}</span>
                    {isCorrect ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : null}
                  </div>
                )
              })}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={closeActive}
                disabled={busy === 'close'}
                className="gap-1"
              >
                {busy === 'close' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <XCircle className="h-3.5 w-3.5 text-rose-600" />}
                قفل التحدي
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={teacherJoin}
                disabled={busy === 'join'}
                className="gap-1"
              >
                {busy === 'join' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trophy className="h-3.5 w-3.5 text-amber-600" />}
                ادخل التحدي بنفسك 👨‍🏫
              </Button>
            </div>

            {/* لوحة الترتيب */}
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center gap-1.5 text-sm font-bold">
                <Trophy className="h-4 w-4 text-amber-600" />
                لوحة الترتيب
                <span className="text-[11px] font-normal text-muted-foreground">(الصح الأول = الأسرع)</span>
              </div>
              {board.length === 0 ? (
                <p className="py-3 text-center text-xs text-muted-foreground">لسه حدش جاوب — شوف مين هيوصل الأول 👀</p>
              ) : (
                <div className="max-h-72 space-y-1.5 overflow-y-auto pl-1">
                  {board.map(function (en) {
                    return (
                      <div
                        key={en.rank + '-' + en.createdAt}
                        className="flex items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm"
                      >
                        <span className="w-7 shrink-0 text-center">{en.rank <= 3 ? MEDALS[en.rank - 1] : '#' + en.rank}</span>
                        <span className="min-w-0 flex-1 truncate font-medium">
                          {en.name}
                          {en.isTeacher ? (
                            <Badge variant="secondary" className="mr-1.5 text-[9px]">
                              👨‍🏫 المستر
                            </Badge>
                          ) : null}
                        </span>
                        {en.correct ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                        ) : (
                          <XCircle className="h-4 w-4 shrink-0 text-rose-500" />
                        )}
                        <span className="w-12 shrink-0 text-left text-[11px] text-muted-foreground" dir="ltr">
                          {en.correct ? (en.timeMs / 1000).toFixed(1) + 's' : '—'}
                        </span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-rose-600"
                          onClick={function () { deleteEntry(en) }}
                          disabled={busy === 'entry:' + en.rank}
                          aria-label="شيل الدخول"
                          title="شيل الدخول ده"
                        >
                          {busy === 'entry:' + en.rank ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Trash2 className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            مفيش تحدي شغال دلوقتي — نزّل واحد من فوق وهيتعرض هنا 🎯
          </CardContent>
        </Card>
      )}

      {/* ============ التاريخ ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">📜 تحديات قديمة</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">مفيش تحديات قديمة</p>
          ) : (
            <div className="max-h-72 space-y-2 overflow-y-auto pl-1">
              {history.map(function (h) {
                return (
                  <div key={h.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{h.title}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {fmtDateTime(h.createdAt)} · {h.points} نقطة
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={function () { reopen(h) }}
                        disabled={busy === 'reopen:' + h.id}
                      >
                        {busy === 'reopen:' + h.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        إعادة فتح
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                        onClick={function () { removeHist(h) }}
                        disabled={busy === 'del:' + h.id}
                        aria-label="مسح"
                        title="مسح"
                      >
                        {busy === 'del:' + h.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
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
