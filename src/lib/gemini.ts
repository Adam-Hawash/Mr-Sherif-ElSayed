// @ts-nocheck
// ============================================================
// FILE: src/lib/gemini.ts
// PURPOSE: Central Gemini AI helper used by ALL AI features
//          (المساعد الذكي + استخراج الواجبات والامتحانات + تصحيح الصور)
//
// MODEL: Gemini 3.6 first (as requested). PLUS: automatic model
//        discovery — we ask Google "what models does this key
//        support?" and pick the best ones, so ANY new API key
//        works even if model names change in the future.
// KEYS:  Supports MULTIPLE API keys for automatic rotation when
//        quota (429) is exhausted on one key:
//          - GEMINI_API_KEY       (single key, as before)
//          - GEMINI_API_KEYS      (comma-separated keys — preferred)
//        Example in Vercel Environment Variables:
//          GEMINI_API_KEYS=AIzaSy....,AIzaSy....,AIzaSy....
// ============================================================

export var GEMINI_MODELS = ['gemini-3.6-flash', 'gemini-flash-latest']

// Optional API base override (proxy/self-host testing). Defaults to Google's
// official endpoint — production/Vercel behavior is unchanged.
var GEMINI_BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')

const QUOTA_HINT = 'الحصة اليومية لمفتاح Gemini خلصت (429). الحل: ضيف مفتاح/مفاتيح تانية في Vercel → Settings → Environment Variables باسم GEMINI_API_KEYS (مفصولة بفواصل) أو فعّل الفاتورة من Google AI Studio.'

// Collect all configured keys, in order
export function getGeminiApiKeys(): string[] {
  var keys = []
  var multi = process.env.GEMINI_API_KEYS || ''
  var single = process.env.GEMINI_API_KEY || ''
  if (multi.trim()) {
    var parts = multi.split(',')
    for (var i = 0; i < parts.length; i++) {
      var k = parts[i].trim()
      if (k) keys.push(k)
    }
  }
  if (single.trim()) keys.push(single.trim())
  // de-duplicate
  var seen = {}
  var unique = []
  for (var j = 0; j < keys.length; j++) {
    if (!seen[keys[j]]) { seen[keys[j]] = true; unique.push(keys[j]) }
  }
  return unique
}

export function hasGeminiKey(): boolean {
  return getGeminiApiKeys().length > 0
}

export interface GeminiResult {
  ok: boolean
  text?: string
  model?: string
  error?: string
  status?: number
}

/* ============================================================
 * Dynamic model discovery — ListModels, cached 10 minutes.
 * Ranks models: gemini-3.6-flash first, then other 3.6 models,
 * then latest aliases, then any flash, then any pro.
 * ============================================================ */
var discoveredModels: string[] = []
var discoveredAt = 0
var discovering: Promise<string[]> | null = null

function rankScore(modelId: string): number {
  var m = modelId.toLowerCase()
  // 3.6 flash is THE requested default
  if (m === 'gemini-3.6-flash') return 100
  if (m.indexOf('3.6') >= 0 && m.indexOf('flash') >= 0) return 95
  if (m.indexOf('3.6') >= 0 && m.indexOf('lite') >= 0) return 92
  if (m.indexOf('3.6') >= 0) return 90
  // latest aliases (always point to newest flash/pro)
  if (m === 'gemini-flash-latest') return 85
  if (m === 'gemini-flash-lite-latest') return 82
  if (m === 'gemini-pro-latest') return 80
  // 3.x flash
  if (m.indexOf('gemini-3') === 0 && m.indexOf('flash') >= 0) return 75
  if (m.indexOf('gemini-3') === 0 && m.indexOf('lite') >= 0) return 72
  if (m.indexOf('gemini-3') === 0) return 70
  // 2.5 flash
  if (m.indexOf('2.5') >= 0 && m.indexOf('flash') >= 0 && m.indexOf('lite') < 0) return 65
  if (m.indexOf('2.5') >= 0 && m.indexOf('flash') >= 0) return 62
  if (m.indexOf('2.5') >= 0) return 60
  // any other flash / pro (newer versions first via string compare trick)
  if (m.indexOf('flash') >= 0) return 50
  if (m.indexOf('pro') >= 0) return 40
  return 10
}

