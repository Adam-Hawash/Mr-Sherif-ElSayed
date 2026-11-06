// @ts-nocheck
// FILE: src/app/api/gamify/admin/series/route.ts
// (2026-غ1) إدارة سلاسل التحدي اليومي — للأدمن بس
//   • GET    → كل السلاسل + أسئلتها (بالإجابات) + إحصاء اليوم
//   • POST   → إنشاء سلسلة (صف + عنوان + عدد الأيام + نص الجايزة)
//   • PUT    → تحديث/نشر/إيقاف/حذف سلسلة + حفظ أسئلة اليوم
//     actions: 'update' | 'publish' (نشر + إشعار الطلاب) | 'unpause'… بسيطة
//   • DELETE → مسح سلسلة
//   حفظ الأسئلة: body.questions = [{dayNumber, orderInDay, text, options[],
//     correctIndex, correctText, xpReward}] — بنستبدل أسئلة الأيام المرسلة بس
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { ensureGamifyTables, getSeriesQuestions, DEFAULT_PRIZE_TEXT } from '@/lib/gamify'
import { notifyStudents } from '@/lib/notify'
import { isAdmin } from '@/lib/video-guard'

function gid(): string {
  return 'csr' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

/* حارس الأدمن — adminId من الـ body أو الكويري (2026-غ2 تأمين) */
async function guardAdmin(req: NextRequest, body?: any): Promise<boolean> {
  var adminId = (body && body.adminId) || new URL(req.url).searchParams.get('adminId') || ''
  return isAdmin(adminId)
}
function qid(): string {
  return 'cq' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export async function GET(req: NextRequest) {
  try {
    if (!(await guardAdmin(req))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var series: any = await db.$queryRawUnsafe('SELECT * FROM ChallengeSeries ORDER BY createdAt DESC LIMIT 30') || []
    var out: any[] = []
    for (var i = 0; i < series.length; i++) {
      var s = series[i]
      var qs = await getSeriesQuestions(String(s.id))
      var perDay: Record<string, number> = {}
      for (var q of qs) {
        var d = String(q.dayNumber)
        perDay[d] = (perDay[d] || 0) + 1
      }
      out.push({
        id: String(s.id), grade: String(s.grade), title: String(s.title),
        totalDays: Number(s.totalDays) || 7, prize: String(s.prize || ''),
        active: Number(s.active) === 1, createdAt: String(s.createdAt || ''),
        questionCount: qs.length, perDay,
        questions: qs.map(function (q: any) {
          return {
            id: String(q.id), dayNumber: Number(q.dayNumber), orderInDay: Number(q.orderInDay),
            text: String(q.text || ''), options: (() => { try { return JSON.parse(String(q.options || '[]')) } catch (e) { return [] } })(),
            correctIndex: Number(q.correctIndex), correctText: String(q.correctText || ''),
            xpReward: Number(q.xpReward) || 20, difficulty: String(q.difficulty || 'normal'),
          }
        }),
      })
    }
    return NextResponse.json({ series: out, defaultPrize: DEFAULT_PRIZE_TEXT })
  } catch (error) {
    console.error('gamify series GET error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل السلاسل' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await guardAdmin(req, body))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var sid = gid()
    await db.$executeRawUnsafe(
      'INSERT INTO ChallengeSeries (id, grade, title, totalDays, prize, active) VALUES (?, ?, ?, ?, ?, 0)',
      sid, String(body.grade || ''), String(body.title || 'تحدي اليوم').slice(0, 120),
      Math.max(1, Number(body.totalDays) || 10), String(body.prize || '').slice(0, 400)
    )
    return NextResponse.json({ ok: true, id: sid })
  } catch (error) {
    console.error('gamify series POST error:', error)
    return NextResponse.json({ error: 'خطأ في إنشاء السلسلة' }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    var body = await req.json()
    if (!(await guardAdmin(req, body))) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })
    await ensureGamifyTables()
    var sid = String(body.id || '')
    if (!sid) return NextResponse.json({ error: 'id مطلوب' }, { status: 400 })
    var action = String(body.action || 'update')

    if (action === 'publish' || action === 'unpublish') {
      var active = action === 'publish' ? 1 : 0
      if (active) {
        // نشر السلسلة = إيقاف أي سلسلة نشطة تانية لنفس الصف
        var cur: any = await db.$queryRawUnsafe('SELECT grade FROM ChallengeSeries WHERE id = ?', sid) || []
        var grade = cur.length ? String(cur[0].grade) : ''
        try {
          await db.$executeRawUnsafe('UPDATE ChallengeSeries SET active = 0 WHERE grade = ?', grade)
        } catch (e) {}
      }
      await db.$executeRawUnsafe(
        'UPDATE ChallengeSeries SET active = ?, publishedAt = CURRENT_TIMESTAMP, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
        active, sid
      )
      if (active) {
        // إشعار الطلاب — طلب المستر: «لما يبعت الأسئلة الطلاب يوصلهإشعار»
        var s0: any = await db.$queryRawUnsafe('SELECT grade, title, totalDays FROM ChallengeSeries WHERE id = ?', sid) || []
        if (s0.length) {
          var g = String(s0[0].grade || '')
          await notifyStudents({
            grade: g || undefined,
            type: 'gamify_challenge',
            title: '🎯 التحدي اليومي الجديد نزل!',
            body: 'سلسلة «' + String(s0[0].title || '') + '» متاحة دلوقتي (' + (Number(s0[0].totalDays) || 10) + ' أيام) — خش حل سؤال اليوم واكسب XP قبل ما الوقت يخلص! 🔥',
          })
        }
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      await db.$executeRawUnsafe('DELETE FROM ChallengeQuestion WHERE seriesId = ?', sid)
      await db.$executeRawUnsafe('DELETE FROM ChallengeAttempt WHERE seriesId = ?', sid)
      await db.$executeRawUnsafe('DELETE FROM ChallengeSeries WHERE id = ?', sid)
      return NextResponse.json({ ok: true })
    }

    // تحديث بيانات السلسلة
    await db.$executeRawUnsafe(
      'UPDATE ChallengeSeries SET title = ?, grade = ?, totalDays = ?, prize = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      String(body.title || 'تحدي اليوم').slice(0, 120), String(body.grade || ''),
      Math.max(1, Number(body.totalDays) || 10), String(body.prize || '').slice(0, 400), sid
    )

    // حفظ الأسئلة (لو مرسلة) — استبدال كامل لأسئلة الأيام المرسلة
    if (Array.isArray(body.questions)) {
      var dayNumbers = Array.from(new Set((body.questions as any[]).map(function (q: any) { return Number(q.dayNumber) || 1 })))
      for (var d of dayNumbers) {
        await db.$executeRawUnsafe('DELETE FROM ChallengeQuestion WHERE seriesId = ? AND dayNumber = ?', sid, d)
      }
      var order: Record<string, number> = {}
      for (var q of body.questions as any[]) {
        var dn = Math.max(1, Number(q.dayNumber) || 1)
        var key = String(dn)
        order[key] = (order[key] || 0) + 1
        var opts = Array.isArray(q.options) ? q.options.filter(function (o: any) { return String(o || '').trim() !== '' }) : []
        await db.$executeRawUnsafe(
          'INSERT INTO ChallengeQuestion (id, seriesId, dayNumber, orderInDay, text, options, correctIndex, correctText, xpReward, difficulty) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          qid(), sid, dn, order[key], String(q.text || '').slice(0, 2000),
          JSON.stringify(opts.map(function (o: any) { return String(o) })),
          opts.length ? (Number(q.correctIndex) || 0) : -1,
          opts.length ? '' : String(q.correctText || ''),
          Math.max(5, Number(q.xpReward) || 20), String(q.difficulty || 'normal')
        )
      }
    }
    return NextResponse.json({ ok: true })
  } catch (error) {
    console.error('gamify series PUT error:', error)
    return NextResponse.json({ error: 'خطأ في تحديث السلسلة' }, { status: 500 })
  }
}
