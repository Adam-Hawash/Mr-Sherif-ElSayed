// @ts-nocheck
// FILE: src/app/api/ai/extract-questions/route.ts
// ROUTE: POST /api/ai/extract-questions
// PURPOSE: Extract questions from uploaded file (PDF/image) or URL
//          Returns questions ONLY (does NOT save to database)
//          (Alias for ai-extract with same functionality)

import { NextResponse } from 'next/server'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'

export const runtime = 'nodejs'
export const maxDuration = 120

export async function POST(request) {
  try {
    var formData = await request.formData()
    var file = formData.get('file')
    var fileUrl = formData.get('fileUrl') || ''
    var type = formData.get('type') || 'exam'
    var grade = formData.get('grade') || ''

    if ((!file || file.size === 0) && !fileUrl.trim()) {
      return NextResponse.json({ error: 'Upload a file or enter a URL' }, { status: 400 })
    }

    var apiKey = process.env.GEMINI_API_KEY || ''
    if (!hasGeminiKey()) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not found' }, { status: 500 })
    }

    var base64Data = ''
    var mimeType = ''

    if (file && file.size > 0) {
      var bytes = new Uint8Array(await file.arrayBuffer())
      base64Data = Buffer.from(bytes).toString('base64')
      var fname = (file.name || '').toLowerCase()
      if (fname.endsWith('.pdf')) { mimeType = 'application/pdf' }
      else if (fname.endsWith('.png')) { mimeType = 'image/png' }
      else if (fname.endsWith('.webp')) { mimeType = 'image/webp' }
      else { mimeType = file.type || 'image/jpeg' }
    } else if (fileUrl.trim()) {
      try {
        var fetchRes = await fetch(fileUrl.trim())
        if (!fetchRes.ok) throw new Error('Download failed: ' + fetchRes.status)
        var arrayBuf = await fetchRes.arrayBuffer()
        base64Data = Buffer.from(new Uint8Array(arrayBuf)).toString('base64')
        var ct = fetchRes.headers.get('content-type') || ''
        if (ct.includes('pdf')) { mimeType = 'application/pdf' }
        else if (ct.includes('png')) { mimeType = 'image/png' }
        else if (ct.includes('webp')) { mimeType = 'image/webp' }
        else if (ct.includes('image')) { mimeType = ct }
        else { mimeType = 'image/jpeg' }
      } catch (err) {
        return NextResponse.json({ error: 'Failed to download file' }, { status: 400 })
      }
    }

    if (!base64Data) {
      return NextResponse.json({ error: 'No file data' }, { status: 400 })
    }

    var lines = []
    lines.push('You are an expert math teacher. I will give you a document/image containing math questions.')
    lines.push('IMPORTANT: Extract ONLY the questions that actually exist in this document. Do NOT invent or add any questions that are not in the document.')
    lines.push('For each question:')
    lines.push('- Copy the EXACT question text (translate to English if needed)')
    lines.push('- Copy the EXACT options (translate to English if needed)')
    lines.push('- If fewer than 4 options, add plausible wrong options')
    lines.push('- If no options, create 4 options with the correct answer included')
    lines.push('- Correct answer index (0=A, 1=B, 2=C, 3=D)')
    lines.push('')
    lines.push('Rules:')
    lines.push('- ALL output text in English')
    lines.push('- Use Unicode math symbols: x\u00b2 x\u00b3 \u221a \u221b \u00d7 \u00f7. Do NOT use ^ or * symbols.')
    lines.push('- Grade: ' + grade + ' | Type: ' + type)
    lines.push('')
    lines.push('JSON only:')
    lines.push('{"questions":[{"question":"...","options":["A","B","C","D"],"correct":0}]}')
    var prompt = lines.join('\n')

    var parts = [{ text: prompt }]
    parts.push({ inlineData: { mimeType: mimeType, data: base64Data } })

    // Central helper: Gemini 3.6 first + automatic key rotation on quota (429)
    console.log('[Extract Questions] Calling Gemini (3.6 first, keys rotate on 429)')
    var result = await callGeminiCentral({
      parts: parts,
      generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
      timeoutMs: 60000,
    })

    if (!result.ok) {
      console.error('[Extract Questions] All models failed:', result.error)
      return NextResponse.json({ error: 'AI error: ' + (result.error || 'unknown') }, { status: 500 })
    }

    var text = result.text || ''

    if (!text.trim()) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 })
    }

    var jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return NextResponse.json({ error: 'Could not parse AI response' }, { status: 500 })
    }

    var parsed = JSON.parse(jsonMatch[0])
    var questions = (parsed.questions || []).map(function(q) {
      var opts = Array.isArray(q.options) ? q.options.slice() : ['N/A', 'N/A', 'N/A', 'N/A']
      while (opts.length < 4) { opts.push('N/A') }
      var c = typeof q.correct === 'number' ? q.correct : 0
      if (c < 0 || c > 3) { c = 0 }
      return { question: q.question || '', options: opts.slice(0, 4), correct: c }
    }).filter(function(q) { return q.question.trim().length > 0 })

    if (questions.length === 0) {
      return NextResponse.json({ error: 'No questions extracted from the file.' }, { status: 400 })
    }

    return NextResponse.json({ success: true, extracted: { title: parsed.title || '', content: parsed.content || '', questions: questions, answerKey: parsed.answerKey || '' } })
  } catch (error) {
    console.error('Extract questions error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
