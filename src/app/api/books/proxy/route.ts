// @ts-nocheck
// ============================================================
// (2026-و44) /api/books/proxy?url=… — بروكسي تحميل PDF من لينك خارجي
// طلب المستر: «الكتاب المضاف باللينك يبقى ثابت في صفحة الاستخراج —
// لو دوست عليه تظهر صفحات الكتاب وأختار الصفحات» — pdf.js في المتصفح
// مش بيوصل للينكات الخارجية (CORS) — فبنمرر التحميل من هنا (same-origin).
//
// (2026-س1) دعم جوجل درايف — طلب المستر: «تقبل ملفات جوجل درايف»:
//   • أي صيغة لينك درايف (/file/d/ID/view، open?id=، uc?id=…) بتتحول
//     أوتوماتيك لرابط التحميل المباشر (drive.usercontent.google.com).
//   • الملفات الكبيرة بترجع صفحة HTML بتأكيد الفحص — بنقرا الفورم
//     اللي فيها ونكمل التحميل أوتوماتيك (hop واحد إضافي كحد أقصى).
//   • لينك المجلد بيرفض برسالة واضحة (مفيهوش ملف واحد محدد).
// ملاحظات أمان: http/https بس + ممنوع localhost/private IPs (SSRF) +
// حجم أقصى 250MB — والاستجابة بتتحول stream زي ما هي.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { resolveDownloadCandidates, isDriveUrl, isDriveFolderUrl, extractDriveFileId } from '@/lib/drive'

var MAX_BYTES = 250 * 1024 * 1024

function isBlockedHost(hostname: string): boolean {
  var h = String(hostname || '').toLowerCase()
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true
  /* 127.x / 10.x / 172.16-31.x / 192.168.x / 169.254.x / ::1 */
  var m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (m) {
    var a = parseInt(m[1], 10)
    var b = parseInt(m[2], 10)
    if (a === 127 || a === 10 || a === 0) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 192 && b === 168) return true
    if (a === 169 && b === 254) return true
  }
  return false
}

/**
 * (2026-س1) جلب ملف درايف: تحويل اللينك → تحميل → لو رجعت صفحة تأكيد HTML
 * (الملفات الكبيرة) بنقرا فورم التأكيد ونكمّل بمتغيراته (uuid/confirm/at).
 * بترجّع الاستجابة النهائية أو رسالة خطأ عربية واضحة.
 */
async function fetchDriveFile(driveUrl: string) {
  var resolved = resolveDownloadCandidates(driveUrl)
  if (!resolved.url) {
    if (isDriveFolderUrl(driveUrl)) {
      return { error: 'ده لينك مجلد في درايف — المنصة محتاجة لينك ملف واحد. افتح المجلد، ادخل على الملف، وانسخ لينكه (مشاركة → نسخ الرابط)' }
    }
    return { error: 'لينك درايف مش مفهوم — افتح الملف في درايف وانسخ لينكه من زرار «مشاركة → نسخ الرابط»' }
  }
  var res = await fetch(resolved.url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (books-proxy)', 'Accept': '*/*' },
    redirect: 'follow',
    cache: 'no-store',
  })
  if (!res.ok) {
    // الملف مش متاح للتحميل العام → رسالة توضح مشاركته
    if (res.status === 403 || res.status === 401) {
      return { error: 'ملف درايف مش متاح للتحميل — افتح الملف في جوجل درايف → مشاركة → «أي شخص لديه الرابط» → عارض (أو أعلى)' }
    }
    return { error: 'مقدرتش أجيب الملف من درايف (' + res.status + ') — اتأكد إن اللينك شغال' }
  }
  var ct = String(res.headers.get('content-type') || '')
  // صفحة تأكيد الفحص (HTML مش الملف نفسه) → نكمّل التحميل بمتغيرات الفورم
  if (ct.indexOf('text/html') !== -1) {
    try {
      var html = await res.text()
      var action = html.match(/action="([^"]+)"/)
      if (action && action[1]) {
        var finalUrl = action[1].replace(/&amp;/g, '&')
        if (finalUrl.charAt(0) === '/') finalUrl = 'https://drive.usercontent.google.com' + finalUrl
        // اجمع كل الحقول المخفية (uuid, confirm, at…)
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
          headers: { 'User-Agent': 'Mozilla/5.0 (books-proxy)', 'Accept': '*/*' },
          redirect: 'follow',
          cache: 'no-store',
        })
        if (res2.ok && String(res2.headers.get('content-type') || '').indexOf('text/html') === -1) return { res: res2 }
      }
    } catch (eConfirm) { /* نكمل لرسالة الخطا العامة */ }
    if (extractDriveFileId(driveUrl)) {
      return { error: 'ملف درايف ده محتاج إذن تحميل — افتح الملف في درايف → مشاركة → «أي شخص لديه الرابط» وجرب تاني' }
    }
    return { error: 'الرابط رجّع صفحة ويب مش ملف — اتأكد إن اللينك بيوصل للملف مباشرة' }
  }
  return { res: res }
}

