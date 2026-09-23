// ============================================================
// (2026-و89) POST /api/push/test — إشعار تجريبي لولي الأمر
//   Body: { parentId } — بيبعت إشعار لكل أجهزته المشتركة عشان
//   يتأكد إن اللينك شغال («جرّب إشعار تجريبي» في بورتال ولي الأمر)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeParentPhone } from '@/lib/parent-notify'
import { sendParentPush } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    var parentIdRaw = body ? String(body.parentId || '') : ''
    if (!parentIdRaw) return NextResponse.json({ ok: false, error: 'طلب ناقص' }, { status: 400 })

    var phone = parentIdRaw
    try {
      var parent = await db.parent.findUnique({ where: { id: parentIdRaw } })
      if (parent && parent.phone) phone = String(parent.phone)
    } catch (e) {}
    var normalized = normalizeParentPhone(phone) || parentIdRaw

    var out = await sendParentPush(normalized, {
      title: '🔔 إشعار تجريبي من منصة مستر شريف السيد',
      body: 'تمام كده! الإشعارات واصلة لموبايلك — من أول ما ابنك يسلّم امتحان أو واجب هتوصلك درجته هنا أول بأول.',
      url: '/#parent-login',
      tag: 'parent-test-' + Date.now(),
      icon: '/push-icon.png',
    })
    return NextResponse.json({ ok: true, sent: out.sent, failed: out.failed, message: out.sent > 0 ? 'اتبعت الإشعار — بص على شاشة موبايلك 📱' : 'مفيش أجهزة مشتركة لسه على الحساب ده' })
  } catch (e) {
    console.error('[push] test error:', e)
    return NextResponse.json({ ok: false, error: 'حدث خطأ مؤقت' }, { status: 500 })
  }
}
