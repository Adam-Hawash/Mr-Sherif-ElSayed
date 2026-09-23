// ============================================================
// (2026-و87) إشعارات أولياء الأمور — طلب المستر:
//   «لما الطالب يسلّم امتحان أو واجب — ولي الأمر ياخد إشعار
//    فيه اسم ابنه واسم الامتحان/الواجب ودرجته»
// ============================================================
//   - الجدول parent_notifications (بالشكل اللي اتطلب حرفيًا):
//       id INTEGER PK AUTOINCREMENT | parent_id TEXT (رقم ولي الأمر مطبّع)
//       student_name TEXT | message TEXT | is_read INTEGER 0/1 | created_at DATETIME
//   - parent_id = رقم موبايل ولي الأمر بصيغة 11 رقم (010xxxxxxxx) —
//     نفس تطبيع دخول حساب ولي الأمر، فالإشعار بيوصل لكل مستر مربوط
//     بالطالب (تليفون ولي الأمر على حسابه + حسابات Parent المدموجة و79)
//   - القوالب تحت PARENT_EXAM_TEMPLATE / PARENT_HOMEWORK_TEMPLATE —
//     تعديل كلام الرسالة بيتم من الملف ده بس (سهل ومركزي)
//   - insert متسامح: أي فشل في الإشعار **مابيبوّظش** التسليم نفسه
//
//   (2026-و88) الجزء الخارجي — طلب المستر: «الإشعار بيظهر لولي الأمر على
//   الموبايل بره، أول ما يضغط عليه يفتح التليفون ويدخله على صفحة تسجيل
//   الدخول بتاعت المنصة، وهو يسجل دخوله ويشوف الإشعار جوه المنصة —
//   يعني الاتنين»: بعد كتابة الإشعار الداخلي بنبعت نسخة واتساب/SMS على
//   موبايل ولي الأمر فيها لينك المنصة ({link}) — القوالب تحت
//   PARENT_WA_EXAM_TEMPLATE / PARENT_WA_HOMEWORK_TEMPLATE — نفس قناة
//   الإرسال المفعّلة في لوحة التحكم (lib/wa-send.ts)
// ============================================================
import { db } from '@/lib/db'
import { normalizeWaPhone } from '@/lib/parent-message'
import { sendViaChannel } from '@/lib/wa-send'

/* ============================================================
   ✏️✏️ قوالب رسائل ولي الأمر — عدّل الكلام من هنا براحتك ✏️✏️
   المتاح في القالب:
     {student}  اسم الطالب
     {title}    اسم الامتحان أو الواجب
     {score}    الدرجة اللي جابها
     {max}      الدرجة النهائية
     {percent}  النسبة المئوية
   ملاحظة: الدرجة بتتكتب «X من Y» مش «X/Y» — عشان اتجاه العربي
   ما يقلبش الأرقام بصريًا (درس و65)
   ============================================================ */
export const PARENT_EXAM_TEMPLATE = [
  '🎓 متابعة من منصة مستر شريف السيد',
  'الطالب/ة: {student}',
  'سلّم امتحان «{title}»',
  'الدرجة: {score} من {max} — النسبة {percent}%',
  '',
  'تقدر تشوف التفاصيل الكاملة وإجابات ابنك من حساب ولي الأمر في المنصة.',
  'Mr. Sherif ElSayed',
].join('\n')

export const PARENT_HOMEWORK_TEMPLATE = [
  '📝 متابعة من منصة مستر شريف السيد',
  'الطالب/ة: {student}',
  'سلّم واجب «{title}»',
  'الدرجة: {score} من {max} — النسبة {percent}%',
  '',
  'تقدر تشوف التفاصيل الكاملة وإجابات ابنك من حساب ولي الأمر في المنصة.',
  'Mr. Sherif ElSayed',
].join('\n')

/* ============================================================
   ✏️✏️ قوالب الرسالة اللي بتوصل **بره على موبايل ولي الأمر**
   (واتساب/SMS — و88) — عدّل الكلام من هنا براحتك
   نفس متغيرات القوالب الداخلية + {link} = لينك المنصة اللي بيفتح
   صفحة تسجيل دخول ولي الأمر على طول
   ============================================================ */
