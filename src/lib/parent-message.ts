/* ============================================================
   parent-message — رسالة ولي الأمر (MG-2)
   ============================================================
   - قالب مصري ودود قابل للتعديل وال حفظ في الداتابيز
     (SiteConfig بالمفتاح 'parent_msg_template').
   - بلايسهولدرز: {student} {exams} {homework} {videos} {assessment}
     بتتملي من تقرير الطالب /api/admin/reports?type=student.
   - الدرجات بتتكتب «X من Y» مش «X/Y» — عشان اتجاه العربي ما يقلبش
     الأرقام بصريًا (درس و65).
   ============================================================ */

export const WA_TEACHER_NAME = 'Mr.Wael Khodair'

/* تطبيع رقم واتساب: مسح المسافات/الزائد/الشرطات والأرقام العربية —
   11 رقم بتبدأ بـ 0 (مثال 01012345678) → 201012345678 */
export function normalizeWaPhone(raw: string): string {
  let d = String(raw || '').replace(/[\s+\-()\u200e\u200f]/g, '')
  d = d.replace(/[٠-٩]/g, (x) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(x)))
  if (/^0\d{10}$/.test(d)) return '20' + d.slice(1)
  if (/^20\d{10}$/.test(d)) return d
  if (/^\d{11,15}$/.test(d)) return d
  return ''
}

/* القالب الافتراضي (مصري ودود) — نفسه بيظهر في لوحة الإعدادات
   وبيتستخدم لما مفيش قالب محفوظ */
export const DEFAULT_PARENT_TEMPLATE = [
  'أهلاً حضرتكم 🌹',
  'الطالب/ة: {student}',
  'إحنا من منصة Maths Genius بنتابع معاكم خطوة بخطوة، ودي آخر حالة للمستوى:',
  '',
  '📘 الامتحانات:',
  '{exams}',
  '',
  '📝 الواجبات:',
  '{homework}',
  '',
  '🎥 نسبة مشاهدة الفيديوهات: {videos}',
  '',
  '{assessment}',
  '',
  'ولو حابب تشوف تفاصيل إجابات ابنك ونسبة مشاهدته للفيديوهات خطوة بخطوة، ادخل على حساب ولي الأمر في المنصة.',
  WA_TEACHER_NAME,
].join('\n')

export interface ParentMsgData {
  student: string
  exams: string
  homework: string
  videos: string
  assessment: string
}

/* ملامة القالب بالقيم الحقيقية */
export function fillParentTemplate(tpl: string, data: ParentMsgData): string {
  return String(tpl || '')
    .split('{student}').join(data.student)
    .split('{exams}').join(data.exams)
    .split('{homework}').join(data.homework)
    .split('{videos}').join(data.videos)
    .split('{assessment}').join(data.assessment)
}

function pct(score: any, max: any): number {
  const s = Number(score) || 0
  const m = Number(max) || 0
  if (m <= 0) return 0
  return Math.round((s / m) * 100)
}

/* بناء القيم من شكل تقرير الطالب:
   report.allExams: [{title, score|null, maxScore}] — null = لسه ما دخلهوش
   report.homework: [{title, score, maxScore}] + report.homeworkTotal
   report.summary.avgPercent: متوسط مشاهدة الفيديوهات */
export function buildParentMsgData(studentName: string, report: any): ParentMsgData {
  const allExams: any[] = Array.isArray(report && report.allExams) ? report.allExams : []
  const hw: any[] = Array.isArray(report && report.homework) ? report.homework : []
  const hwTotal = Number(report && report.homeworkTotal) || hw.length
  const avgVideoPercent = Number(report && report.summary && report.summary.avgPercent) || 0

  /* الامتحانات: دخل → درجته، مدخلش → تنبيه */
  var examLines: string[] = []
  if (allExams.length) {
    allExams.forEach(function (e: any) {
      if (e && e.score !== null && e.score !== undefined) {
        examLines.push('• دخل امتحان ' + String(e.title || 'امتحان') + ' وحصل على ' + (Number(e.score) || 0) + ' من ' + (Number(e.maxScore) || 0) + ' ✅')
      } else {
        examLines.push('• امتحان ' + String((e && e.title) || 'امتحان') + ': لسه ما دخلهوش — لازم يدخله في أقرب وقت ⚠️')
      }
    })
  } else {
    examLines.push('• لا يوجد')
  }

  /* الواجبات: سطر لكل واجب + ملخص التسليم */
  var homework: string
  if (hw.length) {
    var lines = hw.map(function (h: any) {
      return '• ' + String((h && h.title) || 'واجب') + ': ' + (Number(h && h.score) || 0) + ' من ' + (Number(h && h.maxScore) || 0)
    })
    var avgHwPct = Math.round(hw.reduce(function (s: number, h: any) { return s + pct(h && h.score, h && h.maxScore) }, 0) / hw.length)
    var delivered = 'سلم ' + hw.length + ' واجب' + (hwTotal > hw.length ? ' من ' + hwTotal : '')
    lines.push('• ' + delivered + ' — متوسط درجاته في الواجبات ' + avgHwPct + '%')
    if (hwTotal > hw.length) {
      var missing = hwTotal - hw.length
      var hwWord = missing === 1 ? 'واجب' : missing === 2 ? 'واجبين' : 'واجبات'
      lines.push('• فيه ' + missing + ' ' + hwWord + ' لسه ما سلمهوش — لازم يسلّم في أقرب وقت')
    }
    homework = lines.join('\n')
  } else {
    homework = '• لسه ما سلمش أي واجب — لازم يسلّم في أقرب وقت'
  }

  /* الفيديوهات: نسبة المشاهدة + تنبيه لو قليلة */
  var videos = avgVideoPercent + '%'
  if (avgVideoPercent < 50) videos += ' — محتاج يكمل باقي الفيديوهات'
  else videos += ' — برافو عليه، استمر'

  /* التقييم العام: متوسط نسب الامتحانات (اللي دخلها) + الواجبات */
  var pool: number[] = []
  allExams.forEach(function (e: any) {
    if (e && e.score !== null && e.score !== undefined) pool.push(pct(e.score, e.maxScore))
  })
  hw.forEach(function (h: any) { pool.push(pct(h && h.score, h && h.maxScore)) })
  var assessment: string
  if (!pool.length) {
    assessment = 'التقييم العام: لسه مفيش درجات كفاية للتقييم — لازم يدخل الامتحانات ويسلّم الواجبات'
  } else {
    var avg = Math.round(pool.reduce(function (s: number, p: number) { return s + p }, 0) / pool.length)
    assessment = avg >= 60
      ? 'التقييم العام: مستواه كويس والحمد لله — استمر على كده 👏'
      : 'التقييم العام: محتاج يحسّن مستواه 💪'
  }

  return {
    student: studentName || '',
    exams: examLines.join('\n'),
    homework: homework,
    videos: videos,
    assessment: assessment,
  }
}
