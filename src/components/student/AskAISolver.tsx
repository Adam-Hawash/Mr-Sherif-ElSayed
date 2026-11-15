'use client'

/* ============================================================
 * (2026-وN9) قسم «اسأل الـ AI» — طلب المستر:
 *   «لو في سؤال مش عارفين يحلوه يدخله في المنصة، يرفع أي صورة
 *   والـ AI يحله ويفهمه ويقوله لهم»
 * الطالب بيرفع صورة السؤال (أو يكتبه) والـ AI بيرد بحل كامل
 * خطوة بخطوة + شرح بالمصري — وبنفس عارض رموز المنصة.
 * السجل بيفضل محفوظ — الطالب يرجع لأي سؤال حلّه قبل كده.
 * ============================================================ */

import { useState, useRef, useEffect } from 'react'
import { BrainCircuit, ImagePlus, X, Loader2, Send, History, ChevronDown, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { FractionText } from '@/components/FractionText'
import BidiText from '@/components/BidiText'

interface AskImage {
  id: string
  dataUrl: string
}

interface AskHistoryItem {
  id: string
  questionText: string
  imageData?: string
  solution: string
  createdAt: string
}

var MAX_IMAGES = 3

/* نفس ضاغط المساعد — أقصى 1280px JPEG عشان الطلب يفضل خفيف */
async function fileToDataUrl(file: File): Promise<string> {
  var dataUrl = await new Promise<string>(function (resolve, reject) {
    var reader = new FileReader()
    reader.onload = function () { resolve(String(reader.result)) }
    reader.onerror = function () { reject(new Error('read')) }
    reader.readAsDataURL(file)
  })
  try {
    var img = await new Promise<HTMLImageElement>(function (resolve, reject) {
      var im = document.createElement('img')
      im.onload = function () { resolve(im) }
      im.onerror = function () { reject(new Error('decode')) }
      im.src = dataUrl
    })
    var maxDim = 1280
    var w = img.naturalWidth || img.width
    var h = img.naturalHeight || img.height
    if (!w || !h) return dataUrl
    if (w > maxDim || h > maxDim) {
      var k = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * k)
      h = Math.round(h * k)
    }
    var canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    var ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch (e) {
    return dataUrl
  }
}

function formatWhen(iso: string): string {
  try {
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    var now = Date.now()
    var diffMin = Math.floor((now - d.getTime()) / 60000)
    if (diffMin < 1) return 'دلوقتي'
    if (diffMin < 60) return 'من ' + diffMin + ' دقيقة'
    if (diffMin < 1440) return 'من ' + Math.floor(diffMin / 60) + ' ساعة'
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'short' })
  } catch (e) { return '' }
}

