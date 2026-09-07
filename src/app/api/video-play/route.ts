// ============================================================
// /api/video-play — ملغي نهائيًا (410 Gone)
// ============================================================
// الراوت ده كان بيرجّع YouTube ID للصفحة — وده بالظبط النوع من التسريب
// اللي المستر منعه منعًا قاطعًا: "مش عاوز أجيب اللينك بتاع الفيديو خالص".
// التشغيل دلوقتي كله عن طريق نظام التذاكر:
//   /api/video-ticket → تذكرة واحدة الاستخدام
//   /api/player/[ticket] → صفحة المشغل المحمية (الـ ID مشفر على السيرفر)
// ============================================================
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(
    {
      error: 'بوابة التشغيل دي اتقفلت نهائيًا — التشغيل بيتم عن طريق تذكرة آمنة من /api/video-ticket',
      gone: true,
    },
    { status: 410 }
  )
}

export async function POST() {
  return NextResponse.json({ error: 'بوابة التشغيل دي اتقفلت نهائيًا', gone: true }, { status: 410 })
}
