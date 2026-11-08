'use client'

// ============================================================
// FILE: src/components/student/PagePhotoCapture.tsx
// (2026-ت5) طلب المستر الحرفي:
//   «لو الواجب مثلا ثلاث صفح تجيب له ثلاث زراير — تصوير الصفحة الأولى
//    من السؤال كذا للسؤال كذا — تصوير الصفحة الثانية… والطالب هو اللي يصور»
// زرار تصوير صفحة كاملة من ورقة الحل:
//   • كاميرا حقيقية جوه الصفحة (getUserMedia) + رداءة: رفع ملف جاهز
//   • الضغط قبل الرفع + رفع مقسّم (chunkedUpload) — نفس نظام ورقة الحل
//   • بعد الرفع: معاينة مصغرة + ✅ وإمكانية إعادة التصوير
// ============================================================

import { useRef, useState } from 'react'
import { Camera, CheckCircle2, ImageIcon, Loader2, RefreshCw, X } from 'lucide-react'
import { toast } from 'sonner'
import { chunkedUpload } from '@/lib/chunked-upload'
import { notifyPickerOpen, notifyPickerClose } from '@/components/student/useAntiCheat'

interface PagePhotoCaptureProps {
  /* نص الزرار — مثال: «تصوير الصفحة الأولى (من السؤال 1 للسؤال 5)» */
  label: string
  /* المسار الحالي لو اتصورت قبل كده */
  path?: string
  /* استدعى بعد نجاح الرفع بمسار الصورة (أو '' لو اتشالت) */
  onUploaded: (path: string) => void
  /* حالة الانشغال — الواجب/الامتحان بيمنع التسليم والصورة بتترفع */
  onBusy?: (busy: boolean) => void
  disabled?: boolean
}

/* ضغط الصورة قبل الرفع — نفس منطق MathKeyboard (ورقة توصل في ثواني) */
async function compressImageFile(file: File): Promise<File> {
  try {
    if (file.type === 'image/png' && file.size < 1.5 * 1024 * 1024) return file
    const imgUrl = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>(function (resolve, reject) {
        const el = new window.Image()
        el.onload = function () { resolve(el) }
        el.onerror = reject
        el.src = imgUrl
      })
      const maxDim = 2000
      let w = img.naturalWidth || img.width
      let h = img.naturalHeight || img.height
      if (!w || !h) return file
      const scale = Math.min(1, maxDim / Math.max(w, h))
      w = Math.max(1, Math.round(w * scale))
      h = Math.max(1, Math.round(h * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(img, 0, 0, w, h)
      const blob = await new Promise<Blob | null>(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.85) })
      if (!blob || blob.size <= 0) return file
      if (blob.size >= file.size && file.size < 2 * 1024 * 1024) return file
      const baseName = String(file.name || 'page.jpg').replace(/\.[^.]+$/, '')
      return new File([blob], baseName + '.jpg', { type: 'image/jpeg' })
    } finally {
      try { URL.revokeObjectURL(imgUrl) } catch (e2) {}
    }
  } catch (e) {
    return file
  }
}

