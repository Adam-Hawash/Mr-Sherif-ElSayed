// @ts-nocheck
// Upload files to Media table (base64) - no external services needed

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const maxDuration = 60

export async function POST(req: NextRequest) {
  try {
    var formData = await req.formData()
    var file = formData.get('file') as File | null
    var uploadId = (formData.get('uploadId') as string) || ''
    var fileName = (formData.get('fileName') as string) || 'file'
    var category = (formData.get('category') as string) || 'general'

    if (!file) {
      return NextResponse.json({ error: 'مفيش ملف' }, { status: 400 })
    }

    var arrayBuffer = await file.arrayBuffer()
    var buffer = Buffer.from(arrayBuffer)

    // Convert to base64
    var base64 = buffer.toString('base64')

    var safeName = fileName.replace(/[^a-zA-Z0-9._\-\u0600-\u06FF]/g, '_')
    var filePath = category + '/' + Date.now() + '_' + safeName

    var media = await db.media.create({
      data: {
        filename: fileName,
        filePath: filePath,
        fileType: file.type || 'application/octet-stream',
        fileSize: String(buffer.length),
        data: base64,
        category: category,
      },
    })

    return NextResponse.json({
      filePath: '/api/files/' + media.id,
      fileType: file.type || 'application/octet-stream',
      filename: fileName,
      size: buffer.length,
      done: true,
    })
  } catch (err: any) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: err.message || 'حصلت مشكلة في الرفع' }, { status: 500 })
  }
}