function rankModels(list: string[]): string[] {
  return list.slice().sort(function (a, b) {
    var diff = rankScore(b) - rankScore(a)
    if (diff !== 0) return diff
    // same score → prefer the higher version number, then shorter name
    return a.localeCompare(b, undefined, { numeric: true }) || (a.length - b.length)
  })
}

async function discoverModels(): Promise<string[]> {
  var keys = getGeminiApiKeys()
  if (keys.length === 0) return []
  var now = Date.now()
  if (discoveredModels.length > 0 && now - discoveredAt < 10 * 60 * 1000) return discoveredModels
  if (discovering) return discovering

  discovering = (async function () {
    var found: string[] = []
    for (var i = 0; i < keys.length && found.length === 0; i++) {
      try {
        var controller = new AbortController()
        var to = setTimeout(function () { controller.abort() }, 8000)
        var res = await fetch(GEMINI_BASE + '/v1beta/models?pageSize=200&key=' + keys[i], {
          method: 'GET',
          signal: controller.signal,
        })
        clearTimeout(to)
        if (!res.ok) continue
        var data = await res.json()
        var models = (data && data.models) || []
        for (var mi = 0; mi < models.length; mi++) {
          var mm = models[mi]
          var name = (mm.name || '').replace(/^models\//, '')
          var methods = mm.supportedGenerationMethods || []
          if (!name || name.indexOf('gemini') !== 0) continue
          if (name.indexOf('embedding') >= 0 || name.indexOf('aqa') >= 0 || name.indexOf('imagen') >= 0 || name.indexOf('veo') >= 0 || name.indexOf('tts') >= 0 || name.indexOf('live') >= 0) continue
          if (methods.indexOf('generateContent') < 0) continue
          found.push(name)
        }
      } catch (e) {}
    }
    if (found.length > 0) {
      discoveredModels = rankModels(found)
      discoveredAt = Date.now()
      try { console.log('[Gemini] Available models for this key:', discoveredModels.slice(0, 8).join(', ')) } catch (e) {}
    }
    return discoveredModels
  })()

  try { return await discovering } finally { discovering = null }
}

// ============================================================
// SPEED FIX: the OLD getModelChain() AWAITED ListModels before the
// first attempt — on a cold server the very first message paid up
// to 8 extra seconds of discovery latency.
// NEW: static preferred models first (+ anything already cached),
// ZERO network before the first attempt. Discovery runs in the
// BACKGROUND to keep the cache fresh, and is only AWAITED when
// every static attempt already failed (self-healing preserved).
// ============================================================
function getStaticChain(): string[] {
  var chain: string[] = []
  for (var i = 0; i < GEMINI_MODELS.length; i++) if (chain.indexOf(GEMINI_MODELS[i]) < 0) chain.push(GEMINI_MODELS[i])
  for (var j = 0; j < discoveredModels.length; j++) if (chain.indexOf(discoveredModels[j]) < 0) chain.push(discoveredModels[j])
  return chain
}

/* ============================================================
 * Thinking config — reasoning models (Gemini 3.x / 2.5) burn
 * output tokens by "thinking". We lower thinking so replies are
 * fast and the token budget actually goes to the answer.
 * If a model rejects the field (400), we auto-retry without it.
 * ============================================================ */
function buildThinkingConfig(model: string, mode: 'low' | 'off' | 'default'): any {
  if (mode === 'default') return null
  var m = (model || '').toLowerCase()
  if (m.indexOf('gemini-3') === 0) {
    // Gemini 3 family: thinking cannot be fully disabled → lowest level
    return { thinkingConfig: { thinkingLevel: 'low' } }
  }
  if (m.indexOf('2.5') >= 0 && m.indexOf('flash') >= 0) {
    // 2.5 Flash supports full disable
    return mode === 'off' ? { thinkingConfig: { thinkingBudget: 0 } } : { thinkingConfig: { thinkingBudget: 512 } }
  }
  return null
}

function mergeConfig(base: any, extra: any): any {
  if (!extra) return base
  return Object.assign({}, base, extra)
}

// Extract ALL text parts from a Gemini response (skip thought parts)
function extractText(data: any): string {
  var text = ''
  try {
    var parts = data.candidates[0].content.parts || []
    for (var i = 0; i < parts.length; i++) {
      if (parts[i].thought) continue
      if (parts[i].text) text += parts[i].text
    }
  } catch (e) {}
  return text.trim()
}

// Single attempt against one model + one key
async function attempt(model: string, apiKey: string, parts: any[], generationConfig: any, timeoutMs: number, thinkingMode: 'low' | 'off' | 'default'): Promise<GeminiResult> {
  var controller = new AbortController()
  var timeoutHandle = setTimeout(function () { controller.abort() }, timeoutMs)
  try {
    var modelUrl = GEMINI_BASE + '/v1beta/models/' + model + ':generateContent?key=' + apiKey
    var withThinking = mergeConfig(generationConfig, buildThinkingConfig(model, thinkingMode))
    var res = await fetch(modelUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: withThinking }),
      signal: controller.signal,
    })
    if (res.ok) {
      var data = await res.json()
      var text = extractText(data)
      if (text) return { ok: true, text: text, model: model }

      // ---- Empty text: reasoning models may have burned the whole
      // ---- output budget on thinking. Retry once with a 4x budget.
      var curTokens = (generationConfig && generationConfig.maxOutputTokens) || 8192
      if (curTokens < 32768) {
        var biggerConfig = Object.assign({}, generationConfig, { maxOutputTokens: Math.min(32768, curTokens * 4) })
        var withThinking2 = mergeConfig(biggerConfig, buildThinkingConfig(model, thinkingMode))
        var controller2 = new AbortController()
        var timeoutHandle2 = setTimeout(function () { controller2.abort() }, timeoutMs)
        try {
          var res2 = await fetch(modelUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: withThinking2 }),
            signal: controller2.signal,
          })
          if (res2.ok) {
            var data2 = await res2.json()
            var text2 = extractText(data2)
            if (text2) return { ok: true, text: text2, model: model }
          }
        } catch (e) {} finally { clearTimeout(timeoutHandle2) }
      }
      return { ok: false, error: model + ': response had no text', status: 200 }
    }

    var errBody = ''
    try { errBody = await res.text() } catch (e) {}

    // ---- 400 possibly caused by thinkingConfig on an unsupported model:
    // ---- retry once WITHOUT any thinking fields (self-healing).
    if (res.status === 400 && withThinking !== generationConfig) {
      var controller3 = new AbortController()
      var timeoutHandle3 = setTimeout(function () { controller3.abort() }, timeoutMs)
      try {
        var res3 = await fetch(modelUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: generationConfig }),
          signal: controller3.signal,
        })
        if (res3.ok) {
          var data3 = await res3.json()
          var text3 = extractText(data3)
          if (text3) return { ok: true, text: text3, model: model }
        }
      } catch (e) {} finally { clearTimeout(timeoutHandle3) }
    }

    return { ok: false, error: model + ': ' + res.status + ' ' + (errBody || '').substring(0, 300), status: res.status }
  } catch (e) {
    var msg = (e && e.name === 'AbortError') ? 'timeout after ' + timeoutMs + 'ms' : (e.message || 'network error')
    return { ok: false, error: model + ': ' + msg }
  } finally {
    clearTimeout(timeoutHandle)
  }
}

