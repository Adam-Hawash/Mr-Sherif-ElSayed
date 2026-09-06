
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { studentId } = body

    if (!studentId) {
      return NextResponse.json({ error: 'studentId required' }, { status: 400 })
    }

    const student = await db.student.update({
      where: { id: studentId },
      data: {
        loginCount: { increment: 1 },
        lastLogin: new Date(),
      },
    })

    await db.studentActivity.create({
      data: { studentId, action: 'login', details: `Login #${student.loginCount}` },
    })

    return NextResponse.json({ message: 'Login tracked', student })
  } catch (error) {
    console.error('Track login error:', error)
    return NextResponse.json({ error: 'Failed to track login' }, { status: 500 })
  }
}
