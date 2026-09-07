
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const student = await db.student.findUnique({
      where: { id },
      include: {
        _count: { select: { activities: true } },
        activities: {
          where: { action: 'watched_video' },
          select: { details: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
      },
    })

    if (!student) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    return NextResponse.json({ student })
  } catch (error) {
    console.error('Student detail error:', error)
    return NextResponse.json({ error: 'Failed to fetch student' }, { status: 500 })
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { name, phone, grade, status, isPaidAccess } = body

    const existing = await db.student.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    const updateData: Record<string, any> = {}
    if (name) updateData.name = name
    if (phone) updateData.phone = phone
    if (grade) updateData.grade = grade
    if (status) updateData.status = status
    if (typeof isPaidAccess === 'boolean') updateData.isPaidAccess = isPaidAccess
    // ===== ربط الجهاز: تحكم المستر =====
    // allowAllDevices: سماح لمرة واحدة — أول جهاز يدخل بعدها بيبقى جهاز الحساب
    // والسماح بيتقفل لوحده (شوف منطق الدخول في /api/students)
    if (typeof body.allowAllDevices === 'boolean') updateData.allowAllDevices = body.allowAllDevices
    // resetDevice: فك الربط الكامل — أول جهاز يسجل دخول بعد كده بيبقى هو
    // جهاز إنشاء الحساب الجديد (بيتمسح الربط العادي + ربط الإنشاء الثابت)
    if (body.resetDevice === true) {
      updateData.deviceId = ''
      updateData.deviceFp = ''
      updateData.creationDeviceId = ''
      updateData.creationDeviceFp = ''
    }
    // bindDevice: ربط الحساب بجهاز الطالب الحالي (لو المستر عايز يرجّع الربط يدوي)
    // **مهم**: الدخول بيفحص أعمدة الإنشاء الثابتة الأول — فالربط اليدوي لازم
    // يتكتب هناك كمان وإلا الجهاز المربوط يدويًا هيفضل مرفوض 403!
    if (typeof body.bindDevice === 'string' && body.bindDevice) {
      updateData.deviceId = body.bindDevice
      updateData.creationDeviceId = body.bindDevice
    }

    const student = await db.student.update({
      where: { id },
      data: updateData,
    })

    // Record status change activity
    if (status && status !== existing.status) {
      await db.studentActivity.create({
        data: { studentId: id, action: 'status_changed_to_' + status, details: 'Status changed from ' + existing.status + ' to ' + status },
      })
    }

    return NextResponse.json({ message: 'Student updated', student })
  } catch (error) {
    console.error('Student update error:', error)
    return NextResponse.json({ error: 'Failed to update student' }, { status: 500 })
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const existing = await db.student.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 })
    }

    await db.student.delete({ where: { id } })

    return NextResponse.json({ message: 'Student deleted' })
  } catch (error) {
    console.error('Student delete error:', error)
    return NextResponse.json({ error: 'Failed to delete student' }, { status: 500 })
  }
}
