'use client'

// ============================================================
// FILE: src/components/admin/DailyInfoAdmin.tsx
// (2026-ت4) معلومة اليوم / حكمة اليوم — لوحة المستر:
//   • كل يوم المستر يحط معلومة/حكمة (كتابة + ملف/صورة اختياري) ويحدد اليوم
//   • الطالب أول ما يفتح المنصة تطلع له إشعار كبير ينزلق من الشمال
//     بزرار X فوق — وبيتقفل لوحده بعد 30 ثانية
// APIs: GET/POST/PUT/DELETE /api/daily-info (+ ?adminId=)
// الرفع: chunkedUpload بفئة daily-info (صورة أو PDF)
// ============================================================

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  CalendarDays, CheckCircle2, Eye, FileText, Lightbulb, Loader2, Pencil, Plus, Trash2, Upload, X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { chunkedUpload } from '@/lib/chunked-upload'

var AR_MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

/** تاريخ القاهرة YYYY-MM-DD */
function cairoToday(): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date())
  } catch (e) { return new Date().toISOString().slice(0, 10) }
}

function fmtDate(v: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v || ''))
  if (!m) return String(v || '—')
  return String(parseInt(m[3], 10)) + ' ' + AR_MONTHS[parseInt(m[2], 10) - 1] + ' ' + m[1]
}

interface InfoItem {
  id: string
  dateKey: string
  kind: string
  title: string
  body: string
  mediaPath: string
  mediaName: string
  active: boolean
  views?: number
}

