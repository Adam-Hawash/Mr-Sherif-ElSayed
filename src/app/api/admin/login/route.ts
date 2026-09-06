// @ts-nocheck
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export var maxDuration = 10

var DEFAULT_EMAIL = 'sherifmath@2026'
var DEFAULT_PASSWORD = 'mrsherif2026#'
var ADMIN_NAME = 'Mr Sherif Elsayed'
/* the hidden-gate phone (22222222222 / mr sherif2026#) also works as the
   admin email in the login dialog — the teacher knows this pair by heart */
var ADMIN_PHONE_ALIAS = '22222222222'

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

  // strip ALL whitespace — 'sherif math@2026' and 'sherifmath@2026' both work,
  // so pasted credentials with stray spaces can never lock the teacher out
  var squash = function (v: any) { return String(v || '').replace(/\s+/g, '').toLowerCase() }
  var cleanEmail = squash(email)
  var cleanPassword = squash(password)

  try {
    var admin = await db.admin.findFirst()

    if (!admin) {
      var emailOkEmpty = cleanEmail === squash(DEFAULT_EMAIL) || cleanEmail === ADMIN_PHONE_ALIAS
      if (!emailOkEmpty || cleanPassword !== squash(DEFAULT_PASSWORD)) {
        return NextResponse.json({ error: 'البريد أو كلمة المرور غلط' }, { status: 401 })
      }
      admin = await safeWrite(function() {
        return db.admin.create({
          data: { email: DEFAULT_EMAIL, password: DEFAULT_PASSWORD, name: ADMIN_NAME },
        })
      })
    } else {
      var matchesStored = cleanEmail === squash(admin.email) && cleanPassword === squash(admin.password)
      /* phone alias + (stored password | default password) */
      var matchesPhone = cleanEmail === ADMIN_PHONE_ALIAS &&
        (cleanPassword === squash(admin.password) || cleanPassword === squash(DEFAULT_PASSWORD))
      if (!matchesStored && !matchesPhone) {
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
