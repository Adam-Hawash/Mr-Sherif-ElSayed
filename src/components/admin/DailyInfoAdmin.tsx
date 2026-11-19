'use client'

// ============================================================
// FILE: src/components/admin/DailyInfoAdmin.tsx
// (ر22) معلومة اليوم / حكمة اليوم — لوحة المستر:
//   • كل يوم المستر يحط معلومة/حكمة (كتابة + ملف/صورة اختياري) ويحدد اليوم
//   • الكارت بيطير للكل — زائر وطالب، على الصفحة الرئيسية جنب الهيرو سيكشن
//     ومن غير تسجيل دخول — وبيفضل ثابت بعد الدخول كمان
//   • من غير أي وقت ولا إغلاق تلقائي — بتقفل بس لما الطالب يدوس X
//     (وتختفي نهائيًا على جهازه + تتسجل مشاهدة للأدمن لو كان مسجل دخول)
// (2026-ت5) طلب المستر الجديد — «أنا عايز أنزل المعلومة أقدر أحدد عدد الأيام،
//   يعني مثلاً أحدد 10 أيام، 6 أيام، 7 أيام، وأضيف ملف كامل فيه 7 معلومات
//   وأقسم كل معلومة في يوم»:
//   • تاب «ملف كامل — معلومة لكل يوم»: تحدد عدد الأيام (5/6/7/10/14/20 أو أي رقم)
//   • تلصق النص أو ترفع ملف (.txt أو .docx — Word) فيه كل المعلومات
//   • التقسيم تلقائي: كل معلومة في يوم — مع پريفيو حي للتوزيع قبل الحفظ
//   • الفصل بيتفهم لوحده: سطر فاضي أو --- أو *** أو ترقيم 1. / ٢- / أ)
// APIs: GET/POST/PUT/DELETE /api/daily-info (+ POST /api/daily-info/batch للدفعات)
// الرفع: chunkedUpload بفئة daily-info (صورة أو PDF للمعلومة الواحدة)
// ============================================================

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowUp, CalendarDays, CheckCircle2, Eye, FileText, Lightbulb, ListOrdered, Loader2, Pencil, Plus, Trash2, Upload, X,
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

/** إضافة N يوم على مفتاح تاريخ — حساب تقويم صافي (بدون لمس المنطقة الزمنية) */
function addDaysKey(key: string, add: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(key || ''))
  if (!m) return String(key || '')
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + add))
  return d.toISOString().slice(0, 10)
}

/* ============================================================
   تقسيم الملف/النص لمعلومات — طلب المستر: «أقسم كل معلومة في يوم»
   قواعد صارمة عشان المعلومات تطلع بالظبط زي ما المستر كاتبها —
   ما تضيعش معلومة وما تتزودش معلومة من عندنا وما يقلبش الترتيب:
   1) فاصل صريح (--- أو *** أو ===) → كل ما بين الفواصل معلومة
   2) ترقيم متسلسل حقيقي (1. 2. 3. أو ١- ٢- ٣- أو أ) ب) ج)) → كل بند معلومة
      — الترقيم لازم يكون متسلسل فعلًا (كل رقم = اللي قبله + 1) عشان أي رقم
      أو حرف جوه نص المعلومة ما يتفهمش غلط كمعلومة جديدة (7 معلومات تبقى 8!)
      — والكلام اللي قبل أول رقم بيتحفظ كأول معلومة (عمره ما بيضيع —
      ولو كان عنوان للملف المستر يشيله بضغطة من المعاينة)
   3) سطر فاضي بين الفقرات → كل فقرة معلومة
   4) مفيش فصل واضح → النص كله معلومة واحدة — عمره ما بنقطع كل سطر لوحده
      (عشان ما يفصلش السطور ويزود معلومات من عنده)
   ============================================================ */

interface ParsedFact { title: string; body: string }
interface PlanItem { dateKey: string; title: string; body: string }

var SEP_LINE = /^[=\-_*~•·]{3,}$/
/* بادئة ترقيم: رقم لاتيني/عربي أو حرف واحد (عربي/لاتيني) + علامة فصل */
var NUM_START = /^\s*(\d{1,3}|[٠-٩]{1,3}|[أ-ى]|[A-Za-z])\s*[.):\-،:]\s*/

