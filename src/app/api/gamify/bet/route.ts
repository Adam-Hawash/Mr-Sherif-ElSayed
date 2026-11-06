// @ts-nocheck
// FILE: src/app/api/gamify/bet/route.ts
// (2026-غ1) المراهنة على XP — الطالب يتنبأ بعدد الإجابات الصحيحة قبل الامتحان
//   • GET  ?studentId= → رهاناته + الامتحانات المتاحة للرهان (من نفس الصف وماحلهاش)
//   • POST → مكان الرهان (توقع تام = ضعف الرهان، فارق سؤال = رجوع الرهان)
import { NextRequest, NextResponse } from 'next/server'
import { placeBet, getStudentBets, getOrCreateProfile } from '@/lib/gamify'
import { db } from '@/lib/db'

function safeParse(raw: any, fallback: any): any {
  try {
    if (raw == null || raw === '') return fallback
    if (typeof raw === 'object') return raw
    return JSON.parse(String(raw))
  } catch (e) { return fallback }
}

export async function GET(req: NextRequest) {
  try {
    var studentId = new URL(req.url).searchParams.get('studentId') || ''
    if (!studentId) return NextResponse.json({ error: 'studentId مطلوب' }, { status: 400 })
    var grade = ''
    try {
      var st: any = await db.$queryRawUnsafe('SELECT grade FROM Student WHERE id = ? LIMIT 1', studentId)
      if (st && st.length) grade = String(st[0].grade || '')
    } catch (e) {}
    var profile: any = await getOrCreateProfile(studentId, grade)
    var bets = await getStudentBets(studentId)

    // الامتحانات المتاحة: نفس الصف + الطالب ما سلّمهاش + مفيش رهان قفل عليها
    var available: any[] = []
    try {
      var exams: any = await db.$queryRawUnsafe('SELECT id, title, questions, createdAt FROM Exam WHERE grade = ? ORDER BY createdAt DESC LIMIT 15', grade) || []
      for (var i = 0; i < exams.length; i++) {
        var ex = exams[i]
        var done: any = await db.$queryRawUnsafe('SELECT id FROM ExamResult WHERE examId = ? AND studentId = ? LIMIT 1', String(ex.id), studentId) || []
        if (done.length) continue
        var betted: any = await db.$queryRawUnsafe("SELECT id FROM XpBet WHERE examId = ? AND studentId = ? AND status = 'locked' LIMIT 1", String(ex.id), studentId) || []
        if (betted.length) continue
        var qs = safeParse(ex.questions, [])
        available.push({
          id: String(ex.id), title: String(ex.title || 'امتحان'),
          totalQuestions: Array.isArray(qs) && qs.length ? qs.length : 10,
        })
        if (available.length >= 5) break
      }
    } catch (e) {}
    return NextResponse.json({ bets, available, xp: Number(profile.xp) || 0 })
  } catch (error) {
    console.error('gamify bet GET error:', error)
    return NextResponse.json({ error: 'خطأ في تحميل الرهانات' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    var body = await req.json()
    var result = await placeBet({
      studentId: String(body.studentId || ''),
      grade: String(body.grade || ''),
      examId: String(body.examId || ''),
      stake: Number(body.stake) || 0,
      prediction: Number(body.prediction) || 0,
    })
    if (!result.ok) return NextResponse.json(result, { status: 400 })
    return NextResponse.json(result)
  } catch (error) {
    console.error('gamify bet POST error:', error)
    return NextResponse.json({ error: 'خطأ في تسجيل الرهان' }, { status: 500 })
  }
}
