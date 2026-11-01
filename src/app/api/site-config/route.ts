// @ts-nocheck
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'

// (Z-36a) سد ثغرة /api/site-config:
// - قبل: GET كان بيرجّع كل الصفوف الخام (حتى الأسرار زي session_secret)
//   وPUT/POST مفتوحين لأي زائر يقدر يكتب أي مفتاح.
// - بعد: GET بيرجّع المفاتيح العامة بس، وأي كتابة محتاجة أدمن موثّق
//   بنفس نظام adminId بتاع المنصة (?adminId=...).
const PUBLIC_KEYS = ['grades_data', 'schedule_data', 'video_sequence_lock', 'wm_enabled', 'wm_opacity', 'wm_interval']

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    // all=1 + أدمن موثّق → كل الصفوف (للوحة الأدمن بس)
    if (sp.get('all') === '1' && (await isAdmin(sp.get('adminId')))) {
      const all = await db.siteConfig.findMany({ orderBy: { updatedAt: 'desc' } })
      return NextResponse.json(all)
    }
    // غير كده: المفاتيح العامة بس — ممنوع تسرّب أي مفتاح حساس
    const rows = await db.siteConfig.findMany({
      where: { key: { in: PUBLIC_KEYS } },
      orderBy: { updatedAt: 'desc' },
    })
    return NextResponse.json(rows.map(function (r) {
      return { key: r.key, value: r.value, updatedAt: r.updatedAt }
    }))
  } catch (error) {
    return NextResponse.json({ error: 'Failed to fetch configs' }, { status: 500 })
  }
}

export async function PUT(request: NextRequest) {
  try {
    const { key, value } = await request.json()
    if (typeof key !== 'string' || key.length === 0 || key.length > 120) {
      return NextResponse.json({ error: 'مفتاح غير صالح' }, { status: 400 })
    }
    if (key === 'session_secret') {
      return NextResponse.json({ error: 'مفتاح محمي' }, { status: 403 })
    }
    const adminId = new URL(request.url).searchParams.get('adminId')
    if (!(await isAdmin(adminId))) {
      return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    }
    const updated = await db.siteConfig.upsert({
      where: { key },
      update: { value, updatedAt: new Date() },
      create: { key, value },
    })
    return NextResponse.json(updated)
  } catch (error) {
    return NextResponse.json({ error: 'Failed to update config' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  // (Z-36a) كان create مفتوح لأي زائر — بقى نفس PUT (upsert) بعد توثيق الأدمن
  // والتحقق من المفتاح، عشان مفيش صفوف مكررة أو كتابة بدون صلاحية
  return PUT(request)
}