export function AskAISolver({ studentId, grade }: { studentId: string; grade: string }) {
  const [images, setImages] = useState<AskImage[]>([])
  const [question, setQuestion] = useState('')
  const [loading, setLoading] = useState(false)
  const [current, setCurrent] = useState<{ question: string; solution: string } | null>(null)
  const [history, setHistory] = useState<AskHistoryItem[]>([])
  const [expandedId, setExpandedId] = useState<string>('')
  const [historyOpen, setHistoryOpen] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)

  /* تحميل سجل أسئلة الطالب */
  useEffect(function () {
    if (!studentId) return
    var alive = true
    ;(async function () {
      try {
        var res = await fetch('/api/ai/solve?studentId=' + encodeURIComponent(studentId))
        var j = await res.json()
        if (alive && j && Array.isArray(j.history)) setHistory(j.history)
      } catch (e) {}
    })()
    return function () { alive = false }
  }, [studentId])

  const handlePickImages = async function (e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files
    if (!files || files.length === 0) return
    var room = MAX_IMAGES - images.length
    var list: File[] = []
    for (var i = 0; i < files.length && list.length < Math.max(0, room); i++) list.push(files[i])
    if (files.length > list.length) toast.error('أقصى عدد صور في السؤال الواحد هو ' + MAX_IMAGES)
    var added: AskImage[] = []
    for (var j = 0; j < list.length; j++) {
      var f = list[j]
      if (!f.type || f.type.indexOf('image/') !== 0) {
        toast.error('مسموح بالصور فقط: ' + f.name)
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error('الصورة كبيرة جداً (الحد الأقصى 10MB): ' + f.name)
        continue
      }
      try {
        var dataUrl = await fileToDataUrl(f)
        added.push({ id: Date.now() + '-' + j, dataUrl: dataUrl })
      } catch (err) {
        toast.error('مش قادر أفتح الصورة: ' + f.name)
      }
    }
    if (added.length > 0) setImages(function (prev) { return prev.concat(added) })
    e.target.value = ''
  }

  const removeImage = function (id: string) {
    setImages(function (prev) { return prev.filter(function (p) { return p.id !== id }) })
  }

  const solve = async function () {
    var txt = question.trim()
    var imgs = images.map(function (p) { return p.dataUrl })
    if ((!txt && imgs.length === 0) || loading) return
    setLoading(true)
    try {
      var res = await fetch('/api/ai/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: txt || undefined, images: imgs.length > 0 ? imgs : undefined, studentId: studentId, grade: grade }),
      })
      var j = await res.json()
      if (!res.ok) {
        toast.error(String(j && j.error) || 'حصلت مشكلة — جرب تاني 🙏')
        return
      }
      var solution = String(j && j.solution) || ''
      setCurrent({ question: txt || 'سؤال بالصورة', solution: solution })
      /* أضفه فوق في السجل فورًا */
      var newItem: AskHistoryItem = {
        id: String(j && j.id) || 'tmp_' + Date.now(),
        questionText: txt,
        imageData: imgs.length > 0 ? imgs[0] : undefined,
        solution: solution,
        createdAt: new Date().toISOString(),
      }
      setHistory(function (prev) { return [newItem].concat(prev).slice(0, 20) })
      setExpandedId(newItem.id)
      setQuestion('')
      setImages([])
      toast.success('تم الحل! 🎉')
    } catch (e) {
      toast.error('حصلت مشكلة في الاتصال — جرب تاني 🙏')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto pb-8">
      {/* رأس القسم */}
      <div className="rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 text-white p-4 shadow-md">
        <div className="flex items-center gap-2.5">
          <div className="h-10 w-10 rounded-full bg-white/20 flex items-center justify-center shrink-0">
            <BrainCircuit className="h-5 w-5" />
          </div>
          <div>
            <h2 className="font-bold text-base">اسأل وحِل مع الـ AI 🧠</h2>
            <p className="text-xs opacity-90">سؤال مش عارف تحله؟ ارفع صورته أو اكتبه — الـ AI يحله خطوة بخطوة ويشرحه لك بالمصري</p>
          </div>
        </div>
      </div>

      {/* منطقة طرح السؤال */}
      <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
        {/* صور مرفوعة جاهزة */}
        {images.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {images.map(function (img) {
              return (
                <div key={img.id} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={img.dataUrl}
                    alt="صورة السؤال المرفوعة"
                    className="w-20 h-20 object-cover rounded-lg border border-border"
                    draggable={false}
                  />
                  <button
                    type="button"
                    aria-label="حذف الصورة"
                    onClick={function () { removeImage(img.id) }}
                    className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}

        <textarea
          value={question}
          onChange={function (e) { setQuestion(e.target.value) }}
          placeholder="اكتب سؤالك هنا... أو ارفع صورة السؤال 📸"
          rows={3}
          maxLength={2000}
          className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 resize-none"
        />

        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePickImages}
          />
          <button
            type="button"
            aria-label="إرفاق صورة السؤال"
            disabled={loading || images.length >= MAX_IMAGES}
            onClick={function () { if (fileRef.current) fileRef.current.click() }}
            className="h-11 px-4 rounded-xl border border-input bg-background text-sm text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
          >
            <ImagePlus className="h-4 w-4" />
            صورة السؤال
          </button>
          <button
            type="button"
            onClick={solve}
            disabled={loading || (!question.trim() && images.length === 0)}
            className="h-11 flex-1 rounded-xl bg-gradient-to-r from-purple-500 to-blue-500 text-white text-sm font-bold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-opacity"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                الـ AI بيحل وبيفكر...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                حِل واشرح لي
              </>
            )}
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">لو السؤال من ورقة، صوّره بإضاءة كويسة وكل الأرقام باينة — الـ AI هيقراها صح 👌</p>
      </div>

      {/* الحل الحالي */}
      {current && (
        <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-2">
          <div className="flex items-center gap-2 text-primary">
            <Sparkles className="h-4 w-4" />
            <span className="font-bold text-sm">حل سؤالك دلوقتي</span>
          </div>
          <p className="text-xs text-muted-foreground">{current.question}</p>
          <div className="rounded-xl bg-card border border-border p-3 text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">
            <FractionText text={current.solution} />
          </div>
        </div>
      )}

      {/* سجل الأسئلة */}
      {history.length > 0 && (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <button
            type="button"
            onClick={function () { setHistoryOpen(!historyOpen) }}
            className="w-full flex items-center gap-2 p-3.5 hover:bg-muted/50 transition-colors text-start"
          >
            <History className="h-4 w-4 text-muted-foreground" />
            <span className="font-bold text-sm flex-1">أسئلتي السابقة ({history.length})</span>
            <ChevronDown className={'h-4 w-4 text-muted-foreground transition-transform ' + (historyOpen ? 'rotate-180' : '')} />
          </button>
          {historyOpen && (
            <div className="border-t border-border divide-y divide-border max-h-96 overflow-y-auto custom-scrollbar">
              {history.map(function (item) {
                var open = expandedId === item.id
                return (
                  <div key={item.id}>
                    <button
                      type="button"
                      onClick={function () { setExpandedId(open ? '' : item.id) }}
                      className="w-full flex items-center gap-2 p-3 hover:bg-muted/40 transition-colors text-start"
                    >
                      {item.imageData && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={item.imageData} alt="صورة السؤال" className="w-10 h-10 object-cover rounded-md border border-border shrink-0" draggable={false} />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" dir="auto">
                          <BidiText text={item.questionText || 'سؤال بالصورة'} />
                        </p>
                        <p className="text-[10px] text-muted-foreground">{formatWhen(item.createdAt)}</p>
                      </div>
                      <ChevronDown className={'h-3.5 w-3.5 text-muted-foreground shrink-0 transition-transform ' + (open ? 'rotate-180' : '')} />
                    </button>
                    {open && (
                      <div className="px-3 pb-3">
                        <div className="rounded-xl bg-muted/50 border border-border p-3 text-sm leading-relaxed whitespace-pre-wrap break-words" dir="auto">
                          <FractionText text={item.solution} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
