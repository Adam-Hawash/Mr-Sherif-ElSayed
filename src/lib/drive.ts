// ============================================================
// (2026-س1) DRIVE — دعم ملفات جوجل درايف في كل المنصة
// ============================================================
// طلب المستر: «عاوز المنصة تقبل ملفات جوجل درايف وتعرضها» —
// المساعد ده بيتخدم في كل حتة فيها رابط ملف:
//   • تاب الكتب والملازم (أدمن + طالب) — لينك درايف بيتعرض داخليًا
//   • الواجبات والامتحانات — نموذج الأسئلة/الإجابة بلينك درايف
//   • استخراج الأسئلة بالـ AI — تحميل ملف من درايف عن طريق البروكسي
//
// لينكات درايف المقبولة (كل الصيغ الشائعة):
//   https://drive.google.com/file/d/<ID>/view?usp=sharing
//   https://drive.google.com/open?id=<ID>
//   https://drive.google.com/uc?id=<ID>&export=download
//   https://drive.usercontent.google.com/download?id=<ID>
//   https://docs.google.com/document/d/<ID>/... (مستندات/جداول/عرض تقديمي)
// مرفوض: لينكات المجلدات (folders/collections) — مفيهاش ملف واحد محدد.
// ============================================================

/** لينك درايف؟ (أي صيغة — ملفات أو مستندات) */
export function isDriveUrl(url: string): boolean {
  var u = String(url || '')
  return /^https?:\/\/(drive|docs)\.google\.com\//i.test(u) || /^https?:\/\/drive\.usercontent\.google\.com\//i.test(u)
}

/** هل ده لينك مجلد درايف (مش ملف واحد)؟ */
export function isDriveFolderUrl(url: string): boolean {
  var u = String(url || '')
  return /drive\.google\.com\/drive\/(?:folders|u)\//i.test(u) || /drive\.google\.com\/folderview/i.test(u) || /\/folders\//i.test(u)
}

/**
 * استخراج معرف الملف من أي صيغة لينك درايف — أو '' لو مش درايف/مجلد.
 */
export function extractDriveFileId(url: string): string {
  var u = String(url || '').trim()
  if (!u) return ''
  if (!isDriveUrl(u)) return ''
  // مجلد → مفيش ملف واحد (بنرجع فاضي عشان النداء يرفض برسالة واضحة)
  if (/drive\.google\.com\/drive\/(?:folders|u)\//i.test(u) || /drive\.google\.com\/folderview/i.test(u) || /\/folders\//i.test(u)) return ''
  // /file/d/<ID>/
  var m = u.match(/\/file\/d\/([a-zA-Z0-9_-]{10,})/i)
  if (m) return m[1]
  // /document/d/<ID>/ أو /presentation/d/<ID>/ أو /spreadsheets/d/<ID>/
  m = u.match(/\/(?:document|presentation|spreadsheets|forms)\/d\/([a-zA-Z0-9_-]{10,})/i)
  if (m) return m[1]
  // ?id=<ID> (open / uc / download)
  m = u.match(/[?&]id=([a-zA-Z0-9_-]{10,})/i)
  if (m) return m[1]
  // /d/<ID>/
  m = u.match(/\/d\/([a-zA-Z0-9_-]{10,})/i)
  if (m) return m[1]
  return ''
}

/** رابط تحميل مباشر لملف درايف — بيتحمل من غير صفحة درايف */
export function driveDownloadUrl(fileId: string): string {
  return 'https://drive.usercontent.google.com/download?id=' + encodeURIComponent(fileId) + '&export=download&confirm=t'
}

/** رابط العرض المدمج (iframe) — بيفتح داخل المنصة زي مشغل الفيديوهات */
export function drivePreviewUrl(fileId: string): string {
  return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/preview'
}

/** رابط صفحة درايف العادية (احتياطي لو العرض المدمج مرفوض) */
export function driveViewUrl(fileId: string): string {
  return 'https://drive.google.com/file/d/' + encodeURIComponent(fileId) + '/view'
}

/**
 * (سيرفر) تحويل أي لينك درايف لرابط تحميل مباشر قابل للـ fetch —
 * ولينكات المواقع التانية بترجع زي ما هي. بيتخدم في البروكسي وفي /api/ai-extract.
 * بيرجّع قايمة روابط للتجربة بالترتيب (الأول الأول) — درايف ساعات بيطلع
 * صفحة تأكيد الفحص (HTML) للملفات الكبيرة فبنجرب صيغة تانية.
 */
export function resolveDownloadCandidates(url: string): { url: string; isDrive: boolean } {
  var u = String(url || '').trim()
  var id = extractDriveFileId(u)
  if (id) {
    return {
      isDrive: true,
      url: driveDownloadUrl(id),
    }
  }
  if (isDriveUrl(u)) {
    // درايف بس مش معرف الملف (مجلد أو لينك تالف)
    return { isDrive: true, url: '' }
  }
  return { isDrive: false, url: u }
}
