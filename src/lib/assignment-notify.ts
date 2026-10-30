// ============================================================
// (2026-و97) إشعارات الواجبات والامتحانات — طلب المستر الحرفي:
//   «أول ما الواجب أو الامتحان ينزل تجيب إشعار لولي الأمر تقول له
//    في واجب أو امتحان نزل — الطالب يا ريت يحله»
//   «لو الامتحان أو الواجب عامليهم بوقت — أول ما يبقى فاضل له 24 ساعة
//    تقول له تحذير: فاضل 24 ساعة، ابنك يدخل يحل بسرعة»
//   «لو نزل والطالب بعد 24 ساعة ما حلهمش — قول له إن ابنك ما حلهوش»
//   «والإشعارات دي تيجي للطالب وعند ولي الأمر»
//   «والإشعارات كلها بصورة الفافيكون بتاعة المنصة»
// ============================================================
// التصميم:
//   1) notifyAssignmentPosted — بينادى أول ما الأدمن ينزل واجب/امتحان
//      (فوري من مسار الـ POST) + مرة تانية كشبكة أمان من الـ sweep —
//      مفتاح منع تكرار واحد (NotifySweepLog) فمفيش إشعار مزدوج أبدًا.
//   2) sweepAssignmentNotifications — بيتنادى بشكل خامل (لما ولي الأمر
//      أو الطالب يفتح الإشعارات + من /api/notify-sweep) وبيمشي على
//      الواجبات والامتحانات الأحدث من 14 يوم:
//        a) نزول جديد (آخر 24 ساعة)             → إشعار لولي الأمر
//        b) امتحان له وقت قفله فاضل ≤ 24 ساعة   → تحذير لولي الأمر والطالب (اللي ما حلهوش)
//        c) عدّى 24 ساعة على النزول من غير حل    → تنبيه لولي الأمر والطالب
//        d) وقت قفل الامتحان خلص وما حلهوش      → تنبيه لولي الأمر والطالب
//   - كل إشعار بيتكتب في parent_notifications (ولي الأمر — إشعار داخلي
//     + Web Push بصورة الفافيكون) وفي Notification (الطالب — جرس الإشعارات)
//   - أي فشل = لوج بس — ولا عملية أساسية بتتبوّظ أبدًا
// ============================================================
import { db } from '@/lib/db'
import { sendParentPush } from '@/lib/push'
import { resolveParentPushIcon, normalizeParentPhone } from '@/lib/parent-notify'
import { notifyStudent } from '@/lib/notify'

/* ✏️ اسم المنصة في نصوص الإشعارات — بتتقرأ من إعدادات المنصة ولو ناقصة بيرجع للاسم ده */
var FALLBACK_PLATFORM_NAME = 'مستر شريف السيد'

function nid(): string {
  return 'asg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function safeDate(v: any): Date | null {
  if (!v) return null
  try {
    var d = v instanceof Date ? v : new Date(String(v))
    return isNaN(d.getTime()) ? null : d
  } catch (e) { return null }
}

/* تطبيع قايمة ids المستهدفة — JSON array أو نص بفواصل */
function parseIds(raw: any): string[] {
  var s = String(raw || '').trim()
  if (!s) return []
  try {
    var p = JSON.parse(s)
    if (Array.isArray(p)) return p.map(function (x) { return String(x == null ? '' : x).trim() }).filter(Boolean)
  } catch (e) {}
  return s.split(',').map(function (x) { return x.trim() }).filter(Boolean)
}

/* ============================================================
   جداول النظام — إنشاء + **شفاء الشكل الخاطئ** (درس مهم: CREATE TABLE
   IF NOT EXISTS ما بيشفيش جدول قديم شكله مختلف — فبنفحص الأعمدة
   ولو ناقصة بنمسح الجدول القديم (بيانات إشعارات مؤقتة — مقبول) ونعيده
   بالشكل الصحيح. ده اللي كان بيمنع الإشعارات تشتغل على بعض الDBs)
   ============================================================ */
