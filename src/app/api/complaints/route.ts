// @ts-nocheck
// ============================================================
// صفحة الشكاوي — API
//  POST /api/complaints        → الطالب (أو المساعد الذكي) يسجل شكوى
//  GET  /api/complaints        → قائمة الشكاوى
//       ?studentId=...         → شكاوى طالب معين (الطالب في بوابته)
//       ?status=new|resolved   → فلتر للأدمن
//  PATCH /api/complaints/[id]  → الأدمن: تم الحل / رد / رجوع للجديد
// ملاحظة: الشكاوى تظهر للطالب **بس** اللي كتبها، وللأدمن كلها.
// ============================================================
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export var maxDuration = 10

var tableEnsured = false

/* الجدول يتعمل لوحده لو مش موجود — زي باقي جداول المنصة بالظبط */
async function ensureComplaintTable() {
  if (tableEnsured) return
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS Complaint (
      id TEXT PRIMARY KEY,
      studentId TEXT DEFAULT '',
      studentName TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      grade TEXT DEFAULT '',
      message TEXT NOT NULL,
      summary TEXT DEFAULT '',
      source TEXT NOT NULL DEFAULT 'student',
      status TEXT NOT NULL DEFAULT 'new',
      reply TEXT DEFAULT '',
      reviewedAt DATETIME,
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    tableEnsured = true
  } catch (e) {
    console.error('[Complaints] ensure table failed:', String((e && e.message) || e))
  }
}

function cleanText(v: any, max: number): string {
  return String(v == null ? '' : v).trim().slice(0, max)
}

export async function POST(request: Request) {
  try {
    await ensureComplaintTable()
    var body: any = {}
    try { body = await request.json() } catch (e) {}

    var message = cleanText(body.message, 4000)
    if (message.length < 3) {
      return NextResponse.json({ error: 'اكتب المشكلة الأول (3 حروف على الأقل)' }, { status: 400 })
    }

    var studentId = cleanText(body.studentId, 64)
    var source = body.source === 'ai' ? 'ai' : 'student'
    var summary = cleanText(body.summary, 300)

    var studentName = cleanText(body.studentName, 120)
    var phone = cleanText(body.phone, 20)
    var grade = cleanText(body.grade, 30)

    // لو فيه studentId → الاسم والتليفون بيتجيبوا من قاعدة البيانات نفسها
    // (مش من الطلب) عشان مفيش حد يبعت شكوى باسم حد تاني.
    if (studentId) {
      try {
        var rows = await db.$queryRawUnsafe(
          'SELECT id, name, phone, grade FROM Student WHERE id = ? LIMIT 1',
          studentId
        )
        if (rows && rows.length > 0) {
          studentName = String(rows[0].name || studentName)
          phone = String(rows[0].phone || phone)
          grade = String(rows[0].grade || grade)
        }
      } catch (e) {}
    }

    if (!studentName && !phone) {
      return NextResponse.json({ error: 'لازم تكون مسجل دخول عشان تبعت شكوى' }, { status: 401 })
    }

    // حد بسيط من الـ spam: أقصى 8 شكاوى للطالب في اليوم
    if (studentId) {
      try {
        var cnt = await db.$queryRawUnsafe(
          "SELECT COUNT(*) as c FROM Complaint WHERE studentId = ? AND createdAt >= datetime('now', '-1 day')",
          studentId
        )
        if (cnt && cnt[0] && Number(cnt[0].c) >= 8) {
          return NextResponse.json({ error: 'بعت شكاوى كتير النهاردة — المستر هشوفها كلها بإذن الله 🙏' }, { status: 429 })
        }
      } catch (e) {}
    }

    var id = 'cmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await safeWrite(function () {
      return db.$executeRawUnsafe(
        `INSERT INTO Complaint (id, studentId, studentName, phone, grade, message, summary, source, status, reply, createdAt, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
        id, studentId, studentName, phone, grade, message, summary, source
      )
    })

    var created = (await db.$queryRawUnsafe('SELECT * FROM Complaint WHERE id = ? LIMIT 1', id)) || []
    return NextResponse.json({ message: 'وصلت شكواك للمستر ✅', complaint: created[0] || null }, { status: 201 })
  } catch (error) {
    console.error('[Complaints] POST error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة في السيرفر — جرب تاني' }, { status: 500 })
  }
}

export async function GET(request: Request) {
  try {
    await ensureComplaintTable()
    var url = new URL(request.url)
    var studentId = cleanText(url.searchParams.get('studentId'), 64)
    var status = cleanText(url.searchParams.get('status'), 20)

    var rows: any[] = []
    if (studentId) {
      // الطالب يشوف شكاواه هو بس
      rows = (await db.$queryRawUnsafe(
        'SELECT * FROM Complaint WHERE studentId = ? ORDER BY createdAt DESC LIMIT 50',
        studentId
      )) || []
    } else {
      // الأدمن يشوف الكل
      if (status === 'new' || status === 'resolved') {
        rows = (await db.$queryRawUnsafe(
          'SELECT * FROM Complaint WHERE status = ? ORDER BY createdAt DESC LIMIT 300',
          status
        )) || []
      } else {
        rows = (await db.$queryRawUnsafe('SELECT * FROM Complaint ORDER BY createdAt DESC LIMIT 300')) || []
      }
    }

    var newCount = rows.filter(function (r) { return r.status === 'new' }).length
    return NextResponse.json({ complaints: rows, newCount: newCount })
  } catch (error) {
    console.error('[Complaints] GET error:', error)
    return NextResponse.json({ complaints: [], newCount: 0, error: 'حصلت مشكلة في السيرفر' }, { status: 500 })
  }
}
