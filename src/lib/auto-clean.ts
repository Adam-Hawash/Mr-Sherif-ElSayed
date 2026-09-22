// ============================================================
// (2026-و86) التنظيف التلقائي الدائم — طلب المستر حرفيًا:
// 1) «المتابعة دي بتاخذ وقت كل طلب دخل الساعة كم وكده» → سجل النشاط
//    بقى **النهارده بس** (كل يوم بيومه) وبحد أقصى **20 متابعة لكل
//    طالب** — مفيش تراكم تاريخي خالص.
// 2) «تفضية المساحات» → ملفات حلول الواجبات (الصور/PDF اللي الطلاب
//    بيرفعوها) بتاخد مساحة ضخمة في الداتابيز (كانت 474MB في 11 يوم!)
//    فبقى ليها **أسبوع واحد** عيشة — المستر بيقيّم خلال الأسبوع وبعد
//    كده الملف بيتنضف من التخزين تلقائيًا.
// 🛡️ خط أحمر: Student / ExamResult / HomeworkResult / PointsLedger
//    (الطلاب والدرجات) **مش بيتلمسوا خالص** — اللي بينضف سجل نشاط
//    مؤقت وملفات مرفقة قديمة بس، الدرجات نفسها بتفضل محفوظة للأبد.
// Throttle: كل helper بيشتغل مرة واحدة كل فترة على الأقل لكل instance
// عشان ماحدش يضغط نداءات كتابة ضاية على Turso.
// ============================================================
import { db } from '@/lib/db'

var _lastActivityPrune = 0
var _lastMediaPrune = 0
var ACTIVITY_MS = 5 * 60 * 1000
var MEDIA_MS = 30 * 60 * 1000

/* الحد الأقصى للمتابعات المعروضة/المحفوظة لكل طالب في النهارده (طلب و86: «ما تزودش أكتر من 20») */
export var ACTIVITY_KEEP = 20

/* ملفات حلول الواجبات تعيش كام يوم (طلب و86: تفضية المساحات — والدرجة بتفضل) */
var MEDIA_KEEP_DAYS = 7

/* بداية النهارده بتوقيت القاهرة (كل يوم بيومه — بتتعامل مع توقيت الصيف والشتاء) */
export function startOfTodayCairo(): Date {
  var day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date())
  var offs = ['+03:00', '+02:00']
  for (var i = 0; i < offs.length; i++) {
    var t = new Date(day + 'T00:00:00' + offs[i]).getTime()
    if (new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date(t)) === day) return new Date(t)
  }
  return new Date(day + 'T00:00:00+02:00')
}

/* سجل النشاط: النهارده بس + 20 لكل طالب — بينادى من track-login وactivities */
export async function pruneStudentActivity(): Promise<void> {
  var now = Date.now()
  if (now - _lastActivityPrune < ACTIVITY_MS) return
  _lastActivityPrune = now
  try {
    /* 1) كل يوم بيومه — اللي قبل النهارده (بتوقيت القاهرة) يتنضف */
    await db.studentActivity.deleteMany({ where: { createdAt: { lt: startOfTodayCairo() } } })
    /* 2) حد 20 متابعة لكل طالب في النهارده — الأحدث هي اللي تفضل */
    var cutSql = startOfTodayCairo().toISOString().replace('T', ' ').substring(0, 19)
    await db.$executeRawUnsafe(
      'DELETE FROM StudentActivity WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY studentId ORDER BY createdAt DESC, id DESC) AS rn FROM StudentActivity WHERE createdAt >= ?) WHERE rn > ' +
        ACTIVITY_KEEP +
        ')',
      cutSql
    )
  } catch (e) {
    /* التنظيف مش مفروض يبوّظ الطلب الأصلي — نسجل ونكمل */
    console.error('[auto-clean] activity prune:', e)
  }
}

/* ملفات حلول الواجبات القديمة (أسبوع) — الدرجات (HomeworkResult) مش بتتلمس خالص */
export async function pruneHomeworkAnswerMedia(): Promise<void> {
  var now = Date.now()
  if (now - _lastMediaPrune < MEDIA_MS) return
  _lastMediaPrune = now
  try {
    var cut = new Date(now - MEDIA_KEEP_DAYS * 24 * 60 * 60 * 1000)
    await db.media.deleteMany({ where: { category: 'homework-answers', createdAt: { lt: cut } } })
  } catch (e) {
    console.error('[auto-clean] homework media prune:', e)
  }
}
