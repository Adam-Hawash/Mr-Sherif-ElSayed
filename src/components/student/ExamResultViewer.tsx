'use client'
// ============================================================
// ExamResultViewer — «شوف نتيجتك» (2026-ي2 — طلب المستر)
// ============================================================
// الشكوى: ناس كتير مش عارفة تشوف درجة الامتحان مع إن خيار «إظهار
// النتيجة» (showResult) مفعّل — الدرجة كانت بتظهر مرة واحدة بس في
// اللحظة اللي بعد التسليم، وأول ما الطالب يدوس «العودة» بتختفي خالص
// وكارت الامتحان بيقول «تم تسليم الامتحان» من غير أي درجة.
//
// الحل: زرار دائم جوه كارت كل امتحان متسلّم (لو المستر مفعّل showResult
// للامتحان ده) بيعرض الدرجة دايمًا + مراجعة الأسئلة المقالية بالتصحيح
// الذكي — والطالب يقدر يفتحها في أي وقت ومن أي جهاز.
// البيانات من نفس endpoint نتايج الطالب المعتمد (/api/exam-results) —
// الامتحانات اللي showResult=0 فيها تفضل مقفولة بالحرف (قرار 2026-و12).
// ============================================================
import { useState, useEffect, useCallback, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { X, Loader2, RefreshCw, BarChart3, CheckCircle2 } from 'lucide-react'

type WritingItem = {
  question: string
  answer: string
  modelAnswer?: string
  isCorrect: boolean | null
  awardedPoints?: number
  maxPoints?: number
  feedback: string
  pending: boolean
}

/* تطبيع writingGrades — متسامح مع JSON نصي أو مصفوفة جاهزة (نفس منطق
   normalizeExamWritingItems في البورتال — بدون أسئلة المفتاح الناقص) */
function normWriting(raw: any): WritingItem[] {
  var src: any = null
  try {
    if (Array.isArray(raw)) src = raw
    else if (typeof raw === 'string' && raw.trim()) src = JSON.parse(raw)
  } catch (e) { return [] }
  if (!Array.isArray(src)) return []
  return src
    .filter(function (it: any) { return !(it && typeof it === 'object' && it.needsManualKey === true) })
    .map(function (it: any) {
      if (!it || typeof it !== 'object') return { question: '', answer: '', isCorrect: null, feedback: '', pending: true }
      var pending = it.gradingStatus === 'pending' || it.needsGrading === true || (it.isCorrect !== true && it.isCorrect !== false && it.isGraded !== true)
      return {
        question: it.question || it.q || '',
        answer: it.answer || it.studentAnswer || '',
        modelAnswer: it.modelAnswer || '',
        isCorrect: typeof it.isCorrect === 'boolean' ? it.isCorrect : null,
        awardedPoints: typeof it.awardedPoints === 'number' ? it.awardedPoints : undefined,
        maxPoints: typeof it.maxPoints === 'number' ? it.maxPoints : it.points,
        feedback: it.aiFeedback || it.feedback || '',
        pending: pending,
      }
    })
}

export function ExamResultViewer({
  studentId,
  examId,
  examTitle,
  result,
}: {
  studentId?: string
  examId: string
  examTitle?: string
  result?: any
}) {
  const [open, setOpen] = useState(false)
  const [live, setLive] = useState<any>(result || null)
  const [refreshing, setRefreshing] = useState(false)
  const autoRefreshRef = useRef(false)

  /* جلب/تحديث النتيجة — نفس endpoint نتايج الطالب (بيرجع الدرجة كاملة
     لما showResult=1، وبتحدث نفسها لو التصحيح الخلفي خلص) */
  const refresh = useCallback(function () {
    if (!studentId || !examId) return
    setRefreshing(true)
    fetch('/api/exam-results?studentId=' + encodeURIComponent(studentId) + '&examId=' + encodeURIComponent(examId))
      .then(function (r) { return r.ok ? r.json() : { results: [] } })
      .then(function (d) {
        var rr = d && Array.isArray(d.results) && d.results.length > 0 ? d.results[0] : null
        if (rr) setLive(function (prev: any) { return Object.assign({}, prev, rr) })
      })
      .catch(function () {})
      .finally(function () { setRefreshing(false) })
  }, [studentId, examId])

  // النتيجة مش جاية من الكارت (اتسلّم لسه) → نجيبها أول ما يتفتح الزرار
  useEffect(function () {
    if (open && !live) refresh()
  }, [open, live, refresh])

  // لو فيه مقالي لسه بيتصحح → تحديث تلقائي واحد بعد ~12 ثانية (نفس نمط البورتال)
  var writing: WritingItem[] = live ? normWriting(live.writingGrades) : []
  var anyPending = writing.some(function (w) { return w.pending })
  useEffect(function () {
    if (!open || !anyPending || autoRefreshRef.current) return
    autoRefreshRef.current = true
    var t = setTimeout(function () { refresh() }, 12000)
    return function () { clearTimeout(t) }
  }, [open, anyPending, refresh])

  // ESC يقفل + منع سكرول الخلفية (زي مودالات البورتال)
  useEffect(function () {
    if (!open) return
    var onKey = function (e: KeyboardEvent) { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    var prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return function () {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [open])

  var hasScore = !!(live && typeof live.score === 'number')
  var maxScore = live && typeof live.maxScore === 'number' && live.maxScore > 0 ? live.maxScore : 0
  var pct = hasScore && maxScore > 0 ? Math.round((live.score / maxScore) * 100) : null

  return (
    <>
      {/* الزرار الدائم في كارت الامتحان — الدرجة ظاهرة عليه مباشرة */}
      <button
        type="button"
        onClick={function () { setOpen(true) }}
        className="inline-flex items-center gap-1.5 min-h-[32px] h-8 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
        aria-label="شوف نتيجتك ودرجتك في الامتحان"
      >
        <BarChart3 className="h-3.5 w-3.5 shrink-0" />
        {hasScore ? (
          <span>درجتك: <span dir="ltr" className="tabular-nums">{live.score}/{maxScore || '؟'}</span> — شوف ورقتك</span>
        ) : (
          <span>شوف نتيجتك 📊</span>
        )}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[300] bg-black/70 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-6 overflow-y-auto"
          onClick={function () { setOpen(false) }}
          role="dialog"
          aria-modal="true"
          aria-label="نتيجة الامتحان"
        >
          <div className="w-full max-w-2xl my-4" onClick={function (e) { e.stopPropagation() }}>
            <Card className="border-emerald-500/30 shadow-2xl">
              <CardContent className="p-4 sm:p-5 space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-bold text-emerald-600 flex items-center gap-1.5">
                      <BarChart3 className="h-4 w-4" /> نتيجتك
                    </p>
                    {examTitle && <h3 className="font-bold text-sm truncate mt-0.5">{examTitle}</h3>}
                  </div>
                  <button
                    type="button"
                    aria-label="إغلاق"
                    onClick={function () { setOpen(false) }}
                    className="h-9 w-9 shrink-0 rounded-full bg-muted hover:bg-muted/70 flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {/* الدرجة الكلية — واضحة وكبيرة */}
                {hasScore ? (
                  <div className="flex items-center gap-3 p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                    <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-lg text-emerald-700 dark:text-emerald-400" dir="ltr">
                        {live.score} / {maxScore || '؟'}
                      </p>
                      {pct !== null && <p className="text-[11px] font-semibold text-emerald-600">{pct}%</p>}
                    </div>
                  </div>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-sm font-semibold text-amber-700 dark:text-amber-400">
                    درجتك بتتحسب دلوقتي — دوس «تحديث» بعد لحظات
                  </div>
                )}

                {/* مراجعة الأسئلة المقالية بالتصحيح الذكي */}
                {writing.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-sm font-semibold">مراجعة الأسئلة المقالية:</p>
                    <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-2 pl-0.5">
                      {writing.map(function (w: WritingItem, wi: number) {
                        return (
                          <Card key={'wg-' + wi} className={w.pending ? 'border-amber-200 dark:border-amber-900/40' : w.isCorrect ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-red-200 dark:border-red-900/40'}>
                            <CardContent className="p-3 space-y-2">
                              <div className="flex items-start gap-2">
                                <span className={'shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ' + (w.pending ? 'bg-amber-500/10 text-amber-600' : w.isCorrect ? 'bg-emerald-500/10 text-emerald-600' : ((w.awardedPoints || 0) > 0 && (w.answer || '').trim()) ? 'bg-amber-500/10 text-amber-600' : 'bg-red-500/10 text-red-600')}>
                                  {w.pending ? 'بيتصحح دلوقتي' : w.isCorrect ? 'صحيحة ✓' : ((w.awardedPoints || 0) > 0 && (w.answer || '').trim()) ? 'جزئية' : ((w.answer || '').trim() ? 'غير صحيحة' : 'فاضية')}
                                </span>
                                <p className="text-sm font-medium flex-1 whitespace-pre-wrap break-words" dir="auto">{wi + 1}. {w.question}</p>
                              </div>
                              {!w.pending && w.feedback && (
                                <div className={'p-3 rounded-xl border-2 ' + (w.isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800')}>
                                  <p className={'text-xs font-bold mb-1 ' + (w.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                                    📝 ملاحظة المصحح الذكي:
                                  </p>
                                  <p className="text-xs leading-relaxed whitespace-pre-wrap break-words">{w.feedback}</p>
                                </div>
                              )}
                              <p className="text-xs whitespace-pre-wrap break-words" dir="auto">إجابتك: {w.answer || '(فارغ)'}</p>
                              {w.modelAnswer && <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="auto">الإجابة النموذجية: {w.modelAnswer}</p>}
                              {!w.pending && w.awardedPoints !== undefined && (
                                <p className="text-[10px] font-semibold text-muted-foreground">الدرجة: {w.awardedPoints}/{w.maxPoints ?? '؟'}</p>
                              )}
                            </CardContent>
                          </Card>
                        )
                      })}
                    </div>
                    {anyPending && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                        <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400 flex-1">فيه أسئلة بتصحح بالذكاء الاصطناعي — النتيجة النهائية هتتحدث تلقائيًا</p>
                      </div>
                    )}
                  </div>
                )}

                <Button variant="outline" className="w-full min-h-[44px]" disabled={refreshing} onClick={refresh}>
                  {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                  تحديث النتيجة
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
