'use client'

// FILE: src/components/admin/QuestionsEditor.tsx
// PURPOSE: Admin dialog to EDIT existing homework/exam questions:
//   - question text (with live FractionText preview — exactly what students see)
//   - MCQ: 4 options + which one is correct
//   - points, model answer (الإجابة النموذجية), accepted answers
//   - add / remove questions
// Saved via PUT {apiPath}/{itemId} with { questions: JSON.stringify(list) }.
// The teacher can fix a question that appeared wrong for a student, then
// press "إعادة تصحيح بالذكاء" on the result — everything updates in place.

import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Loader2, Plus, Trash2, Save, Eye, EyeOff } from 'lucide-react'
import { FractionText } from '@/components/FractionText'
import { repairCorruptMath } from '@/lib/math-text'

export interface EditableQuestion {
  type: string
  question: string
  options: string[]
  correct: number
  points: number
  modelAnswer: string
  acceptedAnswers: string[]
}

export function parseQuestionsRaw(raw: any): EditableQuestion[] {
  try {
    var arr = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(arr)) return []
    return arr.map(function (q: any) {
      var isWriting = q.type === 'writing' || q.type === 'essay'
      var options = Array.isArray(q.options) ? q.options.slice(0, 4) : []
      while (options.length < 4) options.push('')
      var allNA = options.length > 0 && options.every(function (o: string) { return !o || o === 'N/A' || o === 'لا يوجد' })
      if (!isWriting && (!Array.isArray(q.options) || q.options.length === 0 || allNA)) isWriting = true
      // heal JSON-corrupted math ("rac{", control chars) on load —
      // a simple open+save in this dialog permanently repairs the stored text
      return {
        type: isWriting ? 'writing' : 'mcq',
        question: repairCorruptMath(String(q.question || q.q || '')),
        options: isWriting ? ['', '', '', ''] : options.map(function (o) { return repairCorruptMath(String(o)) }),
        correct: typeof q.correct === 'number' ? q.correct : 0,
        points: typeof q.points === 'number' && q.points > 0 ? q.points : (isWriting ? 5 : 1),
        modelAnswer: repairCorruptMath(String(q.modelAnswer || q.answer || '')),
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers.map(function (a) { return repairCorruptMath(String(a)) }) : [],
      }
    })
  } catch (e) {
    return []
  }
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  apiPath: string
  itemId: string
  initialQuestionsRaw: any
  onSaved?: () => void
}

