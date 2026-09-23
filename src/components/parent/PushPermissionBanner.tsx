'use client'

// ============================================================
// (2026-و89) PushPermissionBanner — بوب-أب تفعيل إشعارات الموبايل لولي الأمر
//   طلب المستر الحرفي: «الإشعار اللي هيجي لولي الأمر بره مش هيجي على
//   الواتساب — يجي زي برومبت البراوزر، ولما يدوس عليه يخش على الإشعارات
//   اللي جوه المنصة».
//
//   التدفق: أول ما ولي الأمر يدخل بورتاله → بوب-أب ودود (مش برومبت
//   البراوزر الخام) بيشرح ليه محتاجين الإذن → «تفعيل الإشعارات الآن»
//   → برومبت البراوزر → حفظ الاشتراك → الإشعارات الجاية بتظهر بره على
//   شاشة الموبايل. مع كارت حالة صغير دايم في البورتال (مفعّلة/متقفلة)
//   + زرار إشعار تجريبي + زرار إيقاف.
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { BellRing, BellOff, Loader2, Smartphone, Send, CheckCircle2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  enableParentPush,
  disableParentPush,
  sendTestParentPush,
  isParentPushEnabled,
  getPushPermissionState,
  type PushPermState,
} from '@/lib/parent-push-client'

