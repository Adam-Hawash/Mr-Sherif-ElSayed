// @ts-nocheck
/* ============================================================
   FILE: src/lib/video-gemini.ts
   (2026-و107) الطبقة التانية لاستخراج أسئلة من أي فيديو:
   رفع الفيديو نفسه إلى Gemini Files API وفهمه مباشرة.
   - بيغطي بيئات من غير ffmpeg (زي Vercel) وأي صيغة Gemini بيفهمها
     (mp4 / mov / webm / avi / mpeg / 3gpp...)
   - archive.org: بيجرب مشتق mp4 الخفيف (_512kb.mp4) الأول عبر
     metadata بتاع الملف — أسرع وأخف بكتير من الأصل MOV
   - سقف الحجم 300MB في الذاكرة — فوق كده بيجرب المشتق الخفيف
   - SERVER-ONLY
   ============================================================ */

import { getGeminiApiKeys } from '@/lib/gemini'
import { isSafePublicVideoUrl } from '@/lib/video-frames'

var GEMINI_BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')

var MAX_VIDEO_BYTES = 300 * 1024 * 1024

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

export function guessVideoMime(url: string, contentType?: string): string {
  var u = String(url || '').toLowerCase().split('?')[0]
  if (/\.(mov|qt)$/.test(u)) return 'video/mov'
  if (/\.mp4$/.test(u) || /\.m4v$/.test(u)) return 'video/mp4'
  if (/\.webm$/.test(u)) return 'video/webm'
  if (/\.avi$/.test(u)) return 'video/avi'
  if (/\.mpg$/.test(u) || /\.mpeg$/.test(u)) return 'video/mpeg'
  if (/\.3gp(p)?$/.test(u)) return 'video/3gpp'
  if (/\.flv$/.test(u)) return 'video/x-flv'
  if (/\.wmv$/.test(u)) return 'video/wmv'
  var ct = String(contentType || '').toLowerCase()
  if (ct.indexOf('video/') === 0) return ct.split(';')[0]
  return 'video/mp4'
}

/* archive.org: نلاقي مشتق mp4 خفيف من metadata — بيرجع الأصل لو مفيش مشتق */
async function resolveArchiveDerivative(url: string): Promise<string> {
  try {
    var m = url.match(/^https?:\/\/archive\.org\/download\/([^\/]+)\/([^\/]+)$/)
    if (!m) return url
    var item = m[1], file = decodeURIComponent(m[2])
    var ctrl = new AbortController()
    var to = setTimeout(function () { ctrl.abort() }, 12000)
    var res = await fetch('https://archive.org/metadata/' + encodeURIComponent(item) + '/', {
      signal: ctrl.signal,
      headers: { 'user-agent': UA },
    })
    clearTimeout(to)
    if (!res.ok) return url
    var j = await res.json()
    var files: any[] = (j && j.files) || []
    var stem = file.replace(/\.[^.]+$/, '')
    var best: any = null
    for (var i = 0; i < files.length; i++) {
      var f = files[i]
      var name = String(f.name || '')
      if (!/\.mp4$/i.test(name)) continue
      if (String(f.source || '') !== 'derivative') continue
      if (name.toLowerCase() === file.toLowerCase()) continue
      /* مشتق mp4 لنفس الملف — نشوف الحجم */
      var size = parseInt(String(f.size || '0'), 10) || 0
      if (size > MAX_VIDEO_BYTES) continue
      if (!best || size < (parseInt(String(best.size || '0'), 10) || 0)) best = f
    }
    /* نفضّل مشتق لنفس الاسم (stem.mp4 / stem_512kb.mp4) لو موجود */
    var preferred: any = null
    for (var k = 0; k < files.length; k++) {
      var f2 = files[k]
      var n2 = String(f2.name || '')
      var s2 = parseInt(String(f2.size || '0'), 10) || 0
      if (!/\.mp4$/i.test(n2)) continue
      if (String(f2.source || '') !== 'derivative') continue
      var nBase = n2.replace(/\.[^.]+$/, '').replace(/_512kb$/i, '')
      if (nBase.toLowerCase() === stem.toLowerCase() && s2 > 0 && s2 <= MAX_VIDEO_BYTES) {
        if (!preferred || s2 < (parseInt(String(preferred.size || '0'), 10) || 0)) preferred = f2
      }
    }
    var pick = preferred || best
    if (pick && pick.name) {
      return 'https://archive.org/download/' + encodeURIComponent(item) + '/' + encodeURIComponent(String(pick.name))
    }
    return url
  } catch (e) { return url }
}

