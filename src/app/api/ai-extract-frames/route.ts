// @ts-nocheck
// FILE: src/app/api/ai-extract-frames/route.ts
// ROUTE: POST /api/ai-extract-frames
// (2026-و106) استخراج أسئلة من **أي فيديو** — طلب المستر: «عايز أستخرج واجب أو
//   امتحان من أي لينك فيديو، مش يوتيوب بس».
//
// اليوتيوب له مساره القديم (/api/ai-extract-youtube). الفيديوهات التانية
//   (mp4 مباشر / archive.org / Cloudinary / ملف مرفوع على المنصة) الكلينت
//   بيشغّل الفيديو على المتصفح وبيصوّر لقطات موزعة على المدة (canvas)
//   وبيبعتها هنا كصور dataURL — نفس نهج /api/ai-extract-pages بالظبط.
//
// الطلب: { images:[dataURL...], context?:string, numQuestions?:number,
//          type?:'exam'|'homework', grade?:string, sourceLabel?:string }
// الرد: نفس شكل extracted المعتمد في AIExtractionPanel.

import { NextRequest, NextResponse } from 'next/server'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairCorruptMath } from '@/lib/math-text'
import { parseAIJsonArrayRobust } from '@/lib/ai-json'
import { isWritingQuestion } from '@/lib/question-figures'

export const runtime = 'nodejs'
export const maxDuration = 180

var MAX_IMAGES = 30

function normalizeMath(s: string): string {
  if (!s) return s
  var out = repairCorruptMath(String(s))
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, '$1').replace(/\$([^$\n]+?)\$/g, '$1')
  out = out.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '')
  out = out.replace(/\\frac\s*\{\s*\(([^{}]*)\)\s*\}\s*\{\s*\(([^{}]*)\)\s*\}/g, '\\frac{$1}{$2}')
  return out
}

function stripDataUrl(img: string): string {
  return String(img || '').replace(/^data:[^;]+;base64,/, '')
}

/* برومبت الفيديو — الإطارات لقطات موزعة على المدة (سبورة/شرح/مسائل مكتوبة) */
function buildFramesPrompt(context: string, numQuestions: number, sourceLabel: string): string {
  var lines = []
  lines.push('You are an expert math teacher creating an exam from a LESSON VIDEO.')
  lines.push('هتلاقي تحت لقطات (فريمات) من فيديو درس — السبورة أو الشرح أو مسائل مكتوبة. طبّع من محتوى الفيديو.')
  if (context && String(context).trim()) {
    lines.push('LESSON CONTEXT (title/parts/topics — use it to know exactly what this lesson covers):')
    lines.push(String(context).slice(0, 1200))
  }
  lines.push('TASK: Generate ' + numQuestions + ' exam-style questions that test the CONTENT SHOWN/EXPLAINED in these video frames.')
  lines.push('المطلوب: أسئلة امتحان على محتوى الدرس اللي ظاهر في اللقطات دي — بأعلى دقة ممكنة مع اللي اتشرح فعلاً.')
  lines.push('')
  lines.push('HARD RULES (follow exactly):')
  lines.push('- Base every question ONLY on content actually visible/explained in the frames (board writing, solved examples, formulas, graphs). Do NOT invent topics that are clearly not part of this lesson.')
  lines.push('- If a frame shows a SOLVED example, you may create a SAME-TYPE exercise with different numbers (exam question), and put the original solution steps in modelAnswer.')
  lines.push('- If a frame shows a question as printed (worksheet/book page), extract it EXACTLY as shown.')
  lines.push('- MCQ: options are TEXT ONLY — no letter prefixes. "correct" = 0-based index of the correct option. If you cannot determine the correct answer set correct: -1 and write the full solution in modelAnswer.')
  lines.push('- WRITING: for questions without printed choices: type "writing", options [], correct: -1, modelAnswer = complete step-by-step solution.')
  lines.push('- MATH FORMAT (the platform renders it as real math): powers as x^2; EVERY fraction as \\frac{numerator}{denominator}; square root √, cube root ∛, × ÷ π ≤ ≥ ≠ ∠ °. No $ signs, no LaTeX beyond \\frac, no markdown.')
  lines.push('- ALL output text in English (same as the rest of the platform).')
  lines.push('')
  lines.push('Return ONE single valid JSON array — no text before or after, no markdown fences. Shape:')
  lines.push('[{"type":"mcq","question":"...","options":["opt1","opt2","opt3","opt4"],"correct":0,"points":1,"modelAnswer":"step by step solution"},{"type":"writing","question":"...","options":[],"correct":-1,"points":5,"modelAnswer":"full solution","acceptedAnswers":["5","x=5"]}]')
  lines.push('sourceLabel: ' + (sourceLabel || 'lesson video'))
  return lines.join('\n')
}

