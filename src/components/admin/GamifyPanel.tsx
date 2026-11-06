'use client'

// ============================================================
// (2026-غ1) GamifyPanel — نظام الجوائز والتحدي للأدمن
// ============================================================
// • تاب 1 «التحدي اليومي»: إدارة سلاسل الأسئلة (إنشاء/نشر/إيقاف/تعديل/حذف)
//   + استخراج أسئلة من ملف PDF/صورة بالذكاء الاصطناعي + إضافة يدوية
//   + جدول الأسئلة موزع على أيام السلسلة مع تعديل سريع (XP / اليوم)
//   الحفظ بيستبدل أسئلة الأيام الموجودة في القايمة بس — الباقي زي ما هو
// • تاب 2 «الشارات»: إضافة/تعديل/حذف شارات الطلاب + شروط الفتح
//   (شارة «المقامر الشجاع» اتحذفت من النظام نهائيًا بطلب المستر)
// • تاب 3 «لوحة الترتيب»: معاينة النقاط الدراسية و XP + تصفير اللوحة
//   الدراسية (تدميرية — بتاخد تأكيد) + تنبيه جماعي للطلاب اللي ما حلّوش
// ============================================================
// APIs:
//   GET/POST/PUT /api/gamify/admin/series        — السلاسل والأسئلة
//   GET/POST/PUT/DELETE /api/gamify/admin/badges — الشارات
//   GET/POST /api/gamify/admin/reset-leaderboard — معاينة/تصفير اللوحة
//   POST /api/gamify/admin/nag                   — تنبيه الحل الجماعي
//   POST /api/ai/extract-questions               — استخراج أسئلة من ملف (ممكن ياخد 60 ثانية)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AlertTriangle, CheckCircle2, Crown, FileText, GraduationCap, Loader2,
  Medal, Pencil, Plus, RefreshCw, Send, Sparkles, Trash2, Trophy, Upload, Zap,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { GRADES } from '@/stores/app-store'

const LETTERS = ['أ', 'ب', 'ج', 'د']
const MEDALS = ['🥇', '🥈', '🥉']

/* مستويات السؤال */
const DIFFICULTIES = [
  { value: 'easy', label: 'سهل' },
  { value: 'normal', label: 'عادي' },
  { value: 'hard', label: 'صعب' },
]
function diffLabel(d: string): string {
  for (let i = 0; i < DIFFICULTIES.length; i++) {
    if (DIFFICULTIES[i].value === d) return DIFFICULTIES[i].label
  }
  return 'عادي'
}

/* شروط فتح الشارات — نصوص مقروءة بالعربي */
const CONDITION_LABELS: Record<string, string> = {
  streak_days: 'أيام ستريك متتالية ≥',
  accuracy: 'دقة التحدي % ≥ (على 15 محاولة+)',
  homework_speed: 'تسليم واجب بدرجة 70%+ خلال أول (ساعة)',
  xp_total: 'مجموع XP ≥',
  challenge_days: 'أيام تحدي مكتملة ≥',
}
function condLabel(t: string): string {
  return CONDITION_LABELS[t] || t
}

/* ندرة الشارة — لون + اسم */
const RARITIES = [
  { value: 'common', label: 'عادية', cls: 'bg-slate-500/15 text-slate-600 dark:text-slate-300' },
  { value: 'rare', label: 'نادرة', cls: 'bg-violet-500/15 text-violet-600 dark:text-violet-300' },
  { value: 'legendary', label: 'أسطورية', cls: 'bg-amber-500/15 text-amber-700 dark:text-amber-300' },
]
function rarityMeta(r: string): { label: string; cls: string } {
  for (let i = 0; i < RARITIES.length; i++) {
    if (RARITIES[i].value === r) return { label: RARITIES[i].label, cls: RARITIES[i].cls }
  }
  return { label: 'عادية', cls: RARITIES[0].cls }
}

/* ===== أنواع البيانات ===== */
interface SeriesQuestion {
  id?: string
  dayNumber: number
  text: string
  options: string[]
  correctIndex: number
  correctText: string
  xpReward: number
  difficulty: string
}

interface SeriesItem {
  id: string
  grade: string
  title: string
  totalDays: number
  prize: string
  active: boolean
  createdAt: string
  questionCount: number
  perDay: Record<string, number>
  questions: SeriesQuestion[]
}

interface BadgeItem {
  id: string
  name: string
  desc: string
  icon: string
  rarity: string
  conditionType: string
  threshold: number
  active: boolean
  sort: number
}

interface AcademicRow { name: string; grade: string; totalPoints: number }
interface XpRow { name: string; grade: string; xp: number; streak: number; bestStreak: number }

