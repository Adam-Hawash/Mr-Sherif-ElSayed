// @ts-nocheck
// FILE: src/app/api/gamify/bet/route.ts
// (2026-غ1) المراهنة على XP — الطالب يتنبأ بعدد الإجابات الصحيحة قبل الامتحان
// (2026-ج2) «المراهنات تبقى على الواجبات والامتحانات، تبقى على الاثنين»:
//   • GET  ?studentId= → رهاناته + المتاح (امتحانات + واجبات من نفس الصف وماحلهاش)
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

    // المتاح للرهان: امتحانات + واجبات — نفس الصف + الطالب ما سلّمهاش + مفيش رهان قفل عليها
    var available: any[] = []
    // 📝 الامتحانات
    try {
      var exams: any = await db.$queryRawUnsafe('SELECT id, title, questions, createdAt FROM Exam WHERE grade = ? ORDER BY createdAt DESC LIMIT 15', grade) || []
      for (var i = 0; i < exams.length; i++) {
        var ex = exams[i]
        var done: any = await db.$queryRawUnsafe('SELECT id FROM ExamResult WHERE examId = ? AND studentId = ? LIMIT 1', String(ex.id), studentId) || []
        if (done.length) continue
        var betted: any = await db.$queryRawUnsafe("SELECT id FROM XpBet WHERE examId = ? AND studentId = ? AND status = 'locked' AND targetType IN ('exam','') LIMIT 1", String(ex.id), studentId) || []
        if (betted.length) continue
        var qs = safeParse(ex.questions, [])
        available.push({
          id: String(ex.id), title: String(ex.title || 'امتحان'),
          totalQuestions: Array.isArray(qs) && qs.length ? qs.length : 10,
          type: 'exam',
        })
        if (available.length >= 6) break
      }
    } catch (e) {}
    // 📚 الواجبات — (ج2) الاثنين مع بعض
    try {
      var hws: any = await db.$queryRawUnsafe('SELECT id, title, questions, createdAt FROM Homework WHERE grade = ? ORDER BY createdAt DESC LIMIT 15', grade) || []
      var hwCount = 0
      for (var j = 0; j < hws.length && hwCount < 4; j++) {
        var hw = hws[j]
        var hwDone: any = await db.$queryRawUnsafe('SELECT id FROM HomeworkResult WHERE homeworkId = ? AND studentId = ? LIMIT 1', String(hw.id), studentId) || []
        if (hwDone.length) continue
        var hwBetted: any = await db.$queryRawUnsafe("SELECT id FROM XpBet WHERE examId = ? AND studentId = ? AND status = 'locked' AND targetType = 'homework' LIMIT 1", String(hw.id), studentId) || []
        if (hwBetted.length) continue
        var hwQs = safeParse(hw.questions, [])
        if (!Array.isArray(hwQs) || hwQs.length === 0) continue // واجب من غير أسئلة MCQ مينفعش نتنبأ عدد صح فيه
        available.push({
          id: String(hw.id), title: String(hw.title || 'واجب'),
          totalQuestions: hwQs.length,
          type: 'homework',
        })
        hwCount++
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
      examId: String(body.targetId || body.examId || ''),
      targetType: String(body.targetType || 'exam'),
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
