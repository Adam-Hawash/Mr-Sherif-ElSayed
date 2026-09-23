// ============================================================
// (2026-و89) GET /api/push/vapid — المفتاح العام لتفعيل إشعارات
//   ولي الأمر في المتصفح (PushPermissionBanner بيقرأه قبل الاشتراك)
// ============================================================
import { NextResponse } from 'next/server'
import { getParentPushPublicKey } from '@/lib/push'

export async function GET() {
  try {
    var key = getParentPushPublicKey()
    if (!key) return NextResponse.json({ ok: false, error: 'push keys missing' }, { status: 500 })
    return NextResponse.json({ ok: true, publicKey: key })
  } catch (e) {
    return NextResponse.json({ ok: false, error: 'حدث خطأ مؤقت' }, { status: 500 })
  }
}
