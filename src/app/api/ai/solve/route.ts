// @ts-nocheck
// ============================================================
// FILE: src/app/api/ai/solve/route.ts
// PURPOSE: (2026-وN9) قسم «اسأل الـ AI» بطلب المستر —
//   الطالب اللي مش عارف يحل سؤال بيرفعه هنا (صورة + نص اختياري)
//   والـ AI يحله كامل ويشرحه له بالمصري البسيط وبرموز المنصة.
//
//   ده غير المساعد الذكي: المساعد بيرفض يحل أسئلة الواجب عشان الطالب
//   يجرب الأول — ده القسم المخصص للحل الكامل خطوة بخطوة لما الطالب
//   يعلن إنه محتاج مساعدة.
//
//   المحركات (نفس فلسفة وN8 — الأقوى الأول):
//   - صور: Gemini Pro (vision مثبت) → ZAI vision
//   - نص:  ZAI بتفكير عميق → Gemini Pro
//
//   سجل الأسئلة بيتخزن في جدول AiSolveLog (raw SQL، جدول بيتبني لوحده)
//   — الطالب يشوف أسئلته القديمة والحلول، وآخر 20 سؤال لكل طالب.
// ============================================================

import { NextResponse } from 'next/server'
import { db, withRetry } from '@/lib/db'
import { callGemini, GEMINI_MODELS, GEMINI_GRADING_MODELS } from '@/lib/gemini'
import { zaiGradeText, zaiGradeVision } from '@/lib/zai-grader'
/* (2026-و33) نفس منقّي رموز المنصة — الرد يطلع برموز نضيفة من غير $ أو ** */
import { sanitizeMathText, NOTATION_RULES, ENGLISH_TERMS_RULE } from '@/lib/math-sanitize'
import { repairCorruptMath } from '@/lib/math-text'

export const runtime = 'nodejs'
export const maxDuration = 60

var MAX_IMAGES = 3
var MAX_B64_LENGTH = 7000000 // ~5MB binary after base64
var DATA_URL_RE = /^data:(image\/[a-zA-Z0-9.+-]+);base64,([\s\S]+)$/
var MAX_TEXT = 2000
/* (ز17) حارس الاستهلاك — 10 أسئلة / 5 دقايق لكل طالب */
var RATE_LIMIT = 10
var RATE_WINDOW_MS = 5 * 60 * 1000
var rateHits: any = {}
var HISTORY_LIMIT = 20
var STORED_IMAGE_MAX = 500000 // أول صورة بس في السجل — أكبر من كده نسيبها فاضية

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