export async function GET(request: NextRequest) {
  try {
    var url = new URL(request.url).searchParams.get('url') || ''
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ error: 'لينك غير صالح' }, { status: 400 })
    }
    var parsed = new URL(url)
    if (isBlockedHost(parsed.hostname)) {
      return NextResponse.json({ error: 'اللينك غير مسموح' }, { status: 400 })
    }
    /* (2026-س1) مسار درايف المخصص — تحويل أوتوماتيك + صفحة تأكيد */
    if (isDriveUrl(url)) {
      if (isDriveFolderUrl(url)) {
        return NextResponse.json({ error: 'ده لينك مجلد في درايف — محتاجين لينك ملف واحد (افتح الملف → مشاركة → نسخ الرابط)' }, { status: 400 })
      }
      var got = await fetchDriveFile(url)
      if (got.error) {
        return NextResponse.json({ error: got.error }, { status: got.error.indexOf('مش متاح') !== -1 || got.error.indexOf('إذن') !== -1 ? 403 : 502 })
      }
      var r2 = got.res
      var len2 = parseInt(String(r2.headers.get('content-length') || ''), 10)
      if (!isNaN(len2) && len2 > MAX_BYTES) {
        return NextResponse.json({ error: 'الملف أكبر من الحد المسموح (250MB)' }, { status: 413 })
      }
      var hh2 = new Headers()
      hh2.set('Content-Type', r2.headers.get('content-type') || 'application/pdf')
      if (!isNaN(len2)) hh2.set('Content-Length', String(len2))
      hh2.set('Cache-Control', 'no-store')
      return new NextResponse(r2.body, { status: 200, headers: hh2 })
    }

    var upstream = await fetch(parsed.toString(), {
      headers: { 'User-Agent': 'Mozilla/5.0 (books-proxy)' },
      redirect: 'follow',
      cache: 'no-store',
    })
    if (!upstream.ok || !upstream.body) {
      return NextResponse.json({ error: 'مقدرتش أجيب الملف من اللينك (' + upstream.status + ')' }, { status: 502 })
    }
    var len = parseInt(String(upstream.headers.get('content-length') || ''), 10)
    if (!isNaN(len) && len > MAX_BYTES) {
      return NextResponse.json({ error: 'الملف أكبر من الحد المسموح (250MB)' }, { status: 413 })
    }
    var headers = new Headers()
    headers.set('Content-Type', upstream.headers.get('content-type') || 'application/pdf')
    if (!isNaN(len)) headers.set('Content-Length', String(len))
    headers.set('Cache-Control', 'no-store')
    return new NextResponse(upstream.body, { status: 200, headers: headers })
  } catch (e: any) {
    console.error('[books-proxy] error:', e)
    return NextResponse.json({ error: 'فشل تحميل الملف من اللينك' }, { status: 500 })
  }
}
