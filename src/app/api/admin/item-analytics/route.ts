// ============================================================
// /api/admin/item-analytics — (2026-و38) قسم «تحليلات الأسئلة» في لوحة الأدمن
// طلب المستر الحرفي: «عاوز قسم جديد في صفحة الأدمن مكتوب فيه كل الامتحانات
// بتاع المنصة وكل الواجبات، ولما أضغط عليه يكون موجود إيه أكتر سؤال
// الطلاب غلطت فيه في الامتحان ده أو في الواجب ده، ويكون مكتوب فوقيه
// أسامي الطلاب اللي غلطت فيه لو أنا دوست»
//
// GET ?adminId=xx                      → قايمة كل الامتحانات + الواجبات (مع عدد التسليمات)
// GET ?adminId=xx&type=exam&id=xx      → تفصيل سؤال-بسؤال مرتب بأكتر سؤال غلط + أسماء اللي غلطوا
// GET ?adminId=xx&type=homework&id=xx  → نفس التفصيل للواجبات
// الأدمن بس.
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { isAdmin } from '@/lib/video-guard'
import { resolveQuestionsForStudent } from '@/lib/exam-models'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

function parseJson(v: any): any {
  try { return typeof v === 'string' ? JSON.parse(v) : v } catch (e) { return null }
}

function lookupAnswer(ans: any, idx: number): any {
  try {
    if (Array.isArray(ans)) return ans[idx]
    if (ans !== null && typeof ans === 'object') {
      return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
    }
  } catch (e) {}
  return undefined
}

function qText(q: any): string {
  return String((q && (q.question || q.q)) || '').slice(0, 400)
}

/* نفس تصنيف exam-models.splitForDisplay: مقالي لو type writing/essay
   أو مفيش اختيارات أو كل الاختيارات N/A فاضية */
