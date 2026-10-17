// @ts-nocheck
// ============================================================
// (ز18 — طلب المستر): سعر الدرس كله — جزء واحد بيتسدد = الدرس كله بيفتح
// POST { groupKey, grade?, price } → يظبط نفس السعر على كل أجزاء الدرس
// price = 0 → الدرس بيبقى مجاني بالكامل
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupKey = String(body.groupKey || '')
    const grade = String(body.grade || '')
    const price = Math.max(0, Number(body.price) || 0)

    if (!groupKey) {
      return NextResponse.json({ error: 'groupKey required' }, { status: 400 })
    }

    const where: Record<string, string> = { groupKey }
    if (grade) where.grade = grade

    const res = await db.video.updateMany({ where, data: { price } })

    return NextResponse.json({ ok: true, updated: res.count, price })
  } catch (error) {
    console.error('Lesson price error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
