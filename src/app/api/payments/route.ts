import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

// POST - Student submits a payment/activation request
/* (ز19 — طلب المستر الحرفي: «لما الطالب يجي يدفع لازم اجباري يحط صورة
   الدفع — وصل الدفع — والصورة تجيلي في صفحة الأدمن وأقدر أكبرها»):
   - صورة الوصل بقت **إجبارية** — أي طلب من غير صورة بيرد 400 برسالة واضحة
   - الصورة بتتخزن في جدول Media (base64) زي باقي صور المنصة وتتسلم
     للأدمن عبر /api/files/<id> — بتتمسح أوتوماتيك مع مسح الدفع (media-cleanup)
   - مرجع العملية فضل نص اختياري زي ما هو (بيتحط في note)
   - FormData بس — الـ JSON القديم اتشال لأن الصورة إجبارية
   - هوية الطالب: برقم تليفونه المسجل في المنصة (زي ما هو) */
export async function POST(request: NextRequest) {
  try {
    var contentType = request.headers.get('content-type') || ''
    if (contentType.indexOf('multipart/form-data') === -1) {
      return NextResponse.json({ error: 'صورة وصل الدفع إجبارية — ابعت الطلب من غير صورة مش هيتقبل' }, { status: 400 })
    }
    var formData = await request.formData()
    var videoId = String(formData.get('videoId') || '')
    var videoTitle = String(formData.get('videoTitle') || '')
    var amount = parseFloat(String(formData.get('amount') || '0')) || 0
    var paymentMethod = String(formData.get('paymentMethod') || formData.get('method') || '')
    var notes = String(formData.get('notes') || formData.get('note') || '')
    var studentId = String(formData.get('studentId') || '')
    var studentName = String(formData.get('studentName') || '')
    var studentPhone = String(formData.get('studentPhone') || '')
    var studentGrade = String(formData.get('studentGrade') || '')

    if (!videoId || !paymentMethod) {
      return NextResponse.json({ error: 'videoId and paymentMethod are required' }, { status: 400 })
    }

    /* (ز19) صورة الوصل — إجبارية */
    var receiptFile: any = formData.get('receipt') || formData.get('file')
    if (!receiptFile || typeof receiptFile === 'string') {
      return NextResponse.json({ error: 'صورة وصل الدفع إجبارية — ارفع سكرين شوت رسالة تأكيد التحويل' }, { status: 400 })
    }
    var mime = String(receiptFile.type || '')
    if (mime.indexOf('image/') !== 0) {
      return NextResponse.json({ error: 'الإيصال لازم يكون صورة (سكرين شوت رسالة تأكيد التحويل)' }, { status: 400 })
    }
    var MAX_RECEIPT_BYTES = 10 * 1024 * 1024
    if (Number(receiptFile.size || 0) > MAX_RECEIPT_BYTES) {
      return NextResponse.json({ error: 'الصورة كبيرة أوي — أقصى حد 10 ميجا' }, { status: 400 })
    }
    var buf = Buffer.from(await receiptFile.arrayBuffer())
    if (!buf.length) {
      return NextResponse.json({ error: 'صورة الوصل فاضية — جرّب تاني' }, { status: 400 })
    }
    var receiptMedia = await db.media.create({
      data: {
        filename: String(receiptFile.name || 'payment-receipt.jpg').slice(0, 120),
        filePath: '',
        fileType: mime,
        fileSize: String(buf.length),
        data: buf.toString('base64'),
        category: 'payment-receipt',
      },
    })
    var receiptPath = '/api/files/' + receiptMedia.id

    /* هوية الطالب — نفس منطق و25 (الرقم المسجل في المنصة) */
    var resolvedStudent: any = null
    if (studentId && studentId.indexOf('temp-') !== 0) {
      try { resolvedStudent = await db.student.findUnique({ where: { id: studentId } }) } catch (e) { resolvedStudent = null }
    }
    if (!resolvedStudent && studentPhone) {
      try { resolvedStudent = await db.student.findUnique({ where: { phone: studentPhone.trim() } }) } catch (e) { resolvedStudent = null }
    }
    if (!resolvedStudent) {
      // ننضف الملف اللي اتخزن لو الطلب فشل — مفيش ملف يتيم
      try { await db.media.delete({ where: { id: receiptMedia.id } }) } catch (e) {}
      return NextResponse.json({ error: 'الرقم ده مش مسجل في المنصة — اعمل حساب الأول أو اتأكد من رقم تليفونك' }, { status: 400 })
    }

    var payment = await db.payment.create({
      data: {
        studentId: resolvedStudent.id,
        studentName: studentName || resolvedStudent.name,
        studentPhone: studentPhone || resolvedStudent.phone,
        studentGrade: studentGrade || resolvedStudent.grade,
        method: paymentMethod,
        amount,
        videoId,
        videoTitle,
        receiptPath,
        receiptType: mime,
        note: notes,
        status: 'pending',
      },
    })

    return NextResponse.json({ message: 'Payment submitted', payment }, { status: 201 })
  } catch (error: any) {
    console.error('Payment submit error:', error)
    return NextResponse.json({ error: 'Server error: ' + (error.message || String(error)) }, { status: 500 })
  }
}

// GET - List payments (admin or student)
export async function GET(request: NextRequest) {
  try {
    var url = new URL(request.url)
    var status = url.searchParams.get('status') || ''
    var studentId = url.searchParams.get('studentId') || ''
    var pageSize = parseInt(url.searchParams.get('pageSize') || '100')

    var where: any = {}
    if (status && status !== 'all') {
      where.status = status
    }
    if (studentId) {
      where.studentId = studentId
    }

    var payments = await db.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: pageSize,
    })

    var counts = await db.payment.groupBy({
      by: ['status'],
      _count: { status: true },
    })

    var countMap: Record<string, number> = {}
    for (var c of counts) {
      countMap[c.status] = c._count.status
    }

    return NextResponse.json({
      payments,
      counts: {
        total: countMap['pending'] + (countMap['approved'] || 0) + (countMap['rejected'] || 0),
        pending: countMap['pending'] || 0,
        approved: countMap['approved'] || 0,
        rejected: countMap['rejected'] || 0,
      },
    })
  } catch (error: any) {
    console.error('Payments list error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
