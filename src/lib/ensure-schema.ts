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
  'CREATE TABLE IF NOT EXISTS Admin (id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password TEXT NOT NULL, name TEXT NOT NULL DEFAULT "Admin", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Student (id TEXT PRIMARY KEY, name TEXT NOT NULL, phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT "", grade TEXT NOT NULL, status TEXT NOT NULL DEFAULT "pending", parentName TEXT NOT NULL DEFAULT "", parentPhone TEXT NOT NULL DEFAULT "", loginCount INTEGER NOT NULL DEFAULT 0, lastLogin DATETIME, isPaidAccess INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS StudentActivity (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, action TEXT NOT NULL, details TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS Video (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", grade TEXT NOT NULL, price REAL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Homework (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", answerKeyPath TEXT DEFAULT "", answerKeyType TEXT DEFAULT "", grade TEXT NOT NULL, questions TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Exam (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", answerKeyPath TEXT DEFAULT "", answerKeyType TEXT DEFAULT "", grade TEXT NOT NULL, questions TEXT DEFAULT "", passScore REAL DEFAULT 50, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS ExamResult (id TEXT PRIMARY KEY, examId TEXT NOT NULL, studentId TEXT NOT NULL, score REAL DEFAULT 0, maxScore REAL DEFAULT 100, submittedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE, FOREIGN KEY (examId) REFERENCES Exam(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS Announcement (id TEXT PRIMARY KEY, title TEXT NOT NULL, content TEXT NOT NULL DEFAULT "", grade TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Discussion (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT NOT NULL, grade TEXT NOT NULL, content TEXT NOT NULL, isAdminReply INTEGER NOT NULL DEFAULT 0, likes INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS SiteConfig (id TEXT PRIMARY KEY, key TEXT NOT NULL UNIQUE, value TEXT DEFAULT "", updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Media (id TEXT PRIMARY KEY, filename TEXT NOT NULL, filePath TEXT NOT NULL, fileType TEXT NOT NULL, fileSize TEXT DEFAULT "", data TEXT DEFAULT "", category TEXT DEFAULT "general", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS VideoProgress (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, videoId TEXT NOT NULL, watchedSeconds REAL DEFAULT 0, totalSeconds REAL DEFAULT 0, completed INTEGER NOT NULL DEFAULT 0, lastWatchedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(studentId, videoId))',
  'CREATE TABLE IF NOT EXISTS GalleryImage (id TEXT PRIMARY KEY, title TEXT DEFAULT "", filePath TEXT DEFAULT "", type TEXT DEFAULT "image", videoUrl TEXT DEFAULT "", sortOrder INTEGER NOT NULL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
  'CREATE TABLE IF NOT EXISTS Payment (id TEXT PRIMARY KEY, studentId TEXT NOT NULL, studentName TEXT DEFAULT "", studentPhone TEXT DEFAULT "", studentGrade TEXT DEFAULT "", method TEXT DEFAULT "", amount REAL DEFAULT 0, videoId TEXT DEFAULT "", videoTitle TEXT DEFAULT "", receiptPath TEXT DEFAULT "", receiptType TEXT DEFAULT "", status TEXT NOT NULL DEFAULT "pending", note TEXT DEFAULT "", reviewedAt DATETIME, reviewedBy TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, FOREIGN KEY (studentId) REFERENCES Student(id) ON DELETE CASCADE)',
  'CREATE TABLE IF NOT EXISTS VideoAccess (id TEXT PRIMARY KEY, videoId TEXT NOT NULL, studentId TEXT NOT NULL, grantedBy TEXT NOT NULL DEFAULT "admin", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(videoId, studentId))',
]

var SCHEMA_COLUMNS = [
  ['Student', 'password', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'isPaidAccess', 'INTEGER', 'NOT NULL DEFAULT 0'],
  ['Student', 'parentName', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Student', 'parentPhone', 'TEXT', "NOT NULL DEFAULT ''"],
  ['Video', 'price', 'REAL', 'DEFAULT 0'],
  ['Video', 'fileType', 'TEXT', "DEFAULT ''"],
  ['Video', 'thumbnail', 'TEXT', "DEFAULT ''"],
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
  ['Exam', 'passScore', 'REAL', 'DEFAULT 50'],
  ['ExamResult', 'score', 'REAL', 'DEFAULT 0'],
  ['ExamResult', 'maxScore', 'REAL', 'DEFAULT 100'],
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
]

var SCHEMA_FIXES = [
  'UPDATE Student SET password = \'\' WHERE password IS NULL',
  'UPDATE Student SET isPaidAccess = 0 WHERE isPaidAccess IS NULL',
  'UPDATE Video SET price = 0 WHERE price IS NULL',
  'UPDATE Exam SET passScore = 50 WHERE passScore IS NULL',
  'UPDATE ExamResult SET score = 0 WHERE score IS NULL',
  'UPDATE ExamResult SET maxScore = 100 WHERE maxScore IS NULL',
  'UPDATE Payment SET amount = 0 WHERE amount IS NULL',
]

export var CORE_TABLES = ['Admin', 'Student', 'StudentActivity', 'Video', 'Homework', 'Exam', 'ExamResult', 'Announcement', 'Discussion', 'SiteConfig', 'Media', 'VideoProgress', 'GalleryImage', 'Payment', 'VideoAccess']

/* Returns { missing: string[], repaired: boolean, results: any[] } */
export async function ensureSchema(client: any, opts?: { force?: boolean }) {
  var force = !!(opts && opts.force)
  var results: any[] = []

  // Which core tables already exist?
  var existing: string[] = []
  try {
    var res = await client.execute("SELECT name FROM sqlite_master WHERE type='table'")
    for (var i = 0; i < res.rows.length; i++) existing.push(String(res.rows[i].name))
  } catch (e) {}

  var missing = CORE_TABLES.filter(function (t) { return existing.indexOf(t) === -1 })

  // Only run DDL when something is actually missing (or when forced by explicit setup)
  var tablesToRun = (missing.length > 0 || force) ? SCHEMA_TABLES : []
  for (var j = 0; j < tablesToRun.length; j++) {
    try { await client.execute(tablesToRun[j]); results.push({ table: tablesToRun[j].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1], ok: true }) }
    catch (e: any) { results.push({ table: tablesToRun[j].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1], ok: false, error: e.message }) }
  }

  // Columns (tolerant of duplicates)
  for (var k = 0; k < SCHEMA_COLUMNS.length; k++) {
    var c = SCHEMA_COLUMNS[k]
    try {
      await client.execute('ALTER TABLE ' + c[0] + ' ADD COLUMN ' + c[1] + ' ' + c[2] + ' ' + c[3])
      results.push({ table: c[0], column: c[1], ok: true })
    } catch (e: any) {
      var msg = String(e && e.message) || ''
      if (msg.indexOf('duplicate') === -1 && msg.indexOf('already exists') === -1) {
        results.push({ table: c[0], column: c[1], ok: false, error: msg })
      }
    }
  }

  // NULL fixes
  for (var m = 0; m < SCHEMA_FIXES.length; m++) {
    try { await client.execute(SCHEMA_FIXES[m]) } catch (e) {}
  }

  return { missing, repaired: missing.length > 0, results }
}
