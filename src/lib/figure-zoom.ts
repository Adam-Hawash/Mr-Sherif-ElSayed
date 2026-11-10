// ============================================================
// FIGURE-ZOOM (وN4) — إعادة قراءة الرسمة المقصوصة «بتكبير» عشان الأرقام
// ============================================================
// المشكلة الحرفية من المستر: «المربع ثلاثة واثنين هو يجيب اثنين واثنين،
// بيجيب أرقام من دماغه» — السبب: النموذج بيقرا أرقام الرسمة من صورة الصفحة
// الكاملة المصغرة (1400px لكل صفحة كاملة) فالأرقام الصغيرة جوه الرسمة
// بتتشوه أو تتخترع خالص.
//
// الحل الجذري: بعد ما القص السيرفري يطلع صورة الرسمة **لوحدها بدقتها
// الكاملة**، بنبعتها تاني للنموذج في نداء مخصص: «اقرا كل رقم مكتوب جوه
// الرسمة دي حرفيًا — الرسمة هي مصدر الحقيقة» — وبعدين نصحح أي رقم في نص
// السؤال (أو الاختيارات) بيعارض اللي ظاهر في الرسمة فعلًا.
//
// نداء واحد لكل 8 رسمات — ولو النداء فشل الأرقام بتفضل زي ما هي
// والاستخراج مكمل عادي (مش مسموح فشل الأرقام يوقف الأسئلة).
// ============================================================

export interface ZoomItem { q: any; buf: Buffer }
export type CallPartsFn = (parts: any[]) => Promise<{ ok: boolean; text?: string; error?: string }>

export interface ZoomResult { checked: number; fixed: number }

