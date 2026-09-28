// @ts-nocheck
// ============================================================
// FILE: src/lib/ai-json.ts
// PURPOSE: (و51) parser مقاوم لأي JSON بيرجع من موديلات الذكاء الاصطناعي
//          إصلاح جذري لرسالة «Could not parse AI response» اللي كانت
//          بتمنع الاستخراج خالص لما النموذج يرجّع JSON فيه أي عيب.
// الاستراتيجيات بالترتيب — أول واحدة تنجح تكسب:
//   1) parse مباشر للنص الأصلي (من غير أي "تصليح" ممكن يبوّظه)
//   2) بعد repairModelJson (تصليح تهريب LaTeX)
//   3) إزالة code fences / النص الزيادة حوالين الـ JSON
//   4) تهريب حروف التحكم الخام جوه النصوص (newlines حقيقية من الموديل)
//   5) تراجع عن القممة اللي بعد إغلاق الـ object الأخير
//   6) إصلاح المفاتيح اللي فقدت التنصيص  ,y":0.2 → ,"y":0.2
//   7) إصلاح البتر (truncation): رجوع لآخر عنصر كامل + قفل الأقواس
//   8) تركيبات (تصليح المفاتيح + البتر مع بعض) ومحاولة أخيرة بالتنصيص الأحادي
// كل استراتيجية معزولة في try/catch — فشل واحدة عمره ما يمنع اللي بعدها.
// ============================================================

import { repairModelJson } from '@/lib/math-text'

