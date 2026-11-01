// @ts-nocheck
// ============================================================
// (2026-و111) رسايل حل الشكاوى للجهاز — Device Messages
// ------------------------------------------------------------
// الفكرة بطلب المستر: طالب ناسي الباسورد بيبعت شكوى من صفحة
// الشكاوى (من غير دخول) — الجهاز اللي بعت منه بيحفظ Device ID
// عشوائي في localStorage. لما الأدمن يحل الشكوى ويرد، الرد بيتخزن
// رسالة مربوطة بالجهاز — وأول ما الطالب يفتح المنصة من نفس الجهاز
// تظهرله رسالة فيها الحل (مثلاً الباسورد الجديد).
// الأمان: الـ Device ID عشوائي (UUID) ومحفوظ على جهاز الطالب بس —
// مفيش حد يقدر يخمّنه، والرد بيرجع للجهاز المطابق بس.
// ============================================================
import { db } from '@/lib/db'

var ensured = false

/* جدول الرسايل + عمود deviceId في جدول الشكاوى — يتعملوا لوحدهم
   (نفس نمط ensureComplaintTable — عشان الإنتاج يتحدث من غير migration) */
export async function ensureDeviceMessageTables() {
  if (ensured) return
  try {
    await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS DeviceMessage (
      id TEXT PRIMARY KEY,
      deviceId TEXT NOT NULL DEFAULT '',
      title TEXT DEFAULT '',
      body TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'unread',
      createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`)
    try {
      await db.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS idx_devicemessage_device ON DeviceMessage(deviceId, status)`)
    } catch (e) {}
    try {
      await db.$executeRawUnsafe(`ALTER TABLE Complaint ADD COLUMN deviceId TEXT DEFAULT ''`)
    } catch (e) {}
    ensured = true
  } catch (e) {
    console.error('[DeviceMessages] ensure tables failed:', String((e && e.message) || e))
  }
}

/* تسجيل رسالة حل لجهاز الطالب — بتتنادى لما الأدمن يحل شكوى ليها deviceId */
export async function insertDeviceMessage(deviceId: string, title: string, body: string, phone: string) {
  try {
    var dev = String(deviceId || '').trim().slice(0, 80)
    if (dev.length < 8) return
    await ensureDeviceMessageTables()
    var id = 'dvm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await db.$executeRawUnsafe(
      `INSERT INTO DeviceMessage (id, deviceId, title, body, phone, status, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, 'unread', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, dev, String(title || '').slice(0, 300), String(body || '').slice(0, 2000), String(phone || '').slice(0, 20)
    )
  } catch (e) {
    console.error('[DeviceMessages] insert failed:', String((e && e.message) || e))
  }
}