// ============================================================
// Main entry — try the STATIC chain immediately (no discovery
// latency), rotate keys on 429 (quota), and only fall back to a
// full discovery await when everything static failed.
//   opts.thinking: 'low' (fast chat) | 'off' | 'default' (deep tasks)
// ============================================================
export async function callGemini(opts: {
  parts: any[]
  generationConfig?: any
  timeoutMs?: number          // per-attempt timeout (default 30000)
  fastFailFirstMs?: number    // optional shorter timeout for the very first attempt
  thinking?: 'low' | 'off' | 'default'
}): Promise<GeminiResult> {
  var keys = getGeminiApiKeys()
  if (keys.length === 0) {
    return { ok: false, error: 'GEMINI_API_KEY not found — أضف المفتاح في Vercel Environment Variables أو ملف .env.local' }
  }

  var generationConfig = opts.generationConfig || { temperature: 0.1, maxOutputTokens: 8192 }
  var timeoutMs = opts.timeoutMs || 30000
  var thinkingMode = opts.thinking || 'default'
  var lastError = ''
  var sawQuota = false
  var attemptIndex = 0

  // background refresh (cached 10 min) — never awaited on the fast path
  var discoveryPromise = discoverModels()
  var staticModels = getStaticChain()

  var tryModels = async function (models: string[]): Promise<GeminiResult | null> {
    // Outer: passes (2nd pass clears short RPM blips) — then models — then keys
    for (var pass = 0; pass < 2; pass++) {
      if (pass > 0) {
        if (!sawQuota) break
        await new Promise(function (r) { setTimeout(r, 2500) })
      }
      for (var mi = 0; mi < models.length; mi++) {
        for (var ki = 0; ki < keys.length; ki++) {
          attemptIndex++
          var t = timeoutMs
          if (attemptIndex === 1 && opts.fastFailFirstMs) t = opts.fastFailFirstMs
          var result = await attempt(models[mi], keys[ki], opts.parts, generationConfig, t, thinkingMode)
          if (result.ok) return result
          lastError = result.error || ''
          if (result.status === 429) {
            sawQuota = true
            // small pause before switching key/model so we don't burn RPM
            await new Promise(function (r) { setTimeout(r, 400) })
          } else if (result.status === 404) {
            // model retired — skip its remaining keys
            break
          } else if (result.status === 401 || result.status === 403) {
            // key invalid / API not enabled for this key — move to next key
            continue
          }
        }
      }
    }
    return null
  }

  var win = await tryModels(staticModels)
  if (win) return win

  // Everything static failed → NOW pay the discovery cost and try any
  // newly discovered models we have not tried yet (self-healing when
  // Google renames/retires models).
  try {
    var fresh = await discoveryPromise
    var extra: string[] = []
    for (var fi = 0; fi < fresh.length; fi++) if (staticModels.indexOf(fresh[fi]) < 0) extra.push(fresh[fi])
    if (extra.length > 0) {
      win = await tryModels(extra)
      if (win) return win
    }
  } catch (e) {}

  if (sawQuota) {
    lastError = QUOTA_HINT + ' [' + lastError + ']'
  }
  return { ok: false, error: lastError, status: sawQuota ? 429 : undefined }
}

