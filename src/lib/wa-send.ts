// ============================================================
// (2026-و88) wa-send — إرسال رسايل خارجية لولي الأمر (واتساب/SMS)
// ============================================================
// طلب المستر: «الإشعار بيظهر لولي الأمر على الموبايل بره — أول ما يضغط
// عليه يفتح التليفون ويدخله على صفحة تسجيل الدخول بتاعت المنصة، وهو
// يسجل دخوله ويشوف الإشعار جوه المنصة — يعني الاتنين».
//
// الملف ده بيبعت **الجزء الخارجي**: نفس قناة الإرسال اللي المستر ظبطها
// في لوحة التحكم (SiteConfig مفتاح 'msg_channel' — نفس قناة رسايل
// الأدمن من و81):
//   • manual / مفيش إعدادات → مفيش إرسال أوتوماتيكي (بنسكته بهدوء)
//   • sms  → Twilio أو أي بوابة SMS عامة (SMSMisr وغيرها)
//   • waapi → WhatsApp Business API (Twilio أو Meta Cloud API)
// أي فشل = لوج في السيرفر بس — **مابيبوّظش** التسليم ولا الإشعار الداخلي.
// ============================================================
import { db } from '@/lib/db'

var KEY = 'msg_channel'

export interface MsgChannelCfg {
  channel?: string
  provider?: string
  apiUrl?: string
  apiKey?: string
  username?: string
  password?: string
  sender?: string
}

export async function readMsgChannel(): Promise<MsgChannelCfg | null> {
  try {
    var row = await db.siteConfig.findUnique({ where: { key: KEY } })
    if (!row || !row.value) return null
    var c = JSON.parse(row.value)
    return c && typeof c === 'object' ? (c as MsgChannelCfg) : null
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

function genericSmsPost(apiUrl: string, cfg: MsgChannelCfg, phone: string, message: string) {
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

function metaWhatsAppPost(apiUrl: string, cfg: MsgChannelCfg, phone: string, message: string) {
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
      text: { preview_url: true, body: message },
    }),
    signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined,
  })
}

/**
 * إرسال رسالة لرقم ولي الأمر عبر القناة المفعّلة — النتيجة بترجع
 * ومح ни حد بيرمي: { sent, mode, error? }
 *   sent=false + mode='manual' → مفيش مزود مفعّل (طبيعي — بنعتمد الإشعار الداخلي)
 */
export async function sendViaChannel(phoneE164: string, message: string): Promise<{ sent: boolean; mode: string; error?: string }> {
  try {
    var cfg = await readMsgChannel()
    if (!cfg || cfg.channel === 'manual' || !cfg.apiUrl) {
      return { sent: false, mode: 'manual' }
    }
    var isTwilio = String(cfg.provider || '').toLowerCase() === 'twilio' || String(cfg.apiUrl).indexOf('twilio.com') !== -1
    var res: Response | null = null

    if (cfg.channel === 'sms') {
      if (isTwilio) {
        res = await twilioStylePost(cfg.apiUrl, cfg.username || cfg.apiKey || '', cfg.password || cfg.apiKey || '', {
          To: '+' + phoneE164,
          From: cfg.sender || '',
          Body: message,
        })
      } else {
        res = await genericSmsPost(cfg.apiUrl, cfg, phoneE164, message)
      }
    } else if (cfg.channel === 'waapi') {
      if (isTwilio) {
        res = await twilioStylePost(cfg.apiUrl, cfg.username || cfg.apiKey || '', cfg.password || cfg.apiKey || '', {
          To: 'whatsapp:+' + phoneE164,
          From: 'whatsapp:' + (cfg.sender || ''),
          Body: message,
        })
      } else {
        res = await metaWhatsAppPost(cfg.apiUrl, cfg, phoneE164, message)
      }
    }

    if (!res) return { sent: false, mode: 'unknown', error: 'قناة غير معروفة' }
    if (res.ok) return { sent: true, mode: cfg.channel || '' }
    var t = ''
    try { t = await res.text() } catch (e) { t = 'HTTP ' + res.status }
    console.error('[wa-send] provider error:', cfg.channel, cfg.provider, res.status, String(t).slice(0, 160).replace(/[A-Za-z0-9_\-=]{16,}/g, '[hidden]'))
    return { sent: false, mode: cfg.channel || '', error: 'HTTP ' + res.status }
  } catch (e: any) {
    console.error('[wa-send] failed (ignored):', String((e && e.message) || e))
    return { sent: false, mode: 'error', error: String((e && e.message) || e).slice(0, 120) }
  }
}
