// @ts-nocheck
// ============================================================
// FILE: src/app/api/admin/mindmap/route.ts
// PURPOSE: (2026-و66) استوديو الخرائط الذهنية للأدمن (NotebookLM style):
//   POST {action:'generate', sourceType:'youtube'|'text', youtubeUrl, text, notes}
//     → يجيب بيانات المحتوى (عنوان الفيديو من oEmbed / النص من الملف)
//     → AI يستخرج المفاهيم والقوانين والاتصالات → MindMapData JSON
//     → لو AI فشل: بناء خريطة استرشادية من العنوان/الملاحظات (ما يفشلش)
//   POST {action:'save', videoId?, title, sourceType, sourceUrl, sourceName, map}
//   POST {action:'delete', id}
//   GET → كل الخرائط بالتفصيل (للأدمن)
// ============================================================

import { NextRequest, NextResponse } from 'next/server'
import { db, safeWrite } from '@/lib/db'
import { ensureArenaTables } from '@/lib/arena'
import { callGemini, hasGeminiKey, parseGeminiJson } from '@/lib/gemini'
import ZAI from 'z-ai-web-dev-sdk'

export const runtime = 'nodejs'
export const maxDuration = 60

/* ---------- استخراج عنوان فيديو يوتيوب (oEmbed — بدون مفتاح) ---------- */
async function youtubeMeta(url: string): Promise<{ title: string; author: string } | null> {
  try {
    var ctl = new AbortController()
    var to = setTimeout(function () { ctl.abort() }, 7000)
    var res = await fetch('https://www.youtube.com/oembed?url=' + encodeURIComponent(url) + '&format=json', { signal: ctl.signal })
    clearTimeout(to)
    if (!res.ok) return null
    var j = await res.json()
    return { title: String(j.title || ''), author: String(j.author_name || '') }
  } catch (e) {
    return null
  }
}

var MM_SYSTEM = [
  'You are an expert educational mind-map builder for a math platform (Maths Genius).',
  'سوف تستلم محتوى درس (عنوان فيديو أو نص مادة دراسية) وممكن ملاحظات المدرس — قد يكون المحتوى بالعربية.',
  'أنت عايز الخريطة كلها **بالإنجليزية** (2026-و106 — طلب المدرس الصريح):',
  '- The main node = the lesson title (translated to English if the source is Arabic).',
  '- 4-7 main branches: key concepts, laws/formulas, examples, common mistakes.',
  '- Each main branch gets 2-4 sub-branches (details/steps/numbers).',
  '- Each node may carry a short "note" (formula/quick fact) — ALSO IN ENGLISH.',
  '- Write formulas as plain text (a/b for fractions, x^2 for powers) — NO LaTeX.',
  '- CRITICAL: labels + notes + title + summary MUST be in ENGLISH. Do NOT output Arabic anywhere.',
  'Return JSON only, in exactly this shape:',
  '{"title":"Lesson Title","summary":"two-line summary","root":{"label":"Title","note":"","children":[{"label":"Branch","note":"formula","children":[{"label":"Detail","note":""}]}]}}',
].join('\n')

function buildUserContent(meta: { title: string; author: string }, text: string, notes: string): string {
  var parts: string[] = []
  if (meta && meta.title) parts.push('عنوان الفيديو: «' + meta.title + '»' + (meta.author ? ' (قناة: ' + meta.author + ')' : ''))
  if (text) parts.push('محتوى المادة:\n' + String(text).slice(0, 6000))
  if (notes) parts.push('ملاحظات المدرس: ' + String(notes).slice(0, 1000))
  parts.push('اعمل الخريطة الذهنية (JSON بس).')
  return parts.join('\n\n')
}

function normalizeMap(parsed: any, fallbackTitle: string): any | null {
  try {
    var root = parsed && (parsed.root || parsed.map || parsed)
    if (!root || !String(root.label || root.title || '').trim()) return null
    var idc = 0
    var nid = function () { return 'n' + (++idc) }
    function normNode(n: any): any {
      var out: any = { id: nid(), label: String(n.label || n.title || '').slice(0, 120) }
      if (n.note || n.formula || n.desc) out.note = String(n.note || n.formula || n.desc).slice(0, 240)
      var kids = n.children || n.kids || []
      if (Array.isArray(kids) && kids.length > 0) out.children = kids.slice(0, 6).map(normNode)
      return out
    }
    var title = String(parsed.title || root.label || fallbackTitle || 'خريطة ذهنية')
    var summary = String(parsed.summary || '').slice(0, 400)
    var rootNode = normNode(root)
    if (!rootNode.children || rootNode.children.length === 0) return null
    return { title: title, summary: summary, root: rootNode }
  } catch (e) {
    return null
  }
}

