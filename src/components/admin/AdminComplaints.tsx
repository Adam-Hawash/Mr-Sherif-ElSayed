'use client'
// ============================================================
// صفحة الشكاوي — لوحة الأدمن
// كل شكوى من أي طالب (أو جاية من المساعد الذكي) تظهر هنا بس —
// الأدمن يشوفها ويرد عليها ويعلمها "تم الحل".
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Flag, CheckCircle2, Clock3, RefreshCw, User, Phone, GraduationCap, Bot, MessageSquareReply, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'

type Complaint = {
  id: string
  studentId: string
  studentName: string
  phone: string
  grade: string
  message: string
  summary: string
  source: string
  status: string
  reply: string
  createdAt: string
}

export function AdminComplaints() {
  const [items, setItems] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'new' | 'resolved'>('all')
  const [busyId, setBusyId] = useState('')
  const [replyFor, setReplyFor] = useState('')
  const [replyText, setReplyText] = useState('')

  const load = useCallback(async function () {
    setLoading(true)
    try {
      const res = await fetch('/api/complaints')
      const data = await res.json()
      setItems(Array.isArray(data.complaints) ? data.complaints : [])
    } catch (e) {
      toast.error('حصلت مشكلة في تحميل الشكاوى')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(function () { load() }, [load])

  async function patch(id: string, body: any) {
    setBusyId(id)
    try {
      const res = await fetch('/api/complaints/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'مش قادر يحفظ — جرب تاني')
        return
      }
      toast.success(data.message || 'تم الحفظ ✅')
      setReplyFor(''); setReplyText('')
      load()
    } catch (e) {
      toast.error('الشبكة فيها مشكلة')
    } finally {
      setBusyId('')
    }
  }

  const filtered = items.filter(function (c) {
    if (filter === 'new') return c.status === 'new'
    if (filter === 'resolved') return c.status === 'resolved'
    return true
  })
  const newCount = items.filter(function (c) { return c.status === 'new' }).length

  return (
    <Card>
      <CardContent className="p-4 sm:p-6 space-y-4">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-base flex items-center gap-2">
              <Flag className="h-5 w-5 text-primary" />
              الشكاوي | Complaints
            </h3>
            {newCount > 0 && (
              <Badge className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 text-[10px]">{newCount} جديدة</Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="outline" size="sm" onClick={load}><RefreshCw className="h-3.5 w-3.5 ml-1" />تحديث</Button>
          </div>
        </div>

        {/* فلاتر */}
        <div className="flex gap-1.5 flex-wrap">
          {([
            ['all', 'الكل'],
            ['new', 'الجديدة'],
            ['resolved', 'المحلولة'],
          ] as const).map(function (f) {
            const active = filter === f[0]
            return (
              <button
                key={f[0]}
                onClick={function () { setFilter(f[0]) }}
                className={'px-3 py-1.5 rounded-full text-xs font-medium border transition-colors min-h-[36px] ' + (active
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:text-foreground')}
              >
                {f[1]}
              </button>
            )
          })}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtered.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-10">مفيش شكاوى هنا — كله تمام ✅</p>
        ) : (
          <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
            {filtered.map(function (c) {
              const resolved = c.status === 'resolved'
              const isReplying = replyFor === c.id
              return (
                <div key={c.id} className={'rounded-xl border p-3.5 space-y-2.5 ' + (resolved ? 'opacity-70' : '')}>
                  {/* رأس الشكوى */}
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge variant="secondary" className="gap-1 text-[11px]"><User className="h-3 w-3" />{c.studentName || 'طالب'}</Badge>
                      {c.phone && <Badge variant="secondary" className="gap-1 text-[11px]" dir="ltr"><Phone className="h-3 w-3" />{c.phone}</Badge>}
                      {c.grade && <Badge variant="secondary" className="gap-1 text-[11px]"><GraduationCap className="h-3 w-3" />{c.grade}</Badge>}
                      {c.source === 'ai' && (
                        <Badge variant="outline" className="text-[10px] gap-1 text-purple-600 border-purple-300 dark:text-purple-400"><Bot className="h-3 w-3" />المساعد الذكي سجلها</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {resolved
                        ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1"><CheckCircle2 className="h-3 w-3" />تم الحل</Badge>
                        : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:text-amber-400 gap-1"><Clock3 className="h-3 w-3" />جديدة</Badge>}
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                        {' • '}
                        {new Date(c.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  </div>

                  {/* نص الشكوى */}
                  <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{c.message}</p>

                  {/* رد سابق */}
                  {c.reply ? (
                    <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
                      <p className="text-[10px] font-bold text-primary mb-1">ردك للطالب:</p>
                      <p className="text-xs whitespace-pre-wrap break-words">{c.reply}</p>
                    </div>
                  ) : null}

                  {/* أزرار التحكم */}
                  <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                    {isReplying ? (
                      <div className="w-full space-y-2">
                        <textarea
                          value={replyText}
                          onChange={function (e) { setReplyText(e.target.value) }}
                          placeholder="اكتب ردك للطالب... (هيشوفه في صفحة الشكاوي عنده)"
                          rows={2}
                          maxLength={2000}
                          className="w-full rounded-xl border bg-background px-3 py-2 text-sm resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
                        />
                        <div className="flex gap-1.5 flex-wrap">
                          <Button size="sm" disabled={busyId === c.id || !replyText.trim()}
                            onClick={function () { patch(c.id, { reply: replyText.trim(), status: 'resolved' }) }}>
                            {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" /> : <MessageSquareReply className="h-3.5 w-3.5 ml-1" />}
                            ابعته واعتبرها اتحلت
                          </Button>
                          <Button size="sm" variant="outline" disabled={busyId === c.id || !replyText.trim()}
                            onClick={function () { patch(c.id, { reply: replyText.trim() }) }}>
                            ابعت من غير ما تقفلها
                          </Button>
                          <Button size="sm" variant="ghost" onClick={function () { setReplyFor(''); setReplyText('') }}>إلغاء</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <Button size="sm" variant="outline" onClick={function () { setReplyFor(c.id); setReplyText(c.reply || '') }}>
                          <MessageSquareReply className="h-3.5 w-3.5 ml-1" />رد
                        </Button>
                        {!resolved ? (
                          <Button size="sm" variant="outline" className="text-emerald-600 border-emerald-300 hover:bg-emerald-50 dark:text-emerald-400"
                            disabled={busyId === c.id}
                            onClick={function () { patch(c.id, { status: 'resolved' }) }}>
                            {busyId === c.id ? <Loader2 className="h-3.5 w-3.5 ml-1 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 ml-1" />}
                            تم الحل
                          </Button>
                        ) : (
                          <Button size="sm" variant="ghost" className="text-muted-foreground" disabled={busyId === c.id}
                            onClick={function () { patch(c.id, { status: 'new' }) }}>
                            <RotateCcw className="h-3.5 w-3.5 ml-1" />رجعه للجديد
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