/* ============================================================
 * STREAMING entry (token-by-token, huge perceived speed win for
 * the assistant chat). Uses :streamGenerateContent?alt=sse and
 * forwards every text delta to opts.onDelta AS IT ARRIVES.
 *
 * Retry safety: once a delta reached the client we can NOT retry
 * another model (the client would see a duplicated answer), so a
 * stream that emitted text and then died returns ok:true with the
 * partial text — the client gracefully keeps what it saw.
 * ============================================================ */
async function streamAttempt(model: string, apiKey: string, parts: any[], generationConfig: any, timeoutMs: number, thinkingMode: 'low' | 'off' | 'default', onDelta?: (d: string) => void): Promise<GeminiResult> {
  var emitted = 0

  var runStream = async function (cfg: any): Promise<GeminiResult> {
    var controller = new AbortController()
    var timeoutHandle = setTimeout(function () { controller.abort() }, timeoutMs)
    try {
      var modelUrl = GEMINI_BASE + '/v1beta/models/' + model + ':streamGenerateContent?alt=sse&key=' + apiKey
      var res = await fetch(modelUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: parts }], generationConfig: cfg }),
        signal: controller.signal,
      })
      if (!res.ok || !res.body) {
        var errBody = ''
        try { errBody = await res.text() } catch (e) {}
        return { ok: false, error: model + ': ' + res.status + ' ' + (errBody || '').substring(0, 300), status: res.status }
      }
      var reader = res.body.getReader()
      var decoder = new TextDecoder()
      var buf = ''
      var full = ''
      while (true) {
        var chunk = await reader.read()
        if (chunk.done) break
        buf += decoder.decode(chunk.value, { stream: true })
        var lines = buf.split('\n')
        buf = lines.pop() || ''
        for (var li = 0; li < lines.length; li++) {
          var line = lines[li].trim()
          if (!line || line.indexOf('data:') !== 0) continue
          var payload = line.slice(5).trim()
          if (!payload || payload === '[DONE]') continue
          try {
            var j = JSON.parse(payload)
            var cps = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || []
            for (var pi = 0; pi < cps.length; pi++) {
              if (cps[pi].thought) continue
              if (cps[pi].text) {
                full += cps[pi].text
                emitted++
                if (onDelta) onDelta(cps[pi].text)
              }
            }
          } catch (e) {}
        }
      }
      if (full.trim()) return { ok: true, text: full.trim(), model: model }
      return { ok: false, error: model + ': stream had no text', status: 200 }
    } catch (e) {
      // Already emitted text (timeout/network cut mid-stream)? The client
      // has the partial answer — return it as success instead of restarting
      // on another model (which would duplicate text).
      if (emitted > 0) return { ok: true, text: full.trim(), model: model }
      var msg = (e && e.name === 'AbortError') ? 'timeout after ' + timeoutMs + 'ms' : ((e && e.message) || 'network error')
      return { ok: false, error: model + ': ' + msg }
    } finally {
      clearTimeout(timeoutHandle)
    }
  }

  var withThinking = mergeConfig(generationConfig, buildThinkingConfig(model, thinkingMode))
  var first = await runStream(withThinking)
  if (first.ok) return first
  // 400 possibly caused by thinkingConfig on an unsupported model →
  // retry once WITHOUT thinking fields (same self-healing as non-stream).
  if (first.status === 400 && withThinking !== generationConfig) {
    var second = await runStream(generationConfig)
    if (second.ok) return second
    return second
  }
  return first
}

