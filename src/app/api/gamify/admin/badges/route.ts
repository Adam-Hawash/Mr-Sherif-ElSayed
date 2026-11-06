// @ts-nocheck
// FILE: src/app/api/gamify/admin/badges/route.ts
// (2026-غ1) إدارة الشارات — للأدمن: إضافة/تعديل/حذف شارة + نصوصها المخصصة
//   (المقامر الشجاع اتحذف من النظام نهائيًا بطلب المستر — يقدر يضيف بدلها أي حاجة)
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureGamifyTables, getStudentBadges } from '@/lib/gamify'
import { isAdmin } from '@/lib/video-guard'

function bid(): string {
  return 'bdg' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* حارس الأدمن — adminId من الـ body أو الكويري (2026-غ2 تأمين) */
async function guardAdmin(req: NextRequest, body?: any): Promise<boolean> {
  var adminId = (body && body.adminId) || new URL(req.url).searchParams.get('adminId') || ''
  return isAdmin(adminId)
}

var CONDITIONS = ['streak_days', 'accuracy', 'homework_speed', 'xp_total', 'challenge_days']

export async function GET(req: NextRequest) {
  try {
    if (!(await guardAdmin(req))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var badges: any = await db.$queryRawUnsafe('SELECT * FROM Badge ORDER BY sort ASC, createdAt ASC') || []
    var studentId = new URL(req.url).searchParams.get('studentId') || ''
    var unlockedFor = studentId ? await getStudentBadges(studentId) : null
    return NextResponse.json({
      badges: badges.map(function (b: any) {
        return {
          id: String(b.id), name: String(b.name), desc: String(b.desc || ''), icon: String(b.icon || '🏅'),
          rarity: String(b.rarity || 'common'), conditionType: String(b.conditionType || 'streak_days'),
          threshold: Number(b.threshold) || 1, active: Number(b.active) === 1, sort: Number(b.sort) || 0,
        }
      }),
      conditions: CONDITIONS,
      studentBadges: unlockedFor,
    })
  } catch (error) {
    console.error('gamify badges GET error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل الشارات' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await guardAdmin(req, body))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var id = bid()
    await db.$executeRawUnsafe(
      'INSERT INTO Badge (id, name, desc, icon, rarity, conditionType, threshold, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      id, String(body.name || 'شارة جديدة').slice(0, 80), String(body.desc || '').slice(0, 300),
      String(body.icon || '🏅').slice(0, 8), String(body.rarity || 'common'),
      CONDITIONS.indexOf(String(body.conditionType)) >= 0 ? String(body.conditionType) : 'streak_days',
      Math.max(1, Number(body.threshold) || 1), body.active === false ? 0 : 1, Number(body.sort) || 99
    )
    return NextResponse.json({ ok: true, id })
  } catch (error) {
    console.error('gamify badges POST error:', error)
    return NextResponse.json({ error: 'خطأ في إضافة الشارة' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await guardAdmin(req, body))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var id = String(body.id || '')
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe(
      'UPDATE Badge SET name = ?, desc = ?, icon = ?, rarity = ?, conditionType = ?, threshold = ?, active = ?, sort = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      String(body.name || 'شارة').slice(0, 80), String(body.desc || '').slice(0, 300),
      String(body.icon || '🏅').slice(0, 8), String(body.rarity || 'common'),
      CONDITIONS.indexOf(String(body.conditionType)) >= 0 ? String(body.conditionType) : 'streak_days',
      Math.max(1, Number(body.threshold) || 1), body.active === false ? 0 : 1, Number(body.sort) || 99, id
    )
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('gamify badges PUT error:', error)
    return NextResponse.json({ error: 'خطأ في تحديث الشارة' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    if (!(await guardAdmin(req))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var id = new URL(req.url).searchParams.get('id') || ''
    if (!id) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    await db.$executeRawUnsafe('DELETE FROM StudentBadge WHERE badgeId = ?', id)
    await db.$executeRawUnsafe('DELETE FROM Badge WHERE id = ?', id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('gamify badges DELETE error:', error)
    return NextResponse.json({ error: 'خطأ في حذف الشارة' }, { status: 500 })
  }
}
