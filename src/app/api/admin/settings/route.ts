// @ts-nocheck
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

var DEFAULT_EMAIL = 'sherif math@2026'
var DEFAULT_PASSWORD = 'mr sherif2026#'
var DEFAULT_NAME = 'Mr Sherif Elsayed'

export async function GET() {
  try {
    var admin = await db.admin.findFirst()
    if (!admin) {
      admin = await db.admin.create({
        data: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, name: DEFAULT_NAME },
      })
    }
    var safe = { id: admin.id, email: admin.email, name: admin.name, createdAt: admin.createdAt, updatedAt: admin.updatedAt }
    return NextResponse.json({ admin: safe })
  } catch (error) {
    console.error('Admin settings fetch error:', error)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}

export async function PUT(request) {
  try {
    var body = await request.json()
    var oldPassword = body.oldPassword
    var newEmail = body.newEmail
    var newPassword = body.newPassword

    if (!oldPassword || !oldPassword.trim()) {
      return NextResponse.json({ error: 'يجب إدخال كلمة المرور الحالية' }, { status: 400 })
    }

    var admin = await db.admin.findFirst()
    if (!admin) {
      return NextResponse.json({ error: 'الحساب غير موجود' }, { status: 404 })
    }

    if (admin.password !== oldPassword.trim()) {
      return NextResponse.json({ error: 'كلمة المرور الحالية غلط' }, { status: 401 })
    }

    var updateData = {}
    var changesMade = false

    if (newEmail && newEmail.trim() && newEmail.trim() !== admin.email) {
      updateData.email = newEmail.trim()
      changesMade = true
    }

    if (newPassword !== undefined && newPassword !== null && String(newPassword).trim() !== '') {
      var trimmedPass = String(newPassword).trim()
      if (trimmedPass.length < 6) {
        return NextResponse.json({ error: 'كلمة المرور الجديدة لازم 6 حروف على الأقل' }, { status: 400 })
      }
      updateData.password = trimmedPass
      changesMade = true
    }

    if (!changesMade) {
      return NextResponse.json({ error: 'مفيش حاجة تتغير' }, { status: 400 })
    }

    updateData.updatedAt = new Date()

    var updated = await safeWrite(function() {
      return db.admin.update({
        where: { id: admin.id },
        data: updateData,
      })
    })

    var safe = { id: updated.id, email: updated.email, name: updated.name, createdAt: updated.createdAt, updatedAt: updated.updatedAt }
    return NextResponse.json({ message: 'تم تحديث الإعدادات بنجاح', admin: safe })
  } catch (error) {
    console.error('Admin settings update error:', error)
    return NextResponse.json({ error: 'Server error', detail: error.message }, { status: 500 })
  }
}
