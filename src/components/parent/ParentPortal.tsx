'use client'

// ============================================================
// (2026-و37) بورتال ولي أمر — متابعة نتايج الابن:
//   - كارت ببيانات الطالب (الاسم/الصف/حالة الحساب)
//   - الواجبات: كل واجب بدرجته ومن النهاية الكلية
//   - الامتحانات: كل امتحان بدرجته
// البيانات جاية من /api/parent/results — مفيش أي تعديل، متابعة بس
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import { UserCheck, Loader2, RefreshCw, LogOut, BookOpenCheck, ClipboardList, AlertCircle, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

interface ResultRow {
  id: string
  homeworkId?: string
  examId?: string
  title: string
  score: number
  maxScore: number
  submittedAt: string
}

interface ParentResultsData {
  student: { id: string; name: string; grade: string; status: string; isPaidAccess: boolean } | null
  homeworks: ResultRow[]
  exams: ResultRow[]
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

function ResultList({ rows, icon, emptyMsg }: { rows: ResultRow[]; icon: 'hw' | 'ex'; emptyMsg: string }) {
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
        return (
          <div key={r.id} className="flex items-center gap-3 rounded-xl border border-border bg-card px-3 py-2.5">
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
          </div>
        )
      })}
    </div>
  )
}

export function ParentPortal() {
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

  var load = useCallback(async function () {
    if (!currentParent || !currentParent.id) return
    setLoading(true)
    try {
      var res = await fetch('/api/parent/results?parentId=' + encodeURIComponent(currentParent.id), { cache: 'no-store' })
      var json = await res.json()
      if (res.ok) setResults(json)
      else toast.error(json.error || 'حصلت مشكلة في تحميل البيانات', { duration: 8000 })
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
    }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentParent && currentParent.id])

  useEffect(function () {
    if (!currentParent) {
      setView('parent-login')
      return
    }
    load()
  }, [currentParent, load, setView])

  if (!currentParent) return null

  var student = results ? results.student : (currentParent.student || null)
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
                  <h1 className="text-lg font-bold text-foreground">{currentParent.name || 'ولي أمر'}</h1>
                  <p className="text-xs text-muted-foreground">متابعة حساب الابن في المنصة</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={function () { load() }} disabled={loading} className="h-9">
                    {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    <span className="sr-only">تحديث</span>
                  </Button>
                  <Button size="sm" variant="outline" onClick={function () { setCurrentParent(null); setView('landing') }} className="h-9">
                    <LogOut className="h-4 w-4" />
                    <span className="hidden sm:inline">خروج</span>
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* كارت الطالب */}
        {student ? (
          <Card className="border-primary/20">
            <CardContent className="p-5">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] text-muted-foreground mb-0.5">الطالب</p>
                  <p className="text-lg font-bold text-foreground truncate">{student.name}</p>
                  <p className="text-xs text-muted-foreground">{student.grade}</p>
                </div>
                <div className="flex flex-col items-end gap-1.5">
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

        {/* الواجبات */}
        {student && (
          <Card>
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-2">
                <BookOpenCheck className="h-4.5 w-4.5 text-primary" />
                <h2 className="font-bold text-sm">الواجبات المسلمة</h2>
              </div>
              <ResultList rows={homeworks} icon="hw" emptyMsg="ابنك لسه ماسلمش أي واجب" />
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
              <ResultList rows={exams} icon="ex" emptyMsg="ابنك لسه مااخدش أي امتحان" />
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
    </div>
  )
}
