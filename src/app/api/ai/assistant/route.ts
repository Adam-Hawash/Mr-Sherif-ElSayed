// @ts-nocheck
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callGemini, callGeminiStream, hasGeminiKey } from '@/lib/gemini'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

/* ------------------------------------------------------------
 * المساعد الذكي — محرك مزدوج عشان الردود متبقاش بسيطة/غريبة:
 *  1) ZAI (z-ai-web-dev-sdk) — أساسي للنصوص: مفيش مفاتيح، ردود قوية دايمًا.
 *  2) Gemini — أساسي للصور (vision مثبت) واحتياطي للنصوص.
 * كل محرك لو فشل بيجرب التاني تلقائيًا قبل ما نقول "المساعد مشغول".
 *
 * جديد: تاريخ المحادثة (history) — المساعد بقى فاكر الكلام اللي فات
 * فالطالب مش محتاج يعيد كل حاجة من الأول كل رسالة.
 * ------------------------------------------------------------ */
var MAX_IMAGES = 4
var MAX_B64_LENGTH = 7000000 // ~5MB binary after base64
var DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
var MAX_HISTORY = 10 // آخر 10 رسائل (5 أدوار) بتبني سياق المحادثة

/* ============================================================
 * الشكاوى التلقائية — لو الطالب قال للمساعد إن فيه مشكلة، الشكوى
 * بتتسجل في قسم الشكاوي تلقائي وبتوصل للمستر.
 *  1) المصدر الأساسي: وسم [[شكوى: ...]] اللي المساعد بيكتبه في آخر رده.
 *  2) احتياطي: كلمات مشاكل قوية واضحة في رسالة الطالب نفسها.
 * ============================================================ */
var COMPLAINT_MARKER_RE = /\[\[شكوى[:：]([\s\S]*?)\]\]/
var HARD_ISSUE_RE = /(فيديو|الفيديو|الفيدو|الوتيو)[^\n]{0,30}(مش ?(بيفتح|شغال|راضي|باين|موجود|نازل)|ما ?بيفتح|مقفول)|مش ?شغال|مش ?راضي ?(ي?فتح)?|مش ?باين|مش ?نازل|مش ?موجود|الباسورد مش|كلمة السر مش|الحساب (اتقفل|مقفول|اتسرق)|اتسرق حسابي|عاوز ?كلم ?المستر|عايز ?كلم ?المستر|مطلوب ?المستر|شكوى/

function extractComplaint(text: string): { clean: string; summary: string } {
  var m = COMPLAINT_MARKER_RE.exec(text || '')
  var clean = String(text || '').replace(COMPLAINT_MARKER_RE, '').replace(/\n{3,}/g, '\n\n').trim()
  return { clean: clean, summary: m ? String(m[1] || '').trim().slice(0, 300) : '' }
}