export function QuestionsEditorDialog({ open, onOpenChange, title, apiPath, itemId, initialQuestionsRaw, onSaved }: Props) {
  const initial = useMemo(() => parseQuestionsRaw(initialQuestionsRaw), [initialQuestionsRaw, open])
  const [questions, setQuestions] = useState<EditableQuestion[]>(initial)
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(function () {
    if (open) {
      setQuestions(parseQuestionsRaw(initialQuestionsRaw))
      setPreviewIdx(null)
    }
  }, [open, initialQuestionsRaw])

  const update = function (qi: number, patch: Partial<EditableQuestion>) {
    setQuestions(function (prev) {
      var next = prev.slice()
      next[qi] = Object.assign({}, next[qi], patch)
      return next
    })
  }

  const addQuestion = function (type: 'mcq' | 'writing') {
    setQuestions(function (prev) {
      return prev.concat([{
        type: type,
        question: '',
        options: type === 'mcq' ? ['', '', '', ''] : ['', '', '', ''],
        correct: 0,
        points: type === 'mcq' ? 1 : 5,
        modelAnswer: '',
        acceptedAnswers: [],
      }])
    })
  }

  const removeQuestion = function (qi: number) {
    setQuestions(function (prev) { return prev.filter(function (_, i) { return i !== qi }) })
  }

  const save = async function () {
    var emptyQ = questions.some(function (q) { return !q.question.trim() })
    if (emptyQ) { toast.error('فيه سؤال فاضي — اكتب نصه أو احذفه'); return }
    setSaving(true)
    try {
      var payload = questions.map(function (q) {
        if (q.type === 'writing') {
          return {
            type: 'writing',
            question: q.question,
            options: [],
            correct: -1,
            points: q.points || 5,
            modelAnswer: q.modelAnswer || '',
            acceptedAnswers: q.acceptedAnswers.filter(function (a) { return a.trim() }),
          }
        }
        return {
          type: 'mcq',
          question: q.question,
          options: q.options.map(function (o) { return o.trim() }),
          correct: q.correct,
          points: q.points || 1,
          modelAnswer: q.modelAnswer || '',
        }
      })
      var res = await fetch(apiPath + '/' + itemId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions: JSON.stringify(payload) }),
      })
      if (res.ok) {
        toast.success('تم حفظ الأسئلة ✓ — افتح نتيجة أي طالب ودوس "إعادة تصحيح بالذكاء" عشان الدرجات تتحدث')
        onOpenChange(false)
        if (onSaved) onSaved()
      } else {
        var d: any = {}
        try { d = await res.json() } catch (e) {}
        toast.error(d.error || 'خطأ في الحفظ', { duration: 8000 })
      }
    } catch (err: any) {
      toast.error('خطأ في الاتصال: ' + (err.message || ''), { duration: 8000 })
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto custom-scrollbar">
        <DialogHeader>
          <DialogTitle className="text-base">✏️ تعديل الأسئلة — {title}</DialogTitle>
          <p className="text-xs text-muted-foreground">
            عدّل نص السؤال أو الإجابة الصحيحة أو الإجابة النموذجية. بعد الحفظ، اعمل "إعادة تصحيح بالذكاء" لنتيجة أي طالب عشان يتصحح تاني بالتعديلات الجديدة.
          </p>
        </DialogHeader>

        <div className="space-y-3">
          {questions.map(function (q, qi) {
            var isWriting = q.type === 'writing'
            return (
              <div key={qi} className="border rounded-lg p-3 space-y-2 bg-card">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={'text-[10px] ' + (isWriting ? 'border-amber-500/40 text-amber-600' : 'border-emerald-500/40 text-emerald-600')}>
                      {isWriting ? 'مقالي' : 'اختياري'}
                    </Badge>
                    <span className="text-xs font-semibold text-muted-foreground">سؤال {qi + 1}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7"
                      title={previewIdx === qi ? 'إخفاء المعاينة' : 'معاينة زي ما الطالب يشوف'}
                      onClick={function () { setPreviewIdx(previewIdx === qi ? null : qi) }}>
                      {previewIdx === qi ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </Button>
                    <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                      title="حذف السؤال"
                      onClick={function () { removeQuestion(qi) }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>

                <Textarea
                  value={q.question}
                  onChange={function (e) { update(qi, { question: e.target.value }) }}
                  rows={2}
                  className="text-sm"
                  placeholder="نص السؤال… (يدعم الكسور \\frac{أ}{ب} والأسوس x^2)"
                />

                {previewIdx === qi && (
                  <div className="rounded-md border bg-muted/30 p-2.5 text-sm" dir="ltr" style={{ textAlign: 'left' }}>
                    <FractionText text={q.question} />
                    {!isWriting && q.options.some(function (o) { return o.trim() }) && (
                      <div className="mt-2 space-y-1">
                        {q.options.map(function (o, oi) {
                          if (!o.trim()) return null
                          return (
                            <p key={oi} className={'text-xs ' + (oi === q.correct ? 'text-emerald-600 font-bold' : '')}>
                              {String.fromCharCode(65 + oi)}. <FractionText text={o} />
                            </p>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )}

                {!isWriting && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {q.options.map(function (opt, oi) {
                      return (
                        <div key={oi} className="flex items-center gap-1.5">
                          <input
                            type="radio"
                            name={'correct-' + itemId + '-' + qi}
                            checked={q.correct === oi}
                            onChange={function () { update(qi, { correct: oi }) }}
                            className="accent-emerald-600"
                            title="الإجابة الصحيحة"
                          />
                          <Input
                            value={opt}
                            onChange={function (e) {
                              var newOpts = q.options.slice()
                              newOpts[oi] = e.target.value
                              update(qi, { options: newOpts })
                            }}
                            className="h-8 text-xs"
                            placeholder={'اختيار ' + String.fromCharCode(65 + oi)}
                          />
                        </div>
                      )
                    })}
                  </div>
                )}

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-[11px] text-muted-foreground whitespace-nowrap">الدرجة</Label>
                    <Input
                      type="number"
                      min={1}
                      value={q.points}
                      onChange={function (e) { update(qi, { points: Math.max(1, parseInt(e.target.value) || 1) }) }}
                      className="h-8 w-16 text-xs"
                    />
                  </div>
                  {!isWriting && (
                    <span className="text-[11px] text-emerald-600">
                      الصحيح: {String.fromCharCode(65 + (q.correct || 0))}
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">الإجابة النموذجية {isWriting ? '(بيتصحح بيها الذكاء الاصطناعي)' : '(اختياري)'}</Label>
                  <Textarea
                    value={q.modelAnswer}
                    onChange={function (e) { update(qi, { modelAnswer: e.target.value }) }}
                    rows={2}
                    className="text-xs"
                    placeholder="خطوات الحل والإجابة النهائية… (الذكاء يقبل أي صيغة مساوية رياضياً)"
                  />
                </div>

                {isWriting && (
                  <div className="space-y-1">
                    <Label className="text-[11px] text-muted-foreground">إجابات مقبولة (افصل بينهم بفاصلة ،)</Label>
                    <Input
                      value={q.acceptedAnswers.join(' ، ')}
                      onChange={function (e) {
                        var parts = e.target.value.split(/،|,/)
                        update(qi, { acceptedAnswers: parts.map(function (p) { return p.trim() }) })
                      }}
                      className="h-8 text-xs"
                      placeholder="مثال: 16 ، x=16 ، 2^4"
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={function () { addQuestion('mcq') }}>
            <Plus className="h-3.5 w-3.5 ml-1" /> سؤال اختياري
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={function () { addQuestion('writing') }}>
            <Plus className="h-3.5 w-3.5 ml-1" /> سؤال مقالي
          </Button>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={function () { onOpenChange(false) }}>إلغاء</Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
            حفظ الأسئلة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* Small round edit button used in list rows */
export function EditQuestionsButton({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 px-2.5 text-[11px] border-primary/40 text-primary hover:bg-primary/10 shrink-0"
      onClick={onClick}
      title="تعديل الأسئلة (النص / الاختيارات / الإجابة الصحيحة / النموذجية)"
    >
      ✏️ {label || 'تعديل الأسئلة'}
    </Button>
  )
}

/*
 * RegradeButton — admin "إعادة تصحيح بالذكاء" for ONE existing result.
 * kind: 'homework' → POST /api/homework/regrade   |  'exam' → POST /api/exams/regrade
 * Re-grades writing answers with the smart grader + re-scores MCQ against the
 * CURRENT questions, then calls onDone() so the parent reloads fresh numbers.
 */
export function RegradeButton({ kind, resultId, onDone }: { kind: 'homework' | 'exam'; resultId: string; onDone?: () => void }) {
  const [busy, setBusy] = useState(false)

  const regrade = async function () {
    if (busy) return
    setBusy(true)
    try {
      var res = await fetch('/api/' + (kind === 'homework' ? 'homework' : 'exams') + '/regrade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resultId: resultId }),
      })
      var d: any = {}
      try { d = await res.json() } catch (e) {}
      if (res.ok && d.success) {
        toast.success('اتصحح بالذكاء: ' + d.score + ' / ' + d.maxScore + ' ✓', { duration: 5000 })
        if (onDone) onDone()
      } else {
        toast.error(d.error || 'فشل إعادة التصحيح — جرب تاني', { duration: 8000 })
      }
    } catch (err: any) {
      toast.error('خطأ في الاتصال: ' + (err.message || ''), { duration: 8000 })
    }
    setBusy(false)
  }

  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-7 px-2 text-[10px] border-purple-500/40 text-purple-600 hover:bg-purple-500/10 shrink-0"
      onClick={regrade}
      disabled={busy}
      title="إعادة تصحيح النتيجة دي بالذكاء الاصطناعي (من غير ما الطالب يعيد) — بيقبل أي صيغة مساوية رياضياً للإجابة النموذجية"
    >
      {busy ? <Loader2 className="h-3 w-3 ml-1 animate-spin" /> : '🧠'}
      {busy ? 'بيصحح…' : 'إعادة تصحيح بالذكاء'}
    </Button>
  )
}
