// ============================================================
// (2026-و89) POST /api/push/unsubscribe — إيقاف إشعارات جهاز ولي الأمر
//   Body: { endpoint } — بيتمسح من الجدول (والبراوزر بيلغي اشتراكه كمان)
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { deleteParentPushSubscription } from '@/lib/push'

export async function POST(request: NextRequest) {
  try {
    var body: any = null
    try { body = await request.json() } catch (e) { body = null }
    var endpoint = body ? String(body.endpoint || '') : ''
    if (!endpoint) return NextResponse.json({ ok: false, error: 'طلب ناقص' }, { status: 400 })
    await deleteParentPushSubscription(endpoint)
    return NextResponse.json({ ok: true })
  } catch (e) {
    console.error('[push] unsubscribe error:', e)
    return NextResponse.json({ ok: false, error: 'حدث خطأ مؤقت' }, { status: 500 })
  }
}
