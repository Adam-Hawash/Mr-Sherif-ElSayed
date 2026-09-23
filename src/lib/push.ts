// ============================================================
// (2026-و89) push.ts — Web Push لولي الأمر (طلب المستر الحرفي:
//   «الإشعار اللي هيجي لولي الأمر بره مش هيجي على الواتساب — يجي زي
//   برومبت البراوزر، ولما يدوس عليه يخش على الإشعارات اللي جوه المنصة»)
//
//   - مفاتيح VAPID ثابتة تحت (مولدة مرة واحدة — دي هوية السيرفر عند
//     خدمة الـ push بتاعة البراوزر). ✏️ لو عايز تغيّرها: بدّل الزوجين
//     هنا وبس — الاشتراكات القديمة هتفضل شغالة طول ما الزوج متطابق.
//   - الاشتراكات بتتخزن في جدول ParentPushSubscription
//     (كل صف = جهاز لولي أمر — parentId = رقم موبايله مطبّع).
//   - sendParentPush بتتبعت من notifyParentsOfResult لما الطالب
//     يسلّم امتحان/واجب — الإشعار يظهر على شاشة الموبايل بره، وضغطة
//     عليه بتفتح المنصة على شاشة دخول ولي الأمر (sw.js).
//   - أي فشل = لوج بس — التسليم نفسه مابيتأثرش أبدًا.
// ============================================================
import webpush from 'web-push'
import { db } from '@/lib/db'

/* ============================================================
   ✏️✏️ مفاتيح VAPID — مولدة مرة واحدة لمنصة مستر شريف السيد ✏️✏️
   ============================================================ */
var VAPID_PUBLIC_KEY = 'BLO8PJ-WKJGxkqkG6RIhMp3TEBOrTmm-B_EaKKvI9WiCFg_VW7hmpM02VR4V0eSle1tJD4uyVdf90xaCjzsuZ3E'
var VAPID_PRIVATE_KEY = 'LR38I_e2--dIJEz712I7yLkU4IPI46M5h0NlPYxkWs0'
var VAPID_SUBJECT = 'mailto:sherifelsayed@platform.com'

var _vapidReady = false
function ensureVapid(): void {
  if (_vapidReady) return
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
    _vapidReady = true
  } catch (e) {
    console.error('[push] setVapidDetails failed:', e)
  }
}

export function getParentPushPublicKey(): string {
  ensureVapid()
  return VAPID_PUBLIC_KEY
}

/* (و45 نفس الدرس) ضمان وجود الجدول — أول فشل بعمل CREATE TABLE
   IF NOT EXISTS ونعدّي المحاولة — مرة لكل process. الإنتاج (Turso)
   بيتعالج لوحده (وكمان من بصمة ensure-schema v2_w89). */
var _ppsTableReady = false
export async function ensureParentPushTable(force?: boolean): Promise<void> {
  if (_ppsTableReady && !force) return
  try {
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS ParentPushSubscription (id TEXT PRIMARY KEY, parentId TEXT NOT NULL DEFAULT '', endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL DEFAULT '', auth TEXT NOT NULL DEFAULT '', userAgent TEXT NOT NULL DEFAULT '', createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_pps_parent ON ParentPushSubscription(parentId)') } catch (e) {}
    _ppsTableReady = true
  } catch (e) {
    console.error('[push] ensure table failed (ignored):', e)
  }
}

/* حفظ/تحديث اشتراك جهاز — نفس endpoint بيتحدّث مش بيتضاعف */
export async function saveParentPushSubscription(parentId: string, sub: { endpoint: string; p256dh: string; auth: string }, userAgent: string): Promise<boolean> {
  try {
    await ensureParentPushTable()
    var endpoint = String(sub.endpoint || '')
    if (!parentId || !endpoint) return false
    var existing: any = null
    try { existing = await db.parentPushSubscription.findUnique({ where: { endpoint: endpoint } }) } catch (e) {}
    if (existing && existing.id) {
      await db.parentPushSubscription.update({
        where: { endpoint: endpoint },
        data: { parentId: parentId, p256dh: String(sub.p256dh || ''), auth: String(sub.auth || ''), userAgent: String(userAgent || '').slice(0, 250) },
      })
    } else {
      await db.parentPushSubscription.create({
        data: { parentId: parentId, endpoint: endpoint, p256dh: String(sub.p256dh || ''), auth: String(sub.auth || ''), userAgent: String(userAgent || '').slice(0, 250) },
      })
    }
    return true
  } catch (e) {
    /* المحاولة الأولى فشلت — غالبًا الجدول ناقص (نشر جديد): نعمله ونعدّي مرة */
    try {
      await ensureParentPushTable(true)
      await db.parentPushSubscription.create({
        data: { parentId: parentId, endpoint: String(sub.endpoint || ''), p256dh: String(sub.p256dh || ''), auth: String(sub.auth || ''), userAgent: String(userAgent || '').slice(0, 250) },
      })
      return true
    } catch (e2) {
      console.error('[push] save subscription failed (ignored):', e2)
      return false
    }
  }
}

/* حذف اشتراك (إيقاف الإشعارات من جهاز معين) */
export async function deleteParentPushSubscription(endpoint: string): Promise<void> {
  try {
    await ensureParentPushTable()
    await db.parentPushSubscription.deleteMany({ where: { endpoint: String(endpoint || '') } })
  } catch (e) {
    console.error('[push] delete subscription failed (ignored):', e)
  }
}

/* شكل الحمولة اللي بتوصل للـ Service Worker (public/sw.js) */
export interface ParentPushPayload {
  title: string
  body: string
  url?: string
  tag?: string
  icon?: string
}

/* إرسال إشعار لكل أجهزة ولي الأمر — بيرجّع عدد المرسل/الفاشل.
   أي جهاز رد 404/410 (اشتراك ميت) بيتنضف من الجدول تلقائيًا. */
export async function sendParentPush(parentId: string, payload: ParentPushPayload): Promise<{ sent: number; failed: number }> {
  var out = { sent: 0, failed: 0 }
  try {
    if (!parentId) return out
    await ensureParentPushTable()
    var subs: any[] = []
    try { subs = await db.parentPushSubscription.findMany({ where: { parentId: String(parentId) } }) } catch (e) { subs = [] }
    if (!subs || !subs.length) return out
    ensureVapid()
    var body = JSON.stringify(payload || {})
    for (var i = 0; i < subs.length; i++) {
      var s = subs[i]
      if (!s || !s.endpoint) continue
      try {
        await Promise.race([
          webpush.sendNotification(
            { endpoint: String(s.endpoint), keys: { p256dh: String(s.p256dh || ''), auth: String(s.auth || '') } },
            body,
            { TTL: 86400 }
          ),
          new Promise(function (_, rej) { setTimeout(function () { rej(new Error('push timeout')) }, 10000) }),
        ])
        out.sent++
      } catch (err: any) {
        out.failed++
        var status = err && err.statusCode ? Number(err.statusCode) : 0
        if (status === 404 || status === 410) {
          /* اشتراك ميت — الجهاز شال الإذن أو غير المتصفح — ننضفه */
          try { await db.parentPushSubscription.deleteMany({ where: { endpoint: String(s.endpoint) } }) } catch (eDel) {}
        }
        console.error('[push] send failed (ignored): status=' + status + ' ' + String((err && err.message) || err).slice(0, 120))
      }
    }
  } catch (e) {
    console.error('[push] sendParentPush failed (ignored):', e)
  }
  return out
}
