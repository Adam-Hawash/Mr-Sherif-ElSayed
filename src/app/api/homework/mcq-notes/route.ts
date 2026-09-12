// @ts-nocheck
// POST /api/homework/mcq-notes — (2026-و33) ملاحظات ذكية لأسئلة الاختيارات الغلط
//   طلب المستر: «الشوز في اسئله بتتحسبها غلط يتكتب فيه ملاحظات بالذكاء الاصطناعي
//   عشان الطالب يفهم الاجابه دي ليه جت كده».
//
// التدفق: الشاشة بتفتح المراجعة ← بتجمع أسئلة الاختيارات الغلط من غير ملاحظة
//   ← بتبعتهم هنا مرة واحدة ← نداء AI واحد مجمّع ← ملاحظة لكل سؤال.
//   الكاش: أي ملاحظة اتحسبت قبل كده لنفس النتيجة بترجع من الداتابيز فورًا
//   من غير نداء AI (عمود mcqNotes بيتضاف دفاعيًا — best effort).

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

    /* ---- الكاش من الداتابيز (best effort — أي فشل مش بيكسر النداء) ---- */
    var cache: Record<string, string> = {}
    if (resultId) {
      try {
        try { await db.$executeRawUnsafe('ALTER TABLE HomeworkResult ADD COLUMN mcqNotes TEXT DEFAULT \'\'') } catch (e) {}
        var rows = await db.$queryRawUnsafe('SELECT mcqNotes FROM HomeworkResult WHERE id = ? LIMIT 1', resultId)
        if (rows && rows.length > 0 && rows[0].mcqNotes) {
          var saved = JSON.parse(String(rows[0].mcqNotes))
          if (saved && typeof saved === 'object') cache = saved
        }
      } catch (e) {}
    }

    /* ---- اللي مش في الكاش بياخد نداء AI واحد مجمّع ---- */
    var missing: McqNoteItem[] = []
    var missingIdx: number[] = []
    for (var i = 0; i < items.length; i++) {
      var k = mcqNoteKey(items[i])
      if (cache[k]) continue
      missing.push(items[i]); missingIdx.push(i)
    }

    if (missing.length > 0) {
      var gen = await generateMcqNotes(missing)
      for (var m = 0; m < missing.length; m++) {
        cache[mcqNoteKey(missing[m])] = gen.notes[m]
      }
      if (resultId) {
        try {
          await db.$executeRawUnsafe('UPDATE HomeworkResult SET mcqNotes = ? WHERE id = ?', JSON.stringify(cache).slice(0, 100000), resultId)
        } catch (e) {}
      }
      console.log('[HW MCQ Notes] generated', missing.length, 'notes for', resultId || '(no resultId)', 'aiUsed:', gen.aiUsed)
    }

    /* ---- رجّع الملاحظات بنفس ترتيب items بالظبط ---- */
    var notes = items.map(function (it: McqNoteItem) { return cache[mcqNoteKey(it)] || '' })
    return NextResponse.json({ notes: notes })
  } catch (e: any) {
    console.error('[HW MCQ Notes] error:', String((e && e.message) || e))
    return NextResponse.json({ notes: [] })
  }
}
