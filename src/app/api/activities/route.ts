import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const studentId = searchParams.get('studentId')
    const action = searchParams.get('action')
    const pageSize = parseInt(searchParams.get('pageSize') || '50')

    const where: Record<string, unknown> = {}
    if (studentId) where.studentId = studentId
    if (action) where.action = action

    const activities = await db.studentActivity.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
      include: { student: { select: { name: true, grade: true, phone: true, status: true } } },
    })

    return NextResponse.json({ activities })
  } catch (error) {
    console.error('Activities fetch error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId, action, details } = body

    if (!studentId || !action) {
      return NextResponse.json({ error: 'studentId and action are required' }, { status: 400 })
    }

    const activity = await db.studentActivity.create({
      data: { studentId, action, details: details || '' },
    })

    return NextResponse.json({ activity }, { status: 201 })
  } catch (error) {
    console.error('Activity create error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