export function DailyInfoAdmin({ adminId }: { adminId: string }) {
  const [items, setItems] = useState<InfoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  /* الفورم */
  const [editId, setEditId] = useState('')
  const [fKind, setFKind] = useState('info')
  const [fDate, setFDate] = useState(cairoToday())
  const [fTitle, setFTitle] = useState('')
  const [fBody, setFBody] = useState('')
  const [fActive, setFActive] = useState(true)
  const [fMediaPath, setFMediaPath] = useState('')
  const [fMediaName, setFMediaName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleteFor, setDeleteFor] = useState<InfoItem | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async function () {
    try {
      const res = await fetch('/api/daily-info?adminId=' + encodeURIComponent(adminId))
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && Array.isArray(data.items)) {
        setItems(data.items as InfoItem[])
      } else {
        toast.error(String((data && data.error) || 'مشكلة في تحميل المعلومات'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setLoading(false)
  }, [adminId])

  useEffect(function () {
    const kick = setTimeout(function () { load() }, 0)
    return function () { clearTimeout(kick) }
  }, [load])

  const resetForm = function () {
    setEditId('')
    setFKind('info')
    setFDate(cairoToday())
    setFTitle('')
    setFBody('')
    setFActive(true)
    setFMediaPath('')
    setFMediaName('')
  }

  const openEdit = function (it: InfoItem) {
    setEditId(it.id)
    setFKind(it.kind === 'wisdom' ? 'wisdom' : 'info')
    setFDate(/^\d{4}-\d{2}-\d{2}$/.test(it.dateKey) ? it.dateKey : cairoToday())
    setFTitle(it.title || '')
    setFBody(it.body || '')
    setFActive(!!it.active)
    setFMediaPath(it.mediaPath || '')
    setFMediaName(it.mediaName || '')
    try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch (e) {}
  }

  const pickMedia = async function (f: File | null) {
    if (!f) return
    const name = (f.name || '').toLowerCase()
    if (!f.type.startsWith('image/') && name.indexOf('.pdf') < 0) {
      toast.error('لازم صورة أو PDF')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('الملف كبير جدًا — الحد الأقصى 10MB')
      return
    }
    setUploading(true)
    try {
      const data = await chunkedUpload(f, 'daily-info', function () {})
      setFMediaPath(String(data.filePath || ''))
      setFMediaName(String(f.name || 'ملف').slice(0, 120))
      toast.success('الملف اتخزن ✅ — هيظهر للطالب مع المعلومة')
    } catch (e: any) {
      toast.error(String((e && e.message) || 'فشل رفع الملف — جرب تاني'))
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = async function () {
    if (!fTitle.trim() && !fBody.trim() && !fMediaPath) {
      toast.error('اكتب المعلومة أو الحكمة — أو ارفع ملف')
      return
    }
    setSaving(true)
    try {
      const payload = {
        adminId: adminId,
        id: editId || undefined,
        dateKey: fDate,
        kind: fKind,
        title: fTitle.trim(),
        body: fBody.trim(),
        mediaPath: fMediaPath,
        mediaName: fMediaName,
        active: fActive,
      }
      const res = await fetch('/api/daily-info', {
        method: editId ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success(editId ? 'اتعدلت المعلومة ✅' : 'اتحفظت — الطالب هيشوفها أول ما يفتح المنصة 💡')
        resetForm()
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

  const doDelete = async function () {
    if (!deleteFor) return
    const target = deleteFor
    setDeleteFor(null)
    setBusy('delete:' + target.id)
    try {
      const res = await fetch('/api/daily-info?adminId=' + encodeURIComponent(adminId) + '&id=' + encodeURIComponent(target.id), { method: 'DELETE' })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتمسحت المعلومة 🗑️')
        if (editId === target.id) resetForm()
        await load()
      } else {
        toast.error(String((data && data.error) || 'فشل المسح — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  const toggleActive = async function (it: InfoItem) {
    setBusy('toggle:' + it.id)
    try {
      const res = await fetch('/api/daily-info', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          adminId: adminId, id: it.id, dateKey: it.dateKey, kind: it.kind,
          title: it.title, body: it.body, mediaPath: it.mediaPath, mediaName: it.mediaName,
          active: !it.active,
        }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success(!it.active ? 'بقت شغالة — بتظهر للطلاب ✅' : 'اتوقفت — مش بتظهر للطلاب ✋')
        await load()
      } else {
        toast.error(String((data && data.error) || 'حصلت مشكلة'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBusy('')
    }
  }

  return (
    <div className="space-y-4">
      {/* هيدر شرح */}
      <div className="rounded-xl border border-sky-300/60 bg-sky-50/60 dark:border-sky-700/50 dark:bg-sky-950/20 p-3">
        <p className="flex items-center gap-1.5 text-sm font-bold text-sky-700 dark:text-sky-300">
          <Lightbulb className="h-4 w-4" />
          معلومة اليوم / حكمة اليوم — أول ما الطالب يفتح المنصة
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          اكتب معلومة أو حكمة واختار اليوم بتوقيت القاهرة (وتقدر ترفع ملف/صورة معاها).
          الطالب هيشوفها إشعار كبير ينزلق من الشمال أول ما يفتح — فيه علامة X فوق يقفلها بيها،
          ولو ما قفلهاش بتتقفل لوحدها بعد 30 ثانية — ومش بتظهر له تاني.
        </p>
      </div>

      {/* الفورم */}
      <Card className="border-sky-300/70 dark:border-sky-700/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between gap-2 text-lg">
            <span className="flex items-center gap-2">
              {editId ? <Pencil className="h-5 w-5 text-sky-600" /> : <Plus className="h-5 w-5 text-sky-600" />}
              {editId ? 'تعديل المعلومة' : 'معلومة / حكمة جديدة'}
            </span>
            {editId ? <Button variant="ghost" size="sm" onClick={resetForm} className="shrink-0">إلغاء التعديل</Button> : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium">النوع</label>
              <Select value={fKind} onValueChange={setFKind}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="info">💡 معلومة اليوم</SelectItem>
                  <SelectItem value="wisdom">🧠 حكمة اليوم</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium">اليوم (بتوقيت القاهرة)</label>
              <Input type="date" dir="ltr" value={fDate} onChange={function (e) { setFDate(e.target.value || cairoToday()) }} />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">العنوان (اختياري)</label>
              <Input value={fTitle} onChange={function (e) { setFTitle(e.target.value) }} placeholder="مثال: عجائب الأعداد الأولية" />
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1.5 block text-sm font-medium">المعلومة / الحكمة</label>
              <Textarea rows={4} value={fBody} onChange={function (e) { setFBody(e.target.value) }} placeholder="اكتب هنا اللي هيشوفه الطالب أول ما يفتح المنصة…" />
            </div>
          </div>

          {/* ملف/صورة مرفقة */}
          <div className="rounded-lg border bg-card p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-sm font-semibold"><FileText className="h-4 w-4 text-sky-600" />ملف/صورة مع المعلومة (اختياري)</label>
              {fMediaPath ? (
                <Button variant="ghost" size="sm" className="h-7 text-[11px] text-red-600 hover:bg-red-500/10" onClick={function () { setFMediaPath(''); setFMediaName('') }}>
                  <X className="h-3 w-3" />شيل الملف
                </Button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,.pdf"
              className="hidden"
              onChange={function (e) { pickMedia(e.target.files && e.target.files[0]) }}
              aria-hidden="true"
              tabIndex={-1}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" disabled={uploading} onClick={function () { fileRef.current?.click() }} className="min-h-9 gap-1.5">
                {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                {uploading ? 'جاري الرفع…' : 'اختار صورة أو PDF'}
              </Button>
              {fMediaPath ? <Badge variant="outline" className="text-[10px]" dir="ltr">📎 {fMediaName || 'ملف'}</Badge> : null}
            </div>
            {fMediaPath && fMediaPath.indexOf('.pdf') < 0 ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={fMediaPath} alt="معاينة المرفق" className="max-h-40 rounded-lg border object-contain" />
            ) : null}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={fActive} onCheckedChange={setFActive} aria-label="شغالة للطلاب" />
              <span className="text-xs font-medium">{fActive ? 'شغالة — بتظهر للطلاب' : 'متوقفة — مخفية'}</span>
            </div>
            <Button onClick={save} disabled={saving || uploading} className="bg-sky-600 text-white hover:bg-sky-700 gap-1.5">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {editId ? 'احفظ التعديل' : 'احفظ المعلومة'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* القايمة */}
      {loading ? (
        <div className="space-y-3">
          {[0, 1, 2].map(function (i) { return <div key={i} className="h-20 w-full animate-pulse rounded-xl bg-muted" /> })}
        </div>
      ) : items.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-sm text-muted-foreground">مفيش معلومات لسه — اكتب أول معلومة/حكمة فوق 👆</CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {items.map(function (it) {
            return (
              <div key={it.id} className="rounded-xl border bg-card p-3 space-y-1.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge className="border-0 bg-sky-600 text-white text-[10px]">
                        {it.kind === 'wisdom' ? '🧠 حكمة اليوم' : '💡 معلومة اليوم'}
                      </Badge>
                      <Badge variant="outline" className="gap-1 text-[10px]"><CalendarDays className="h-3 w-3" />{fmtDate(it.dateKey)}</Badge>
                      {it.active
                        ? <Badge className="border-0 bg-emerald-500/15 text-[10px] font-black text-emerald-700 dark:text-emerald-300">شغالة</Badge>
                        : <Badge className="border-0 bg-slate-500/15 text-[10px] font-black text-slate-600 dark:text-slate-300">متوقفة</Badge>}
                      {typeof it.views === 'number' ? <Badge variant="outline" className="gap-1 text-[10px]"><Eye className="h-3 w-3" />{it.views} شافوها</Badge> : null}
                    </div>
                    {it.title ? <p className="text-sm font-bold">{it.title}</p> : null}
                    {it.body ? <p className="whitespace-pre-wrap break-words text-xs leading-relaxed text-muted-foreground line-clamp-3">{it.body}</p> : null}
                    {it.mediaPath ? <p className="truncate text-[10px] text-muted-foreground" dir="ltr">📎 {it.mediaName || it.mediaPath}</p> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Switch checked={it.active} onCheckedChange={function () { toggleActive(it) }} disabled={busy === 'toggle:' + it.id} aria-label="تفعيل" />
                    <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={function () { openEdit(it) }}>
                      <Pencil className="h-3.5 w-3.5" />تعديل
                    </Button>
                    <Button
                      variant="ghost" size="sm"
                      className="h-8 gap-1 text-xs text-red-600 hover:bg-red-500/10 hover:text-red-700 dark:text-red-400"
                      onClick={function () { setDeleteFor(it) }}
                    >
                      <Trash2 className="h-3.5 w-3.5" />حذف
                    </Button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* تأكيد المسح */}
      <AlertDialog open={!!deleteFor} onOpenChange={function (o) { if (!o) setDeleteFor(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تمسح {deleteFor ? (deleteFor.kind === 'wisdom' ? 'الحكمة' : 'المعلومة') : ''} دي نهائيًا؟</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteFor ? fmtDate(deleteFor.dateKey) : ''} — الطالب مش هيشوفها تاني، والمسح مبيترجعش.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>لا، سيبها</AlertDialogCancel>
            <AlertDialogAction className="bg-red-600 text-white hover:bg-red-700" onClick={doDelete}>احذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
