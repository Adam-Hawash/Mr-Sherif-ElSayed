// ============================================================
// /api/parent/answers — (2026-و39) إجابات الابن سؤال-بسؤال لولي الأمر
//   GET ?parentId=xx&type=homework|exam&resultId=xx
//   الولي أمر (المربوط بحساب ابنه بس) يشوف ورقة ابنه: كل سؤال
//   بإجابته والإجابة الصحيحة ودرجته وملاحظة المصحح الذكي.
//   الحماية: parent → student (ابنه فقط) — نتيجة غير ابنه = 403
//   نفس قواعد item-analytics في عرض النصوص: قص علامة الصورة +
//   الفاضي = «لم يتم الإجابة» + تطبيع مفتاح الإجابة normalizeCorrectKey
// ============================================================
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveQuestionsForStudent } from '@/lib/exam-models'
import { normalizeCorrectKey } from '@/lib/correct-key'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/* (2026-و38) شفاء ذاتي لجدول Parent — نفس حماية parent/results */
var parentDdlDone: Promise<void> | null = null
function ensureParentTable(): Promise<void> {
  if (!parentDdlDone) {
    parentDdlDone = (async function () {
      try {
        await db.$executeRawUnsafe("CREATE TABLE IF NOT EXISTS Parent (id TEXT PRIMARY KEY, name TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL UNIQUE, password TEXT NOT NULL DEFAULT '', studentId TEXT NOT NULL, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)")
        try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_parent_student ON Parent(studentId)') } catch (e) {}
      } catch (e) {
        parentDdlDone = null
      }
    })()
  }
  return parentDdlDone
}

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

/* قص علامة الصورة المرفقة من نص الإجابة (نفس قاعدة item-analytics) */
function stripImageMarker(t: any): string {
  return String(t || '').replace(/\[📷[^\]]*\]/g, '').trim()
}

