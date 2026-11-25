// @ts-nocheck
// FILE: src/app/api/daily-info/route.ts
// (ر22) معلومة اليوم / حكمة اليوم — طلب المستر حرفيًا:
//   «عايز كارت المعلومات يظهر في الصفحة الرئيسية تظهر لكل الطلاب حتى اللي
//    مش مسجلين معانا وتفضل ثابتة معاه حتى لما يعمل لوج ان — تتقفل لما
//    يدوس بس على حرف الـ X — ما يكونش بوقت»
//   • GET (بدون باراماترات)       → الوضع العام: معلومة النهاردة للكل بلا تسجيل
//                                    دخول — ولو مفيش لنهاردة آخر معلومة نشطة
//                                    في آخر 7 أيام (الإخفاء بيتعمل من الجهاز
//                                    بالـ X + localStorage مش من السيرفر)
//   • GET  ?adminId=              → كل المعلومات (للوحة الأدمن) + عدد المشاهدات
//   • POST {adminId, ...}         → إضافة معلومة/حكمة ليوم محدد
//   • PUT  {adminId, id, ...}     → تعديل
//   • DELETE ?adminId=&id=        → مسح
// الجداول بتتعمل ذاتيًا (CREATE IF NOT EXISTS) — نفس نمط الشفاء الذاتي
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard-server'

var _tablesReady = false
async function ensureDailyInfoTables(): Promise<void> {
  if (_tablesReady) return
  var DDL = [
    // معلومة/حكمة اليوم — المستر بيحدد اليوم بتوقيت القاهرة (dateKey)
    'CREATE TABLE IF NOT EXISTS DailyInfo (id TEXT PRIMARY KEY, dateKey TEXT NOT NULL DEFAULT "", kind TEXT NOT NULL DEFAULT \'info\', title TEXT NOT NULL DEFAULT "", body TEXT NOT NULL DEFAULT "", mediaPath TEXT NOT NULL DEFAULT "", mediaName TEXT NOT NULL DEFAULT "", active INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    // من شافها — الطالب ما يشوفش نفس المعلومة تاني بعد الـ X أو الـ 30 ثانية
    'CREATE TABLE IF NOT EXISTS DailyInfoView (infoId TEXT NOT NULL, studentId TEXT NOT NULL, seenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(infoId, studentId))',
    'CREATE INDEX IF NOT EXISTS idx_daily_info_date ON DailyInfo(dateKey)',
  ]
  /* (ر23) الجداول بالتوازي — توفير ~٢ RTT على الإقلاع البارد عشان التحميل ما يتأخرش */
  await Promise.all(DDL.map(function (q, i) {
    return db.$executeRawUnsafe(q).catch(function (e) { console.error('[daily-info] DDL fail #' + i, e) })
  }))
  _tablesReady = true
}

function nid(): string {
  return 'di' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/** تاريخ القاهرة YYYY-MM-DD — نفس مفتاح أيام المنصة */
function cairoDateKey(d?: Date): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Cairo',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d || new Date())
  } catch (e) { return new Date().toISOString().slice(0, 10) }
}

/** تاريخ قبل N يوم (بتوقيت القاهرة) */
function cairoDaysAgo(n: number): string {
  var d = new Date()
  d.setDate(d.getDate() - n)
  return cairoDateKey(d)
}

function rowToInfo(r: any): any {
  return {
    id: String(r.id), dateKey: String(r.dateKey || ''), kind: String(r.kind || 'info'),
    title: String(r.title || ''), body: String(r.body || ''),
    mediaPath: String(r.mediaPath || ''), mediaName: String(r.mediaName || ''),
    active: Number(r.active) === 1, createdAt: String(r.createdAt || ''),
  }
}

