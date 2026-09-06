// @ts-nocheck
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export var maxDuration = 10

var DEFAULT_EMAIL = 'sherif math@2026'
var DEFAULT_PASSWORD = 'mr sherif2026#'
var ADMIN_NAME = 'Mr Sherif Elsayed'

export async function POST(request) {
  var body
  try {
    body = await request.json()
  } catch (e) {
    return NextResponse.json({ error: 'طلب غير صالح' }, { status: 400 })
  }

  var email = body.email
  var password = body.password

  if (!email || !password) {
    return NextResponse.json({ error: 'البريد وكلمة المرور مطلوبين' }, { status: 400 })
  }

  var cleanEmail = email.trim().toLowerCase()
  var cleanPassword = password

  try {
    var admin = await db.admin.findFirst()

    if (!admin) {
      if (cleanEmail !== DEFAULT_EMAIL || cleanPassword !== DEFAULT_PASSWORD) {
        return NextResponse.json({ error: 'البريد أو كلمة المرور غلط' }, { status: 401 })
      }
      admin = await safeWrite(function() {
        return db.admin.create({
          data: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, name: ADMIN_NAME },
        })
      })
    } else {
      if (cleanEmail !== admin.email || cleanPassword !== admin.password) {
        return NextResponse.json({ error: 'البريد أو كلمة المرور غلط' }, { status: 401 })
      }
    }

    var adminWithoutPassword = { id: admin.id, email: admin.email, name: admin.name, createdAt: admin.createdAt, updatedAt: admin.updatedAt }

    return NextResponse.json({
      message: 'تم تسجيل الدخول',
      admin: adminWithoutPassword,
    })
  } catch (error) {
    console.error('Admin login error:', error)
    return NextResponse.json({ error: 'خطأ في السيرفر' }, { status: 500 })
  }
}