/* محلل JSON متسامح للمصفوفات — شيل الفنوص ودوّر على الحدود وصلاح الأقواس الناقصة */
function parseJsonArrayLoose(text: string): any[] | null {
  if (!text || !text.trim()) return null
  var t = String(text).trim()
  t = t.replace(/```(?:json)?/gi, '')
  var start = t.indexOf('[')
  if (start === -1) return null
  var raw = t.substring(start)
  var end = raw.lastIndexOf(']')
  if (end !== -1) {
    try {
      var parsed = JSON.parse(raw.substring(0, end + 1))
      if (Array.isArray(parsed)) return parsed
    } catch (e1) {}
  }
  /* إصلاح الأقواس الناقصة (قص إخراج الموديل) */
  var opens = 0, inStr = false, esc = false, lastObj = -1
  for (var i = 0; i < raw.length; i++) {
    var ch = raw[i]
    if (esc) { esc = false; continue }
    if (ch === '\\') { esc = true; continue }
    if (ch === '"') { inStr = !inStr; continue }
    if (inStr) continue
    if (ch === '{') lastObj = i
    if (ch === '{' || ch === '[') opens++
    else if (ch === '}' || ch === ']') opens--
  }
  if (lastObj > 0 && opens > 0) {
    var repaired = raw
    if (!inStr && lastObj > 0 && repaired.charAt(repaired.length - 1) === ',') repaired = repaired.substring(0, repaired.length - 1)
    for (var b = 0; b < opens; b++) repaired += ']'
    try {
      var fixed = JSON.parse(repaired)
      if (Array.isArray(fixed)) return fixed
    } catch (e2) {}
  }
  return null
}

function buildZoomPrompt(): string {
  var lines: string[] = []
  lines.push('You are verifying numbers in math questions against their ACTUAL figure images, cropped at FULL RESOLUTION from a printed textbook.')
  lines.push('For EACH figure image below (labeled FIGURE k), you get its question text (and its MCQ options).')
  lines.push('')
  lines.push('DO, for every figure:')
  lines.push('1. TRANSCRIBE: look at the image very carefully and list EVERY number, letter label and unit that is ACTUALLY VISIBLE written inside the drawing (dimension labels like "3 cm" or "٣ سم", axis values, angle marks, side lengths). Read digit by digit. NEVER invent a number that is not visible. NEVER calculate or solve anything. If nothing numeric is visible, return an empty "visible" array.')
  lines.push('2. COMPARE: check every number in the question text and options against the labels actually visible in the figure.')
  lines.push('3. CORRECT: if a number in the text or options CONTRADICTS what is actually visible in the figure, fix ONLY that number — keep every other word identical. If everything matches, return the text unchanged with "changed": false.')
  lines.push('The figure image is the GROUND TRUTH — it is exactly what the student sees in the printed book.')
  lines.push('')
  lines.push('OUTPUT: ONE single valid JSON array — no text before or after, no markdown fences. One object per figure, same order as given:')
  lines.push('[{"i":0,"visible":["3 cm","2 cm"],"text":"<corrected question text — same as input if no fix needed>","options":["<corrected options or same as input>"],"changed":false}]')
  lines.push('RULES: never rewrite the wording; never translate; never solve; keep math formatting (\\frac{}{}, ^, √, ×, ÷) exactly as given; numbers inside "text"/"options" use Latin digits (0-9); "visible" items are short strings exactly as printed in the figure.')
  return lines.join('\n')
}

/**
 * مطابقة أرقام الرسمة: كل رسمة مقصوصة تتقرا بالتكبير والأرقام بتتصحح في
 * نص السؤال/الاختيارات لو بيعارضوا الرسمة. بيرجع { checked, fixed }.
 * التعديل بيحصل مباشرة على كائن السؤال (mutation) عشان أي مرجع موجود قبل
 * كده يشوف التحديث.
 */
export async function syncFigureNumbers(
  items: ZoomItem[],
  callParts: CallPartsFn,
  opts?: { chunkSize?: number }
): Promise<ZoomResult> {
  var res: ZoomResult = { checked: 0, fixed: 0 }
  var CHUNK = Math.max(1, (opts && opts.chunkSize) || 8)
  var clean: ZoomItem[] = []
  for (var i = 0; i < (items || []).length; i++) {
    var it = items[i]
    if (it && it.q && it.buf && it.buf.length > 200) clean.push(it)
  }
  for (var c = 0; c < clean.length; c += CHUNK) {
    var chunk = clean.slice(c, c + CHUNK)
    var parts: any[] = [{ text: buildZoomPrompt() }]
    for (var k = 0; k < chunk.length; k++) {
      var q = chunk[k].q
      parts.push({ text: 'FIGURE ' + k + ' — QUESTION TEXT: ' + (String(q.question || '').trim() || '(picture-only question — no text)') })
      if (Array.isArray(q.options) && q.options.length > 0) {
        parts.push({ text: 'FIGURE ' + k + ' — OPTIONS: ' + JSON.stringify(q.options) })
      }
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: chunk[k].buf.toString('base64') } })
    }
    try {
      var r = await callParts(parts)
      res.checked += chunk.length
      if (!r.ok || !r.text) continue
      var arr = parseJsonArrayLoose(r.text)
      if (!arr || arr.length === 0) continue
      for (var a = 0; a < arr.length; a++) {
        var item = arr[a]
        if (!item || typeof item !== 'object') continue
        var idx = typeof item.i === 'number' && isFinite(item.i) ? item.i : a
        if (idx < 0 || idx >= chunk.length) continue
        var target = chunk[idx].q
        if (!target) continue
        var visible: string[] = []
        if (Array.isArray(item.visible)) {
          for (var v = 0; v < item.visible.length; v++) {
            var vv = item.visible[v]
            if (vv === null || vv === undefined) continue
            var sv = String(vv).trim()
            if (sv) visible.push(sv)
          }
        }
        /* الليبلز بتتخزن على الرسمة نفسها — المستر يشوفها في المراجعة كدليل */
        if (target.figure && typeof target.figure === 'object') {
          if (visible.length > 0) target.figure.labels = visible.join(' ، ')
          target.figure.numChecked = true
        }
        if (item.changed === true && typeof item.text === 'string' && item.text.trim().length > 0) {
          target.question = item.text.trim()
          if (Array.isArray(item.options) && Array.isArray(target.options) && item.options.length === target.options.length) {
            var newOpts: string[] = []
            for (var o = 0; o < item.options.length; o++) newOpts.push(String(item.options[o] === null || item.options[o] === undefined ? '' : item.options[o]))
            target.options = newOpts
          }
          res.fixed++
          try { console.log('[FigureZoom] fixed numbers for question:', String(target.question || '').substring(0, 80)) } catch (eL) {}
        }
      }
    } catch (eChunk) { /* فشل الدفعة دي — الباقي يكمل */ }
  }
  return res
}
