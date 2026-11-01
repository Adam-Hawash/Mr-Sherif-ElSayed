// @ts-nocheck
// POST /api/exams/mcq-notes — (2026-و33) ملاحظات ذكية لأسئلة الاختيارات الغلط في الامتحانات
//   نفس نظام الواجب بالظبط (طلب المستر و33: «ملاحظات بالذكاء الاصطناعي عشان
//   الطالب يفهم الاجابه دي ليه جت كده») — نداء AI واحد مجمّع + كاش في ExamResult.

import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { generateMcqNotes, mcqNoteKey, McqNoteItem } from '@/lib/mcq-notes'

export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST(request) {
  try {
    var body = await request.json()
    var resultId = String(body.resultId || '')
    var rawItems = Array.isArray(body.items) ? body.items : []
    if (rawItems.length === 0) return NextResponse.json({ notes: [] })
    if (rawItems.length > 25) rawItems = rawItems.slice(0, 25)

    var items: McqNoteItem[] = rawItems.map(function (it: any) {
      return {
        question: String((it && it.question) || '').slice(0, 500),
        options: Array.isArray(it && it.options) ? it.options.slice(0, 6).map(function (o: any) { return String(o || '').slice(0, 200) }) : [],
        studentAnswerText: String((it && it.studentAnswerText) || 'لم يتم الإجابة').slice(0, 200),
        correctAnswerText: String((it && it.correctAnswerText) || '').slice(0, 200),
      }
    })

    /* ---- الكاش من الداتابيز (best effort) ---- */
    var cache: Record<string, string> = {}
    if (resultId) {
      try {
        try { await db.$executeRawUnsafe('ALTER TABLE ExamResult ADD COLUMN mcqNotes TEXT DEFAULT \'\'') } catch (e) {}
        var rows = await db.$queryRawUnsafe('SELECT mcqNotes FROM ExamResult WHERE id = ? LIMIT 1', resultId)
        if (rows && rows.length > 0 && rows[0].mcqNotes) {
          var saved = JSON.parse(String(rows[0].mcqNotes))
          if (saved && typeof saved === 'object') cache = saved
        }
      } catch (e) {}
    }

    var missing: McqNoteItem[] = []
    for (var i = 0; i < items.length; i++) {
      if (cache[mcqNoteKey(items[i])]) continue
      missing.push(items[i])
    }

    if (missing.length > 0) {
      var gen = await generateMcqNotes(missing)
      for (var m = 0; m < missing.length; m++) {
        cache[mcqNoteKey(missing[m])] = gen.notes[m]
      }
      if (resultId) {
        try {
          await db.$executeRawUnsafe('UPDATE ExamResult SET mcqNotes = ? WHERE id = ?', JSON.stringify(cache).slice(0, 100000), resultId)
        } catch (e) {}
      }
      console.log('[EXAM MCQ Notes] generated', missing.length, 'notes for', resultId || '(no resultId)', 'aiUsed:', gen.aiUsed)
    }

    var notes = items.map(function (it: McqNoteItem) { return cache[mcqNoteKey(it)] || '' })
    return NextResponse.json({ notes: notes })
  } catch (e: any) {
    console.error('[EXAM MCQ Notes] error:', String((e && e.message) || e))
    return NextResponse.json({ notes: [] })
  }
}
