
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

const SOCIAL_KEYS = ['social_facebook', 'social_whatsapp_channel', 'social_instagram']

export async function GET() {
  try {
    const configs = await db.siteConfig.findMany({
      where: { key: { in: SOCIAL_KEYS } },
    })
    const map: Record<string, string> = {}
    for (const c of configs) {
      map[c.key] = c.value
    }
    return NextResponse.json(map)
  } catch (error) {
    console.error('Social links fetch error:', error)
    return NextResponse.json({})
  }
}

export async function PUT(request: Request) {
  try {
    const body = await request.json()
    for (const [key, value] of Object.entries(body)) {
      if (SOCIAL_KEYS.includes(key)) {
        await db.siteConfig.upsert({
          where: { key },
          update: { value: value as string, updatedAt: new Date() },
          create: { key, value: value as string },
        })
      }
    }
    return NextResponse.json({ message: 'Social links updated' })
  } catch (error) {
    console.error('Social links update error:', error)
    return NextResponse.json({ error: 'Failed to update social links' }, { status: 500 })
  }
}
