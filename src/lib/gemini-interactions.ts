/* ============================================================
 * (و105) Interactions API — المسار الجديد لمفاتيح الـ auth
 * ============================================================
 * من 28 مايو 2026 Google AI Studio بيفرد مفاتيح "auth keys"
 * بصيغة جديدة بتبدأ بـ AQ.… (مرتبطة بحساب خدمة بدل مشروع Cloud).
 * المفاتيح دي بتترفض 401 UNAUTHENTICATED على المسار القديم
 * v1beta/models/…:generateContent حتى لو اتبعتت في الهيدر —
 * لكنها شغالة على الـ Interactions API الجديد (/v1beta/interactions).
 *
 * الاستراتيجية: gemini.ts بيجرب المسار القديم الأول (يغطي المفاتيح
 * القياسية AIza)، ولو رجع 401/ACCESS_TOKEN_TYPE_UNSUPPORTED نحوّل
 * نفس الطلب تلقائيًا للمسار الجديد — فالمفتاحين بيتغطوا بدون تدخل.
 * ============================================================ */

var GEMINI_BASE = (process.env.GEMINI_BASE_URL || 'https://generativelanguage.googleapis.com').replace(/\/$/, '')

export interface InteractionGeminiResult {
  ok: boolean
  text?: string
  model?: string
  error?: string
  status?: number
}

/* مفتاح auth بصيغة AQ.؟ */
export function isAuthKey(key: string): boolean {
  return typeof key === 'string' && key.indexOf('AQ.') === 0
}

/* هل الخطأ ده معناه إن المفتاح فاشل على المسار القديم؟ */
export function isAuthKeyPathError(status: number, errBody: string): boolean {
  if (status === 401) return true
  if (status === 400 && (errBody.indexOf('ACCESS_TOKEN_TYPE_UNSUPPORTED') >= 0 || errBody.indexOf('API key not valid') >= 0)) return true
  return false
}

/* تحويل أجزاء generateContent القديمة ([{text}|{inlineData:{mimeType,data}}])
   إلى بلوكات Interactions ([{type:'text',text}|{type:'image',mime_type,data}]) */
function partsToInteractionBlocks(parts: any[]): any[] {
  var out: any[] = []
  for (var i = 0; i < parts.length; i++) {
    var p = parts[i] || {}
    if (p.text) out.push({ type: 'text', text: String(p.text) })
    else if (p.inlineData || p.inline_data) {
      var il = p.inlineData || p.inline_data
      out.push({ type: 'image', mime_type: il.mimeType || il.mime_type || 'image/png', data: il.data })
    }
  }
  if (out.length === 0) out.push({ type: 'text', text: ' ' })
  return out
}

/* استخراج الرد من Interaction resource:
   steps[] (type=model_output) → content[] (type=text) → text */
function extractInteractionText(data: any): string {
  var text = ''
  try {
    var steps = data.steps || []
    for (var i = 0; i < steps.length; i++) {
      if (steps[i].type && steps[i].type !== 'model_output') continue
      var blocks = steps[i].content || []
      for (var j = 0; j < blocks.length; j++) {
        if (blocks[j].type === 'text' && blocks[j].text) text += blocks[j].text
      }
    }
  } catch (e) {}
  return text.trim()
}

/* نداء واحد على Interactions API — model name نفسه بيتمرر زي ما هو.
   thinking_mode: 'low' | 'off' | 'default' — بيتحول لـ thinking_level */
export async function attemptInteractions(model: string, apiKey: string, parts: any[], generationConfig: any, timeoutMs: number, thinkingMode: 'low' | 'off' | 'default'): Promise<InteractionGeminiResult> {
  var controller = new AbortController()
  var timeoutHandle = setTimeout(function () { controller.abort() }, timeoutMs)
  try {
    var gc: any = {}
    if (generationConfig) {
      if (generationConfig.maxOutputTokens) gc.max_output_tokens = generationConfig.maxOutputTokens
      if (generationConfig.temperature != null) gc.temperature = generationConfig.temperature
    }
    if (thinkingMode === 'low') gc.thinking_level = 'low'
    else if (thinkingMode === 'off') gc.thinking_level = 'minimal'

    var body: any = {
      model: model,
      input: partsToInteractionBlocks(parts),
      generation_config: gc,
      store: false,
      stream: false,
    }

    var res = await fetch(GEMINI_BASE + '/v1beta/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    var errBody = ''
    if (!res.ok) {
      try { errBody = await res.text() } catch (e) {}
      return { ok: false, error: 'interactions/' + model + ': ' + res.status + ' ' + (errBody || '').substring(0, 250), status: res.status }
    }
    var data = await res.json()
    var text = extractInteractionText(data)
    if (text) return { ok: true, text: text, model: model }
    return { ok: false, error: 'interactions/' + model + ': response had no text', status: 200 }
  } catch (e: any) {
    var msg = (e && e.name === 'AbortError') ? 'timeout after ' + timeoutMs + 'ms' : ((e && e.message) || 'network error')
    return { ok: false, error: 'interactions/' + model + ': ' + msg }
  } finally {
    clearTimeout(timeoutHandle)
  }
}
