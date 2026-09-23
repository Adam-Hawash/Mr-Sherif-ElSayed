'use client'

// ============================================================
// (2026-و37) بورتال ولي أمر — متابعة نتايج الابن:
//   - كارت ببيانات الطالب (الاسم/الصف/حالة الحساب)
//   - الواجبات: كل واجب بدرجته ومن النهاية الكلية
//   - الامتحانات: كل امتحان بدرجته
// البيانات جاية من /api/parent/results — مفيش أي تعديل، متابعة بس
//
// (2026-و39) طلب المستر:
//   - «ولي الأمر يقدر يشوف نسبة الفيديو بتاعه ابنه — نسبة الفيديوهات»
//     → كارت متابعة الفيديوهات (نسبة المشاهدة + عدد اللي خلص) من نفس /api/parent/results
//   - «ولو داس على اسمه يقدر يشوف الإجابات بتاعه ابنه»
//     → اسم الابن بقى زرار يفتح تفاصيل الإجابات، وكل صف واجب/امتحان بقى قابل
//       للتوسيع بالإجابات سؤال-بسؤال من /api/parent/answers (كاش في الميموري)
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
/* (و64) الترجمة الحقيقية عربي/إنجليزي */
import { useT } from '@/lib/i18n'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/app-store'
import { UserCheck, Loader2, RefreshCw, LogOut, BookOpenCheck, ClipboardList, AlertCircle, TrendingUp, MonitorPlay, ChevronDown, UserPlus, Users } from 'lucide-react'
import { toast } from 'sonner'
import FractionText, { hasMathMarkup } from '@/components/FractionText'
import BidiText from '@/components/BidiText'
/* (2026-و87) كارت إشعارات ولي الأمر — بالاسم والدرجة لحظة التسليم */
import ParentNotificationsCard from '@/components/parent/ParentNotificationsCard'
/* (2026-و89) بوب-أب تفعيل إشعارات الموبايل (Web Push) — الإشعار الخارجي بيدوس عليه يفتح دخول ولي الأمر */
import PushPermissionBanner from '@/components/parent/PushPermissionBanner'

interface ResultRow {
  id: string
  homeworkId?: string
  examId?: string
  title: string
  score: number
  maxScore: number
  submittedAt: string
}

interface StudentLite {
  id: string
  name: string
  grade: string
  status: string
  isPaidAccess: boolean
}

interface ParentResultsData {
  student: { id: string; name: string; grade: string; status: string; isPaidAccess: boolean } | null
  /* (2026-و79) ولي الأمر بعدة أبناء — قايمة كل الأبناء المدموجين في الحساب */
  students?: StudentLite[]
  homeworks: ResultRow[]
  exams: ResultRow[]
  /* (2026-و39) نسبة فيديوهات الابن — null لو مش متاحة */
  videos: { count: number; completed: number; percent: number } | null
}

/* (2026-و39) إجابات الابن سؤال-بسؤال من /api/parent/answers */
interface AnswerQuestion {
  idx: number
  text: string
  kind: 'mcq' | 'writing'
  options: string[]
  studentAnswer: string
  correctAnswer: string
  isCorrect: boolean
  awardedPoints?: number
  maxPoints?: number
  feedback: string
}
interface AnswerDetail {
  title: string
  submittedAt: string
  score: number
  maxScore: number
  questions: AnswerQuestion[]
}

function pct(score: number, max: number): number {
  if (!max || max <= 0) return 0
  return Math.round((score / max) * 100)
}

function scoreColor(p: number): string {
  if (p >= 85) return 'text-emerald-600 dark:text-emerald-400'
  if (p >= 50) return 'text-amber-600 dark:text-amber-400'
  return 'text-red-600 dark:text-red-400'
}

