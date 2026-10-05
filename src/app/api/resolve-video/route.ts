// ============================================================
// (Z-5) /api/resolve-video — إحضار الملف المباشر من Streamable
// ============================================================
// طلب المستر: «عاوز الفيديو على المشغل بتاعنا من غير الستريميبل».
// لينك ستريمابل صفحة HTML — والمشغل بتاعنا محتاج ملف mp4 مباشر.
// الـ API الرسمي بتاعهم (api.streamable.com/videos/<id>) بيرجع
// files.mp4.url — لينك موقّع (CloudFront) صالح أيام، فمش بنخزنه:
// بنجايبه سيرفر-سايد لحظة الطلب + كاش في الذاكرة ساعة، والمتصفح
// يشغله على <video> بتاعنا من غير أي براندينج ستريمابل.
// أمان: بنجيب الـ id بالـ regex وبنكوّن لينك api.streamable.com
// بإيدينا — مفيش أي fetch لعناوين عشوائية من المستخدم (SSRF مستحيل).
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { streamableId } from '@/lib/intro-video'

/* كاش في الذاكرة: id → { mp4, poster, at } — ساعة واحدة.
   اللينك الموقّع صالح أيام فالساعة أمان كامل، وبتقلل الضرب على
   API ستريمابل (على Vercel كل lambda ليها كاشها وكده برضه كفاية). */
var CACHE_TTL = 60 * 60 * 1000
var resolveCache = new Map() as Map<string, { mp4: string; poster: string; at: number }>

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    var raw = String(searchParams.get('url') || '')
    var id = streamableId(raw)
    if (!id) {
      return NextResponse.json({ ok: false, error: 'لينك ستريمابل غير صالح' }, { status: 400 })
    }

    var hit = resolveCache.get(id)
    if (hit && Date.now() - hit.at < CACHE_TTL) {
      return NextResponse.json({ ok: true, mp4: hit.mp4, poster: hit.poster })
    }

    var res = await fetch('https://api.streamable.com/videos/' + encodeURIComponent(id), {
      cache: 'no-store',
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SherifMathPlatform/1.0)' },
    })
    if (!res.ok) {
      return NextResponse.json({ ok: false, error: 'فشل جلب الفيديو من ستريمابل' }, { status: 502 })
    }
    var data: any = null
    try { data = await res.json() } catch (e) { data = null }
    var mp4 = data && data.files && data.files.mp4 && data.files.mp4.url
    if (!mp4 || typeof mp4 !== 'string') {
      /* 404 مع رسالة واضحة — غالبًا الفيديو لسه بيتجهز على ستريمابل */
      return NextResponse.json(
        { ok: false, error: 'الفيديو لسه بيتجهز على ستريمابل أو مش متاح' },
        { status: 404 }
      )
    }
    var poster = data && typeof data.thumbnail_url === 'string' ? data.thumbnail_url : ''
    resolveCache.set(id, { mp4: mp4, poster: poster, at: Date.now() })
    return NextResponse.json({ ok: true, mp4: mp4, poster: poster })
  } catch (error) {
    console.error('resolve-video error:', error)
    return NextResponse.json({ ok: false, error: 'فشل الاتصال بستريمابل' }, { status: 502 })
  }
}
