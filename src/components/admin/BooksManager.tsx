'use client'

// ============================================================
// (2026-و40) BooksManager — تاب «الكتب والملازم» في لوحة الأدمن
// ============================================================
// الأدمن يرفع كتاب/ملزمة PDF (chunkedUpload → Media → /api/files/<id>)
// وبعدها يتسجل صف Book عبر /api/admin/books — والطالب يشوفه في تاب
// «الكتب والملازم» في البورتال (BooksTab).
// الرفع بنفس نظام chunkedUpload بتاع المنصة (أجزاء 2MB + تحقق بايت-ببايت).
// ============================================================

import { useAppStore, GRADES } from '@/stores/app-store'
import { chunkedUpload } from '@/lib/chunked-upload'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  BookOpen, Upload, Loader2, Trash2, FileDown, RefreshCw,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

var MAX_BOOK_MB = 60
var CONFIRM_BOOK_MB = 40

function formatBookSize(bytes: number): string {
  var mb = (bytes || 0) / 1024 / 1024
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  var kb = (bytes || 0) / 1024
  return (kb >= 1 ? kb.toFixed(0) + ' KB' : String(bytes || 0) + ' B')
}

export function BooksManager() {
  const adminId = useAppStore(function (s) { return s.currentAdmin?.id || '' })
  const [books, setBooks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadPct, setUploadPct] = useState(-1)
  const [uploadMsg, setUploadMsg] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [grade, setGrade] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  var loadBooks = async function () {
    if (!adminId) return
    setLoading(true)
    try {
      var res = await fetch('/api/admin/books?adminId=' + encodeURIComponent(adminId))
      var data = await res.json()
      if (res.ok) setBooks(data.books || [])
      else toast.error(data.error || 'خطأ في تحميل الكتب')
    } catch (e) {
      toast.error('خطأ في الاتصال')
    }
    setLoading(false)
  }

  useEffect(function () {
    if (!adminId) return
    loadBooks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId])

  var handleUpload = async function () {
    if (!adminId) { toast.error('مفيش جلسة أدمن'); return }
    if (!title.trim()) { toast.error('اكتب عنوان الكتاب الأول'); return }
    if (!file) { toast.error('اختر ملف الكتاب (PDF) الأول'); return }

    var sizeMb = file.size / 1024 / 1024
    if (sizeMb > MAX_BOOK_MB) {
      toast.error('الملف أكبر من ' + MAX_BOOK_MB + ' ميجا — قسّمه لأسامي أصغر أو ارفع نسخة أخف')
      return
    }
    if (sizeMb > CONFIRM_BOOK_MB && !window.confirm('الملف ' + sizeMb.toFixed(1) + ' ميجا — الرفع ممكن ياخد وقت. تكمل؟')) {
      return
    }

    setSaving(true)
    setUploadPct(0)
    setUploadMsg('')
    try {
      /* الرفع المجزأ — بيرجّع filePath = /api/files/<mediaId> */
      var up = await chunkedUpload(file, 'books', function (pct) { setUploadPct(pct) }, function (msg) { setUploadMsg(msg) })
      if (!up || !up.filePath) throw new Error('فشل رفع الملف — جرب تاني')

      var res = await fetch('/api/admin/books?adminId=' + encodeURIComponent(adminId), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          filePath: up.filePath,
          fileName: file.name,
          fileType: file.type || 'application/pdf',
          sizeBytes: file.size,
          grade: grade,
        }),
      })
      var data = await res.json()
      if (res.ok && (data.success || data.book)) {
        toast.success('تم رفع الكتاب بنجاح!')
        setTitle(''); setDescription(''); setGrade(''); setFile(null)
        if (fileRef.current) fileRef.current.value = ''
        await loadBooks()
      } else {
        toast.error(data.error || 'خطأ في حفظ الكتاب')
      }
    } catch (err: any) {
      toast.error(err.message || 'خطأ في الرفع')
    }
    setSaving(false); setUploadPct(-1); setUploadMsg('')
  }

  var handleDelete = async function (b: any) {
    if (!adminId) { toast.error('مفيش جلسة أدمن'); return }
    if (!window.confirm('حذف "' + (b.title || '') + '" نهائيًا؟ الطالب مش هيشوفه تاني.')) return
    try {
      var res = await fetch('/api/admin/books?adminId=' + encodeURIComponent(adminId) + '&id=' + encodeURIComponent(b.id), { method: 'DELETE' })
      var data = await res.json()
      if (res.ok && data.success) {
        toast.success('تم حذف الكتاب')
        setBooks(function (prev) { return prev.filter(function (x) { return x.id !== b.id }) })
      } else {
        toast.error(data.error || 'خطأ في الحذف')
      }
    } catch (e) {
      toast.error('خطأ في الاتصال')
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2"><BookOpen className="h-5 w-5 text-sky-500" />الكتب والملازم | Books</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* ===== نموذج الرفع ===== */}
        <div className="p-4 rounded-xl border-2 border-dashed border-sky-400/40 bg-sky-50 dark:bg-sky-950/20 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">عنوان الكتاب *</Label>
              <Input value={title} onChange={function (e) { setTitle(e.target.value) }} placeholder="مثال: مذكرة الفصل الأول" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">الصف (اختياري)</Label>
              <select value={grade} onChange={function (e) { setGrade(e.target.value) }} className="w-full h-10 rounded-lg border border-input bg-transparent px-3 text-sm">
                <option value="">كل الصفوف</option>
                {GRADES.map(function (g) { return <option key={g} value={g}>{g}</option> })}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">وصف مختصر (اختياري)</Label>
            <Input value={description} onChange={function (e) { setDescription(e.target.value) }} placeholder="مثال: شرح + مسائل الباب الأول" />
          </div>
          <div className="flex items-center gap-2">
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={function (e) { setFile(e.target.files?.[0] || null) }} />
            <Button type="button" variant="outline" onClick={function () { fileRef.current?.click() }} className="flex-1 border-sky-400/40 text-sky-700 dark:text-sky-400">
              <Upload className="h-4 w-4 ml-2" />{file ? file.name : 'اختر ملف الكتاب (PDF) — أقصى حجم 60 ميجا'}
            </Button>
          </div>
          {file && <p className="text-xs text-muted-foreground text-center">{(file.size / 1024 / 1024).toFixed(1)} MB</p>}
          {uploadPct >= 0 && (
            <div className="space-y-1">
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <div className="h-full bg-sky-500 transition-all" style={{ width: uploadPct + '%' }} />
              </div>
              {uploadMsg && <p className="text-[11px] text-muted-foreground text-center">{uploadMsg}</p>}
            </div>
          )}
          <Button className="w-full" onClick={handleUpload} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Upload className="h-4 w-4 ml-1" />}
            {saving ? 'جاري الرفع...' : 'رفع الكتاب'}
          </Button>
        </div>

        {/* ===== القايمة ===== */}
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">الكتب المتضافة ({books.length})</h3>
          <Button variant="outline" size="sm" onClick={loadBooks} disabled={loading || !adminId}><RefreshCw className={"h-3.5 w-3.5 ml-1" + (loading ? ' animate-spin' : '')} />تحديث</Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-sky-500" /></div>
        ) : books.length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">
            <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">مفيش كتب متضافة لسه — ارفع أول كتاب من الفورم اللي فوق</p>
          </div>
        ) : (
          <div className="space-y-2">
            {books.map(function (b: any) {
              return (
                <div key={b.id} className="flex items-center gap-3 p-3 rounded-lg border bg-card">
                  <div className="h-9 w-9 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                    <BookOpen className="h-4 w-4 text-sky-500" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{b.title}</p>
                    <div className="flex items-center gap-2 flex-wrap text-[10px] text-muted-foreground">
                      {b.grade && <Badge variant="outline" className="text-[10px]">{b.grade}</Badge>}
                      <span>{formatBookSize(b.sizeBytes)}</span>
                      {b.createdAt && <span>{new Date(b.createdAt).toLocaleDateString('ar-EG')}</span>}
                      {b.description && <span className="truncate max-w-[200px] hidden sm:inline">{b.description}</span>}
                    </div>
                  </div>
                  <a href={b.filePath + (b.filePath.indexOf('?') !== -1 ? '&' : '?') + 'dl=1'} target="_blank" rel="noreferrer" className="shrink-0">
                    <Button variant="outline" size="sm" className="h-8 gap-1"><FileDown className="h-3.5 w-3.5" />تحميل</Button>
                  </a>
                  <Button variant="ghost" size="sm" className="h-8 w-8 p-0 text-destructive" onClick={function () { handleDelete(b) }} title="حذف">
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
