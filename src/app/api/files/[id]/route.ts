// @ts-nocheck
// Serve files stored as base64 in Media table

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    var { id } = await params

    var media = await db.media.findUnique({ where: { id } })
    if (!media || !media.data) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 })
    }

    // Decode base64 to buffer
    var binaryStr = atob(media.data)
    var bytes = new Uint8Array(binaryStr.length)
    for (var i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }

    var contentType = media.fileType || 'application/octet-stream'
    var fileName = media.filename || 'download'

    return new NextResponse(bytes, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline; filename="' + fileName + '"',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    })
  } catch (error: any) {
    console.error('File serve error:', error)
    return NextResponse.json({ error: 'File not found' }, { status: 404 })
  }
}
