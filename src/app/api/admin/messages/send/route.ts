// ============================================================
// /api/admin/messages/send — إرسال رسايل من المنصة (و81 — منقول 1:1 من Maths-Genius)
// ============================================================
// سيرفر بس: المفاتيح السرية بتتقري من SiteConfig هنا وعمرك ما
// بتترجع للعميل. الطلب:
//   POST { phone, message, kind?: 'test' }
// سلوك:
//   1) kind='test' → الرقم بيتجبر على موبايل الأدمن (11111111111 → 201111111111)
//   2) القناة manual أو مفيش إعدادات → { mode:'manual', waLink, message }
//      والواجهة بتفتح لينك wa.me زي الإرسال اليدوي بالظبط (الحل المجاني 100%).
//   3) القناة sms:
//      - مزود Twilio (provider=twilio أو اللينك twilio.com) → POST
//        form-urlencoded + Basic auth (username:password) بحقول To/From/Body.
//      - أي بوابة تانية (زي SMSMisr أو Custom) → POST form-urlencoded
//        عام بحقول متوافقة مع أشهر البوابات (username/password/apikey/
//        sender/mobile/message) + هيدر Authorization: Bearer و X-API-Key.
//   4) القناة waapi (WhatsApp Business API):
//      - Twilio → نفس الأسلوب بس بـ To=whatsapp:+... و From=whatsapp:...
//      - Meta Cloud API / أي واتساب API → POST JSON للـ apiUrl الكامل
//        بـ Bearer apiKey وجسم { messaging_product:'whatsapp', to, text:{body} }
// الرد في حالة النجاح: { ok:true, mode:'sms'|'waapi', provider, detail }
// الرد في حالة الفشل: { ok:false, error } (بعد الردّ لوغ في السيرفر من غير مفاتيح)
// ============================================================
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { normalizeWaPhone } from '@/lib/parent-message'

export const dynamic = 'force-dynamic'

var KEY = 'msg_channel'
var ADMIN_PHONE_EGYPT = '201111111111' /* 11111111111 بعد التطبيع */

async function readChannel() {
  try {
    var row = await db.siteConfig.findUnique({ where: { key: KEY } })
    if (!row || !row.value) return null
    var c = JSON.parse(row.value)
    return c && typeof c === 'object' ? c : null
  } catch (e) {
    return null
  }
}

function twilioStylePost(apiUrl: string, username: string, password: string, fields: Record<string, string>) {
  var body = new URLSearchParams(fields).toString()
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Basic ' + Buffer.from(username + ':' + password).toString('base64'),
    },
    body: body,
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
  })
}

function genericSmsPost(apiUrl: string, cfg: any, phone: string, message: string) {
  var body = new URLSearchParams({
    username: cfg.username || '',
    password: cfg.password || '',
    apikey: cfg.apiKey || '',
    api_key: cfg.apiKey || '',
    sender: cfg.sender || '',
    sendername: cfg.sender || '',
    source: cfg.sender || '',
    mobile: phone,
    to: phone,
    msisdn: phone,
    message: message,
    text: message,
    msg: message,
  }).toString()
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: 'Bearer ' + (cfg.apiKey || ''),
      'X-API-Key': cfg.apiKey || '',
    },
    body: body,
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
  })
}

function metaWhatsAppPost(apiUrl: string, cfg: any, phone: string, message: string) {
  return fetch(apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + (cfg.apiKey || ''),
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: phone,
      type: 'text',
      text: { preview_url: false, body: message },
    }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
  })
}

async function readError(res: Response): Promise<string> {
  try {
    var t = await res.text()
    return (t || ('HTTP ' + res.status)).slice(0, 300)
  } catch (e) {
    return 'HTTP ' + res.status
  }
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var message = String((body && body.message) || '').trim()
    var kind = String((body && body.kind) || 'parent')
    if (!message) return NextResponse.json({ ok: false, error: 'الرسالة فاضية' }, { status: 400 })

    /* تجربة الإرسال بتروح لموبايل الأدمن دايمًا — مش لأي رقم من الطلب */
    var phone = kind === 'test' ? ADMIN_PHONE_EGYPT : normalizeWaPhone(String((body && body.phone) || ''))
    if (!phone) return NextResponse.json({ ok: false, error: 'مفيش رقم موبايل صالح' }, { status: 400 })

    var cfg = await readChannel()
    var waLink = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(message)

    /* مفيش مزود مفعّل → الإرسال اليدوي wa.me (الحل المجاني) */
    if (!cfg || cfg.channel === 'manual' || !cfg.apiUrl) {
      return NextResponse.json({ ok: true, mode: 'manual', waLink: waLink, message: message })
    }

    var isTwilio = String(cfg.provider || '').toLowerCase() === 'twilio' || String(cfg.apiUrl).indexOf('twilio.com') !== -1
    var res: Response | null = null

    if (cfg.channel === 'sms') {
      if (isTwilio) {
        res = await twilioStylePost(cfg.apiUrl, cfg.username || cfg.apiKey || '', cfg.password || cfg.apiKey || '', {
          To: '+' + phone,
          From: cfg.sender || '',
          Body: message,
        })
      } else {
        res = await genericSmsPost(cfg.apiUrl, cfg, phone, message)
      }
    } else if (cfg.channel === 'waapi') {
      if (isTwilio) {
        res = await twilioStylePost(cfg.apiUrl, cfg.username || cfg.apiKey || '', cfg.password || cfg.apiKey || '', {
          To: 'whatsapp:+' + phone,
          From: 'whatsapp:' + (cfg.sender || ''),
          Body: message,
        })
      } else {
        res = await metaWhatsAppPost(cfg.apiUrl, cfg, phone, message)
      }
    }

    if (!res) return NextResponse.json({ ok: false, error: 'قناة الإرسال مش معروفة' }, { status: 400 })

    if (res.ok) {
      var detail = await readError(res)
      return NextResponse.json({ ok: true, mode: cfg.channel, provider: cfg.provider || 'custom', detail: detail.slice(0, 160) })
    }
    var err = await readError(res)
    console.error('messages/send provider error:', cfg.channel, cfg.provider, res.status, err.replace(/[A-Za-z0-9_\-=]{16,}/g, '[hidden]'))
    return NextResponse.json({ ok: false, mode: cfg.channel, error: 'المزود رجّع خطأ (HTTP ' + res.status + ') — راجع بيانات الإعدادات', waLink: waLink }, { status: 502 })
  } catch (error: any) {
    console.error('messages/send error:', (error && error.message) || error)
    return NextResponse.json({ ok: false, error: 'فشل الإرسال — ' + (error && error.message ? String(error.message).slice(0, 120) : 'خطأ في السيرفر') }, { status: 500 })
  }
}
