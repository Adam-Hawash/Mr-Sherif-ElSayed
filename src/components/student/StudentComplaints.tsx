'use client'
// ============================================================
// صفحة الشكاوي — واجهة الطالب
// الطالب يكتب مشكلته، والاسم والتليفون بيتحطوا تلقائي من حسابه.
// الشكوى بتوصل للإدارة بس، والطالب يشوف شكاواه هو حالتها والرد عليها.
// ============================================================
import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Loader2, Send, MessageSquarePlus, CheckCircle2, Clock3, User, Phone, GraduationCap, Bot } from 'lucide-react'
import { toast } from 'sonner'

type Complaint = {
  id: string
  message: string
  summary: string
  source: string
  status: string
  reply: string
  createdAt: string
}

export function StudentComplaints({ studentId, studentName, studentPhone, grade }: {
  studentId: string
  studentName: string
  studentPhone: string
  grade: string
}) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [mine, setMine] = useState<Complaint[]>([])
  const [loading, setLoading] = useState(true)

  const loadMine = useCallback(async function () {
    if (!studentId) return
    try {
      const res = await fetch('/api/complaints?studentId=' + encodeURIComponent(studentId))
      const data = await res.json()
      setMine(Array.isArray(data.complaints) ? data.complaints : [])
    } catch (e) {
      // صامت — القائمة مش حرجة
    } finally {
      setLoading(false)
    }
  }, [studentId])

  useEffect(function () { loadMine() }, [loadMine])

  async function submit() {
    const msg = message.trim()
    if (msg.length < 3) {
      toast.error('اكتب المشكلة الأول 🙂')
      return
    }
    setSending(true)
    try {
      const res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, message: msg }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'حصلت مشكلة — جرب تاني')
        return
      }
      toast.success(data.message || 'وصلت شكواك للمستر ✅')
      setMessage('')
      loadMine()
    } catch (e) {
      toast.error('الشبكة فيها مشكلة — جرب تاني')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      {/* كارت إرسال شكوى */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <MessageSquarePlus className="h-5 w-5 text-primary" />
            عندك مشكلة؟ اكتبها هنا
          </CardTitle>
          <p className="text-xs text-muted-foreground">مشكلتك هتوصل للمستر شخصيًا وبيتصلحها بإذن الله</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* بيانات الطالب — تلقائي من حسابه */}
          <div className="flex flex-wrap gap-2">
            <Badge variant="secondary" className="gap-1 py-1.5"><User className="h-3 w-3" />{studentName || 'طالب'}</Badge>
            {studentPhone && <Badge variant="secondary" className="gap-1 py-1.5" dir="ltr"><Phone className="h-3 w-3" />{studentPhone}</Badge>}
            {grade && <Badge variant="secondary" className="gap-1 py-1.5"><GraduationCap className="h-3 w-3" />{grade}</Badge>}
          </div>
          <textarea
            value={message}
            onChange={function (e) { setMessage(e.target.value) }}
            placeholder="اكتب مشكلتك بالتفصيل... (مثال: الفيديو مش بيفتح / الواجب مش نازل / عاوز أفهم حاجة في الحصة)"
            rows={4}
            maxLength={4000}
            className="w-full rounded-xl border bg-background px-3 py-2.5 text-sm min-h-[96px] resize-y focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] text-muted-foreground">{message.length}/4000</span>
            <Button onClick={submit} disabled={sending || message.trim().length < 3} className="min-h-[44px]">
              {sending ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Send className="h-4 w-4 ml-1" />}
              ابعت الشكوى
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* شكاوايا الطالب */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">شكاواياي ({mine.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : mine.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-6">لسه مبعتش أي شكاوى</p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto pr-1" style={{ scrollbarWidth: 'thin' }}>
              {mine.map(function (c) {
                const resolved = c.status === 'resolved'
                return (
                  <div key={c.id} className="rounded-xl border p-3 space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5">
                        {c.source === 'ai'
                          ? <Badge variant="outline" className="text-[10px] gap-1"><Bot className="h-3 w-3" />عن طريق المساعد الذكي</Badge>
                          : null}
                        {resolved
                          ? <Badge className="text-[10px] bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 gap-1"><CheckCircle2 className="h-3 w-3" />تم الحل</Badge>
                          : <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 dark:text-amber-400 gap-1"><Clock3 className="h-3 w-3" />قيد المراجعة</Badge>}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(c.createdAt).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })}
                        {' • '}
                        {new Date(c.createdAt).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap break-words">{c.message}</p>
                    {c.reply ? (
                      <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
                        <p className="text-[10px] font-bold text-primary mb-1">الرد عليك:</p>
                        <p className="text-xs whitespace-pre-wrap break-words">{c.reply}</p>
                      </div>
                    ) : null}
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