export default function PushPermissionBanner({ parentId }: { parentId: string }) {
  var permState = useState<PushPermState>('default')
  var perm = permState[0]
  var setPerm = permState[1]

  var enabledState = useState(false)
  var enabled = enabledState[0]
  var setEnabled = enabledState[1]

  var busyState = useState(false)
  var busy = busyState[0]
  var setBusy = busyState[1]

  var testBusyState = useState(false)
  var testBusy = testBusyState[0]
  var setTestBusy = testBusyState[1]

  var openState = useState(false)
  var open = openState[0]
  var setOpen = openState[1]

  var readyState = useState(false)
  var ready = readyState[0]
  var setReady = readyState[1]

  /* تهيئة الحالة + إظهار البوب-أب تلقائيًا أول ما ولي الأمر يفتح بورتاله */
  useEffect(function () {
    if (!parentId) return
    var p = getPushPermissionState()
    setPerm(p)
    setEnabled(isParentPushEnabled(parentId))
    setReady(true)
    try {
      var dismissed = String(sessionStorage.getItem('parent_push_dismissed') || '') === '1'
      if (p === 'default' && !isParentPushEnabled(parentId) && !dismissed) {
        var to = setTimeout(function () { setOpen(true) }, 1400)
        return function () { clearTimeout(to) }
      }
    } catch (e) {}
  }, [parentId])

  /* التفعيل — الإذن ثم الاشتراك ثم الحفظ عند السيرفر */
  var enable = useCallback(async function () {
    if (!parentId || busy) return
    setBusy(true)
    var r = await enableParentPush(parentId)
    setBusy(false)
    if (r.ok) {
      setPerm(getPushPermissionState())
      setEnabled(true)
      setOpen(false)
      toast.success('تمام كده! 🎉 الإشعارات مفعّلة — أول ما ابنك يسلّم امتحان أو واجب هتوصلك درجته على موبايلك أول بأول', { duration: 6000 })
    } else if (r.reason === 'denied') {
      setPerm('denied')
      setOpen(false)
      toast.error('الإشعارات متقفلة من المتصفح — افتح إعدادات الموقع (القفل جنب اللينك) وسمح ليها', { duration: 8000 })
    } else if (r.reason === 'unsupported') {
      setOpen(false)
      toast.error('المتصفح ده مش بيدعم الإشعارات — جرب كروم على الموبايل', { duration: 8000 })
    } else {
      toast.error('حصلت مشكلة في تفعيل الإشعارات — جرب تاني بعد لحظات', { duration: 6000 })
    }
  }, [parentId, busy])

  var disable = useCallback(async function () {
    if (!parentId) return
    await disableParentPush(parentId)
    setEnabled(false)
    toast.info('تم إيقاف إشعارات الموبايل على الجهاز ده — تقدر تفعّلها تاني في أي وقت')
  }, [parentId])

  var test = useCallback(async function () {
    if (!parentId || testBusy) return
    setTestBusy(true)
    var r = await sendTestParentPush(parentId)
    setTestBusy(false)
    if (r.ok && r.message) toast.success(r.message, { duration: 6000 })
    else toast.error('مفيش إشعار وصل — اتأكد إن التفعيل مكتوب «مفعّلة» وجرب تاني')
  }, [parentId, testBusy])

  var dismiss = useCallback(function () {
    try { sessionStorage.setItem('parent_push_dismissed', '1') } catch (e) {}
    setOpen(false)
  }, [])

  if (!parentId || !ready) return null

  /* ============ كارت الحالة الصغير (دايمًا ظاهر في البورتال) ============ */
  if (enabled && perm === 'granted') {
    return (
      <Card className="border-emerald-500/25 bg-emerald-500/[0.06]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 h-9 w-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-600" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">إشعارات الموبايل مفعّلة ✓</p>
                <p className="text-[11px] text-muted-foreground">هتوصلك درجات أبنائك بره على شاشة موبايلك أول بأول</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={test} disabled={testBusy}>
                {testBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                جرّب إشعار تجريبي
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={disable}>
                <BellOff className="h-3.5 w-3.5" />
                إيقاف
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (perm === 'denied') {
    return (
      <Card className="border-amber-500/30 bg-amber-500/[0.06]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
              <BellOff className="h-4.5 w-4.5 text-amber-600" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">الإشعارات متقفلة من المتصفح</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">افتح إعدادات الموقع (أيقونة القفل 🔒 جنب اللينك) وسمح بالإشعارات عشان درجات ابنك توصلك على الموبايل</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (perm === 'unsupported') {
    return (
      <Card className="border-border">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-xl bg-muted flex items-center justify-center">
              <BellOff className="h-4.5 w-4.5 text-muted-foreground" />
            </div>
            <p className="text-[13px] text-muted-foreground font-medium leading-relaxed">المتصفح ده مش بيدعم إشعارات الموبايل — افتح المنصة من كروم على الموبايل وفعّلها من هنا</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  /* ============ default: كارت دعوة + البوب-أب التلقائي ============ */
  return (
    <>
      <Card className="border-primary/25 bg-primary/[0.04]">
        <CardContent className="p-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="shrink-0 h-9 w-9 rounded-xl bg-primary/12 flex items-center justify-center">
                <BellRing className="h-4.5 w-4.5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-foreground">فعّل إشعارات الموبايل 🔔</p>
                <p className="text-[11px] text-muted-foreground">درجات ابنك توصلك أول بأول على شاشة موبايلك بره المنصة</p>
              </div>
            </div>
            <Button size="sm" className="h-9 shrink-0 gap-1.5 text-xs font-bold" onClick={function () { setOpen(true) }}>
              <BellRing className="h-3.5 w-3.5" />
              سماح بالتنبيهات
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ============ البوب-أب الودود (مش برومبت البراوزر الخام) ============ */}
      <Dialog open={open} onOpenChange={function (v) { if (!v) dismiss() }}>
        <DialogContent className="max-w-md rounded-2xl border-primary/25 p-0 overflow-hidden gap-0" dir="rtl">
          <div className="relative bg-gradient-to-br from-primary/15 via-primary/5 to-transparent px-6 pt-7 pb-5 text-center">
            <div className="mx-auto mb-3 relative">
              <div className="absolute inset-0 rounded-full bg-primary/20 blur-lg" aria-hidden="true" />
              <div className="relative h-16 w-16 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg">
                <BellRing className="h-8 w-8" />
              </div>
            </div>
            <DialogHeader className="space-y-1.5">
              <DialogTitle className="text-lg font-black text-foreground leading-snug">خلي درجات ابنك توصلك أول بأول! 🔔</DialogTitle>
              <DialogDescription className="text-[13px] leading-relaxed text-muted-foreground font-medium">
                عشان تتابع درجات ابنك أو بنتك أول بأول على الموبايل بره وتوصلك كل التنبيهات المهمة، اضغط هنا ووافق على الإشعارات عشان المستر يقدر يبعت لك تقارير الدرجات أول بأول!
              </DialogDescription>
            </DialogHeader>
          </div>
          <div className="px-6 pb-6 pt-1 space-y-3">
            <div className="flex items-start gap-2 rounded-xl border border-primary/20 bg-primary/[0.05] px-3.5 py-2.5">
              <Smartphone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p className="text-[11.5px] leading-relaxed text-foreground/80 font-medium">
                أول ما يوصلك الإشعار على شاشة موبايلك، اضغط عليه — هيفتح لك المنصة على شاشة تسجيل دخولك، وبعد الدخول تلاقي كل الإشعارات جوه المنصة.
              </p>
            </div>
            <Button className="w-full min-h-[48px] font-black text-base gap-2" onClick={enable} disabled={busy}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <BellRing className="h-5 w-5" />}
              {busy ? 'لحظة واحدة…' : 'تفعيل الإشعارات الآن'}
            </Button>
            <button type="button" onClick={dismiss} className="w-full text-center text-xs text-muted-foreground hover:text-foreground transition-colors min-h-[36px] cursor-pointer">
              لاحقًا — مش دلوقتي
            </button>
            <p className="text-center text-[10px] text-muted-foreground/70 leading-relaxed">
              لو موبايلك آيفون: الإشعارات بتشتغل بعد إضافة المنصة للشاشة الرئيسية (زرار المشاركة ← Add to Home Screen)
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
