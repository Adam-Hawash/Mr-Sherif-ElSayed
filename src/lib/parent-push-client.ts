'use client'

// ============================================================
// (2026-و89) parent-push-client — منطق تفعيل إشعارات الموبايل لولي الأمر
//   التدفق (بطلب المستر): بوب-أب ودود بعد الدخول → موافقة → البراوزر
//   بيحفظ الاشتراك (Service Worker + PushManager) → السيرفر بيخزن
//   الجهاز في ParentPushSubscription → لما الطالب يسلّم ورقة الإشعار
//   يظهر على شاشة الموبايل بره → الضغط عليه يفتح شاشة دخول ولي الأمر.
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

/* إلغاء أي اشتراك قديم قبل اشتراك جديد (نضارة المفاتيح) */
async function dropExistingSubscription(): Promise<void> {
  try {
    var reg = await navigator.serviceWorker.getRegistration('/')
    if (!reg) return
    var old = await reg.pushManager.getSubscription()
    if (old) { try { await old.unsubscribe() } catch (e) {} }
  } catch (e) {}
}

/**
 * تفعيل الإشعارات كامل: إذن → Service Worker → اشتراك → حفظ عند السيرفر
 * بيرجّع حالة واضحة عشان الواجهة تعرض رسالة مناسبة.
 */
export async function enableParentPush(parentId: string): Promise<{ ok: boolean; reason?: string }> {
  try {
    /* 1) دعم البراوزر */
    if (!('Notification' in window) || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      return { ok: false, reason: 'unsupported' }
    }
    /* 2) إذن النظام — ده برومبت البراوزر نفسه */
    var perm = await Notification.requestPermission()
    if (perm !== 'granted') return { ok: false, reason: perm === 'denied' ? 'denied' : 'dismissed' }
    /* 3) تسجيل الـ Service Worker والانتظار لحد الجاهزية */
    var reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    await navigator.serviceWorker.ready
    /* 4) المفتاح العام من السيرفر */
    var keyRes = await fetch('/api/push/vapid', { cache: 'no-store' })
    var keyJson = await keyRes.json()
    var publicKey = String((keyJson && keyJson.publicKey) || '')
    if (!keyJson.ok || !publicKey) return { ok: false, reason: 'no-key' }
    /* 5) الاشتراك (لو موجود من قبل نستخدمه) */
    await dropExistingSubscription()
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
    })
    if (!sub) return { ok: false, reason: 'subscribe-failed' }
    /* 6) حفظ الاشتراك عند السيرفر على رقم ولي الأمر */
    var saveRes = await fetch('/api/push/subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ parentId: parentId, subscription: sub.toJSON() }),
    })
    var saveJson = await saveRes.json()
    if (!saveRes.ok || !saveJson.ok) return { ok: false, reason: 'save-failed' }
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

/** إشعار تجريبي — بيبعت من السيرفر لأجهزة ولي الأمر المشتركة */
export async function sendTestParentPush(parentId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    var res = await fetch('/api/push/test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
      body: JSON.stringify({ parentId: parentId }),
    })
    var json = await res.json()
    return { ok: !!(json && json.ok), message: String((json && json.message) || '') }
  } catch (e) {
    return { ok: false, message: '' }
  }
}
