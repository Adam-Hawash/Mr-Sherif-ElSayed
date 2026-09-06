import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

// PUT /api/payments/[id] - Approve or reject a payment (admin)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var id = (await params).id

  try {
    var body = await request.json()
    var status = body.status || ''
    var adminNotes = body.adminNotes || ''
    var adminId = body.adminId || 'admin'

    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status. Use approved or rejected' }, { status: 400 })
    }

    var payment = await db.payment.findUnique({ where: { id } })
    if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })

    if (payment.status !== 'pending') {
      return NextResponse.json({ error: 'تم مراجعة هذا الدفع بالفعل' }, { status: 400 })
    }

    var updated = await db.payment.update({
      where: { id },
      data: {
        status: status,
        reviewedAt: new Date(),
        reviewedBy: adminId,
        note: adminNotes ? (payment.note ? payment.note + ' | رفض: ' + adminNotes : adminNotes) : payment.note,
      },
    })

    if (status === 'approved' && payment.videoId) {
      try {
        await db.videoAccess.upsert({
          where: {
            videoId_studentId: {
              videoId: payment.videoId,
              studentId: payment.studentId,
            },
          },
          create: {
            videoId: payment.videoId,
            studentId: payment.studentId,
            grantedBy: adminId,
          },
          update: {},
        })
      } catch (err) {
        console.error('Error granting video access:', err)
      }

      try {
        await db.studentActivity.create({
          data: {
            studentId: payment.studentId,
            action: 'payment_approved',
            details: 'تم قبول الدفع (' + payment.amount + ' جنيه) - تم فتح الفيديو: ' + payment.videoTitle,
          },
        })
      } catch (e) { /* silent */ }
    }

    if (status === 'rejected') {
      try {
        await db.studentActivity.create({
          data: {
            studentId: payment.studentId,
            action: 'payment_rejected',
            details: 'تم رفض الدفع (' + payment.amount + ' جنيه) عن طريق ' + payment.method,
          },
        })
      } catch (e) { /* silent */ }
    }

    return NextResponse.json({ payment: updated })
  } catch (error) {
    console.error('Payment update error:', error)
    return NextResponse.json({ error: 'Failed to update payment' }, { status: 500 })
  }
}

// DELETE /api/payments/[id] - Delete a payment
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  var id = (await params).id

  try {
    await db.payment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Payment delete error:', error)
    return NextResponse.json({ error: 'Failed to delete payment' }, { status: 500 })
  }
}