export async function callGeminiStream(opts: {
  parts: any[]
  generationConfig?: any
  timeoutMs?: number
  thinking?: 'low' | 'off' | 'default'
  onDelta?: (delta: string) => void
}): Promise<GeminiResult> {
  var keys = getGeminiApiKeys()
  if (keys.length === 0) {
    return { ok: false, error: 'GEMINI_API_KEY not found — أضف المفتاح في Vercel Environment Variables أو ملف .env.local' }
  }
  var generationConfig = opts.generationConfig || { temperature: 0.3, maxOutputTokens: 2048 }
  var timeoutMs = opts.timeoutMs || 30000
  var thinkingMode = opts.thinking || 'low'
  var lastError = ''
  var sawQuota = false

  var discoveryPromise = discoverModels()
  var staticModels = getStaticChain()

  var tryList = async function (models: string[]): Promise<GeminiResult | null> {
    for (var mi = 0; mi < models.length; mi++) {
      for (var ki = 0; ki < keys.length; ki++) {
        var result = await streamAttempt(models[mi], keys[ki], opts.parts, generationConfig, timeoutMs, thinkingMode, opts.onDelta)
        if (result.ok) return result
        lastError = result.error || ''
        if (result.status === 429) {
          sawQuota = true
          await new Promise(function (r) { setTimeout(r, 400) })
        } else if (result.status === 404) {
          break
        } else if (result.status === 401 || result.status === 403) {
          continue
        }
      }
    }
    return null
  }

  var win = await tryList(staticModels)
  if (win) return win

  try {
    var fresh = await discoveryPromise
    var extra: string[] = []
    for (var fi = 0; fi < fresh.length; fi++) if (staticModels.indexOf(fresh[fi]) < 0) extra.push(fresh[fi])
    if (extra.length > 0) {
      win = await tryList(extra)
      if (win) return win
    }
  } catch (e) {}

  if (sawQuota) lastError = QUOTA_HINT + ' [' + lastError + ']'
  return { ok: false, error: lastError, status: sawQuota ? 429 : undefined }
}

// Extract first JSON object from an AI text response
export function parseGeminiJson(text: string): any | null {
  if (!text || !text.trim()) return null
  var jsonMatch = text.match(/\{[\s\S]*\}/)
  if (!jsonMatch) return null
  try {
    return JSON.parse(jsonMatch[0])
  } catch (e) {
    return null
  }
}
