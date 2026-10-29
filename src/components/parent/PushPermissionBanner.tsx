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
//
//   (2026-ص6) خاصية المنصة دي: تفعيل صامت لجهاز جديد — لو الإذن متمنح
//   أصلًا والجهاز ده مش متسجل → بيتسجل لوحده من غير أي بوب-أب.
//   (Z-30) + كشف المتصفحات الداخلية وآيفون + شفاء ذاتي للاشتراكات
//   زي Maths-Genius بالظبط.
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
  detectPushContext,
  healParentPushIfNeeded,
  type PushPermState,
  type PushContext,
} from '@/lib/parent-push-client'

/* ============================================================
 * (2026-و91) تنبيه نصي بطلب المستر الحرفي — كود الـ QR اتشال خالص
 * («مش مظبوط — شيله») وح محله كلام واضح يخلي ولي الأمر يفهم بنفسه:
 * التفعيل لازم يكون من موبايله هو (الجهاز الأساسي اللي هيجي له منه
 * الإشارات) — لأن Web Push لكل جهاز لوحده.
 * + نصيحة ضغط على الإشعار لما يوصل — عشان كروم مايعتبرهاش إشعارات
 *   مزعجة وما يحولهاش صامتة (الإشعارات اللي بيتجاهلها المستخدم
 *   بيتعامل معاها المتصفح كسبام بعد فترة).
 * ============================================================ */