/* ترتيب حروف الترقيم العربي — أبجد هوز حطي كلمن سعفص قرشت ثخذ ضظغ */
var ABJAD = 'أبجدهوزحطيكلمنسعفصقرشتثخذضظغ'

function normAbjad(c: string): string {
  if (c === 'ا' || c === 'إ' || c === 'آ') return 'أ'
  if (c === 'ى') return 'ي'
  if (c === 'ة') return 'ه'
  return c
}

/** يطلع من أول السطر نوع وقيمة رقم التسلسل — أو null لو مش بادئة ترقيم */
function numToken(line: string): { type: 'digit' | 'letter'; value: number } | null {
  const m = NUM_START.exec(line)
  if (!m) return null
  const tok = m[1]
  if (/^\d{1,3}$/.test(tok)) return { type: 'digit', value: parseInt(tok, 10) }
  if (/^[٠-٩]{1,3}$/.test(tok)) {
    var v = parseInt(tok.replace(/[٠-٩]/g, function (c) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(c)) }), 10)
    return isNaN(v) ? null : { type: 'digit', value: v }
  }
  if (/[أ-ى]/.test(tok)) {
    const idx = ABJAD.indexOf(normAbjad(tok))
    return idx < 0 ? null : { type: 'letter', value: idx + 1 }
  }
  const L = tok.toLowerCase()
  if (L >= 'a' && L <= 'z') return { type: 'letter', value: L.charCodeAt(0) - 96 }
  return null
}

function toFacts(blocks: string[][], stripNum?: boolean): ParsedFact[] {
  const out: ParsedFact[] = []
  for (var i = 0; i < blocks.length; i++) {
    const ls = blocks[i].map(function (l) { return l.trim() }).filter(Boolean)
    if (!ls.length) continue
    let first = ls[0]
    if (stripNum) first = first.replace(NUM_START, '')
    /* النص بيترجع زي ما هو بالحرف — من غير تفكير عناوين من عندنا (طلب المستر:
       «انت كاتب حتى الاسامي غلط») — المعلومة كاملة في النص زي ما المستر كاتبها */
    out.push({ title: '', body: [first].concat(ls.slice(1)).join('\n') })
  }
  return out
}

function parseFacts(raw: string): ParsedFact[] {
  const text = String(raw || '').replace(/\r\n?/g, '\n').trim()
  if (!text) return []
  const lines = text.split('\n')
  let blocks: string[][] = []
  let cur: string[] = []

  // 1) فاصل صريح — سطر منه بس (--- أو *** أو === أو ___ أو •••)
  var sawSep = false
  cur = []
  blocks = []
  for (var i = 0; i < lines.length; i++) {
    if (SEP_LINE.test(lines[i].trim())) {
      sawSep = true
      if (cur.length) { blocks.push(cur); cur = [] }
    } else {
      cur.push(lines[i])
    }
  }
  if (cur.length) blocks.push(cur)
  if (sawSep && blocks.length >= 2) return toFacts(blocks)

  // 2) ترقيم متسلسل حقيقي — بنمشي على السطور ونقسم عند كل رقم بيكمل التسلسل
  //    (اللي قبله + 1) — أي رقم مش مكمل للتسلسل معناه رقم جوه نص معلومة
  //    فبنسايه عشان ما يتزودش معلومة من عنده وما يبوظش الترتيب (7 تبقى 8!)
  var cands: { line: number; value: number; type: 'digit' | 'letter' }[] = []
  for (var j = 0; j < lines.length; j++) {
    const t = numToken(lines[j])
    if (t && lines[j].trim().length > 2) cands.push({ line: j, value: t.value, type: t.type })
  }
  if (cands.length >= 2) {
    var picked: typeof cands = []
    var expected = -1
    for (var c = 0; c < cands.length; c++) {
      if (!picked.length || (cands[c].type === picked[0].type && cands[c].value === expected)) {
        picked.push(cands[c])
        expected = cands[c].value + 1
      }
    }
    if (picked.length >= 2) {
      blocks = []
      /* الكلام اللي قبل أول رقم بيتحفظ كأول معلومة — عمره ما بيضيع
         (المستر: «بيبدأ من تاني معلومة مش من أول معلومة») */
      const pre = lines.slice(0, picked[0].line)
      if (pre.map(function (l) { return l.trim() }).filter(Boolean).length) blocks.push(pre)
      for (var k = 0; k < picked.length; k++) {
        const end = k + 1 < picked.length ? picked[k + 1].line : lines.length
        blocks.push(lines.slice(picked[k].line, end))
      }
      return toFacts(blocks, true)
    }
  }

  // 3) فقرات مفصولة بسطر فاضي
  blocks = []
  cur = []
  for (var p = 0; p < lines.length; p++) {
    if (!lines[p].trim()) {
      if (cur.length) { blocks.push(cur); cur = [] }
    } else {
      cur.push(lines[p])
    }
  }
  if (cur.length) blocks.push(cur)
  if (blocks.length >= 2) return toFacts(blocks)

  // 4) مفيش فصل واضح — النص كله معلومة واحدة (ما بنفصلش السطر لوحده عمرنا)
  return [{ title: '', body: text }]
}

