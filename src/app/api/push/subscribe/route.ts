// ============================================================
// (2026-و89) POST /api/push/subscribe — حفظ اشتراك إشعارات جهاز
//   ولي الأمر بعد ما يوافق على بوب-أب «تفعيل الإشعارات».
//   Body: { parentId, subscription: { endpoint, keys: { p256dh, auth } } }
//   - parentId = id حساب ولي الأمر (زي بورتال ولي الأمر) — بنحوّله
//     لرقم موبايله مطبّع (نفس مفتاح parent_id في parent_notifications)
//   - نفس endpoint بيتحدّث مش بيتضاعف (متصفح تاني = صف تاني)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeParentPhone } from '@/lib/parent-notify'
import { saveParentPushSubscription } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    var parentIdRaw = body ? String(body.parentId || '') : ''
    var sub = body && body.subscription ? body.subscription : null
    var endpoint = sub ? String(sub.endpoint || '') : ''
    var p256dh = sub && sub.keys ? String(sub.keys.p256dh || '') : ''
    var auth = sub && sub.keys ? String(sub.keys.auth || '') : ''
    if (!parentIdRaw || !endpoint || !p256dh || !auth) {
      return NextResponse.json({ ok: false, error: 'طلب ناقص' }, { status: 400 })
    }

    /* نطابق رقم ولي الأمر من حسابه — نفس مطابقة الإشعارات الداخلية (و87) */
    var phone = parentIdRaw
    try {
      var parent = await db.parent.findUnique({ where: { id: parentIdRaw } })
      if (parent && parent.phone) phone = String(parent.phone)
    } catch (e) {}
    var normalized = normalizeParentPhone(phone)
    if (!normalized) normalized = parentIdRaw /* احتياط — نحفظ زي ما هو */

    var ua = request.headers.get('user-agent') || ''
    var saved = await saveParentPushSubscription(normalized, { endpoint: endpoint, p256dh: p256dh, auth: auth }, ua)
    if (!saved) return NextResponse.json({ ok: false, error: 'مش قادرين نحفظ الاشتراك' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push] subscribe error:', e)
    return NextResponse.json({ ok: false, error: 'حدث خطأ مؤقت في السيرفر' }, { status: 500 })
  }
}
