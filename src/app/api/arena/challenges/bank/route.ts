// @ts-nocheck
// ============================================================
// FILE: src/app/api/arena/challenges/bank/route.ts
// PURPOSE: (2026-و68) بنك أسئلة تحدي المستر — طلب المستر الحرفي:
//   «الطالب أول ما يخش يعمل تحدي… يظهر له أسئلة ياخد أسئلة من
//    الملفات دي كلها بشكل عشوائي» — المستر يرفع ملف/ملفات (PDF أو صور)،
//   الـ AI بيستخرج أسئلة اختياري **بالإنجليزي** في بنك، والطالب ياخد
//   10 أسئلة عشوائية من كل الملفات كل محاولة.
//
//   GET  ?mode=list           → (أدمن) كل أسئلة البنك بالإجابات
//   GET  ?mode=round&count=10 → (طالب) أسئلة عشوائية بدون الإجابة الصح
//                                + bankCount (عشان الواجهة تعرف النمط)
//   GET  ?mode=board          → لوحة ترتيب المحاولات (أعلى 30)
//   POST  formData {file}     → (أدمن) رفع ملف → استخراج → إضافة للبنك
//   POST  {action: delete|toggle|clearAll}
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables, makeId } from '@/lib/arena'
import { callGemini as callGeminiCentral, hasGeminiKey } from '@/lib/gemini'
import { parseAIJsonRobust } from '@/lib/ai-json'

export const runtime = 'nodejs'
export const maxDuration = 120

/* خريطة سؤال بنك — بدون الإجابة للطالب */
function mapBankQ(r: any, includeAnswer: boolean) {
  var options: any[] = []
  try { options = JSON.parse(String(r.options || '[]')) } catch (e) {}
  var out: any = {
    id: String(r.id),
    question: String(r.question || ''),
    options: options,
    points: Number(r.points || 10),
  }
  if (includeAnswer) out.correctIndex = Number(r.correctIndex || 0)
  return out
}

export async function GET(request: NextRequest) {
  try {
    await ensureArenaTables()
    var url = new URL(request.url)
    var mode = String(url.searchParams.get('mode') || 'round')

    /* ===== قائمة الأدمن ===== */
    if (mode === 'list') {
      var rows = await db.$queryRawUnsafe('SELECT * FROM ChallengeBankQuestion ORDER BY createdAt DESC LIMIT 500')
      var list = (rows || []).map(function (r: any) { return mapBankQ(r, true) })
      return NextResponse.json({ ok: true, questions: list, count: list.length })
    }

    /* ===== لوحة ترتيب المحاولات ===== */
    if (mode === 'board') {
      var bRows = await db.$queryRawUnsafe('SELECT * FROM ChallengeAttempt ORDER BY score DESC, timeMs ASC, createdAt ASC LIMIT 30')
      var board = (bRows || []).map(function (r: any, i: number) {
        return {
          rank: i + 1,
          name: String(r.name || 'Student'),
          score: Number(r.score || 0),
          correctCount: Number(r.correctCount || 0),
          totalQuestions: Number(r.totalQuestions || 10),
          timeMs: Number(r.timeMs || 0),
          createdAt: String(r.createdAt || ''),
        }
      })
      return NextResponse.json({ ok: true, board: board })
    }

    /* ===== جولة عشوائية للطالب ===== */
    var count = Math.max(3, Math.min(Number(url.searchParams.get('count')) || 10, 20))
    var activeRows = await db.$queryRawUnsafe('SELECT COUNT(*) as c FROM ChallengeBankQuestion WHERE active = 1')
    var total = Number((activeRows && activeRows[0] && activeRows[0].c) || 0)
    /* info — فحص خفيف: فيه أسئلة في البنك ولا لأ (بدون جلب أسئلة) */
    if (mode === 'info') {
      return NextResponse.json({ ok: true, bankCount: total })
    }
    if (total === 0) {
      return NextResponse.json({ ok: true, bankCount: 0, questions: [] })
    }
    var rnd = await db.$queryRawUnsafe('SELECT * FROM ChallengeBankQuestion WHERE active = 1 ORDER BY RANDOM() LIMIT ' + count)
    var qs = (rnd || []).map(function (r: any) { return mapBankQ(r, false) })
    return NextResponse.json({ ok: true, bankCount: total, questions: qs })
  } catch (e: any) {
    console.error('[challenges/bank GET] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في تحميل بنك التحدي' }, { status: 500 })
  }
}

