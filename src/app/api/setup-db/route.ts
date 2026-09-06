import { NextResponse } from 'next/server'
import { createClient } from '@libsql/client'

export async function GET() {
  try {
    var dbUrl = process.env.TURSO_DATABASE_URL || process.env.DATABASE_URL || ''
    var authToken = process.env.TURSO_AUTH_TOKEN || ''
    if (!dbUrl) return NextResponse.json({ ok: false, error: 'DATABASE_URL not set' }, { status: 500 })
    var client = createClient({ url: dbUrl, authToken: authToken || undefined })
    var results: any[] = []

    var addColumn = async function(table: string, col: string, type: string, def: string) {
      try {
        await client.execute('ALTER TABLE ' + table + ' ADD COLUMN ' + col + ' ' + type + ' ' + def)
        results.push({ table, column: col, ok: true })
      } catch (e: any) {
        if (e.message && (e.message.indexOf('duplicate') !== -1 || e.message.indexOf('already exists') !== -1)) {
          results.push({ table, column: col, ok: true, note: 'exists' })
        } else {
          results.push({ table, column: col, ok: false, error: e.message })
        }
      }
    }

    // Create tables
    var tables = [
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
    for (var i = 0; i < tables.length; i++) {
      try { await client.execute(tables[i]); results.push({ table: tables[i].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1], ok: true }) }
      catch (e: any) { results.push({ table: tables[i].match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1], ok: false, error: e.message }) }
    }

    // ALL missing columns for ALL tables
    await addColumn('Student', 'password', 'TEXT', "NOT NULL DEFAULT ''")
    await addColumn('Student', 'isPaidAccess', 'INTEGER', 'NOT NULL DEFAULT 0')
    await addColumn('Student', 'parentName', 'TEXT', "NOT NULL DEFAULT ''")
    await addColumn('Student', 'parentPhone', 'TEXT', "NOT NULL DEFAULT ''")
    await addColumn('Video', 'price', 'REAL', 'DEFAULT 0')
    await addColumn('Video', 'fileType', 'TEXT', "DEFAULT ''")
    await addColumn('Video', 'thumbnail', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'questions', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'answerKeyPath', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'answerKeyType', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'thumbnail', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'fileType', 'TEXT', "DEFAULT ''")
    await addColumn('Homework', 'content', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'questions', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'answerKeyPath', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'answerKeyType', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'thumbnail', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'fileType', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'content', 'TEXT', "DEFAULT ''")
    await addColumn('Exam', 'passScore', 'REAL', 'DEFAULT 50')
    await addColumn('ExamResult', 'score', 'REAL', 'DEFAULT 0')
    await addColumn('ExamResult', 'maxScore', 'REAL', 'DEFAULT 100')
    await addColumn('Announcement', 'content', 'TEXT', "DEFAULT ''")
    await addColumn('Discussion', 'likes', 'INTEGER', 'NOT NULL DEFAULT 0')
    await addColumn('Discussion', 'isAdminReply', 'INTEGER', 'NOT NULL DEFAULT 0')
    await addColumn('Media', 'data', 'TEXT', "DEFAULT ''")
    await addColumn('Media', 'category', 'TEXT', "DEFAULT 'general'")
    await addColumn('Media', 'fileSize', 'TEXT', "DEFAULT ''")
    await addColumn('GalleryImage', 'type', 'TEXT', "DEFAULT 'image'")
    await addColumn('GalleryImage', 'videoUrl', 'TEXT', "DEFAULT ''")
    await addColumn('GalleryImage', 'sortOrder', 'INTEGER', 'NOT NULL DEFAULT 0')
    await addColumn('Payment', 'studentPhone', 'TEXT', "DEFAULT ''")
    await addColumn('Payment', 'studentGrade', 'TEXT', "DEFAULT ''")
    await addColumn('Payment', 'method', 'TEXT', "DEFAULT ''")
    await addColumn('Payment', 'receiptType', 'TEXT', "DEFAULT ''")
    await addColumn('Payment', 'note', 'TEXT', "DEFAULT ''")
    await addColumn('Payment', 'reviewedAt', 'DATETIME', '')
    await addColumn('Payment', 'reviewedBy', 'TEXT', "DEFAULT ''")

    // Fix NULLs
    var fixes = [
      'UPDATE Student SET password = \'\' WHERE password IS NULL',
      'UPDATE Student SET isPaidAccess = 0 WHERE isPaidAccess IS NULL',
      'UPDATE Video SET price = 0 WHERE price IS NULL',
      'UPDATE Exam SET passScore = 50 WHERE passScore IS NULL',
      'UPDATE ExamResult SET score = 0 WHERE score IS NULL',
      'UPDATE ExamResult SET maxScore = 100 WHERE maxScore IS NULL',
      'UPDATE Payment SET amount = 0 WHERE amount IS NULL',
    ]
    for (var j = 0; j < fixes.length; j++) {
      try { await client.execute(fixes[j]); results.push({ fix: fixes[j], ok: true }) }
      catch (e: any) { results.push({ fix: fixes[j], ok: false, error: e.message }) }
    }

    await client.close()
    return NextResponse.json({ ok: true, results })
  } catch (error: any) {
    return NextResponse.json({ ok: false, error: error.message || String(error) }, { status: 500 })
  }
}

export async function POST() { return GET() }
