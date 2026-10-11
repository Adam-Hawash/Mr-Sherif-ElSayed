// @ts-nocheck
// ============================================================
// FILE: src/app/api/ai/practice/route.ts
// PURPOSE: مولد الأسئلة الذكي — تاب «اتدرب أكتر»
//   الطالب يكتب الفكرة/القانون/المسألة/المعادلة (أو يرفع صورة معادلة) →
//   10 أسئلة تدريب فريدة بأرقام مختلفة وخدع وحل خطوة بخطوة.
//
//   (2026-و68) طلب المستر: الأسئلة كلها **بالإنجليزي** وبأسلوب
//   Maths Genius («Solve for x: 6(x - 1) = 18») — مش بالعربي.
//   + دعم رفع صورة معادلة (VLM): الزاي والجيميني بيقرا الصورة ويولد
//     10 أسئلة على نفس الفكرة/المعادلة بأرقام مختلفة.
//
//   (2026-و71) طلب المستر: «اتدرب أكتر» لازم يطلع ماث إنجليزي نضيف
//   زي أسئلة المنصة نفسها ("Calculate: 2^3 × 2^3 = ?") — مش كلام عربي
//   ولا ماث مكسور. الترتيب بقى:
//   1) المحرك المحلي (lib/question-gen) — **الأول خالص** لو الطلب بيطابق
//      موضوع معروف من مواضيع المنصة (matchTopicKey) — كود محسوب دقة
//      100% بنفس أسلوب امتحانات المنصة بالظبط، ومفيش أحسن منه
//   2) ZAI (z-ai-web-dev-sdk) — للنصوص المخصصة غير المعروفة + الصور
//   3) Gemini (GEMINI_API_KEYS) — احتياطي على Vercel (نصوص + رؤية)
//   ومخرجات الـ AI بتتعقم صرامة (sanitizeAiPractice): ممنوع عربي،
//   ممنوع ماث مكسور — وأي سؤال اتشطب بيتعوض فورًا من المحرك المحلي
//   عشان الطالب **دايمًا** ياخد 10 أسئلة إنجليزي نضيفة مهما حصل.
// ============================================================

import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'
import { callGemini, hasGeminiKey, parseGeminiJson } from '@/lib/gemini'
import { generatePracticeSet, sanitizeAiPractice, matchTopicKey, type PracticeQuestion } from '@/lib/question-gen'

export const runtime = 'nodejs'
export const maxDuration = 60

/* (2026-و68) برومبت إنجليزي — أسلوب Maths Genius بالظبط
   (و72) العدد بقى parameter — "EXACTLY {count}" بدل 10 الثابتة */
function buildSystemPrompt(count: number): string {
  var n = Math.max(3, Math.min(Number(count) || 10, 20))
  return [
    'You are an expert Egyptian math teacher on the "Maths Genius" platform.',
    'The student will send you: an idea, a rule/law, a specific problem, or an EQUATION they struggle with (as text or as a photo).',
    'Your task: analyze the request and generate EXACTLY ' + n + ' unique practice questions on the SAME skill/law:',
    '- Different numbers for every question (never repeat the same numbers)',
    '- A different quick solving trick for every question',
    '- Clear step-by-step solution (2-3 short steps each)',
    '- If the student sent a specific problem/equation: generate ' + n + ' similar problems using the SAME rule with different numbers',
    '- Difficulty gradient: first third Easy, middle third Medium, last third Hard',
    '- EVERYTHING you output must be in ENGLISH (question, answer, steps, trick, topic) — school math style like "Solve for x: 6(x - 1) = 18"',
    '- The math MUST be 100% correct — verify every calculation before writing it',
    '- No LaTeX or complex symbols — write fractions as a/b and powers as x² or 2^3',
    '- Keep steps short (2-3 per question) and the trick in one line — so the response is fast',
    'Return JSON only with no extra text, in this exact shape:',
    '{"questions":[{"question":"question text","answer":"final answer","steps":["step 1","step 2","step 3"],"trick":"quick solving trick","topic":"skill name","difficulty":"Easy or Medium or Hard"}]}',
  ].join('\n')
}

