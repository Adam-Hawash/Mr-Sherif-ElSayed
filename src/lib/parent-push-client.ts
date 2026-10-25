'use client'

// ============================================================
// (2026-و89) parent-push-client — منطق تفعيل إشعارات الموبايل لولي الأمر
//   التدفق (بطلب المستر): بوب-أب ودود بعد الدخول → موافقة → البراوزر
//   بيحفظ الاشتراك (Service Worker + PushManager) → السيرفر بيخزن
//   الجهاز في ParentPushSubscription → لما الطالب يسلّم ورقة الإشعار
//   يظهر على شاشة الموبايل بره → الضغط عليه يفتح شاشة دخول ولي الأمر.
//
// (2026-و90) درس من شكوى المستر: «فضلت أحاول مرتين والتالتة هي اللي
//   ظبطت» — السبب سباقات التهيئة (Service Worker لسه بينزّل أول زيارة /
//   فشل شبكة لحظي في حفظ الاشتراك). الحل:
//   1) انتظار فعلي لجاهزية الـ SW (poll لحد active بمهلة) بدل ثقة عمياء
//   2) إعادة محاولة الاشتراك والحفظ تلقائيًا (3 مرات الاشتراك، 2 للحفظ)
//   3) إعادة محاولة كاملة للتدفق مرة واحدة لو أي خطوة فشلت
//   4) إعادة استخدام الاشتراك الموجود لو مفتاحه مطابق (منع فوضى FCM)
//   5) رسائل خطأ محددة لكل سبب — لو حصل فشل ولي الأمر يعرف يعمل إيه
// ============================================================

/* مفتاح VAPID من الصيغة base64url لصيغة Uint8Array المطلوبة للـ subscribe */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  var rawData = ''
  try {
    rawData = atob(base64)
  } catch (e) {
    return new Uint8Array(0)
  }
  var outputArray = new Uint8Array(rawData.length)
  for (var i = 0; i < rawData.length; i++) outputArray[i] = rawData.charCodeAt(i)
  return outputArray
}

/* حالة إذن الإشعارات في البراوزر */
export type PushPermState = 'granted' | 'denied' | 'default' | 'unsupported'

export function getPushPermissionState(): PushPermState {
  try {
    if (typeof window === 'undefined') return 'unsupported'
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) return 'unsupported'
    var p = Notification.permission
    if (p === 'granted') return 'granted'
    if (p === 'denied') return 'denied'
    return 'default'
  } catch (e) {
    return 'unsupported'
  }
}

/* علم التفعيل المحلي لكل ولي أمر (عشان البوب-أب ما يظهرش تاني بعد التفعيل) */
function flagKey(parentId: string): string {
  return 'parent_push_enabled_' + String(parentId || '')
}

export function isParentPushEnabled(parentId: string): boolean {
  try {
    return String(localStorage.getItem(flagKey(parentId)) || '') === '1'
  } catch (e) {
    return false
  }
}

export function setParentPushFlag(parentId: string, on: boolean): void {
  try {
    if (on) localStorage.setItem(flagKey(parentId), '1')
    else localStorage.removeItem(flagKey(parentId))
  } catch (e) {}
}

function wait(ms: number): Promise<void> {
  return new Promise(function (r) { setTimeout(r, ms) })
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise(function (resolve, reject) {
    var done = false
    var to = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')) } }, ms)
    p.then(function (v) { if (!done) { done = true; clearTimeout(to); resolve(v) } }).catch(function (e) { if (!done) { done = true; clearTimeout(to); reject(e) } })
  })
}

/* مقارنة مفتاح اشتراك موجود مع المفتاح الحالي (base64url) — لو مطابق نعيد استخدامه */
function subscriptionKeyMatches(sub: PushSubscription | null, publicKey: string): boolean {
  try {
    if (!sub || !sub.options || !sub.options.applicationServerKey) return false
    var buf = sub.options.applicationServerKey as BufferSource
    var bytes = new Uint8Array(buf as ArrayBuffer)
    var s = ''
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i])
    var b64 = btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
    return b64 === String(publicKey || '').replace(/=+$/, '')
  } catch (e) {
    return false
  }
}