/* استخراج مرشحين للـ JSON من نص الموديل — الترتيب مهم */
function collectCandidates(text: string): string[] {
  var out: string[] = []
  var push = function (s: string) {
    if (s && s.trim() && out.indexOf(s) === -1) out.push(s)
  }
  var t = String(text || '')
  // 1) أول { لآخر } (المنطق القديم)
  var greedy = t.match(/\{[\s\S]*\}/)
  if (greedy) push(greedy[0])
  // 2) code fences ```json ... ```
  var fences = t.match(/```(?:json)?\s*([\s\S]*?)```/gi) || []
  for (var i = 0; i < fences.length; i++) {
    var inner = fences[i].replace(/```(?:json)?/gi, '').trim()
    push(inner)
    var m2 = inner.match(/\{[\s\S]*\}/)
    if (m2) push(m2[0])
  }
  // 3) من أول { لباقي النص (لو القفل اتقص)
  var first = t.indexOf('{')
  if (first >= 0) push(t.substring(first))
  return out
}

/* تهريب حروف التحكم الخام جوه النصوص فقط — JSON.parse بيموت على أي
   \n حقيقي جوه string (بيحصل مع محتوى WhatsApp/صور ممسوحة) */
function escapeControlChars(s: string): string {
  var out = ''
  var inStr = false
  var esc = false
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    if (esc) { out += ch; esc = false; continue }
    if (inStr && ch === '\\') { out += ch; esc = true; continue }
    if (ch === '"') { inStr = !inStr; out += ch; continue }
    if (inStr) {
      var code = s.charCodeAt(i)
      if (code === 10) { out += '\\n'; continue }
      if (code === 13) { out += '\\r'; continue }
      if (code === 9) { out += '\\t'; continue }
      if (code < 32) { out += '\\u' + ('000' + code.toString(16)).slice(-4); continue }
    }
    out += ch
  }
  return out
}

/* (و50) المفاتيح اللي فقدت بداية التنصيص */
function fixUnquotedKeys(s: string): string {
  return s
    .replace(/([\[{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*"\s*:/g, '$1"$2":')
    .replace(/([\[{,]\s*)([A-Za-z_][A-Za-z0-9_]*)\s*:/g, '$1"$2":')
}

/* حساب الأقواس الناقصة بعد نقطة معينة — بيرجع اللازمة للقفل */
function missingClosers(s: string): { closers: string; inStr: boolean; esc: boolean } {
  var stack: string[] = []
  var inStr = false
  var esc = false
  for (var j = 0; j < s.length; j++) {
    var ch = s.charAt(j)
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else {
      if (ch === '"') inStr = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') { if (stack.length) stack.pop() }
    }
  }
  var closers = ''
  if (inStr || esc) closers += '"'
  while (stack.length) closers += stack.pop()
  return { closers: closers, inStr: inStr, esc: esc }
}

/* إصلاح البتر: بيرجع لآخر حدود «نظيفة» (فاصلة/قوس فاتح) بره النصوص
   ويقفل الأقواس — بيغطي قصّ النص في نص السؤال أو رقم أو قيمة */
function repairTruncation(s: string): string[] {
  var variants: string[] = []
  // أ) القفل المباشر (بيصلح: "a":[{.. وقطع بين العناصر)
  var a = missingClosers(s)
  if (a.closers) variants.push(s + a.closers)
  // ب) الرجوع لآخر فاصلة/قوس فاتح نظيف بره النصوص ثم القفل — بيصلح
  //    القص في نص قيم نصاف ("question": "Find the va" أو رقم ناقص)
  var inStr = false
  var esc = false
  var boundaries: number[] = []
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else {
      if (ch === '"') inStr = true
      else if (ch === ',' || ch === '{' || ch === '[') boundaries.push(i)
    }
  }
  var tried = 0
  for (var b = boundaries.length - 1; b >= 0 && tried < 40; b--) {
    var cut = boundaries[b]
    var head = s.substring(0, cut)
    // من غير فاصلة معلّقة في الآخر
    var headTrim = head.replace(/,\s*$/, '')
    var mc = missingClosers(headTrim)
    if (mc.closers.length > 0 && mc.closers.length <= 10) {
      variants.push(headTrim + mc.closers)
      tried++
    }
  }
  return variants
}

/* التنصيص الأحادي → مزدوج (بره النصوص المزدوجة فقط) — محاولة أخيرة */
function fixSingleQuotes(s: string): string {
  var out = ''
  var inStr = false
  var esc = false
  for (var i = 0; i < s.length; i++) {
    var ch = s.charAt(i)
    if (esc) { out += ch; esc = false; continue }
    if (ch === '\\') { out += ch; esc = true; continue }
    if (ch === '"') { inStr = !inStr; out += ch; continue }
    if (ch === "'" && !inStr) { out += '"'; continue }
    out += ch
  }
  return out
}

function tryParse(s: string): any | null {
  try { return JSON.parse(s) } catch (e) { return null }
}

/* الحلقة الرئيسية: كل مرشح × كل طبقات التصليح */
export function parseAIJsonRobust(text: string): any | null {
  if (!text || !String(text).trim()) return null
  var candidates = collectCandidates(String(text))

  for (var ci = 0; ci < candidates.length; ci++) {
    var cand = candidates[ci]

    // 1) كما هو
    var r = tryParse(cand)
    if (r !== null) return r

    // 2) بعد تصليح LaTeX
    var repaired = repairModelJson(cand)
    r = tryParse(repaired)
    if (r !== null) return r

    // 3) حروف التحكم الخام
    var ctrl = escapeControlChars(cand)
    r = tryParse(ctrl)
    if (r !== null) return r
    r = tryParse(repairModelJson(ctrl))
    if (r !== null) return r

    // 4) قممة بعد آخر إغلاق
    for (var i = repaired.length - 1, tries = 0; i > 0 && tries < 200; i--) {
      if (repaired.charAt(i) === '}') {
        tries++
        r = tryParse(repaired.substring(0, i + 1))
        if (r !== null) return r
      }
    }

    // 5) مفاتيح بلا تنصيص
    var keyed = fixUnquotedKeys(repaired)
    r = tryParse(keyed)
    if (r !== null) return r

    // 6) إصلاح البتر (على الأصلي وعلى نسخ حروف التحكم)
    var bases = [repaired, ctrl, keyed]
    for (var bi = 0; bi < bases.length; bi++) {
      var vs = repairTruncation(bases[bi])
      for (var vi = 0; vi < vs.length; vi++) {
        r = tryParse(vs[vi])
        if (r !== null) return r
      }
    }

    // 7) تركيبة أخيرة: مفاتيح + بتر + تنصيص أحادي
    var sq = fixSingleQuotes(keyed)
    r = tryParse(sq)
    if (r !== null) return r
    var vs2 = repairTruncation(sq)
    for (var vi2 = 0; vi2 < vs2.length; vi2++) {
      r = tryParse(vs2[vi2])
      if (r !== null) return r
    }
  }
  return null
}

/* استخراج أول JSON object يتعمل parse من نص الموديل — بيرجع [value, raw] */
export function extractFirstJson(text: string): [any, string] | null {
  if (!text || !String(text).trim()) return null
  var candidates = collectCandidates(String(text))
  var fallbackRaw = candidates.length > 0 ? candidates[0] : ''
  var parsed = parseAIJsonRobust(text)
  if (parsed !== null) return [parsed, fallbackRaw]
  return null
}

/* (و51) نسخة المصفوفات — نفس الطبقات لكن على [...] (مسار صفحات الكتاب) */
export function parseAIJsonArrayRobust(text: string): any[] | null {
  if (!text || !String(text).trim()) return null
  var t = String(text).trim().replace(/```(?:json)?/gi, '')
  var out: string[] = []
  var push = function (s: string) { if (s && s.trim() && out.indexOf(s) === -1) out.push(s) }
  var start = t.indexOf('[')
  if (start >= 0) push(t.substring(start))
  var greedy = t.match(/\[[\s\S]*\]/)
  if (greedy) push(greedy[0])

  for (var ci = 0; ci < out.length; ci++) {
    var cand = out[ci]
    var r = tryParse(cand)
    if (Array.isArray(r)) return r

    var repaired = repairModelJson(cand)
    r = tryParse(repaired)
    if (Array.isArray(r)) return r

    var ctrl = escapeControlChars(cand)
    r = tryParse(ctrl)
    if (Array.isArray(r)) return r
    r = tryParse(repairModelJson(ctrl))
    if (Array.isArray(r)) return r

    for (var i = repaired.length - 1, tries = 0; i > 0 && tries < 200; i--) {
      if (repaired.charAt(i) === ']') {
        tries++
        r = tryParse(repaired.substring(0, i + 1))
        if (Array.isArray(r)) return r
      }
    }

    var keyed = fixUnquotedKeys(repaired)
    r = tryParse(keyed)
    if (Array.isArray(r)) return r

    var bases = [repaired, ctrl, keyed]
    for (var bi = 0; bi < bases.length; bi++) {
      var vs = repairTruncation(bases[bi])
      for (var vi = 0; vi < vs.length; vi++) {
        r = tryParse(vs[vi])
        if (Array.isArray(r)) return r
      }
    }

    var sq = fixSingleQuotes(keyed)
    r = tryParse(sq)
    if (Array.isArray(r)) return r
  }
  return null
}
