// @ts-nocheck
// FILE: src/app/api/ai-extract/route.ts
// ROUTE: POST /api/ai-extract
// PURPOSE: Extract questions and answers from uploaded files
//          Supports 3 modes:
//            1) Single file (questions + answers mixed) - one AI call
//            2) Separate question file + answer file - TWO AI calls, then merge locally
//            3) Single file URL or two URLs
//          Returns merged questions/answers JSON

import { NextResponse } from 'next/server'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { repairModelJson, repairCorruptMath } from '@/lib/math-text'

export const runtime = 'nodejs'
export const maxDuration = 180

function toBase64(file: File): Promise<string> {
  return file.arrayBuffer().then(function(buf) {
    return Buffer.from(new Uint8Array(buf)).toString('base64')
  })
}

function getMimeType(file: File): string {
  var fname = (file.name || '').toLowerCase()
  if (fname.endsWith('.pdf')) return 'application/pdf'
  if (fname.endsWith('.png')) return 'image/png'
  if (fname.endsWith('.webp')) return 'image/webp'
  return file.type || 'image/jpeg'
}

async function callGemini(apiKey: string, parts: any[]): Promise<any> {
  // Central helper: Gemini 3.6 first + auto model discovery + key rotation on quota (429)
  console.log('[AI Extract] Calling Gemini (3.6 first, keys rotate on 429)')
  var result = await callGeminiCentral({
    parts: parts,
    generationConfig: { temperature: 0.1, maxOutputTokens: 16384 },
    timeoutMs: 90000,
  })
  if (result.ok) {
    console.log('[AI Extract] Model', result.model, 'succeeded')
    return { ok: true, text: result.text }
  }
  console.error('[AI Extract] All models failed:', result.error)
  return { ok: false, error: result.error || 'unknown' }
}

/*
 * normalizeMath — server-side cleanup of AI math output so the stored text
 * matches the canonical platform format that FractionText renders:
 *   - strip $…$ / $$…$$ wrappers
 *   - \\left( \\right) → plain parens
 *   - \\frac{(X)}{(Y)} → \\frac{X}{Y} (only when ONE paren pair wraps the
 *     whole numerator/denominator — (a+1)(a-1) stays untouched)
 */
function normalizeMath(s: string): string {
  if (!s) return s
  // first undo any JSON-escape corruption (\f eaten → "rac" …)
  var out = repairCorruptMath(String(s))
  out = out.replace(/\$\$([\s\S]+?)\$\$/g, '$1').replace(/\$([^$\n]+?)\$/g, '$1')
  out = out.replace(/\\left\s*/g, '').replace(/\\right\s*/g, '')
  out = out.replace(/\\frac\s*\{\s*\(([^{}]*)\)\s*\}\s*\{\s*\(([^{}]*)\)\s*\}/g, '\\frac{$1}{$2}')
  return out
}

function parseAIJson(text: string): any | null {
  if (!text || !text.trim()) return null
  var jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  // repair LaTeX-eating JSON escapes BEFORE parsing (\frac → \\frac …)
  var raw = repairModelJson(jsonMatch[0])
  // 1) direct parse
  try {
    return JSON.parse(raw)
  } catch (e) {}
  // 2) trailing-garbage tolerance (model sometimes closes the root object
  //    then appends extra fields like ,{"answerKey":""} — walk back over
  //    earlier '}' positions until a prefix parses)
  var attempts = 0
  for (var i = raw.length - 1; i > 0 && attempts < 200; i--) {
    if (raw.charAt(i) === '}') {
      attempts++
      try {
        return JSON.parse(raw.substring(0, i + 1))
      } catch (e) {}
    }
  }
  // 3) truncation repair: append missing closing brackets/quotes
  var stack: string[] = []
  var inStr = false
  var esc = false
  for (var j = 0; j < raw.length; j++) {
    var ch = raw.charAt(j)
    if (inStr) {
      if (esc) esc = false
      else if (ch === '\\') esc = true
      else if (ch === '"') inStr = false
    } else {
      if (ch === '"') inStr = true
      else if (ch === '{') stack.push('}')
      else if (ch === '[') stack.push(']')
      else if (ch === '}' || ch === ']') {
        if (stack.length) stack.pop()
      }
    }
  }
  if (stack.length > 0 && stack.length <= 8) {
    var repaired = raw
    if (inStr || esc) repaired += '"'
    while (stack.length) {
      repaired += stack.pop()
    }
    try {
      return JSON.parse(repaired)
    } catch (e) {}
  }
  return null
}

