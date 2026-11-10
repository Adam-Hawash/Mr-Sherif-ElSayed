// ============================================================
// (Z-40e) DRIVE-URL — تحويل لينكات جوجل درايف لتحميل مباشر حقيقي
// ============================================================
// المشكلة الحقيقية اللي المستر وصفها («بيقول لي ما بيعرفش يقرأه»):
// لينك الدرايف العادي (…/file/d/<id>/view) بيحمّل **صفحة عارض HTML**
// مش الملف نفسه — فالـ AI والـ pdf.js ياخدوا HTML ويقولوا «مش قادر أقرأ».
// حتى لينكات uc?export=download بترجّع صفحة تأكيد HTML للملفات الكبيرة.
//
// الحل: نستخرج الـ ID ونجرّب نقاط التحميل المباشرة بالترتيب:
//   1) drive.usercontent.google.com/download?…&confirm=t  (الأحدث والأضمن)
//   2) drive.google.com/uc?export=download&confirm=t&id=… (الكلاسيكي + confirm)
//   3) اللينك الأصلي زي ما هو (للينكات غير درايف)
// والمستدعي بيفحص content-type: لو HTML → يجرب التالي.
// ============================================================

export function extractDriveFileId(raw: string): string | null {
  var url = String(raw || '').trim()
  if (!url) return null
  var m = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/)
       || url.match(/drive\.google\.com\/open\?id=([\w-]+)/)
       || url.match(/drive\.google\.com\/uc\?(?:[^#]*&)?id=([\w-]+)/)
       || url.match(/drive\.usercontent\.google\.com\/download\?(?:[^#]*&)?id=([\w-]+)/)
       || url.match(/docs\.google\.com\/(?:document|presentation|spreadsheets|drawings)\/d\/([\w-]+)/)
  return (m && m[1]) ? m[1] : null
}

/* مرشحين التحميل المباشر بالترتيب — للينكات غير الدرايف بيرجّع اللينك الأصلي بس */
export function directDownloadCandidates(raw: string): string[] {
  var url = String(raw || '').trim()
  if (!/^https?:\/\//i.test(url)) return []
  /* Google Docs/Sheets/Slides → تصدير PDF مباشر */
  var md = url.match(/docs\.google\.com\/document\/d\/([\w-]+)/)
  if (md && md[1]) return ['https://docs.google.com/document/d/' + md[1] + '/export?format=pdf']
  var mp = url.match(/docs\.google\.com\/presentation\/d\/([\w-]+)/)
  if (mp && mp[1]) return ['https://docs.google.com/presentation/d/' + mp[1] + '/export/pdf']
  var ms = url.match(/docs\.google\.com\/spreadsheets\/d\/([\w-]+)/)
  if (ms && ms[1]) return ['https://docs.google.com/spreadsheets/d/' + ms[1] + '/export?format=pdf']
  var id = extractDriveFileId(url)
  if (!id) return [url]
  return [
    'https://drive.usercontent.google.com/download?id=' + id + '&export=download&confirm=t',
    'https://drive.google.com/uc?export=download&confirm=t&id=' + id,
    url,
  ]
}

/* هل الـ content-type ده صفحة HTML (يعني فشل التحميل المباشر)؟ */
export function isHtmlContentType(ct: string): boolean {
  var s = String(ct || '').toLowerCase()
  return s.indexOf('text/html') !== -1 || s.indexOf('application/xhtml') !== -1
}

/* (Z-41) فكّ صفحة تأكيد جوجل للملفات الكبيرة (virus-scan interstitial):
   لينكات درايف للملفات الكبيرة (>~25MB) بترجّع صفحة HTML فيها فورم hidden
   (id/export/confirm/uuid) — من غير الـ uuid التحميل بيفضل HTML للأبد.
   بنستخرج الـ uuid من الـ HTML ونبني لينك التحميل الحقيقي النهائي.
   لو مفيش uuid (صفحة تسجيل دخول = الملف مش متشارك «أي شخص لديه الرابط»)
   بنرجّع null والمستدعي يعرض رسالة «اتأكد من المشاركة». */
export function buildConfirmedDriveUrl(html: string, fileId: string): string | null {
  var h = String(html || '')
  if (!h) return null
  var mUuid = h.match(/name="uuid"\s+value="([^"]+)"/i)
        || h.match(/name='uuid'\s+value='([^']+)'/i)
        || h.match(/name="uuid"\s+value='([^']+)'/i)
        || h.match(/name='uuid'\s+value="([^"]+)"/i)
  if (!mUuid || !mUuid[1]) return null
  /* قيم الفورم ممكن تكون HTML-encoded (&amp;) — نفكّها */
  var uuid = String(mUuid[1]).replace(/&amp;/g, '&').replace(/&#38;/g, '&').trim()
  if (!uuid) return null
  return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(String(fileId || ''))
    + '&export=download&confirm=t&uuid=' + encodeURIComponent(uuid)
}