function finalizeQuestion(q: any): any | null {
  if (!q || typeof q !== 'object') return null
  var qText = normalizeMath(q.question || q.q || '')
  if (!qText || !String(qText).trim()) return null
  var isWriting = isWritingQuestion(q)
  if (isWriting) {
    return {
      type: 'writing',
      question: qText,
      options: [],
      correct: -1,
      points: (typeof q.points === 'number' && q.points > 0) ? q.points : 5,
      modelAnswer: normalizeMath(q.modelAnswer || q.answer || ''),
      acceptedAnswers: (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []).map(function (a: any) { return normalizeMath(String(a)) }),
    }
  }
  var opts = (q.options || []).map(function (o: any) { return normalizeMath(String(o == null ? '' : o)) })
  opts = opts.filter(function (o: string) { return o.trim() !== '' })
  var correct = typeof q.correct === 'number' ? q.correct : (parseInt(String(q.correct), 10) || -1)
  if (correct >= opts.length) correct = -1
  return {
    type: 'mcq',
    question: qText,
    options: opts.slice(0, 4),
    correct: correct,
    points: (typeof q.points === 'number' && q.points > 0) ? q.points : 1,
    modelAnswer: normalizeMath(q.modelAnswer || ''),
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasGeminiKey()) {
      return NextResponse.json({ error: 'مفتاح Gemini مش متظبط — ضيفه في Environment Variables' }, { status: 500 })
    }
    var body = await request.json()
    var images: string[] = Array.isArray(body.images) ? body.images.slice(0, MAX_IMAGES) : []
    images = images.filter(function (s) { return typeof s === 'string' && s.startsWith('data:image') })
    /* (2026-و106) دروس يوتيوب: ممكن من غير صور — بنبعت الـ IDs في السياق
       (نفس فكرة /api/ai-extract-youtube — Gemini بيعرف منهج يوتيوب المدرسي) */
    var youtubeIds: string[] = Array.isArray(body.youtubeIds) ? body.youtubeIds.map(function (x: any) { return String(x || '').slice(0, 24) }).filter(Boolean).slice(0, 12) : []
    if (images.length === 0 && youtubeIds.length === 0) {
      return NextResponse.json({ error: 'مفيش لقطات فيديو ولا فيديوهات يوتيوب — جرب تاني' }, { status: 400 })
    }
    var context = String(body.context || '')
    if (youtubeIds.length > 0) {
      context = context + '\nYouTube video IDs of this lesson (Target YouTube Video IDs): ' + youtubeIds.join(', ')
    }
    var numQuestions = Math.min(30, Math.max(3, parseInt(String(body.numQuestions || 10), 10) || 10))
    var sourceLabel = String(body.sourceLabel || 'lesson video')

    var parts: any[] = [{ text: buildFramesPrompt(context, numQuestions, sourceLabel) }]
    for (var i = 0; i < images.length; i++) {
      parts.push({ text: 'FRAME ' + (i + 1) + ' of ' + images.length + ':' })
      parts.push({ inlineData: { mimeType: 'image/jpeg', data: stripDataUrl(images[i]) } })
    }
    var result: any = null
    for (var attempt = 0; attempt < 2 && !result; attempt++) {
      var res = await callGeminiCentral({
        parts: parts,
        generationConfig: { temperature: 0.2, maxOutputTokens: 16384, response_mime_type: 'application/json' },
        timeoutMs: 120000,
      })
      if (res.ok && res.text) {
        var arr = parseAIJsonArrayRobust(res.text)
        if (arr && arr.length >= 0) {
          var finalized: any[] = []
          for (var qi = 0; qi < arr.length; qi++) {
            var fq = finalizeQuestion(arr[qi])
            if (fq) finalized.push(fq)
          }
          result = finalized
        }
      }
      if (!result && attempt === 0) await new Promise(function (r) { setTimeout(r, 1200) })
    }

    if (!result) {
      return NextResponse.json({ error: 'الذكاء الاصطناعي ما قدرش يستخرج أسئلة من الفيديو — جرب تاني أو استخدم لينك فيديو تاني' }, { status: 502 })
    }

    var mcq = result.filter(function (q: any) { return q.type === 'mcq' }).length
    var writing = result.length - mcq
    return NextResponse.json({
      success: true,
      extracted: {
        title: '',
        content: '',
        questions: result,
        answerKey: '',
        stats: { mcq: mcq, writing: writing, total: result.length, frames: images.length, youtubeIds: youtubeIds.length },
      },
    })
  } catch (error: any) {
    console.error('[AI Extract Frames] error:', error)
    return NextResponse.json({ error: 'فشل استخراج الأسئلة من الفيديو — السبب التقني: ' + String((error && error.message) || error).slice(0, 160) }, { status: 500 })
  }
}