export const PARENT_WA_EXAM_TEMPLATE = [
  '🔔 إشعار من منصة مستر شريف السيد',
  'الطالب/ة: {student}',
  'سلّم امتحان «{title}»',
  'الدرجة: {score} من {max} — النسبة {percent}%',
  '',
  '👈 ادخل على اللينك ده وسجل دخول بحساب ولي الأمر عشان تشوف الإشعار والتفاصيل:',
  '{link}',
  'Mr. Sherif ElSayed',
].join('\n')

export const PARENT_WA_HOMEWORK_TEMPLATE = [
  '📝 إشعار من منصة مستر شريف السيد',
  'الطالب/ة: {student}',
  'سلّم واجب «{title}»',
  'الدرجة: {score} من {max} — النسبة {percent}%',
  '',
  '👈 ادخل على اللينك ده وسجل دخول بحساب ولي الأمر عشان تشوف الإشعار والتفاصيل:',
  '{link}',
  'Mr. Sherif ElSayed',
].join('\n')

/* ملامة قالب الواتساب بالقيم الحقيقية + اللينك */
export function buildParentWaMessage(kind: 'exam' | 'homework', studentName: string, title: string, score: number, maxScore: number, siteUrl: string): string {
  var s = Number(score) || 0
  var m = Number(maxScore) || 0
  var pct = m > 0 ? Math.round((s / m) * 100) : 0
  var tpl = kind === 'exam' ? PARENT_WA_EXAM_TEMPLATE : PARENT_WA_HOMEWORK_TEMPLATE
  return String(tpl)
    .split('{student}').join(String(studentName || 'الطالب'))
    .split('{title}').join(String(title || ''))
    .split('{score}').join(String(s))
    .split('{max}').join(String(m))
    .split('{percent}').join(String(pct))
    .split('{link}').join(String(siteUrl || ''))
}

/* ملامة القالب بالقيم الحقيقية */
export function buildParentMessage(kind: 'exam' | 'homework', studentName: string, title: string, score: number, maxScore: number): string {
  var s = Number(score) || 0
  var m = Number(maxScore) || 0
  var pct = m > 0 ? Math.round((s / m) * 100) : 0
  var tpl = kind === 'exam' ? PARENT_EXAM_TEMPLATE : PARENT_HOMEWORK_TEMPLATE
  return String(tpl)
    .split('{student}').join(String(studentName || 'الطالب'))
    .split('{title}').join(String(title || ''))
    .split('{score}').join(String(s))
    .split('{max}').join(String(m))
    .split('{percent}').join(String(pct))
}

/* تطبيع رقم ولي الأمر — نفس صيغة تسجيل دخول ولي الأمر بالظبط:
   11 رقم بتبدأ بـ 0 (010xxxxxxxx) — بيتقبل 20-prefix وأي تنسيق غريب */
export function normalizeParentPhone(raw: string): string {
  var t = String(raw || '')
  t = t.replace(/[٠-٩]/g, function (d) { return String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)) })
  t = t.replace(/[۰-۹]/g, function (d) { return String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) })
  var digits = t.replace(/[^0-9]/g, '')
  if (digits.length === 12 && digits.indexOf('20') === 0) digits = '0' + digits.slice(2)
  else if (digits.length > 11) digits = digits.slice(digits.length - 11)
  else if (digits.length === 10 && digits.indexOf('1') === 0) digits = '0' + digits
  return (digits.length === 11 && digits.charAt(0) === '0') ? digits : ''
}

/* (و45 نفس الدرس) ضمان وجود الجدول — أول INSERT فاشل بعمل CREATE TABLE
   IF NOT EXISTS بالأعمدة المطلوبة ونعدّي المحاولة — مرة لكل process.
   ده اللي بيخلي الإنتاج (Turso) بيتعمل فيه الجدول لوحده من غير أي تدخل يدوي */
var _pnTableReady = false
export async function ensureParentNotificationsTable(force?: boolean): Promise<void> {
  if (_pnTableReady && !force) return
  try {
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS parent_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id TEXT NOT NULL DEFAULT '', student_name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_pn_parent ON parent_notifications(parent_id, is_read)') } catch (e) {}
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_pn_created ON parent_notifications(created_at)') } catch (e) {}
    _pnTableReady = true
  } catch (e) {
    console.error('[parent-notify] ensure table failed (ignored):', e)
  }
}

/**
 * إنشاء إشعارات ولي الأمر بعد تسليم امتحان/واجب — بيتنادى من مسارات
 * التسليم (exams/submit بعد الدرجة النهائية + homework/submit).
 * الإشعار بيتكتب لكل رقم ولي أمر مربوط بالطالب (و37 + و79 multi-child).
 * أي فشل = سجل في اللوج وبس — التسليم مش بيتأثر أبدًا.
 */
