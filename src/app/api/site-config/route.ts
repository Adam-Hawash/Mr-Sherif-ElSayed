// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET() {
  try {
    const configs = await db.siteConfig.findMany({ orderBy: { updatedAt: 'desc' } })
    return NextResponse.json(configs)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json()
    const updated = await db.siteConfig.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const { key, value } = await request.json()
    const created = await db.siteConfig.create({ data: { key, value } })
    return NextResponse.json(created)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to create config' }, { status: 500 })
  }
}