function DeviceHintNote({ tone }: { tone: 'primary' | 'amber' | 'emerald' }) {
  var box = tone === 'emerald'
    ? 'border-emerald-500/20 bg-emerald-500/[0.05]'
    : tone === 'amber'
    ? 'border-amber-500/25 bg-amber-500/[0.06]'
    : 'border-primary/20 bg-primary/[0.05]'
  var iconColor = tone === 'emerald' ? 'text-emerald-600' : tone === 'amber' ? 'text-amber-600' : 'text-primary'
  return (
    <div className={'flex items-start gap-2 rounded-xl border px-3.5 py-2.5 ' + box}>
      <Smartphone className={'h-4 w-4 shrink-0 mt-0.5 ' + iconColor} />
      <p className="text-[11.5px] leading-relaxed text-foreground/85 font-medium">
        <span className="font-black">مهم: الإشعارات بتوصل على الجهاز اللي بتفعّل منها لوحده</span> — يعني تفعيلها من جهاز تاني/كمبيوتر مش هيوصلك حاجة على موبايلك.
        عشان توصلك على موبايلك: افتح المنصة من كروم على <span className="font-black">موبايلك الشخصي</span>، سجّل دخولك بحسابك، واضغط «سماح بالتنبيهات» هناك مرة واحدة — وده الجهاز الأساسي اللي كل الإشعارات هتوصلك منه.
        <span className="block mt-1 text-foreground/70">ولما الإشعار يوصلك اضغط عليه — كده الموبايل بيأكد إنها رسايل مهمة وبتفضل تظهر عادي ومش مزعجة.</span>
      </p>
    </div>
  )
}

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

  var ctxState = useState<PushContext>('ok')
  var ctx = ctxState[0]
  var setCtx = ctxState[1]

  var healingState = useState(false)
  var healing = healingState[0]
  var setHealing = healingState[1]

  /* تهيئة الحالة + إظهار البوب-أب تلقائيًا أول ما ولي الأمر يفتح بورتاله */
  useEffect(function () {
    if (!parentId) return
    var p = getPushPermissionState()
    var c = detectPushContext()
    setPerm(p)
    setCtx(c)
    var localEnabled = isParentPushEnabled(parentId)
    setEnabled(localEnabled)
    setReady(true)
    /* (2026-ص6) تفعيل صامت لجهاز جديد — طلب المستر: «عاوز أفرق ما بين
       الأجهزة». الإذن متمنح على الجهاز ده بس مفيش اشتراك محلي
       (المستر فعّلها على اللاب، ولما فتح المنصة من موبايله مكانش
       بيوصله حاجة) — بنسجّل الجهاز ده لوحده من غير أي بوب-أب،
       لأن الاشتراك لكل جهاز لوحده والمفتاح ده محلي على الجهاز. */
    if (p === 'granted' && !localEnabled) {
      enableParentPush(parentId).then(function (r) {
        if (r && r.ok) {
          setEnabled(true)
          try { sessionStorage.setItem('parent_push_dismissed', '1') } catch (e) {}
        }
      }).catch(function () {})
      return
    }
    /* (Z-30) متصفح داخلي أو آيفون من غير تطبيق مثبت — مفيش بوب-أب تلقائي أصلًا
       عشان مفيش برومبت هيشتغل هنا — كارت الإرشاد هو اللي هيظهر */
    if (c !== 'ok') return
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
      toast.success('تمام كده! 🎉 الإشعارات مفعّلة على الجهاز ده — أول ما ابنك يسلّم امتحان أو واجب هتوصلك درجته هنا أول بأول', { duration: 6000 })
    } else if (r.reason === 'inapp') {
      /* (Z-30) متصفح داخلي — رسالة صريحة بدل «مقفلتش نافذة الإذن» المضللة */
      setOpen(false)
      toast.error('انت فاتح المنصة من متصفح جوه تطبيق تاني (فيسبوك/إنستجرام/واتساب) — المتصفحات دي مش بتسمح بالإشعارات أصلًا. انسخ لينك المنصة وافتحه في كروم (أو سفاري على الآيفون) وسجّل دخولك وفعّل الإشعارات هناك وهيشتغلوا تمام', { duration: 14000 })
    } else if (r.reason === 'ios-browser') {
      /* (Z-30) آيفون من غير تطبيق مثبت — إشعارات iOS بتشتغل من التطبيق المثبت بس */
      setOpen(false)
      toast.error('على الآيفون: الإشعارات بتشتغل بعد تثبيت المنصة كتطبيق — افتح المنصة في سفاري واضغط زرار «تثبيت التطبيق» (أو زرار المشاركة ← Add to Home Screen) وافتحها من الأيقونة وفعّل الإشعارات من هناك', { duration: 14000 })
    } else if (r.reason === 'denied') {
      setPerm('denied')
      setOpen(false)
      toast.error('الإشعارات متقفلة من المتصفح — افتح إعدادات الموقع (القفل جنب اللينك) وسمح ليها', { duration: 8000 })
    } else if (r.reason === 'dismissed') {
      toast.error('مقفلتش نافذة الإذن — اضغط «تفعيل الإشعارات الآن» تاني ووافق على رسالة المتصفح', { duration: 8000 })
    } else if (r.reason === 'unsupported') {
      setOpen(false)
      toast.error('المتصفح ده مش بيدعم الإشعارات — جرب كروم على الموبايل', { duration: 8000 })
    } else if (r.reason === 'sw-failed') {
      toast.error('المنصة بتجهز نفسها دلوقتي (أول زيارة بتاخد ثواني) — جرب تاني بعد لحظة', { duration: 8000 })
    } else if (r.reason === 'no-key') {
      toast.error('السيرفر مش جاهز لسه — استنى ثواني وجرب تاني', { duration: 8000 })
    } else if (r.reason === 'subscribe-failed') {
      toast.error('المتصفح رفض الاشتراك اللحظة دي — جرب تاني وهينجح', { duration: 8000 })
    } else if (r.reason === 'save-failed') {
      toast.error('الاتصال ضعيف — مش قادرين نحفظ التفعيل، اتأكد من النت وجرب تاني', { duration: 8000 })
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
    if (!parentId || testBusy || healing) return
    setTestBusy(true)
    var r = await sendTestParentPush(parentId)
    /* (2026-ز32) التفريق بين «الإشعار اتقدم فعلاً» و«مفيش أجهزة متسجلة» */
    if (r.ok && typeof r.sent === 'number' && r.sent > 0) {
      setTestBusy(false)
      toast.success(r.message || 'اتبعت الإشعار — بص على شاشة موبايلك 📱', { duration: 6000 })
      return
    }
    /* (Z-30) الشفاء الذاتي: لو مفيش أجهزة متسجلة عند السيرفر والإذن ممنوح
       على الجهاز ده — غالبًا اشتراك الجهاز ضاع من قاعدة البيانات (نشر/بارد)
       فنعيد حفظه تلقائيًا من غير أي برومبت ونجرب تاني — ولي الأمر ماحسش بحاجة */
    setTestBusy(false)
    setHealing(true)
    var h = await healParentPushIfNeeded(parentId)
    setHealing(false)
    if (h.healed && h.sent > 0) {
      toast.success('رجّعنا نظبط اشتراك الجهاز ده تلقائيًا واتبعت الإشعار — بص على شاشة موبايلك 📱', { duration: 8000 })
      return
    }
    if (r.ok) {
      toast.warning('مفيش جهاز متسجل على الحساب ده لسه — الإشعارات بتيجي على الجهاز اللي اتفعّل منها بس. من الجهاز ده اضغط «إيقاف» ثم فعّلها تاني ووافق على إذن المتصفح، وبعدها جرب الإشعار التجريبي هيوصلك فورًا', { duration: 12000 })
    } else {
      toast.error('مفيش إشعار وصل — اتأكد إن التفعيل مكتوب «مفعّلة» وجرب تاني')
    }
  }, [parentId, testBusy, healing])

  var dismiss = useCallback(function () {
    try { sessionStorage.setItem('parent_push_dismissed', '1') } catch (e) {}
    setOpen(false)
  }, [])

  if (!parentId || !ready) return null

  /* ============ (Z-30) كارت إرشاد للمتصفحات اللي مش بتدعم الإشعارات أصلًا ============ */
  if (ctx === 'inapp') {
    return (
      <Card className="border-amber-500/30 bg-amber-500/[0.06]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><BellOff className="h-4.5 w-4.5 text-amber-600" /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">الإشعارات مش بتشتغل من المتصفح ده</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">انت فاتح المنصة من متصفح جوه تطبيق تاني (فيسبوك/إنستجرام/واتساب وحداهم مش بيسمحوا بالإشعارات). <span className="font-black text-foreground">انسخ لينك المنصة وافتحه في كروم</span> على موبايلك — سجّل دخولك وفعّل الإشعارات وهتوصلك عادي ✓</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }
  if (ctx === 'ios-browser' && perm !== 'granted') {
    return (
      <Card className="border-amber-500/30 bg-amber-500/[0.06]">
        <CardContent className="p-4">
          <div className="flex items-center gap-2.5">
            <div className="shrink-0 h-9 w-9 rounded-xl bg-amber-500/15 flex items-center justify-center"><BellOff className="h-4.5 w-4.5 text-amber-600" /></div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">على الآيفون: ثبّت المنصة كتطبيق الأول</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">إشعارات الآيفون بتشتغل من التطبيق المثبت على الشاشة الرئيسية — افتح المنصة في سفاري واضغط <span className="font-black text-foreground">زرار «تثبيت التطبيق»</span> (أو المشاركة ⬆️ ← Add to Home Screen)، وافتح المنصة من الأيقونة وسجّل دخولك وفعّل الإشعارات ✓</p>
            </div>
          </div>
        </CardContent>
      </Card>
    )
  }

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
                <p className="text-sm font-bold text-foreground">إشعارات الموبايل مفعّلة على الجهاز ده ✓</p>
                <p className="text-[11px] text-muted-foreground">التفعيل لكل جهاز لوحده — عايز الإشعار يوصلك على موبايل تاني أو اللاب؟ افتح المنصة منه وفعّلها هناك كمان</p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={test} disabled={testBusy || healing}>
                {(testBusy || healing) ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                جرّب إشعار تجريبي
              </Button>
              <Button size="sm" variant="ghost" className="h-8 gap-1.5 text-xs text-muted-foreground hover:text-destructive" onClick={disable}>
                <BellOff className="h-3.5 w-3.5" />
                إيقاف
              </Button>
            </div>
          </div>
          {/* (و91) تنبيه نصي — التفعيل من موبايل ولي الأمر هو الجهاز الأساسي */}
          <div className="mt-3 pt-3 border-t border-emerald-500/15">
            <DeviceHintNote tone="emerald" />
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
          {/* (و91) تنبيه نصي — يفعّلها من موبايله الشخصي */}
          <div className="mt-3 pt-3 border-t border-amber-500/15">
            <DeviceHintNote tone="amber" />
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
          {/* (و91) تنبيه نصي — التفعيل من موبايل ولي الأمر هو الجهاز الأساسي */}
          <div className="mt-3 pt-3 border-t border-primary/15">
            <DeviceHintNote tone="primary" />
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
            {/* (و91) وضّح لولي الأمر إن التفعيل لازم يكون من موبايله هو — من غير أي QR */}
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/25 bg-amber-500/[0.06] px-3.5 py-2.5">
              <Smartphone className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[11.5px] leading-relaxed text-foreground/85 font-medium">
                مهم: الإشعارات بتوصل على الجهاز اللي بتفعّل منها لوحده — عشان توصلك على موبايلك، افتح المنصة من كروم على <span className="font-black">موبايلك الشخصي</span>، سجّل دخولك، واضغط «تفعيل الإشعارات الآن» هناك — وده الجهاز الأساسي اللي كل الإشعارات هتوصلك منه.
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