var _tablesReady = false
export async function ensureAssignmentTables(force?: boolean): Promise<void> {
  if (_tablesReady && !force) return
  /* 1) جدول إشعارات ولي الأمر — نفس شكل lib/parent-notify بالظبط */
  try {
    var pnCols: any = await db.$queryRawUnsafe('PRAGMA table_info(parent_notifications)')
    var names: string[] = (pnCols || []).map(function (c: any) { return String(c && c.name || '').toLowerCase() })
    var need = ['id', 'parent_id', 'student_name', 'message', 'is_read', 'created_at']
    var shapeOk = need.every(function (n) { return names.indexOf(n) !== -1 })
    if (names.length > 0 && !shapeOk) {
      console.warn('[assignment-notify] parent_notifications shape mismatch — rebuilding (cols: ' + names.join(',') + ')')
      try { await db.$executeRawUnsafe('DROP TABLE parent_notifications') } catch (eD) {}
    }
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS parent_notifications (id INTEGER PRIMARY KEY AUTOINCREMENT, parent_id TEXT NOT NULL DEFAULT '', student_name TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', is_read INTEGER NOT NULL DEFAULT 0, created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_pn_parent ON parent_notifications(parent_id, is_read)') } catch (e) {}
  } catch (e1) { console.error('[assignment-notify] ensure parent_notifications failed (ignored):', e1) }
  /* 2) جدول منع التكرار */
  try {
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS NotifySweepLog (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_nsl_created ON NotifySweepLog(createdAt)') } catch (e) {}
    /* تنظيف هادئ — مفاتيح أقدم من 45 يوم مش محتاجينها */
    try { await db.$executeRawUnsafe("DELETE FROM NotifySweepLog WHERE createdAt < datetime('now', '-45 days')") } catch (eC) {}
  } catch (e2) { console.error('[assignment-notify] ensure NotifySweepLog failed (ignored):', e2) }
  /* 3) جدول إشعارات الطالب — نفس شكل lib/notify */
  try {
    var ntCols: any = await db.$queryRawUnsafe('PRAGMA table_info(Notification)')
    var nNames: string[] = (ntCols || []).map(function (c: any) { return String(c && c.name || '').toLowerCase() })
    var nNeed = ['id', 'studentid', 'type', 'title', 'body', 'read', 'createdat']
    var nOk = nNeed.every(function (n) { return nNames.indexOf(n) !== -1 })
    if (nNames.length > 0 && !nOk) {
      console.warn('[assignment-notify] Notification shape mismatch — rebuilding (cols: ' + nNames.join(',') + ')')
      try { await db.$executeRawUnsafe('DROP TABLE Notification') } catch (eD2) {}
    }
    await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Notification (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'general', title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', read INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
  } catch (e3) { console.error('[assignment-notify] ensure Notification failed (ignored):', e3) }
  _tablesReady = true
}

/* قراءة اسم المنصة من الإعدادات (مع كاش خفيف) */
var _brandName = ''
var _brandAt = 0
async function platformName(): Promise<string> {
  var now = Date.now()
  if (_brandName && now - _brandAt < 600000) return _brandName
  try {
    var rows: any = await db.$queryRawUnsafe("SELECT value FROM SiteConfig WHERE key IN ('site_name','siteName') LIMIT 1")
    rows = rows || []
    if (rows.length && String(rows[0].value || '').trim()) _brandName = String(rows[0].value).trim()
  } catch (e) {}
  if (!_brandName) _brandName = FALLBACK_PLATFORM_NAME
  _brandAt = now
  return _brandName
}

/* ============================================================
   منع التكرار — مفتاح واحد لكل إشعار/دفعة إشعارات
   ============================================================ */
async function sweepDone(key: string): Promise<boolean> {
  try {
    var rows: any = await db.$queryRawUnsafe('SELECT id FROM NotifySweepLog WHERE key = ? LIMIT 1', key)
    return !!(rows && rows.length)
  } catch (e) { return false }
}
async function markSweep(key: string): Promise<void> {
  try {
    await db.$executeRawUnsafe('INSERT OR IGNORE INTO NotifySweepLog (id, key, createdAt) VALUES (?, ?, CURRENT_TIMESTAMP)', nid(), key)
  } catch (e) { console.error('[assignment-notify] markSweep failed (ignored):', e) }
}

/* كل أرقام أولياء الأمور المربوطة بالطالب — نفس منطق lib/parent-notify
   (حساب مباشر + حسابات مدموجة ParentStudent + تليفون الطالب نفسه) */
async function collectParentTargets(studentId: string, parentPhone: string): Promise<string[]> {
  var targets: string[] = []
  var pushTarget = function (raw: any) {
    var n = normalizeParentPhone(String(raw || ''))
    if (n && targets.indexOf(n) === -1) targets.push(n)
  }
  pushTarget(parentPhone)
  try {
    var p1: any = await db.$queryRawUnsafe('SELECT phone FROM Parent WHERE studentId = ?', String(studentId))
    p1 = p1 || []
    for (var i = 0; i < p1.length; i++) pushTarget(p1[i] && p1[i].phone)
  } catch (e1) {}
  try {
    var links: any = await db.$queryRawUnsafe('SELECT parentId FROM ParentStudent WHERE studentId = ?', String(studentId))
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
  return targets
}

/* كتابة إشعار ولي الأمر (داخلي + Push خارجي بالفافيكون) — متسامح */
async function writeParentNotice(parentId: string, studentName: string, message: string, payload: { title: string; body: string; url: string; tag: string; icon: string }): Promise<void> {
  try {
    await db.$executeRawUnsafe(
      'INSERT INTO parent_notifications (parent_id, student_name, message, is_read, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
      String(parentId || ''), String(studentName || '').slice(0, 120), String(message || '')
    )
  } catch (eIns) {
    try {
      await ensureAssignmentTables(true)
      await db.$executeRawUnsafe(
        'INSERT INTO parent_notifications (parent_id, student_name, message, is_read, created_at) VALUES (?, ?, ?, 0, CURRENT_TIMESTAMP)',
        String(parentId || ''), String(studentName || '').slice(0, 120), String(message || '')
      )
    } catch (eIns2) { console.error('[assignment-notify] parent insert failed (ignored):', eIns2) }
  }
  try {
    await sendParentPush(String(parentId || ''), payload).catch(function () { return { sent: 0, failed: 0 } })
  } catch (eP) { /* صامت */ }
}

/* كتابة إشعار الطالب في الجرس — متسامح */
async function writeStudentNotice(studentId: string, type: string, title: string, body: string): Promise<void> {
  try { await notifyStudent(studentId, type, title, body) } catch (e) { /* صامت */ }
}

/* تنسيق تاريخ عربي مختصر — «الخميس 12 يونيو 8:30 م» */
function fmtAr(d: Date): string {
  try {
    return d.toLocaleString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' })
  } catch (e) { return '' }
}

/* جمهور واجب/امتحان — الطلاب المستهدفين (استهداف مباشر أو مجموعات أو الصف كله) */
var _studentCols: string[] | null = null
async function studentColumns(): Promise<string[]> {
  if (_studentCols) return _studentCols
  try {
    var c: any = await db.$queryRawUnsafe('PRAGMA table_info(Student)')
    _studentCols = (c || []).map(function (x: any) { return String(x && x.name || '') })
  } catch (e) { _studentCols = [] }
  return _studentCols
}

async function assignmentAudience(kind: string, item: any): Promise<{ id: string; name: string; parentPhone: string }[]> {
  var explicit = parseIds(item.targetStudentIds)
  var groups = parseIds(item.targetGroupIds)
  var rows: any = []
  try {
    if (explicit.length > 0 || groups.length > 0) {
      var cols = await studentColumns()
      var hasGroup = cols.indexOf('groupId') !== -1
      var hasPhone = cols.indexOf('parentPhone') !== -1
      var conds: string[] = []
      var args: any[] = []
      if (explicit.length > 0) {
        conds.push('id IN (' + explicit.map(function () { return '?' }).join(',') + ')')
        for (var i = 0; i < explicit.length; i++) args.push(explicit[i])
      }
      if (groups.length > 0 && hasGroup) {
        conds.push('groupId IN (' + groups.map(function () { return '?' }).join(',') + ')')
        for (var g = 0; g < groups.length; g++) args.push(groups[g])
      }
      if (conds.length === 0) conds.push('1=0') /* استهداف بس من غير عمود مجموعات → مفيش جمهور */
      /* (و97-إصلاح) status='active' — القبول التلقائي بيسجل الطلاب الجدد active
         والفلتر القديم (approved,paid) كان بيستبعدهم كلهم بصمت = مفيش إشعارات
         للطلاب الجدد أصلًا — ده كان السبب الجذري لشكوى المستر */
      rows = await db.$queryRawUnsafe("SELECT id, name" + (hasPhone ? ', parentPhone' : ", '' as parentPhone") + " FROM Student WHERE status IN ('approved','paid','active') AND (" + conds.join(' OR ') + ')', ...args)
    } else {
      var cols2 = await studentColumns()
      var hasPhone2 = cols2.indexOf('parentPhone') !== -1
      rows = await db.$queryRawUnsafe("SELECT id, name" + (hasPhone2 ? ', parentPhone' : ", '' as parentPhone") + " FROM Student WHERE status IN ('approved','paid','active') AND grade = ?", String(item.grade || ''))
    }
  } catch (eQ) {
    console.error('[assignment-notify] audience query failed (ignored):', eQ)
    rows = []
  }
  return (rows || []).map(function (r: any) {
    return { id: String(r.id), name: String(r.name || ''), parentPhone: String(r.parentPhone || '') }
  })
}

/* مين سلّم فعلًا من الجمهور — set بids */
async function submittedSet(kind: string, itemId: string): Promise<Set<string>> {
  var out: Set<string> = new Set()
  try {
    var tbl = kind === 'exam' ? 'ExamResult' : 'HomeworkResult'
    var fk = kind === 'exam' ? 'examId' : 'homeworkId'
    var rows: any = await db.$queryRawUnsafe('SELECT studentId FROM ' + tbl + ' WHERE ' + fk + ' = ?', String(itemId))
    rows = rows || []
    for (var i = 0; i < rows.length; i++) out.add(String(rows[i].studentId))
  } catch (e) {}
  return out
}

/* ============================================================
   (1) إشعار النزول الفوري — لولي الأمر بس (الطالب بياخد إشعاره
   من notifyStudents الموجودة أصلًا في مسار الـ POST — مفيش تكرار)
   بيتنادى من مسار الـ POST بعد الإنشاء + كشبكة أمان من الـ sweep
   (المفتاح واحد — أول واحد يشتغل بيبعت والباقي بيتخطى)
   ============================================================ */
export async function notifyAssignmentPosted(opts: { kind: 'exam' | 'homework'; id: string; title: string; grade: string; endsAt?: any; targetStudentIds?: string; targetGroupIds?: string }): Promise<void> {
  try {
    if (!opts || !opts.id) return
    await ensureAssignmentTables()
    var key = 'posted:' + opts.kind + ':' + String(opts.id)
    if (await sweepDone(key)) return
    /* (و97-إصلاح) المفتاح بيتسجل **بعد** الكتابة مش قبلها — لو الكتابة فشلت
       التشغيلة الجاية بتعيد المحاولة بدل ما يضيع الإشعار للأبد */

    var audience = await assignmentAudience(opts.kind, {
      grade: opts.grade,
      targetStudentIds: opts.targetStudentIds || '',
      targetGroupIds: opts.targetGroupIds || '',
    })
    if (!audience.length) return

    var brand = await platformName()
    var icon = '/push-icon.png'
    try { icon = await resolveParentPushIcon() } catch (eI) {}
    var endD = safeDate(opts.endsAt)

    /* نص واحد للجمهور كله (الإشعار موجه للأب — الاسم بين كل ابن وابن) */
    for (var i = 0; i < audience.length; i++) {
      var stu = audience[i]
      var targets = await collectParentTargets(stu.id, stu.parentPhone)
      if (!targets.length) continue
      var message: string
      var pushTitle: string
      var pushBody: string
      if (opts.kind === 'exam') {
        if (endD) {
          message = [
            '⏰ امتحان جديد من منصة ' + brand,
            'الطالب/ة: ' + (stu.name || 'ابنك'),
            'نزل امتحان «' + String(opts.title) + '»',
            'متاح لحد: ' + fmtAr(endD),
            '',
            'افتح حساب ولي الأمر وتابع إن ابنك يحل قبل الوقت يخلص.',
            brand,
          ].join('\n')
          pushTitle = '⏰ امتحان جديد — ' + brand
          pushBody = 'نزل امتحان «' + String(opts.title) + '» على ' + (stu.name || 'ابنك') + ' — متاح لحد ' + fmtAr(endD)
        } else {
          message = [
            '📝 امتحان جديد من منصة ' + brand,
            'الطالب/ة: ' + (stu.name || 'ابنك'),
            'نزل امتحان «' + String(opts.title) + '»',
            '',
            'يا ريت ابنك يدخل يحله في أقرب وقت — تقدر تتابع من حساب ولي الأمر.',
            brand,
          ].join('\n')
          pushTitle = '📝 امتحان جديد — ' + brand
          pushBody = 'نزل امتحان «' + String(opts.title) + '» على ' + (stu.name || 'ابنك') + ' — يا ريت يحله في أقرب وقت'
        }
      } else {
        message = [
          '📚 واجب جديد من منصة ' + brand,
          'الطالب/ة: ' + (stu.name || 'ابنك'),
          'نزل واجب «' + String(opts.title) + '»',
          '',
          'يا ريت ابنك يدخل يحله ويسلّمه في أقرب وقت — تقدر تتابع من حساب ولي الأمر.',
          brand,
        ].join('\n')
        pushTitle = '📚 واجب جديد — ' + brand
        pushBody = 'نزل واجب «' + String(opts.title) + '» على ' + (stu.name || 'ابنك') + ' — يا ريت يحله ويسلّمه'
      }
      var payload = { title: pushTitle, body: pushBody, url: '/#parent-login', tag: 'asg-posted-' + opts.kind, icon: icon }
      for (var t = 0; t < targets.length; t++) {
        await writeParentNotice(targets[t], stu.name, message, payload)
      }
    }

    /* (و97-إصلاح) تسجيل المفتاح بعد إتمام الكتابة — الإشعار مضمون */
    await markSweep(key)
  } catch (e) {
    console.error('[assignment-notify] posted notify failed (ignored):', e)
  }
}

/* ============================================================
   (2) الـ sweep — القلب النابض: بيمشي على آخر 14 يوم من الواجبات
   والامتحانات ويولد إشعارات التحذير/التأخير الناقصة (مع منع تكرار)
   بيتنادى بشكل خامل من إشعارات ولي الأمر + إشعارات الطالب + من
   /api/notify-sweep — معدل محدود مرة كل 45 ثانية لكل process
   ============================================================ */
var _lastSweepAt = 0
var _sweeping = false
/* (و97) ميزانية أمان — أول تشغيل على قاعدة بيانات قديمة ممنوع يغرق
   أولياء الأمور بمئات الإشعارات في ثانية ولا يضرب timeout الفانكشن:
   الماسح بيمشي على 3 عناصر كحد أقصى في التشغيلة الواحدة (الأقدم أولًا)
   وبحد أقصى 120 إشعار — والتشغيلات الجاية بتكمّل بالتدريج (45 ثانية
   بين كل تشغيل + المفاتيح بتمنع التكرار) */
var SWEEP_MAX_ITEMS = 3
var SWEEP_MAX_NOTIFS = 120
export async function sweepAssignmentNotifications(opts?: { force?: boolean }): Promise<{ posted: number; due24: number; overdue: number; skipped: boolean; budgetReached?: boolean }> {
  var out = { posted: 0, due24: 0, overdue: 0, skipped: false, budgetReached: false }
  try {
    var now = Date.now()
    if (!opts || !opts.force) {
      if (_sweeping || now - _lastSweepAt < 45000) { out.skipped = true; return out }
    }
    _sweeping = true
    _lastSweepAt = now
    await ensureAssignmentTables()

    var notifs = 0
    var budgetHit = function (): boolean {
      if (notifs >= SWEEP_MAX_NOTIFS) { out.budgetReached = true; return true }
      return false
    }

    var icon = '/push-icon.png'
    try { icon = await resolveParentPushIcon() } catch (eI) {}
    var brand = await platformName()
    var since = new Date(now - 14 * 24 * 3600 * 1000).toISOString()

    /* الأعمدة الاختيارية — endsAt ممكن ما يكونش موجود في بعض النسخ */
    var examHasEndsAt = false
    var examHasScheduled = false
    var hwHasScheduled = false
    var examHasTarget = false
    var hwHasTarget = false
    try {
      var ec: any = await db.$queryRawUnsafe('PRAGMA table_info(Exam)')
      var eNames: string[] = (ec || []).map(function (c: any) { return String(c && c.name || '') })
      examHasEndsAt = eNames.indexOf('endsAt') !== -1
      examHasScheduled = eNames.indexOf('scheduledAt') !== -1
      examHasTarget = eNames.indexOf('targetStudentIds') !== -1
    } catch (e) {}
    try {
      var hc: any = await db.$queryRawUnsafe('PRAGMA table_info(Homework)')
      var hNames: string[] = (hc || []).map(function (c: any) { return String(c && c.name || '') })
      hwHasScheduled = hNames.indexOf('scheduledAt') !== -1
      hwHasTarget = hNames.indexOf('targetStudentIds') !== -1
    } catch (e) {}

    var items: any[] = []
    try {
      var eSel = 'id, title, grade, createdAt' + (examHasEndsAt ? ', endsAt' : '') + (examHasScheduled ? ', scheduledAt' : '') + (examHasTarget ? ', targetStudentIds, targetGroupIds' : '')
      var eRows: any = await db.$queryRawUnsafe('SELECT ' + eSel + ' FROM Exam WHERE createdAt >= ?', since)
      for (var ei = 0; ei < (eRows || []).length; ei++) items.push(Object.assign({ kind: 'exam' }, eRows[ei]))
    } catch (eE) { console.error('[assignment-notify] exam sweep query failed (ignored):', eE) }
    try {
      var hSel = 'id, title, grade, createdAt' + (hwHasScheduled ? ', scheduledAt' : '') + (hwHasTarget ? ', targetStudentIds, targetGroupIds' : '')
      var hRows: any = await db.$queryRawUnsafe('SELECT ' + hSel + ' FROM Homework WHERE createdAt >= ?', since)
      for (var hi = 0; hi < (hRows || []).length; hi++) items.push(Object.assign({ kind: 'homework' }, hRows[hi]))
    } catch (eH) { console.error('[assignment-notify] homework sweep query failed (ignored):', eH) }

    /* أحدث أولًا + سقف أمان */
    /* الأقدم أولًا — الميزانية بتوزع الباك-لوج على التشغيلات بالتدريج */
    items.sort(function (a: any, b: any) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')) })
    if (items.length > 60) items = items.slice(0, 60)

    for (var k = 0; k < items.length && k < SWEEP_MAX_ITEMS; k++) {
      var it = items[k]
      if (!it || !it.id) continue
      var kind: 'exam' | 'homework' = it.kind === 'exam' ? 'exam' : 'homework'
      var label = kind === 'exam' ? 'امتحان' : 'واجب'
      var emoji = kind === 'exam' ? '📝' : '📚'
      var created = safeDate(it.createdAt)
      if (!created) continue
      var scheduled = safeDate(it.scheduledAt)
      /* مجدول وماجهش لسه → مفيش أي إشعار */
      if (scheduled && scheduled.getTime() > now) continue
      var endsAt = safeDate(it.endsAt)
      var endMs = endsAt ? endsAt.getTime() : 0

      /* --- (a) نزول جديد (آخر 24 ساعة) — شبكة أمان فوق إشعار الـ POST --- */
      if (now - created.getTime() <= 24 * 3600 * 1000) {
        var pk = 'posted:' + kind + ':' + String(it.id)
        if (!(await sweepDone(pk))) {
          await notifyAssignmentPosted({
            kind: kind, id: String(it.id), title: String(it.title || ''), grade: String(it.grade || ''),
            endsAt: it.endsAt || null,
            targetStudentIds: it.targetStudentIds || '', targetGroupIds: it.targetGroupIds || '',
          })
          out.posted++
        }
      }

      var audience = await assignmentAudience(kind, it)
      if (!audience.length) continue
      var done = await submittedSet(kind, String(it.id))

      /* --- (b) تحذير 24 ساعة قبل قفل الامتحان --- */
      if (kind === 'exam' && endMs > now && endMs - now <= 24 * 3600 * 1000) {
        for (var s1 = 0; s1 < audience.length; s1++) {
          var st1 = audience[s1]
          if (done.has(st1.id)) continue
          var k1 = 'due24:exam:' + String(it.id) + ':' + st1.id
          if (await sweepDone(k1)) continue
          var msg1 = [
            '⚠️ تحذير من منصة ' + brand,
            'الطالب/ة: ' + (st1.name || 'ابنك'),
            'امتحان «' + String(it.title) + '» فاضل عليه أقل من 24 ساعة',
            'الوقت بيخلص: ' + fmtAr(endsAt as Date),
            '',
            'ابنك لسه ما حلهوش — افتح المنصة يحل بسرعة قبل الوقت يخلص.',
            brand,
          ].join('\n')
          var pay1 = {
            title: '⚠️ امتحان فاضل عليه 24 ساعة — ' + brand,
            body: 'امتحان «' + String(it.title) + '» فاضل عليه أقل من 24 ساعة و' + (st1.name || 'ابنك') + ' ما حلهوش — يلا يدخل يحل بسرعة',
            url: '/#parent-login', tag: 'asg-due24-exam', icon: icon,
          }
          var t1 = await collectParentTargets(st1.id, st1.parentPhone)
          for (var x1 = 0; x1 < t1.length; x1++) await writeParentNotice(t1[x1], st1.name, msg1, pay1)
          await writeStudentNotice(st1.id, 'exam', '⚠️ امتحان «' + String(it.title) + '» فاضل عليه أقل من 24 ساعة', 'يلا ادخل وحل بسرعة قبل الوقت يخلص (' + fmtAr(endsAt as Date) + ')')
          await markSweep(k1)
          out.due24++
          notifs++
          if (budgetHit()) return out
        }
      }

      /* --- (c) الوقت خلص وما حلهوش (امتحان له endsAt عدّى) --- */
      if (kind === 'exam' && endMs > 0 && now >= endMs) {
        for (var s2 = 0; s2 < audience.length; s2++) {
          var st2 = audience[s2]
          if (done.has(st2.id)) continue
          var k2 = 'overdl:exam:' + String(it.id) + ':' + st2.id
          if (await sweepDone(k2)) continue
          var msg2 = [
            '⛔ تنبيه من منصة ' + brand,
            'الطالب/ة: ' + (st2.name || 'ابنك'),
            'وقت امتحان «' + String(it.title) + '» خلص وما حلهوش',
            'الوقت كان بيخلص: ' + fmtAr(endsAt as Date),
            '',
            'كلمني لو فيه ظرف معين — وتابع باقي الامتحانات قبل ما وقتها يخلص.',
            brand,
          ].join('\n')
          var pay2 = {
            title: '⛔ وقت الامتحان خلص — ' + brand,
            body: 'وقت امتحان «' + String(it.title) + '» خلص و' + (st2.name || 'ابنك') + ' ما حلهوش',
            url: '/#parent-login', tag: 'asg-overdl-exam', icon: icon,
          }
          var t2 = await collectParentTargets(st2.id, st2.parentPhone)
          for (var x2 = 0; x2 < t2.length; x2++) await writeParentNotice(t2[x2], st2.name, msg2, pay2)
          await writeStudentNotice(st2.id, 'exam', '⛔ وقت امتحان «' + String(it.title) + '» خلص وما حليتش', 'المرة الجاية يلا تدخل تحل قبل الوقت يخلص')
          await markSweep(k2)
          out.overdue++
          notifs++
          if (budgetHit()) return out
        }
        continue
      }

      /* --- (d) عدّى 24 ساعة على النزول وما حلهوش (من غير وقت قفل) --- */
      if (!(kind === 'exam' && endMs > 0) && now - created.getTime() >= 24 * 3600 * 1000) {
        for (var s3 = 0; s3 < audience.length; s3++) {
          var st3 = audience[s3]
          if (done.has(st3.id)) continue
          var k3 = 'over24:' + kind + ':' + String(it.id) + ':' + st3.id
          if (await sweepDone(k3)) continue
          var msg3 = [
            '⏰ تنبيه من منصة ' + brand,
            'الطالب/ة: ' + (st3.name || 'ابنك'),
            label + ' «' + String(it.title) + '» نزل من أكتر من 24 ساعة',
            'ولسه ما حلهوش لحد دلوقتي',
            '',
            'يا ريت تفتكر ابنك يدخل المنصة يحله في أقرب وقت.',
            brand,
          ].join('\n')
          var pay3 = {
            title: '⏰ ' + label + ' ما اتحلش من 24 ساعة — ' + brand,
            body: label + ' «' + String(it.title) + '» نزل من أكتر من 24 ساعة و' + (st3.name || 'ابنك') + ' ما حلهوش',
            url: '/#parent-login', tag: 'asg-over24-' + kind, icon: icon,
          }
          var t3 = await collectParentTargets(st3.id, st3.parentPhone)
          for (var x3 = 0; x3 < t3.length; x3++) await writeParentNotice(t3[x3], st3.name, msg3, pay3)
          await writeStudentNotice(st3.id, kind, emoji + ' ' + label + ' «' + String(it.title) + '» نزل من أكتر من 24 ساعة وما حليتوش', 'يلا ادخل حله دلوقتي قبل ما تتراكم عليك')
          await markSweep(k3)
          out.overdue++
          notifs++
          if (budgetHit()) return out
        }
      }
    }
    return out
  } catch (e) {
    console.error('[assignment-notify] sweep failed (ignored):', e)
    return out
  } finally {
    _sweeping = false
  }
}