// Merge questions from questions-doc with answers from answers-doc
// Match by index (Q1 → A1) or by question text fuzzy match
function mergeQuestionsAndAnswers(questions: any[], answers: any[]): any[] {
  if (!Array.isArray(questions)) questions = []
  if (!Array.isArray(answers)) answers = []

  return questions.map(function(q, i) {
    // Try to find matching answer by index first
    var ans = answers[i]
    // If no answer at that index, try fuzzy match by question text
    if (!ans && q.question) {
      var qNorm = q.question.trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 80)
      for (var j = 0; j < answers.length; j++) {
        var aQ = (answers[j].question || answers[j].q || '').trim().toLowerCase().replace(/\s+/g, ' ').substring(0, 80)
        if (aQ && (aQ === qNorm || aQ.includes(qNorm) || qNorm.includes(aQ))) {
          ans = answers[j]
          break
        }
      }
    }

    var qType = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) ? 'writing' : 'mcq'
    var modelAnswer = (ans && (ans.modelAnswer || ans.answer || ans.solution)) || q.modelAnswer || ''
    var acceptedAnswers = (ans && Array.isArray(ans.acceptedAnswers) ? ans.acceptedAnswers : (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []))

    if (qType === 'writing') {
      return {
        type: 'writing',
        question: q.question || '',
        options: [],
        correct: -1,
        points: q.points || 5,
        modelAnswer: modelAnswer,
        acceptedAnswers: acceptedAnswers,
      }
    }
    // MCQ
    var correctIdx = typeof q.correct === 'number' ? q.correct : 0
    // If answer doc has correct index, prefer it
    if (ans && typeof ans.correct === 'number') correctIdx = ans.correct
    return {
      type: 'mcq',
      question: q.question || '',
      options: (q.options || ['N/A', 'N/A', 'N/A', 'N/A']).slice(0, 4),
      correct: correctIdx,
      points: q.points || 1,
      modelAnswer: modelAnswer,
    }
  })
}

