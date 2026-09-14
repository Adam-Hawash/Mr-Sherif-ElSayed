'use client'

// ============================================================
// AdminItemAnalytics — (2026-و38) قسم «تحليلات الأسئلة» — طلب المستر:
//   «قسم جديد في صفحة الأدمن مكتوب فيه كل الامتحانات بتاع المنصة وكل
//   الواجبات، ولما أضغط عليه يكون موجود إيه أكتر سؤال الطلاب غلطت فيه
//   في الامتحان ده أو في الواجب ده، ويكون مكتوب فوقيه أسامي الطلاب
//   اللي غلطت فيه لو أنا دوست»
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, BarChart3, FileText, ClipboardList, ArrowRight, ChevronDown, Users, AlertTriangle, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'

type ItemRow = { id: string; title: string; grade: string; createdAt?: string; submissions: number }
type WrongStudent = { name: string; phone: string; answerText: string }
type QStat = {
  idx: number
  text: string
  kind: 'mcq' | 'writing'
  options: string[]
  correctText: string
  keyless: boolean
  attempts: number
  wrong: number
  wrongStudents: WrongStudent[]
}

function fmtDate(d: any): string {
  try {
    if (!d) return ''
    return new Date(d).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch (e) { return '' }
}

function QuestionRow({ q, top }: { q: QStat; top: boolean }) {
  const [open, setOpen] = useState(top)
  var pct = q.attempts > 0 ? Math.round((q.wrong / q.attempts) * 100) : 0
  return (
    <div className={'rounded-xl border p-3 space-y-2 ' + (top ? 'border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20' : 'bg-card')}>
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          {top && <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />}
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground leading-relaxed break-words">{q.text || '(سؤال من غير نص)'}</p>
            <div className="flex items-center gap-1.5 flex-wrap mt-1">
              <Badge variant="secondary" className="text-[10px]">{q.kind === 'mcq' ? 'اختيارات' : 'مقالي'}</Badge>
              {q.keyless && <Badge className="text-[10px] bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">مفتاح ناقص — محتاج مراجعة</Badge>}
              <span className="text-[11px] text-muted-foreground">غلط: {q.wrong} من {q.attempts} ({pct}%)</span>
            </div>
          </div>
        </div>
        <div className="shrink-0 flex flex-col items-end gap-1.5">
          <div className="w-20 h-2 rounded-full bg-muted overflow-hidden" role="img" aria-label={'نسبة الغلط ' + pct + ' بالمئة'}>
            <div className={(pct >= 50 ? 'bg-red-500' : pct >= 25 ? 'bg-amber-500' : 'bg-emerald-500') + ' h-full rounded-full'} style={{ width: pct + '%' }} />
          </div>
          {q.wrong > 0 && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={function () { setOpen(!open) }}>
              <Users className="h-3 w-3" />اللي غلطوا ({q.wrong})
              <ChevronDown className={'h-3 w-3 transition-transform' + (open ? ' rotate-180' : '')} />
            </Button>
          )}
        </div>
      </div>
      {q.kind === 'mcq' && q.options.length > 0 && (
        <div className="text-[11px] text-muted-foreground space-y-0.5 pr-1">
          {q.options.map(function (o: string, oi: number) {
            return <div key={oi} className={(!q.keyless && q.correctText.indexOf(String.fromCharCode(65 + oi) + ')') === 0) ? 'text-emerald-700 dark:text-emerald-400 font-semibold' : ''}>{String.fromCharCode(65 + oi)}) {o}</div>
          })}
        </div>
      )}
      {(q.kind === 'writing' || q.correctText) && (
        <p className="text-[11px] text-emerald-700 dark:text-emerald-400 pr-1"><span className="font-semibold">الإجابة الصحيحة:</span> {q.correctText || '—'}</p>
      )}
      {open && q.wrongStudents.length > 0 && (
        <div className="border-t pt-2 space-y-1 max-h-52 overflow-y-auto custom-scrollbar">
          <p className="text-[11px] font-semibold text-muted-foreground">أسامي الطلاب اللي غلطت في السؤال ده:</p>
          {q.wrongStudents.map(function (s: WrongStudent, i: number) {
            return (
              <div key={i} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50">
                <span className="text-xs font-medium truncate">{s.name} <span className="text-muted-foreground" dir="ltr">({s.phone})</span></span>
                <span className="text-[10px] text-muted-foreground shrink-0 max-w-[45%] truncate">{s.answerText}</span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function AdminItemAnalytics() {
  const adminId = useAppStore(function (s) { return s.currentAdmin?.id || '' })
  const [lists, setLists] = useState<{ exams: ItemRow[]; homeworks: ItemRow[] }>({ exams: [], homeworks: [] })
  const [loading, setLoading] = useState(true)
  const [query, setQuery] = useState('')
  const [detail, setDetail] = useState<{ item: any; questions: QStat[] } | null>(null)
  const [detailLoading, setDetailLoading] = useState(false)

  var loadLists = useCallback(async function () {
    if (!adminId) return
    setLoading(true)
    try {
      var res = await fetch('/api/admin/item-analytics?adminId=' + encodeURIComponent(adminId))
      var data = await res.json()
      if (res.ok) setLists({ exams: Array.isArray(data.exams) ? data.exams : [], homeworks: Array.isArray(data.homeworks) ? data.homeworks : [] })
      else toast.error(data.error || 'خطأ في تحميل التحليلات')
    } catch (e) { toast.error('خطأ في الاتصال') }
    setLoading(false)
  }, [adminId])

  useEffect(function () { loadLists() }, [loadLists])

  var openItem = async function (type: 'exam' | 'homework', row: ItemRow) {
    setDetailLoading(true)
    setDetail(null)
    try {
      var res = await fetch('/api/admin/item-analytics?adminId=' + encodeURIComponent(adminId) + '&type=' + type + '&id=' + encodeURIComponent(row.id))
      var data = await res.json()
      if (res.ok) setDetail({ item: data.item, questions: Array.isArray(data.questions) ? data.questions : [] })
      else toast.error(data.error || 'خطأ في تحميل التفاصيل')
    } catch (e) { toast.error('خطأ في الاتصال') }
    setDetailLoading(false)
  }

  var q = query.trim().toLowerCase()
  var fExams = q ? lists.exams.filter(function (e) { return (e.title || '').toLowerCase().indexOf(q) !== -1 }) : lists.exams
  var fHws = q ? lists.homeworks.filter(function (h) { return (h.title || '').toLowerCase().indexOf(q) !== -1 }) : lists.homeworks

  function ItemList({ rows, type, icon, label }: { rows: ItemRow[]; type: 'exam' | 'homework'; icon: any; label: string }) {
    var Icon = icon
    return (
      <div className="space-y-2">
        <p className="text-sm font-bold text-foreground flex items-center gap-1.5"><Icon className="h-4 w-4 text-primary" />{label} ({rows.length})</p>
        {rows.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">مفيش عناصر لسه</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
            {rows.map(function (r) {
              return (
                <button key={r.id} type="button"
                  className="w-full text-right p-2.5 rounded-lg border bg-card hover:bg-muted/60 transition-colors cursor-pointer flex items-center justify-between gap-2"
                  onClick={function () { openItem(type, r) }}>
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{r.title}</p>
                    <p className="text-[10px] text-muted-foreground">{r.grade}{r.createdAt ? ' — ' + fmtDate(r.createdAt) : ''}</p>
                  </div>
                  <Badge variant="secondary" className="text-[10px] shrink-0">{r.submissions} تسليم</Badge>
                </button>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  /* أكتر سؤال غلط = أول سؤال في القايمة (المرتبة) اللي فيه غلطات فعلية */
  var topWrong: QStat | null = null
  if (detail) {
    for (var ti = 0; ti < detail.questions.length; ti++) {
      var tq = detail.questions[ti]
      if (!tq.keyless && tq.wrong > 0) { topWrong = tq; break }
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary" />تحليلات الأسئلة</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">اختار امتحان أو واجب — هتشوف أكتر سؤال الطلاب غلطت فيه وأساميهم بالظبط</p>
          </div>
          {detail && (
            <Button size="sm" variant="outline" className="h-8 text-xs gap-1" onClick={function () { setDetail(null) }}>
              <ArrowRight className="h-3.5 w-3.5" />رجوع لكل العناصر
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : detailLoading ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <p className="text-xs text-muted-foreground">جاري تحليل أسئلة العنصر…</p>
          </div>
        ) : detail ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-sm font-bold">{detail.item.title} <span className="text-muted-foreground font-normal text-xs">({detail.item.type === 'exam' ? 'امتحان' : 'واجب'} — {detail.item.grade})</span></p>
              <Badge variant="secondary" className="text-[10px]">{detail.item.submissions} تسليم</Badge>
            </div>
            {topWrong && (
              <div className="rounded-xl border border-red-300 bg-red-50/60 dark:border-red-900 dark:bg-red-950/20 p-3">
                <p className="text-xs font-bold text-red-700 dark:text-red-400 mb-1">🔴 أكتر سؤال الطلاب غلطت فيه — {topWrong.wrong} طالب غلط من {topWrong.attempts} ({topWrong.attempts > 0 ? Math.round((topWrong.wrong / topWrong.attempts) * 100) : 0}%)</p>
                <p className="text-sm font-semibold text-foreground leading-relaxed">{topWrong.text}</p>
                {topWrong.correctText && <p className="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1">الإجابة الصحيحة: {topWrong.correctText}</p>}
                <p className="text-[11px] text-muted-foreground mt-1.5">اضغط «اللي غلطوا ({topWrong.wrong})» تحت عشان تشوف أسامي الطلاب اللي غلطت في السؤال ده</p>
              </div>
            )}
            {detail.questions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">مفيش أسئلة مسجلة للعنصر ده</p>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                {detail.questions.map(function (qq) {
                  return <QuestionRow key={qq.idx} q={qq} top={topWrong != null && qq.idx === topWrong.idx} />
                })}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input value={query} onChange={function (e) { setQuery(e.target.value) }} placeholder="بحث باسم الامتحان أو الواجب" className="h-9 pr-8 text-sm" />
            </div>
            <ItemList rows={fExams} type="exam" icon={FileText} label="الامتحانات" />
            <ItemList rows={fHws} type="homework" icon={ClipboardList} label="الواجبات" />
          </div>
        )}
      </CardContent>
    </Card>
  )
}
