// @ts-nocheck
// FILE: src/app/api/ai/extract-and-save/route.ts
// ROUTE: POST /api/ai/extract-and-save
// PURPOSE: Save already-extracted questions to database (exam or homework)
//          Receives pre-extracted questions JSON from AdminDashboard review step

import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'

export const runtime = 'nodejs'

export async function POST(request) {
  try {
    var formData = await request.formData()
    var type = formData.get('type') || 'exam'
    var grade = formData.get('grade') || ''
    var title = formData.get('title') || ''
    var questionsJson = formData.get('questions') || '[]'

    /* (25-ب1) إعدادات الامتحان الجديدة (تتبعت من AIExtractionPanel):
       showResult (سوتش إظهار الإجابات) + timeLimitMin (مؤقت بالدقائق)
       + scheduledAt (موعد ظهور للطلاب — فاضي = يظهر فورًا) */
    var showResultRaw = formData.get('showResult')
    var timeLimitRaw = formData.get('timeLimitMin')
    var scheduledAtRaw = formData.get('scheduledAt') || ''
    var showResult = showResultRaw === 'true' || showResultRaw === '1' || showResultRaw === 1
    var timeLimitMin = parseInt(String(timeLimitRaw === null || timeLimitRaw === undefined || timeLimitRaw === '' ? '0' : timeLimitRaw), 10)
    if (isNaN(timeLimitMin) || timeLimitMin < 0) timeLimitMin = 0
    var scheduledDate = null
    if (String(scheduledAtRaw).trim()) {
      try {
        var sd = new Date(String(scheduledAtRaw).trim())
        if (!isNaN(sd.getTime())) scheduledDate = sd
      } catch (e) {}
    }

    /* defensive ALTERs (نفس نمط المشروع — ممنوع db:push) عشان الكتابة
       بالحقول الجديدة ماتفشلش لو الداتابيز لسه قديمة */
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN showResult INTEGER DEFAULT 0') } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN timeLimitMin INTEGER DEFAULT 0') } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Exam ADD COLUMN scheduledAt DATETIME') } catch (e) {}
    try { await db.$executeRawUnsafe('ALTER TABLE Homework ADD COLUMN scheduledAt DATETIME') } catch (e) {}

    if (!grade.trim()) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    if (!title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    var questions = []
    try {
      questions = JSON.parse(questionsJson)
    } catch (e) {
      return NextResponse.json({ error: 'Invalid questions format' }, { status: 400 })
    }

    if (!Array.isArray(questions) || questions.length === 0) {
      return NextResponse.json({ error: 'No questions to save' }, { status: 400 })
    }

    /* 2026-و11 — حرس سيرفر: ممنوع تسجيل أي سؤال اختياري من غير إجابة مؤكدة
       — «ما تكونش بالحر» — العميل كان بيفلتر بس، وده بيقفل التجاوز نهائيًا */
    var unanswered: number[] = []
    questions.forEach(function(q: any, i: number) {
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function(o: any) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) isWriting = true
      if (!isWriting) {
        var c = typeof q.correct === 'number' ? q.correct : -99
        if (c < 0 || c > 3) unanswered.push(i + 1)
      }
    })
    if (unanswered.length > 0) {
      return NextResponse.json({
        error: 'في أسئلة من غير إجابة مؤكدة من المفتاح (أسئلة: ' + unanswered.join('، ') + ') — ثبّت إجابتها بإيدك الأول قبل الحفظ'
      }, { status: 422 })
    }

    // Convert to DB format - preserve ALL fields (type, modelAnswer, acceptedAnswers)
    var dbQuestions = questions.map(function(q) {
      var questionText = q.question || q.q || ''
      var isWriting = q.type === 'writing' || q.type === 'essay'
      if (!isWriting && Array.isArray(q.options)) {
        var allNA = q.options.length > 0 && q.options.every(function(o) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' })
        if (allNA) isWriting = true
      }
      if (!isWriting && (!q.options || q.options.length === 0)) {
        isWriting = true
      }
      var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : (isWriting ? 5 : 1)
      if (isWriting) {
        return {
          type: 'writing',
          question: questionText,
          options: [],
          correct: -1,
          points: pts,
          modelAnswer: q.modelAnswer || q.answer || '',
          acceptedAnswers: Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : [],
        }
      }
      var opts = Array.isArray(q.options) ? q.options.slice(0, 4) : ['N/A', 'N/A', 'N/A', 'N/A']
      while (opts.length < 4) { opts.push('N/A') }
      var correctIdx = typeof q.correct === 'number' ? q.correct : 0
      if (correctIdx < 0 || correctIdx > 3) { correctIdx = 0 }
      return {
        type: 'mcq',
        question: questionText,
        options: opts,
        correct: correctIdx,
        points: pts,
        modelAnswer: q.modelAnswer || '',
      }
    })

    var questionsStr = JSON.stringify(dbQuestions)
    var savedItem = null

    if (type === 'exam') {
      savedItem = await safeWrite(function() {
        return db.exam.create({
          data: {
            title: title.trim(),
            grade: grade,
            content: questions.length + ' questions extracted by AI',
            questions: questionsStr,
            passScore: 50,
            /* (25-ب1) إعدادات الامتحان: إظهار الإجابات + المؤقت + جدولة الظهور */
            showResult: showResult,
            timeLimitMin: timeLimitMin,
            scheduledAt: scheduledDate,
          }
        })
      })
      return NextResponse.json({
        success: true,
        message: 'Exam saved successfully! (' + questions.length + ' questions)',
        examId: savedItem.id
      })
    } else {
      savedItem = await safeWrite(function() {
        return db.homework.create({
          data: {
            title: title.trim(),
            grade: grade,
            content: questions.length + ' questions extracted by AI',
            questions: questionsStr,
            /* (25-ب1) موعد ظهور الواجب للطلاب (اختياري — فاضي = فورًا) */
            scheduledAt: scheduledDate,
          }
        })
      })
      return NextResponse.json({
        success: true,
        message: 'Homework saved successfully! (' + questions.length + ' questions)',
        homeworkId: savedItem.id
      })
    }
  } catch (error) {
    console.error('AI extract and save error:', error)
    return NextResponse.json({ error: 'Save error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
