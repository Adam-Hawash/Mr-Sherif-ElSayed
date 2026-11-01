/* ============================================================
   WhatsAppParentDialog — رسالة واتساب لولي الأمر (و81)
   منقول 1:1 من Maths-Genius (MG-1 + MG-2) ومتكيّف على بنية اللوحة هنا:
   - القالب المصري الودود من الداتابيز (أو الافتراضي في lib/parent-message)
   - سحب نتايج الطالب من /api/admin/reports?type=student
   - الرقم المفضل: ولي الأمر (parentPhone) — وإلا موبايل الطالب
   - أزرار: إرسال عبر المنصة (/api/admin/messages/send — لو مفيش مزود
     مفعّل بيرجع waLink ونفتحه زي الإرسال اليدوي) + إرسال واتساب wa.me
     (الحل المجاني 100%) + نسخ الرسالة + حفظ كقالب افتراضي
   - مشترك بين «إدارة الطلاب» و«طلابي» عشان نفس الـ UX في الحتتين
   ============================================================ */
import { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { MessageCircle, Send, Copy, Save, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { normalizeWaPhone, DEFAULT_PARENT_TEMPLATE, fillParentTemplate, buildParentMsgData } from '@/lib/parent-message'

export interface WaStudent {
  id: string
  name: string
  phone: string
  parentPhone?: string
}

export function WhatsAppParentDialog({ student, onOpenChange }: { student: WaStudent | null; onOpenChange: (open: boolean) => void }) {
  const [waMessage, setWaMessage] = useState('')
  const [waLoading, setWaLoading] = useState(false)
  const [waSending, setWaSending] = useState(false)
  const [waSavingTpl, setWaSavingTpl] = useState(false)
  /* الرقم بيتحدد من بيانات الطالب أولًا — ولو التقرير رجّع رقم ولي الأمر
     محفوظ على حساب الابن بنحدّثه (نفس سلوك MG) */
  const [parentPhoneFromReport, setParentPhoneFromReport] = useState('')

  useEffect(function () {
    if (!student || !student.id) return
    setWaMessage('')
    setParentPhoneFromReport('')
    setWaLoading(true)
    const reportP = fetch('/api/admin/reports?type=student&id=' + encodeURIComponent(student.id)).then((r) => r.json())
    const tplP = fetch('/api/admin/parent-msg-template').then((r) => r.json()).catch(() => null)
    Promise.all([reportP, tplP])
      .then(([data, tplData]) => {
        const tpl = (tplData && tplData.template) || (tplData && tplData.fallback) || DEFAULT_PARENT_TEMPLATE
        if (data && data.student && data.student.parentPhone) setParentPhoneFromReport(String(data.student.parentPhone))
        setWaMessage(fillParentTemplate(tpl, buildParentMsgData((student && student.name) || (data && data.student && data.student.name) || '', data || {})))
      })
      .catch(() => {
        setWaMessage(fillParentTemplate(DEFAULT_PARENT_TEMPLATE, buildParentMsgData((student && student.name) || '', null)))
        toast.error('معرفش أجيب نتايج الطالب من السيرفر — الرسالة هتتبعت من غير نتايج')
      })
      .finally(() => setWaLoading(false))
  }, [student && student.id])

  /* الرقم المفضل: ولي الأمر (parentPhone) لو صالح — وإلا موبايل الطالب نفسه */
  const waPhone = student
    ? (normalizeWaPhone(parentPhoneFromReport || '') || normalizeWaPhone(student.parentPhone || '') || normalizeWaPhone(student.phone || ''))
    : ''
  const waPhoneIsParent = !!(student && (normalizeWaPhone(parentPhoneFromReport || '') || normalizeWaPhone(student.parentPhone || '')))

  const sendWa = () => {
    if (!waPhone) { toast.error('مفيش رقم موبايل صالح لولي الأمر — راجع رقم الطالب في بياناته'); return }
    const url = 'https://wa.me/' + waPhone + '?text=' + encodeURIComponent(waMessage)
    window.open(url, '_blank')
  }
  /* (MG-2) الإرسال من المنصة: لو فيه مزود مفعّل بيبعت له فعليًا —
     لو مفيش السيرفر بيرجع waLink ونفتحه زي الإرسال اليدوي بالظبط */
  const sendViaPlatform = async () => {
    if (!student) return
    setWaSending(true)
    try {
      const res = await fetch('/api/admin/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: waPhone || '', message: waMessage }) })
      const d = await res.json()
      if (d && d.ok && d.mode === 'manual') {
        toast.info('الإرسال التلقائي مش مفعّل — فتحتلك واتساب جاهز بالإرسال اليدوي')
        window.open(d.waLink, '_blank')
      } else if (d && d.ok) {
        toast.success('اتبعتت الرسالة لولي الأمر عبر المنصة (' + (d.provider || d.mode) + ')')
      } else {
        toast.error((d && d.error) || 'فشل الإرسال — جرب الإرسال اليدوي')
      }
    } catch { toast.error('حصل خطأ في الاتصال') }
    setWaSending(false)
  }
  /* (MG-2) حفظ الرسالة الحالية كقالب افتراضي — اسم الطالب بيتبدل بـ {student}
     عشان القالب يفضل عام لكل الطلاب */
  const saveAsTemplate = async () => {
    if (!student) return
    setWaSavingTpl(true)
    try {
      const tpl = waMessage.split(student.name).join('{student}')
      const res = await fetch('/api/admin/parent-msg-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template: tpl }) })
      const d = await res.json()
      if (d && d.ok) toast.success('اتحفظ كقالب افتراضي — اسم الطالب اتعوض بـ {student} عشان القالب يفضل عام')
      else toast.error((d && d.error) || 'حصل خطأ في الحفظ')
    } catch { toast.error('حصل خطأ في الاتصال') }
    setWaSavingTpl(false)
  }
  const copyWa = async () => {
    try { await navigator.clipboard.writeText(waMessage); toast.success('تم نسخ الرسالة — ابعتها لولي الأمر') }
    catch { toast.error('معرفش أنسخ — انسخ الرسالة يدويًا من الصندوق') }
  }

  return (
    <Dialog open={!!student} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <MessageCircle className="h-4 w-4 text-green-600" />
            رسالة لولي الأمر: {student?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            الرقم المستخدم:{' '}
            {waPhone ? (
              <span dir="ltr" className="font-bold text-foreground">+{waPhone}</span>
            ) : (
              <span className="font-bold text-red-500">مفيش رقم صالح</span>
            )}
            {' '}({waPhoneIsParent ? 'ولي الأمر' : 'الطالب'})
          </p>
          {waLoading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : (
            <Textarea value={waMessage} onChange={(e) => setWaMessage(e.target.value)} rows={14} className="text-sm leading-relaxed" placeholder="الرسالة بتتجهز هنا…" />
          )}
          <div className="flex gap-2 flex-wrap">
            <Button className="flex-1 min-w-[140px] gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white" onClick={sendViaPlatform} disabled={waLoading || waSending || !waMessage}>
              {waSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              إرسال عبر المنصة
            </Button>
            <Button className="flex-1 min-w-[140px] gap-1.5 bg-green-600 hover:bg-green-700 text-white" onClick={sendWa} disabled={waLoading || !waMessage}>
              <MessageCircle className="h-4 w-4" />
              إرسال واتساب
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={copyWa} disabled={waLoading || !waMessage}>
              <Copy className="h-4 w-4" />
              نسخ الرسالة
            </Button>
            <Button variant="outline" className="gap-1.5" onClick={saveAsTemplate} disabled={waLoading || waSavingTpl || !waMessage}>
              {waSavingTpl ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ كقالب افتراضي
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">«إرسال عبر المنصة» بيتبعت أوتوماتيك لو فيه مزود رسائل مفعّل في إعدادات المنصة — لو مفيش، هيفتحلك واتساب جاهز (wa.me — مجاني 100%). «حفظ كقالب افتراضي» بيخلي الرسالة دي هي القالب الافتراضي لكل الطلاب (اسم الطالب بيتعوض تلقائيًا).</p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
