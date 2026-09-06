
import { NextResponse } from 'next/server'
import { Resend } from 'resend'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { studentName, studentPhone, studentGrade, parentName, parentPhone } = body

    const resendApiKey = process.env.RESEND_API_KEY
    const adminEmail = process.env.ADMIN_EMAIL || ''

    if (!resendApiKey || !adminEmail) {
      console.log('RESEND_API_KEY or ADMIN_EMAIL not set — skipping admin notification email')
      return NextResponse.json({ message: 'Skipped (no API key or admin email)' })
    }

    const resend = new Resend(resendApiKey)

    const parentInfo = parentName ? `
              <p style="margin: 8px 0;"><strong>اسم ولي الأمر:</strong> ${parentName}</p>
              <p style="margin: 8px 0;"><strong>هاتف ولي الأمر:</strong> ${parentPhone || '—'}</p>` : ''

    await resend.emails.send({
      from: 'منصة مستر شريف السيد <onboarding@resend.dev>',
      to: [adminEmail],
      subject: `طالب جديد مسجّل: ${studentName} — منصة مستر شريف السيد`,
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 500px; margin: 0 auto; padding: 24px;">
          <div style="background: #09090B; border-radius: 12px; padding: 24px; color: #F5F0E3;">
            <h1 style="margin: 0 0 8px 0; color: #F97316;">منصة مستر شريف السيد</h1>
            <p style="color: #8C8577; margin: 0 0 20px 0;">إشعار تسجيل طالب جديد</p>
            <div style="background: #1A1A1F; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
              <p style="margin: 8px 0;"><strong>اسم الطالب:</strong> ${studentName}</p>
              <p style="margin: 8px 0;"><strong>رقم الهاتف:</strong> ${studentPhone}</p>
              <p style="margin: 8px 0;"><strong>الصف:</strong> ${studentGrade}</p>
              ${parentInfo}
            </div>
            <p style="color: #8C8577; font-size: 13px;">يرجى تسجيل الدخول للوحة التحكم لقبول أو رفض هذا الطلب.</p>
          </div>
        </div>
      `,
    })

    return NextResponse.json({ message: 'Admin notified' })
  } catch (error) {
    console.error('Notify admin error:', error)
    return NextResponse.json({ error: 'Failed to notify admin' }, { status: 500 })
  }
}
