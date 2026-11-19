// @ts-nocheck
// FILE: src/app/api/daily-info/batch/route.ts
// (2026-ت5) حفظ دفعات «معلومة/حكمة اليوم» — طلب المستر حرفيًا:
//   «أنا عايز أنزل المعلومة أقدر أحدد عدد الأيام — مثلاً أحدد 10 أيام، 6 أيام، 7 أيام —
//    وأضيف ملف كامل فيه 7 معلومات وأقسم كل معلومة في يوم»
//   • POST {adminId, kind, items:[{dateKey, title, body}]} → معلومة واحدة لكل يوم بالترتيب
//   • التوزيع بيتحسب في اللوحة (پريفيو حي قبل الحفظ) والراوتر بيسجل نفس التوزيع بالحرف
//   • الجداول بتتعمل ذاتيًا (CREATE IF NOT EXISTS) — نفس نمط الشفاء الذاتي بتاع daily-info
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

var _tablesReady = false
async function ensureDailyInfoTables(): Promise<void> {
  if (_tablesReady) return
  var DDL = [
    'CREATE TABLE IF NOT EXISTS DailyInfo (id TEXT PRIMARY KEY, dateKey TEXT NOT NULL DEFAULT "", kind TEXT NOT NULL DEFAULT \'info\', title TEXT NOT NULL DEFAULT "", body TEXT NOT NULL DEFAULT "", mediaPath TEXT NOT NULL DEFAULT "", mediaName TEXT NOT NULL DEFAULT "", active INTEGER NOT NULL DEFAULT 1, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)',
    'CREATE TABLE IF NOT EXISTS DailyInfoView (infoId TEXT NOT NULL, studentId TEXT NOT NULL, seenAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY(infoId, studentId))',
    'CREATE INDEX IF NOT EXISTS idx_daily_info_date ON DailyInfo(dateKey)',
  ]
  /* (ر23) الجداول بالتوازي — توفير ~٢ RTT على الإقلاع البارد عشان التحميل ما يتأخرش */
  await Promise.all(DDL.map(function (q, i) {
    return db.$executeRawUnsafe(q).catch(function (e) { console.error('[daily-info-batch] DDL fail #' + i, e) })
  }))
  _tablesReady = true
}

function nid(): string {
  return 'di' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await isAdmin(String(body.adminId || '')))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureDailyInfoTables()
    var items = Array.isArray(body.items) ? body.items : []
    if (!items.length) return NextResponse.json({ error: 'مفيش معلومات للحفظ' }, { status: 400 })
    if (items.length > 60) return NextResponse.json({ error: 'الحد الأقصى 60 معلومة في المرة الواحدة' }, { status: 400 })
    var kind = String(body.kind || 'info') === 'wisdom' ? 'wisdom' : 'info'
    var created = 0
    var skipped = 0
    for (var i = 0; i < items.length; i++) {
      var it = items[i] || {}
      var dk = /^\d{4}-\d{2}-\d{2}$/.test(String(it.dateKey || '')) ? String(it.dateKey) : ''
      var title = String(it.title || '').trim().slice(0, 200)
      var text = String(it.body || '').trim().slice(0, 4000)
      // يوم سليم + في محتوى فعلي — الباقي بيتخطى بصمت
      if (!dk || (!text && !title)) { skipped++; continue }
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO DailyInfo (id, dateKey, kind, title, body, mediaPath, mediaName, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          nid(), dk, kind, title, text, '', '', 1
        )
        created++
      } catch (e) {
        skipped++
        console.error('[daily-info-batch] insert fail #' + i, e)
      }
    }
    if (!created) return NextResponse.json({ error: 'مفيش معلومات صالحة للحفظ — راجع النص والتواريخ' }, { status: 400 })
    return NextResponse.json({ ok: true, created: created, skipped: skipped })
  } catch (error) {
    console.error('daily-info batch POST error:', error)
    return NextResponse.json({ error: 'خطأ في حفظ الدفعة' }, { status: 500 })
  }
}