export async function POST(request) {
  try {
    var formData = await request.formData()
    var questionFile = formData.get('file') || formData.get('questionFile')
    var answerFile = formData.get('answerFile')
    var fileUrl = formData.get('fileUrl') || formData.get('questionUrl') || ''
    var answerUrl = formData.get('answerUrl') || ''
    var type = formData.get('type') || 'exam'
    var grade = formData.get('grade') || ''

    console.log('[AI Extract] Request received:', {
      hasQuestionFile: !!(questionFile && questionFile.size > 0),
      hasAnswerFile: !!(answerFile && answerFile.size > 0),
      fileUrl: fileUrl ? 'yes' : 'no',
      answerUrl: answerUrl ? 'yes' : 'no',
      type: type,
      grade: grade,
    })

    if ((!questionFile || questionFile.size === 0) && !fileUrl.trim()) {
      return NextResponse.json({ error: 'Upload a question file or enter a URL' }, { status: 400 })
    }

    var apiKey = process.env.GEMINI_API_KEY || ''
    if (!hasGeminiKey()) {
      console.error('[AI Extract] GEMINI_API_KEY not found in environment')
      return NextResponse.json({ error: 'GEMINI_API_KEY not found — أضف المفتاح في Vercel Environment Variables أو ملف .env.local' }, { status: 500 })
    }

    // ============= Load question file (or URL) =============
    var qPart: any = null
    var hasQuestionFile = questionFile && questionFile.size > 0
    if (hasQuestionFile) {
      var qBase64 = await toBase64(questionFile)
      qPart = { inlineData: { mimeType: getMimeType(questionFile), data: qBase64 } }
    } else if (fileUrl.trim()) {
      try {
        var fetchRes = await fetch(fileUrl.trim())
        if (!fetchRes.ok) throw new Error('Download failed: ' + fetchRes.status)
        var arrayBuf = await fetchRes.arrayBuffer()
        var qBase64Url = Buffer.from(new Uint8Array(arrayBuf)).toString('base64')
        var ct = fetchRes.headers.get('content-type') || ''
        var qMime = ct.includes('pdf') ? 'application/pdf' : ct.includes('png') ? 'image/png' : ct.includes('webp') ? 'image/webp' : ct.includes('image') ? ct : 'image/jpeg'
        qPart = { inlineData: { mimeType: qMime, data: qBase64Url } }
      } catch (err) {
        return NextResponse.json({ error: 'Failed to download question file' }, { status: 400 })
      }
    }

    // ============= Load answer file (or URL) if present =============
    var aPart: any = null
    var hasAnswerFile = answerFile && answerFile.size > 0
    if (hasAnswerFile) {
      var aBase64 = await toBase64(answerFile)
      aPart = { inlineData: { mimeType: getMimeType(answerFile), data: aBase64 } }
    } else if (answerUrl.trim()) {
      try {
        var aFetchRes = await fetch(answerUrl.trim())
        if (!aFetchRes.ok) throw new Error('Download answer failed: ' + aFetchRes.status)
        var aBuf = await aFetchRes.arrayBuffer()
        var aBase64Url = Buffer.from(new Uint8Array(aBuf)).toString('base64')
        var aCt = aFetchRes.headers.get('content-type') || ''
        var aMime = aCt.includes('pdf') ? 'application/pdf' : aCt.includes('png') ? 'image/png' : aCt.includes('webp') ? 'image/webp' : aCt.includes('image') ? aCt : 'image/jpeg'
        aPart = { inlineData: { mimeType: aMime, data: aBase64Url } }
      } catch (err) {
        // ignore answer file download errors, continue with just questions
      }
    }

    var twoFilesMode = !!qPart && !!aPart

    // ============= Mode 1: SINGLE FILE (questions + answers together) =============
    if (!twoFilesMode) {
      var singlePrompt = buildSingleFilePrompt(grade, type)
      var singleParts = [{ text: singlePrompt }, qPart]
      var singleRes = await callGemini(apiKey, singleParts)
      if (!singleRes.ok) {
        return NextResponse.json({ error: 'AI error: ' + singleRes.error }, { status: 500 })
      }
      var extracted = parseAIJson(singleRes.text)
      if (!extracted) {
        return NextResponse.json({ error: 'Could not parse AI response', raw: (singleRes.text || '').substring(0, 500) }, { status: 500 })
      }
      // If we got questions but writing questions have empty modelAnswer, try a second pass to extract answers
      var writingWithEmptyModel = (extracted.questions || []).filter(function(q: any) {
        return (q.type === 'writing' || q.type === 'essay') && !(q.modelAnswer || q.answer || '').trim()
      })
      if (writingWithEmptyModel.length > 0) {
        console.log('[AI Extract] Found', writingWithEmptyModel.length, 'writing questions with empty modelAnswer. Running answer extraction pass...')
        var answersPrompt = buildAnswersOnlyPrompt(grade, type, extracted.questions)
        var answersParts = [{ text: answersPrompt }, qPart]
        var answersRes = await callGemini(apiKey, answersParts)
        if (answersRes.ok) {
          var answersData = parseAIJson(answersRes.text)
          if (answersData && Array.isArray(answersData.answers)) {
            // Merge answers into extracted questions
            extracted.questions = extracted.questions.map(function(q: any, i: number) {
              var ans = answersData.answers[i]
              if (ans) {
                return Object.assign({}, q, {
                  modelAnswer: q.modelAnswer || ans.modelAnswer || ans.answer || '',
                  acceptedAnswers: Array.isArray(q.acceptedAnswers) && q.acceptedAnswers.length > 0 ? q.acceptedAnswers : (Array.isArray(ans.acceptedAnswers) ? ans.acceptedAnswers : []),
                  correct: (q.type === 'writing' || q.type === 'essay') ? -1 : (typeof ans.correct === 'number' ? ans.correct : (typeof q.correct === 'number' ? q.correct : 0))
                })
              }
              return q
            })
          }
        }
      }
      return finalizeExtracted(extracted, type, grade, false)
    }

    // ============= Mode 2: TWO FILES (separate questions + answers) =============
    // Step A: Extract questions only from the questions file
    var questionsPrompt = buildQuestionsOnlyPrompt(grade, type)
    var questionsParts = [{ text: questionsPrompt }, qPart]
    var questionsRes = await callGemini(apiKey, questionsParts)
    if (!questionsRes.ok) {
      return NextResponse.json({ error: 'AI error extracting questions: ' + questionsRes.error }, { status: 500 })
    }
    var questionsData = parseAIJson(questionsRes.text)
    if (!questionsData || !Array.isArray(questionsData.questions) || questionsData.questions.length === 0) {
      return NextResponse.json({ error: 'Could not extract questions from questions file', raw: (questionsRes.text || '').substring(0, 500) }, { status: 500 })
    }

    // Step B: Extract answers only from the answers file
    var answersPrompt = buildAnswersOnlyPrompt(grade, type, questionsData.questions)
    var answersParts = [{ text: answersPrompt }, aPart]
    var answersRes = await callGemini(apiKey, answersParts)
    var answersData: any = { answers: [] }
    if (answersRes.ok) {
      answersData = parseAIJson(answersRes.text) || { answers: [] }
      if (!Array.isArray(answersData.answers)) {
        // Maybe the AI returned them as "questions" array - try that
        if (Array.isArray(answersData.questions)) {
          answersData.answers = answersData.questions
        } else {
          answersData.answers = []
        }
      }
    }

    // Step C: Merge questions + answers locally
    var mergedQuestions = mergeQuestionsAndAnswers(questionsData.questions, answersData.answers || [])

    var extracted2 = {
      title: questionsData.title || (type + ' - ' + grade),
      content: questionsData.content || '',
      questions: mergedQuestions,
      answerKey: typeof answersData === 'object' ? (answersData.answerKey || '') : '',
    }
    return finalizeExtracted(extracted2, type, grade, true)
  } catch (error) {
    console.error('AI extract error:', error)
    return NextResponse.json({ error: 'Error: ' + (error.message || 'Unknown') }, { status: 500 })
  }
}