export async function notifyParentsOfResult(opts: { studentId: string; kind: 'exam' | 'homework'; title: string; score: number; maxScore: number; siteUrl?: string }): Promise<void> {
  try {
    if (!opts || !opts.studentId) return
    await ensureParentNotificationsTable()

    var stu: any = await db.$queryRawUnsafe('SELECT name, parentPhone FROM Student WHERE id = ? LIMIT 1', String(opts.studentId))
    stu = stu || []
    if (!stu.length) return
    var studentName = String(stu[0].name || '')

    /* كل أرقام أولياء الأمور المربوطة بالطالب — بدون تكرار */
    var targets: string[] = []
    var pushTarget = function (raw: any) {
      var n = normalizeParentPhone(String(raw || ''))
      if (n && targets.indexOf(n) === -1) targets.push(n)
    }
    pushTarget(stu[0].parentPhone)
    /* حسابات Parent المربوطة مباشرة (و37) */
    try {
      var p1: any = await db.$queryRawUnsafe('SELECT phone FROM Parent WHERE studentId = ?', String(opts.studentId))
      p1 = p1 || []
      for (var i = 0; i < p1.length; i++) pushTarget(p1[i] && p1[i].phone)
    } catch (e1) {}
    /* حسابات Parent المدموجة عبر ParentStudent (و79 — ولي أمر بعدة أبناء) */
    try {
      var links: any = await db.$queryRawUnsafe('SELECT parentId FROM ParentStudent WHERE studentId = ?', String(opts.studentId))
      links = links || []
      for (var j = 0; j < links.length; j++) {
        var pid = links[j] && links[j].parentId ? String(links[j].parentId) : ''
        if (!pid) continue
        try {
          var pr: any = await db.$queryRawUnsafe('SELECT phone FROM Parent WHERE id = ? LIMIT 1', pid)
          pr = pr || []
          if (pr.length) pushTarget(pr[0] && pr[0].phone)
        } catch (e2) {}
      }
    } catch (e3) {}

    if (!targets.length) return /* مفيش رقم ولي أمر مسجل — مفيش إشعار (مش مشكلة) */

    var message = buildParentMessage(opts.kind, studentName, opts.title, opts.score, opts.maxScore)
    for (var k = 0; k < targets.length; k++) {
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO parent_notifications (parent_id, student_name, message, is_read, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
          targets[k], studentName.slice(0, 120), message
        )
      } catch (eIns) {
        /* المحاولة الأولى فشلت — غالبًا الجدول ناقص (نشر جديد): نعمله ونعدّي مرة */
        try {
          await ensureParentNotificationsTable(true)
          await db.$executeRawUnsafe(
            'INSERT INTO parent_notifications (parent_id, student_name, message, is_read, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
            targets[k], studentName.slice(0, 120), message
          )
        } catch (eIns2) {
          console.error('[parent-notify] insert failed (ignored):', eIns2)
        }
      }
    }

    /* (2026-و88) الجزء الخارجي — رسالة واتساب/SMS على موبايل ولي الأمر
       فيها لينك المنصة (بيفتح صفحة تسجيل دخول ولي الأمر على طول).
       بتتبعت بنفس القناة المفعّلة في لوحة التحكم (msg_channel) — لو
       مفيش مزود مفعّل بنسكته بهدوء والإشعار الداخلي شغال زي ما هو. */
    var waLink = String(opts.siteUrl || '').trim()
    if (waLink) {
      if (waLink.indexOf('#parent-login') === -1) waLink = waLink.replace(/\/#*$/, '') + '/#parent-login'
      var waMsg = buildParentWaMessage(opts.kind, studentName, opts.title, opts.score, opts.maxScore, waLink)
      for (var w = 0; w < targets.length; w++) {
        var waPhone = normalizeWaPhone(targets[w])
        if (!waPhone) continue
        try {
          var out = await sendViaChannel(waPhone, waMsg)
          if (!out.sent && out.mode !== 'manual') {
            console.error('[parent-notify] external send failed (ignored): mode=' + out.mode + ' err=' + String(out.error || ''))
          }
        } catch (eWa) {
          console.error('[parent-notify] external send error (ignored):', eWa)
        }
      }
    }
  } catch (e) {
    console.error('[parent-notify] failed (ignored):', e)
  }
}
