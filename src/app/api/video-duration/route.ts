// ============================================================
// /api/video-duration — تخزين مدة الفيديو (بادج ⏱ على الكروت)
// ============================================================
// (2026-د — طلب المستر: "اكتب لي وقت الفيديو عشان الناس تعرف الفيديو قد إيه")
// المشغل (يوتيوب أو ملف) بيقرأ المدة أول ما الفيديو يفتح ويبعتها هنا مرة
// واحدة → بتتخزن في عمود durationSec على جدول Video → قايمة /api/videos
// بترجعها لكل الطالب → كل كارت فيديو بيعرض بادج المدة ⏱.
// القيم المنطقية بس (5 ثواني..10 ساعات) — وأكبر تقرير هو اللي بيفوز
// (updateMany بشرط lt) عشان القراءات المتفاوتة ما تنقصش المدة المخزنة.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureVideoTable } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    await ensureVideoTable()
    const body = await request.json().catch(function () { return null as any })
    const videoId = String((body && body.videoId) || '').trim()
    const durationSec = Math.round(Number((body && body.durationSec) || 0))
    if (!videoId || !isFinite(durationSec) || durationSec < 5 || durationSec > 36000) {
      return NextResponse.json({ ok: false, error: 'بيانات ناقصة أو مدة غير منطقية' }, { status: 400 })
    }
    const r = await db.video.updateMany({
      where: { id: videoId, durationSec: { lt: durationSec } },
      data: { durationSec: durationSec },
    })
    return NextResponse.json({ ok: true, updated: r.count })
  } catch (e) {
    console.error('video-duration POST error:', e)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