/* البرومبت — فهم فيديو كامل (صوت + صورة) وتوليد أسئلة */
export function buildVideoPrompt(context: string, numQuestions: number, sourceLabel: string): string {
  var lines = []
  lines.push('You are an expert math teacher creating an exam from a LESSON VIDEO.')
  lines.push('ستجد فيديو درس كامل (صورة وصوت) — طبّع الأسئلة من محتوى الفيديو فعلاً.')
  if (context && String(context).trim()) {
    lines.push('LESSON CONTEXT (title/parts/topics — use it to know exactly what this lesson covers):')
    lines.push(String(context).slice(0, 1200))
  }
  lines.push('TASK: Generate ' + numQuestions + ' exam-style questions that test the content taught in this video (board writing, explained examples, spoken explanations).')
  lines.push('المطلوب: أسئلة امتحان على محتوى الدرس اللي اتشرح في الفيديو — بأعلى دقة ممكنة مع اللي اتقال فعلاً.')
  lines.push('')
  lines.push('HARD RULES (follow exactly):')
  lines.push('- Base every question ONLY on content actually taught in the video. Do NOT invent topics that are clearly not part of this lesson.')
  lines.push('- If the teacher SOLVES an example, you may create a SAME-TYPE exercise with different numbers, and put the original solution steps in modelAnswer.')
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

/* رفع الفيديو إلى Files API — بيرجع fileData part جاهز أو null */
async function uploadVideoToFileApi(videoUrl: string, mime: string, apiKey: string): Promise<{ fileUri: string; mimeType: string } | null> {
  /* 1) نجيب الحجم من طلب Range خفيف */
  var contentLength = 0
  try {
    var hRes = await fetch(videoUrl, {
      method: 'GET',
      headers: { 'user-agent': UA, 'Range': 'bytes=0-0' },
      redirect: 'follow',
    })
    var cr = hRes.headers.get('content-range') || ''
    var mm = cr.match(/\/(\d+)$/)
    if (mm) contentLength = parseInt(mm[1], 10)
    try { await hRes.body?.cancel() } catch (e) {}
  } catch (e) {}
  if (contentLength > MAX_VIDEO_BYTES) return null

  /* 2) نبدأ جلسة رفع resumable */
  var startRes = await fetch(GEMINI_BASE + '/upload/v1beta/files', {
    method: 'POST',
    headers: {
      'x-goog-api-key': apiKey,
      'X-Goog-Upload-Protocol': 'resumable',
      'X-Goog-Upload-Command': 'start',
      'X-Goog-Upload-Header-Content-Length': String(contentLength || 0),
      'X-Goog-Upload-Header-Content-Type': mime,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file: { display_name: 'lesson-video' } }),
  })
  if (!startRes.ok) return null
  var uploadUrl = startRes.headers.get('x-goog-upload-url')
  if (!uploadUrl) return null

  /* 3) ننزّل الفيديو ونرفعه — بافر في الذاكرة (سقف 300MB) */
  var ctrl = new AbortController()
  var to = setTimeout(function () { try { ctrl.abort() } catch (e) {} }, 150000)
  var buf = Buffer.alloc(0)
  try {
    var dl = await fetch(videoUrl, { signal: ctrl.signal, redirect: 'follow', headers: { 'user-agent': UA, 'accept': '*/*' } })
    if (!dl.ok || !dl.body) return null
    var reader = dl.body.getReader()
    for (;;) {
      var chunk = await reader.read()
      if (chunk.done) break
      buf = Buffer.concat([buf, Buffer.from(chunk.value)])
      if (buf.length > MAX_VIDEO_BYTES) { try { ctrl.abort() } catch (e) {} ; return null }
    }
  } catch (e) { return null } finally { clearTimeout(to) }
  if (buf.length === 0) return null

  var upHeaders: any = {
    'X-Goog-Upload-Command': 'upload, finalize',
    'X-Goog-Upload-Offset': '0',
    'Content-Length': String(buf.length),
    'Content-Type': 'application/octet-stream',
  }
  var upRes = await fetch(uploadUrl, { method: 'POST', headers: upHeaders, body: buf })
  if (!upRes.ok) return null
  var upJson: any = null
  try { upJson = await upRes.json() } catch (e) { return null }
  var file = upJson && upJson.file
  if (!file || !file.uri) return null

  /* 4) نستنى لحد ما الفيديو يبقى ACTIVE (جاهز للتحليل) */
  var name = String(file.name || '')
  for (var i = 0; i < 20; i++) {
    if (String(file.state) === 'ACTIVE') break
    if (String(file.state) === 'FAILED') return null
    await new Promise(function (r) { setTimeout(r, 3000) })
    try {
      var pRes = await fetch(GEMINI_BASE + '/v1beta/' + name.replace(/^files\//, 'files/'), {
        headers: { 'x-goog-api-key': apiKey },
      })
      if (!pRes.ok) return null
      var pj: any = await pRes.json()
      file = pj
      if (String(file.state) === 'ACTIVE') break
      if (String(file.state) === 'FAILED') return null
    } catch (e) { return null }
  }
  if (String(file.state) !== 'ACTIVE') return null
  return { fileUri: String(file.uri || file.name), mimeType: mime }
}