function ResultList({ rows, icon, emptyMsg, type, answersOpen, openId, detailFor, loadingId, onToggle }: { rows: ResultRow[]; icon: 'hw' | 'ex'; emptyMsg: string; type: 'homework' | 'exam'; answersOpen: boolean; openId: string; detailFor: (id: string) => AnswerDetail | null; loadingId: string; onToggle: (type: 'homework' | 'exam', row: ResultRow) => void }) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">{emptyMsg}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
      {rows.map(function (r) {
        var p = pct(r.score, r.maxScore)
        var detail = detailFor(r.id)
        return (
          <div key={r.id} className="rounded-xl border border-border bg-card px-3 py-2.5">
            <div
              className={"flex items-center gap-3" + (answersOpen ? ' cursor-pointer hover:bg-muted/40 -mx-3 px-3 py-2.5 -my-2.5 rounded-xl transition-colors' : '')}
              onClick={answersOpen ? function () { onToggle(type, r) } : undefined}
              role={answersOpen ? 'button' : undefined}
            >
              <div className="shrink-0 h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
                {icon === 'hw' ? <BookOpenCheck className="h-4.5 w-4.5 text-primary" /> : <ClipboardList className="h-4.5 w-4.5 text-primary" />}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-foreground truncate">{r.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(r.submittedAt).toLocaleDateString('ar-EG')} — {r.score} من {r.maxScore}
                </p>
                <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
                  <div className="h-full rounded-full bg-primary/70" style={{ width: Math.min(100, Math.max(2, p)) + '%' }} />
                </div>
              </div>
              <div className={'shrink-0 text-base font-extrabold ' + scoreColor(p)}>{p}%</div>
              {answersOpen && <ChevronDown className={'shrink-0 h-4 w-4 text-muted-foreground transition-transform' + (openId === r.id ? ' rotate-180' : '')} />}
            </div>
            {/* (2026-و39) تفاصيل إجابات الابن سؤال-بسؤال — تتفتح عند ضغط الصف */}
            {answersOpen && openId === r.id && (
              <div className="mt-3 pt-3 border-t max-h-96 overflow-y-auto custom-scrollbar">
                {loadingId === r.id ? (
                  <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
                ) : detail ? (
                  <div className="space-y-2">
                    {detail.questions.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-3">مفيش أسئلة مسجلة في العنصر ده</p>
                    )}
                    {detail.questions.map(function (qq: AnswerQuestion) {
                      return (
                        <div key={qq.idx} className={'rounded-xl border p-3 space-y-1.5 ' + (qq.isCorrect ? 'border-emerald-300 bg-emerald-50/50 dark:border-emerald-900 dark:bg-emerald-950/20' : 'border-red-300 bg-red-50/50 dark:border-red-900 dark:bg-red-950/20')}>
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-semibold text-foreground leading-relaxed break-words">{qq.idx + 1}. {qq.text ? (hasMathMarkup(qq.text) ? <FractionText text={qq.text} /> : qq.text) : '(سؤال من غير نص)'}</p>
                            <Badge variant="secondary" className="text-[10px] shrink-0">{(qq.kind === 'writing' || (!qq.kind && (!qq.options || qq.options.length === 0))) ? 'مقالي' : 'اختيارات'}</Badge>
                          </div>
                          <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="auto">إجابته: {qq.studentAnswer ? (hasMathMarkup(qq.studentAnswer) ? <FractionText text={qq.studentAnswer} /> : qq.studentAnswer) : 'لم يتم الإجابة'}</p>
                          {qq.correctAnswer && (
                            <p className="text-xs text-emerald-700 dark:text-emerald-400 whitespace-pre-wrap break-words" dir="auto">الإجابة الصحيحة: {hasMathMarkup(qq.correctAnswer) ? <FractionText text={qq.correctAnswer} /> : qq.correctAnswer}</p>
                          )}
                          {qq.kind === 'writing' && typeof qq.awardedPoints === 'number' && (
                            <p className="text-[11px] font-semibold text-muted-foreground">الدرجة: {qq.awardedPoints}/{qq.maxPoints}</p>
                          )}
                          {qq.kind === 'writing' && qq.feedback && (
                            <div className="rounded-lg bg-muted/60 p-2 mt-1">
                              <p className="text-[11px] font-bold mb-0.5 flex items-center gap-1"><span>📝</span> ملاحظة المصحح الذكي:</p>
                              <p className="text-xs text-foreground whitespace-pre-wrap break-words"><BidiText text={qq.feedback} /></p>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : null}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

export function ParentPortal() {
  /* (و64) الترجمة */
  const T = useT()
  var store = useAppStore()
  var currentParent = store.currentParent
  var setCurrentParent = store.setCurrentParent
  var setView = store.setView
  var data = useState<ParentResultsData | null>(null)
  var results = data[0]
  var setResults = data[1]
  var ld = useState(true)
  var loading = ld[0]
  var setLoading = ld[1]

  /* (2026-و39) حالة إجابات الابن: التوجل + الصف المفتوح + كاش التفاصيل
     (2026-و44) طلب المستر: «لو داس على اسم الامتحان أو الواجب يشوف درجته
     كاملة والإجابات بتاعته» — الصروف بقت قابلة للفتح **على طول** من غير
     ما يدوس اسم الابن الأول */
  var saState = useState(true)
  var showAnswers = saState[0]
  var setShowAnswers = saState[1]
  var openState = useState('')
  var openResultId = openState[0]
  var setOpenResultId = openState[1]
  var detailsState = useState<Record<string, AnswerDetail>>({})
  var answerDetails = detailsState[0]
  var setAnswerDetails = detailsState[1]
  var loadIdState = useState('')
  var loadingDetailId = loadIdState[0]
  var setLoadingDetailId = loadIdState[1]

  /* (2026-و79) ولي الأمر بعدة أبناء — الابن المختار + دايلوج إضافة طالب */
  var selState = useState('')
  var selectedStudentId = selState[0]
  var setSelectedStudentId = selState[1]
  var dlgState = useState(false)
  var addOpen = dlgState[0]
  var setAddOpen = dlgState[1]
  var modeState = useState<'link' | 'create'>('link')
  var addMode = modeState[0]
  var setAddMode = modeState[1]
  var f1 = useState(''); var fName = f1[0]; var setFName = f1[1]
  var f2 = useState(''); var fPhone = f2[0]; var setFPhone = f2[1]
  var f3 = useState(''); var fPwd = f3[0]; var setFPwd = f3[1]
  var f4 = useState(''); var fGrade = f4[0]; var setFGrade = f4[1]
  var addingState = useState(false)
  var adding = addingState[0]
  var setAdding = addingState[1]

  var toggleResultDetail = useCallback(async function (type: 'homework' | 'exam', row: ResultRow) {
    if (openResultId === row.id) { setOpenResultId(''); return }
    setOpenResultId(row.id)
    if (answerDetails[row.id]) return /* كاش — فتح تاني فوري */
    setLoadingDetailId(row.id)
    try {
      var pid = currentParent && currentParent.id ? currentParent.id : ''
      var sid = selectedStudentId ? '&studentId=' + encodeURIComponent(selectedStudentId) : ''
      var res = await fetch('/api/parent/answers?parentId=' + encodeURIComponent(pid) + '&type=' + type + '&resultId=' + encodeURIComponent(row.id) + sid, { cache: 'no-store' })
      var json = await res.json()
      if (res.ok) {
        setAnswerDetails(function (prev) {
          var n: Record<string, AnswerDetail> = {}
          for (var k in prev) n[k] = prev[k]
          n[row.id] = json
          return n
        })
      } else {
        toast.error(json.error || 'حصلت مشكلة في تحميل الإجابات', { duration: 8000 })
        setOpenResultId('')
      }
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
      setOpenResultId('')
    }
    setLoadingDetailId('')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openResultId, answerDetails, currentParent, selectedStudentId])

  var load = useCallback(async function () {
    if (!currentParent || !currentParent.id) return
    setLoading(true)
    try {
      var sid = selectedStudentId ? '&studentId=' + encodeURIComponent(selectedStudentId) : ''
      var res = await fetch('/api/parent/results?parentId=' + encodeURIComponent(currentParent.id) + sid, { cache: 'no-store' })
      var json = await res.json()
      if (res.ok) setResults(json)
      else toast.error(json.error || 'حصلت مشكلة في تحميل البيانات', { duration: 8000 })
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParent && currentParent.id, selectedStudentId])

  /* (2026-و79) إضافة طالب — ربط حساب موجود أو إنشاء حساب جديد — والحساب واحد بيفضل مدموج بكل الأبناء */
  var addStudent = useCallback(async function () {
    if (!currentParent || !currentParent.id) return
    setAdding(true)
    try {
      var res = await fetch('/api/parents/add-student', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parentId: currentParent.id,
          mode: addMode,
          studentName: fName,
          studentPhone: fPhone,
          studentPassword: fPwd,
          grade: fGrade,
        }),
      })
      var json = await res.json()
      if (res.ok && json.ok) {
        toast.success(addMode === 'create' ? 'اتعمل حساب ' + (json.added && json.added.name) + ' واتربط بحسابك — في انتظار موافقة المستر' : 'اتضاف ' + (json.added && json.added.name) + ' لحسابك')
        setAddOpen(false)
        setFName(''); setFPhone(''); setFPwd(''); setFGrade('')
        if (json.added && json.added.id) setSelectedStudentId(String(json.added.id))
        else load()
      } else {
        toast.error((json && json.error) || 'حصلت مشكلة في إضافة الطالب', { duration: 8000 })
      }
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
    }
    setAdding(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParent && currentParent.id, addMode, fName, fPhone, fPwd, fGrade])

  useEffect(function () {
    if (!currentParent) {
      setView('parent-login')
      return
    }
    load()
  }, [currentParent, load, setView])

  if (!currentParent) return null

  var student = results ? results.student : (currentParent.student || null)
  var students = (results && results.students) || []
  var homeworks = results ? results.homeworks : []
  var exams = results ? results.exams : []
  var hwAvg = homeworks.length > 0
    ? Math.round(homeworks.reduce(function (acc, r) { return acc + pct(r.score, r.maxScore) }, 0) / homeworks.length)
    : null
  var exAvg = exams.length > 0
    ? Math.round(exams.reduce(function (acc, r) { return acc + pct(r.score, r.maxScore) }, 0) / exams.length)
    : null

  return (
    <div className="min-h-[calc(100vh-4rem)] px-4 py-8">
      <div className="max-w-3xl mx-auto space-y-5">
        {/* هيدر ولي الأمر */}
        <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-gold-400 via-gold-600 to-gold-400">
          <Card className="rounded-2xl border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="flex items-start gap-3">
                <div className="shrink-0 h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center">
                  <UserCheck className="h-6 w-6 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <h1 className="text-lg font-bold text-foreground">{currentParent.name || T('ولي أمر', 'Parent')}</h1>
                  <p className="text-xs text-muted-foreground">{T('متابعة حساب الابن في المنصة', 'Follow your son\'s account')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {/* (و64) الزراير الموحدة في النافبار فوق — ممنوع التكرار هنا */}
                  <Button size="sm" variant="outline" onClick={function () { load() }} disabled={loading} className="h-9">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="sr-only">{T('تحديث', 'Refresh')}</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={function () { setCurrentParent(null); setView('landing') }} className="h-9">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">{T('خروج', 'Logout')}</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* (2026-و89) تفعيل إشعارات الموبايل (Web Push) — بوب-أب بعد الدخول + كارت حالة */}
        <PushPermissionBanner parentId={currentParent && currentParent.id ? currentParent.id : ''} />

        {/* (2026-و87) إشعارات ولي الأمر — أول حاجة يشوفها بعد الهيدر */}
        <ParentNotificationsCard parentId={currentParent && currentParent.id ? currentParent.id : ''} />

        {/* كارت الطالب */}
        {student ? (
          <Card className="border-primary/20">
            <CardContent className="p-5">
              {/* (2026-و79) مبدّل الأبناء — لو ولي الأمر عنده أكتر من ابن */}
              {students.length > 1 && (
                <div className="flex items-center gap-2 flex-wrap mb-4 pb-4 border-b">
                  <Users className="h-4 w-4 text-primary shrink-0" />
                  {students.map(function (s: StudentLite) {
                    var active = student && s.id === student.id
                    return (
                      <button
                        key={s.id}
                        type="button"
                        onClick={function () { setSelectedStudentId(s.id); setOpenResultId('') }}
                        className={'rounded-full px-3 py-1.5 text-xs font-bold border transition-colors ' + (active ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted/40 border-border hover:bg-muted')}
                      >
                        {s.name}
                      </button>
                    )
                  })}
                </div>
              )}
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground mb-0.5">{T('الطالب', 'Student')}</p>
                  {/* (2026-و39) اسم الابن بقى زرار — الضغط عليه بيفتح وضع عرض إجابات الابن */}
                  <button
                    type="button"
                    onClick={function () { setShowAnswers(!showAnswers) }}
                    title="شوف إجابات ابنك"
                    className="group inline-flex items-center gap-1 max-w-full text-left cursor-pointer"
                  >
                    <span className="text-lg font-bold text-foreground truncate group-hover:text-primary transition-colors underline decoration-primary/40 underline-offset-4">{student.name}</span>
                    <ChevronDown className={'shrink-0 h-4 w-4 text-primary transition-transform' + (showAnswers ? ' rotate-180' : '')} />
                  </button>
                  <p className="text-xs text-muted-foreground">{student.grade}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  {/* (2026-و79) زرار إضافة طالب — طلب المستر: «يدوس إضافة طالب ويحط بيانات الطالب الثاني» */}
                  <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={function () { setAddMode('link'); setAddOpen(true) }}>
                    <UserPlus className="h-4 w-4" />
                    {T('إضافة طالب', 'Add Student')}
                  </Button>
                  {student.status === 'pending' && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 text-amber-700 dark:text-amber-400 px-3 py-1 text-xs font-bold">
                      <AlertCircle className="h-3.5 w-3.5" /> حساب ابنك في انتظار موافقة المستر
                    </span>
                  )}
                  {(student.status === 'approved' || student.status === 'paid') && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 px-3 py-1 text-xs font-bold">
                      حساب مفعل ✓
                    </span>
                  )}
                  {student.isPaidAccess && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-3 py-1 text-xs font-bold">
                      وصول مدفوع
                    </span>
                  )}
                </div>
              </div>

              {/* ملخص سريع */}
              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">متوسط الواجبات ({homeworks.length} واجب)</p>
                  <p className={'text-2xl font-extrabold mt-1 ' + (hwAvg === null ? 'text-muted-foreground' : scoreColor(hwAvg))}>{hwAvg === null ? '—' : hwAvg + '%'}</p>
                </div>
                <div className="rounded-xl border border-border bg-muted/30 p-3 text-center">
                  <p className="text-[11px] text-muted-foreground">متوسط الامتحانات ({exams.length} امتحان)</p>
                  <p className={'text-2xl font-extrabold mt-1 ' + (exAvg === null ? 'text-muted-foreground' : scoreColor(exAvg))}>{exAvg === null ? '—' : exAvg + '%'}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          !loading && (
            <Card className="border-amber-500/40">
              <CardContent className="p-5 flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
                <p className="text-sm text-foreground">حساب ابنك مش موجود في المنصة حاليًا — لو حصلت أي مشكلة تواصل مع المستر.</p>
              </CardContent>
            </Card>
          )
        )}

        {/* (2026-و39) كارت متابعة الفيديوهات — نسبة المشاهدة بتاعة الابن —
            بيتخفي لوحده لو البيانات مش متاحة (videos = null) */}
        {student && results && results.videos && (
          <Card className="border-primary/20">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <MonitorPlay className="h-4.5 w-4.5 text-primary" />
                <h2 className="font-bold text-sm">متابعة الفيديوهات</h2>
              </div>
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-sm font-semibold text-foreground">نسبة المشاهدة: {results.videos.percent}%</p>
                <p className="text-[11px] text-muted-foreground">
                  {results.videos.count === 0 ? 'ابنك لسه مافتحش أي فيديو' : 'ابنك خلص ' + results.videos.completed + ' من ' + results.videos.count + ' فيديو'}
                </p>
              </div>
              <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden" role="img" aria-label={'نسبة مشاهدة الفيديوهات ' + results.videos.percent + ' بالمئة'}>
                <div className="h-full rounded-full bg-primary/70" style={{ width: Math.min(100, Math.max(2, results.videos.percent)) + '%' }} />
              </div>
            </CardContent>
          </Card>
        )}

        {/* الواجبات */}
        {student && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="h-4.5 w-4.5 text-primary" />
                <h2 className="font-bold text-sm">الواجبات المسلمة</h2>
              </div>
              <ResultList
                rows={homeworks}
                icon="hw"
                emptyMsg="ابنك لسه ماسلمش أي واجب"
                type="homework"
                answersOpen={showAnswers}
                openId={openResultId}
                detailFor={function (id: string) { return answerDetails[id] || null }}
                loadingId={loadingDetailId}
                onToggle={toggleResultDetail}
              />
            </CardContent>
          </Card>
        )}

        {/* الامتحانات */}
        {student && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="h-4.5 w-4.5 text-primary" />
                <h2 className="font-bold text-sm">الامتحانات</h2>
              </div>
              <ResultList
                rows={exams}
                icon="ex"
                emptyMsg="ابنك لسه مااخدش أي امتحان"
                type="exam"
                answersOpen={showAnswers}
                openId={openResultId}
                detailFor={function (id: string) { return answerDetails[id] || null }}
                loadingId={loadingDetailId}
                onToggle={toggleResultDetail}
              />
            </CardContent>
          </Card>
        )}

        {student && (
          <p className="text-center text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <TrendingUp className="h-3.5 w-3.5" />
            الدرجات بتتحدث فورًا بعد كل واجب أو امتحان
          </p>
        )}
      </div>

      {/* (2026-و79) دايلوج إضافة طالب — ربط حساب موجود أو حساب جديد */}
      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><UserPlus className="h-4.5 w-4.5 text-primary" />إضافة طالب لحسابك</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={addMode === 'link' ? 'default' : 'outline'} className="flex-1 h-9" onClick={function () { setAddMode('link') }}>ربط حساب موجود</Button>
              <Button type="button" size="sm" variant={addMode === 'create' ? 'default' : 'outline'} className="flex-1 h-9" onClick={function () { setAddMode('create') }}>حساب جديد لابنك</Button>
            </div>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label className="text-xs">اسم الطالب {addMode === 'link' ? '(زي ما هو متسجل بالظبط)' : ''}</Label>
                <Input value={fName} onChange={function (e) { setFName(e.target.value) }} placeholder="مثال: أحمد محمد علي" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">رقم تليفون الطالب</Label>
                <Input value={fPhone} onChange={function (e) { setFPhone(e.target.value) }} placeholder="01xxxxxxxxx" dir="ltr" inputMode="numeric" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{addMode === 'link' ? 'باسورد الطالب في المنصة' : 'باسورد جديد للطالب'}</Label>
                <Input value={fPwd} onChange={function (e) { setFPwd(e.target.value) }} type="password" dir="ltr" />
              </div>
              {addMode === 'create' && (
                <div className="space-y-1">
                  <Label className="text-xs">الصف الدراسي</Label>
                  <Input value={fGrade} onChange={function (e) { setFGrade(e.target.value) }} placeholder="مثال: تالتة إعدادي" />
                </div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {addMode === 'link'
                ? 'هربط حساب ابنك الموجود بحسابك كولي أمر — لازم الرقم والاسم والباسورد تطابق حسابه، ورقم تليفونك يكون هو المسجل عليه كولي أمر.'
                : 'هنعمل حساب جديد لابنك بحالة «في انتظار موافقة المستر» — وبعد الموافقة هيبان في حسابك فورًا.'}
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={function () { setAddOpen(false) }} disabled={adding}>إلغاء</Button>
              <Button onClick={addStudent} disabled={adding || !fName.trim() || !fPhone.trim() || !fPwd.trim()}>
                {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
                إضافة
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