export async function GET(req: NextRequest) {
  try {
    var sp = new URL(req.url).searchParams
    var adminId = sp.get('adminId') || ''
    await ensureDailyInfoTables()

    /* وضع الأدمن — قايمة كاملة لآخر 60 معلومة + عدد اللي شافوا كل واحدة */
    if (adminId) {
      if (!(await isAdmin(adminId))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
      var all: any = await db.$queryRawUnsafe('SELECT * FROM DailyInfo ORDER BY dateKey DESC, createdAt DESC LIMIT 60') || []
      var out: any[] = []
      for (var i = 0; i < all.length; i++) {
        var item = rowToInfo(all[i])
        try {
          var vc: any = await db.$queryRawUnsafe('SELECT COUNT(*) AS c FROM DailyInfoView WHERE infoId = ?', item.id) || []
          item.views = Number(vc[0] && vc[0].c) || 0
        } catch (e) { item.views = 0 }
        out.push(item)
      }
      return NextResponse.json({ items: out })
    }

    /* (ر22) الوضع العام — للكل بلا تسجيل دخول (زائر/طالب) بطلب المستر:
       الكارت يظهر عامة على الصفحة الرئيسية — معلومة النهاردة أولًا،
       ولو مفيش لنهاردة آخر معلومة نشطة في آخر 7 أيام.
       الإخفاء مسؤولية الجهاز (X + localStorage) مش السيرفر. */
    var today = cairoDateKey()
    var todayRows: any = await db.$queryRawUnsafe(
      'SELECT * FROM DailyInfo WHERE active = 1 AND dateKey = ? ORDER BY createdAt DESC LIMIT 1',
      today
    ) || []
    if (todayRows.length > 0) return NextResponse.json({ info: rowToInfo(todayRows[0]), today: today })
    var from = cairoDaysAgo(7)
    var rows: any = await db.$queryRawUnsafe(
      'SELECT * FROM DailyInfo WHERE active = 1 AND dateKey >= ? AND dateKey <= ? ORDER BY dateKey DESC, createdAt DESC LIMIT 1',
      from, today
    ) || []
    if (rows.length > 0) return NextResponse.json({ info: rowToInfo(rows[0]), today: today })
    return NextResponse.json({ info: null, today: today })
  } catch (error) {
    console.error('daily-info GET error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل معلومة اليوم' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await isAdmin(String(body.adminId || '')))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureDailyInfoTables()
    var nidV = nid()
    await db.$executeRawUnsafe(
      'INSERT INTO DailyInfo (id, dateKey, kind, title, body, mediaPath, mediaName, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      nidV,
      /^\d{4}-\d{2}-\d{2}$/.test(String(body.dateKey || '')) ? String(body.dateKey) : cairoDateKey(),
      String(body.kind || 'info') === 'wisdom' ? 'wisdom' : 'info',
      String(body.title || '').slice(0, 200),
      String(body.body || '').slice(0, 4000),
      String(body.mediaPath || '').slice(0, 400),
      String(body.mediaName || '').slice(0, 200),
      body.active === false ? 0 : 1
    )
    return NextResponse.json({ ok: true, id: nidV })
  } catch (error) {
    console.error('daily-info POST error:', error)
    return NextResponse.json({ error: 'خطأ في حفظ المعلومة' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await isAdmin(String(body.adminId || '')))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureDailyInfoTables()
    var id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe(
      'UPDATE DailyInfo SET dateKey = ?, kind = ?, title = ?, body = ?, mediaPath = ?, mediaName = ?, active = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      /^\d{4}-\d{2}-\d{2}$/.test(String(body.dateKey || '')) ? String(body.dateKey) : cairoDateKey(),
      String(body.kind || 'info') === 'wisdom' ? 'wisdom' : 'info',
      String(body.title || '').slice(0, 200),
      String(body.body || '').slice(0, 4000),
      String(body.mediaPath || '').slice(0, 400),
      String(body.mediaName || '').slice(0, 200),
      body.active === false ? 0 : 1,
      id
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('daily-info PUT error:', error)
    return NextResponse.json({ error: 'خطأ في تعديل المعلومة' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    var sp = new URL(req.url).searchParams
    if (!(await isAdmin(sp.get('adminId') || ''))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureDailyInfoTables()
    var id = sp.get('id') || ''
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe('DELETE FROM DailyInfo WHERE id = ?', id)
    await db.$executeRawUnsafe('DELETE FROM DailyInfoView WHERE infoId = ?', id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('daily-info DELETE error:', error)
    return NextResponse.json({ error: 'خطأ في مسح المعلومة' }, { status: 500 })
  }
}
