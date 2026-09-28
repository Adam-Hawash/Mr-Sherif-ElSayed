'use client'

// ============================================================
// (2026-و66) MindMapView — عارض الخريطة الذهنية للطالب (NotebookLM style)
// ============================================================
// شجرة أفقية RTL: الجذر على أقصى اليمين والفروع بتعقد يسار.
// • Layout كلاسيكي (tidy tree): الأوراق مترصّة عموديًا بالترتيب
//   والأب في منتصف أبنائه — العمق بيحدد X (280px لكل مستوى).
// • SVG تحت العقد بيرسم وصلات بيزييه من حد الأب الشمال لحد الابن اليمين،
//   ملونة حسب العمق (الفرع الرئيسي بلونه من البالِت).
// • دوس على العقدة → تقفل/تفتح أبناءها (+بادج بعدد الأحفاد المخفيين).
// • سحب الخلفية = pan + أزرار زوم (0.5–1.8) وإعادة ضبط — من غير عجلة ماوس
//   عشان نتجنب مشاكل passive listeners.
// ============================================================

import { useCallback, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react'
import { ChevronLeft, Maximize2, MousePointerClick, Sparkles, ZoomIn, ZoomOut } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { MindMapData, MindMapNode } from '@/lib/question-gen'

/* بالِت الفروع الرئيسية — ممنوع أزرق/إنديجو (إميرالد/أمبر/فايلت/روز/تيل) */
const PALETTE = ['#10b981', '#f59e0b', '#8b5cf6', '#f43f5e', '#14b8a6']
const NEUTRAL_LINE = '#a8a29e' // وصلات الفروع العميقة — رمادي محايد
const COL_W = 280 // المسافة الأفقية بين كل عمق والتاني
const NODE_W = 220 // عرض العقدة ثابت عشان حسابات الوصلات تظبط
const GAP_Y = 18 // تنفّس رأسي بين الأوراق

/* كلاسات تلوين الفروع الرئيسية حسب ترتيبها (نفس ترتيب البالِت) */
const BRANCH_CLASSES = [
  'border-emerald-400 bg-emerald-50 text-emerald-900 dark:border-emerald-500/60 dark:bg-emerald-950/40 dark:text-emerald-100',
  'border-amber-400 bg-amber-50 text-amber-900 dark:border-amber-500/60 dark:bg-amber-950/40 dark:text-amber-100',
  'border-violet-400 bg-violet-50 text-violet-900 dark:border-violet-500/60 dark:bg-violet-950/40 dark:text-violet-100',
  'border-rose-400 bg-rose-50 text-rose-900 dark:border-rose-500/60 dark:bg-rose-950/40 dark:text-rose-100',
  'border-teal-400 bg-teal-50 text-teal-900 dark:border-teal-500/60 dark:bg-teal-950/40 dark:text-teal-100',
]

interface MMBox {
  key: string
  node: MindMapNode
  depth: number
  colIdx: number
  parentKey: string | null
  x: number // الحد الشمال للعقدة داخل طبقة الرسم
  y: number // مركز العقدة رأسيًا
  w: number
  h: number
  kids: number // عدد الأبناء المباشرين
  hidden: number // عدد الأحفاد المخفيين لما تكون مقفولة
}

interface MMLink {
  key: string
  d: string
  color: string
}

interface MMLayout {
  boxes: MMBox[]
  links: MMLink[]
  width: number
  height: number
  offx: number // إحداثي الحافة اليمنى للجذر
}

/* عدّ كل الأحفاد (لبادج +N وقت القفل) */
function countDescendants(n: MindMapNode): number {
  const kids = n.children || []
  let c = 0
  for (let i = 0; i < kids.length; i++) c += 1 + countDescendants(kids[i])
  return c
}

/* تقدير ارتفاع العقدة من طول النص — تقدير متساهل عشان مفيش تراكب */
function estimateHeight(n: MindMapNode, isRoot: boolean): number {
  const labelLines = Math.max(1, Math.ceil(String(n.label || '').length / (isRoot ? 15 : 19)))
  let h = (isRoot ? 24 : 20) * labelLines + (isRoot ? 28 : 22)
  const note = String(n.note || '')
  if (note) {
    const noteLines = Math.max(1, Math.ceil(note.length / 24))
    h += 4 + 16 * noteLines
  }
  return Math.max(isRoot ? 60 : 48, h)
}

/* بناء الليّاوت الكامل: صناديق + وصلات + أبعاد الطبقة */
function buildLayout(root: MindMapNode, collapsed: Set<string>): MMLayout {
  const boxes: MMBox[] = []
  let cursor = 30 // هامش علوي
  let maxDepth = 0
  let uid = 0

  function walk(n: MindMapNode, depth: number, parentKey: string | null, colIdx: number): MMBox {
    uid++
    const h = estimateHeight(n, depth === 0)
    const isCollapsed = collapsed.has(n.id)
    const kids = isCollapsed ? [] : n.children || []
    if (depth > maxDepth) maxDepth = depth
    const box: MMBox = {
      key: n.id || 'auto_' + uid,
      node: n,
      depth: depth,
      colIdx: colIdx,
      parentKey: parentKey,
      x: 0,
      y: 0,
      w: NODE_W,
      h: h,
      kids: (n.children || []).length,
      hidden: isCollapsed ? countDescendants(n) : 0,
    }
    if (kids.length === 0) {
      // ورقة — بتاخد مكانها من المؤشر الرأسي بالترتيب
      box.y = cursor + h / 2
      cursor += h + GAP_Y
    } else {
      let firstY = 0
      let lastY = 0
      for (let i = 0; i < kids.length; i++) {
        const kid = walk(kids[i], depth + 1, box.key, i)
        if (i === 0) firstY = kid.y
        lastY = kid.y
      }
      // الأب يتوسّط على أبنائه
      box.y = (firstY + lastY) / 2
    }
    boxes.push(box)
    return box
  }

  walk(root, 0, null, 0)

  const offx = maxDepth * COL_W + NODE_W + 40 // حافة الجذر اليمنى
  const byKey: Record<string, MMBox> = {}
  for (let a = 0; a < boxes.length; a++) {
    boxes[a].x = offx - boxes[a].depth * COL_W - NODE_W
    byKey[boxes[a].key] = boxes[a]
  }

  // الوصلات: من حد الأب الشمال (RTL) لحد الابن اليمين — بيزييه ناعمة
  const links: MMLink[] = []
  for (let b = 0; b < boxes.length; b++) {
    const c = boxes[b]
    if (!c.parentKey) continue
    const p = byKey[c.parentKey]
    if (!p) continue
    const x1 = p.x
    const y1 = p.y
    const x2 = c.x + NODE_W
    const y2 = c.y
    const color = c.depth === 1 ? PALETTE[c.colIdx % PALETTE.length] : NEUTRAL_LINE
    links.push({
      key: p.key + '>' + c.key,
      d: 'M ' + x1 + ' ' + y1 + ' C ' + (x1 - 30) + ' ' + y1 + ', ' + (x2 + 30) + ' ' + y2 + ', ' + x2 + ' ' + y2,
      color: color,
    })
  }

  return { boxes: boxes, links: links, width: offx + 40, height: Math.max(cursor, 120), offx: offx }
}

export function MindMapView({ mapData, compact }: { mapData: MindMapData; compact?: boolean }) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [dragging, setDragging] = useState(false)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ sx: number; sy: number; ox: number; oy: number } | null>(null)
  const zoomRef = useRef(1)

  const layout = useMemo(function () {
    return buildLayout(mapData && mapData.root ? mapData.root : { id: 'empty', label: '' }, collapsed || new Set())
  }, [mapData, collapsed])

  const layoutRef = useRef(layout)

  /* ملاءمة أولية: الجذر يلزق على يمين الحاوية والشجرة تتوسّط رأسيًا */
  const fit = useCallback(function () {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    if (!r.width || !r.height) return
    const L = layoutRef.current
    zoomRef.current = 1
    setZoom(1)
    setPan({ x: r.width - 56 - L.offx, y: (r.height - L.height) / 2 })
  }, [])

  useLayoutEffect(function () {
    layoutRef.current = layout // مزامنة المرجع جوه الإفكت (مش أثناء الرندر)
    // (2026-و66) قياس الحاوية الفعلي محتاج تحديث pan/zoom بعده — نمط قياس DOM مقصود
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fit()
    const t = setTimeout(fit, 350) // تظبيت تاني بعد ما الحاوية تستقر (ديالوج/أنيميشن)
    return function () { clearTimeout(t) }
  }, [mapData, layout, fit])

  const clampZoom = function (z: number) { return Math.min(1.8, Math.max(0.5, z)) }

  /* زوم حوالين مركز الحاوية */
  const zoomBy = function (factor: number) {
    const nz = clampZoom(zoomRef.current * factor)
    if (nz === zoomRef.current) return
    const el = wrapRef.current
    const cx = el ? el.clientWidth / 2 : 0
    const cy = el ? el.clientHeight / 2 : 0
    const oz = zoomRef.current
    setPan(function (p) { return { x: cx - ((cx - p.x) * nz) / oz, y: cy - ((cy - p.y) * nz) / oz } })
    zoomRef.current = nz
    setZoom(nz)
  }

  const toggleNode = useCallback(function (key: string) {
    setCollapsed(function (prev) {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  /* السحب من الخلفية بس (مش من العقد ولا الأدوات) */
  const onPointerDown = function (e: RPointerEvent<HTMLDivElement>) {
    const t = e.target as HTMLElement
    if (t.closest('[data-mm-node]') || t.closest('[data-mm-controls]')) return
    dragRef.current = { sx: e.clientX, sy: e.clientY, ox: pan.x, oy: pan.y }
    setDragging(true)
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch (err) { /* تجاهل */ }
  }
  const onPointerMove = function (e: RPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d) return
    setPan({ x: d.ox + (e.clientX - d.sx), y: d.oy + (e.clientY - d.sy) })
  }
  const endDrag = function () {
    dragRef.current = null
    setDragging(false)
  }

  if (!mapData || !mapData.root) {
    return (
      <div className="flex h-40 items-center justify-center rounded-xl border border-dashed text-sm text-muted-foreground" dir="rtl">
        مفيش خريطة ذهنية لعرضها
      </div>
    )
  }

  const H = compact ? 420 : 560
  const L = layout

  return (
    <div className="overflow-hidden rounded-xl border bg-neutral-50 dark:bg-neutral-950" dir="rtl">
      {/* شريط تلخيص رفيع لو في summary */}
      {mapData.summary ? (
        <div className="flex items-center gap-2 border-b bg-background/80 px-3 py-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" />
          <span className="line-clamp-2">{mapData.summary}</span>
        </div>
      ) : null}

      <div
        ref={wrapRef}
        className="relative touch-none select-none"
        style={{ height: H, cursor: dragging ? 'grabbing' : 'grab' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerLeave={endDrag}
      >
        {/* طبقة الرسم: SVG وصلات + عقد HTML — بنفس نظام الإحداثيات */}
        <div
          className="absolute left-0 top-0"
          style={{
            width: L.width,
            height: L.height,
            transform: 'translate(' + pan.x + 'px, ' + pan.y + 'px) scale(' + zoom + ')',
            transformOrigin: '0 0',
          }}
        >
          <svg width={L.width} height={L.height} className="pointer-events-none absolute left-0 top-0">
            {L.links.map(function (l) {
              return (
                <path
                  key={l.key}
                  d={l.d}
                  fill="none"
                  stroke={l.color}
                  strokeWidth={2}
                  strokeLinecap="round"
                  opacity={0.75}
                />
              )
            })}
          </svg>

          {L.boxes.map(function (b) {
            const isRoot = b.depth === 0
            const isDeep = b.depth >= 2
            const cls = isRoot
              ? 'border-emerald-600 bg-gradient-to-bl from-emerald-500 to-teal-600 p-3 text-white shadow-md dark:from-emerald-600 dark:to-teal-700'
              : isDeep
                ? 'border-border bg-card p-2.5 text-card-foreground shadow-sm'
                : (BRANCH_CLASSES[b.colIdx % BRANCH_CLASSES.length] + ' p-2.5 shadow-sm')
            return (
              <div
                key={b.key}
                data-mm-node
                title={b.kids > 0 ? 'دوس تفتح / تقفل' : undefined}
                onClick={b.kids > 0 ? function () { toggleNode(b.key) } : undefined}
                className={
                  'absolute break-words rounded-xl transition-all duration-150 hover:scale-[1.03] hover:shadow-md hover:ring-2 hover:ring-emerald-400/60 ' +
                  cls +
                  (b.kids > 0 ? ' cursor-pointer' : ' cursor-default')
                }
                style={{ left: b.x, top: b.y - b.h / 2, width: b.w }}
              >
                <div className="flex items-start gap-1">
                  <span className={'flex-1 font-bold leading-snug' + (isRoot ? ' text-[15px]' : ' text-[13px]')}>
                    {b.node.label}
                  </span>
                  {/* سهم صغير = في أبناء مفتوحين على الشمال */}
                  {b.kids > 0 && b.hidden === 0 ? (
                    <ChevronLeft className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
                  ) : null}
                </div>
                {/* الملاحظة/القانون نص صغير تحت العنوان */}
                {b.node.note ? (
                  <div className={'mt-1 break-words text-[11px] leading-4 ' + (isRoot ? 'text-emerald-50/90' : 'text-muted-foreground')}>
                    {b.node.note}
                  </div>
                ) : null}
                {/* بادج العدد المخفي وقت القفل */}
                {b.hidden > 0 ? (
                  <Badge
                    variant="outline"
                    className="mt-1.5 border-amber-300 bg-amber-100 text-[10px] text-amber-800 dark:border-amber-700 dark:bg-amber-900/40 dark:text-amber-200"
                  >
                    +{b.hidden}
                  </Badge>
                ) : null}
              </div>
            )
          })}
        </div>

        {/* أدوات الزوم العائمة — فوق شمال */}
        <div
          data-mm-controls
          className="absolute left-3 top-3 z-10 flex items-center gap-0.5 rounded-full border bg-background/90 p-1 shadow-sm backdrop-blur"
        >
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={function () { zoomBy(1.15) }} aria-label="قرّب">
            <ZoomIn className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={function () { zoomBy(1 / 1.15) }} aria-label="بعّد">
            <ZoomOut className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-full" onClick={fit} aria-label="إعادة الضبط">
            <Maximize2 className="h-4 w-4" />
          </Button>
          <span className="mx-1.5 hidden items-center gap-1 text-[11px] text-muted-foreground sm:flex">
            <MousePointerClick className="h-3.5 w-3.5" />
            دوس على أي عقدة تفتح وتقفل
          </span>
        </div>
      </div>
    </div>
  )
}