/* نفس تصنيف exam-models: مقالي لو type writing/essay أو مفيش اختيارات صالحة */
function isWritingQuestion(q: any): boolean {
  if (!q) return true
  if (q.type === 'writing' || q.type === 'essay') return true
  var opts = Array.isArray(q.options) ? q.options : []
  if (opts.length === 0) return true
  var allNA = opts.every(function (o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
  return allNA
}

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var parentId = String(sp.get('parentId') || '')
    var type = String(sp.get('type') || '')
    var resultId = String(sp.get('resultId') || '')
    if (!parentId || !resultId || (type !== 'homework' && type !== 'exam')) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }

    /* parent → student (ابنه بس) */
    var parent: any = null
    try { await ensureParentTable() } catch (eDdl) {}
    try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (pErr) {}
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }
    var student: any = null
    try { student = await db.student.findUnique({ where: { id: parent.studentId } }) } catch (sErr) {}
    if (!student) {
      return NextResponse.json({ error: 'حساب ابنك مش موجود — سجل دخول تاني' }, { status: 401 })
    }

    /* النتيجة + العنصر (واجب/امتحان) — raw SQL الأول زي parent/results و findMany فولباك */
    var result: any = null
    var item: any = null
    var title = ''
    var submittedAt: any = null
    var answers: any = null
    var storedWriting: any[] = []

    if (type === 'exam') {
      try {
        var rows: any[] = await db.$queryRawUnsafe('SELECT id, studentId, examId, score, maxScore, answers, writingGrades, submittedAt FROM ExamResult WHERE id = ? LIMIT 1', resultId)
        if (rows && rows.length > 0) result = rows[0]
      } catch (e1) {}
      if (!result) {
        try {
          var pr = await db.examResult.findUnique({ where: { id: resultId } })
          if (pr) result = { id: pr.id, studentId: pr.studentId, examId: (pr as any).examId, score: pr.score, maxScore: pr.maxScore, answers: '', writingGrades: '', submittedAt: pr.submittedAt }
        } catch (e2) {}
      }
      if (!result) return NextResponse.json({ error: 'النتيجة مش موجودة' }, { status: 404 })
      if (String(result.studentId) !== String(student.id)) {
        return NextResponse.json({ error: 'النتيجة دي مش لابنك' }, { status: 403 })
      }
      try { item = await db.exam.findUnique({ where: { id: String(result.examId) } }) } catch (e3) {}
      if (!item) return NextResponse.json({ error: 'الامتحان مش موجود' }, { status: 404 })
      title = item.title || 'امتحان'
      answers = parseJson(result.answers)
      var wg = parseJson(result.writingGrades)
      if (Array.isArray(wg)) storedWriting = wg
    } else {
      try {
        var rows2: any[] = await db.$queryRawUnsafe('SELECT id, studentId, homeworkId, score, maxScore, answers, writingResults, submittedAt FROM HomeworkResult WHERE id = ? LIMIT 1', resultId)
        if (rows2 && rows2.length > 0) result = rows2[0]
      } catch (e1) {}
      if (!result) {
        try {
          var pr2: any = await (db as any).homeworkResult.findUnique({ where: { id: resultId } })
          if (pr2) result = { id: pr2.id, studentId: pr2.studentId, homeworkId: pr2.homeworkId, score: pr2.score, maxScore: pr2.maxScore, answers: '', writingResults: '', submittedAt: pr2.submittedAt }
        } catch (e2) {}
      }
      if (!result) return NextResponse.json({ error: 'النتيجة مش موجودة' }, { status: 404 })
      if (String(result.studentId) !== String(student.id)) {
        return NextResponse.json({ error: 'النتيجة دي مش لابنك' }, { status: 403 })
      }
      try { item = await db.homework.findUnique({ where: { id: String(result.homeworkId) } }) } catch (e3) {}
      if (!item) return NextResponse.json({ error: 'الواجب مش موجود' }, { status: 404 })
      title = item.title || 'واجب'
      answers = parseJson(result.answers)
      var wr = parseJson(result.writingResults)
      if (Array.isArray(wr)) storedWriting = wr
    }

    submittedAt = result.submittedAt || null

    /* أسئلة الطالب الفعلية — الامتحان بنموذجه (resolveQuestionsForStudent) */
    var qs: any[] = []
    if (type === 'exam') {
      try {
        qs = resolveQuestionsForStudent(item, String(student.id), String(result.examId))
      } catch (eQ) {
        qs = parseJson(item.questions) || []
      }
    } else {
      qs = parseJson(item.questions) || []
    }

    /* حكم المقالي المخزن بالفهرس الأصلي → نص السؤال → الموضع (نفس ترتيب item-analytics) */
    var byOrig: Record<number, any> = {}
    for (var wi = 0; wi < storedWriting.length; wi++) {
      var sw = storedWriting[wi]
      if (sw && typeof sw.origIdx === 'number') byOrig[sw.origIdx] = sw
    }

    var questions: any[] = []
    for (var qi = 0; qi < qs.length; qi++) {
      var q = qs[qi]
      var qText = String(q.question || q.q || ('السؤال ' + (qi + 1)))
      var writing = isWritingQuestion(q)

      if (!writing) {
        var opts = Array.isArray(q.options) ? q.options.map(function (o: any) { return String(o || '') }) : []
        /* (2026-و39) نفس تطبيع submit — رقم/نص رقمي/حرف/نص الخيار بدل التخمين على A */
        var correctIdx = normalizeCorrectKey(q, opts)
        var keyless = correctIdx < 0 || correctIdx >= opts.length || !opts[correctIdx] || opts[correctIdx] === 'N/A'
        var ans = lookupAnswer(answers, qi)
        var answered = ans !== undefined && ans !== null && ans !== ''
        var isC = !keyless && answered && Number(ans) === correctIdx
        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
        var ansText = (!answered)
          ? 'لم يتم الإجابة'
          : ((typeof ans === 'number' && opts[ans]) ? String.fromCharCode(65 + ans) + ') ' + opts[ans] : (stripImageMarker(ans) || 'لم يتم الإجابة'))
        questions.push({
          idx: qi,
          text: qText,
          kind: 'mcq',
          options: opts,
          studentAnswer: ansText,
          correctAnswer: keyless
            ? '⚠ السؤال ده محتاج مراجعة المستر — إجابته مش مؤكدة في مفتاح الدرجات'
            : (String.fromCharCode(65 + correctIdx) + ') ' + String(opts[correctIdx] || '')),
          isCorrect: isC,
          awardedPoints: isC ? pts : 0,
          maxPoints: pts,
          feedback: '',
        })
      } else {
        var g = byOrig[qi] || storedWriting.find(function (sw2: any) { return sw2 && (sw2.question || '') === qText }) || null
        var wPts = (typeof q.points === 'number' && q.points > 0) ? q.points : (g && typeof g.maxPoints === 'number' && g.maxPoints > 0 ? g.maxPoints : 5)
        var awarded = g && typeof g.awardedPoints === 'number' ? g.awardedPoints : 0
        var maxPoints = g && typeof g.maxPoints === 'number' && g.maxPoints > 0 ? g.maxPoints : wPts
        var wIsC = !!g && (g.isCorrect === true || (awarded > 0 && awarded >= Math.ceil(maxPoints * 0.5)))
        var studentText = stripImageMarker(g ? (g.aiExtractedAnswer || g.answer || '') : (lookupAnswer(answers, qi) || ''))
        questions.push({
          idx: qi,
          text: qText,
          kind: 'writing',
          options: [],
          studentAnswer: studentText || 'لم يتم الإجابة',
          correctAnswer: String(q.modelAnswer || q.answer || '').slice(0, 200),
          isCorrect: wIsC,
          awardedPoints: awarded,
          maxPoints: maxPoints,
          feedback: g ? String(g.aiFeedback || g.feedback || '') : 'بيتصحح بالذكاء الاصطناعي… حدّث الصفحة بعد لحظات',
        })
      }
    }

    return NextResponse.json({
      title: title,
      submittedAt: submittedAt,
      score: typeof result.score === 'number' ? result.score : 0,
      maxScore: typeof result.maxScore === 'number' ? result.maxScore : 0,
      questions: questions,
    })
  } catch (err: any) {
    console.error('parent/answers error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