// ============= Prompt builders =============

function buildSingleFilePrompt(grade: string, type: string): string {
  var lines = []
  lines.push('You are an expert math teacher. I will give you ONE document containing math questions AND their answers.')
  lines.push('Extract questions AND their answers from this single document.')
  lines.push('')
  lines.push('IMPORTANT: Extract ONLY the questions that actually exist in the document. Do NOT invent, create, or add any questions that are not in the document.')
  lines.push('If the document has 5 questions, extract exactly those 5. If it has 20, extract all 20.')
  lines.push('')
  lines.push('There are TWO types of questions you should extract:')
  lines.push('1. "mcq" - Multiple Choice Questions: questions with options (A, B, C, D). If the question has options/choices, classify it as "mcq".')
  lines.push('2. "writing" - Essay/Written Questions: questions that require the student to write a full solution (no multiple choices). If the question asks to "solve", "prove", "find", "calculate", "simplify", "factor", "expand", or requires showing work, classify it as "writing".')
  lines.push('')
  lines.push('For "mcq" questions:')
  lines.push('- Copy the EXACT question text from the document (translate to English if needed)')
  lines.push('- Copy the EXACT options from the document (translate to English if needed)')
  lines.push('- If the document has fewer than 4 options, add plausible wrong options')
  lines.push('- If the document has no options, create 4 options with the correct answer included')
  lines.push('- Set correct answer index (0=A, 1=B, 2=C, 3=D)')
  lines.push('- Provide a modelAnswer with the step-by-step solution')
  lines.push('')
  lines.push('For "writing" questions:')
  lines.push('- Copy the EXACT question text from the document')
  lines.push('- Set options to empty array []')
  lines.push('- Set correct to -1')
  lines.push('- Provide a modelAnswer with the COMPLETE step-by-step solution (this is the reference answer for grading)')
  lines.push('- Set acceptedAnswers to an array of acceptable final answers (e.g. ["5", "x=5", "x = 5"])')
  lines.push('')
  lines.push('Rules:')
  lines.push('- ALL output text in English')
  lines.push('- MATH FORMAT (very important — the platform renders this format as real math):')
  lines.push('  * Powers: use the ^ symbol — x^2, y^5, 2^12. The platform renders them as REAL superscripts (x\u00b2).')
  lines.push('  * Fractions: EVERY fraction must use the marker \\frac{numerator}{denominator} — the platform renders it as a REAL stacked fraction (numerator above a bar, denominator below).')
  lines.push('    Example: \\frac{2^4}{2^3} renders as 2\u2074 above 2\u00b3 with a fraction bar.')
  lines.push('    Do NOT wrap the whole numerator or denominator in parentheses: write \\frac{2^4}{2^3} NOT \\frac{(2^4)}{(2^3)}.')
  lines.push('    Parentheses are allowed ONLY when they are part of the math itself, e.g. \\frac{(a+1)(a-1)}{a-1}.')
  lines.push('    NEVER write fractions as a/b or \u00be or with \u00f7 — ALWAYS use the \\frac{numerator}{denominator} marker (also inside options and acceptedAnswers).')
  lines.push('  * Square root: \u221a (e.g. \u221a9 = 3) | Cube root: \u221b | Fourth root: \u221c')
  lines.push('  * Multiplication: \u00d7 (e.g. 2 \u00d7 3 = 6) | Division: \u00f7 | Pi: \u03c0 | Plus/minus: \u00b1')
  lines.push('  * Less/greater than: < > \u2264 \u2265 | NOT equal: \u2260 | Approximate: \u2248 | Angle: \u2220 | Degree: \u00b0 | Percent: %')
  lines.push('  * Do NOT write "squared", "cubed", "to the power of" as words.')
  lines.push('  * Do NOT use any other LaTeX: no $ signs, no \\sqrt, no \\times, no \\left, no \\right, no markdown (**, *, #). The ONLY LaTeX allowed is \\frac{numerator}{denominator}.')
  lines.push('- Do NOT add questions from outside the document')
  lines.push('- Do NOT skip any question from the document')
  lines.push('- Preserve the order of questions as they appear in the document')
  lines.push('- Match each question with its correct answer/solution')
  lines.push('- Grade: ' + grade + ' | Type: ' + type)
  lines.push('')
  lines.push('Return ONE single valid JSON object — no text before or after, no markdown fences, no fields outside the object:')
  lines.push('{"title":"...","content":"...","questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"points":1,"modelAnswer":"step by step solution"},{"type":"writing","question":"...","options":[],"correct":-1,"points":5,"modelAnswer":"full step by step solution","acceptedAnswers":["5","x=5"]}],"answerKey":""}')
  return lines.join('\n')
}