/* تسجيل الـ SW وانتظار جاهزيته فعلًا (reg.active) — جوهر إصلاح «من أول مرة» */
async function ensureSWReady(): Promise<ServiceWorkerRegistration> {
  var reg = await navigator.serviceWorker.getRegistration('/')
  if (!reg) {
    reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
  } else {
    try { reg.update() } catch (e) {}
  }
  /* انتظار active — poll كل 150ms بمهلة 6 ثواني (أول زيارة بتنزّل الـ SW) */
  var start = Date.now()
  while (!(reg as ServiceWorkerRegistration).active && Date.now() - start < 6000) {
    await wait(150)
  }
  if (!(reg as ServiceWorkerRegistration).active) {
    /* محاولة أخيرة: serviceWorker.ready ثم re-register لو لسه */
    try { await withTimeout(navigator.serviceWorker.ready as unknown as Promise<ServiceWorkerRegistration>, 5000) } catch (e) {}
    if (!(reg as ServiceWorkerRegistration).active) {
      try { reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' }); await wait(400) } catch (e2) {}
    }
  }
  return reg as ServiceWorkerRegistration
}

/**
 * تفعيل الإشعارات كامل: إذن → Service Worker → اشتراك → حفظ عند السيرفر
 * بيرجّع حالة واضحة عشان الواجهة تعرض رسالة مناسبة.
 */
export async function enableParentPush(parentId: string): Promise<{ ok: boolean; reason?: string }> {
  var result = await enableParentPushOnce(parentId)
  /* (و90) إعادة محاولة كاملة تلقائية مرة واحدة — شكاوى «التالتة اللي ظبطت» */
  if (!result.ok && result.reason !== 'denied' && result.reason !== 'dismissed' && result.reason !== 'unsupported') {
    await wait(900)
    result = await enableParentPushOnce(parentId)
  }
  return result
}

async function enableParentPushOnce(parentId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    /* 1) دعم البراوزر */
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' }
    }
    /* 2) إذن النظام — ده برومبت البراوزر نفسه */
    var perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    /* 3) تسجيل الـ Service Worker والانتظار الفعلي لجاهزيته */
    var reg: ServiceWorkerRegistration
    try {
      reg = await ensureSWReady()
    } catch (swErr) {
      console.error('[parent-push] sw registration failed:', swErr)
      return { ok: false, reason: 'sw-failed' }
    }
    if (!reg.active) return { ok: false, reason: 'sw-failed' }
    /* 4) المفتاح العام من السيرفر (محاولتين) */
    var publicKey = ''
    for (var ki = 0; ki < 2 && !publicKey; ki++) {
      try {
        var keyRes = await fetch('/api/push/vapid', { cache: 'no-store' })
        var keyJson = await keyRes.json()
        publicKey = String((keyJson && keyJson.publicKey) || '')
        if (!keyJson.ok) publicKey = ''
      } catch (kErr) {}
      if (!publicKey && ki === 0) await wait(500)
    }
    if (!publicKey) return { ok: false, reason: 'no-key' }
    /* 5) الاشتراك — (و90) إعادة استخدام الاشتراك الموجود لو مفتاحه مطابق،
       وإلا unsubscribe + انتظار قصير + اشتراك جديد مع 3 محاولات */
    var sub: PushSubscription | null = null
    try {
      var existing = await reg.pushManager.getSubscription()
      if (existing && subscriptionKeyMatches(existing, publicKey)) {
        sub = existing
      } else if (existing) {
        try { await existing.unsubscribe() } catch (eUn) {}
        await wait(300)
      }
    } catch (eGet) {}
    if (!sub) {
      var lastErr: any = null
      for (var si = 0; si < 3 && !sub; si++) {
        try {
          sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
          })
        } catch (sErr) {
          lastErr = sErr
          console.error('[parent-push] subscribe attempt ' + (si + 1) + ' failed:', sErr)
          await wait(si === 0 ? 350 : 800)
        }
      }
      if (!sub) return { ok: false, reason: 'subscribe-failed' }
    }
    /* 6) حفظ الاشتراك عند السيرفر على رقم ولي الأمر — محاولتين */
    var saved = false
    for (var sv = 0; sv < 2 && !saved; sv++) {
      try {
        var saveRes = await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          cache: 'no-store',
          body: JSON.stringify({ parentId: parentId, subscription: sub.toJSON() }),
        })
        var saveJson = await saveRes.json()
        if (saveRes.ok && saveJson && saveJson.ok) saved = true
      } catch (svErr) {}
      if (!saved && sv === 0) await wait(700)
    }
    if (!saved) return { ok: false, reason: 'save-failed' }
    setParentPushFlag(parentId, true)
    return { ok: true }
  } catch (e: any) {
    console.error('[parent-push] enable failed:', e)
    return { ok: false, reason: 'error' }
  }
}

/** إيقاف الإشعارات من الجهاز ده (إلغاء الاشتراك عند البراوزر والسيرفر) */
export async function disableParentPush(parentId: string): Promise<boolean> {
  try {
    var reg = await navigator.serviceWorker.getRegistration('/')
    if (reg) {
      var sub = await reg.pushManager.getSubscription()
      if (sub) {
        try { await fetch('/api/push/unsubscribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ endpoint: sub.endpoint }) }) } catch (e) {}
        try { await sub.unsubscribe() } catch (e) {}
      }
    }
    setParentPushFlag(parentId, false)
    return true
  } catch (e) {
    setParentPushFlag(parentId, false)
    return false
  }
}

/** إشعار تجريبي — بيبعت من السيرفر لأجهزة ولي الأمر المشتركة
    (2026-ز32) بيرجّع sent كمان — عشان الواجهة تفرّق بين «اتبعت فعلًا»
    و«مفيش أجهزة متسجلة على الحساب» وتوجّه ولي الأمر للإجراء الصح */
export async function sendTestParentPush(parentId: string): Promise<{ ok: boolean; sent: number; message?: string }> {
  try {
    var res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ parentId: parentId }),
    })
    var json = await res.json()
    var sentN = json && typeof json.sent === 'number' ? json.sent : -1
    return { ok: !!(json && json.ok), sent: sentN, message: String((json && json.message) || '') }
  } catch (e) {
    return { ok: false, sent: -1, message: '' }
  }
}