export function GamifyPanel({ adminId = '' }: { adminId?: string }) {
  /* ملاحقة الأدمن — بتنضاف لكل النداوات عشان حارس isAdmin (2026-غ2 تأمين) */
  const adminQAppend = function (path: string): string {
    return path + (path.indexOf('?') >= 0 ? '&' : '?') + 'adminId=' + encodeURIComponent(adminId)
  }
  /* ============================================================
     كل الحالات — معلنة فوق عشان الـ memo/handlers تقراها بأمان
     ============================================================ */
  const [tab, setTab] = useState('series')

  /* البيانات المحملة */
  const [series, setSeries] = useState<SeriesItem[]>([])
  const [defaultPrize, setDefaultPrize] = useState('')
  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState<BadgeItem[]>([])
  const [badgeConditions, setBadgeConditions] = useState<string[]>([])
  const [badgesLoading, setBadgesLoading] = useState(true)
  const [academic, setAcademic] = useState<AcademicRow[]>([])
  const [xpRows, setXpRows] = useState<XpRow[]>([])
  const [boardLoading, setBoardLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  /* مفتاح العملية الشغالة (create | publish:{id} | unpublish:{id} | delete:{id} | toggle:{id} | del:{id}) */
  const [busy, setBusy] = useState('')

  /* تاب 1 — إنشاء سلسلة جديدة */
  const [showCreate, setShowCreate] = useState(false)
  const [cTitle, setCTitle] = useState('')
  const [cGrade, setCGrade] = useState('')
  const [cDays, setCDays] = useState('10')
  const [cPrize, setCPrize] = useState('')

  /* تاب 1 — محرر السلسلة */
  const [editingId, setEditingId] = useState('')
  const [eTitle, setETitle] = useState('')
  const [eGrade, setEGrade] = useState('')
  const [eDays, setEDays] = useState(10)
  const [ePrize, setEPrize] = useState('')
  const [questions, setQuestions] = useState<SeriesQuestion[]>([])
  const [saving, setSaving] = useState(false)
  const [deleteFor, setDeleteFor] = useState<SeriesItem | null>(null)

  /* تاب 1 — تعديل سريع داخل الجدول: XP + مسح صف */
  const [xpDrafts, setXpDrafts] = useState<Record<number, string>>({})
  const [rowDeleteIdx, setRowDeleteIdx] = useState(-1)

  /* تاب 1 — فورم السؤال (Dialog) — إضافة أو تعديل */
  const [qDialogOpen, setQDialogOpen] = useState(false)
  const [qEditIdx, setQEditIdx] = useState(-1)
  const [qText, setQText] = useState('')
  const [qOpts, setQOpts] = useState<string[]>(['', '', '', ''])
  const [qCorrect, setQCorrect] = useState(0)
  const [qCorrectText, setQCorrectText] = useState('')
  const [qXp, setQXp] = useState('20')
  const [qDay, setQDay] = useState('1')
  const [qDiff, setQDiff] = useState('normal')

  /* تاب 1 — استخراج الأسئلة من ملف PDF/صورة بالـ AI */
  const fileRef = useRef<HTMLInputElement>(null)
  const [pickedFile, setPickedFile] = useState<File | null>(null)
  const [extracting, setExtracting] = useState(false)

  /* تاب 2 — الشارات */
  const [badgeBusy, setBadgeBusy] = useState('')
  const [badgeDialogOpen, setBadgeDialogOpen] = useState(false)
  const [bEditId, setBEditId] = useState('')
  const [bName, setBName] = useState('')
  const [bDesc, setBDesc] = useState('')
  const [bIcon, setBIcon] = useState('🏅')
  const [bRarity, setBRarity] = useState('common')
  const [bCond, setBCond] = useState('streak_days')
  const [bThreshold, setBThreshold] = useState('3')
  const [bSort, setBSort] = useState('99')
  const [bActive, setBActive] = useState(true)
  const [badgeSaving, setBadgeSaving] = useState(false)
  const [badgeDeleteFor, setBadgeDeleteFor] = useState<BadgeItem | null>(null)

  /* تاب 3 — لوحة الترتيب: تصفير + تنبيه جماعي */
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false)
  const [resetBusy, setResetBusy] = useState(false)
  const [nagGrade, setNagGrade] = useState('')
  const [nagMsg, setNagMsg] = useState('')
  const [nagBusy, setNagBusy] = useState(false)

  /* ============================================================
     التحميل — GETs
     ============================================================ */
  const load = useCallback(async function () {
    try {
      const res = await fetch(adminQAppend('/api/gamify/admin/series'))
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && Array.isArray(data.series)) {
        setSeries(data.series as SeriesItem[])
        setDefaultPrize(String(data.defaultPrize || ''))
      } else {
        toast.error(String((data && data.error) || 'مشكلة في تحميل السلاسل'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setLoading(false)
  }, [])

  const loadBadges = useCallback(async function () {
    try {
      const res = await fetch(adminQAppend('/api/gamify/admin/badges'))
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && Array.isArray(data.badges)) {
        setBadges(data.badges as BadgeItem[])
        setBadgeConditions(Array.isArray(data.conditions) ? data.conditions : [])
      } else {
        toast.error(String((data && data.error) || 'مشكلة في تحميل الشارات'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setBadgesLoading(false)
  }, [])

  const loadBoard = useCallback(async function () {
    try {
      const res = await fetch(adminQAppend('/api/gamify/admin/reset-leaderboard'))
      const data = await res.json().catch(function () { return null })
      if (res.ok && data) {
        setAcademic(Array.isArray(data.academic) ? data.academic : [])
        setXpRows(Array.isArray(data.xp) ? data.xp : [])
      } else {
        toast.error(String((data && data.error) || 'مشكلة في تحميل اللوحة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setBoardLoading(false)
  }, [])

  useEffect(function () {
    /* تأجيل أول تحميل — setState المتزامن جوه الـ effect بيولّد cascading renders */
    const kick = setTimeout(function () { load(); loadBadges(); loadBoard() }, 0)
    return function () { clearTimeout(kick) }
  }, [load, loadBadges, loadBoard])

  /* تحديث شامل — زرار التحديث في الهيدر */
  const refreshAll = async function () {
    setRefreshing(true)
    await Promise.all([load(), loadBadges(), loadBoard()])
    setRefreshing(false)
    toast.success('اتحدثت كل البيانات ✅')
  }

  /* ============================================================
     المذكرات — مشتقة من الحالات
     ============================================================ */
  /* خيارات عدد الأيام — 7/10/14 + الرقم الحالي لو مختلف */
  const dayOptions = useMemo(function () {
    const set = new Set<number>([7, 10, 14, eDays])
    return Array.from(set).sort(function (a, b) { return a - b })
  }, [eDays])

  /* خيارات الصفوف — GRADES + الصف الحالي لو مش في القايمة */
  const gradeOptions = useMemo(function () {
    const arr: string[] = GRADES.slice()
    if (eGrade && arr.indexOf(eGrade) < 0) arr.unshift(eGrade)
    return arr
  }, [eGrade])

  /* أيام 1..totalDays للاستخدام في الـ Selects */
  const dayItems = useMemo(function () {
    const out: number[] = []
    for (let i = 1; i <= Math.max(1, eDays); i++) out.push(i)
    return out
  }, [eDays])

  /* الأسئلة مجمعة بالأيام — مع الاحتفاظ بالفهرس الأصلي للتعديل السريع */
  const dayGroups = useMemo(function () {
    const map = new Map<number, Array<{ idx: number; q: SeriesQuestion }>>()
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i]
      const d = Math.max(1, Number(q.dayNumber) || 1)
      const arr = map.get(d) || []
      arr.push({ idx: i, q: q })
      map.set(d, arr)
    }
    return Array.from(map.keys()).sort(function (a, b) { return a - b }).map(function (d) {
      return { day: d, items: map.get(d) as Array<{ idx: number; q: SeriesQuestion }> }
    })
  }, [questions])

  /* أعلى يوم فيه أسئلة — لتحذير أيام خارج النطاق */
  const maxDay = useMemo(function () {
    let mx = 0
    for (let i = 0; i < questions.length; i++) mx = Math.max(mx, Number(questions[i].dayNumber) || 1)
    return mx
  }, [questions])

  /* ============================================================
     تاب 1 — السلاسل: إنشاء / نشر / حذف / محرر
     ============================================================ */
  const openCreate = function () {
    setShowCreate(true)
    setEditingId('')
    setCTitle('')
    setCGrade('')
    setCDays('10')
    setCPrize(defaultPrize)
  }

  const create = async function () {
    const title = cTitle.trim()
    if (!title || !cGrade) {
      toast.error('اكتب عنوان السلسلة واختار الصف')
      return
    }
    setBusy('create')
    try {
      const res = await fetch('/api/gamify/admin/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, grade: cGrade, title: title, totalDays: Number(cDays) || 10, prize: cPrize.trim() || defaultPrize }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتعملت السلسلة — ضيف الأسئلة دلوقتي 🎯')
        setShowCreate(false)
        /* نفتح المحرر فورًا على السلسلة الجديدة — بياناتها معانا من الفورم */
        setEditingId(String(data.id || ''))
        setETitle(title)
        setEGrade(cGrade)
        setEDays(Number(cDays) || 10)
        setEPrize(cPrize.trim() || defaultPrize)
        setQuestions([])
        setXpDrafts({})
        await load()
      } else {
        toast.error(String((data && data.error) || 'فشل إنشاء السلسلة — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  /* نشر / إيقاف / حذف سلسلة — بيرجع نجاح العملية */
  const seriesAction = async function (id: string, action: string, msg: string): Promise<boolean> {
    setBusy(action + ':' + id)
    try {
      const res = await fetch('/api/gamify/admin/series', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, id: id, action: action }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        if (action === 'delete' && editingId === id) closeEditor()
        toast.success(msg)
        await load()
        return true
      }
      toast.error(String((data && data.error) || 'حصلت مشكلة — جرب تاني'))
      return false
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
      return false
    } finally {
      setBusy('')
    }
  }

  const togglePublish = function (s: SeriesItem) {
    if (s.active) seriesAction(s.id, 'unpublish', 'اتوقفت السلسلة — مش ظاهرة للطلاب ✋')
    else seriesAction(s.id, 'publish', 'انشرت السلسلة! الطلاب وصلهم إشعار 🎯')
  }

  const deleteSeries = async function () {
    if (!deleteFor) return
    const target = deleteFor
    setDeleteFor(null)
    await seriesAction(target.id, 'delete', 'السلسلة اتمسحت بكل أسئلتها 🗑️')
  }

  const openEditor = function (s: SeriesItem) {
    setShowCreate(false)
    setEditingId(s.id)
    setETitle(s.title)
    setEGrade(s.grade || '')
    setEDays(Number(s.totalDays) || 10)
    setEPrize(s.prize || '')
    setQuestions((s.questions || []).map(function (q) {
      return {
        id: q.id,
        dayNumber: Math.max(1, Number(q.dayNumber) || 1),
        text: String(q.text || ''),
        options: Array.isArray(q.options) ? q.options.slice() : [],
        correctIndex: Number(q.correctIndex),
        correctText: String(q.correctText || ''),
        xpReward: Number(q.xpReward) || 20,
        difficulty: String(q.difficulty || 'normal'),
      }
    }))
    setXpDrafts({})
  }

  const closeEditor = function () {
    setEditingId('')
    setQuestions([])
    setXpDrafts({})
  }

  /* حفظ السلسلة + الأسئلة — بنبعت القايمة كاملة والسيرفر بيستبدل
     أسئلة الأيام الموجودة فيها بس */
  const save = async function () {
    if (!editingId) return
    if (!eTitle.trim() || !eGrade) {
      toast.error('اكتب عنوان السلسلة واختار الصف')
      return
    }
    const clean = questions
      .filter(function (q) { return q.text.trim() !== '' })
      .map(function (q) {
        /* نعيد ترقيم الإجابة الصح بعد شيل الاختيارات الفاضية — زي ما السيرفر بيتوقع */
        const filled: string[] = []
        let correct = 0
        const raw = (q.options || []).slice(0, 4)
        for (let i = 0; i < raw.length; i++) {
          if (!String(raw[i] || '').trim()) continue
          if (i === q.correctIndex) correct = filled.length
          filled.push(String(raw[i]))
        }
        const base = {
          dayNumber: Math.max(1, Number(q.dayNumber) || 1),
          text: q.text.trim(),
          xpReward: Math.max(5, Math.round(Number(q.xpReward) || 20)),
          difficulty: q.difficulty || 'normal',
        }
        if (filled.length >= 2) {
          return Object.assign({}, base, { options: filled, correctIndex: correct, correctText: '' })
        }
        return Object.assign({}, base, { options: [], correctIndex: -1, correctText: String(q.correctText || '').trim() })
      })
    setSaving(true)
    try {
      const res = await fetch('/api/gamify/admin/series', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, id: editingId, title: eTitle.trim(), grade: eGrade, totalDays: eDays, prize: ePrize.trim(), questions: clean }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتحفظت ' + clean.length + ' سؤال على ' + eDays + ' أيام ✅')
        await load()
      } else {
        toast.error(String((data && data.error) || 'فشل الحفظ — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setSaving(false)
    }
  }

  /* ===== تعديل سريع داخل الجدول: XP + اليوم + مسح ===== */
  const setXpDraft = function (idx: number, v: string) {
    setXpDrafts(function (prev) {
      const next = Object.assign({}, prev)
      next[idx] = v
      return next
    })
  }

  const commitXp = function (idx: number) {
    const raw = xpDrafts[idx]
    if (raw === undefined) return
    const n = Math.max(5, Math.round(Number(raw) || 20))
    setQuestions(function (prev) { return prev.map(function (x, i) { return i === idx ? Object.assign({}, x, { xpReward: n }) : x }) })
    setXpDrafts(function (prev) {
      const next = Object.assign({}, prev)
      delete next[idx]
      return next
    })
  }

  const setDayAt = function (idx: number, v: string) {
    const d = Math.max(1, Number(v) || 1)
    setQuestions(function (prev) { return prev.map(function (x, i) { return i === idx ? Object.assign({}, x, { dayNumber: d }) : x }) })
  }

  const removeQuestionAt = function () {
    if (rowDeleteIdx < 0) return
    const idx = rowDeleteIdx
    setRowDeleteIdx(-1)
    setQuestions(function (prev) { return prev.filter(function (_, i) { return i !== idx }) })
    setXpDrafts({})
  }

  /* ===== فورم السؤال — إضافة أو تعديل (Dialog) ===== */
  const openQDialogNew = function () {
    setQEditIdx(-1)
    setQText('')
    setQOpts(['', '', '', ''])
    setQCorrect(0)
    setQCorrectText('')
    setQXp('20')
    setQDay('1')
    setQDiff('normal')
    setQDialogOpen(true)
  }

  const openQDialogEdit = function (idx: number) {
    const q = questions[idx]
    if (!q) return
    setQEditIdx(idx)
    setQText(q.text)
    const opts = ['', '', '', '']
    for (let i = 0; i < Math.min(4, (q.options || []).length); i++) opts[i] = String(q.options[i] || '')
    setQOpts(opts)
    setQCorrect(q.correctIndex >= 0 && q.correctIndex <= 3 ? q.correctIndex : 0)
    setQCorrectText(q.correctText || '')
    setQXp(String(q.xpReward || 20))
    setQDay(String(Math.max(1, q.dayNumber) || 1))
    setQDiff(q.difficulty || 'normal')
    setQDialogOpen(true)
  }

  const applyQuestion = function (q: SeriesQuestion) {
    if (qEditIdx >= 0) {
      setQuestions(function (prev) { return prev.map(function (x, i) { return i === qEditIdx ? q : x }) })
    } else {
      setQuestions(function (prev) { return prev.concat([q]) })
    }
    setQDialogOpen(false)
  }

  /* حفظ السؤال من الدايلوج — وضع اختيارات (2+) أو وضع إجابة نصية */
  const saveQuestion = function () {
    if (!qText.trim()) {
      toast.error('اكتب نص السؤال')
      return
    }
    const dayNum = Math.max(1, Number(qDay) || 1)
    const xp = Math.max(5, Math.round(Number(qXp) || 20))
    const filled = qOpts.map(function (o) { return o.trim() })
    const filledCount = filled.filter(function (o) { return o }).length
    if (filledCount >= 2) {
      if (!filled[qCorrect]) {
        toast.error('اختار الإجابة الصح من الاختيارات المكتوبة')
        return
      }
      const payloadOpts: string[] = []
      let payloadCorrect = 0
      for (let i = 0; i < filled.length; i++) {
        if (!filled[i]) continue
        if (i === qCorrect) payloadCorrect = payloadOpts.length
        payloadOpts.push(filled[i])
      }
      applyQuestion({ dayNumber: dayNum, text: qText.trim(), options: payloadOpts, correctIndex: payloadCorrect, correctText: '', xpReward: xp, difficulty: qDiff })
    } else {
      if (!qCorrectText.trim()) {
        toast.error('لو مفيش اختيارات — اكتب الإجابة النصية الصح')
        return
      }
      applyQuestion({ dayNumber: dayNum, text: qText.trim(), options: [], correctIndex: -1, correctText: qCorrectText.trim(), xpReward: xp, difficulty: qDiff })
    }
  }

  /* ===== استخراج الأسئلة من ملف PDF/صورة بالـ AI ===== */
  const pickFile = function (f: File | null) {
    if (!f) return
    const name = (f.name || '').toLowerCase()
    if (name.indexOf('.pdf') < 0 && name.indexOf('.png') < 0 && name.indexOf('.jpg') < 0 && name.indexOf('.jpeg') < 0 && name.indexOf('.webp') < 0) {
      toast.error('لازم PDF أو صورة (PNG/JPG/WEBP)')
      return
    }
    setPickedFile(f)
  }

  const extractFromFile = async function () {
    if (!pickedFile) return
    if (!eGrade) {
      toast.error('اختار الصف الأول — الاستخراج بيستخدمه لفهم مستوى الأسئلة')
      return
    }
    setExtracting(true)
    try {
      const fd = new FormData()
      fd.append('file', pickedFile)
      fd.append('type', 'daily')
      fd.append('grade', eGrade)
      const res = await fetch('/api/ai/extract-questions', { method: 'POST', body: fd })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.success && data.extracted && Array.isArray(data.extracted.questions)) {
        const exQs: SeriesQuestion[] = (data.extracted.questions as any[])
          .map(function (q: any) {
            return {
              dayNumber: 1,
              text: String((q && q.question) || ''),
              options: Array.isArray(q && q.options) ? (q.options as any[]).slice(0, 4).map(function (o) { return String(o) }) : [],
              correctIndex: Math.max(0, Math.min(3, Number(q && q.correct) || 0)),
              correctText: '',
              xpReward: 20,
              difficulty: 'normal',
            }
          })
          .filter(function (q) { return q.text.trim() !== '' })
        if (exQs.length === 0) {
          toast.error('الـ AI ماقدرش يستخرج أسئلة من الملف — جرب ملف أوضح')
        } else {
          setQuestions(function (prev) { return prev.concat(exQs) })
          toast.success('اتستخرج ' + exQs.length + ' سؤال — وزّعهم على الأيام دلوقتي ✨')
          setPickedFile(null)
          if (fileRef.current) fileRef.current.value = ''
        }
      } else {
        toast.error(String((data && data.error) || 'فشل الاستخراج — جرب ملف أوضح'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال أو الملف كبير — جرب تاني')
    } finally {
      setExtracting(false)
    }
  }

  /* ============================================================
     تاب 2 — الشارات: حفظ / تفعيل / حذف
     ============================================================ */
  const openBadgeDialogNew = function () {
    setBEditId('')
    setBName('')
    setBDesc('')
    setBIcon('🏅')
    setBRarity('common')
    setBCond('streak_days')
    setBThreshold('3')
    setBSort('99')
    setBActive(true)
    setBadgeDialogOpen(true)
  }

  const openBadgeDialogEdit = function (b: BadgeItem) {
    setBEditId(b.id)
    setBName(b.name)
    setBDesc(b.desc)
    setBIcon(b.icon || '🏅')
    setBRarity(b.rarity || 'common')
    setBCond(b.conditionType || 'streak_days')
    setBThreshold(String(b.threshold || 1))
    setBSort(String(b.sort || 99))
    setBActive(!!b.active)
    setBadgeDialogOpen(true)
  }

  const saveBadge = async function () {
    if (!bName.trim()) {
      toast.error('اكتب اسم الشارة')
      return
    }
    if (!bIcon.trim()) {
      toast.error('اختار إيموجي للشارة — حرف واحد كفاية')
      return
    }
    setBadgeSaving(true)
    try {
      const payload: Record<string, unknown> = {
        name: bName.trim(),
        desc: bDesc.trim(),
        icon: bIcon.trim().slice(0, 8),
        rarity: bRarity,
        conditionType: bCond,
        threshold: Math.max(1, Number(bThreshold) || 1),
        active: bActive,
        sort: Math.round(Number(bSort) || 99),
      }
      if (bEditId) payload.id = bEditId
      payload.adminId = adminId
      const res = await fetch('/api/gamify/admin/badges', {
        method: bEditId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success(bEditId ? 'الشارة اتحفظت ✅' : 'الشارة اتضافت ✅')
        setBadgeDialogOpen(false)
        await loadBadges()
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBadgeSaving(false)
    }
  }

  /* تفعيل/إيقاف سريع من الكارت — PUT كامل بنفس القيم مع عكس active */
  const toggleBadgeActive = async function (b: BadgeItem) {
    setBadgeBusy('toggle:' + b.id)
    try {
      const res = await fetch('/api/gamify/admin/badges', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, id: b.id, name: b.name, desc: b.desc, icon: b.icon, rarity: b.rarity, conditionType: b.conditionType, threshold: b.threshold, active: !b.active, sort: b.sort }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success(!b.active ? 'الشارة بقت مفعّلة ✅' : 'الشارة اتوقفت — مش هتتمنح لحد')
        await loadBadges()
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBadgeBusy('')
    }
  }

  const deleteBadge = async function () {
    if (!badgeDeleteFor) return
    const target = badgeDeleteFor
    setBadgeDeleteFor(null)
    setBadgeBusy('del:' + target.id)
    try {
      const res = await fetch(adminQAppend('/api/gamify/admin/badges?id=' + encodeURIComponent(target.id)), { method: 'DELETE' })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('الشارة اتمسحت — واتشالت من كل الطلاب 🗑️')
        await loadBadges()
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBadgeBusy('')
    }
  }

  /* ============================================================
     تاب 3 — تصفير اللوحة + التنبيه الجماعي
     ============================================================ */
  const resetBoard = async function () {
    setResetConfirmOpen(false)
    setResetBusy(true)
    try {
      const res = await fetch('/api/gamify/admin/reset-leaderboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتصفّرت اللوحة — اتخفى ' + String(data.frozen || 0) + ' صف نقاط قديمة 🧹')
        setBoardLoading(true)
        await loadBoard()
      } else {
        toast.error(String((data && data.error) || 'فشل التصفير — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setResetBusy(false)
    }
  }

  const sendNag = async function () {
    setNagBusy(true)
    try {
      const res = await fetch('/api/gamify/admin/nag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, grade: nagGrade.trim() || undefined, message: nagMsg.trim() || undefined }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتبعت لـ ' + String(data.notified || 0) + ' طالب ⚡')
        setNagMsg('')
      } else {
        toast.error(String((data && data.error) || 'فشل إرسال التنبيه — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setNagBusy(false)
    }
  }

  /* ============================================================
     الواجهة
     ============================================================ */
  return (
    <div className="space-y-4">
      {/* هيدر البانل */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="shrink-0 h-9 w-9 rounded-xl bg-amber-500/10 flex items-center justify-center">
            <Crown className="h-5 w-5 text-amber-600 dark:text-amber-400" />
          </div>
          <div className="min-w-0">
            <h3 className="text-lg font-bold">الجوائز والتحدي</h3>
            <p className="text-xs text-muted-foreground">تحدي يومي بـ XP + شارات + لوحة ترتيب — التحكم الكامل من هنا</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={refreshAll} disabled={refreshing} className="gap-1.5">
          {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          تحديث
        </Button>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="series" className="text-xs sm:text-sm gap-1 text-amber-600 dark:text-amber-400"><Zap className="h-4 w-4" />التحدي اليومي</TabsTrigger>
          <TabsTrigger value="badges" className="text-xs sm:text-sm gap-1 text-amber-600 dark:text-amber-400"><Medal className="h-4 w-4" />الشارات</TabsTrigger>
          <TabsTrigger value="board" className="text-xs sm:text-sm gap-1 text-amber-600 dark:text-amber-400"><Trophy className="h-4 w-4" />لوحة الترتيب</TabsTrigger>
        </TabsList>

        {/* ============ تاب 1: التحدي اليومي ============ */}
        <TabsContent value="series" className="space-y-4">
          {!showCreate && !editingId ? (
            <Button onClick={openCreate} className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto gap-1.5"><Plus className="h-4 w-4" />سلسلة جديدة</Button>
          ) : null}

          {/* ===== فورم إنشاء سلسلة ===== */}
          {showCreate ? (
            <Card className="border-amber-300/70 dark:border-amber-700/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-lg"><Plus className="h-5 w-5 text-amber-600" />سلسلة تحدي جديدة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">عنوان السلسلة</label>
                    <Input value={cTitle} onChange={function (e) { setCTitle(e.target.value) }} placeholder="مثال: تحدي الجبر — سبتمبر" />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">الصف</label>
                    <Select value={cGrade} onValueChange={setCGrade}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="اختار الصف" /></SelectTrigger>
                      <SelectContent>
                        {GRADES.map(function (g) { return <SelectItem key={g} value={g}>{g}</SelectItem> })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">عدد الأيام</label>
                    <Select value={cDays} onValueChange={setCDays}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {['7', '10', '14'].map(function (d) { return <SelectItem key={d} value={d}>{d} أيام</SelectItem> })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">نص الجايزة (بيظهر للطالب)</label>
                    <Textarea rows={3} value={cPrize} onChange={function (e) { setCPrize(e.target.value) }} placeholder="نص الجايزة…" />
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={create} disabled={busy === 'create'} className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5">
                    {busy === 'create' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                    أنشئ السلسلة
                  </Button>
                  <Button variant="ghost" onClick={function () { setShowCreate(false) }}>إلغاء</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">بعد الإنشاء المحرر هيفتح على طول عشان تضيف الأسئلة وتوزعها على الأيام.</p>
              </CardContent>
            </Card>
          ) : null}

          {/* ===== محرر السلسلة ===== */}
          {editingId ? (
            <Card className="border-amber-300/70 dark:border-amber-700/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center justify-between gap-2 text-lg">
                  <span className="flex min-w-0 items-center gap-2"><Pencil className="h-5 w-5 shrink-0 text-amber-600" /><span className="truncate">تعديل السلسلة</span></span>
                  <Button variant="ghost" size="sm" onClick={closeEditor} className="shrink-0">قفل المحرر</Button>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* بيانات السلسلة */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">عنوان السلسلة</label>
                    <Input value={eTitle} onChange={function (e) { setETitle(e.target.value) }} />
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">الصف</label>
                    <Select value={eGrade} onValueChange={setEGrade}>
                      <SelectTrigger className="w-full"><SelectValue placeholder="اختار الصف" /></SelectTrigger>
                      <SelectContent>
                        {gradeOptions.map(function (g) { return <SelectItem key={g} value={g}>{g}</SelectItem> })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="mb-1.5 block text-sm font-medium">عدد الأيام</label>
                    <Select value={String(eDays)} onValueChange={function (v) { setEDays(Math.max(1, Number(v) || 10)) }}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {dayOptions.map(function (d) { return <SelectItem key={d} value={String(d)}>{d} أيام</SelectItem> })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="mb-1.5 block text-sm font-medium">نص الجايزة</label>
                    <Textarea rows={2} value={ePrize} onChange={function (e) { setEPrize(e.target.value) }} />
                  </div>
                </div>

                {/* سطر الجوائز — إزاي الطالب بيكسب XP */}
                <p className="rounded-lg border border-amber-300/60 bg-amber-50/60 dark:border-amber-700/50 dark:bg-amber-950/30 px-3 py-2 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                  💰 الطالب يجاوب صح = يكسب XP السؤال — غلط = مفيش XP. أول إجابة صح بس بتتاحسب.
                </p>

                {/* ===== استخراج من ملف/كتاب ===== */}
                <div className="rounded-xl border border-amber-300/60 bg-amber-50/50 dark:border-amber-700/60 dark:bg-amber-950/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <label className="flex items-center gap-1.5 text-sm font-bold text-amber-700 dark:text-amber-300"><FileText className="h-4 w-4" />استخراج من ملف/كتاب 📄</label>
                    {pickedFile ? <Badge variant="outline" className="text-[10px] font-bold" dir="ltr">📎 {pickedFile.name.slice(0, 28)}</Badge> : null}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    ارفع PDF أو صورة صفحات الكتاب — الـ AI هيستخرج الأسئلة والاختيارات ويضيفهم للقايمة تحت (كل سؤال بـ 20 XP على اليوم الأول — وزّعهم بعد كده).
                  </p>
                  <input
                    ref={fileRef}
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg,.webp"
                    className="hidden"
                    onChange={function (e) { pickFile(e.target.files && e.target.files[0]) }}
                    aria-hidden="true"
                    tabIndex={-1}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" variant="outline" size="sm" disabled={extracting} onClick={function () { fileRef.current?.click() }} className="min-h-9 gap-1.5">
                      {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      اختار ملف
                    </Button>
                    <Button type="button" size="sm" disabled={!pickedFile || extracting || !eGrade} onClick={extractFromFile} className="min-h-9 gap-1.5 bg-amber-600 text-white hover:bg-amber-700">
                      {extracting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                      استخرج الأسئلة من الملف
                    </Button>
                  </div>
                  {extracting ? (
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      جاري استخراج الأسئلة من الملف… ممكن ياخد لحد دقيقة ⏳
                    </p>
                  ) : null}
                </div>

                {/* ===== قايمة الأسئلة ===== */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h4 className="flex items-center gap-1.5 text-sm font-bold"><Medal className="h-4 w-4 text-amber-600" />الأسئلة ({questions.length})</h4>
                    <Button variant="outline" size="sm" onClick={openQDialogNew} className="min-h-9 gap-1.5"><Plus className="h-3.5 w-3.5" />إضافة سؤال يدوي</Button>
                  </div>

                  {/* تلميح التوزيع + تحذير أيام خارج النطاق */}
                  <div className="flex flex-wrap items-center gap-2 text-[11px]">
                    <span className="rounded-md bg-muted px-2 py-1 font-medium text-muted-foreground">
                      عندك {questions.length} سؤال — لو وزعتهم على {eDays} أيام يبقى ~{Math.ceil(questions.length / Math.max(1, eDays))} سؤال في اليوم
                    </span>
                    {maxDay > eDays ? (
                      <span className="rounded-md bg-amber-500/15 px-2 py-1 font-bold text-amber-700 dark:text-amber-300">
                        ⚠️ فيه أسئلة على يوم {maxDay} وعدد الأيام {eDays} — وزعهم تاني قبل الحفظ
                      </span>
                    ) : null}
                  </div>

                  {questions.length === 0 ? (
                    <div className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
                      مفيش أسئلة لسه — استخرجهم من ملف فوق أو ضيف سؤال يدوي ✍️
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {dayGroups.map(function (g) {
                        const dayXp = g.items.reduce(function (acc, it) { return acc + (Number(it.q.xpReward) || 0) }, 0)
                        return (
                          <div key={g.day} className="space-y-1.5">
                            {/* هيدر اليوم */}
                            <div className="flex flex-wrap items-center gap-1.5">
                              <Badge className="border-0 bg-amber-600 text-white">اليوم {g.day}</Badge>
                              <Badge variant="outline" className="text-[10px]">{g.items.length} أسئلة</Badge>
                              <Badge variant="outline" className="text-[10px]">مجموع {dayXp} XP</Badge>
                            </div>
                            {/* صفوف الأسئلة */}
                            {g.items.map(function (it) {
                              const q = it.q
                              const hasOpts = (q.options || []).length >= 2
                              return (
                                <div key={it.idx} className="rounded-lg border bg-card p-2.5 space-y-2">
                                  <div className="flex items-start gap-2">
                                    <p className="min-w-0 flex-1 text-sm font-medium leading-snug">{q.text}</p>
                                    <div className="flex shrink-0 gap-1">
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-amber-600" onClick={function () { openQDialogEdit(it.idx) }} aria-label="تعديل السؤال" title="تعديل السؤال">
                                        <Pencil className="h-3.5 w-3.5" />
                                      </Button>
                                      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-red-600" onClick={function () { setRowDeleteIdx(it.idx) }} aria-label="مسح السؤال" title="مسح السؤال">
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                  {/* الاختيارات أو الإجابة النصية — الصح متعلّم ✅ */}
                                  {hasOpts ? (
                                    <div className="flex flex-wrap gap-1">
                                      {q.options.map(function (o, i) {
                                        const isCorrect = i === q.correctIndex
                                        return (
                                          <span
                                            key={i}
                                            className={
                                              'inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] ' +
                                              (isCorrect
                                                ? 'border-emerald-400 bg-emerald-50 font-bold text-emerald-800 dark:border-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-200'
                                                : 'border-border text-muted-foreground')
                                            }
                                          >
                                            {LETTERS[i]}) <span className="truncate">{o}</span>
                                            {isCorrect ? <CheckCircle2 className="h-3 w-3 shrink-0 text-emerald-600" /> : null}
                                          </span>
                                        )
                                      })}
                                    </div>
                                  ) : (
                                    <p className="flex items-center gap-1 text-[11px]">
                                      <span className="font-bold text-emerald-700 dark:text-emerald-300">الإجابة:</span>
                                      <span className="text-muted-foreground">{q.correctText || '—'}</span>
                                      <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                                    </p>
                                  )}
                                  {/* تعديل سريع: XP + اليوم + الصعوبة */}
                                  <div className="flex flex-wrap items-center gap-2 border-t pt-2">
                                    <div className="flex items-center gap-1">
                                      <span className="text-[10px] font-bold text-muted-foreground">XP</span>
                                      <Input
                                        type="number" min={5} dir="ltr"
                                        className="h-7 w-16 text-xs"
                                        value={xpDrafts[it.idx] !== undefined ? xpDrafts[it.idx] : String(q.xpReward)}
                                        onChange={function (e) { setXpDraft(it.idx, e.target.value) }}
                                        onBlur={function () { commitXp(it.idx) }}
                                        aria-label="XP السؤال"
                                      />
                                    </div>
                                    <Select value={String(q.dayNumber)} onValueChange={function (v) { setDayAt(it.idx, v) }}>
                                      <SelectTrigger className="h-7 w-[100px] text-xs" aria-label="يوم السؤال"><SelectValue /></SelectTrigger>
                                      <SelectContent>
                                        {dayItems.map(function (d) { return <SelectItem key={d} value={String(d)} className="text-xs">يوم {d}</SelectItem> })}
                                      </SelectContent>
                                    </Select>
                                    <Badge variant="outline" className="text-[10px]">{diffLabel(q.difficulty)}</Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* ===== الحفظ ===== */}
                <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                  <Button onClick={save} disabled={saving} className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5">
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    حفظ السلسلة والأسئلة
                  </Button>
                  <p className="text-[11px] text-muted-foreground">⚠️ الأسئلة بتتستبدل للأيام اللي موجودة في القايمة</p>
                </div>
              </CardContent>
            </Card>
          ) : null}

          {/* ===== قايمة السلاسل ===== */}
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map(function (i) { return <Skeleton key={i} className="h-28 w-full rounded-xl" /> })}
            </div>
          ) : series.length === 0 && !showCreate ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">مفيش سلاسل لسه — ابدأ بواحدة جديدة 👆</CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {series.map(function (s) {
                const perDayKeys = Object.keys(s.perDay || {}).sort(function (a, b) { return Number(a) - Number(b) })
                return (
                  <Card key={s.id} className={s.active ? 'border-emerald-400/60 dark:border-emerald-600/60' : undefined}>
                    <CardContent>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <Crown className="h-4 w-4 shrink-0 text-amber-600" />
                            <span className="text-sm font-bold">{s.title}</span>
                            {s.active
                              ? <Badge className="border-0 bg-emerald-500/15 text-[10px] font-black text-emerald-700 dark:text-emerald-300">نشر</Badge>
                              : <Badge className="border-0 bg-slate-500/15 text-[10px] font-black text-slate-600 dark:text-slate-300">مسودة</Badge>}
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <Badge variant="secondary" className="gap-1 text-[10px]"><GraduationCap className="h-3 w-3" />{s.grade || '—'}</Badge>
                            <Badge variant="outline" className="text-[10px]">{s.totalDays} أيام</Badge>
                            <Badge variant="outline" className="text-[10px]">{s.questionCount} سؤال</Badge>
                          </div>
                          {perDayKeys.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {perDayKeys.map(function (d) {
                                return <span key={d} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">يوم {d}: {s.perDay[d]} أسئلة</span>
                              })}
                            </div>
                          ) : null}
                          {s.prize ? <p className="truncate text-[11px] text-muted-foreground">🎁 {s.prize}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                          <Button
                            variant="outline" size="sm" className="h-8 gap-1 text-xs"
                            onClick={function () { togglePublish(s) }}
                            disabled={busy === 'publish:' + s.id || busy === 'unpublish:' + s.id}
                          >
                            {busy === 'publish:' + s.id || busy === 'unpublish:' + s.id
                              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              : <Zap className="h-3.5 w-3.5 text-amber-600" />}
                            {s.active ? 'إيقاف' : 'نشر'}
                          </Button>
                          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={function () { openEditor(s) }}>
                            <Pencil className="h-3.5 w-3.5" />تعديل
                          </Button>
                          <Button
                            variant="ghost" size="sm"
                            className="h-8 gap-1 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                            onClick={function () { setDeleteFor(s) }}
                          >
                            <Trash2 className="h-3.5 w-3.5" />حذف
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ============ تاب 2: الشارات ============ */}
        <TabsContent value="badges" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button onClick={openBadgeDialogNew} className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5"><Plus className="h-4 w-4" />شارة جديدة</Button>
            <p className="text-[11px] text-muted-foreground">ℹ️ شارة «المقامر الشجاع» اتحذفت من النظام نهائيًا — يظهر هنا بس اللي بتضيفه.</p>
          </div>

          {badgesLoading ? (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map(function (i) { return <Skeleton key={i} className="h-36 w-full rounded-xl" /> })}
            </div>
          ) : badges.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center text-sm text-muted-foreground">مفيش شارات لسه — ضيف أول شارة 👆</CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {badges.map(function (b) {
                const rar = rarityMeta(b.rarity)
                return (
                  <div key={b.id} className="rounded-xl border bg-card p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-2xl leading-none">{b.icon || '🏅'}</span>
                        <div className="min-w-0 space-y-1">
                          <p className="truncate text-sm font-bold">{b.name}</p>
                          <Badge className={'border-0 text-[10px] font-bold ' + rar.cls}>{rar.label}</Badge>
                        </div>
                      </div>
                      <Switch checked={b.active} onCheckedChange={function () { toggleBadgeActive(b) }} disabled={badgeBusy === 'toggle:' + b.id} aria-label="تفعيل الشارة" />
                    </div>
                    {b.desc ? <p className="text-xs leading-relaxed text-muted-foreground">{b.desc}</p> : null}
                    <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-700 dark:text-amber-300">
                      <Crown className="h-3 w-3 shrink-0" />
                      {condLabel(b.conditionType)} {b.threshold}
                    </p>
                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                      <span className="text-[10px] text-muted-foreground">ترتيب العرض: {b.sort}</span>
                      <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={function () { openBadgeDialogEdit(b) }}>
                          <Pencil className="h-3 w-3" />تعديل
                        </Button>
                        <Button
                          variant="ghost" size="sm"
                          className="h-7 gap-1 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                          onClick={function () { setBadgeDeleteFor(b) }}
                        >
                          <Trash2 className="h-3 w-3" />حذف
                        </Button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ============ تاب 3: لوحة الترتيب ============ */}
        <TabsContent value="board" className="space-y-4">
          {/* معاينة اللوحتين — جنب بعض على الديسكتوب وتحت بعض على الموبايل */}
          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                  <Trophy className="h-4 w-4 text-amber-600" />
                  النقاط الدراسية
                  <span className="text-xs font-normal text-muted-foreground">(بعد التصفير)</span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                {boardLoading ? (
                  <div className="space-y-1.5">
                    {[0, 1, 2, 3].map(function (i) { return <Skeleton key={i} className="h-9 w-full rounded-md" /> })}
                  </div>
                ) : academic.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">مفيش نقاط ظاهرة دلوقتي — أي امتحان/واجب جديد هيبدأ يتراكم هنا 📈</p>
                ) : (
                  <div className="max-h-80 space-y-1.5 overflow-y-auto pl-1">
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-2 px-2.5 text-[10px] font-bold text-muted-foreground">
                      <span className="text-center">#</span><span>الطالب</span><span>الصف</span><span>النقاط</span>
                    </div>
                    {academic.map(function (r, i) {
                      return (
                        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
                          <span className="text-center">{i < 3 ? MEDALS[i] : '#' + (i + 1)}</span>
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{r.grade || '—'}</span>
                          <span className="whitespace-nowrap text-xs font-bold text-emerald-600 dark:text-emerald-400">{Number(r.totalPoints) || 0} نقطة</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Zap className="h-4 w-4 text-amber-600" />XP التحدي</CardTitle>
              </CardHeader>
              <CardContent>
                {boardLoading ? (
                  <div className="space-y-1.5">
                    {[0, 1, 2, 3].map(function (i) { return <Skeleton key={i} className="h-9 w-full rounded-md" /> })}
                  </div>
                ) : xpRows.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">مفيش XP متسجل لسه — أول ما الطلاب يحلوا التحدي هيظهر هنا 🔥</p>
                ) : (
                  <div className="max-h-80 space-y-1.5 overflow-y-auto pl-1">
                    <div className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 px-2.5 text-[10px] font-bold text-muted-foreground">
                      <span className="text-center">#</span><span>الطالب</span><span>الصف</span><span>XP</span><span>ستريك</span>
                    </div>
                    {xpRows.map(function (r, i) {
                      return (
                        <div key={i} className="grid grid-cols-[28px_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded-md border bg-card px-2.5 py-1.5 text-sm">
                          <span className="text-center">{i < 3 ? MEDALS[i] : '#' + (i + 1)}</span>
                          <span className="truncate font-medium">{r.name}</span>
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{r.grade || '—'}</span>
                          <span className="whitespace-nowrap text-xs font-bold text-amber-600 dark:text-amber-400">{Number(r.xp) || 0} XP</span>
                          <span className="whitespace-nowrap text-[11px] text-orange-600 dark:text-orange-400" title={'أحسن ستريك: ' + (Number(r.bestStreak) || 0)}>🔥 {Number(r.streak) || 0}</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* ===== التصفير التدميري ===== */}
            <Card className="border-red-300 dark:border-red-800">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base text-red-600 dark:text-red-400"><AlertTriangle className="h-4 w-4" />تصفير لوحة الترتيب الدراسية</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm leading-relaxed text-muted-foreground">
                  الضغط على الزر هيخفي كل النقاط الحالية من اللوحات فورًا — وبعدها أي امتحان/واجب جديد بيتجمع عادي من الصفر.
                  النقاط القديمة مش بتنمسح من الدفاتر، بس مش هتظهر في اللوحة.
                </p>
                <Button onClick={function () { setResetConfirmOpen(true) }} disabled={resetBusy} className="w-full bg-red-600 text-white hover:bg-red-700 sm:w-auto gap-1.5">
                  {resetBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  🗑️ امسح اللوحة حالًا
                </Button>
              </CardContent>
            </Card>

            {/* ===== تنبيه الحل الجماعي ===== */}
            <Card className="border-amber-300/70 dark:border-amber-700/70">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base"><Send className="h-4 w-4 text-amber-600" />تنبيه الحل الجماعي</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">الصف</label>
                  <Input value={nagGrade} onChange={function (e) { setNagGrade(e.target.value) }} placeholder="اتركه فاضي = كل الصفوف" />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">رسالة التنبيه (اختياري)</label>
                  <Textarea rows={3} value={nagMsg} onChange={function (e) { setNagMsg(e.target.value) }} placeholder="⚡ خش حل السؤال اليومي بسرعة!…" />
                </div>
                <Button onClick={sendNag} disabled={nagBusy} className="w-full bg-amber-600 text-white hover:bg-amber-700 sm:w-auto gap-1.5">
                  {nagBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  بعت التنبيه للطلاب اللي ما حلّوش
                </Button>
                <p className="text-[11px] text-muted-foreground">التنبيه بيروح لكل طالب لسه ما حلّش سؤال النهاردة + إشعار لولي أمره.</p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* ============ دايلوج السؤال (إضافة/تعديل) ============ */}
      <Dialog open={qDialogOpen} onOpenChange={setQDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{qEditIdx >= 0 ? 'تعديل السؤال' : 'إضافة سؤال يدوي'}</DialogTitle>
            <DialogDescription>السؤال هيتحفظ مع السلسلة لما تضغط «حفظ السلسلة والأسئلة».</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium">نص السؤال</label>
              <Textarea rows={3} value={qText} onChange={function (e) { setQText(e.target.value) }} placeholder="اكتب السؤال هنا…" />
            </div>
            <div className="space-y-2">
              <label className="block text-sm font-medium">الاختيارات — علّم على الصح ✅ (اختارين على الأقل)</label>
              {qOpts.map(function (o, i) {
                return (
                  <div key={i} className="flex items-center gap-2">
                    <span className="w-5 shrink-0 text-center text-sm font-bold text-muted-foreground">{LETTERS[i]}</span>
                    <Input
                      value={o}
                      onChange={function (e) {
                        const next = qOpts.slice()
                        next[i] = e.target.value
                        setQOpts(next)
                      }}
                      placeholder={'اختيار ' + LETTERS[i]}
                    />
                    <label className="flex shrink-0 cursor-pointer items-center gap-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-400">
                      <input type="radio" name="gp-correct" className="accent-emerald-600" checked={qCorrect === i} onChange={function () { setQCorrect(i) }} />
                      الصح
                    </label>
                  </div>
                )
              })}
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">الإجابة النصية (لو مفيش اختيارات)</label>
              <Input value={qCorrectText} onChange={function (e) { setQCorrectText(e.target.value) }} placeholder="مثال: 12 سم" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">XP السؤال</label>
                <Input type="number" min={5} dir="ltr" value={qXp} onChange={function (e) { setQXp(e.target.value) }} />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">اليوم</label>
                <Select value={qDay} onValueChange={setQDay}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {dayItems.map(function (d) { return <SelectItem key={d} value={String(d)}>يوم {d}</SelectItem> })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">الصعوبة</label>
                <Select value={qDiff} onValueChange={setQDiff}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {DIFFICULTIES.map(function (d) { return <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem> })}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={saveQuestion} className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5">
                <CheckCircle2 className="h-4 w-4" />حفظ السؤال
              </Button>
              <Button variant="ghost" onClick={function () { setQDialogOpen(false) }}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ دايلوج الشارة (إضافة/تعديل) ============ */}
      <Dialog open={badgeDialogOpen} onOpenChange={setBadgeDialogOpen}>
        <DialogContent dir="rtl" className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{bEditId ? 'تعديل الشارة' : 'شارة جديدة'}</DialogTitle>
            <DialogDescription>الشارة بتتمنح للطالب تلقائيًا أول ما يحقق الشرط.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">اسم الشارة</label>
                <Input value={bName} onChange={function (e) { setBName(e.target.value) }} placeholder="مثال: نجم الستريك" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">الإيموجي</label>
                <Input value={bIcon} onChange={function (e) { setBIcon(e.target.value) }} placeholder="🏅" />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">الوصف</label>
              <Textarea rows={2} value={bDesc} onChange={function (e) { setBDesc(e.target.value) }} placeholder="وصف قصير يظهر للطالب…" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">الندرة</label>
                <Select value={bRarity} onValueChange={setBRarity}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RARITIES.map(function (r) { return <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem> })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">شرط الفتح</label>
                <Select value={bCond} onValueChange={setBCond}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(badgeConditions.length ? badgeConditions : Object.keys(CONDITION_LABELS)).map(function (c) {
                      return <SelectItem key={c} value={c}>{condLabel(c)} …</SelectItem>
                    })}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">قيمة الشرط</label>
                <Input type="number" min={1} dir="ltr" value={bThreshold} onChange={function (e) { setBThreshold(e.target.value) }} />
                <p className="mt-1 text-[11px] text-muted-foreground">{condLabel(bCond)} {Math.max(1, Number(bThreshold) || 1)}</p>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">ترتيب العرض</label>
                <Input type="number" dir="ltr" value={bSort} onChange={function (e) { setBSort(e.target.value) }} />
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
              <Switch checked={bActive} onCheckedChange={setBActive} aria-label="تفعيل الشارة" />
              <span className="text-sm font-medium">{bActive ? 'مفعّلة — ممكن تتمنح للطلاب' : 'متوقفة — مش هتتمنح'}</span>
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              <Button onClick={saveBadge} disabled={badgeSaving} className="bg-amber-600 text-white hover:bg-amber-700 gap-1.5">
                {badgeSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                حفظ الشارة
              </Button>
              <Button variant="ghost" onClick={function () { setBadgeDialogOpen(false) }}>إلغاء</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ============ تأكيد حذف سلسلة ============ */}
      <AlertDialog open={!!deleteFor} onOpenChange={function (v) { if (!v) setDeleteFor(null) }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تمسح السلسلة نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              «{deleteFor?.title || ''}» — هيتمسح السلسلة وكل أسئلتها ومحاولات الطلاب فيها. الحذف مفيش له رجعة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>سيبك — متمسحوش</AlertDialogCancel>
            <AlertDialogAction onClick={function (e) { e.preventDefault(); deleteSeries() }} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 ml-1.5" />امسحها نهائيًا
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ تأكيد حذف سؤال من المحرر ============ */}
      <AlertDialog open={rowDeleteIdx >= 0} onOpenChange={function (v) { if (!v) setRowDeleteIdx(-1) }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تمسح السؤال من القايمة؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              السؤال هيتشال من قايمة المحرر — ولو حفظت بعد كده هيتشال من السلسلة على السيرفر كمان.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>سيبه</AlertDialogCancel>
            <AlertDialogAction onClick={function (e) { e.preventDefault(); removeQuestionAt() }} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 ml-1.5" />امسحه
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ تأكيد حذف شارة ============ */}
      <AlertDialog open={!!badgeDeleteFor} onOpenChange={function (v) { if (!v) setBadgeDeleteFor(null) }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>تمسح الشارة نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              «{badgeDeleteFor?.name || ''}» — هيتمسح الشارة وبتتشال تلقائيًا من كل الطلاب اللي كسبوها. الحذف مفيش له رجعة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>سيبك — متمسحوش</AlertDialogCancel>
            <AlertDialogAction onClick={function (e) { e.preventDefault(); deleteBadge() }} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 ml-1.5" />امسحها نهائيًا
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ============ تأكيد تصفير لوحة الترتيب ============ */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600 dark:text-red-400">تصفّر لوحة الترتيب الدراسية حالًا؟</AlertDialogTitle>
            <AlertDialogDescription className="leading-relaxed">
              كل النقاط الحالية هتختفي من اللوحات فورًا — وبعدها أي امتحان/واجب جديد بيتجمع عادي من الصفر.
              النقاط القديمة مش بتنمسح من الدفاتر، بس مش هتظهر في اللوحة. الخطوة دي تدميرية — اتأكد قبل ما تضغط.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>لا — سيبها زي ما هي</AlertDialogCancel>
            <AlertDialogAction onClick={function (e) { e.preventDefault(); resetBoard() }} disabled={resetBusy} className="bg-destructive text-white hover:bg-destructive/90">
              <Trash2 className="h-4 w-4 ml-1.5" />أيوه — امسح اللوحة
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
