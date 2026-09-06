// @ts-nocheck
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { callGemini, callGeminiStream, hasGeminiKey } from '@/lib/gemini'

export const runtime = 'nodejs'
export const maxDuration = 60

/* ------------------------------------------------------------
 * Image upload support (IMAGES ONLY):
 * - client sends { message, images: [dataURL, ...], stream?: bool }
 * - each dataURL is converted to a Gemini inlineData part
 * - max 4 images per message, each ~5MB binary max
 * - default response is SSE TOKEN STREAMING (fast perceived replies);
 *   body.stream === false → legacy JSON response
 * ------------------------------------------------------------ */
var MAX_IMAGES = 4
var MAX_B64_LENGTH = 7000000 // ~5MB binary after base64
var DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/

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

export async function POST(request: Request) {
  try {
    var body = await request.json()
    var message = (body.message || '').trim()
    var context = body.context || {}
    var useStream = body.stream !== false
    var imageParts = buildImageParts(body.images)

    if (!message && imageParts.length === 0) {
      return NextResponse.json({ error: 'مفيش رسالة' }, { status: 400 })
    }

    if (!hasGeminiKey()) {
      return NextResponse.json({ reply: 'مرحباً! اكتب سؤالك.' })
    }

    // Images were attached but all of them were invalid → tell the user clearly
    var sentImages = Array.isArray(body.images) ? body.images.length : 0
    if (sentImages > 0 && imageParts.length === 0) {
      return NextResponse.json({ reply: 'الصور اللي بعتها مش مقبولة 😅 جرب تبعت صورة PNG أو JPG عادية.' })
    }

    var contextStr = [
      'أنت المساعد الذكي الرسمي لمنصة مستر شريف السيد.',
      'قواعد ثابتة:',
      '1) اسم المنصة دايماً: منصة مستر شريف السيد — ممنوع تغييره أو اختراع اسم تاني.',
      '2) المصطلحات دايماً إنجليزي مدرسي: Powers, Roots, Fractions (Numerator / Denominator), Exponents, Equations, Brackets, Squares, Square roots, Cube roots, Geometry, Algebra.',
      '3) جاوب بالعامية المصرية بسرعة وباختصار + إيموجي بسيط (📚 ✅ 💡).',
      '4) قاعدة الصور (أهم قاعدة):',
      '   • فيها حل الطالب بخط يده؟ لكل سؤال بالترتيب: اكتب "إجابتك:" ونصه زي ما هو بالظبط بدون تعديل ← ثم "الإجابة الصحيحة:" ← ثم صح أو غلط وليه في سطر واحد قصير.',
      '   • فيها أسئلة بدون حل؟ ممنوع نهائياً تحل أو تديله الإجابات جاهزة! قول له بالظبط: "جرب تحل الأول وابعتلي إجاباتك (نص أو صورة) وأنا هقارن إجابتك بالإجابة الصحيحة سؤال بسؤال 📝".',
      '   • مش عارف يبدأ؟ تلميحة صغيرة واحدة 💡 بدون الإجابة النهائية واطلب منه يحاول تاني.',
      '   • الترتيب ثابت: إجابة الطالب الأول ثم الإجابة الصحيحة كاملة وواضحة.',
      '5) الصورة مش مسألة رياضيات؟ ساعده عادي وباختصار.'
    ].join('\n')
    if (context.page) contextStr += '\nصفحة: ' + context.page
    if (context.studentId) {
      try {
        var student = await db.$queryRawUnsafe('SELECT name, grade FROM Student WHERE id = ? LIMIT 1', context.studentId)
        if (student && student.length > 0) contextStr += '\nالطالب: ' + (student[0].name || '')
      } catch (e) {}
    }

    if (!message && imageParts.length > 0) {
      message = 'شوف الصور دي وساعدني فيها.'
    }

    var prompt = contextStr + '\n\nرسالة الطالب: ' + message

    // Gemini 3.6 first (static chain instantly — no discovery latency),
    // thinking:'low' → fast first token, images go FIRST in the parts list
    var parts = imageParts.concat([{ text: prompt }])
    var generationConfig = { temperature: 0.3, maxOutputTokens: 4096 }
    var timeoutMs = imageParts.length > 0 ? 45000 : 25000

    // ---------- SSE TOKEN STREAMING (default) ----------
    if (useStream) {
      var encoder = new TextEncoder()
      var stream = new ReadableStream({
        async start(controller) {
          var closed = false
          var send = function (obj: any) {
            if (closed) return
            try { controller.enqueue(encoder.encode('data: ' + JSON.stringify(obj) + '\n\n')) } catch (e) {}
          }
          try {
            var result = await callGeminiStream({
              parts: parts,
              generationConfig: generationConfig,
              timeoutMs: timeoutMs,
              thinking: 'low',
              onDelta: function (d: string) { send({ delta: d }) },
            })
            if (result.ok) {
              send({ done: true })
            } else {
              console.error('[AI Assistant] failed:', result.error)
              var busyMsg = 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏'
              if (result.status === 429) busyMsg = 'الحصة اليومية للمساعد الذكي خلصت، جرب بكرة أو بعدين بشوية 🙏'
              send({ error: busyMsg })
            }
          } catch (e) {
            send({ error: 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏' })
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
    var result = await callGemini({
      parts: parts,
      generationConfig: generationConfig,
      timeoutMs: timeoutMs,
      thinking: 'low',
    })

    if (result.ok && result.text) {
      return NextResponse.json({ reply: result.text })
    }

    console.error('[AI Assistant] failed:', result.error)
    var busyMsg = 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏'
    if (result.status === 429) busyMsg = 'الحصة اليومية للمساعد الذكي خلصت، جرب بكرة أو بعدين بشوية 🙏'
    return NextResponse.json({ reply: busyMsg })
  } catch (error) {
    return NextResponse.json({ reply: 'المساعد مشغول دلوقتي جداً، جرب تاني بعد شوية 🙏' })
  }
}