/* محاولة توليد مباشرة بمفتاح الرفع نفسه — موديلات ثابتة */
async function generateWithFile(filePart: any, prompt: string, numQuestions: number, apiKey: string): Promise<string> {
  var models = ['gemini-3.6-flash', 'gemini-flash-latest']
  for (var i = 0; i < models.length; i++) {
    var ctrl = new AbortController()
    var to = setTimeout(function () { try { ctrl.abort() } catch (e) {} }, 120000)
    try {
      var res = await fetch(GEMINI_BASE + '/v1beta/models/' + models[i] + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }, filePart] }],
          generationConfig: { temperature: 0.2, maxOutputTokens: 16384, response_mime_type: 'application/json' },
        }),
        signal: ctrl.signal,
      })
      if (res.ok) {
        var data = await res.json()
        var parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || []
        var text = ''
        for (var p = 0; p < parts.length; p++) { if (parts[p].text && !parts[p].thought) text += parts[p].text }
        if (text.trim()) return text.trim()
      } else {
        var st = res.status
        if (st === 404) continue
        return ''
      }
    } catch (e) {} finally { clearTimeout(to) }
  }
  return ''
}

/* النقطة الرئيسية للطبقة التانية — بترجع أسئلة جاهزة أو [] */
export async function extractQuestionsFromVideoUrl(rawUrl: string, numQuestions: number, context: string, sourceLabel: string, selfOrigin?: string): Promise<{ questions: any[]; error: string }> {
  var keys = getGeminiApiKeys()
  if (keys.length === 0) return { questions: [], error: 'no-key' }
  var url = String(rawUrl || '').trim()
  if (!url) return { questions: [], error: 'empty' }
  /* لينك داخلي نسبي (/api/files/…) → نكمّله بأصل المنصة ونعديه من حماية SSRF */
  var sameOrigin = false
  if (url.indexOf('/') === 0) {
    url = String(selfOrigin || '').replace(/\/+$/, '') + url
    sameOrigin = true
  }
  if (!/^https?:\/\//i.test(url)) return { questions: [], error: 'scheme' }
  if (!sameOrigin) {
    sameOrigin = !!selfOrigin && url.indexOf(String(selfOrigin).replace(/\/+$/, '')) === 0
  }
  if (!sameOrigin && !isSafePublicVideoUrl(url)) return { questions: [], error: 'blocked' }

  /* archive.org → مشتق mp4 الخفيف لو موجود */
  url = await resolveArchiveDerivative(url)

  var lastErr = 'no-frames'
  for (var ki = 0; ki < keys.length; ki++) {
    var mime = guessVideoMime(url)
    var uploaded = await uploadVideoToFileApi(url, mime, keys[ki])
    if (!uploaded) { lastErr = 'upload-failed'; continue }
    var filePart = { fileData: { mimeType: uploaded.mimeType, fileUri: uploaded.fileUri } }
    var text = await generateWithFile(filePart, buildVideoPrompt(context, numQuestions, sourceLabel), numQuestions, keys[ki])
    if (!text) { lastErr = 'generate-failed'; continue }
    try {
      var arr = JSON.parse(text)
      if (Array.isArray(arr)) return { questions: arr, error: '' }
    } catch (e) {}
    return { questions: [], error: 'parse' }
  }
  return { questions: [], error: lastErr }
}
