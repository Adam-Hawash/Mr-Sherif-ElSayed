// @ts-nocheck
// Shared database self-repair: full schema DDL (tables + columns + fixes).
// Used by /api/setup-db (manual) and /api/health (auto-heal when tables are
// missing) so a freshly-swapped database repairs itself instead of 500ing
// every API (the "الفديو مش شغال" outage class).
import { createClient } from '@libsql/client'

export function makeLibsqlClient() {
  var dbUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
  var authToken = process.env.TURSO_AUTH_TOKEN || process.env.DATABASE_AUTH_TOKEN || ''
  if (!dbUrl) return null
  return createClient({ url: dbUrl, authToken: authToken || undefined })
}

export var SCHEMA_TABLES = [
  'CREATE TABLE IF NOT EXISTS StudentGroup (id TEXT PRIMARY KEY, name TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS VideoGroupSchedule (id TEXT PRIMARY KEY, videoId TEXT NOT NULL, groupId TEXT NOT NULL, unlockAt DATETIME, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Admin (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, name TEXT NOT NULL DEFAULT "Admin", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Student (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT "", grade TEXT NOT NULL, status TEXT NOT NULL DEFAULT "pending", parentName TEXT NOT NULL DEFAULT "", parentPhone TEXT NOT NULL DEFAULT "", loginCount INTEGER NOT NULL DEFAULT 0, lastLogin DATETIME, isPaidAccess INTEGER NOT NULL DEFAULT 0, deviceId TEXT NOT NULL DEFAULT "", deviceFp TEXT NOT NULL DEFAULT "", deviceTraits TEXT NOT NULL DEFAULT "", creationDeviceId TEXT NOT NULL DEFAULT "", creationDeviceFp TEXT NOT NULL DEFAULT "", deviceType TEXT NOT NULL DEFAULT "", allowAllDevices INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS StudentActivity (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, action TEXT NOT NULL, details TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS Video (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", grade TEXT NOT NULL, price REAL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Homework (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", answerKeyPath TEXT DEFAULT "", answerKeyType TEXT DEFAULT "", grade TEXT NOT NULL, questions TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Exam (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", answerKeyPath TEXT DEFAULT "", answerKeyType TEXT DEFAULT "", grade TEXT NOT NULL, questions TEXT DEFAULT "", passScore REAL DEFAULT 50, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS ExamResult (id TEXT PRIMARY KEY, examId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, submittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, answers TEXT DEFAULT \'\', writingGrades TEXT DEFAULT \'\', FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE, FOREIGN KEY (examId) REFERENCES Exam(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS Announcement (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", grade TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Discussion (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT NOT NULL, grade TEXT NOT NULL, content TEXT NOT NULL, isAdminReply INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS SiteConfig (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT DEFAULT "", updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Media (id TEXT PRIMARY KEY, filename TEXT NOT NULL, filePath TEXT NOT NULL, fileType TEXT NOT NULL, fileSize TEXT DEFAULT "", data TEXT DEFAULT "", category TEXT DEFAULT "general", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS VideoProgress (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, videoId TEXT NOT NULL, watchedSeconds REAL DEFAULT 0, totalSeconds REAL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, lastWatchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(studentId, videoId))',
  'CREATE TABLE IF NOT EXISTS GalleryImage (id TEXT PRIMARY KEY, title TEXT DEFAULT "", filePath TEXT DEFAULT "", type TEXT DEFAULT "image", videoUrl TEXT DEFAULT "", sortOrder INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Payment (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT DEFAULT "", studentPhone TEXT DEFAULT "", studentGrade TEXT DEFAULT "", method TEXT DEFAULT "", amount REAL DEFAULT 0, videoId TEXT DEFAULT "", videoTitle TEXT DEFAULT "", receiptPath TEXT DEFAULT "", receiptType TEXT DEFAULT "", status TEXT NOT NULL DEFAULT "pending", note TEXT DEFAULT "", reviewedAt DATETIME, reviewedBy TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS VideoAccess (id TEXT PRIMARY KEY, videoId TEXT NOT NULL, studentId TEXT NOT NULL, grantedBy TEXT NOT NULL DEFAULT "admin", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(videoId, studentId))',
  'CREATE TABLE IF NOT EXISTS PlayTicket (id TEXT PRIMARY KEY, videoId TEXT NOT NULL, studentId TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt DATETIME NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)',
  'CREATE TABLE IF NOT EXISTS Complaint (id TEXT PRIMARY KEY, studentId TEXT DEFAULT "", studentName TEXT DEFAULT "", phone TEXT DEFAULT "", grade TEXT DEFAULT "", message TEXT NOT NULL, summary TEXT DEFAULT "", source TEXT NOT NULL DEFAULT "student", status TEXT NOT NULL DEFAULT "new", reply TEXT DEFAULT "", reviewedAt DATETIME, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
]