/* برومبت الاستخراج — إنجليزي زي منهج المنصة */
function buildExtractPrompt(mimeType: string, fileName: string): string {
  var lines = []
  lines.push('You are an expert math teacher. Analyze this ' + (mimeType === 'application/pdf' ? 'PDF document' : 'image') + ' (' + (fileName || 'challenge file') + ') carefully.')
  lines.push('Extract ALL math questions from it as multiple-choice questions for a CHALLENGE BANK.')
  lines.push('For each question:')
  lines.push('- Write the full question text in ENGLISH')
  lines.push('- Provide exactly 4 answer options (A, B, C, D) in ENGLISH')
  lines.push('- Identify the correct answer index (0=A, 1=B, 2=C, 3=D)')
  lines.push('')
  lines.push('Rules:')
  lines.push('- ALL questions and options in English only')
  lines.push('- MATH NOTATION (very important — the platform renders this format as real math):')
  lines.push('  * Copy the math EXACTLY as it appears — same numbers, same meaning.')
  lines.push('  * Powers: use the ^ symbol — 2^5, x^2, (2^3)^4.')
  lines.push('  * Fractions: EVERY fraction must use the marker \\frac{numerator}{denominator}. NEVER write fractions as a/b.')
  lines.push('  * Multiplication: × | Division: ÷ | Square root: √ | Cube root: ∛ | Pi: π | Plus/minus: ±')
  lines.push('  * Comparisons: < > ≤ ≥ ≠ ≈ | Angle: ∠ | Degree: ° | Percent: %')
  lines.push('  * No $ signs, no \\sqrt, no markdown. The ONLY LaTeX allowed is \\frac{numerator}{denominator}.')
  lines.push('- If a question has fewer than 4 options, add plausible wrong options')
  lines.push('- Extract as many questions as you can find')
  lines.push('')
  lines.push('Respond with JSON only, no additional text:')
  lines.push('{"questions": [{"question": "question text", "options": ["A", "B", "C", "D"], "correct": 0}]}')
  return lines.join('\n')
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var contentType = String(request.headers.get('content-type') || '')

    /* ===== رفع ملف → استخراج → بنك ===== */
    if (contentType.indexOf('multipart/form-data') !== -1) {
      var formData = await request.formData()
      var file = formData.get('file')
      if (!file || !(file instanceof File) || file.size === 0) {
        return NextResponse.json({ ok: false, error: 'ارفع ملف (PDF أو صورة) الأول' }, { status: 400 })
      }
      if (file.size > 12 * 1024 * 1024) {
        return NextResponse.json({ ok: false, error: 'الملف كبير أوي (الحد 12MB)' }, { status: 413 })
      }
      if (!hasGeminiKey()) {
        return NextResponse.json({ ok: false, error: 'مفتاح Gemini مش متظبط — ضيف GEMINI_API_KEYS في Vercel' }, { status: 500 })
      }
      var bytes = new Uint8Array(await file.arrayBuffer())
      var base64Data = Buffer.from(bytes).toString('base64')
      var fname = String(file.name || '').toLowerCase()
      var mimeType = 'image/jpeg'
      if (fname.endsWith('.pdf')) mimeType = 'application/pdf'
      else if (fname.endsWith('.png')) mimeType = 'image/png'
      else if (fname.endsWith('.webp')) mimeType = 'image/webp'
      else if (file.type && file.type.indexOf('image/') === 0) mimeType = file.type

      var parts = [{ text: buildExtractPrompt(mimeType, String(file.name || '')) }]
      parts.push({ inlineData: { mimeType: mimeType, data: base64Data } })
      var result = await callGeminiCentral({
        parts: parts,
        generationConfig: { temperature: 0.1, maxOutputTokens: 8192, response_mime_type: 'application/json' },
        timeoutMs: 90000,
      })
      if (!result || !result.ok || !result.text) {
        return NextResponse.json({ ok: false, error: 'فشل استخراج الأسئلة: ' + ((result && result.error) || 'unknown') }, { status: 500 })
      }
      var parsed = parseAIJsonRobust(result.text)
      if (!parsed) {
        return NextResponse.json({ ok: false, error: 'مقدرتش أقرا أسئلة من الملف ده — جرب ملف أوضح' }, { status: 422 })
      }
      var extracted = (parsed.questions || []).map(function (q: any) {
        var opts = Array.isArray(q.options) ? q.options.map(function (o: any) { return String(o || '').trim() }).filter(Boolean) : []
        while (opts.length < 4) opts.push('N/A')
        var correct = Math.max(0, Math.min(Number(q.correct) || 0, 3))
        return { question: String(q.question || '').trim(), options: opts.slice(0, 4), correct: correct }
      }).filter(function (q: any) { return q.question.length > 3 })

      if (extracted.length === 0) {
        return NextResponse.json({ ok: false, error: 'مفيش أسئلة اتستخرجت من الملف — اتأكد إنه فيه أسئلة واضحة' }, { status: 422 })
      }

      // خلط الخيارات (الإجابة الصح بتتحرك مع نصها)
      var fileName = String(file.name || '').slice(0, 120)
      var inserted = 0
      for (var i = 0; i < extracted.length; i++) {
        var q = extracted[i]
        var correctText = q.options[q.correct]
        var shuffled = q.options.slice()
        for (var si = shuffled.length - 1; si > 0; si--) {
          var sj = Math.floor(Math.random() * (si + 1))
          var tmp = shuffled[si]; shuffled[si] = shuffled[sj]; shuffled[sj] = tmp
        }
        var newCorrect = Math.max(0, shuffled.indexOf(correctText))
        var id = makeId('cbq')
        try {
          await safeWrite(function () {
            return db.$executeRawUnsafe(
              'INSERT INTO ChallengeBankQuestion (id, fileName, question, options, correctIndex, points, active, createdAt) VALUES (?, ?, ?, ?, ?, 10, 1, CURRENT_TIMESTAMP)',
              id, fileName, q.question, JSON.stringify(shuffled), newCorrect
            )
          })
          inserted++
        } catch (e2) { /* سؤال فاشل مايقفش الباقي */ }
      }
      var totalRow = await db.$queryRawUnsafe('SELECT COUNT(*) as c FROM ChallengeBankQuestion WHERE active = 1')
      var totalActive = Number((totalRow && totalRow[0] && totalRow[0].c) || 0)
      return NextResponse.json({ ok: true, added: inserted, bankCount: totalActive, fileName: fileName })
    }

    /* ===== أفعال JSON: حذف/تفعيل/مسح الكل ===== */
    var body = await request.json().catch(function () { return ({} as any) })
    var action = String(body.action || '')

    if (action === 'delete') {
      var delId = String(body.id || '')
      if (!delId) return NextResponse.json({ ok: false, error: 'معرف السؤال ناقص' }, { status: 400 })
      await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM ChallengeBankQuestion WHERE id = ?', delId) })
      return NextResponse.json({ ok: true })
    }

    if (action === 'toggle') {
      var tid = String(body.id || '')
      var act = body.active ? 1 : 0
      if (!tid) return NextResponse.json({ ok: false, error: 'معرف السؤال ناقص' }, { status: 400 })
      await safeWrite(function () { return db.$executeRawUnsafe('UPDATE ChallengeBankQuestion SET active = ? WHERE id = ?', act, tid) })
      return NextResponse.json({ ok: true })
    }

    if (action === 'clearAll') {
      await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM ChallengeBankQuestion') })
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ ok: false, error: 'أكشن غير معروف' }, { status: 400 })
  } catch (e: any) {
    console.error('[challenges/bank POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في بنك التحدي' }, { status: 500 })
  }
}
