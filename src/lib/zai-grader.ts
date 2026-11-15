// @ts-nocheck
// ============================================================
// FILE: src/lib/zai-grader.ts
// PURPOSE: (2026-وN8) محرك التصحيح الأقوى بطلب المستر —
//   «فيا ريت في نموذج أعلى من كده يفهم الماث»
//
//   ZAI (GLM) بتفكير عميق مفعّل (thinking: enabled) = استدلال رياضي
//   حقيقي Chain-of-Thought قبل أي حكم — مجاني، بلا مفاتيح، وبلا حصص
//   بتخلص. بيتقدّم كمحرك أول في كل نداءات تصحيح النصوص، وبيشتغل
//   شبكة أمان vision للصور لو Gemini وقع.
//
// USED BY:
//   - smart-grader.ts   (gradeWritingSmart — تصحيح الإجابات المقالية)
//   - ai-image-grader.ts (callGrader / callVerifier — نص + صور)
//   - /api/ai/solve     (حلّال الأسئلة للطلاب)
// ============================================================

import ZAI from 'z-ai-web-dev-sdk'

export interface ZaiGraderResult {
  ok: boolean
  text?: string
  error?: string
}

/* timeout حقيقي بـ Promise.race — الـ setTimeout البسيط بيرمي برة الـ try/catch
   وبيسيب النداء معلق للأبد لو الـ SDK وقف */
function withTimeout(p: Promise<any>, ms: number, label: string): Promise<any> {
  return Promise.race([
    p,
    new Promise(function (_resolve, reject) {
      setTimeout(function () { reject(new Error(label + ' timeout after ' + ms + 'ms')) }, ms)
    }),
  ])
}

var GRADER_SYSTEM =
  'You are an expert math teacher grading engine. Think through the math carefully ' +
  'step by step before deciding. Grade the MATHEMATICAL VALUE of the answer, never ' +
  'the literal wording: letter case (K = k), spaces, Arabic digits (٤٢ = 42), Arabic ' +
  'letter variants (أ = ا, ة = ه), units and notation forms (1/2 = 0.5 = 50% = ½) ' +
  'NEVER change the value. Follow the output format requested in the task EXACTLY ' +
  '(usually one JSON array or object — no markdown fences, no extra text).'

/* نداء واحد على ZAI — thinking مفعل للرياضيات الصعبة أو متوقف للنداءات الرخيصة */
async function zaiCall(messages: any[], timeoutMs: number, thinking: boolean): Promise<ZaiGraderResult> {
  try {
    var zai = await ZAI.create()
    var completion = await withTimeout(
      zai.chat.completions.create({
        messages: messages,
        thinking: thinking ? { type: 'enabled' } : { type: 'disabled' },
      }),
      timeoutMs,
      'zai'
    )
    var text = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || ''
    text = String(text || '').trim()
    if (!text) return { ok: false, error: 'zai: empty reply' }
    return { ok: true, text: text }
  } catch (e: any) {
    var msg = String((e && e.message) || e || 'zai error')
    return { ok: false, error: 'zai: ' + msg }
  }
}

/* ============================================================
 * zaiGradeText — تصحيح النصوص بمحرك ZAI بتفكير عميق.
 * محاولتين بفاصل بسيط بينهم (429 لحظي أو انقطاع شبكة).
 * thinking مفعل افتراضيًا — ده اللي بيخليه «يفهم الماث» فعلًا.
 * ============================================================ */
export async function zaiGradeText(prompt: string, opts?: {
  timeoutMs?: number
  thinking?: boolean
  system?: string
}): Promise<ZaiGraderResult> {
  var timeoutMs = opts && opts.timeoutMs ? opts.timeoutMs : 90000
  var thinking = !(opts && opts.thinking === false)
  var msgs: any[] = [{ role: 'assistant', content: (opts && opts.system) || GRADER_SYSTEM }]
  msgs.push({ role: 'user', content: prompt })
  var lastErr = ''
  for (var attempt = 0; attempt < 2; attempt++) {
    var r = await zaiCall(msgs, timeoutMs, thinking)
    if (r.ok) return r
    lastErr = r.error || ''
    if (attempt === 0) await new Promise(function (res) { setTimeout(res, 1200) })
  }
  return { ok: false, error: lastErr }
}

/* ============================================================
 * zaiGradeVision — قراءة صور حل الطالب / أسئلة الطالب وترجع التحليل.
 * شبكة أمان للصور: Gemini هو الأساسي في الـ vision (مثبت)، وده الاحتياطي
 * اللي بيشتغل حتى من غير أي مفتاح Gemini.
 * ============================================================ */
export async function zaiGradeVision(dataUrls: string[], prompt: string, opts?: {
  timeoutMs?: number
  thinking?: boolean
  system?: string
}): Promise<ZaiGraderResult> {
  var timeoutMs = opts && opts.timeoutMs ? opts.timeoutMs : 60000
  var thinking = !(opts && opts.thinking === false)
  var content: any[] = [{ type: 'text', text: prompt }]
  var count = 0
  for (var i = 0; i < (dataUrls || []).length && count < 4; i++) {
    var src = String(dataUrls[i] || '')
    if (src.indexOf('data:image/') !== 0) continue
    if (src.length > 7000000) continue
    content.push({ type: 'image_url', image_url: { url: src } })
    count++
  }
  if (count === 0) return { ok: false, error: 'zai vision: no valid images' }
  var msgs: any[] = [{ role: 'assistant', content: (opts && opts.system) || GRADER_SYSTEM }]
  msgs.push({ role: 'user', content: content })
  var lastErr = ''
  for (var attempt = 0; attempt < 2; attempt++) {
    var r = await zaiCall(msgs, timeoutMs, thinking)
    if (r.ok) return r
    lastErr = r.error || ''
    if (attempt === 0) await new Promise(function (res) { setTimeout(res, 1500) })
  }
  return { ok: false, error: lastErr }
}
