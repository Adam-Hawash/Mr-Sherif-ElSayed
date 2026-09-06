// @ts-nocheck
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    var images = await db.galleryImage.findMany({ orderBy: { sortOrder: 'asc' } })
    return NextResponse.json({ images })
  } catch (error) {
    console.error('Gallery fetch error:', error)
    return NextResponse.json({ error: 'Failed to fetch gallery', detail: error.message, code: error.code }, { status: 500 })
  }
}

export async function POST(request) {
  try {
    var body = await request.json()
    var title = body.title || ''
    var type = body.type || 'image'
    var filePath = body.filePath || ''
    var videoUrl = body.videoUrl || ''

    if (type === 'video') {
      if (!videoUrl) {
        return NextResponse.json({ error: 'رابط الفيديو مطلوب' }, { status: 400 })
      }
    } else {
      if (!filePath && !videoUrl) {
        return NextResponse.json({ error: 'مسار الصورة أو الرابط مطلوب' }, { status: 400 })
      }
    }
       var count = await db.galleryImage.count()
    var image = await db.galleryImage.create({
      data: { title: title, filePath: filePath, type: type, videoUrl: videoUrl, sortOrder: body.sortOrder != null ? parseInt(body.sortOrder) : count },
    })
    return NextResponse.json({ image }, { status: 201 })
  } catch (error) {
    console.error('Gallery create error:', error)
    return NextResponse.json({ error: 'Failed to create gallery item', detail: error.message }, { status: 500 })
  }
}
