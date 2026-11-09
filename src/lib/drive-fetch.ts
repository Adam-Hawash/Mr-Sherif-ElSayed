// ============================================================
// (2026-س1) DRIVE-FETCH — تحميل ملف من لينك (مع دعم جوجل درايف) — سيرفر بس
// ============================================================
// بيتخدم في /api/ai-extract (أسئلة + إجابات بلينك) — أي صيغة لينك درايف
// بتتحول أوتوماتيك لتحميل مباشر، وصفحة تأكيد الفحص للملفات الكبيرة
// بتتعالج أوتوماتيك. بيرجّع Buffer + mimeType جاهزين للـ inlineData.
// ============================================================
import { isDriveUrl, isDriveFolderUrl, resolveDownloadCandidates } from '@/lib/drive'

export async function fetchRemoteFile(url: string): Promise<{
  ok: boolean
  buffer?: Buffer
  mime?: string
  error?: string
  status?: number
}> {
  var u = String(url || '').trim()
  if (!u) return { ok: false, error: 'no url' }

  var target = u
  if (isDriveUrl(u)) {
    var resolved = resolveDownloadCandidates(u)
    if (!resolved.url) {
      if (isDriveFolderUrl(u)) {
        return { ok: false, error: 'ده لينك مجلد في درايف — لازم لينك ملف واحد (افتح الملف → مشاركة → نسخ الرابط)' }
      }
      return { ok: false, error: 'لينك درايف مش مفهوم — انسخ لينك الملف من «مشاركة → نسخ الرابط»' }
    }
    target = resolved.url
  }

  var res = await fetch(target, {
    headers: { 'User-Agent': 'Mozilla/5.0 (platform-file-fetch)', 'Accept': '*/*' },
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) {
    if (isDriveUrl(u) && (res.status === 403 || res.status === 401)) {
      return { ok: false, error: 'ملف درايف مش متاح للتحميل — افتحه في درايف → مشاركة → «أي شخص لديه الرابط» → عارض', status: res.status }
    }
    return { ok: false, error: 'مقدرتش أجيب الملف من الرابط (' + res.status + ')', status: res.status }
  }

  var ct = String(res.headers.get('content-type') || '')
  var ab = await res.arrayBuffer()
  var buf = Buffer.from(new Uint8Array(ab))

  // درايف: صفحة تأكيد الفحص (HTML) للملفات الكبيرة → نكمّل بمتغيرات الفورم
  if (isDriveUrl(u) && ct.indexOf('text/html') !== -1) {
    try {
      var html = buf.toString('utf8')
      var action = html.match(/action="([^"]+)"/)
      if (action && action[1]) {
        var finalUrl = action[1].replace(/&amp;/g, '&')
        if (finalUrl.charAt(0) === '/') finalUrl = 'https://drive.usercontent.google.com' + finalUrl
        var extra: string[] = []
        var inputs = html.match(/<input[^>]*>/g) || []
        for (var i = 0; i < inputs.length; i++) {
          var nm = inputs[i].match(/name="([^"]+)"/)
          var vl = inputs[i].match(/value="([^"]*)"/)
          if (nm && nm[1] && vl && typeof vl[1] === 'string') {
            extra.push(encodeURIComponent(nm[1]) + '=' + encodeURIComponent(vl[1].replace(/&amp;/g, '&')))
          }
        }
        var sep = finalUrl.indexOf('?') !== -1 ? '&' : '?'
        if (extra.length > 0) finalUrl = finalUrl + sep + extra.join('&')
        var res2 = await fetch(finalUrl, {
          headers: { 'User-Agent': 'Mozilla/5.0 (platform-file-fetch)', 'Accept': '*/*' },
          redirect: 'follow',
          cache: 'no-store',
        })
        if (res2.ok && String(res2.headers.get('content-type') || '').indexOf('text/html') === -1) {
          var ab2 = await res2.arrayBuffer()
          return { ok: true, buffer: Buffer.from(new Uint8Array(ab2)), mime: String(res2.headers.get('content-type') || 'application/pdf') }
        }
      }
    } catch (eC) { /* نكمل */ }
    return { ok: false, error: 'ملف درايف ده محتاج إذن تحميل — افتحه → مشاركة → «أي شخص لديه الرابط» وجرب تاني' }
  }

  if (!ct || ct.indexOf('text/html') !== -1) {
    // ممكن سيرفر بيرجّع HTML غلط مع ملف صحيح — نحاول نكتشف PDF من البايتات
    var head = buf.subarray(0, 5).toString('latin1')
    if (head === '%PDF-') ct = 'application/pdf'
  }
  return { ok: true, buffer: buf, mime: ct || 'application/pdf' }
}