export function PagePhotoCapture({ label, path, onUploaded, onBusy, disabled }: PagePhotoCaptureProps) {
  const [uploading, setUploading] = useState(false)
  const [camOpen, setCamOpen] = useState(false)
  const [camStarting, setCamStarting] = useState(false)
  const [camError, setCamError] = useState('')
  const camVideoRef = useRef<HTMLVideoElement | null>(null)
  const camStreamRef = useRef<MediaStream | null>(null)
  const camFacingRef = useRef<'environment' | 'user'>('environment')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const setBusy = function (b: boolean) {
    setUploading(b)
    if (onBusy) onBusy(b)
  }

  /* ================= الكاميرا الحقيقية — زي مشغل ورقة الحل ================= */
  const stopCamStream = function () {
    try {
      if (camStreamRef.current) {
        const tracks = camStreamRef.current.getTracks()
        for (let i = 0; i < tracks.length; i++) tracks[i].stop()
        camStreamRef.current = null
      }
    } catch (e) {}
  }

  const startCamera = async function () {
    setCamError('')
    setCamStarting(true)
    try {
      stopCamStream()
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('unsupported')
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: camFacingRef.current, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      })
      camStreamRef.current = stream
      if (camVideoRef.current) {
        camVideoRef.current.srcObject = stream
        try { await camVideoRef.current.play() } catch (e2) {}
      }
    } catch (err: any) {
      const ename = err && err.name ? String(err.name) : ''
      if (ename === 'NotAllowedError' || ename === 'PermissionDeniedError') {
        setCamError('لازم تسمح للكاميرا الأول — اضغط «سماح / Allow» في الرسالة اللي فوق وبعدها دوس تاني.')
      } else if (ename === 'NotFoundError' || ename === 'OverconstrainedError') {
        setCamError('مفيش كاميرا متوصلة — استخدم زرار «رفع صورة جاهزة» بدلها.')
      } else {
        setCamError('مقدرناش نفتح الكاميرا على المتصفح ده — استخدم زرار الرفع العادي.')
      }
    } finally {
      setCamStarting(false)
    }
  }

  const openCamera = function () {
    /* الكاميرا مش خروج من المنصة — تعليق عدّاد المغادرة طوال التصوير */
    notifyPickerOpen()
    try {
      toast.info('📸 لو ظهرلك طلب إذن الكاميرا اضغط «سماح / Allow» — ولو سمحت قبل كده هتفتح على طول', { duration: 5000 })
    } catch (eT) {}
    setCamError('')
    setCamOpen(true)
    setTimeout(function () { startCamera() }, 50)
  }

  const closeCamera = function () {
    setCamOpen(false)
    stopCamStream()
    notifyPickerClose()
  }

  const uploadFile = async function (file: File) {
    setBusy(true)
    try {
      const compressed = await compressImageFile(file)
      const data = await chunkedUpload(compressed, 'homework-answers', function () {})
      onUploaded(String(data.filePath || ''))
      toast.success('صورة الصفحة اترفعت ✅ — تقدر تكمل باقي الصفحات')
    } catch (err: any) {
      toast.error(String((err && err.message) || 'فشل رفع الصورة — حاول تاني'))
    } finally {
      setBusy(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const capturePhoto = async function () {
    const video = camVideoRef.current
    if (!video || !video.videoWidth || !video.videoHeight) return
    try {
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob | null>(function (resolve) { canvas.toBlob(resolve, 'image/jpeg', 0.92) })
      if (!blob || blob.size <= 0) return
      const file = new File([blob], 'page-' + Date.now() + '.jpg', { type: 'image/jpeg' })
      closeCamera()
      await uploadFile(file)
    } catch (e) {}
  }

  return (
    <div className="w-full">
      {/* زرار التصوير أو حالة النجاح */}
      {path ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-400/60 bg-emerald-50 px-2.5 py-2 dark:border-emerald-700/60 dark:bg-emerald-950/30">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={path} alt={label} className="h-10 w-10 rounded border border-emerald-300/60 object-cover" />
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold text-emerald-700 dark:text-emerald-300">
            الصفحة اتصورت واترفعت ✅
          </span>
          <button
            type="button"
            onClick={function () { onUploaded('') }}
            disabled={disabled || uploading}
            className="inline-flex min-h-9 items-center gap-1 rounded-md px-2 text-[11px] font-bold text-red-600 hover:bg-red-500/10 disabled:opacity-50"
            title="شيل الصورة وصوّر تاني"
          >
            <X className="h-3.5 w-3.5" />شيل
          </button>
          <button
            type="button"
            onClick={openCamera}
            disabled={disabled || uploading}
            className="inline-flex min-h-9 items-center gap-1 rounded-md bg-emerald-600 px-2.5 text-[11px] font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            <RefreshCw className="h-3.5 w-3.5" />صوّر تاني
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCamera}
            disabled={disabled || uploading}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-emerald-700 active:bg-emerald-800 disabled:opacity-50"
          >
            <Camera className="h-4 w-4 shrink-0" />
            <span>📷 {label}</span>
          </button>
          <button
            type="button"
            onClick={function () {
              notifyPickerOpen()
              fileInputRef.current?.click()
            }}
            disabled={disabled || uploading}
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-lg border-2 border-amber-500/60 bg-amber-50 px-2.5 text-[11px] font-bold text-amber-700 transition-colors hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900/20 dark:text-amber-300"
            title="ارفع صورة الصفحة من الجهاز"
          >
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
            <span>{uploading ? 'جاري الرفع…' : '📎 رفع'}</span>
          </button>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={function (e) {
          const f = e.target.files && e.target.files[0]
          if (f) void uploadFile(f)
        }}
      />

      {/* مودال الكاميرا الحقيقية — نفس مودال ورقة الحل */}
      {camOpen && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/80 p-4" onClick={closeCamera}>
          <div className="w-full max-w-md space-y-3 rounded-2xl bg-zinc-900 p-4 text-zinc-100" onClick={function (e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold">📷 {label}</p>
              <button type="button" onClick={closeCamera} aria-label="إغلاق الكاميرا" className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 hover:bg-white/20">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="overflow-hidden rounded-xl bg-black">
              <video ref={camVideoRef} playsInline muted autoPlay className="max-h-[60vh] w-full object-contain" />
            </div>
            {camStarting && <p className="flex items-center gap-2 text-xs text-zinc-400"><Loader2 className="h-3.5 w-3.5 animate-spin" />بنفتح الكاميرا…</p>}
            {camError ? (
              <p className="rounded-lg bg-red-950/60 px-3 py-2 text-[11px] font-bold text-red-200">{camError}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={capturePhoto}
                disabled={camStarting || !!camError}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 text-sm font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
              >
                <Camera className="h-4 w-4" />📸 صوّر الصفحة
              </button>
              <button
                type="button"
                onClick={function () {
                  camFacingRef.current = camFacingRef.current === 'environment' ? 'user' : 'environment'
                  startCamera()
                }}
                className="inline-flex min-h-[44px] items-center justify-center gap-1 rounded-lg border border-zinc-700 px-3 text-xs font-bold text-zinc-200 hover:bg-white/10"
              >
                🔄 اقلب الكاميرا
              </button>
            </div>
            <p className="text-center text-[10px] text-zinc-500">صوّر الصفحة كاملة واضحة — الأسئلة وكل إجاباتك جواها</p>
          </div>
        </div>
      )}
    </div>
  )
}
