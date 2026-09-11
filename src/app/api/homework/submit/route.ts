// @ts-nocheck
// POST /api/homework/submit - Submit homework answers, save result INSTANTLY,
// then grade writing questions IN PARALLEL in the background.
//
// WHY (user complaint: submission slower than the upload itself, AI slow):
//  - OLD flow: one SEQUENTIAL Gemini call per writing question BEFORE
//    responding → 3 questions ≈ 3 × 15-25s of staring at a spinner.
//  - NEW flow: MCQ is graded locally (instant), the result row is saved
//    immediately with writing questions marked "pending", the API responds,
//    and `after()` grades ALL writing questions IN PARALLEL then updates the
//    row. The student polls /api/homework/result/[id] and sees grades appear.

import { NextResponse, after } from 'next/server'
import { db } from '@/lib/db'
import { gradeImageAnswer, gradeTextAnswer, extractImageMediaIds, finalAnswerCandidates } from '@/lib/ai-image-grader'
import { gradeFallbackDecisive, quickSmartMatch } from '@/lib/smart-grader'
import { checkHwSequential } from '@/lib/sequential-guard'

export const runtime = 'nodejs'
export const maxDuration = 120

// Ensure table exists (+ writingResults column for background-graded verdicts)
async function ensureTable() {
  try {
    try {
      await db.$executeRawUnsafe(`
        CREATE TABLE IF NOT EXISTS HomeworkResult (
          id TEXT PRIMARY KEY,
          homeworkId TEXT NOT NULL,
          studentId TEXT NOT NULL,
          score REAL NOT NULL DEFAULT 0,
          maxScore REAL NOT NULL DEFAULT 100,
          answers TEXT DEFAULT '',
          submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    } catch (e) {}

    var needsRebuild = false
    try {
      var cols = await db.$queryRawUnsafe('PRAGMA table_info(HomeworkResult)')
      var hasSubmittedAt = (cols || []).some(function(c) { return c.name === 'submittedAt' })
      if (!hasSubmittedAt) needsRebuild = true
    } catch (e) {}

    if (needsRebuild) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE HomeworkResult RENAME TO HomeworkResult_old')
        await db.$executeRawUnsafe(`
          CREATE TABLE HomeworkResult (
            id TEXT PRIMARY KEY,
            homeworkId TEXT NOT NULL,
            studentId TEXT NOT NULL,
            score REAL NOT NULL DEFAULT 0,
            maxScore REAL NOT NULL DEFAULT 100,
            answers TEXT DEFAULT '',
            submittedAt DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `)
        try {
          await db.$executeRawUnsafe(`
            INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, answers, submittedAt)
            SELECT id, homeworkId, studentId, score, maxScore,
                   CASE WHEN answers IS NULL OR answers = '' THEN '' ELSE answers END,
                   CURRENT_TIMESTAMP
            FROM HomeworkResult_old
          `)
        } catch (copyErr) {
          try {
            await db.$executeRawUnsafe(`
              INSERT INTO HomeworkResult (id, homeworkId, studentId, score, maxScore, submittedAt)
              SELECT id, homeworkId, studentId, score, maxScore, CURRENT_TIMESTAMP
              FROM HomeworkResult_old
            `)
          } catch (copyErr2) {
            console.error('Copy old homework data error:', copyErr2)
          }
        }
        await db.$executeRawUnsafe('DROP TABLE HomeworkResult_old')
      } catch (rebuildErr) {
        console.error('Rebuild HomeworkResult error:', rebuildErr)
        try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult_old RENAME TO HomeworkResult') } catch (e) {}
      }
    }

    // writingResults column — persisted AI verdicts (single source of truth)
    try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN writingResults TEXT DEFAULT \'\'') } catch (e) {}
  } catch (e) {
    console.error('Ensure HomeworkResult table error:', e)
  }
}

/* quick local text match — EQUIVALENCE of the FINAL answer only (no literal
 * substring: "15" must never match accepted "5"). Anything not confidently
 * equivalent goes to the AI which UNDERSTANDS the answer. */
function quickTextMatch(answerText: string, modelAnswer: string, acceptedAnswers: string[]): boolean {
  return quickSmartMatch(answerText, modelAnswer, acceptedAnswers || []) === true
}

export async function POST(request) {
  try {
    var body = await request.json()
    var studentId = body.studentId
    var homeworkId = body.homeworkId
    var answers = body.answers

    if (!studentId || !homeworkId) {
      return NextResponse.json({ error: 'بيانات مفقودة' }, { status: 400 })
    }

    await ensureTable()

    // Check double submission
    try {
      var existing = await db.$queryRawUnsafe(
        'SELECT id, score, maxScore FROM HomeworkResult WHERE studentId = ? AND homeworkId = ? LIMIT 1',
        studentId, homeworkId
      )
      if (existing && existing.length > 0) {
        return NextResponse.json({
          success: true,
          alreadySubmitted: true,
          result: { id: existing[0].id, score: existing[0].score, maxScore: existing[0].maxScore },
        }, { status: 200 })
      }
    } catch (e) {
      console.error('Check existing hw error:', e)
    }

    // الترتيب التسلسلي (نفس نظام الفيديوهات — طلب المستر):
    // الواجب مينفعش يتسلّم غير لما الواجب اللي قبله يكون متسلّم
    try {
      var seqCheck = await checkHwSequential(homeworkId, studentId)
      if (!seqCheck.ok) {
        return NextResponse.json({ error: seqCheck.reason, sequentialLocked: true }, { status: seqCheck.code || 423 })
      }
    } catch (e) {}

    // Fetch homework questions
    var homework = null
    try {
      var hwRows = await db.$queryRawUnsafe(
        'SELECT id, title, questions, targetStudentIds FROM Homework WHERE id = ? LIMIT 1',
        homeworkId
      )
      homework = hwRows && hwRows.length > 0 ? hwRows[0] : null
    } catch (e) {
      console.error('Fetch homework error:', e)
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }
    if (!homework) {
      return NextResponse.json({ error: 'الواجب غير موجود' }, { status: 404 })
    }

    /* (2026-و26) حارس الاستهداف: الواجب الموجه لطلاب محددين — التسليم
       مسموح للي اسمه في القايمة بس */
    try {
      var tParsed = JSON.parse(String((homework as any).targetStudentIds || '[]'))
      if (Array.isArray(tParsed) && tParsed.length > 0 && tParsed.indexOf(String(studentId)) === -1) {
        return NextResponse.json({ error: 'الواجب ده مش موجه ليك — كلمني لو فيه غلط' }, { status: 403 })
      }
    } catch (e) {}

    /* قراءة إجابة الطالب **بالفهرس الأصلي** للسؤال — نفس طريقة الامتحان
     * (2026-و20 — العلة اللي كانت بتخلي «أي إجابة مقالي بتتحسب غلط في الواجب»):
     * العميل بيبعت الإجابات مفتاحها الفهرس الأصلي للسؤال في قايمة الأسئلة الكاملة
     * (origIdx — زي الامتحان بالظبط)، والكود القديم كان بيقرأ بترقيم مضغوط
     * (answers[i] للاختياري وanswers[mcqLen + i] للمقالي) — أول ما ييجي سؤال
     * مقالي قبل اختياري كل الفهارس بتتزحزح: السيرفر يقرأ رقم اختيار أو نص سؤال
     * تاني ويصحح **كلام مش إجابة الطالب** → كل المقالي غلط! */
    function lookupAnswer(ans: any, idx: number): any {
      try {
        if (Array.isArray(ans)) return ans[idx]
        if (ans !== null && typeof ans === 'object') {
          return ans[idx] !== undefined ? ans[idx] : ans[String(idx)]
        }
      } catch (e) {}
      return undefined
    }

    // Parse questions (مع تتبع الفهرس الأصلي لكل سؤال)
    var mcq: any[] = []
    var writingQuestions: any[] = []
    if (homework.questions) {
      try {
        var raw = typeof homework.questions === 'string' ? JSON.parse(homework.questions) : homework.questions
        if (Array.isArray(raw)) {
          raw.forEach(function(q, idx) {
            var isWriting = q.type === 'writing' || q.type === 'essay'
            if (!isWriting && Array.isArray(q.options)) {
              var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
              if (allNA) isWriting = true
            }
            if (!isWriting && (!q.options || q.options.length === 0)) {
              isWriting = true
            }
            if (isWriting) {
              writingQuestions.push({ q: q, origIdx: idx })
            } else {
              mcq.push({ q: q, origIdx: idx })
            }
          })
        }
      } catch (e) {
        console.error('Parse homework questions error:', e)
      }
    }
    if (mcq.length === 0 && writingQuestions.length === 0) {
      return NextResponse.json({ error: 'لا توجد أسئلة في الواجب' }, { status: 400 })
    }

    // ============ MCQ: graded locally, INSTANT (بالفهرس الأصلي) ============
    var score = 0
    var maxScore = 0
    var wrongQuestions = []

    mcq.forEach(function(item) {
      var q = item.q
      var origIdx = item.origIdx
      var qText = q.question || q.q || ''
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts
      var opts = Array.isArray(q.options) ? q.options : []
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx >= opts.length) { correctIdx = 0 }

      var studentAnswer = lookupAnswer(answers, origIdx)

      if (studentAnswer !== undefined && studentAnswer !== null && Number(studentAnswer) === correctIdx) {
        score += pts
      } else {
        wrongQuestions.push({
          question: qText,
          studentAnswer: (typeof studentAnswer === 'number' && opts[studentAnswer])
            ? String.fromCharCode(65 + studentAnswer) + ') ' + opts[studentAnswer]
            : 'لم يتم الإجابة',
          correctAnswer: opts[correctIdx]
            ? String.fromCharCode(65 + correctIdx) + ') ' + opts[correctIdx]
            : '',
        })
      }
    })

    if (maxScore === 0) { maxScore = mcq.length }
    var mcqScore = score

    // ============ Writing questions: saved as PENDING, graded in background (بالفهرس الأصلي) ============
    var writingAnswers: any[] = []
    writingQuestions.forEach(function(item) {
      var q = item.q
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
      maxScore += pts

      var qText = q.question || q.q || ''
      var sa = lookupAnswer(answers, item.origIdx)
      var studentText = sa !== undefined && sa !== null ? String(sa) : ''

      writingAnswers.push({
        /* (2026-و22) الفهرس الأصلي بيتخزن مع الحكم — شاشات العرض بتطابق بيه
           بدل ما تخمّن بالترتيب (المطابقة الموضعية كانت ببعثر الورق) */
        origIdx: item.origIdx,
        question: qText,
        answer: typeof studentText === 'string' ? studentText : String(studentText || ''),
        points: pts,
        maxPoints: pts,
        modelAnswer: q.modelAnswer || q.answer || '',
        acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
        needsGrading: true,
        gradingStatus: 'pending',
        feedback: 'جاري التصحيح بالذكاء الاصطناعي...',
      })
    })

    // ============ SAVE RESULT IMMEDIATELY ============
    var resultId = 'hwr_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
    var answersJson = ''
    if (answers !== undefined && answers !== null) {
      try { answersJson = JSON.stringify(answers) } catch(e) { answersJson = '' }
    }

    var inserted = false
    try {
      await db.$executeRawUnsafe(
        'INSERT INTO HomeworkResult (id, studentId, homeworkId, score, maxScore, answers, writingResults, submittedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
        resultId, studentId, homeworkId, score, maxScore, answersJson, JSON.stringify(writingAnswers)
      )
      inserted = true
    } catch (insertErr) {
      console.error('Insert homework result error:', insertErr)
      try {
        await db.$executeRawUnsafe(
          'INSERT INTO HomeworkResult (id, studentId, homeworkId, score, maxScore, answers, submittedAt) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)',
          resultId, studentId, homeworkId, score, maxScore, answersJson
        )
        inserted = true
      } catch (retryErr) {
        console.error('Retry insert homework result error:', retryErr)
        return NextResponse.json({ error: 'حصلت مشكلة في حفظ النتيجة' }, { status: 500 })
      }
    }

    var hasWriting = writingAnswers.length > 0

    // Respond INSTANTLY — the student is out of here in <1s
    var responsePayload = {
      success: true,
      submitted: true,
      pendingGrading: hasWriting,
      result: {
        id: resultId,
        score: score,
        maxScore: maxScore,
        submittedAt: new Date().toISOString(),
        wrongQuestions: wrongQuestions,
        writingAnswers: writingAnswers,
        hasWritingQuestions: hasWriting,
        writingGraded: false,
        writingScore: 0,
      },
    }

    // ============ BACKGROUND: grade ALL writing questions IN PARALLEL ============
    // المستر طلب: مفيش حاجة اسمها تصحيح يدوي — كل سؤال بياخد حكم نهائي من
    // الـ AI، ولو الـ AI فشل بياخد حكم محلي حاسم (المستر يقدر يعدّل بعدها).
    var decisiveImageFallback = function(wa: any) {
      var hasRealWork = (wa.answer || '').replace(/\[📷[^\]]*\]/g, '').trim().length > 0
      if (!hasRealWork) {
        return Object.assign({}, wa, {
          gradingStatus: 'graded', needsGrading: false, isCorrect: false, awardedPoints: 0,
          feedback: 'لم يتم الإجابة',
        })
      }
      // صورة اترفعت والـ AI مقدرش يحكم — نص الحسم: نص درجة المحاولة + المستر يراجع
      return Object.assign({}, wa, {
        gradingStatus: 'graded',
        needsGrading: false,
        isCorrect: false,
        awardedPoints: Math.ceil(wa.points / 2),
        aiExtractedAnswer: '(صورة الحل مقدرناش نقراها بدقة)',
        aiIsCorrect: false,
        aiFeedback: 'صورة الحل اترفعت — التصحيح الآلي محتاج مراجعة المستر للدرجة دي',
        feedback: 'صورة الحل اترفعت — درجة مؤقتة لحد مراجعة المستر (يقدر يعدلها من لوحته)',
      })
    }

    var gradeOneWriting = async function(wa: any) {
      var answerText = (wa.answer || '').trim()

      // --- IMAGE answer → one multimodal AI call
      var mediaIds = extractImageMediaIds(answerText)
      if (mediaIds.length > 0) {
        try {
          var gradeData = await gradeImageAnswer({
            mediaId: mediaIds[0],
            question: wa.question,
            modelAnswer: wa.modelAnswer,
            acceptedAnswers: wa.acceptedAnswers,
            maxPoints: wa.points,
          })
          if (gradeData && !gradeData.needsGrading) {
            return Object.assign({}, wa, {
              gradingStatus: 'graded',
              needsGrading: false,
              aiExtractedAnswer: gradeData.extractedAnswer || '',
              aiIsCorrect: gradeData.isCorrect === true,
              aiFeedback: gradeData.feedback || '',
              aiAwardedPoints: gradeData.awardedPoints || 0,
              isCorrect: gradeData.isCorrect === true,
              awardedPoints: gradeData.awardedPoints || 0,
              feedback: gradeData.feedback || '',
            })
          }
          // AI مش متأكد / فشل → حكم محلي حاسم (مفيش manual)
          return decisiveImageFallback(wa)
        } catch (gradeErr) {
          console.error('[HW BG] AI grade image error:', gradeErr)
          return decisiveImageFallback(wa)
        }
      }

      // --- TEXT answer
      if (!answerText || answerText === '[📷 صورة مرفقة]') {
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: false,
          awardedPoints: 0,
          feedback: 'لم يتم الإجابة',
        })
      }
      if (!wa.modelAnswer && (!wa.acceptedAnswers || wa.acceptedAnswers.length === 0)) {
        // No model answer → the AI SOLVES the question itself and grades
        // (old behavior: "يحتاج تصحيح يدوي" — the teacher wants nothing left ungraded)
        try {
          var noModelGrade = await gradeTextAnswer({
            question: wa.question,
            studentAnswer: answerText,
            modelAnswer: '',
            acceptedAnswers: wa.acceptedAnswers,
            maxPoints: wa.points,
          })
          if (noModelGrade) {
            return Object.assign({}, wa, {
              gradingStatus: 'graded',
              needsGrading: false,
              aiExtractedAnswer: answerText,
              aiIsCorrect: noModelGrade.isCorrect === true,
              aiFeedback: noModelGrade.feedback || '',
              aiAwardedPoints: noModelGrade.awardedPoints || 0,
              isCorrect: noModelGrade.isCorrect === true,
              awardedPoints: noModelGrade.awardedPoints || 0,
              feedback: noModelGrade.feedback || '',
            })
          }
        } catch (noModelErr) {
          console.error('[HW BG] no-model-answer grade error:', noModelErr)
        }
        // AI unavailable → count attempted work instead of leaving it ungraded
        var hasWork = answerText.replace(/\[📷[^\]]*\]/g, '').trim().length >= 3
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: hasWork,
          awardedPoints: hasWork ? Math.ceil(wa.points / 2) : 0,
          feedback: hasWork ? 'إجابة مكتوبة — المستر هيظبط الدرجة النهائية' : 'لم يتم الإجابة',
        })
      }
      // fast local match
      if (quickTextMatch(answerText, wa.modelAnswer, wa.acceptedAnswers)) {
        /* (و24) ملاحظة شخصية زي معلم بيتكلم مع الطالب — حتى في المسار السريع */
        var fcNote = (finalAnswerCandidates(answerText)[0] || answerText.trim() || '').slice(0, 40)
        var noteTxt = 'برافو عليك ✓ إجابتك صح — الإجابة النهائية (' + fcNote + ') مطابقة للإجابة الصحيحة'
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: true,
          awardedPoints: wa.points,
          aiExtractedAnswer: answerText,
          aiIsCorrect: true,
          aiFeedback: noteTxt,
          aiAwardedPoints: wa.points,
          feedback: noteTxt,
        })
      }
      // AI text grading
      try {
        var textGrade = await gradeTextAnswer({
          question: wa.question,
          studentAnswer: answerText,
          modelAnswer: wa.modelAnswer,
          acceptedAnswers: wa.acceptedAnswers,
          maxPoints: wa.points,
        })
        if (textGrade && !textGrade.needsGrading) {
          return Object.assign({}, wa, {
            gradingStatus: 'graded',
            needsGrading: false,
            isCorrect: textGrade.isCorrect === true,
            awardedPoints: textGrade.awardedPoints || 0,
            aiExtractedAnswer: answerText,
            aiIsCorrect: textGrade.isCorrect === true,
            aiFeedback: textGrade.feedback || '',
            aiAwardedPoints: textGrade.awardedPoints || 0,
            feedback: textGrade.feedback || '',
          })
        }
        // AI رجّع حاجة مفهوماش → حكم محلي حاسم (مفيش manual)
        var fb1 = gradeFallbackDecisive({
          question: wa.question,
          answer: answerText,
          modelAnswer: wa.modelAnswer || '',
          acceptedAnswers: wa.acceptedAnswers || [],
          points: wa.points,
        })
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: fb1.isCorrect,
          awardedPoints: fb1.awardedPoints,
          feedback: fb1.feedback,
        })
      } catch (textGradeErr) {
        console.error('[HW BG] AI text grading error:', textGradeErr)
        var fb2 = gradeFallbackDecisive({
          question: wa.question,
          answer: answerText,
          modelAnswer: wa.modelAnswer || '',
          acceptedAnswers: wa.acceptedAnswers || [],
          points: wa.points,
        })
        return Object.assign({}, wa, {
          gradingStatus: 'graded',
          needsGrading: false,
          isCorrect: fb2.isCorrect,
          awardedPoints: fb2.awardedPoints,
          feedback: fb2.feedback,
        })
      }
    }

    var backgroundGrading = async function() {
      /* (2026-و25) — إصلاح جذري لشكوى «بيديه كله غلط»: النداءات المتوازية
         (Promise.all) كانت بتبعت N طلبات Gemini في نفس اللحظة على مفتاح واحد
         مجاني → 429 rate limit لكل النداءات → فولباك حاسم → similarity أقل من
         0.55 → صفر «كله غلط». الحل: تسلسل النداءات (نداء واحد في المرة) —
         callGemini نفسها بتتداول المفاتيح/الموديلز على 429، وcallGrader عملت
         له backoff صريح (1.5s ثم 4s) — فالتسلسل بيخلي النداءات متباعدة
         ومتشبعلش حد الـ RPM.
         + partial persist: كل سؤال يتصحح يتحفظ فورًا في writingResults
         (والدرجة تتحديث) — لو التسليم الخلفي اتقطع (serverless timeout) اللي
         اتصحح مش بيضيع، والباقي بيفضل pending لحد الإصلاح الذاتي يكمّله. */
      var gradedList = writingAnswers.slice()
      var writingScore = 0
      var persistPartial = async function() {
        try {
          await db.$executeRawUnsafe(
            'UPDATE HomeworkResult SET score = ?, writingResults = ? WHERE id = ?',
            mcqScore + writingScore, JSON.stringify(gradedList), resultId
          )
        } catch (pErr) {
          console.error('[HW BG] Partial persist error:', pErr)
          try {
            await db.$executeRawUnsafe(
              'UPDATE HomeworkResult SET score = ? WHERE id = ?',
              mcqScore + writingScore, resultId
            )
          } catch (pErr2) {}
        }
      }
      for (var gi = 0; gi < writingAnswers.length; gi++) {
        try {
          var gOne = await gradeOneWriting(writingAnswers[gi])
          gradedList[gi] = gOne
          writingScore += (gOne.awardedPoints || 0)
        } catch (oneErr) {
          console.error('[HW BG] grade one writing error:', oneErr)
        }
        await persistPartial()
      }
      console.log('[HW BG] Grading done for', resultId, '— final score', (mcqScore + writingScore) + '/' + maxScore)
    }

    if (hasWriting && inserted) {
      // after() runs when the response has been sent — same invocation, same runtime
      after(backgroundGrading)
    }

    return NextResponse.json(responsePayload)
  } catch (error) {
    console.error('Homework submit error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة في تسليم الواجب' }, { status: 500 })
  }
}
