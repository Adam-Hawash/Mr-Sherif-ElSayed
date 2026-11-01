// ============================================================
// /api/admin/parent-msg-template — قالب رسالة ولي الأمر (و81 — منقول 1:1 من Maths-Genius)
// ============================================================
// GET  → القالب المحفوظ (أو null → الواجهة تستخدم الافتراضي)
// POST → حفظ القالب (نص حر فيه بلايسهولدرز {student} {exams}
//        {homework} {videos} {assessment})
// التخزين: SiteConfig — المفتاح 'parent_msg_template'
// ============================================================
// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { DEFAULT_PARENT_TEMPLATE } from '@/lib/parent-message'

export const dynamic = 'force-dynamic'

var KEY = 'parent_msg_template'

export async function GET() {
  try {
    var row = await db.siteConfig.findUnique({ where: { key: KEY } })
    return NextResponse.json({ ok: true, template: row && row.value ? row.value : null, fallback: DEFAULT_PARENT_TEMPLATE })
  } catch (e) {
    return NextResponse.json({ ok: true, template: null, fallback: DEFAULT_PARENT_TEMPLATE })
  }
}

export async function POST(request: NextRequest) {
  try {
    var body = await request.json()
    var template = String((body && body.template) || '').trim()
    if (!template) {
      return NextResponse.json({ ok: false, error: 'القالب فاضي' }, { status: 400 })
    }
    if (template.length > 6000) template = template.slice(0, 6000)
    await safeWrite(function () {
      return db.siteConfig.upsert({
        where: { key: KEY },
        update: { value: template, updatedAt: new Date() },
        create: { key: KEY, value: template },
      })
    })
    return NextResponse.json({ ok: true, template: template })
  } catch (error: any) {
    console.error('parent-msg-template save error:', error)
    return NextResponse.json({ ok: false, error: error.message || 'Server error' }, { status: 500 })
  }
}