/** توزيع المعلومات على الأيام — بالترتيب من غير قفزات ومن غير ضياع:
    • معلومات ≤ الأيام: كل معلومة في يوم ورا بعض بالظبط (يوم1=معلومة1…) —
      والأيام الزيادة بتفضل من غير معلومة جديدة
    • معلومات أكتر من الأيام: كل يوم بياخد نصيبه ورا بعض — حدود صحيحة متتالية
      فمفيش معلومة بتضيع ولا بتتكرر ولا الترتيب بيتقلب */
function distributeDays(facts: ParsedFact[], days: number, startKey: string): PlanItem[] {
  const n = facts.length
  if (!n) return []
  const d = Math.max(1, Math.min(60, Math.floor(Number(days) || n)))
  const out: PlanItem[] = []
  if (n <= d) {
    for (var i = 0; i < n; i++) {
      out.push({ dateKey: addDaysKey(startKey, i), title: facts[i].title, body: facts[i].body })
    }
  } else {
    for (var j = 0; j < d; j++) {
      const a = Math.floor((n * j) / d)
      const b = Math.floor((n * (j + 1)) / d)
      const slice = facts.slice(a, Math.max(b, a + 1))
      if (!slice.length) continue
      out.push({
        dateKey: addDaysKey(startKey, j),
        title: slice.length === 1 ? slice[0].title : '',
        body: slice.map(function (s) { return (s.title ? s.title + '\n' : '') + s.body }).filter(Boolean).join('\n\n'),
      })
    }
  }
  return out
}

/* ============================================================
   قراءة ملف المعلومات — .txt/.md مباشرة، و.docx (Word) بفك ZIP بدون مكتبات
   (الـ docx أرشيف ZIP فيه word/document.xml — بنفكه بـ DecompressionStream المدمج في المتصفح)
   ============================================================ */

async function extractDocxText(f: File): Promise<string> {
  const u8 = new Uint8Array(await f.arrayBuffer())
  const dv = new DataView(u8.buffer)
  // نلاقي نهاية فهرس الأرشيف (EOCD) من آخر الملف
  var eocd = -1
  for (var i = u8.length - 22; i >= 0 && i >= u8.length - 22 - 65558; i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break }
  }
  if (eocd < 0) throw new Error('الملف مش ملف Word سليم (.docx) — احفظه بصيغة txt أو الصق النص')
  var count = dv.getUint16(eocd + 10, true)
  var ptr = dv.getUint32(eocd + 16, true)
  for (var e = 0; e < count; e++) {
    if (ptr + 46 > u8.length || dv.getUint32(ptr, true) !== 0x02014b50) break
    var method = dv.getUint16(ptr + 10, true)
    var compSize = dv.getUint32(ptr + 20, true)
    var nameLen = dv.getUint16(ptr + 28, true)
    var extraLen = dv.getUint16(ptr + 30, true)
    var cmtLen = dv.getUint16(ptr + 32, true)
    var lho = dv.getUint32(ptr + 42, true)
    var name = new TextDecoder().decode(u8.subarray(ptr + 46, ptr + 46 + nameLen))
    if (name === 'word/document.xml') {
      if (lho + 30 > u8.length) throw new Error('ملف الـ Word تالف')
      var lhName = dv.getUint16(lho + 26, true)
      var lhExtra = dv.getUint16(lho + 28, true)
      var start = lho + 30 + lhName + lhExtra
      var data = u8.subarray(start, Math.min(start + compSize, u8.length))
      var xmlBytes: Uint8Array
      if (method === 0) {
        xmlBytes = data
      } else if (method === 8) {
        try {
          const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
          xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer())
        } catch (e2) {
          throw new Error('المتصفح ده مش بيدعم فك ملفات Word — استخدم ملف txt أو الصق النص مباشرة')
        }
      } else {
        throw new Error('طريقة ضغط الملف مش مدعومة — احفظه بصيغة txt أو الصق النص مباشرة')
      }
      return docxXmlToText(new TextDecoder('utf-8').decode(xmlBytes))
    }
    ptr += 46 + nameLen + extraLen + cmtLen
  }
  throw new Error('مفيش نص جوه ملف الـ Word — احفظه بصيغة txt أو الصق النص مباشرة')
}