function buildQuestionsOnlyPrompt(grade: string, type: string): string {
  var lines = []
  lines.push('You are an expert math teacher. I will give you ONE document containing math QUESTIONS ONLY (no answers).')
  lines.push('Extract ONLY the questions from this document. Do NOT extract or invent any answers.')
  lines.push('')
  lines.push('IMPORTANT: Extract ONLY the questions that actually exist in the document. Do NOT invent, create, or add any questions that are not in the document.')
  lines.push('If the document has 5 questions, extract exactly those 5. If it has 20, extract all 20.')
  lines.push('')
  lines.push('There are TWO types of questions you should extract:')
  lines.push('1. "mcq" - Multiple Choice Questions: questions with options (A, B, C, D). If the question has options/choices, classify it as "mcq".')
  lines.push('2. "writing" - Essay/Written Questions: questions that require the student to write a full solution (no multiple choices). If the question asks to "solve", "prove", "find", "calculate", "simplify", "factor", "expand", or requires showing work, classify it as "writing".')
  lines.push('')
  lines.push('For "mcq" questions:')
  lines.push('- Copy the EXACT question text from the document (translate to English if needed)')
  lines.push('- Copy the EXACT options from the document (translate to English if needed)')
  lines.push('- If the document has fewer than 4 options, add plausible wrong options')
  lines.push('- If the document has no options, create 4 options (correct index will be filled later from answer key, just set 0 for now)')
  lines.push('- Set correct to 0 (will be corrected later from answer key)')
  lines.push('- Set modelAnswer to empty string "" (will be filled from answer key)')
  lines.push('')
  lines.push('For "writing" questions:')
  lines.push('- Copy the EXACT question text from the document')
  lines.push('- Set options to empty array []')
  lines.push('- Set correct to -1')
  lines.push('- Set modelAnswer to empty string "" (will be filled from answer key)')
  lines.push('- Set acceptedAnswers to empty array [] (will be filled from answer key)')
  lines.push('')
  lines.push('Rules:')
  lines.push('- ALL output text in English')
  lines.push('- MATH FORMAT (very important — the platform renders this format as real math):')
  lines.push('  * Powers: use the ^ symbol — x^2, y^5, 2^12. The platform renders them as REAL superscripts.')
  lines.push('  * Fractions: EVERY fraction must use the marker \\frac{numerator}{denominator} — rendered as a REAL stacked fraction (numerator above a bar, denominator below). Example: \\frac{3}{4}.')
  lines.push('    Do NOT wrap the whole numerator or denominator in parentheses: write \\frac{2^4}{2^3} NOT \\frac{(2^4)}{(2^3)}.')
  lines.push('    NEVER write fractions as a/b or \u00be or with \u00f7 — ALWAYS use the \\frac{numerator}{denominator} marker (also inside options arrays).')
  lines.push('  * Use \u221a for square root, \u221b for cube root, \u00d7 for multiplication, \u00f7 for division, \u03c0 for pi.')
  lines.push('  * Do NOT use any other LaTeX: no $ signs, no \\sqrt, no \\times, no \\left, no \\right, no markdown. The ONLY LaTeX allowed is \\frac{numerator}{denominator}.')
  lines.push('- Do NOT add questions from outside the document')
  lines.push('- Do NOT skip any question from the document')
  lines.push('- Preserve the order of questions as they appear in the document')
  lines.push('- Grade: ' + grade + ' | Type: ' + type)
  lines.push('')
  lines.push('Return ONE single valid JSON object — no text before or after, no markdown fences, no fields outside the object:')
  lines.push('{"title":"...","content":"...","questions":[{"type":"mcq","question":"...","options":["A","B","C","D"],"correct":0,"points":1,"modelAnswer":""},{"type":"writing","question":"...","options":[],"correct":-1,"points":5,"modelAnswer":"","acceptedAnswers":[]}]}')
  return lines.join('\n')
}

