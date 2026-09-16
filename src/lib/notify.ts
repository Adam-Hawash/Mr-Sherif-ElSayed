// ============================================================
// (2026-و44) مكتبة الإشعارات — طلب المستر حرفيًا:
//   «لما الأدمن يرد على الطالب يجيله إشعار إن الشكوى دي اتحلت …
//    وفي الكتب والملازم لو اتضافت حاجة يظهر له إشعار …
//    أي حاجة يتضاف تظهر له إشعار للطالب»
// ============================================================
// insert بسيط ومتسامح — أي فشل في الإشعار **مابيبوّظش** العملية الأساسية
// (الرد على الشكوى/إضافة الكتاب/…) — بنلقط الخطأ بسجلوه وبس.
// ============================================================
import { db } from '@/lib/db'

function nid(): string {
  return 'ntf' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* (و45) ضمان وجود جدول Notification — درس و43 الموثق: الـ heal الرئيسي
   مش مضمون يتشغّل على كل نشر، فأول فشل INSERT بنعمل CREATE TABLE IF NOT
   EXISTS + الفهارس ونعدّي المحاولة — مرة واحدة لكل process */
var _notificationTableReady = false
async function ensureNotificationTable(): Promise<void> {
  if (_notificationTableReady) return
  try {
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Notification (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'general', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notification_student ON Notification(studentId, read)') } catch (e) {}
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_notification_created ON Notification(createdAt)') } catch (e) {}
    _notificationTableReady = true
  } catch (e) {
    console.error('[notify] ensure table failed (ignored):', e)
  }
}

/** إشعار لطالب واحد — (و45) لو الجدول ناقص بنعمله ونعدّي المحاولة */
export async function notifyStudent(studentId: string, type: string, title: string, body?: string): Promise<void> {
  if (!studentId) return
  var args = [nid(), studentId, type, String(title || '').slice(0, 160), String(body || '').slice(0, 500)]
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO Notification (id, studentId, type, title, body, read, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
      args[0], args[1], args[2], args[3], args[4]
    )
    return
  } catch (e) {
    /* المحاولة الأولى فشلت — غالبًا الجدول ناقص: نعمله ونعدّي مرة كمان */
    try {
      await ensureNotificationTable()
      await db.$executeRawUnsafe(
        'INSERT INTO Notification (id, studentId, type, title, body, read, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        nid(), studentId, type, String(title || '').slice(0, 160), String(body || '').slice(0, 500)
      )
    } catch (e2) {
      console.error('[notify] insert failed (ignored):', e2)
    }
  }
}

/**
 * إشعار لمجموعة طلاب — بالids مباشرة أو بالصف (grade).
 * grade فاضي أو '*' = كل الطلاب المفعّلين.
 * الجدول مش موجود بعد (نشر جديد) → فشل صامت — مفيش مشكلة.
 */
export async function notifyStudents(opts: {
  studentIds?: string[]
  grade?: string
  type: string
  title: string
  body?: string
}): Promise<void> {
  try {
    var ids: string[] = Array.isArray(opts.studentIds) ? opts.studentIds.filter(Boolean) : []
    if (ids.length === 0 && opts.grade) {
      try {
        var rows: any = await db.$queryRawUnsafe(
          "SELECT id FROM Student WHERE status IN ('approved','paid') AND grade = ?",
          opts.grade
        )
        ids = (rows || []).map(function (r: any) { return String(r.id) })
      } catch (eG) {
        try {
          var rows2: any = await db.$queryRawUnsafe(
            "SELECT id FROM Student WHERE status IN ('approved','paid')"
          )
          ids = (rows2 || []).map(function (r: any) { return String(r.id) })
        } catch (eG2) { ids = [] }
      }
    }
    if (ids.length === 0 && !opts.grade) {
      try {
        var all: any = await db.$queryRawUnsafe("SELECT id FROM Student WHERE status IN ('approved','paid')")
        ids = (all || []).map(function (r: any) { return String(r.id) })
      } catch (eA) { ids = [] }
    }
    /* INSERT مجمّع على دفعات — سريع ومفيش N نداءات
       (و45) أول فشل دفعة بنضمن وجود الجدول ونعدّيها مرة */
    var CHUNK = 40
    var retried = false
    for (var i = 0; i < ids.length; i += CHUNK) {
      var slice = ids.slice(i, i + CHUNK)
      var values: string[] = []
      var args: any[] = []
      for (var k = 0; k < slice.length; k++) {
        values.push('(?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)')
        args.push(nid(), slice[k], opts.type, String(opts.title || '').slice(0, 160), String(opts.body || '').slice(0, 500))
      }
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO Notification (id, studentId, type, title, body, read, createdAt, updatedAt) VALUES ' + values.join(', '),
          ...args
        )
      } catch (eB) {
        if (!retried) {
          retried = true
          try {
            await ensureNotificationTable()
            await db.$executeRawUnsafe(
              'INSERT INTO Notification (id, studentId, type, title, body, read, createdAt, updatedAt) VALUES ' + values.join(', '),
              ...args
            )
            continue
          } catch (eB2) {
            console.error('[notifyStudents] batch insert failed after heal (ignored):', eB2)
          }
        } else {
          console.error('[notifyStudents] batch insert failed (ignored):', eB)
        }
      }
    }
  } catch (e) {
    console.error('[notifyStudents] failed (ignored):', e)
  }
}
