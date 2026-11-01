// @ts-nocheck
// ============================================================
// (ز18 — طلب المستر): سعر الدرس كله — جزء واحد بيتسدد = الدرس كله بيفتح
// (ز18-ب إصلاح): المستر كان بيضغط الزرار على فيديو مفرد فالـ groupKey يتبعت
// فاضي وييجي 400 — دلوقتي الفيديو المفرد بيتسعّر بـ videoId، وفلتر الصف
// اتشال من التحديث (groupKey فريد للدرس — فلاتر الصف كانت ممكن تبوّظه)،
// وأعمدة Video بتعمل لها self-heal لو ناقصة على أي قاعدة بيانات.
// POST { groupKey?, videoId?, price } — price = 0 → مجاني
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export const runtime = 'nodejs'

var _columnsHealed = false
async function healVideoColumns() {
  if (_columnsHealed) return
  try {
    var cols = [
      ['price', 'REAL', 'DEFAULT 0'],
      ['groupKey', 'TEXT', "DEFAULT ''"],
      ['orderIndex', 'INTEGER', 'DEFAULT 0'],
      ['sortIndex', 'INTEGER', 'DEFAULT 0'],
    ]
    for (var i = 0; i < cols.length; i++) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE Video ADD COLUMN ' + cols[i][0] + ' ' + cols[i][1] + ' ' + cols[i][2])
      } catch (eCol) {
        /* duplicate column = تمام — أي خطأ تاني بيتتجاهل والمحاولة الجاية تقول */
      }
    }
    _columnsHealed = true
  } catch (eHeal) {}
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const groupKey = String(body.groupKey || '')
    const videoId = String(body.videoId || '')
    const price = Math.max(0, Number(body.price) || 0)

    if (!groupKey && !videoId) {
      return NextResponse.json({ error: 'groupKey or videoId required' }, { status: 400 })
    }

    // (ز18-ب) ترميم دفاعي — نفس درس video-guard: أي عمود ناقص على قاعدة قديمة
    // بيبوّظ استعلامات Prisma على Video كلها
    await healVideoColumns()

    var updated = 0
    if (groupKey) {
      // (ز18-ب) من غير فلتر grade — groupKey فريد للدرس نفسه
      const res = await db.video.updateMany({ where: { groupKey: groupKey }, data: { price: price } })
      updated = res.count
    } else {
      const res = await db.video.updateMany({ where: { id: videoId }, data: { price: price } })
      updated = res.count
      if (updated === 0) {
        return NextResponse.json({ error: 'Video not found' }, { status: 404 })
      }
    }

    return NextResponse.json({ ok: true, updated: updated, price: price })
  } catch (error) {
    console.error('Lesson price error:', error)
    return NextResponse.json({ error: 'Failed' }, { status: 500 })
  }
}
