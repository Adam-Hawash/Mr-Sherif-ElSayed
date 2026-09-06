// /api/video-thumb/[id] — بروكسي صور اليوتيوب المصغرة
// الصورة بتتجاب من img.youtube.com على السيرفر — الكلاينك مش بيشوف
// معرف الفيديو في مصدر الصفحة (الصورة بتيجي من الدومين بتاعنا).
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getYouTubeId } from '@/lib/video-guard'

export const revalidate = 86400

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const video = await db.video.findUnique({ where: { id } })
    if (!video) return new NextResponse('Not found', { status: 404 })

    var target = ''
    if (video.thumbnail && /^https?:\/\//.test(video.thumbnail)) {
      target = video.thumbnail
    } else {
      const ytId = getYouTubeId(video.url || '')
      if (!ytId) return new NextResponse('Not found', { status: 404 })
      target = 'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg'
    }

    const upstream = await fetch(target, { cache: 'no-store' })
    if (!upstream.ok) return new NextResponse('Upstream error', { status: 502 })
    const buf = await upstream.arrayBuffer()
    return new NextResponse(buf, {
      status: 200,
      headers: {
        'Content-Type': upstream.headers.get('content-type') || 'image/jpeg',
        'Cache-Control': 'public, max-age=86400',
      },
    })
  } catch {
    return new NextResponse('Error', { status: 500 })
  }
}