function checkRateLimit(req: Request, studentId: string): { ok: boolean; waitSec: number } {
  var ip = ''
  try {
    ip = String((req.headers && (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip'))) || '').split(',')[0].trim()
  } catch (e) {}
  var key = String(studentId || 'anon') + '|' + ip
  var now = Date.now()
  var entry = rateHits[key]
  if (!entry || now - entry.start > RATE_WINDOW_MS) {
    rateHits[key] = { start: now, count: 1 }
    var staleKeys = Object.keys(rateHits)
    if (staleKeys.length > 5000) {
      for (var i = 0; i < staleKeys.length; i++) {
        var e = rateHits[staleKeys[i]]
        if (!e || now - e.start > RATE_WINDOW_MS) delete rateHits[staleKeys[i]]
      }
    }
    return { ok: true, waitSec: 0 }
  }
  entry.count++
  if (entry.count > RATE_LIMIT) {
    var waitSec = Math.ceil((entry.start + RATE_WINDOW_MS - now) / 1000)
    return { ok: false, waitSec: waitSec }
  }
  return { ok: true, waitSec: 0 }
}

/* جدول السجل بيتبني لوحده من أول استخدام — أي فشل هنا آمن ومش بيوقف الحل */
async function ensureTable(): Promise<void> {
  try {
    await db.$executeRawUnsafe('CREATE TABLE IF NOT EXISTS AiSolveLog (id TEXT PRIMARY KEY, studentId TEXT, grade TEXT, questionText TEXT, imageData TEXT, solution TEXT, createdAt TEXT)')
    try { await db.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS idx_aisolve_student ON AiSolveLog (studentId, createdAt)') } catch (e) {}
  } catch (e) {}
}

/* برومبت الحَلّال — الحل الكامل + الشرح بالمصري + رموز المنصة */
function buildSolvePrompt(questionText: string, grade: string, imageCount: number): string {
  var lines: string[] = []
  lines.push('أنت «حَلّال» منصة مستر شريف السيد — أقوى معلم رياضيات بيحل أي سؤال Math ويشرحه للطالب كأنه بيعدّي معاه الدرس.')
  lines.push('الطالب بعتلك سؤال مش عارف يحله' + (imageCount > 0 ? ' (فيه ' + imageCount + ' صورة — اقرا الصور كويس أوي: الأسئلة والرسومات والأرقام كلها فيها)' : '') + '.')
  lines.push('المطلوب: احله كامل واشرحله بالعامية المصرية البسيطة اللي الطالب بيفهمها فورًا.')
  lines.push('')
  lines.push('## الشكل المطلوب بالظبط (بالترتيب ده):')
  lines.push('🎯 السؤال: اكتب السؤال زي ما فهمته من الصورة أو النص (لو فيه رسمة أو جدول اذكر تفاصيله بالأرقام)')
  lines.push('💡 الفكرة: القاعدة أو الفكرة اللي هنستخدمها — سطرين بالكتير بشرح ليه دي القاعدة المناسبة')
  lines.push('🧮 الحل خطوة بخطوة: كل خطوة في سطر مع سببها المختصر بين قوسين (ليه عملنا الخطوة دي)')
  lines.push('✅ الإجابة النهائية: الإجابة واضحة ومبرزة في سطر لوحدها')
  lines.push('⚠️ خلي بالك: أشهر غلطة بيقع فيها الطلبة في السؤال ده — سطر واحد')
  lines.push('')
  lines.push('## قواعد مهمة:')
  lines.push('- لو الصورة فيها أكتر من سؤال: حل كل سؤال بالترتيب بنفس الشكل (بحد أقصى 4 أسئلة في الرد، وقول للطالب يبعت تاني عشان تكمل الباقي).')
  lines.push('- لو الطالب معلّم أو حط علامة على سؤال معين في الصورة، ابدأ بسؤاله هو الأول.')
  lines.push('- لو الصورة مش واضحة أو مش رياضيات: قول بصراحة وودّ واطلب صورة أوضح أو سؤال مكتوب.')
  lines.push('- لو السؤال متعدد الاختيارات: وضّح ليه كل اختيار تاني غلط بسرعة.')
  lines.push('- راجع كل حساب قبل ما تكتبه — الدقة أهم من أي حاجة. ممنوع تخترع رقم مش موجود.')
  lines.push('- خطواتك لازم تكون صحيحة منطقيًا ومترابطة — المفروض الطالب يقدر يعيد الحل بنفسه بعد قراية شرحك.')
  lines.push('')
  lines.push('## قاعدة كتابة الرموز الرياضية (إجبارية — المنصة بترسم الرموز دي حقيقية):')
  lines.push(NOTATION_RULES)
  lines.push('')
  lines.push('## المصطلحات بالإنجليزي زي دروس المنصة (إجبارية):')
  lines.push(ENGLISH_TERMS_RULE)
  if (questionText) {
    lines.push('')
    lines.push('## نص السؤال اللي كتبه الطالب:')
    lines.push(repairCorruptMath(questionText))
  }
  if (grade) lines.push('الطالب في ' + grade + ' — خلّي الشرح مناسبة لمستواه.')
  return lines.join('\n')
}

function sanitizeSolution(text: string): string {
  return sanitizeMathText(String(text || '')).trim()
}

export async function GET(request: Request) {
  try {
    var url = new URL(request.url)
    var studentId = String(url.searchParams.get('studentId') || '').trim()
    if (!studentId) return NextResponse.json({ history: [] })
    await ensureTable()
    var rows: any[] = []
    try {
      rows = await withRetry(function () {
        return db.$queryRawUnsafe('SELECT id, questionText, imageData, solution, createdAt FROM AiSolveLog WHERE studentId = ? ORDER BY createdAt DESC LIMIT ?', studentId, HISTORY_LIMIT)
      }) as any[]
    } catch (e) { rows = [] }
    var history = (rows || []).map(function (r) {
      return {
        id: String(r.id || ''),
        questionText: String(r.questionText || ''),
        imageData: String(r.imageData || '') || undefined,
        solution: String(r.solution || ''),
        createdAt: String(r.createdAt || ''),
      }
    })
    return NextResponse.json({ history: history })
  } catch (e) {
    return NextResponse.json({ history: [] })
  }
}

export async function POST(request: Request) {
  try {
    var body = await request.json()
    var questionText = String((body.text || '')).trim().slice(0, MAX_TEXT)
    var studentId = String(body.studentId || '').trim()
    var grade = String(body.grade || '').trim().slice(0, 40)
    var imageParts = buildImageParts(body.images)

    /* حارس الاستهلاك قبل أي محرك */
    var rate = checkRateLimit(request, studentId)
    if (!rate.ok) {
      return NextResponse.json({ error: 'بعت أسئلة كتير أوي في وقت قصير 😅 استنى ' + Math.max(rate.waitSec, 10) + ' ثانية وجرب تاني.' }, { status: 429 })
    }

    if (!questionText && imageParts.length === 0) {
      return NextResponse.json({ error: 'اكتب سؤالك أو ارفع صورة السؤال الأول 📸' }, { status: 400 })
    }

    /* الصور اتبعتت لكن كلها غير صالحة */
    var sentImages = Array.isArray(body.images) ? body.images.length : 0
    if (sentImages > 0 && imageParts.length === 0) {
      return NextResponse.json({ error: 'الصور اللي بعتها مش مقبولة 😅 جرب تبعت صورة PNG أو JPG عادية.' }, { status: 400 })
    }

    var prompt = buildSolvePrompt(questionText, grade, imageParts.length)

    /* ============ المحركات — الأقوى الأول ============ */
    var result: { ok: boolean; text?: string; error?: string } | null = null
    var lastErr = ''
    var timeoutMs = imageParts.length > 0 ? 50000 : 45000

    if (imageParts.length > 0) {
      /* صور: Gemini Pro vision أولاً (مثبت في قراية الصور) */
      var gParts = imageParts.concat([{ text: prompt }])
      try {
        var gRes = await callGemini({
          parts: gParts,
          models: GEMINI_GRADING_MODELS.concat(GEMINI_MODELS),
          generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
          timeoutMs: timeoutMs,
          thinking: 'low',
        })
        if (gRes.ok && gRes.text) result = gRes
        else lastErr = gRes.error || ''
      } catch (gE: any) { lastErr = String((gE && gE.message) || gE) }
      /* احتياطي: ZAI vision */
      if (!result || !result.ok) {
        var zUrls: string[] = []
        for (var zi = 0; zi < body.images.length && zUrls.length < MAX_IMAGES; zi++) {
          if (DATA_URL_RE.test(String(body.images[zi]))) zUrls.push(String(body.images[zi]))
        }
        try {
          var zRes = await zaiGradeVision(zUrls, prompt, { timeoutMs: timeoutMs, thinking: true })
          if (zRes.ok && zRes.text) result = zRes
          else lastErr = lastErr + ' | ' + (zRes.error || '')
        } catch (zE: any) { lastErr = lastErr + ' | ' + String((zE && zE.message) || zE) }
      }
    } else {
      /* نص: ZAI بتفكير عميق أولاً — أقوى في الماث ومجاني */
      try {
        var zt = await zaiGradeText(prompt, { timeoutMs: timeoutMs, thinking: true })
        if (zt.ok && zt.text) result = zt
        else lastErr = zt.error || ''
      } catch (zE2: any) { lastErr = String((zE2 && zE2.message) || zE2) }
      /* احتياطي: Gemini Pro */
      if (!result || !result.ok) {
        try {
          var gRes2 = await callGemini({
            parts: [{ text: prompt }],
            models: GEMINI_GRADING_MODELS.concat(GEMINI_MODELS),
            generationConfig: { temperature: 0.2, maxOutputTokens: 4096 },
            timeoutMs: timeoutMs,
          })
          if (gRes2.ok && gRes2.text) result = gRes2
          else lastErr = lastErr + ' | ' + (gRes2.error || '')
        } catch (gE2: any) { lastErr = lastErr + ' | ' + String((gE2 && gE2.message) || gE2) }
      }
    }

    if (!result || !result.ok || !result.text) {
      console.error('[ai/solve] all engines failed:', lastErr)
      return NextResponse.json({ error: 'المحرك مشغول دلوقتي 😅 استنى ثانية وجرب تاني — ولو صار تاني ابعت السؤال نص مكتوب.' }, { status: 502 })
    }

    var solution = sanitizeSolution(result.text)

    /* ============ السجل — fire-and-forget، أي فشل مش بيوقف الرد ============ */
    var askId = 'asl_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8)
    var storedImage = ''
    try {
      if (Array.isArray(body.images) && body.images.length > 0 && DATA_URL_RE.test(String(body.images[0])) && String(body.images[0]).length <= STORED_IMAGE_MAX) {
        storedImage = String(body.images[0])
      }
    } catch (e) {}
    ;(async function () {
      try {
        await ensureTable()
        await withRetry(function () {
          return db.$executeRawUnsafe('INSERT INTO AiSolveLog (id, studentId, grade, questionText, imageData, solution, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', askId, studentId, grade, questionText, storedImage, solution, new Date().toISOString())
        })
        /* نظافة القاعدة: سيب آخر 20 سؤال لكل طالب بس */
        try {
          await db.$executeRawUnsafe('DELETE FROM AiSolveLog WHERE studentId = ? AND id NOT IN (SELECT id FROM AiSolveLog WHERE studentId = ? ORDER BY createdAt DESC LIMIT ?)', studentId, studentId, HISTORY_LIMIT)
        } catch (e2) {}
      } catch (e) {}
    })()

    return NextResponse.json({ solution: solution, id: askId })
  } catch (error) {
    console.error('[ai/solve] error:', error)
    return NextResponse.json({ error: 'حصلت مشكلة غير متوقعة — جرب تاني 🙏' }, { status: 500 })
  }
}
