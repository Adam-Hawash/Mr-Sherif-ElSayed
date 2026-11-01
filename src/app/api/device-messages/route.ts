// @ts-nocheck
// ============================================================
// (2026-و111) رسايل حل الشكاوى للجهاز — API
//  GET  /api/device-messages?deviceId=... → رسايل الجهاز اللي لسه مقروءةش
//  POST /api/device-messages              → تعليم الرسايل كمقروءة
//         { deviceId, ids: [...] } أو { deviceId } (الكل)
// الأمان: الـ deviceId عشوائي محفوظ على جهاز الطالب — الرد بيرجع
// للمطابق بس، ومفيش أي بيانات تانية بتترجع مع الرسالة.
// ============================================================
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureDeviceMessageTables } from '@/lib/device-messages'

export var maxDuration = 10

function cleanText(v: any, max: number): string {
  return String(v == null ? '' : v).trim().slice(0, max)
}

export async function GET(request: Request) {
  try {
    await ensureDeviceMessageTables()
    var url = new URL(request.url)
    var deviceId = cleanText(url.searchParams.get('deviceId'), 80)
    if (deviceId.length < 8) return NextResponse.json({ messages: [] })
    var rows = (await db.$queryRawUnsafe(
      "SELECT id, title, body, createdAt FROM DeviceMessage WHERE deviceId = ? AND status = 'unread' ORDER BY createdAt DESC LIMIT 5",
      deviceId
    )) || []
    return NextResponse.json({ messages: rows })
  } catch (error) {
    console.error('[DeviceMessages] GET error:', error)
    return NextResponse.json({ messages: [] })
  }
}

export async function POST(request: Request) {
  try {
    await ensureDeviceMessageTables()
    var body: any = {}
    try { body = await request.json() } catch (e) {}
    var deviceId = cleanText(body.deviceId, 80)
    if (deviceId.length < 8) return NextResponse.json({ ok: false }, { status: 400 })
    var ids = Array.isArray(body.ids)
      ? body.ids.map(function (x: any) { return cleanText(x, 64) }).filter(Boolean).slice(0, 10)
      : []
    if (ids.length) {
      var ph = ids.map(function () { return '?' }).join(',')
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "UPDATE DeviceMessage SET status = 'read', updatedAt = CURRENT_TIMESTAMP WHERE deviceId = ? AND id IN (" + ph + ')',
          deviceId, ...ids
        )
      })
    } else {
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          "UPDATE DeviceMessage SET status = 'read', updatedAt = CURRENT_TIMESTAMP WHERE deviceId = ?",
          deviceId
        )
      })
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('[DeviceMessages] POST error:', error)
    return NextResponse.json({ ok: false }, { status: 500 })
  }
}
