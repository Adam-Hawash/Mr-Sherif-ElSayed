// @ts-nocheck
// ============================================================
// FILE: src/app/api/mindmap/route.ts
// PURPOSE: (2026-و66) قراءة الخرائط الذهنية للطلاب (عام):
//   GET            → قايمة مختصرة [{id, videoId, title, sourceName}]
//   GET ?id=       → خريطة كاملة (data JSON)
//   GET ?videoId=  → خرائط درس معين
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await ensureArenaTables()
    var url = new URL(request.url)
    var id = String(url.searchParams.get('id') || '')
    var videoId = String(url.searchParams.get('videoId') || '')

    if (id) {
      var rows = await db.$queryRawUnsafe('SELECT * FROM MindMap WHERE id = ? LIMIT 1', id)
      if (!rows || rows.length === 0) {
        return NextResponse.json({ ok: false, error: 'الخريطة مش موجودة' }, { status: 404 })
      }
      var m = rows[0]
      var data: any = {}
      try { data = JSON.parse(String(m.data || '{}')) } catch (e) {}
      return NextResponse.json({
        ok: true,
        map: {
          id: m.id,
          videoId: String(m.videoId || ''),
          title: String(m.title || ''),
          sourceType: String(m.sourceType || ''),
          sourceUrl: String(m.sourceUrl || ''),
          sourceName: String(m.sourceName || ''),
          data: data,
        },
      })
    }

    var list: any[] = []
    var rows2: any[] = []
    if (videoId) {
      rows2 = await db.$queryRawUnsafe('SELECT id, videoId, title, sourceName, createdAt FROM MindMap WHERE videoId = ? ORDER BY createdAt DESC', videoId)
    } else {
      rows2 = await db.$queryRawUnsafe('SELECT id, videoId, title, sourceName, createdAt FROM MindMap ORDER BY createdAt DESC LIMIT 100')
    }
    for (var i = 0; i < (rows2 || []).length; i++) {
      list.push({
        id: rows2[i].id,
        videoId: String(rows2[i].videoId || ''),
        title: String(rows2[i].title || ''),
        sourceName: String(rows2[i].sourceName || ''),
        createdAt: String(rows2[i].createdAt || ''),
      })
    }
    return NextResponse.json({ ok: true, maps: list })
  } catch (e: any) {
    console.error('[mindmap GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تحميل الخرائط' }, { status: 500 })
  }
}
