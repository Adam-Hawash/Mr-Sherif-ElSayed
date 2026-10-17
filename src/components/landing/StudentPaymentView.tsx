'use client'

import { useAppStore } from '@/stores/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  ArrowRight, Loader2, Smartphone, CreditCard, Wallet, CheckCircle2, X,
  Image as ImageIcon, Camera, Trash2,
} from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'

export function StudentPaymentView() {
  const { pendingPaymentVideo, setView, setPendingPaymentVideo, siteConfig, currentStudent } = useAppStore()
  const [paymentMethod, setPaymentMethod] = useState('')
  const [transactionRef, setTransactionRef] = useState('')
  const [uploading, setUploading] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  /* (ز19) صورة وصل الدفع — إجبارية بطلب المستر */
  const [receiptFile, setReceiptFile] = useState<File | null>(null)
  const [receiptPreview, setReceiptPreview] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  const video = pendingPaymentVideo

  // Payment numbers from site config (set by admin)
  const vodafoneCash = siteConfig?.payment_vodafone_cash || ''
  const instapay = siteConfig?.payment_instapay || ''
  const fawry = siteConfig?.payment_fawry || ''

  useEffect(() => {
    if (!video) {
      setView('student-portal')
    }
  }, [video, setView])

  if (!video) return null

  const handleSubmit = async () => {
    if (!paymentMethod) {
      toast.error('اختر طريقة الدفع الأول')
      return
    }

    /* (ز19) صورة الوصل إجبارية — من غيرها الطلب مش بيتقبل */
    if (!receiptFile) {
      toast.error('صورة وصل الدفع إجبارية — ارفع سكرين شوت رسالة تأكيد التحويل الأول')
      return
    }

    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('videoId', video.id)
      formData.append('videoTitle', video.title)
      formData.append('amount', String(video.price))
      formData.append('paymentMethod', paymentMethod)
      /* مرجع العملية نص اختياري + صورة الوصل إجبارية (ز19) */
      formData.append('notes', transactionRef ? 'مرجع العملية: ' + transactionRef : '')
      formData.append('receipt', receiptFile)
      formData.append('studentId', currentStudent?.id || '')
      formData.append('studentName', currentStudent?.name || '')

      const res = await fetch('/api/payments', {
        method: 'POST',
        body: formData,
      })

      if (res.ok) {
        setSubmitted(true)
        toast.success('تم إرسال طلب التفعيل مع صورة الوصل بنجاح! سيتم مراجعته قريباً')
      } else {
        var errData: any = null
        try { errData = await res.json() } catch (e) {}
        toast.error((errData && errData.error) || 'حدث خطأ أثناء إرسال الدفع')
      }
    } catch {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setUploading(false)
    }
  }

  const onPickReceipt = (e: React.ChangeEvent<HTMLInputElement>) => {
    var f = e.target.files && e.target.files[0]
    if (!f) return
    if (f.type.indexOf('image/') !== 0) {
      toast.error('لازم صورة — سكرين شوت رسالة تأكيد التحويل')
      return
    }
    if (f.size > 10 * 1024 * 1024) {
      toast.error('الصورة كبيرة أوي — أقصى حد 10 ميجا')
      return
    }
    setReceiptFile(f)
    try { setReceiptPreview(URL.createObjectURL(f)) } catch (err) { setReceiptPreview('') }
  }

  const clearReceipt = () => {
    setReceiptFile(null)
    setReceiptPreview('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const handleBack = () => {
    setPendingPaymentVideo(null)
    setView('student-portal')
  }

  if (submitted) {
    return (
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center">
          <CardContent className="p-8 space-y-4">
            <div className="mx-auto h-16 w-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold">تم إرسال طلب التفعيل بنجاح!</h2>
            <p className="text-muted-foreground">
              وصل الدفع وصل للمستر في قسم المدفوعات — أول ما يأكد التحويل الفيديو هيشتغل على طول.
            </p>
            <Button onClick={handleBack} className="mt-4">
              <ArrowRight className="h-4 w-4 ml-2" />
              العودة للدروس
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex-1 py-6 px-4 sm:px-6">
      <div className="mx-auto max-w-lg">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="sm" onClick={handleBack}>
            <ArrowRight className="h-4 w-4 ml-1" />
            رجوع
          </Button>
          <h1 className="text-xl font-bold">الدفع</h1>
        </div>

        {/* Video Info */}
        <Card className="mb-6">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="min-w-0">
              <p className="text-sm text-muted-foreground">فيديو</p>
              <p className="font-bold truncate">{video.title}</p>
            </div>
            <Badge className="text-lg px-3 py-1 bg-amber-500 text-white shrink-0">
              {video.price} ج.م
            </Badge>
          </CardContent>
        </Card>

        {/* Payment Numbers */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            <h2 className="font-bold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              رقم الدفع
            </h2>
            <p className="text-sm text-muted-foreground">
              حول المبلغ على أي رقم من الأرقام دي، ثم اضغط «إرسال طلب التفعيل» وهنأكد التحويل ونشغل الفيديو
            </p>

            <div className="space-y-3">
              {vodafoneCash && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <div className="h-10 w-10 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center shrink-0">
                    <Smartphone className="h-5 w-5 text-red-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">فودافون كاش</p>
                    <p className="font-bold text-sm" dir="ltr">{vodafoneCash}</p>
                  </div>
                </div>
              )}

              {instapay && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                    <CreditCard className="h-5 w-5 text-violet-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">إنستا باي</p>
                    <p className="font-bold text-sm" dir="ltr">{instapay}</p>
                  </div>
                </div>
              )}

              {fawry && (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center shrink-0">
                    <Wallet className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">فوري</p>
                    <p className="font-bold text-sm" dir="ltr">{fawry}</p>
                  </div>
                </div>
              )}

              {!vodafoneCash && !instapay && !fawry && (
                <p className="text-center text-sm text-muted-foreground py-4">
                  لم يتم إعداد أرقام الدفع بعد
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Payment Method Selection */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-4">
            <h2 className="font-bold">اختر طريقة الدفع</h2>
            <div className="grid grid-cols-3 gap-2">
              {vodafoneCash && (
                <button
                  onClick={() => setPaymentMethod('vodafone_cash')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    paymentMethod === 'vodafone_cash'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <Smartphone className="h-5 w-5" />
                  <span className="text-xs font-medium">فودافون كاش</span>
                </button>
              )}
              {instapay && (
                <button
                  onClick={() => setPaymentMethod('instapay')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    paymentMethod === 'instapay'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                  <span className="text-xs font-medium">إنستا باي</span>
                </button>
              )}
              {fawry && (
                <button
                  onClick={() => setPaymentMethod('fawry')}
                  className={`flex flex-col items-center gap-1 p-3 rounded-xl border-2 transition-all ${
                    paymentMethod === 'fawry'
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-muted hover:border-primary/50'
                  }`}
                >
                  <Wallet className="h-5 w-5" />
                  <span className="text-xs font-medium">فوري</span>
                </button>
              )}
            </div>
          </CardContent>
        </Card>

        {/* (ز19) صورة وصل الدفع — إجبارية بطلب المستر */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-3">
            <h2 className="font-bold flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              صورة وصل الدفع
              <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">إجباري</span>
            </h2>
            <p className="text-xs text-muted-foreground">
              بعد ما تحوّل، اعمل سكرين شوت لرسالة تأكيد التحويل وارفعها هنا — الصورة بتوصل للمستر في قسم المدفوعات على طول
            </p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onPickReceipt}
            />
            {!receiptPreview ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-28 rounded-xl border-2 border-dashed flex flex-col items-center justify-center gap-1.5 text-muted-foreground hover:border-primary/60 hover:text-primary transition-colors"
              >
                <Camera className="h-6 w-6" />
                <span className="text-sm font-bold">اضغط وارفع صورة وصل الدفع</span>
                <span className="text-[11px]">من الكاميرا أو المعرض — أقصى حد 10 ميجا</span>
              </button>
            ) : (
              <div className="relative rounded-xl overflow-hidden border bg-muted/40">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={receiptPreview} alt="وصل الدفع" className="w-full max-h-56 object-contain" />
                <button
                  type="button"
                  onClick={clearReceipt}
                  className="absolute top-2 left-2 h-8 w-8 rounded-full bg-black/70 text-white flex items-center justify-center hover:bg-black/90"
                  aria-label="إزالة الصورة"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* مرجع العملية (اختياري — بيسرّع التأكيد) */}
        <Card className="mb-6">
          <CardContent className="p-4 space-y-3">
            <h2 className="font-bold">مرجع عملية التحويل (اختياري)</h2>
            <Input
              value={transactionRef}
              onChange={(e) => setTransactionRef(e.target.value)}
              placeholder="رقم العملية من رسالة المحفظة (لو متاح)"
              dir="ltr"
              className="text-sm"
            />
            <p className="text-xs text-muted-foreground">
              مرجع العملية هو الرقم اللي بييجي في رسالة تأكيد التحويل من المحفظة أو البنك
              (مثال: 2510123456) — اختياري، بس بيسرّع مراجعة المستر للدفع. المهم هو صورة الوصل.
            </p>
          </CardContent>
        </Card>

        {/* Submit */}
        <Button
          className="w-full py-6 text-base"
          size="lg"
          onClick={handleSubmit}
          disabled={!paymentMethod || uploading}
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin ml-2" />
          ) : (
            <CheckCircle2 className="h-5 w-5 ml-2" />
          )}
          {uploading ? 'جاري الإرسال...' : 'إرسال طلب التفعيل'}
        </Button>
      </div>
    </div>
  )
}
