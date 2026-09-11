// @ts-nocheck
import { NextResponse } from 'next/server'
import { getGeminiApiKeys, callGemini, GEMINI_MODELS } from '@/lib/gemini'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

/* ============================================================
 * /api/ai/status — تشخيص صريح للمساعد الذكي (للمستر/التطوير)
 * بيقول بالظبط:
 *  1) هل فيه مفاتيح Gemini متظبطة في البيئة؟ (مقنعة — مفيش تسريب)
 *  2) أنهي موديلات المفتاح ده يدعمها فعلًا من Google؟
 *  3) اختبار حي: Gemini بيرد في قد إيه؟ ولو فشل — السبب الحرفي.
 *  4) اختبار حي لـ ZAI (الشبكة الأمان).
 * مفيش أي مفتاح بيتكشف — أول 4 حروف وآخر حرفين بس.
 * ============================================================ */

function maskKey(k: string): string {
  if (!k || k.length < 10) return '***'
  return k.slice(0, 6) + '…' + k.slice(-2) + ' (' + k.length + ' حرف)'
}

async function listGoogleModels(key: string): Promise<{ ok: boolean; models?: string[]; error?: string }> {
  try {
    var controller = new AbortController()
    var to = setTimeout(function () { controller.abort() }, 10000)
    var res = await fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + key, { signal: controller.signal })
    clearTimeout(to)
    if (!res.ok) {
      var body = ''
      try { body = (await res.text()).substring(0, 200) } catch (e) {}
      return { ok: false, error: 'ListModels ' + res.status + ' ' + body }
    }
    var data = await res.json()
    var out: string[] = []
    var models = (data && data.models) || []
    for (var i = 0; i < models.length; i++) {
      var name = (models[i].name || '').replace(/^models\//, '')
      var methods = models[i].supportedGenerationMethods || []
      if (name.indexOf('gemini') !== 0) continue
      if (name.indexOf('embedding') >= 0 || name.indexOf('aqa') >= 0 || name.indexOf('imagen') >= 0 || name.indexOf('veo') >= 0 || name.indexOf('tts') >= 0) continue
      if (methods.indexOf('generateContent') < 0) continue
      out.push(name)
    }
    return { ok: true, models: out }
  } catch (e: any) {
    return { ok: false, error: String((e && e.message) || e) }
  }
}

export async function GET() {
  var t0 = Date.now()
  var keys = getGeminiApiKeys()
  var result: any = {
    time: new Date().toISOString(),
    staticChain: GEMINI_MODELS,
    gemini: {
      hasKeys: keys.length > 0,
      keyCount: keys.length,
      keysMasked: keys.map(maskKey),
      googleModels: [] as string[],
      listModelsError: '',
      liveTest: { ok: false, model: '', ms: 0, error: '' },
    },
    zai: { ok: false, ms: 0, error: '' },
  }

  if (keys.length > 0) {
    var lm = await listGoogleModels(keys[0])
    if (lm.ok) result.gemini.googleModels = (lm.models || []).slice(0, 25)
    else result.gemini.listModelsError = lm.error || ''

    var t1 = Date.now()
    var live = await callGemini({
      parts: [{ text: 'قل كلمة: تمام' }],
      generationConfig: { temperature: 0, maxOutputTokens: 512 },
      timeoutMs: 25000,
      thinking: 'low',
    })
    result.gemini.liveTest = {
      ok: !!live.ok,
      model: live.model || '',
      ms: Date.now() - t1,
      error: live.ok ? '' : String(live.error || '').substring(0, 400),
    }
  }

  var t2 = Date.now()
  try {
    var zai = await ZAI.create()
    var c = await zai.chat.completions.create({
      messages: [{ role: 'user', content: 'قل كلمة: تمام' }],
      thinking: { type: 'disabled' },
    })
    var txt = String((c && c.choices && c.choices[0] && c.choices[0].message && c.choices[0].message.content) || '').trim()
    result.zai.ok = !!txt
    result.zai.ms = Date.now() - t2
    if (!txt) result.zai.error = 'empty reply'
  } catch (e: any) {
    result.zai.ms = Date.now() - t2
    result.zai.error = String((e && e.message) || e).substring(0, 300)
  }

  result.totalMs = Date.now() - t0
  result.summary = result.gemini.liveTest.ok
    ? 'Gemini شغال (' + result.gemini.liveTest.model + ' في ' + result.gemini.liveTest.ms + 'ms)'
    : (result.zai.ok ? 'Gemini فاشل — ZAI بغطي (السبب: ' + (result.gemini.liveTest.error || result.gemini.listModelsError || 'مفيش مفاتيح') + ')' : 'الاتنين فاشلين — ده سبب «المساعد مشغول»')
  return NextResponse.json(result)
}