function buildUserPrompt(topic: string, grade: string, count: number): string {
  var n = Math.max(3, Math.min(Number(count) || 10, 20))
  return [
    'Student request: «' + String(topic || '').slice(0, 600) + '»',
    grade ? ('Grade level: ' + grade) : '',
    'Generate ' + n + ' practice questions on this skill in the required shape (JSON only, everything in English).',
  ].filter(Boolean).join('\n')
}

/* استخراج base64 من dataURL — للرؤية (VLM) */
function parseDataUrl(dataUrl: string): { mimeType: string; data: string } | null {
  var m = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/.exec(String(dataUrl || ''))
  if (!m) return null
  var mime = m[1].toLowerCase()
  if (mime.indexOf('image/') !== 0) return null
  var data = m[2].replace(/\s/g, '')
  if (!data || data.length < 64) return null
  return { mimeType: mime, data: data }
}

/* ===== محرك 1: ZAI — نصوص + رؤية ===== */
async function zaiGenerate(topic: string, grade: string, imageDataUrl: string, count: number): Promise<PracticeQuestion[] | null> {
  try {
    var zai = await ZAI.create()
    var userContent: any = buildUserPrompt(topic, grade, count)
    if (imageDataUrl) {
      userContent = [
        { type: 'text', text: buildUserPrompt(topic, grade, count) },
        { type: 'image_url', image_url: { url: imageDataUrl } },
      ]
    }
    var timeout: any = null
    var completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: buildSystemPrompt(count) },
          { role: 'user', content: userContent },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise(function (_, rej) { timeout = setTimeout(function () { rej(new Error('timeout')) }, 48000) }),
    ])
    if (timeout) try { clearTimeout(timeout) } catch (e) {}
    var text = ((completion as any)?.choices?.[0]?.message?.content) || ''
    var parsed = parseGeminiJson(String(text || ''))
    if (!parsed) return null
    var qs = sanitizeAiPractice(parsed.questions || parsed.items || parsed, count)
    return qs.length >= Math.min(5, count) ? qs : null
  } catch (e) {
    return null
  }
}

/* ===== محرك 2: Gemini — نصوص + رؤية ===== */
async function geminiGenerate(topic: string, grade: string, imageDataUrl: string, count: number): Promise<PracticeQuestion[] | null> {
  try {
    if (!hasGeminiKey()) return null
    var parts: any[] = [{ text: buildSystemPrompt(count) + '\n\n' + buildUserPrompt(topic, grade, count) }]
    var img = parseDataUrl(imageDataUrl)
    if (img) {
      parts.push({ inline_data: { mime_type: img.mimeType, data: img.data } })
    }
    var res = await callGemini({
      parts: parts,
      generationConfig: { temperature: 0.4, maxOutputTokens: 4096 },
      timeoutMs: 35000,
    })
    if (!res || !res.ok || !res.text) return null
    var parsed = parseGeminiJson(res.text)
    if (!parsed) return null
    var qs = sanitizeAiPractice(parsed.questions || parsed.items || parsed, count)
    return qs.length >= Math.min(5, count) ? qs : null
  } catch (e) {
    return null
  }
}

