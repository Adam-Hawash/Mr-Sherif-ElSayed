// @ts-nocheck
// ============================================================
// /api/arena/hint — تلميح ذكي لسؤال الفلاش كارد (2026-و88)
// ============================================================
// زرار ✨ (الشرارة البنفسجية) في شاشة الفلاش كاردز — شكل الصورة.
// الطالب داس → السيرفر بيبعت السؤال والاختيارات (من غير الإجابة الصح!)
// للـ AI ويرجّع تلميح قصير «يوّجه للمسار» من غير ما يحل.
//   POST { question: string, options: string[] }
//   → { ok: true, hint: '...' } | { ok: false, error: '...' }
// حمايات: مهلة 15 ثانية + أي فشل = ok:false (الواجهة بتتكيف بهدوء)
// ممنوع نرسل correctIndex للـ AI أصلًا — التلميح مابيأشرش على الحرف.
//
// (2026-و89) التلميح بقى **بالإنجليزي** بطلب المستر: «التحديات انا
// عاوزها كل التحديات بالانجليزي، دي منصة ماث — ما فيش ترجمة للعربي».
// ============================================================
import { NextResponse } from 'next/server'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const maxDuration = 30

function buildHintPrompt(question: string, options: string[]): { system: string; user: string } {
  var system = [
    'You are a friendly math teacher assistant on the "Math Genius" platform (a math learning platform).',
    'A student is playing a fast flash-card game and tapped the "help" button.',
    'Give ONE tiny hint in SIMPLE ENGLISH that points to the right approach or rule — NEVER the answer, NEVER a letter/option number, NEVER the final result.',
    'Max 12 words. Friendly tone like: "Remember the rule for..." or "Try dividing first...".',
    'Return JSON only, exactly: {"hint":"..."}',
  ].join('\n')
  var user = 'Question: ' + String(question || '').slice(0, 300)
  if (options && options.length) {
    user += '\nOptions: ' + options.slice(0, 4).map(function (o: any, i: number) { return '(' + (i + 1) + ') ' + String(o || '').slice(0, 60) }).join(' | ')
  }
  return { system: system, user: user }
}

export async function POST(request: Request) {
  try {
    var body = await request.json().catch(function () { return ({} as any) })
    var question = String((body && body.question) || '').trim().slice(0, 300)
    var options: string[] = Array.isArray(body && body.options) ? body.options.slice(0, 4).map(function (o: any) { return String(o || '').slice(0, 60) }) : []
    if (!question) return NextResponse.json({ ok: false, error: 'مفيش سؤال' }, { status: 400 })

    var p = buildHintPrompt(question, options)
    var zai = await ZAI.create()
    var timeout: any = null
    var completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: p.system },
          { role: 'user', content: p.user },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise(function (_, rej) { timeout = setTimeout(function () { rej(new Error('timeout')) }, 15000) }),
    ])
    if (timeout) try { clearTimeout(timeout) } catch (e) {}
    var raw = String((completion as any)?.choices?.[0]?.message?.content || '')
    var m = raw.match(/"hint"\s*:\s*"([^"]{2,240})"/)
    var hint = m ? m[1] : raw.replace(/[*_`#]/g, '').trim().slice(0, 200)
    if (!hint) return NextResponse.json({ ok: false, error: 'التلميح مش متاح دلوقتي' }, { status: 200 })
    return NextResponse.json({ ok: true, hint: hint })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'التلميح مش متاح دلوقتي' }, { status: 200 })
  }
}