function docxXmlToText(xml: string): string {
  const paras = xml.split(/<\/w:p>/)
  const lines: string[] = []
  for (var i = 0; i < paras.length; i++) {
    const m = paras[i].match(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)
    if (!m) continue
    const t = m.map(function (x) { return x.replace(/<[^>]*>/g, '') }).join('')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, function (_all, n) { return String.fromCharCode(Number(n)) })
      .replace(/&amp;/g, '&')
    if (t.trim()) lines.push(t)
  }
  return lines.join('\n')
}

async function readBatchFile(f: File): Promise<string> {
  const name = (f.name || '').toLowerCase()
  if (/\.docx$/.test(name)) return await extractDocxText(f)
  if (/\.(txt|md|csv|text)$/.test(name) || (f.type && f.type.indexOf('text/') === 0)) {
    return await f.text()
  }
  throw new Error('الصيغة دي مش مدعومة — ارفع ملف txt أو docx (Word) أو الصق النص مباشرة')
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

var QUICK_DAYS = [5, 6, 7, 10, 14, 20]

export function DailyInfoAdmin({ adminId }: { adminId: string }) {
  const [items, setItems] = useState<InfoItem[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')

  /* وضع اللوحة: معلومة واحدة أو ملف كامل يتقسم على أيام */
  const [mode, setMode] = useState<'one' | 'batch'>('one')

  /* الفورم — معلومة واحدة */
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

  /* الفورم — ملف كامل (عدد أيام + تقسيم تلقائي) */
  const [bKind, setBKind] = useState('info')
  const [bStart, setBStart] = useState(cairoToday())
  const [bDays, setBDays] = useState(7)
  const [bRaw, setBRaw] = useState('')
  const [batchSaving, setBatchSaving] = useState(false)
  const [bFileBusy, setBFileBusy] = useState(false)
  const batchFileRef = useRef<HTMLInputElement>(null)

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

  /* تقسيم النص لاكثر من معلومة — لحظي مع كل تغيير */
  const parsedFacts = useMemo(function () { return parseFacts(bRaw) }, [bRaw])
  const factsCount = parsedFacts.length

  /* عدد الأيام بيتظبط تلقائيًا على عدد المعلومات لأول مرة بس — وأول ما المناولة
     تحدد عدد الأيام بنفسها بنحترم اختيارها (طلب المستر: يحدد 10 أو 6 أو 7) */
  const [daysTouched, setDaysTouched] = useState(false)
  useEffect(function () {
    if (factsCount > 0 && !daysTouched) setBDays(factsCount)
  }, [factsCount, daysTouched])

  const batchPlan = useMemo(function () { return distributeDays(parsedFacts, bDays, bStart) }, [parsedFacts, bDays, bStart])

  /* تعديل المعاينة قبل الحفظ — اللي بتشوفه في المعاينة هو اللي بيتحفظ بالحرف:
     تعدّل أي معلومة أو تشيلها أو تدمجها في اللي فوقها */
  const [planEdits, setPlanEdits] = useState<PlanItem[] | null>(null)
  const [editIdx, setEditIdx] = useState(-1)
  useEffect(function () {
    setPlanEdits(null)
    setEditIdx(-1)
  }, [bRaw, bDays, bStart])
  const effectivePlan = planEdits || batchPlan

  const updatePlanItem = function (i: number, field: 'title' | 'body', v: string) {
    setPlanEdits(function (prev) {
      const arr = (prev || batchPlan).slice()
      if (!arr[i]) return prev
      const next: PlanItem = { dateKey: arr[i].dateKey, title: arr[i].title, body: arr[i].body }
      if (field === 'title') next.title = v
      else next.body = v
      arr[i] = next
      return arr
    })
  }
  const removePlanItem = function (i: number) {
    setPlanEdits(function (prev) {
      const arr = (prev || batchPlan).slice()
      arr.splice(i, 1)
      return arr
    })
    if (editIdx === i) setEditIdx(-1)
  }
  const mergePlanItem = function (i: number) {
    setPlanEdits(function (prev) {
      const arr = (prev || batchPlan).slice()
      if (i <= 0 || !arr[i] || !arr[i - 1]) return prev
      const p = arr[i - 1]
      const c = arr[i]
      arr[i - 1] = {
        dateKey: p.dateKey,
        title: p.title,
        body: [p.body, c.title, c.body].map(function (x) { return String(x || '').trim() }).filter(Boolean).join('\n'),
      }
      arr.splice(i, 1)
      return arr
    })
    if (editIdx === i) setEditIdx(-1)
  }

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
    setMode('one')
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

  /* رفع ملف المعلومات الكامل (txt أو Word) وتقسيمه لحظيًا */
  const pickBatchFile = async function (f: File | null) {
    if (!f) return
    if (f.size > 15 * 1024 * 1024) {
      toast.error('الملف كبير جدًا — الحد الأقصى 15MB')
      return
    }
    setBFileBusy(true)
    try {
      const text = await readBatchFile(f)
      if (!text.trim()) {
        toast.error('مفيش نص قابل للقراءة في الملف ده')
      } else {
        setBRaw(text)
        toast.success('اتقرا الملف — راجع التقسيم تحت ثم احفظ')
      }
    } catch (e: any) {
      toast.error(String((e && e.message) || 'فشل قراءة الملف'))
    } finally {
      setBFileBusy(false)
      if (batchFileRef.current) batchFileRef.current.value = ''
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

  /* حفظ الدفعة — اللي في المعاينة بالحرف (بعد أي تعديل عمله المناولة) */
  const saveBatch = async function () {
    if (!effectivePlan.length) {
      toast.error('مفيش معلومات — الصق النص أو ارفع ملف الأول')
      return
    }
    setBatchSaving(true)
    try {
      const res = await fetch('/api/daily-info/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, kind: bKind, items: effectivePlan }),
      })
      const data = await res.json().catch(function () { return null })
      if (res.ok && data && data.ok) {
        toast.success('اتحفظت ' + String((data as any).created || effectivePlan.length) + ' معلومة — كل معلومة في يومها والطالب هيشوفها أول ما يفتح 💡')
        setBRaw('')
        await load()
      } else {
        toast.error(String((data && data.error) || 'فشل حفظ الدفعة — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    } finally {
      setBatchSaving(false)
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
          معلومة واحدة: اكتب المعلومة واختار اليوم بتوقيت القاهرة (وتقدر ترفع ملف/صورة معاها).
          وملف كامل: حدد عدد الأيام (7 أو 6 أو 10 أو أي عدد) وارفع الملف — بيتقسم بالظبط زي ما كاتبها
          (فاصل أو ترقيم متسلسل أو سطر فاضي) وبتشوف المعاينة وتعدل فيها قبل الحفظ.
          الكارت هيظهر للكل على الصفحة الرئيسية حتى غير المسجلين، وبيفضل ثابت بعد تسجيل الدخول،
          وبيتقفل بس لما الطالب يدوس على الـ X — من غير أي وقت — ومش بيظهر تاني على نفس الجهاز.
        </p>
      </div>

      {/* الفورم */}
      <Card className="border-sky-300/70 dark:border-sky-700/70">
        <CardHeader className="pb-3">
          <CardTitle className="flex flex-wrap items-center justify-between gap-2 text-lg">
            <span className="flex items-center gap-2">
              {mode === 'batch' ? <ListOrdered className="h-5 w-5 text-sky-600" /> : editId ? <Pencil className="h-5 w-5 text-sky-600" /> : <Plus className="h-5 w-5 text-sky-600" />}
              {mode === 'batch' ? 'ملف كامل — معلومة لكل يوم' : editId ? 'تعديل المعلومة' : 'معلومة / حكمة جديدة'}
            </span>
            <span className="flex items-center gap-2">
              <span className="flex rounded-lg border bg-muted/40 p-0.5">
                <Button type="button" size="sm" variant={mode === 'one' ? 'default' : 'ghost'} className="h-8 gap-1 text-xs" onClick={function () { setMode('one') }}>
                  <Plus className="h-3.5 w-3.5" />معلومة واحدة
                </Button>
                <Button type="button" size="sm" variant={mode === 'batch' ? 'default' : 'ghost'} className="h-8 gap-1 text-xs" onClick={function () { setMode('batch'); if (editId) resetForm() }}>
                  <ListOrdered className="h-3.5 w-3.5" />ملف كامل
                </Button>
              </span>
              {editId && mode === 'one' ? <Button variant="ghost" size="sm" onClick={resetForm} className="shrink-0">إلغاء التعديل</Button> : null}
            </span>
          </CardTitle>
        </CardHeader>

        {mode === 'batch' ? (
          /* ============ وضع الملف الكامل — عدد أيام + تقسيم تلقائي ============ */
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">النوع</label>
                <Select value={bKind} onValueChange={setBKind}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">💡 معلومة اليوم</SelectItem>
                    <SelectItem value="wisdom">🧠 حكمة اليوم</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">يوم البداية (بتوقيت القاهرة)</label>
                <Input type="date" dir="ltr" value={bStart} onChange={function (e) { setBStart(e.target.value || cairoToday()) }} />
              </div>
            </div>

            {/* عدد الأيام — طلب المستر: يحدد 10 أو 6 أو 7 أو أي عدد — واختياره محترم */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">عدد الأيام</label>
              <div className="flex flex-wrap items-center gap-1.5">
                {QUICK_DAYS.map(function (n) {
                  return (
                    <Button key={n} type="button" variant={bDays === n ? 'default' : 'outline'} size="sm" className="h-9 min-w-10 px-2.5 text-xs" onClick={function () { setDaysTouched(true); setBDays(n) }}>
                      {n}
                    </Button>
                  )
                })}
                <Input
                  type="number" dir="ltr" min={1} max={60}
                  value={bDays}
                  onChange={function (e) { setDaysTouched(true); setBDays(Math.max(1, Math.min(60, Math.floor(Number(e.target.value) || 1)))) }}
                  className="h-9 w-24" aria-label="عدد الأيام"
                />
                <span className="text-xs text-muted-foreground">يوم</span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">بتتظبط لوحده على عدد المعلومات لأول مرة بس — وبعد ما تحددها بنفسك بنحترم اختيارك.</p>
            </div>

            {/* مصدر المعلومات — لصق أو ملف */}
            <div>
              <label className="mb-1.5 block text-sm font-medium">المعلومات — كل معلومة في يوم</label>
              <Textarea
                rows={10}
                value={bRaw}
                onChange={function (e) { setBRaw(e.target.value) }}
                placeholder={'الصق المعلومات هنا أو ارفع ملف…\n\nبيتقسم بالظبط زي ما كاتبها لما يلاقي:\n• فاصل --- بين المعلومات\n• أو ترقيم متسلسل: 1. معلومة أول يوم\n2. معلومة تاني يوم\n3. … (أو ١- ٢- ٣-)\n• أو سطر فاضي بين كل معلومة والتانية\nواللي يظهر في المعاينة تحت هو اللي بيتحفظ بالحرف — وتقدر تعدل أي معلومة قبل الحفظ'}
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  ref={batchFileRef}
                  type="file"
                  accept=".txt,.md,.csv,.docx,text/plain"
                  className="hidden"
                  onChange={function (e) { pickBatchFile(e.target.files && e.target.files[0]) }}
                  aria-hidden="true"
                  tabIndex={-1}
                />
                <Button type="button" variant="outline" size="sm" disabled={bFileBusy} onClick={function () { batchFileRef.current?.click() }} className="min-h-9 gap-1.5">
                  {bFileBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                  {bFileBusy ? 'جاري قراءة الملف…' : 'ارفع ملف المعلومات (txt أو Word)'}
                </Button>
                {factsCount > 0 ? (
                  <Badge className="border-0 bg-sky-600 text-white text-[10px]">اتكتشفت {factsCount} معلومة</Badge>
                ) : (
                  <span className="text-[11px] text-muted-foreground">بيتقسم لما يلاقي: فاصل --- أو ترقيم متسلسل 1. 2. 3. أو سطر فاضي — ومفيش حاجة بتتفصل من عندنا</span>
                )}
                {bRaw ? (
                  <Button type="button" variant="ghost" size="sm" className="h-7 text-[11px] text-red-600 hover:bg-red-500/10" onClick={function () { setBRaw('') }}>
                    <X className="h-3 w-3" />فضّي النص
                  </Button>
                ) : null}
              </div>
            </div>

            {/* پريفيو التوزيع — اللي تشوفه هنا هو اللي بيتحفظ بالحرف — عدّل/اشيل/ادمج براحتك */}
            {effectivePlan.length > 0 ? (
              <div className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
                <p className="text-xs font-bold">
                  معاينة التوزيع — {effectivePlan.length} معلومة (من {fmtDate(bStart)}) — عدّل براحتك قبل الحفظ
                </p>
                {factsCount > bDays ? (
                  <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    المعلومات أكتر من الأيام — بعض الأيام هتاخد أكتر من معلومة ورا بعض بالترتيب.
                  </p>
                ) : null}
                {factsCount < bDays ? (
                  <p className="rounded-md bg-amber-500/10 px-2 py-1 text-[11px] font-medium text-amber-700 dark:text-amber-300">
                    الأيام أكتر من المعلومات — كل معلومة في يومها ورا بعض، والأيام الزيادة من غير معلومة جديدة.
                  </p>
                ) : null}
                <div className="max-h-72 space-y-1.5 overflow-y-auto pr-1 [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border [&::-webkit-scrollbar-track]:bg-transparent">
                  {effectivePlan.map(function (p, i) {
                    const dayNo = (() => {
                      const t0 = Date.parse(bStart + 'T00:00:00Z')
                      const t1 = Date.parse(p.dateKey + 'T00:00:00Z')
                      if (isNaN(t0) || isNaN(t1)) return i + 1
                      return Math.round((t1 - t0) / 86400000) + 1
                    })()
                    const editing = editIdx === i
                    return (
                      <div key={p.dateKey + ':' + i} className="rounded-md border bg-card px-2 py-1.5 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="outline" className="shrink-0 gap-1 text-[10px]"><CalendarDays className="h-3 w-3" />يوم {dayNo} — {fmtDate(p.dateKey)}</Badge>
                          <div className="flex shrink-0 items-center gap-0.5">
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="تعديل المعلومة" title="تعديل" onClick={function () { setEditIdx(editing ? -1 : i) }}>
                              <Pencil className={editing ? 'h-3.5 w-3.5 text-sky-600' : 'h-3.5 w-3.5'} />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" aria-label="دمج في اليوم اللي فوقه" title="دمج في اليوم اللي فوقه" disabled={i === 0} onClick={function () { mergePlanItem(i) }}>
                              <ArrowUp className="h-3.5 w-3.5" />
                            </Button>
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-600 hover:bg-red-500/10" aria-label="شيل المعلومة دي" title="شيل" onClick={function () { removePlanItem(i) }}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>
                        {editing ? (
                          <div className="space-y-1.5">
                            <Input
                              value={p.title}
                              placeholder="العنوان (اختياري)"
                              onChange={function (e) { updatePlanItem(i, 'title', e.target.value) }}
                              className="h-8 text-xs"
                            />
                            <Textarea
                              rows={3}
                              value={p.body}
                              placeholder="نص المعلومة"
                              onChange={function (e) { updatePlanItem(i, 'body', e.target.value) }}
                              className="text-xs"
                            />
                          </div>
                        ) : (
                          <p className="min-w-0 whitespace-pre-wrap break-words text-[11px] leading-relaxed text-muted-foreground line-clamp-2">
                            {(p.title ? p.title + ' — ' : '') + p.body}
                          </p>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            ) : null}

            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={saveBatch} disabled={batchSaving || bFileBusy || !effectivePlan.length} className="bg-sky-600 text-white hover:bg-sky-700 gap-1.5">
                {batchSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                احفظ الدفعة{effectivePlan.length ? ' (' + effectivePlan.length + ' معلومة)' : ''}
              </Button>
              <span className="text-[11px] text-muted-foreground">اللي في المعاينة فوق هو اللي بيتحفظ بالحرف — وتقدر تعدل أي واحدة بعد الحفظ من القايمة تحت.</span>
            </div>
          </CardContent>
        ) : (
          /* ============ وضع المعلومة الواحدة — زي ما هو ============ */
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
        )}
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