export async function POST(request: Request) {
  var started = Date.now()
  var body: any = {}
  try {
    body = await request.json().catch(function () { return ({} as any) })
    var topic = String(body.topic || body.message || '').trim()
    var grade = String(body.grade || '').trim()
    var imageDataUrl = String(body.image || '').trim()
    /* (و72) عدد الأسئلة — الطالب بيختار (3-20 والافتراضي 10) */
    var count = Math.max(3, Math.min(Math.round(Number(body.count) || 10), 20))
    var hasImage = !!parseDataUrl(imageDataUrl)

    // لو فيه صورة → حد للطلب 1200 حرف؛ لو نص فقط → مطلوب نص
    if (topic.length > (hasImage ? 1200 : 600)) topic = topic.slice(0, hasImage ? 1200 : 600)
    if (!topic && !hasImage) {
      return NextResponse.json({ ok: false, error: 'اكتب الفكرة أو المسألة اللي عايز تتدرب عليها الأول' }, { status: 400 })
    }
    // حجم الصورة: حد 6MB base64 تقريبًا
    if (hasImage && imageDataUrl.length > 8 * 1024 * 1024) {
      return NextResponse.json({ ok: false, error: 'الصورة كبيرة أوي — صوّر المعادلة بحجم أصغر و جرب تاني' }, { status: 413 })
    }

    var source = 'ai'
    var questions: PracticeQuestion[] | null = null

    // (2026-و71) المحرك المحلي **الأول** — لو الطلب بيطابق موضوع معروف من
    // مواضيع المنصة: الأسئلة محسوبة بالكود، إنجليزي مضمون، بنفس أسلوب
    // امتحانات المنصة ("Calculate: 2^3 × 2^3 = ?") — ده اللي المستر عايزه
    // بالظبط فبنرجعه على طول من غير ما ندور على الـ AI أصلًا.
    // (الصورة محتاج رؤية — فالمحلي الأول للنصوص بس)
    if (!hasImage && matchTopicKey(topic).length > 0) {
      var localFirst = generatePracticeSet(topic, count)
      if (localFirst.length >= count) {
        return NextResponse.json({
          ok: true,
          source: 'local',
          engine: 'Maths Genius Engine',
          elapsedMs: Date.now() - started,
          questions: localFirst,
        })
      }
    }

    // مسار الـ AI — للنصوص المخصصة (معادلة/كلام حر) والصور
    questions = await zaiGenerate(topic, grade, hasImage ? imageDataUrl : '', count)
    if (!questions || questions.length < count) {
      var g = await geminiGenerate(topic, grade, hasImage ? imageDataUrl : '', count)
      if (g && g.length > (questions ? questions.length : 0)) questions = g
    }

    // (2026-و71) التعقيم الصارم شال أي سؤال عربي/مكسور → نكمل الناقص
    // من المحرك المحلي فورًا — الطالب دايمًا يستلم العدد المطلوب أسئلة نضيفة.
    if (!hasImage) {
      var local = generatePracticeSet(topic, count)
      if (!questions || questions.length === 0) {
        questions = local
        source = 'local'
      } else if (questions.length < count) {
        var have = new Set(questions.map(function (q) { return q.question }))
        for (var i = 0; i < local.length && questions.length < count; i++) {
          if (!have.has(local[i].question)) questions.push(local[i])
        }
      }
      questions = questions.slice(0, count)
    } else if (questions) {
      questions = questions.slice(0, count)
    }

    if (!questions || questions.length === 0) {
      return NextResponse.json({ ok: false, error: 'مقدرتش أقرا الصورة كويس — جرب تصورها بإضاءة أحسن، أو اكتب المعادلة نص' }, { status: 502 })
    }

    return NextResponse.json({
      ok: true,
      source: source,
      engine: source === 'ai' ? 'AI' : 'Maths Genius Engine',
      elapsedMs: Date.now() - started,
      questions: questions,
    })
  } catch (e: any) {
    // حتى لو انفجر كل حاجة — المحلي ما بيفشلش (للنصوص)
    try {
      var t = String(body && body.topic ? body.topic : '')
      if (t) {
        var questionsLocal = generatePracticeSet(t, count)
        return NextResponse.json({ ok: true, source: 'local', engine: 'Maths Genius Engine', questions: questionsLocal })
      }
    } catch (e2) {}
    return NextResponse.json({ ok: false, error: 'المولد مشغول — جرب تاني' }, { status: 500 })
  }
}