function isWritingQuestion(q: any): boolean {
  if (!q) return true
  if (q.type === 'writing' || q.type === 'essay') return true
  var opts = Array.isArray(q.options) ? q.options : []
  if (opts.length === 0) return true
  var allNA = opts.every(function (o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
  return allNA
}

type QStat = {
  idx: number
  text: string
  kind: 'mcq' | 'writing'
  options: string[]
  correctText: string
  keyless: boolean
  /* (2026-و39) كل الطلاب غلطوا في السؤال — بتتخفى من التحليل لأن غالبًا المشكلة في السؤال نفسه أو في التصحيح */
  allWrong: boolean
  attempts: number
  wrong: number
  wrongStudents: { name: string; phone: string; answerText: string }[]
}

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var admin = await isAdmin(sp.get('adminId'))
    if (!admin) return NextResponse.json({ error: 'غير مصرح' }, { status: 401 })

    var type = String(sp.get('type') || '')
    var id = String(sp.get('id') || '')

    /* ---------- قايمة العناصر ---------- */
    if (!type || !id) {
      var exams: any[] = []
      var homeworks: any[] = []
      try {
        exams = await db.exam.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, grade: true, createdAt: true },
        })
      } catch (e) {}
      try {
        homeworks = await db.homework.findMany({
          orderBy: { createdAt: 'desc' },
          select: { id: true, title: true, grade: true, createdAt: true },
        })
      } catch (e) {}

      var examCounts: Record<string, number> = {}
      var hwCounts: Record<string, number> = {}
      try {
        var g1: any[] = await db.$queryRawUnsafe('SELECT examId, COUNT(*) AS c FROM ExamResult GROUP BY examId')
        for (var i1 = 0; i1 < g1.length; i1++) examCounts[String(g1[i1].examId)] = Number(g1[i1].c) || 0
      } catch (e) {}
      try {
        var g2: any[] = await db.$queryRawUnsafe('SELECT homeworkId, COUNT(*) AS c FROM HomeworkResult GROUP BY homeworkId')
        for (var i2 = 0; i2 < g2.length; i2++) hwCounts[String(g2[i2].homeworkId)] = Number(g2[i2].c) || 0
      } catch (e) {}

      return NextResponse.json({
        exams: exams.map(function (e) { return { id: e.id, title: e.title, grade: e.grade, createdAt: e.createdAt, submissions: examCounts[e.id] || 0 } }),
        homeworks: homeworks.map(function (h) { return { id: h.id, title: h.title, grade: h.grade, createdAt: h.createdAt, submissions: hwCounts[h.id] || 0 } }),
      })
    }

    /* ---------- تفصيل عنصر واحد ---------- */
    var studentRows: any[] = []
    try {
      studentRows = await db.student.findMany({ select: { id: true, name: true, phone: true } })
    } catch (e) {}
    var studentMap: Record<string, { name: string; phone: string }> = {}
    for (var si = 0; si < studentRows.length; si++) {
      studentMap[studentRows[si].id] = { name: studentRows[si].name, phone: studentRows[si].phone }
    }

    var baseQuestions: any[] = []
    var itemMeta: any = { id: id, type: type, title: '', grade: '', submissions: 0, createdAt: null }

    if (type === 'exam') {
      var exam: any = null
      try { exam = await db.exam.findUnique({ where: { id: id } }) } catch (e) {}
      if (!exam) return NextResponse.json({ error: 'الامتحان مش موجود' }, { status: 404 })
      itemMeta.title = exam.title
      itemMeta.grade = exam.grade
      itemMeta.createdAt = exam.createdAt
      baseQuestions = parseJson(exam.questions) || []
      var results: any[] = []
      try {
        results = await db.$queryRawUnsafe('SELECT id, studentId, score, maxScore, answers, writingGrades, submittedAt FROM ExamResult WHERE examId = ? ORDER BY submittedAt DESC', id)
      } catch (e) {
        try {
          var pr = await db.examResult.findMany({ where: { examId: id }, orderBy: { submittedAt: 'desc' } })
          results = pr.map(function (r: any) { return { id: r.id, studentId: r.studentId, score: r.score, maxScore: r.maxScore, answers: '', writingGrades: '', submittedAt: r.submittedAt } })
        } catch (e2) {}
      }
      itemMeta.submissions = results.length

      var stats: Record<number, QStat> = {}
      function ensureStat(idx: number, q: any): QStat {
        if (!stats[idx]) {
          var writing = isWritingQuestion(q)
          var opts = writing ? [] : (Array.isArray(q.options) ? q.options.map(function (o: any) { return String(o || '') }) : [])
          var correctIdx = writing ? -1 : (typeof q.correct === 'number' ? q.correct : -1)
          var keyless = writing ? false : (correctIdx < 0 || correctIdx >= opts.length || !opts[correctIdx] || opts[correctIdx] === 'N/A')
          stats[idx] = {
            idx: idx,
            text: qText(q),
            kind: writing ? 'writing' : 'mcq',
            options: opts,
            correctText: writing
              ? String(q.modelAnswer || q.answer || '').slice(0, 200)
              : (keyless ? '' : String.fromCharCode(65 + correctIdx) + ') ' + String(opts[correctIdx] || '')),
            keyless: keyless,
            allWrong: false,
            attempts: 0,
            wrong: 0,
            wrongStudents: [],
          }
        }
        return stats[idx]
      }

      for (var ri = 0; ri < results.length; ri++) {
        var r = results[ri]
        var studentId = String(r.studentId || '')
        var stu = studentMap[studentId] || { name: 'طالب', phone: '' }
        var answers = parseJson(r.answers)
        var wGrades: any[] = parseJson(r.writingGrades) || []
        var byOrig: Record<number, any> = {}
        for (var wi = 0; wi < wGrades.length; wi++) {
          var wg = wGrades[wi]
          if (wg && typeof wg.origIdx === 'number') byOrig[wg.origIdx] = wg
        }
        /* أسئلة الطالب الفعلية (نماذج الامتحان — كل طالب نموذجه) */
        var qs = baseQuestions
        try { qs = resolveQuestionsForStudent(exam, studentId, id) } catch (eQ) {}
        for (var qi = 0; qi < qs.length; qi++) {
          var q = qs[qi]
          var st = ensureStat(qi, q)
          if (st.kind === 'mcq') {
            var ans = lookupAnswer(answers, qi)
            var answered = ans !== undefined && ans !== null && ans !== ''
            st.attempts++
            var correctIdx2 = typeof q.correct === 'number' ? q.correct : -1
            var isC = answered && Number(ans) === correctIdx2
            if (!isC) {
              var ansText = (!answered)
                ? 'لم يتم الإجابة'
                : ((typeof ans === 'number' && q.options && q.options[ans]) ? String.fromCharCode(65 + ans) + ') ' + String(q.options[ans]) : String(ans).slice(0, 80))
              st.wrong++
              if (st.wrongStudents.length < 500) st.wrongStudents.push({ name: stu.name, phone: stu.phone, answerText: ansText })
            }
          } else {
            var g = byOrig[qi]
            if (!g) continue /* لسه pending — مبحسبهوش */
            st.attempts++
            var pts = typeof g.maxPoints === 'number' && g.maxPoints > 0 ? g.maxPoints : (typeof q.points === 'number' && q.points > 0 ? q.points : 1)
            var awarded = typeof g.awardedPoints === 'number' ? g.awardedPoints : 0
            var wIsC = g.isCorrect === true || (awarded > 0 && awarded >= Math.ceil(pts * 0.5))
            if (!wIsC) {
              st.wrong++
              if (st.wrongStudents.length < 500) {
                var extra = String(g.aiExtractedAnswer || g.answer || '').replace(/\[📷[^\]]*\]/g, '').trim().slice(0, 60)
                st.wrongStudents.push({ name: stu.name, phone: stu.phone, answerText: extra ? ('حل مكتوب: ' + extra) : 'حل مرفق (صورة/نص)' })
              }
            }
          }
        }
      }

      var qlist: QStat[] = Object.keys(stats).map(function (k) {
        /* (2026-و39) سؤال كل الطلاب غلطوا فيه → allWrong (العرض بيخفيه بملاحظة) */
        var q = stats[Number(k)]
        q.allWrong = q.attempts > 0 && q.wrong === q.attempts
        return q
      })
      /* الترتيب: أكتر سؤال غلط فوق — والأسئلة من غير مفتاح (غلظتهم مش ذنب الطلاب) تحت */
      qlist.sort(function (a, b) {
        if (a.keyless !== b.keyless) return a.keyless ? 1 : -1
        if (a.allWrong !== b.allWrong) return a.allWrong ? 1 : -1
        if (b.wrong !== a.wrong) return b.wrong - a.wrong
        return a.idx - b.idx
      })
      return NextResponse.json({ item: itemMeta, questions: qlist })
    }

    if (type === 'homework') {
      var hw: any = null
      try { hw = await db.homework.findUnique({ where: { id: id } }) } catch (e) {}
      if (!hw) return NextResponse.json({ error: 'الواجب مش موجود' }, { status: 404 })
      itemMeta.title = hw.title
      itemMeta.grade = hw.grade
      itemMeta.createdAt = hw.createdAt
      baseQuestions = parseJson(hw.questions) || []
      var hwResults: any[] = []
      try {
        hwResults = await db.$queryRawUnsafe('SELECT id, studentId, score, maxScore, answers, writingResults, submittedAt FROM HomeworkResult WHERE homeworkId = ? ORDER BY submittedAt DESC', id)
      } catch (e) {
        try {
          var pr2 = await (db as any).homeworkResult.findMany({ where: { homeworkId: id }, orderBy: { submittedAt: 'desc' } })
          hwResults = pr2.map(function (r: any) { return { id: r.id, studentId: r.studentId, score: r.score, maxScore: r.maxScore, answers: '', writingResults: '', submittedAt: r.submittedAt } })
        } catch (e2) {}
      }
      itemMeta.submissions = hwResults.length

      var stats2: Record<number, QStat> = {}
      function ensureStat2(idx: number, q: any): QStat {
        if (!stats2[idx]) {
          var writing = isWritingQuestion(q)
          var opts = writing ? [] : (Array.isArray(q.options) ? q.options.map(function (o: any) { return String(o || '') }) : [])
          var correctIdx = writing ? -1 : (typeof q.correct === 'number' ? q.correct : -1)
          var keyless = writing ? false : (correctIdx < 0 || correctIdx >= opts.length || !opts[correctIdx] || opts[correctIdx] === 'N/A')
          stats2[idx] = {
            idx: idx,
            text: qText(q),
            kind: writing ? 'writing' : 'mcq',
            options: opts,
            correctText: writing
              ? String(q.modelAnswer || q.answer || '').slice(0, 200)
              : (keyless ? '' : String.fromCharCode(65 + correctIdx) + ') ' + String(opts[correctIdx] || '')),
            keyless: keyless,
            allWrong: false,
            attempts: 0,
            wrong: 0,
            wrongStudents: [],
          }
        }
        return stats2[idx]
      }

      for (var ri2 = 0; ri2 < hwResults.length; ri2++) {
        var r2 = hwResults[ri2]
        var studentId2 = String(r2.studentId || '')
        var stu2 = studentMap[studentId2] || { name: 'طالب', phone: '' }
        var answers2 = parseJson(r2.answers)
        var wRes: any[] = parseJson(r2.writingResults) || []
        var byOrig2: Record<number, any> = {}
        for (var wi2 = 0; wi2 < wRes.length; wi2++) {
          var wr = wRes[wi2]
          if (wr && typeof wr.origIdx === 'number') byOrig2[wr.origIdx] = wr
        }
        for (var qi2 = 0; qi2 < baseQuestions.length; qi2++) {
          var q2 = baseQuestions[qi2]
          var st2 = ensureStat2(qi2, q2)
          if (st2.kind === 'mcq') {
            var ans2 = lookupAnswer(answers2, qi2)
            var answered2 = ans2 !== undefined && ans2 !== null && ans2 !== ''
            st2.attempts++
            var correctIdx3 = typeof q2.correct === 'number' ? q2.correct : -1
            var isC2 = answered2 && Number(ans2) === correctIdx3
            if (!isC2) {
              var ansText2 = (!answered2)
                ? 'لم يتم الإجابة'
                : ((typeof ans2 === 'number' && q2.options && q2.options[ans2]) ? String.fromCharCode(65 + ans2) + ') ' + String(q2.options[ans2]) : String(ans2).slice(0, 80))
              st2.wrong++
              if (st2.wrongStudents.length < 500) st2.wrongStudents.push({ name: stu2.name, phone: stu2.phone, answerText: ansText2 })
            }
          } else {
            var wGrade2 = byOrig2[qi2]
            if (!wGrade2) continue
            st2.attempts++
            var pts2 = typeof wGrade2.maxPoints === 'number' && wGrade2.maxPoints > 0 ? wGrade2.maxPoints : (typeof q2.points === 'number' && q2.points > 0 ? q2.points : 1)
            var awarded2 = typeof wGrade2.awardedPoints === 'number' ? wGrade2.awardedPoints : 0
            var wIsC2 = wGrade2.isCorrect === true || (awarded2 > 0 && awarded2 >= Math.ceil(pts2 * 0.5))
            if (!wIsC2) {
              st2.wrong++
              if (st2.wrongStudents.length < 500) {
                var extra2 = String(wGrade2.aiExtractedAnswer || wGrade2.answer || '').replace(/\[📷[^\]]*\]/g, '').trim().slice(0, 60)
                st2.wrongStudents.push({ name: stu2.name, phone: stu2.phone, answerText: extra2 ? ('حل مكتوب: ' + extra2) : 'حل مرفق (صورة/نص)' })
              }
            }
          }
        }
      }

      var qlist2: QStat[] = Object.keys(stats2).map(function (k) {
        /* (2026-و39) سؤال كل الطلاب غلطوا فيه → allWrong (العرض بيخفيه بملاحظة) */
        var q = stats2[Number(k)]
        q.allWrong = q.attempts > 0 && q.wrong === q.attempts
        return q
      })
      qlist2.sort(function (a, b) {
        if (a.keyless !== b.keyless) return a.keyless ? 1 : -1
        if (a.allWrong !== b.allWrong) return a.allWrong ? 1 : -1
        if (b.wrong !== a.wrong) return b.wrong - a.wrong
        return a.idx - b.idx
      })
      return NextResponse.json({ item: itemMeta, questions: qlist2 })
    }

    return NextResponse.json({ error: 'نوع غير معروف' }, { status: 400 })
  } catch (err: any) {
    console.error('item-analytics error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