async function logAutoComplaint(studentId: string, studentMessage: string, summary: string) {
  try {
    if (!summary) return
    var name = '', phone = '', grade = ''
    if (studentId) {
      var rows = await db.$queryRawUnsafe('SELECT name, phone, grade FROM Student WHERE id = ? LIMIT 1', studentId)
      if (rows && rows.length > 0) { name = String(rows[0].name || ''); phone = String(rows[0].phone || ''); grade = String(rows[0].grade || '') }
    }
    var id = 'cmp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
    try {
      await db.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS Complaint (
        id TEXT PRIMARY KEY, studentId TEXT DEFAULT '', studentName TEXT DEFAULT '', phone TEXT DEFAULT '',
        grade TEXT DEFAULT '', message TEXT NOT NULL, summary TEXT DEFAULT '', source TEXT NOT NULL DEFAULT 'student',
        status TEXT NOT NULL DEFAULT 'new', reply TEXT DEFAULT '', reviewedAt DATETIME,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`)
    } catch (e) {}
    await db.$executeRawUnsafe(
      `INSERT INTO Complaint (id, studentId, studentName, phone, grade, message, summary, source, status, reply, createdAt, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'ai', 'new', '', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
      id, studentId, name, phone, grade,
      String(studentMessage || '').slice(0, 4000), String(summary).slice(0, 300)
    )
    console.log('[AI Assistant] complaint auto-logged for', name || studentId, ':', summary)
  } catch (e: any) {
    console.error('[AI Assistant] logAutoComplaint failed:', String((e && e.message) || e))
  }
}

function buildImageParts(images: string[]): any[] {
  var parts: any[] = []
  if (!Array.isArray(images)) return parts
  for (var i = 0; i < images.length && parts.length < MAX_IMAGES; i++) {
    var src = typeof images[i] === 'string' ? images[i] : ''
    var m = DATA_URL_RE.exec(src)
    if (!m) continue
    var data = m[2].replace(/\s/g, '')
    if (!data || data.length > MAX_B64_LENGTH) continue
    parts.push({ inlineData: { mimeType: m[1], data: data } })
  }
  return parts
}

/* تاريخ المحادثة اللي بيبعته الواجهة: [{role, content}] */
function buildHistory(rawHistory: any): any[] {
  var out: any[] = []
  if (!Array.isArray(rawHistory)) return out
  var clean = rawHistory.filter(function (h: any) {
    return h && (h.role === 'user' || h.role === 'assistant') && typeof h.content === 'string' && h.content.trim()
  })
  var start = Math.max(0, clean.length - MAX_HISTORY)
  for (var i = start; i < clean.length; i++) {
    out.push({ role: clean[i].role, content: String(clean[i].content).slice(0, 4000) })
  }
  return out
}

/* ===== البرومبت الأساسي — أقوى بكتير: شخصية ثابتة + ردود نضيفة ===== */
function buildSystemPrompt(platformName: string, subjectLine: string): string {
  return [
    'أنت "المساعد الذكي" الرسمي لـ' + platformName + '. ' + subjectLine,
    '',
    '## شخصيتك وقواعد الكتابة (أهم حاجة):',
    '- بتكتب عربي مصري سليم وواضح ومقروء — ممنوع نهائيًا تكلمات مش موجودة في العربي أو حروف متلخبطة أو كلام مش مفهوم.',
    '- لو مش عارف أو مش متأكد، قول ببساطة: "مش متأكد، اسأل المستر في الحصة" — بدل ما تخترع معلومة.',
    '- ردودك قصيرة ومنظمة: نقاط أو خطوات مرقمة لما الموضوع يستحق، وإيموجي بسيط (✅ 💡 📚) من غير مبالغة.',
    '- ممنوع تبدأ ردك بترحيب طويل كل مرة — ادخل في الجواب على طول.',
    '',
    '## معلومات عنك وعن المنصة:',
    '- اسمك: المساعد الذكي. وأنت جزء من المنصة نفسها — شغال 24 ساعة.',
    '- بتساعد الطلاب في: شرح أي جزئية رياضيات، مراجعة حل الواجبات من الصور، أسئلة الامتحانات، وتنظيم المذاكرة.',
    '- المنصة فيها: فيديوهات الشرح، واجبات، امتحانات، نقاط وتقييمات، ومناقشات.',
    '',
    '## قواعد الرياضيات:',
    '- المصطلحات دايمًا إنجليزي مدرسي: Powers, Roots, Fractions (Numerator / Denominator), Exponents, Equations, Brackets, Squares, Square roots, Cube roots, Geometry, Algebra.',
    '- لما تحل مسألة: اكتب الخطوات بالترتيب خطوة خطوة، وبعدين الإجابة النهائية واضحة.',
    '- راجع حسابك قبل ما تكتب النتيجة — الدقة أهم من السرعة.',
    '',
    '## قاعدة الواجبات والصور (مهم جدًا):',
    '- الصورة فيها حل الطالب بخط يده؟ لكل سؤال بالترتيب: اكتب "إجابتك:" ونصه زي ما هو بالظبط بدون تعديل ← ثم "الإجابة الصحيحة:" ← ثم صح أو غلط وليه في سطر واحد قصير.',
    '- الصورة فيها أسئلة بدون حل؟ ممنوع نهائيًا تحل أو تديله الإجابات جاهزة! قول له بالظبط: "جرب تحل الأول وابعتلي إجاباتك (نص أو صورة) وأنا هقارن إجابتك بالإجابة الصحيحة سؤال بسؤال 📝".',
    '- مش عارف يبدأ؟ تلميحة صغيرة واحدة 💡 بدون الإجابة النهائية واطلب منه يحاول تاني.',
    '- الصورة مش رياضيات؟ ساعده عادي وباختصار.',
    '',
    '## قاعدة الشكاوى والمشاكل التقنية (مهمة جدًا):',
    '- لو الطالب قال أو واضح إن فيه مشكلة في المنصة نفسها — فيديو مش بيفتح أو مش شغال، واجب/امتحان مش باين أو مش نازل، حساب مقفول أو باسورد مش شغال، مشكلة في المشتريات أو الفلوس، أو أي عطل تقني أو شكوى من حاجة — واسيه بجد في كلامك، وقل له إن شكواه اتسجلت للمستر هيشوفها بإذن الله.',
    '- وبعدها في **آخر ردك** اكتب في سطر لوحده الوسم ده للنظام بالظبط (مرة واحدة بس ولو فيه مشكلة حقيقية بس):',
    '[[شكوى: وصف قصير للمشكلة في أقل من 15 كلمة]]',
    '- متكتبش الوسم ده أبدًا لو الطالب بس بيسأل سؤال دراسي عادي أو يستفسر — بس لو فيه مشكلة حقيقية اكتبه من غير تفريط.',
  ].join('\n')
}

/* ===== ZAI — محرك أساسي للنصوص ===== */
async function zaiChat(systemPrompt: string, history: any[], userContent: any, timeoutMs: number): Promise<{ ok: boolean; text: string; error?: string }> {
  var tid: any = null
  try {
    var zai = await ZAI.create()
    var msgs: any[] = [{ role: 'assistant', content: systemPrompt }]
    for (var i = 0; i < history.length; i++) msgs.push({ role: history[i].role, content: history[i].content })
    msgs.push({ role: 'user', content: userContent })
    tid = setTimeout(function () { throw new Error('timeout') }, timeoutMs)
    var completion = await zai.chat.completions.create({
      messages: msgs,
      thinking: { type: 'disabled' },
    })
    clearTimeout(tid)
    var text = (completion && completion.choices && completion.choices[0] && completion.choices[0].message && completion.choices[0].message.content) || ''
    text = String(text || '').trim()
    if (!text) return { ok: false, text: '', error: 'empty reply' }
    return { ok: true, text: text }
  } catch (e: any) {
    if (tid) try { clearTimeout(tid) } catch (e2) {}
    return { ok: false, text: '', error: String((e && e.message) || e) }
  }
}

export async function POST(request: Request) {
  try {
    var body = await request.json()
    var message = (body.message || '').trim()
    var context = body.context || {}
    var useStream = body.stream !== false
    var imageParts = buildImageParts(body.images)
    var history = buildHistory(body.history)

    if (!message && imageParts.length === 0) {
      return NextResponse.json({ error: 'مفيش رسالة' }, { status: 400 })
    }

    // الصور اتبعتت لكن كلها غير صالحة → نقول للطالب بوضوح
    var sentImages = Array.isArray(body.images) ? body.images.length : 0
    if (sentImages > 0 && imageParts.length === 0) {
      return NextResponse.json({ reply: 'الصور اللي بعتها مش مقبولة 😅 جرب تبعت صورة PNG أو JPG عادية.' })
    }

    var systemPrompt = buildSystemPrompt('منصة مستر شريف السيد', 'مدرّب رياضيات شاطر بيساعد الطلاب في الـ Math.')
    if (context.page) systemPrompt += '\nالصفحة اللي الطالب واقف فيها: ' + context.page
    if (context.studentId) {
      try {
        var student = await db.$queryRawUnsafe('SELECT name, grade, phone FROM Student WHERE id = ? LIMIT 1', context.studentId)
        if (student && student.length > 0) systemPrompt += '\nاسم الطالب: ' + (student[0].name || '') + ' — الصف: ' + (student[0].grade || '') + ' (خاطبه باسمه لو مناسب)'
      } catch (e) {}
    }

    if (!message && imageParts.length > 0) {
      message = 'شوف الصور دي وساعدني فيها.'
    }

    // ---------- نجرب المحركات بالترتيب ونرجّع أول واحد ينجح ----------
    var timeoutMs = imageParts.length > 0 ? 50000 : 35000

    // **النصوص: ZAI الأول (مفيش مفاتيح ورده قوية) → Gemini احتياطي**
    // **الصور: Gemini الأول (vision مثبت) → ZAI احتياطي**
    var engines: Array<() => Promise<{ ok: boolean; text: string; error?: string }>> = []
    if (imageParts.length > 0) {
      var geminiParts = imageParts.concat([{ text: systemPrompt + '\n\nرسالة الطالب: ' + message }])
      engines.push(function () {
        return callGemini({ parts: geminiParts, generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }, timeoutMs: timeoutMs, thinking: 'low' })
      })
      engines.push(function () {
        var content: any[] = [{ type: 'text', text: message }]
        for (var i = 0; i < body.images.length && content.length <= MAX_IMAGES; i++) {
          if (DATA_URL_RE.test(String(body.images[i]))) content.push({ type: 'image_url', image_url: { url: body.images[i] } })
        }
        return zaiChat(systemPrompt, history, content, timeoutMs)
      })
    } else {
      // **طلب المستر (2026-و7): Gemini 3.6 هو الأساسي في النصوص كمان —
      // المفتاح موجود في Vercel → Environment Variables (GEMINI_API_KEYS)
      // ولو المفتاح مش متظبط أو الحصة خلصت، ZAI بيفضل شبكة أمان**
      if (hasGeminiKey()) {
        engines.push(function () {
          return callGemini({ parts: [{ text: systemPrompt + '\n\nرسالة الطالب: ' + message }], generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }, timeoutMs: timeoutMs, thinking: 'low' })
        })
      }
      engines.push(function () { return zaiChat(systemPrompt, history, message, timeoutMs) })
    }

    // ---------- SSE STREAMING ----------
    if (useStream) {
      var encoder = new TextEncoder()
      var stream = new ReadableStream({
        async start(controller) {
          var closed = false
          var send = function (obj: any) {
            if (closed) return
            try { controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n')) } catch (e) {}
          }
          var result: any = null
          var lastErr = ''
          for (var ei = 0; ei < engines.length; ei++) {
            try {
              var r = await engines[ei]()
              if (r && r.ok && r.text) { result = r; break }
              lastErr = (r && r.error) || 'failed'
              console.error('[AI Assistant] engine ' + ei + ' failed:', lastErr)
            } catch (e: any) {
              lastErr = String((e && e.message) || e)
              console.error('[AI Assistant] engine ' + ei + ' threw:', lastErr)
            }
          }
          if (result) {
            // تسجيل الشكوى التلقائية لو المساعد اكتشف مشكلة (وسم أو كلمات قوية)
            var complaintInfo = extractComplaint(result.text)
            result.text = complaintInfo.clean
            var autoSummary = complaintInfo.summary || (HARD_ISSUE_RE.test(message) ? ('مشكلة من كلام الطالب: ' + message.slice(0, 120)) : '')
            if (autoSummary) { try { await logAutoComplaint(String(context.studentId || ''), message, autoSummary) } catch (e) {} }

            // بنبعت الرد كقطع صغيرة (typewriter) — نفس شكل الاستريمينج الحقيقي
            var chars = Array.from(result.text)
            var idx = 0
            await new Promise<void>(function (resolve) {
              var step = function () {
                if (closed) { resolve(); return }
                if (idx >= chars.length) { send({ done: true }); resolve(); return }
                var chunk = chars.slice(idx, idx + 5).join('')
                idx += 5
                send({ delta: chunk })
                setTimeout(step, 8)
              }
              step()
            })
          } else {
            var busyMsg = 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏'
            if (lastErr.indexOf('429') >= 0) busyMsg = 'الحصة اليومية للمساعد الذكي خلصت، جرب بكرة أو بعدين بشوية 🙏'
            send({ error: busyMsg })
          }
          try { closed = true; controller.close() } catch (e) {}
        },
      })
      return new Response(stream, {
        headers: {
          'Content-Type': 'text/event-stream; charset=utf-8',
          'Cache-Control': 'no-cache, no-transform',
          'Connection': 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      })
    }

    // ---------- legacy JSON path (stream === false) ----------
    for (var ei2 = 0; ei2 < engines.length; ei2++) {
      try {
        var r2 = await engines[ei2]()
        if (r2 && r2.ok && r2.text) {
          var ci = extractComplaint(r2.text)
          r2.text = ci.clean
          var autoSummary2 = ci.summary || (HARD_ISSUE_RE.test(message) ? ('مشكلة من كلام الطالب: ' + message.slice(0, 120)) : '')
          if (autoSummary2) { try { await logAutoComplaint(String(context.studentId || ''), message, autoSummary2) } catch (e) {} }
          return NextResponse.json({ reply: r2.text })
        }
      } catch (e) {}
    }
    return NextResponse.json({ reply: 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏' })
  } catch (error) {
    return NextResponse.json({ reply: 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏' })
  }
}