function buildAnswersOnlyPrompt(grade: string, type: string, questions: any[]): string {
  var lines = []
  lines.push('You are an expert math teacher. I will give you ONE document containing ANSWERS / answer key for math questions.')
  lines.push('Extract the answer for EACH question. The answers should match the questions I list below.')
  lines.push('')
  lines.push('Here are the questions extracted from a separate questions document (in order):')
  questions.forEach(function(q, i) {
    var qType = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) ? 'writing' : 'mcq'
    if (qType === 'mcq') {
      lines.push((i + 1) + '. [MCQ] ' + (q.question || ''))
      if (Array.isArray(q.options) && q.options.length > 0) {
        lines.push('   Options: ' + q.options.map(function(o, oi) { return String.fromCharCode(65 + oi) + ') ' + o }).join(' | '))
      }
    } else {
      lines.push((i + 1) + '. [WRITING] ' + (q.question || ''))
    }
  })
  lines.push('')
  lines.push('For EACH question above, find its answer in the answer-key document and return:')
  lines.push('- For MCQ: the correct option index (0=A, 1=B, 2=C, 3=D) and a step-by-step modelAnswer')
  lines.push('- For WRITING: a complete step-by-step modelAnswer AND an array of acceptedAnswers (acceptable final answers)')
  lines.push('')
  lines.push('If an answer is not found in the document, return empty values for that question.')
  lines.push('')
  lines.push('Rules:')
  lines.push('- ALL output text in English')
  lines.push('- MATH FORMAT (very important — the platform renders this format as real math):')
  lines.push('  * Powers: use the ^ symbol — x^2, y^5, 2^12 (rendered as REAL superscripts).')
  lines.push('  * In modelAnswer / acceptedAnswers write every fraction as \\frac{numerator}{denominator} — rendered as a REAL stacked fraction. Example: "\\frac{3}{4}". NEVER write a/b or \u00be.')
  lines.push('  * Do NOT wrap the whole numerator or denominator in parentheses: write \\frac{2^4}{2^3} NOT \\frac{(2^4)}{(2^3)}.')
  lines.push('  * Use proper Unicode symbols: \u221a \u00d7 \u00f7 \u03c0 \u2264 \u2265 \u2260 \u2248 \u2220 \u00b0. Do NOT use other LaTeX ($, \\sqrt, \\times…) or markdown.')
  lines.push('- The "answers" array MUST have the same length and order as the questions above')
  lines.push('- Each answer object MUST have an "index" field matching the question number (0-based)')
  lines.push('')
  lines.push('Return ONE single valid JSON object — no text before or after, no markdown fences, no fields outside the object:')
  lines.push('{"answers":[{"index":0,"correct":0,"modelAnswer":"step by step"},{"index":1,"modelAnswer":"full solution","acceptedAnswers":["5","x=5"]}]}')
  return lines.join('\n')
}