/* خريطة استرشادية بدون AI — من العنوان والملاحظات (بنية منهجية ثابتة) */
function heuristicMap(meta: { title: string; author: string }, text: string, notes: string, sourceType: string): any {
  var title = (meta && meta.title) || (notes ? notes.slice(0, 60) : (text ? String(text).slice(0, 60) : 'درس رياضيات'))
  var idc = 0
  var nid = function () { return 'n' + (++idc) }
  // لو في نص طويل: أول 4 عناوين/سطور قوية تبقى فروع
  var branches: any[] = []
  if (text) {
    var lines = String(text).split(/\n+/).map(function (s) { return s.trim() }).filter(function (s) { return s.length > 8 }).slice(0, 4)
    for (var i = 0; i < lines.length; i++) {
      branches.push({
        id: nid(),
        label: lines[i].slice(0, 80),
        children: [{ id: nid(), label: 'شرح وخطوات الحل', note: '' }, { id: nid(), label: 'مثال تطبيقي', note: '' }],
      })
    }
  }
  if (branches.length < 3) {
    branches = [
      { id: nid(), label: 'المفاهيم الأساسية', note: 'فهم المصطلحات قبل الحل', children: [{ id: nid(), label: 'تعريفات ومصطلحات', note: '' }, { id: nid(), label: 'شروط الاستخدام', note: '' }] },
      { id: nid(), label: 'القوانين والقواعد', note: notes ? notes.slice(0, 200) : 'اكتب القوانين هنا من الفيديو', children: [{ id: nid(), label: 'القانون الرئيسي', note: '' }, { id: nid(), label: 'تحويلات مهمة', note: '' }] },
      { id: nid(), label: 'أمثلة محلولة', children: [{ id: nid(), label: 'مثال سهل', note: '' }, { id: nid(), label: 'مثال صعب', note: '' }] },
      { id: nid(), label: 'أخطاء شائعة', note: 'خد بالك من دول في الامتحان', children: [{ id: nid(), label: 'غلطة الإشارات', note: '' }, { id: nid(), label: 'نسيان الوحدات', note: '' }] },
    ]
  }
  return {
    title: title,
    summary: sourceType === 'youtube' ? 'خريطة استرشادية من عنوان الدرس — زود الملاحظات واعمل توليد تاني للدقة' : 'خريطة استرشادية من المادة المرفوعة',
    root: { id: nid(), label: title.slice(0, 100), children: branches },
  }
}

async function zaiMindMap(userContent: string): Promise<any | null> {
  try {
    var zai = await ZAI.create()
    var t: any = null
    var completion = await Promise.race([
      zai.chat.completions.create({
        messages: [
          { role: 'assistant', content: MM_SYSTEM },
          { role: 'user', content: userContent },
        ],
        thinking: { type: 'disabled' },
      }),
      new Promise(function (_, rej) { t = setTimeout(function () { rej(new Error('timeout')) }, 45000) }),
    ])
    if (t) try { clearTimeout(t) } catch (e) {}
    var text = ((completion as any)?.choices?.[0]?.message?.content) || ''
    var parsed = parseGeminiJson(String(text || ''))
    if (!parsed) return null
    return normalizeMap(parsed, '')
  } catch (e) {
    return null
  }
}