var SCHEMA_COLUMNS = [
  ['Student', 'password', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'isPaidAccess', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Student', 'parentName', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'parentPhone', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'deviceId', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'deviceFp', 'TEXT', "NOT NULL DEFAULT ''"],
  // مكوّنات الجهاز الخام (JSON) — للمطابقة الذكية عند تعرّف نفس الجهاز
  ['Student', 'deviceTraits', 'TEXT', "NOT NULL DEFAULT ''"],
  // جهاز إنشاء الحساب — ثابت: بيتكتب وقت التسجيل بس والدخول بيتحقق ضده حصريًا
  ['Student', 'creationDeviceId', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'creationDeviceFp', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'deviceType', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'allowAllDevices', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Video', 'price', 'REAL', 'DEFAULT 0'],
  ['Video', 'fileType', 'TEXT', "DEFAULT ''"],
  ['Video', 'thumbnail', 'TEXT', "DEFAULT ''"],
  // nativeEmbed (كود HTML embed) اتلغت 2026-و4 بطلب المستر — العمود مش بيتضاف في قواعد جديدة
  ['Homework', 'questions', 'TEXT', "DEFAULT ''"],
  ['Homework', 'answerKeyPath', 'TEXT', "DEFAULT ''"],
  ['Homework', 'answerKeyType', 'TEXT', "DEFAULT ''"],
  ['Homework', 'thumbnail', 'TEXT', "DEFAULT ''"],
  ['Homework', 'fileType', 'TEXT', "DEFAULT ''"],
  ['Homework', 'content', 'TEXT', "DEFAULT ''"],
  ['Exam', 'questions', 'TEXT', "DEFAULT ''"],
  ['Exam', 'answerKeyPath', 'TEXT', "DEFAULT ''"],
  ['Exam', 'answerKeyType', 'TEXT', "DEFAULT ''"],
  ['Exam', 'thumbnail', 'TEXT', "DEFAULT ''"],
  ['Exam', 'fileType', 'TEXT', "DEFAULT ''"],
  ['Exam', 'content', 'TEXT', "DEFAULT ''"],
  // نماذج الامتحان العشوائية (JSON array) — كل طالب بيشوف نموذج واحد عشوائي
  ['Exam', 'models', 'TEXT', "DEFAULT ''"],
  // طريقة التوزيع (2026-و): random = عشوائي ثابت لكل طالب | fixed = نموذج واحد للكل
  ['Exam', 'modelMode', 'TEXT', "DEFAULT 'random'"],
  ['Exam', 'fixedModel', 'TEXT', "DEFAULT ''"],
  ['Exam', 'passScore', 'REAL', 'DEFAULT 50'],
  ['ExamResult', 'score', 'REAL', 'DEFAULT 0'],
  ['ExamResult', 'maxScore', 'REAL', 'DEFAULT 100'],
  ['ExamResult', 'answers', 'TEXT', "DEFAULT ''"],
  ['ExamResult', 'writingGrades', 'TEXT', "DEFAULT ''"],
  ['Announcement', 'content', 'TEXT', "DEFAULT ''"],
  ['Discussion', 'likes', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Discussion', 'isAdminReply', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Media', 'data', 'TEXT', "DEFAULT ''"],
  ['Media', 'category', 'TEXT', "DEFAULT 'general'"],
  ['Media', 'fileSize', 'TEXT', "DEFAULT ''"],
  ['GalleryImage', 'type', 'TEXT', "DEFAULT 'image'"],
  ['GalleryImage', 'videoUrl', 'TEXT', "DEFAULT ''"],
  ['GalleryImage', 'sortOrder', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Payment', 'studentPhone', 'TEXT', "DEFAULT ''"],
  ['Payment', 'studentGrade', 'TEXT', "DEFAULT ''"],
  ['Payment', 'method', 'TEXT', "DEFAULT ''"],
  ['Payment', 'receiptType', 'TEXT', "DEFAULT ''"],
  ['Payment', 'note', 'TEXT', "DEFAULT ''"],
  ['Payment', 'reviewedAt', 'DATETIME', ''],
  ['Payment', 'reviewedBy', 'TEXT', "DEFAULT ''"],
  // (2026-و29) نظام المجموعات — عمود مجموعة الطالب + استهداف المجموعات للامتحانات والواجبات
  ['Student', 'groupId', 'TEXT', "DEFAULT ''"],
  ['Exam', 'targetGroupIds', 'TEXT', "DEFAULT ''"],
  ['Homework', 'targetGroupIds', 'TEXT', "DEFAULT ''"],
]

var SCHEMA_FIXES = [
  'UPDATE Student SET password = \'\' WHERE password IS NULL',
  'UPDATE Student SET isPaidAccess = 0 WHERE isPaidAccess IS NULL',
  'UPDATE Student SET deviceId = \'\' WHERE deviceId IS NULL',
  'UPDATE Student SET deviceFp = \'\' WHERE deviceFp IS NULL',
  'UPDATE Student SET creationDeviceId = \'\' WHERE creationDeviceId IS NULL',
  'UPDATE Student SET creationDeviceFp = \'\' WHERE creationDeviceFp IS NULL',
  'UPDATE Student SET deviceTraits = \'\' WHERE deviceTraits IS NULL',
  'UPDATE Student SET deviceType = \'\' WHERE deviceType IS NULL',
  // ===== ترحيل اسم المنصة بالإنجليزي (لمرة واحدة — idempotent) =====
  // المستر طلب اسم "Mr. Sherif ElSayed" بالإنجليزي في كل أماكن الهوية —
  // الترحيل ده يصحح القيم المخزنة في SiteConfig من النشر الأول بدون ما يلمس
  // أي قيمة الأدمن كتبها بعدها بمفتاح تاني.
  "UPDATE SiteConfig SET value = 'Mr. Sherif ElSayed' WHERE key IN ('navbar_brand', 'hero_title_line1', 'footer_brand', 'schedule_brand', 'instructor_name_en') AND (value LIKE '%مستر شريف%' OR value LIKE '%منصة مستر%' OR value = 'MR. Sherif ElSayed')",
  "UPDATE SiteConfig SET value = 'جميع الحقوق محفوظة — Mr. Sherif ElSayed' WHERE key = 'footer_copyright' AND (value LIKE '%مستر شريف%' OR value LIKE '%منصة مستر%')",
  // ===== ترحيل لمرة واحدة (idempotent) =====
  // الحسابات الموجودة اللي ملهاش ربط إنشاء: نثبّت الربط الحالي كـ"جهاز إنشاء"
  // عشان مفيش حساب يتحجب فجأة بعد الترقية. الربط ده بعدها **ثابت** — أي جهاز
  // غريب بيتمنع، والمستر يقدر يعمل "فك الربط" من لوحة التحكم لأي طالب.
  // مستثنى: القيم القديمة الفاشلة (null/undefined/dev_null/none) — الحسابات دي
  // هتتربط بأول جهاز يدخل بيه زي قبل بالظبط.
  "UPDATE Student SET creationDeviceId = deviceId, creationDeviceFp = deviceFp WHERE (creationDeviceId IS NULL OR creationDeviceId = '') AND ((deviceId IS NOT NULL AND deviceId != '' AND deviceId NOT IN ('null','undefined','dev_null','none')) OR (deviceFp IS NOT NULL AND deviceFp != '' AND deviceFp NOT IN ('null','undefined')))",
  'UPDATE Student SET allowAllDevices = 0 WHERE allowAllDevices IS NULL',
  'UPDATE Video SET price = 0 WHERE price IS NULL',
  'UPDATE Exam SET passScore = 50 WHERE passScore IS NULL',
  'UPDATE ExamResult SET score = 0 WHERE score IS NULL',
  'UPDATE ExamResult SET maxScore = 100 WHERE maxScore IS NULL',
  'UPDATE Payment SET amount = 0 WHERE amount IS NULL',
]

/* ============================================================
 * 2026-و23 — الفهارس الناقصة (بيئة SQLite مش بتعمل فهارس تلقائية
 * للـ Foreign Keys) — لوحة «طلابي» كانت بتعمل count/groupBy على
 * StudentActivity و ExamResult بفل سكان على كل الصفوف. الفهارس دي
 * بتخلي الاستعلامات فورية مهما كبر حجم السجلات.
 * ============================================================ */
export var SCHEMA_INDEXES = [
  'CREATE INDEX IF NOT EXISTS idx_student_activity_student ON StudentActivity(studentId)',
  'CREATE INDEX IF NOT EXISTS idx_student_activity_action ON StudentActivity(studentId, action, createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_exam_result_student ON ExamResult(studentId)',
  'CREATE INDEX IF NOT EXISTS idx_exam_result_exam ON ExamResult(examId)',
  'CREATE INDEX IF NOT EXISTS idx_student_status_grade ON Student(status, grade)',
  'CREATE INDEX IF NOT EXISTS idx_hw_result_student ON HomeworkResult(studentId)',
  'CREATE INDEX IF NOT EXISTS idx_video_progress_student ON VideoProgress(studentId)',
  'CREATE INDEX IF NOT EXISTS idx_student_created ON Student(createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_activity_created ON StudentActivity(createdAt)',
  'CREATE INDEX IF NOT EXISTS idx_student_group ON Student(groupId)',
  'CREATE INDEX IF NOT EXISTS idx_vgs_video ON VideoGroupSchedule(videoId)',
  'CREATE INDEX IF NOT EXISTS idx_vgs_group ON VideoGroupSchedule(groupId)',
]

export var CORE_TABLES = ['Admin', 'Student', 'StudentActivity', 'Video', 'Homework', 'Exam', 'ExamResult', 'Announcement', 'Discussion', 'SiteConfig', 'Media', 'VideoProgress', 'GalleryImage', 'Payment', 'VideoAccess', 'Complaint']

/* ============================================================
 * 2026-و23 — **إصلاح بطء المنصة** (طلب المستر: «المنصة بطيئة، تسجيل
 * الدخول وطلابي بياخدوا وقت عقبال ما يحملوا»):
 * الجذر: كل إقلاع سيرفر (cold start على Vercel) كان بيشغّل الدورة
 * الكاملة: 48 محاولة ALTER TABLE (بتفشل كلها بـ duplicate) + ~21
 * UPDATE — يعني ~70 استعلام متسلسل على Turso بيضيفوا 2-4 ثواني على
 * أول طلب بعد كل إقلاع. الحل: بصمة (هاش) لبنية الجداول والأعمدة
 * والفهارس متخزنة في SiteConfig — لو البصمة مطابقة → تخطي كل حاجة
 * (استعلام واحد بس)، ولو اتغيرت البنية مستقبلًا → البصمة تتغير
 * والترميم بيشغّل لوحده من غير صيانة يدوية.
 * ============================================================ */
import { createHash } from 'crypto'

var SCHEMA_HASH_KEY = 'schema_heal_hash'

/* ============================================================
 * 2026-و30 — تسريع أول دخول (طلب المستر: «لما يجي يدخل الطفل الأولاني
 * بيقعد وقت... لو تقدر سرعه»):
 * (1) الترميم الكامل كان ~80 استعلام متسلسل على Turso (كل واحد =
 *     roundtrip شبكة) = 10-14 ثانية على أول طلب بعد كل نشر — بقوا
 *     **متوازيين** على دفعات = ~2 ثانية.
 * (2) ميمو على مستوى الموديول: بعد أول نجاح في نفس الـ instance
 *     مفيش حتى استعلام البصمة — الدوال بترجع فورًا.
 * ============================================================ */
var _schemaVerifiedInProcess = false

function currentSchemaHash(): string {
  var joined = SCHEMA_TABLES.join('||') + '##' +
    SCHEMA_COLUMNS.map(function (c) { return c.join('.') }).join('|') + '##' +
    SCHEMA_FIXES.join('##') + '##' +
    SCHEMA_INDEXES.join('##')
  return createHash('md5').update(joined).digest('hex').substring(0, 12)
}

/* تنفيذ استعلام متسامح: بيجرب مرتين (الدفعة المتوازية ممكن تصطدم بـ
   busy لحظي) وبيتجاهل duplicate/already exists — والفشل الحقيقي
   بيتسجل في النتايج من غير ما يبوّظ الباقي */
async function execTolerant(client: any, sql: string, meta: any, results: any[]) {
  for (var attempt = 0; attempt < 2; attempt++) {
    try {
      await client.execute(sql)
      if (results) results.push(Object.assign({ ok: true }, meta))
      return
    } catch (e: any) {
      var msg = String((e && e.message) || '')
      if (msg.indexOf('duplicate') !== -1 || msg.indexOf('already exists') !== -1) return
      if (attempt === 0) { await new Promise(function (r) { setTimeout(r, 250) }); continue }
      if (results) results.push(Object.assign({ ok: false, error: msg }, meta))
    }
  }
}

export async function ensureSchema(client: any, opts?: { force?: boolean }) {
  var force = !!(opts && opts.force)
  var results: any[] = []

  /* المسار الأسرع: الـ instance ده اتأكد من السكيما قبل كده → صفر استعلامات */
  if (!force && _schemaVerifiedInProcess) {
    return { missing: [], repaired: false, skipped: true, memo: true, results: [] }
  }

  /* المسار السريع: البصمة متخزنة ومطابقة → مفيش أي ترميم محتاج
     (استعلام واحد بدل ~70 — ده اللي هيخلي الدخول ولوحة الطلاب فورًا) */
  if (!force) {
    try {
      var flagRes = await client.execute({
        sql: 'SELECT value FROM SiteConfig WHERE key = ? LIMIT 1',
        args: [SCHEMA_HASH_KEY],
      })
      var stored = flagRes && flagRes.rows && flagRes.rows.length > 0 ? String(flagRes.rows[0].value || '') : ''
      if (stored && stored === currentSchemaHash()) {
        _schemaVerifiedInProcess = true
        return { missing: [], repaired: false, skipped: true, results: [] }
      }
    } catch (e) {
      // لو الجدول نفسه مش موجود (قاعدة جديدة) → الدورة الكاملة تحت
    }
  }

  // Which core tables already exist?
  var existing: string[] = []
  try {
    var res = await client.execute("SELECT name FROM sqlite_master WHERE type='table'")
    for (var i = 0; i < res.rows.length; i++) existing.push(String(res.rows[i].name))
  } catch (e) {}

  var missing = CORE_TABLES.filter(function (t) { return existing.indexOf(t) === -1 })

  // Only run DDL when something is actually missing (or when forced by explicit setup)
  var tablesToRun = (missing.length > 0 || force) ? SCHEMA_TABLES : []
  // (2026-و30) الجداول متوازية — مستقلة عن بعض (IF NOT EXISTS)
  await Promise.all(tablesToRun.map(function (sql) {
    var name = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1]
    return execTolerant(client, sql, { table: name }, results)
  }))

  // Columns (tolerant of duplicates) — (2026-و30) على دفعات متوازية بدل تسلسلي
  var CHUNK = 8
  for (var k = 0; k < SCHEMA_COLUMNS.length; k += CHUNK) {
    await Promise.all(SCHEMA_COLUMNS.slice(k, k + CHUNK).map(function (c) {
      var sql = 'ALTER TABLE ' + c[0] + ' ADD COLUMN ' + c[1] + ' ' + c[2] + ' ' + c[3]
      return execTolerant(client, sql, { table: c[0], column: c[1] }, results)
    }))
  }

  // NULL fixes — (2026-و30) متوازية (كلها idempotent)
  await Promise.all(SCHEMA_FIXES.map(function (sql) {
    return client.execute(sql).catch(function () {})
  }))

  // Indexes (idempotent — CREATE INDEX IF NOT EXISTS) — متوازية
  await Promise.all(SCHEMA_INDEXES.map(function (sql) {
    return execTolerant(client, sql, { index: sql }, results)
  }))

  _schemaVerifiedInProcess = true

  // تخزين بصمة البنية — الإقلاعات الجاية بتتخطى الترميم كله
  try {
    var hash = currentSchemaHash()
    try {
      await client.execute({ sql: 'UPDATE SiteConfig SET value = ?, updatedAt = CURRENT_TIMESTAMP WHERE key = ?', args: [hash, SCHEMA_HASH_KEY] })
    } catch (uErr) {
      try {
        await client.execute({ sql: 'INSERT INTO SiteConfig (id, key, value) VALUES (?, ?, ?)', args: ['sch' + hash + Date.now().toString(36), SCHEMA_HASH_KEY, hash] })
      } catch (iErr) {}
    }
  } catch (hErr) {}

  return { missing, repaired: missing.length > 0, results }
}