function finalizeExtracted(extracted: any, type: string, grade: string, twoFilesMode: boolean): any {
  if (!extracted.title) { extracted.title = type + ' - ' + grade }
  if (!extracted.content) { extracted.content = '' }
  if (!Array.isArray(extracted.questions)) { extracted.questions = [] }
  if (!extracted.answerKey) { extracted.answerKey = '' }

  extracted.questions = extracted.questions.map(function(q) {
    var qType = q.type === 'writing' || q.type === 'essay' ? 'writing' : 'mcq'
    if (qType === 'writing') {
      return {
        type: 'writing',
        question: normalizeMath(q.question || ''),
        options: [],
        correct: -1,
        points: q.points || 5,
        modelAnswer: normalizeMath(q.modelAnswer || q.answer || ''),
        acceptedAnswers: (Array.isArray(q.acceptedAnswers) ? q.acceptedAnswers : []).map(function(a: any) { return normalizeMath(String(a)) })
      }
    }
    return {
      type: 'mcq',
      question: normalizeMath(q.question || ''),
      options: (q.options || ['N/A', 'N/A', 'N/A', 'N/A']).slice(0, 4).map(function(o: any) { return normalizeMath(String(o)) }),
      correct: typeof q.correct === 'number' ? q.correct : 0,
      points: q.points || 1,
      modelAnswer: normalizeMath(q.modelAnswer || '')
    }
  })

  var mcqCount = extracted.questions.filter(function(q) { return q.type === 'mcq' }).length
  var writingCount = extracted.questions.filter(function(q) { return q.type === 'writing' }).length
  extracted.stats = { mcq: mcqCount, writing: writingCount, total: extracted.questions.length, twoFilesMode: twoFilesMode }
  return NextResponse.json({ success: true, extracted: extracted })
}
