// ============================================================
// /api/video-ticket — بوابة التشغيل الآمنة (Play Ticket)
// ============================================================
// الفكرة: بدل ما السيرفر يرجّع YouTube ID أو رابط ملف للطالب (وده
// بيسرب اللينك في الـ Network/الـ DOM)، الطالب بياخد "تذكرة" عشوائية
// واحدة الاستخدام صالحة لدقايق. مشغّل الصفحة /api/player/[ticket] هو
// الوحيد اللي بيستخدمها على السيرفر عشان يجيب الفيديو الحقيقي ويحطه
// في صفحة مشغل محمية — فمعرف اليوتيوب عمره ما بيظهر عند الطالب:
// لا في الـ DOM، لا في الـ Console، ولا في أي JSON عام.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { db } from '@/lib/db'
import { computePlayback, isAdmin, ensurePlayTicketTable } from '@/lib/video-guard'

export const dynamic = 'force-dynamic'

const TICKET_TTL_MS = 120 * 1000 // دقيقتين — كفاية لفتح المشغل

// إنشاء تذكرة مع self-heal: لو جدول التذاكر ناقص/اتمسح والموقع شغال
// (تبديل داتابيز مثلًا) بنعمل الجدول بقوة وبنجرب مرة كمان قبل ما نفشل
async function createTicketSafe(videoId: string, studentId: string): Promise<string> {
  const ticket = crypto.randomBytes(24).toString('hex')
  try {
    await db.playTicket.create({
      data: { id: ticket, videoId, studentId, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
    })
  } catch (createErr: any) {
    const msg = String(createErr && (createErr.message || createErr))
    const isMissingTable = msg.indexOf('does not exist') !== -1 || msg.indexOf('no such table') !== -1
    if (!isMissingTable) throw createErr
    await ensurePlayTicketTable(true)
    await db.playTicket.create({
      data: { id: ticket, videoId, studentId, expiresAt: new Date(Date.now() + TICKET_TTL_MS) },
    })
  }
  return ticket
}

export async function GET(request: NextRequest) {
  try {
    // self-heal: لو جدول التذاكر ناقص في الداتابيز بنعمله هنا فورًا
    await ensurePlayTicketTable()
    const { searchParams } = new URL(request.url)
    const videoId = searchParams.get('videoId') || ''
    const galleryId = searchParams.get('galleryId') || ''
    const studentId = searchParams.get('studentId') || ''
    const adminId = searchParams.get('adminId') || ''

    // فيديوهات المعرض (المحتوى الترويجي على صفحة الهبوط) — تذاكر بنفس النظام
    // البادئة gal_ بتفرّق بينها وبين فيديوهات الكورسات جوه صفحة المشغل
    if (galleryId) {
      try {
        const g = await db.galleryImage.findUnique({ where: { id: galleryId } })
        if (!g || !(g as any).videoUrl) return NextResponse.json({ error: 'الفيديو غير موجود' }, { status: 404 })
      } catch (e) {
        return NextResponse.json({ error: 'الفيديو غير موجود' }, { status: 404 })
      }
      try {
        await db.playTicket.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } })
      } catch {}
      const galTicket = await createTicketSafe('gal_' + galleryId, '')
      return NextResponse.json({ ok: true, ticket: galTicket })
    }

    if (!videoId) return NextResponse.json({ error: 'videoId مطلوب' }, { status: 400 })

    // self-heal: لو جدول التذاكر ناقص في الداتابيز بنعمله هنا فورًا
    await ensurePlayTicketTable()

    // الأدمن يقدر يعمل معاينة — بس برضه عن طريق التذكرة (نفس المسار الآمن)
    let authorized = false
    if (adminId && (await isAdmin(adminId))) {
      authorized = true
    } else {
      const result = await computePlayback(videoId, studentId || null)
      if (result.ok) authorized = true
      else return NextResponse.json({ error: result.reason }, { status: result.code })
    }
    if (!authorized) return NextResponse.json({ error: 'غير مسموح' }, { status: 401 })

    // تنظيف التذاكر القديمة (فرصة — نسيب الداتابيز نضيفة)
    try {
      await db.playTicket.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 10 * 60 * 1000) } } })
    } catch {}

    const ticket = await createTicketSafe(videoId, studentId || '')

    // مفيش أي معلومة عن الفيديو نفسه — التذكرة بس
    return NextResponse.json({ ok: true, ticket })
  } catch (error: any) {
    console.error('video-ticket error:', error)
    return NextResponse.json({ error: 'خطأ في السيرفر' }, { status: 500 })
  }
}
