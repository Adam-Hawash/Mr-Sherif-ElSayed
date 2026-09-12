// FILE: src/lib/mcq-notes.ts
// PURPOSE: (2026-و33) ملاحظات ذكية لأسئلة الاختيارات (الشوز) اللي الطالب غلط فيها —
//   طلب المستر حرفيًا: «الشوز في اسئله بتتحسبها غلط يتكتب فيه ملاحظات
//   بالذكاء الاصطناعي عشان الطالب يفهم الاجابه دي ليه جت كده».
//
// التصميم:
//   - نداء AI واحد مجمّع لكل أسئلة الاختيارات الغلط (مش سؤال بسؤال) —
//     نفس درس و25: النداءات المتوازية على مفتاح واحد = 429 = فولباك كله غلط.
//   - المخرج: JSON array of strings بنفس عدد وترتيب الأسئلة المتبعتة.
//   - ملاحظة قصيرة بالمصري العامي بتشرح: ليه الإجابة الصح هي الصح + الطالب
//     غلط إيه بالظبط + إزاي يفكر في السؤال ده المرة الجاية.
//   - الرموز بتتكتب بقواعد المنصة (NOTATION_RULES) وبتتنقّى بـ sanitizeMathText
//     عشان تترسم FractionText كسور رأسية وأُس حقيقي.
//   - فولباك صادق من غير اختراع لو الـ AI مش متاح.

import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson } from '@/lib/math-text'
import { sanitizeMathText, NOTATION_RULES, ENGLISH_TERMS_RULE } from '@/lib/math-sanitize'

export interface McqNoteItem {
  question: string
  options: string[]
  studentAnswerText: string // نص إجابة الطالب (الاختيار اللي اختاره) أو 'لم يتم الإجابة'
  correctAnswerText: string // نص الإجابة الصحيحة
}

/* مفتاح كاش ثابت للسؤال (بيستخدم في كاش الداتابيز عشرات المرات) */
export function mcqNoteKey(item: McqNoteItem): string {
  var raw = String(item.question || '').slice(0, 120) + '|' + String(item.correctAnswerText || '').slice(0, 60)
  var h = 0
  for (var i = 0; i < raw.length; i++) h = (h * 31 + raw.charCodeAt(i)) >>> 0
  return 'k' + h.toString(36)
}

function buildNotesPrompt(items: McqNoteItem[]): string {
  var lines: string[] = []
  lines.push('أنت معلم رياضيات مصري شاطر بيشرح للطلاب بالمصري العامي البسيط.')
  lines.push('الطالب حل امتحان اختيارات وغلط في الأسئلة اللي جاية. لكل سؤال اكتب ملاحظة قصيرة (سطر لسطرين بحد أقصى) تشرح للطالب:')
  lines.push('1) ليه الإجابة الصحيحة هي الصح (الحل المختصر اللي يوصله لها).')
  lines.push('2) الغلط الشائع اللي غالبًا وقع فيه اللي خلاه يختار إجابته (لو ماجابش إجابة خالص قول له إزاي يبدأ).')
  lines.push('')
  lines.push(NOTATION_RULES)
  lines.push('')
  lines.push(ENGLISH_TERMS_RULE)
  lines.push('')
  lines.push('ممنوع منعًا باتًا الفصحى — كلام عادي زي ما بتتكلم مع طالب في السادس/الإعدادي: بص، خلي بالك، اللي حصل إن، طبّق تاني، برافو.')
  lines.push('ممنوع تطول — الملاحظة سطر لسطرين كحد أقصى لكل سؤال.')
  lines.push('')
  lines.push('ردك لازم يكون JSON فقط من غير أي كلام تاني: مصفوفة نصوص بنفس عدد وترتيب الأسئلة بالظبط.')
  lines.push('مثال للشكل: ["برافو الفكرة إنك..., بس اللي حصل إنك...، الصح \\frac{3}{4} لأن...", "..."]')
  lines.push('')
  lines.push('الأسئلة:')
  for (var i = 0; i < items.length; i++) {
    var it = items[i]
    lines.push('---')
    lines.push('السؤال ' + (i + 1) + ': ' + String(it.question || '').slice(0, 400))
    for (var oi = 0; oi < (it.options || []).length; oi++) {
      lines.push('  ' + String.fromCharCode(65 + oi) + ') ' + String(it.options[oi] || '').slice(0, 120))
    }
    lines.push('  إجابة الطالب: ' + String(it.studentAnswerText || 'لم يتم الإجابة').slice(0, 120))
    lines.push('  الإجابة الصحيحة: ' + String(it.correctAnswerText || '').slice(0, 120))
  }
  return lines.join('\n')
}

/* فولباك صادق — من غير اختراع حلول: بيحوّل الطالب للخطوات الصح */
function fallbackNote(item: McqNoteItem): string {
  var ans = String(item.studentAnswerText || '')
  if (!ans.trim() || ans === 'لم يتم الإجابة') {
    return 'السؤال ده ماجبتله إجابة — الإجابة الصح: ' + String(item.correctAnswerText || '') + ' — جرب تحله تاني وأنت مركز في المعطيات'
  }
  return 'إجابتك كانت: ' + ans + ' — الصح: ' + String(item.correctAnswerText || '') + ' — راجع خطوات السؤال دي مع الشرح وهتلاقيها سهلة'
}

/*
 * generateMcqNotes — بيرجع مصفوفة ملاحظات بنفس طول وترتيب items بالظبط.
 * لو الـ AI فشل في السؤال أو في النداء كله → فولباك صادق لنفس الفهرس.
 */
export async function generateMcqNotes(items: McqNoteItem[]): Promise<{ notes: string[]; aiUsed: boolean }> {
  var out: string[] = []
  for (var i = 0; i < items.length; i++) out.push(fallbackNote(items[i]))
  if (!items.length) return { notes: out, aiUsed: false }
  if (!hasGeminiKey()) return { notes: out, aiUsed: false }

  var prompt = buildNotesPrompt(items)
  var result = await callGeminiCentral({
    parts: [{ text: prompt }],
    generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
    timeoutMs: 55000,
  })
  /* محاولة تانية لو الاولى فشلت مؤقتًا (نفس درس الـ backoff) */
  if (!result.ok) {
    try { await new Promise(function (r) { setTimeout(r, 1500) }) } catch (e) {}
    result = await callGeminiCentral({
      parts: [{ text: prompt }],
      generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
      timeoutMs: 55000,
    })
  }
  if (!result.ok || !result.text) return { notes: out, aiUsed: false }

  try {
    var parsed = JSON.parse(repairModelJson(result.text))
    var arr: any = Array.isArray(parsed) ? parsed : (parsed && Array.isArray(parsed.notes) ? parsed.notes : null)
    if (!arr) return { notes: out, aiUsed: false }
    for (var n = 0; n < items.length; n++) {
      var note = arr[n]
      if (typeof note === 'string' && note.trim()) out[n] = sanitizeMathText(note)
      else if (note && typeof note === 'object' && typeof note.note === 'string' && note.note.trim()) out[n] = sanitizeMathText(note.note)
      /* غير كده → الفولباك بيفضل مكانه لنفس الفهرس */
    }
    return { notes: out, aiUsed: true }
  } catch (e) {
    return { notes: out, aiUsed: false }
  }
}
