'use client'

// ============================================================
// (2026-و44) FigurePointEditor — «حط نقط على الرسمة» — طلب المستر:
//   «نخلي حاجة أسهل: الرسمة مش محلولة الطالب يقدر يحل عليها — يختار
//    مكان النقط والمكان اللي يدوس عليه تحط فيه نقطة … وبعد كده يعمل
//    للرسمة (صورة) — طريقتين متاحين: نقط أو صورة من الكشكول»
//
// الفكرة الذكية: الطالب يدوس على الرسمة في الأماكن اللي عايز يحط فيها
// نقط → بنرسم النقط دي على نسخة من صورة الرسمة (canvas) → نرفع الصورة
// المركبة → بنضيف ماركر «[📷 صورة مرفقة: …]» لإجابته زي الصورة الملتقطة
// بالظبط — فالمصحح الذكي بيشوف الرسمة بنقط الطالب وبيحكم عليها
// (بالتسامح المعتاد: نقطة قريبة = صح — STEP 6.8 في المصحح).
// ============================================================

import * as React from 'react'
import { chunkedUpload } from '@/lib/chunked-upload'
import { Loader2, MousePointerClick, Send, X } from 'lucide-react'
import { toast } from 'sonner'

interface PlacedPoint { x: number; y: number } // نسب 0..1 من الرسمة

export function FigurePointEditor({ figureUrl, questionLabel, onAttached, onClose }: {
  figureUrl: string
  questionLabel?: string
  onAttached: (markerText: string) => void
  onClose: () => void
}) {
  var ptsState = React.useState<PlacedPoint[]>([])
  var pts = ptsState[0]
  var setPts = ptsState[1]
  var busyState = React.useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]
  var wrapRef = React.useRef<HTMLDivElement | null>(null)

  /* تحويل ضغطة على الرسمة لإحداثيات نسبية 0..1 */
  var handleClick = function (e: React.MouseEvent<HTMLDivElement>) {
    if (busy) return
    var wrap = wrapRef.current
    if (!wrap) return
    var rect = wrap.getBoundingClientRect()
    var x = (e.clientX - rect.left) / Math.max(1, rect.width)
    var y = (e.clientY - rect.top) / Math.max(1, rect.height)
    x = Math.min(1, Math.max(0, x))
    y = Math.min(1, Math.max(0, y))
    /* دوس قريب من نقطة موجودة (≥18px) = شيلها بدل ما تضيف غيرها */
    var threshold = 18 / Math.max(1, Math.min(rect.width, rect.height))
    var hitIdx = -1
    for (var i = 0; i < pts.length; i++) {
      var dx = pts[i].x - x
      var dy = pts[i].y - y
      if (Math.sqrt(dx * dx + dy * dy) <= threshold) { hitIdx = i; break }
    }
    if (hitIdx >= 0) setPts(pts.filter(function (_, k) { return k !== hitIdx }))
    else setPts(pts.concat([{ x: x, y: y }]))
  }

  /* تركيب الصورة النهائية: الرسمة الأصلية + نقط الطالب مرسومة عليها */
  var composeAndAttach = async function () {
    if (busy) return
    if (pts.length === 0) {
      toast.error('حط نقطة واحدة على الأقل الأول — دوس على مكان النقطة على الرسمة')
      return
    }
    setBusy(true)
    try {
      var img = new Image()
      img.src = figureUrl
      await new Promise<void>(function (res, rej) {
        img.onload = function () { res() }
        img.onerror = function () { rej(new Error('مقدرتش أحمّل صورة الرسمة')) }
      })
      var w = img.naturalWidth || img.width || 800
      var h = img.naturalHeight || img.height || 600
      var canvas = document.createElement('canvas')
      canvas.width = w; canvas.height = h
      var ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas غير مدعم')
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, w, h)
      ctx.drawImage(img, 0, 0, w, h)
      /* نقط الطالب — دوائر كحلية بحد أبيض واضح زي ما المعلم بيعلم بجابه */
      var r = Math.max(5, Math.round(Math.min(w, h) * 0.018))
      for (var i = 0; i < pts.length; i++) {
        var cx = Math.round(pts[i].x * w)
        var cy = Math.round(pts[i].y * h)
        ctx.beginPath()
        ctx.arc(cx, cy, r, 0, Math.PI * 2)
        ctx.fillStyle = '#1e3a8a'
        ctx.fill()
        ctx.lineWidth = Math.max(2, Math.round(r * 0.35))
        ctx.strokeStyle = '#ffffff'
        ctx.stroke()
      }
      var blob = await new Promise<Blob | null>(function (res) {
        canvas.toBlob(function (b) { res(b) }, 'image/jpeg', 0.85)
      })
      if (!blob) throw new Error('مقدرتش أجهز الصورة')
      var file = new File([blob], 'points-' + Date.now() + '.jpg', { type: 'image/jpeg' })
      var up = await chunkedUpload(file, 'homework-answers')
      if (!up || !up.filePath) throw new Error('فشل رفع الصورة — جرب تاني')
      toast.success('النقط اتسجلت على الرسمة ✓ هتترفع مع إجابتك')
      onAttached('\n[📷 صورة مرفقة: ' + up.filePath + ']\n')
      onClose()
    } catch (e: any) {
      toast.error(e && e.message ? e.message : 'حصلت مشكلة — جرب تاني')
    }
    setBusy(false)
  }

  return (
    <div className="mt-2 rounded-xl border-2 border-sky-300 bg-sky-50/70 dark:bg-sky-950/20 dark:border-sky-800 p-3 space-y-2">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <p className="text-[11px] font-bold text-sky-800 dark:text-sky-300 flex items-center gap-1.5">
          <MousePointerClick className="h-3.5 w-3.5" />
          حط نقط على الرسمة{questionLabel ? ' — ' + questionLabel : ''} — دوس على المكان وربع هتتحط نقطة، ودوس عليها تاني لو عايز تشيلها
        </p>
        <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground" aria-label="إغلاق">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div
        ref={wrapRef}
        onClick={handleClick}
        className="relative inline-block max-w-full cursor-crosshair select-none"
        role="application"
        aria-label="اضغط على الرسمة لتحديد النقط"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={figureUrl} alt="رسمة السؤال — دوس عليها لتحط النقط" className="max-w-full max-h-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white object-contain pointer-events-none" />
        {pts.map(function (p, i) {
          return (
            <span
              key={i}
              className="absolute rounded-full bg-blue-900 border-2 border-white shadow-md pointer-events-none"
              style={{
                width: 14,
                height: 14,
                left: 'calc(' + (p.x * 100) + '% - 7px)',
                top: 'calc(' + (p.y * 100) + '% - 7px)',
              }}
              aria-label={'نقطة ' + (i + 1)}
            />
          )
        })}
      </div>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy || pts.length === 0}
          onClick={composeAndAttach}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-3 py-1.5 text-xs font-bold disabled:opacity-50 cursor-pointer disabled:cursor-not-allowed"
        >
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
          {busy ? 'بيجهز الصورة…' : 'ثبّت النقط وارفعها'}
        </button>
        {pts.length > 0 && (
          <button type="button" onClick={function () { setPts([]) }} className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 cursor-pointer">
            امسح كل النقط ({pts.length})
          </button>
        )}
      </div>
    </div>
  )
}

export default FigurePointEditor
