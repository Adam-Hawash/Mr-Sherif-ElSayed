// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/challenges/attempt/route.ts
// PURPOSE: (2026-و68) تسليم محاولة تحدي البنك:
//   الطالب بياخد 10 أسئلة عشوائية من البنك → يحل → يبعت إجاباته →
//   السيرفر هو اللي بيصحح (الإجابات الصح مبتتبعتش للعميل أصلًا) →
//   الدرجة = 10 نقاط لكل إجابة صح + بونص سرعة على كل إجابة صح
//   (ثانية رد سريعة = نقطة، الحد 8) → بتتحفظ في ChallengeAttempt.
//   GET ?mode=board → أعلى 30 محاولة (بنفس رائحة لوحة التحدي).
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'

export const runtime = 'nodejs'

export async function GET(request: NextRequest) {
  try {
    await ensureArenaTables()
    var rows = await db.$queryRawUnsafe('SELECT * FROM ChallengeAttempt ORDER BY score DESC, timeMs ASC, createdAt ASC LIMIT 30')
    var board = (rows || []).map(function (r: any, i: number) {
      return {
        rank: i + 1,
        name: String(r.name || 'Student'),
        score: Number(r.score || 0),
        correctCount: Number(r.correctCount || 0),
        totalQuestions: Number(r.totalQuestions || 10),
        timeMs: Number(r.timeMs || 0),
        createdAt: String(r.createdAt || ''),
      }
    })
    return NextResponse.json({ ok: true, board: board })
  } catch (e: any) {
    console.error('[challenges/attempt GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في لوحة الترتيب' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var name = String(body.name || '').trim().slice(0, 40)
    var studentId = String(body.studentId || '').slice(0, 80)
    var answers = Array.isArray(body.answers) ? body.answers.slice(0, 30) : []
    if (!name) return NextResponse.json({ ok: false, error: 'اكتب اسمك الأول' }, { status: 400 })
    if (answers.length === 0) return NextResponse.json({ ok: false, error: 'مفيش إجابات' }, { status: 400 })

    // نجيب الأسئلة المطلوبة من البنك — السيرفر هو اللي بيصحح
    var ids: string[] = []
    for (var i = 0; i < answers.length; i++) {
      var aid = String(answers[i] && answers[i].id ? answers[i].id : '')
      if (aid && ids.indexOf(aid) === -1) ids.push(aid)
    }
    if (ids.length === 0) return NextResponse.json({ ok: false, error: 'مفيش أسئلة صالحة' }, { status: 400 })

    var placeholders = ids.map(function () { return '?' }).join(',')
    var rows = await db.$queryRawUnsafe('SELECT id, correctIndex FROM ChallengeBankQuestion WHERE id IN (' + placeholders + ')', ...ids)
    var correctMap: Record<string, number> = {}
    for (var r = 0; r < (rows || []).length; r++) {
      correctMap[String(rows[r].id)] = Number(rows[r].correctIndex || 0)
    }

    // التصحيح + حساب الدرجة (دقة + سرعة)
    var correctCount = 0
    var totalMs = 0
    var speedBonus = 0
    var total = 0
    for (var a = 0; a < answers.length; a++) {
      var an = answers[a] || {}
      var qid = String(an.id || '')
      if (!(qid in correctMap)) continue
      total++
      var ms = Math.max(0, Math.min(Number(an.ms) || 0, 10 * 60 * 1000))
      totalMs += ms
      var choice = Number(an.choice)
      if (choice === correctMap[qid]) {
        correctCount++
        var secs = Math.floor(ms / 1000)
        speedBonus += Math.max(0, 8 - secs)
      }
    }
    if (total === 0) return NextResponse.json({ ok: false, error: 'الأسئلة مش موجودة في البنك' }, { status: 422 })
    var score = correctCount * 10 + speedBonus

    var id = 'cat_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    await safeWrite(function () {
      return db.$executeRawUnsafe(
        'INSERT INTO ChallengeAttempt (id, studentId, name, score, correctCount, totalQuestions, timeMs, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        id, studentId, name, score, correctCount, total, totalMs
      )
    })
    return NextResponse.json({ ok: true, score: score, correctCount: correctCount, total: total, timeMs: totalMs })
  } catch (e: any) {
    console.error('[challenges/attempt POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في حفظ المحاولة' }, { status: 500 })
  }
}
