'use client'
// ============================================================
// (2026-و111) رسايل حل الشكاوى على جهاز الطالب — Device Messages
// ------------------------------------------------------------
// بطلب المستر: طالب بيبعت شكوى (مثلاً ناسي الباسورد) من جهازه،
// والأدمن لما يحلها ويرد — الطالب أول ما يفتح المنصة من نفس
// الجهاز تظهرله رسالة فيها الحل (زي الباسورد الجديد).
// الجهاز بيتعرف من Device ID عشوائي محفوظ في localStorage —
// الرسالة بتتقري مرة واحدة وبعدين بتتعلم مقروءة.
// ثنائية اللغة من غير useT — بتقرأ مفتاح اللغة من localStorage
// (langKey) عشان نفس الملف يشتغل في كل المنصات.
// ============================================================
import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { BadgeCheck } from 'lucide-react'

var DEVICE_KEY = 'mg-device-id'

/* Device ID عشوائي — بيتعمل مرة واحدة وبيفضل على الجهاز */
function readDeviceId(): string {
  try {
    var v = localStorage.getItem(DEVICE_KEY) || ''
    if (!v) {
      v = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : 'dev-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 14)
      localStorage.setItem(DEVICE_KEY, v)
    }
    return v
  } catch (e) {
    return ''
  }
}

type Msg = { id: string; title: string; body: string; createdAt?: string }

export function DeviceMessages({ langKey = 'mg_lang' }: { langKey?: string }) {
  var [open, setOpen] = useState(false)
  var [messages, setMessages] = useState<Msg[]>([])
  var [ar, setAr] = useState(false)

  useEffect(function () {
    /* لغة الجهاز — افتراضي إنجليزي (المستر بيفتح المنصة EN) */
    try { setAr(localStorage.getItem(langKey) === 'ar') } catch (e) {}
    /* تأخير بسيط عشان المودال ميتضاربش مع تحميل الصفحة */
    var t = setTimeout(async function () {
      try {
        var dev = readDeviceId()
        if (!dev) return
        var res = await fetch('/api/device-messages?deviceId=' + encodeURIComponent(dev))
        var data: any = {}
        try { data = await res.json() } catch (e) {}
        var list = Array.isArray(data && data.messages) ? data.messages : []
        if (list.length > 0) {
          setMessages(list)
          setOpen(true)
        }
      } catch (e) {}
    }, 1200)
    return function () { clearTimeout(t) }
  }, [])

  async function ack() {
    setOpen(false)
    try {
      var dev = readDeviceId()
      if (!dev) return
      await fetch('/api/device-messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: dev, ids: messages.map(function (m) { return m.id }) }),
      })
    } catch (e) {}
  }

  if (messages.length === 0 && !open) return null

  return (
    <Dialog open={open} onOpenChange={function (v) { if (!v) ack() }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-md rounded-2xl" dir={ar ? 'rtl' : 'ltr'}>
        <DialogHeader className="text-center space-y-3">
          <span className="mx-auto h-14 w-14 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <BadgeCheck className="h-8 w-8" />
          </span>
          <DialogTitle className="text-lg font-extrabold leading-snug">
            {ar ? 'تم حل شكوى بتاعتك ✅' : 'Your issue has been resolved ✅'}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {ar
              ? 'المستر رد على الشكوى اللي بعتّها من الجهاز ده — دي الرسالة بتاعتك:'
              : 'The teacher replied to the complaint you sent from this device — here is your message:'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2.5 max-h-[45vh] overflow-y-auto" style={{ scrollbarWidth: 'thin' }}>
          {messages.map(function (m) {
            return (
              <div key={m.id} className="rounded-xl border bg-card p-3.5 space-y-1.5">
                {m.title ? <p className="text-sm font-bold">{m.title}</p> : null}
                {m.body ? <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">{m.body}</p> : null}
              </div>
            )
          })}
        </div>
        <Button onClick={ack} className="w-full h-11 text-sm font-bold">
          {ar ? 'تمام، فهمت' : 'Got it'}
        </Button>
      </DialogContent>
    </Dialog>
  )
}
