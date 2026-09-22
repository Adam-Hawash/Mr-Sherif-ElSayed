import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveQuestionsForStudent } from '@/lib/exam-models'
import { normalizeCorrectKey } from '@/lib/correct-key'
import { resolveParentStudent } from '@/lib/parent-students'

/* (2026-و38) شفاء ذاتي لجدول Parent — نفس حماية مسارات التسجيل والدخول والنتايج */
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

// ============================================================
// (2026-و39) متابعة ولي الأمر — إجابات الابن سؤال-بسؤال:
//   GET ?parentId=xx&type=homework|exam&resultId=xx
//   → { title, submittedAt, score, maxScore, questions: [{ idx, text, kind,
//        options, studentAnswer, correctAnswer, isCorrect, awardedPoints,
//        maxPoints, feedback }] }
// الحماية: ولي الأمر يشوف إجابات ابنه بس (result.studentId لازم يطابق
// student.id — أي نتيجة لطالب تاني = 403) — الأدمن بس هو اللي يشوف الكل.
// ============================================================

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

/* نفس تصنيف item-analytics: مقالي لو type writing/essay أو مفيش اختيارات أو كلها N/A */
function isWritingQuestion(q: any): boolean {
  if (!q) return true
  if (q.type === 'writing' || q.type === 'essay') return true
  var opts = Array.isArray(q.options) ? q.options : []
  if (opts.length === 0) return true
  var allNA = opts.every(function (o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
  return allNA
}

/* بناء إجابة الاختياري بشكل حرف + نص الخيار (زي شاشات المراجعة) */
function mcqAnswerText(ans: any, opts: any[]): string {
  if (ans === undefined || ans === null || ans === '') return 'لم يتم الإجابة'
  if (typeof ans === 'number' && opts && opts[ans] !== undefined && opts[ans] !== null) {
    return String.fromCharCode(65 + ans) + ') ' + String(opts[ans])
  }
  return String(ans)
}

export async function GET(request: NextRequest) {
  try {
    var sp = new URL(request.url).searchParams
    var parentId = sp.get('parentId') || ''
    var type = String(sp.get('type') || '')
    var resultId = String(sp.get('resultId') || '')
    /* (2026-و79) ولي الأمر بعدة أبناء — الابن المطلوب من الـ query */
    var studentIdParam = sp.get('studentId') || ''
    if (!parentId || (type !== 'homework' && type !== 'exam') || !resultId) {
      return NextResponse.json({ error: 'طلب ناقص' }, { status: 400 })
    }

    var parent = null as any
    try { await ensureParentTable() } catch (eDdl) {}
    try { parent = await db.parent.findUnique({ where: { id: parentId } }) } catch (pErr) {}
    if (!parent) {
      return NextResponse.json({ error: 'جلسة ولي الأمر منتهية — سجل دخول تاني' }, { status: 401 })
    }

    /* (2026-و79) الابن المختار لازم يكون من أبناء ولي الأمر فعلًا */
    var resolved = await resolveParentStudent(parent, studentIdParam)
    var student: any = resolved.selected
    if (!student) {
      return NextResponse.json({ error: 'حساب ابنك مش موجود في المنصة حاليًا' }, { status: 404 })
    }

    /* ---------- تحميل النتيجة (RAW عشان answers + writingResults/writingGrades مع بعض) ---------- */
    var result: any = null
    var questions: any[] = []
    var item: any = null

    if (type === 'homework') {
      try {
        var rows: any[] = await db.$queryRawUnsafe('SELECT id, studentId, homeworkId, score, maxScore, answers, writingResults, submittedAt FROM HomeworkResult WHERE id = ?', resultId)
        result = rows && rows.length > 0 ? rows[0] : null
      } catch (eRaw) {}
      if (!result) {
        try {
          var pr = await db.homeworkResult.findUnique({ where: { id: resultId } })
          if (pr) result = { id: pr.id, studentId: pr.studentId, homeworkId: (pr as any).homeworkId, score: pr.score, maxScore: pr.maxScore, answers: '', writingResults: '', submittedAt: pr.submittedAt }
        } catch (ePr) {}
      }
      if (!result) return NextResponse.json({ error: 'النتيجة مش موجودة' }, { status: 404 })
      if (String(result.studentId || '') !== String(student.id)) {
        return NextResponse.json({ error: 'غير مصرح — النتيجة دي مش لابنك' }, { status: 403 })
      }
      try { item = await db.homework.findUnique({ where: { id: String(result.homeworkId || '') } }) } catch (eItem) {}
      questions = parseJson(item && item.questions) || []
    } else {
      try {
        var rows2: any[] = await db.$queryRawUnsafe('SELECT id, studentId, examId, score, maxScore, answers, writingGrades, submittedAt FROM ExamResult WHERE id = ?', resultId)
        result = rows2 && rows2.length > 0 ? rows2[0] : null
      } catch (eRaw2) {}
      if (!result) {
        try {
          var pr2 = await db.examResult.findUnique({ where: { id: resultId } })
          if (pr2) result = { id: pr2.id, studentId: pr2.studentId, examId: (pr2 as any).examId, score: pr2.score, maxScore: pr2.maxScore, answers: '', writingGrades: '', submittedAt: pr2.submittedAt }
        } catch (ePr2) {}
      }
      if (!result) return NextResponse.json({ error: 'النتيجة مش موجودة' }, { status: 404 })
      if (String(result.studentId || '') !== String(student.id)) {
        return NextResponse.json({ error: 'غير مصرح — النتيجة دي مش لابنك' }, { status: 403 })
      }
      try { item = await db.exam.findUnique({ where: { id: String(result.examId || '') } }) } catch (eItem2) {}
      /* أسئلة الطالب الفعلية (نماذج الامتحان — كل طالب نموذجه) زي item-analytics بالظبط */
      try { questions = resolveQuestionsForStudent(item, student.id, String(result.examId || '')) } catch (eQ) {}
      if (!questions || questions.length === 0) questions = parseJson(item && item.questions) || []
    }

    var answers = parseJson(result.answers)
    var writingEntries: any[] = []
    if (type === 'homework') writingEntries = parseJson(result.writingResults) || []
    else writingEntries = parseJson(result.writingGrades) || []
    var byOrig: Record<number, any> = {}
    for (var wi = 0; wi < writingEntries.length; wi++) {
      var wEntry = writingEntries[wi]
      if (wEntry && typeof wEntry.origIdx === 'number') byOrig[wEntry.origIdx] = wEntry
    }

    /* ---------- بناء الأسئلة (مرآة item-analytics) ---------- */
    var out: any[] = []
    for (var qi = 0; qi < questions.length; qi++) {
      var q = questions[qi]
      var writing = isWritingQuestion(q)
      var opts = writing ? [] : (Array.isArray(q.options) ? q.options.map(function (o: any) { return String(o || '') }) : [])
      var correctIdx = writing ? -1 : normalizeCorrectKey(q, opts)
      var keyless = !writing && (correctIdx < 0 || correctIdx >= opts.length)

      var studentAnswer = ''
      var correctAnswer = ''
      var isCorrect = false
      var awardedPoints: any = undefined
      var maxPoints: any = undefined
      var feedback = ''

      if (writing) {
        var g = byOrig[qi]
        var rawAns = lookupAnswer(answers, qi)
        studentAnswer = rawAns !== undefined && rawAns !== null ? String(rawAns) : ''
        if (g) {
          /* (2026-و39) نص إجابة الابن من قيد التصحيح نفسه (بيشمل اللي الـ AI قراه من الصورة)
             — بنشيل علامات الصور — ولو مش موجود نرجع لإجابة الخريطة */
          var entryText = String(g.aiExtractedAnswer || g.answer || '').replace(/\[📷[^\]]*\]/g, '').trim()
          if (entryText) studentAnswer = entryText
          var pts = typeof g.maxPoints === 'number' && g.maxPoints > 0 ? g.maxPoints : (typeof q.points === 'number' && q.points > 0 ? q.points : 1)
          var awarded = typeof g.awardedPoints === 'number' ? g.awardedPoints : 0
          /* نفس قاعدة item-analytics: صح بالحكم أو بالدرجة (نص الدرجات فوق) */
          isCorrect = g.isCorrect === true || (awarded > 0 && awarded >= Math.ceil(pts * 0.5))
          awardedPoints = awarded
          maxPoints = pts
          feedback = String(g.aiFeedback || g.feedback || '').replace(/\[📷[^\]]*\]/g, '').trim()
          if (g.pending === true || g.gradingStatus === 'pending') feedback = feedback || 'بيتصحح دلوقتي بالذكاء الاصطناعي… حدّث بعد لحظات'
        }
        correctAnswer = String(q.modelAnswer || q.answer || '').slice(0, 300)
      } else {
        var ans = lookupAnswer(answers, qi)
        var answered = ans !== undefined && ans !== null && ans !== ''
        studentAnswer = mcqAnswerText(ans, opts)
        if (!keyless) correctAnswer = String.fromCharCode(65 + correctIdx) + ') ' + String(opts[correctIdx] || '')
        isCorrect = answered && Number(ans) === correctIdx
      }

      out.push({
        idx: qi,
        text: String((q && (q.question || q.q)) || ''),
        kind: writing ? 'writing' : 'mcq',
        options: opts,
        studentAnswer: studentAnswer,
        correctAnswer: correctAnswer,
        isCorrect: isCorrect,
        awardedPoints: awardedPoints,
        maxPoints: maxPoints,
        feedback: feedback,
      })
    }

    return NextResponse.json({
      title: (item && item.title) || (type === 'homework' ? 'واجب' : 'امتحان'),
      submittedAt: result.submittedAt,
      score: result.score,
      maxScore: result.maxScore,
      questions: out,
    })
  } catch (err: any) {
    console.error('Parent answers error:', err)
    return NextResponse.json({ error: 'حدث خطأ مؤقت في السيرفر — جرب تاني بعد لحظات' }, { status: 500 })
  }
}
