// @ts-nocheck
// ============================================================
// FILE: src/app/api/ai-extract-and-save/route.ts
// ROUTE: POST /api/ai-extract-and-save
// PURPOSE: Extract questions from file AND save to database in one step
//          Alternative to the 3-step flow (extract -> review -> save)
//          Accepts: file or fileUrl, type, grade, title
//          Uses Gemini to extract, shuffles, then saves to DB directly
// ============================================================

import { NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { repairModelJson, repairCorruptMath } from '@/lib/math-text'
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
    var title = formData.get('title') || ''
    var questionsJson = formData.get('questions') || ''

    if (!grade.trim()) {
      return NextResponse.json({ error: 'Grade is required' }, { status: 400 })
    }
    if (!title.trim()) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 })
    }

    var extractedQuestions = []

    // If questions already provided, skip AI extraction
    if (questionsJson.trim()) {
      try {
        extractedQuestions = JSON.parse(questionsJson)
      } catch (e) {
        return NextResponse.json({ error: 'Invalid questions format' }, { status: 400 })
      }
    }

    // Otherwise extract via AI from file or URL
    if (extractedQuestions.length === 0 && (file || fileUrl.trim())) {
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
          if (!fetchRes.ok) throw new Error('Failed to download: ' + fetchRes.status)
          var arrayBuf = await fetchRes.arrayBuffer()
          base64Data = Buffer.from(new Uint8Array(arrayBuf)).toString('base64')
          var ct = fetchRes.headers.get('content-type') || ''
          if (ct.includes('pdf')) { mimeType = 'application/pdf' }
          else if (ct.includes('png')) { mimeType = 'image/png' }
          else if (ct.includes('webp')) { mimeType = 'image/webp' }
          else if (ct.includes('image')) { mimeType = ct }
          else { mimeType = 'image/jpeg' }
        } catch (err) {
          return NextResponse.json({ error: 'Failed to download file: ' + (err.message || '') }, { status: 400 })
        }
      }

      if (!base64Data) {
        return NextResponse.json({ error: 'No file data found' }, { status: 400 })
      }

      if (!hasGeminiKey()) {
        return NextResponse.json({ error: 'Gemini API key not found' }, { status: 500 })
      }

      var lines = []
      lines.push('You are an expert math teacher. Analyze this ' + (mimeType === 'application/pdf' ? 'PDF document' : 'image') + ' carefully.')
      lines.push('Extract ALL math questions from it. For each question:')
      lines.push('- Extract the full question text in English')
      lines.push('- Provide exactly 4 answer options (A, B, C, D)')
      lines.push('- Identify the correct answer index (0=A, 1=B, 2=C, 3=D)')
      lines.push('- Each question is worth 1 point')
      lines.push('')
      lines.push('Rules:')
      lines.push('- Write ALL questions and options in English only')
      lines.push('- MATH NOTATION (very important — the platform renders this format as real math):')
      lines.push('  * Copy every question EXACTLY as it appears in the document — same wording, same numbers, same order. NEVER rewrite, rephrase or renumber it.')
      lines.push('  * Powers: use the ^ symbol — 2^5, x^2, (2^3)^4, a^{2n}. The platform renders them as REAL superscripts stacked ON the digit itself.')
      lines.push('  * Fractions: EVERY fraction must use the marker \\frac{numerator}{denominator} — the platform renders it as a REAL stacked fraction (numerator above a bar, denominator below).')
      lines.push('    Example: \\frac{(2^3)^4}{2^5} renders as (2^3)^4 above 2^5 with a fraction bar. NEVER write fractions as a/b or with ÷.')
      lines.push('  * Multiplication: × | Division: ÷ | Square root: √ | Cube root: ∛ | Pi: π | Plus/minus: ±')
      lines.push('  * Comparisons: < > ≤ ≥ ≠ ≈ | Angle: ∠ | Degree: ° | Percent: %')
      lines.push('  * Do NOT use $ signs, \\sqrt, \\times, \\left, \\right, or markdown (**, *, #). The ONLY LaTeX allowed is \\frac{numerator}{denominator}.')
      lines.push('  * Do NOT invent any symbols or notation beyond this list.')
      lines.push('- If a question has fewer than 4 options, add plausible wrong options')
      lines.push('- Extract as many questions as you can find')
      lines.push('- Grade level: ' + grade)
      lines.push('')
      lines.push('Respond with JSON only, no additional text:')
      lines.push('{"questions": [{"question": "question text", "options": ["A", "B", "C", "D"], "correct": 0}]}')
      var prompt = lines.join('\n')

      var parts = [{ text: prompt }]
      parts.push({ inlineData: { mimeType: mimeType, data: base64Data } })

      // Central helper: Gemini 3.6 first + automatic key rotation on quota (429)
      console.log('Calling Gemini (3.6 first, keys rotate on 429)')
      var result = await callGeminiCentral({
        parts: parts,
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
        timeoutMs: 60000,
      })

      if (!result.ok) {
        console.error('All models failed:', result.error)
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

      var parsed = JSON.parse(repairModelJson(jsonMatch[0]))
      extractedQuestions = (parsed.questions || []).map(function(q) {
        var opts = Array.isArray(q.options) ? q.options.slice() : ['N/A', 'N/A', 'N/A', 'N/A']
        while (opts.length < 4) opts.push('N/A')
        return { question: q.question || '', options: opts.slice(0, 4), correct: typeof q.correct === 'number' ? q.correct : 0 }
      }).filter(function(q) { return q.question.trim().length > 0 })
    }

    if (extractedQuestions.length === 0) {
      return NextResponse.json({ error: 'No questions extracted. Make sure the file has clear questions.' }, { status: 400 })
    }

    // Shuffle questions and options
    for (var si = extractedQuestions.length - 1; si > 0; si--) {
      var sj = Math.floor(Math.random() * (si + 1))
      var stemp = extractedQuestions[si]
      extractedQuestions[si] = extractedQuestions[sj]
      extractedQuestions[sj] = stemp
    }
    extractedQuestions = extractedQuestions.map(function(q) {
      var correctText = q.options[q.correct]
      var shuffled = q.options.slice()
      for (var oi = shuffled.length - 1; oi > 0; oi--) {
        var oj = Math.floor(Math.random() * (oi + 1))
        var otemp = shuffled[oi]
        shuffled[oi] = shuffled[oj]
        shuffled[oj] = otemp
      }
      var newCorrect = shuffled.indexOf(correctText)
      return { question: q.question, options: shuffled, correct: newCorrect }
    })

    // Convert to DB format
    var dbQuestions = extractedQuestions.map(function(q) {
      if (type === 'exam') {
        return {
          q: q.question,
          options: q.options,
          correct: q.correct,
          points: Math.max(1, Math.floor(100 / extractedQuestions.length))
        }
      }
      return {
        question: q.question,
        options: q.options,
        correct: q.correct
      }
    })

    var questionsStr = JSON.stringify(dbQuestions)
    var savedItem = null

    if (type === 'exam') {
      savedItem = await safeWrite(function() {
        return db.exam.create({
          data: {
            title: title.trim(),
            grade: grade,
            content: extractedQuestions.length + ' questions extracted by AI',
            questions: questionsStr,
            passScore: 50
          }
        })
      })
    } else {
      savedItem = await safeWrite(function() {
        return db.homework.create({
          data: {
            title: title.trim(),
            grade: grade,
            content: extractedQuestions.length + ' questions extracted by AI',
            questions: questionsStr
          }
        })
      })
    }

    return NextResponse.json({
      success: true,
      message: 'Extracted and saved ' + extractedQuestions.length + ' questions!',
      questions: extractedQuestions,
      saved: savedItem,
      totalExtracted: extractedQuestions.length
    })

  } catch (error) {
    console.error('Extract and save error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}