async function geminiMindMap(userContent: string): Promise<any | null> {
  try {
    if (!hasGeminiKey()) return null
    var res = await callGemini({
      parts: [{ text: MM_SYSTEM + '\n\n' + userContent }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
      timeoutMs: 40000,
    })
    if (!res || !res.ok || !res.text) return null
    var parsed = parseGeminiJson(res.text)
    if (!parsed) return null
    return normalizeMap(parsed, '')
  } catch (e) {
    return null
  }
}

export async function GET() {
  try {
    await ensureArenaTables()
    var rows = await db.$queryRawUnsafe('SELECT * FROM MindMap ORDER BY createdAt DESC LIMIT 100')
    var maps = (rows || []).map(function (m: any) {
      var data: any = {}
      try { data = JSON.parse(String(m.data || '{}')) } catch (e) {}
      return {
        id: m.id,
        videoId: String(m.videoId || ''),
        title: String(m.title || ''),
        sourceType: String(m.sourceType || ''),
        sourceUrl: String(m.sourceUrl || ''),
        sourceName: String(m.sourceName || ''),
        data: data,
        createdAt: String(m.createdAt || ''),
      }
    })
    return NextResponse.json({ ok: true, maps: maps })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: 'مشكلة في التحميل' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    await ensureArenaTables()
    var body = await request.json().catch(function () { return ({} as any) })
    var action = String(body.action || '')

    /* ================= generate ================= */
    if (action === 'generate') {
      var sourceType = String(body.sourceType || 'youtube')
      var youtubeUrl = String(body.youtubeUrl || '').trim()
      var text = String(body.text || '').trim()
      var notes = String(body.notes || '').trim()

      var meta: { title: string; author: string } | null = null
      if (sourceType === 'youtube') {
        if (!youtubeUrl || !/youtube\.com|youtu\.be/i.test(youtubeUrl)) {
          return NextResponse.json({ ok: false, error: 'الصق لينك يوتيوب صحيح' }, { status: 400 })
        }
        meta = await youtubeMeta(youtubeUrl)
        if (!meta) meta = { title: '', author: '' }
        if (!meta.title && !notes) {
          return NextResponse.json({ ok: false, error: 'معرفناش عنوان الفيديو — اكتب ملاحظات عن الدرس في الخانة تحت وقرب توليد تاني' }, { status: 422 })
        }
      } else {
        if (!text && !notes) {
          return NextResponse.json({ ok: false, error: 'الصق نص المادة أو اكتب ملاحظات عن الدرس' }, { status: 400 })
        }
      }

      var userContent = buildUserContent(meta, text, notes)
      var map = await zaiMindMap(userContent)
      if (!map) map = await geminiMindMap(userContent)
      var usedAi = !!map
      if (!map) map = heuristicMap(meta, text, notes, sourceType)

      return NextResponse.json({ ok: true, ai: usedAi, map: map })
    }

    /* ================= save ================= */
    if (action === 'save') {
      var mapToSave = body.map
      if (!mapToSave || !mapToSave.root) {
        return NextResponse.json({ ok: false, error: 'مفيش خريطة نقدر نحفظها' }, { status: 400 })
      }
      var id = 'mm_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
      var title = String(body.title || mapToSave.title || 'خريطة ذهنية').slice(0, 160)
      await safeWrite(function () {
        return db.$executeRawUnsafe(
          'INSERT INTO MindMap (id, videoId, title, sourceType, sourceUrl, sourceName, data, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          id, String(body.videoId || ''), title, String(body.sourceType || 'youtube'), String(body.sourceUrl || ''), String(body.sourceName || ''), JSON.stringify(mapToSave)
        )
      })
      return NextResponse.json({ ok: true, id: id })
    }

    /* ================= delete ================= */
    if (action === 'delete') {
      await safeWrite(function () { return db.$executeRawUnsafe('DELETE FROM MindMap WHERE id = ?', String(body.id || '')) })
      return NextResponse.json({ ok: true })
    }

    /* ================= link (2026-و67) =================
       ربط/فك ربط خريطة محفوظة بدرس — طلب المستر: الخريطة ممنوع تظهر على
       فيديو غير لما هو يربطها بنفسه، ويرجع يقدر يفك الربط في أي وقت.
       videoId فاضي = فك الربط (الخريطة تفضل محفوظة بس مش بتظهر للطالب). */
    if (action === 'link') {
      var linkId = String(body.id || '')
      if (!linkId) return NextResponse.json({ ok: false, error: 'مفيش خريطة محددة' }, { status: 400 })
      var linkVideoId = String(body.videoId || '').trim()
      await safeWrite(function () {
        return db.$executeRawUnsafe('UPDATE MindMap SET videoId = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?', linkVideoId, linkId)
      })
      return NextResponse.json({ ok: true, videoId: linkVideoId })
    }

    return NextResponse.json({ ok: false, error: 'أكشن غير معروف' }, { status: 400 })
  } catch (e: any) {
    console.error('[admin/mindmap POST] failed:', String((e && e.message) || e))
    return NextResponse.json({ ok: false, error: 'مشكلة في الاستوديو — جرب تاني' }, { status: 500 })
  }
}
