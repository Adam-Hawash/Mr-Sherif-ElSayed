// @ts-nocheck
// ============================================================
// PATCH /api/complaints/[id] — الأدمن بس:
//  { status: 'resolved' }                → اعتبرها اتحلت
//  { status: 'new' }                     → رجّعها للجديد
//  { reply: '...' }                      → اكتب رد يشوفه الطالب
//  { reply: '...', status: 'resolved' }  → ابعته واعتبرها اتحلت
// ============================================================
import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export var maxDuration = 10

function cleanText(v: any, max: number): string {
  return String(v == null ? '' : v).trim().slice(0, max)
}

export async function PATCH(request: Request, ctx: any) {
  try {
    var id = ''
    try {
      var p = ctx && ctx.params && typeof ctx.params.then === 'function' ? await ctx.params : ctx.params
      id = cleanText(p && p.id, 64)
    } catch (e) {}
    if (!id) return NextResponse.json({ error: 'مفيش رقم شكوى' }, { status: 400 })

    var body: any = {}
    try { body = await request.json() } catch (e) {}

    var status = cleanText(body.status, 20)
    var reply = cleanText(body.reply, 2000)
    if (status && status !== 'new' && status !== 'resolved') status = ''

    var sets: string[] = []
    var vals: any[] = []
    if (status) { sets.push('status = ?'); vals.push(status) }
    if (body.reply !== undefined) { sets.push('reply = ?'); vals.push(reply) }
    if (!sets.length) return NextResponse.json({ error: 'مفيش تغييرات' }, { status: 400 })
    sets.push('reviewedAt = CURRENT_TIMESTAMP')
    sets.push('updatedAt = CURRENT_TIMESTAMP')
    vals.push(id)

    await safeWrite(function () {
      return db.$executeRawUnsafe('UPDATE Complaint SET ' + sets.join(', ') + ' WHERE id = ?', ...vals)
    })

    var rows = (await db.$queryRawUnsafe('SELECT * FROM Complaint WHERE id = ? LIMIT 1', id)) || []
    if (!rows.length) return NextResponse.json({ error: 'الشكوى مش موجودة' }, { status: 404 })
    return NextResponse.json({ complaint: rows[0], message: 'تم الحفظ ✅' })
  } catch (error) {
    console.error('[Complaints] PATCH error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة في السيرفر' }, { status: 500 })
  }
}
