'use client'
/* ============================================================
   PlayerSettingsPanel — «إعدادات الفيديو والووترمارك» (MG-2)
   ============================================================
   3 أقسام في تاب واحد:
   (أ) أطوال الشريط والدرع العلوي — سلايدرات بتحفظ في الداتابيز
       وبتتطبق فورًا على صفحة المشغل
   (ب) مدير الووترمارك — معاينة 16:9 داكنة العناصر بتتسحب بالماوس/
       اللمس (المكان بيتخزن x%/y% من الفيديو) + حجم + شفافية:
       • كروت QR الطالب (فوق شمال / تحت يمين افتراضيًا)
       • عناصر اسم الطالب ورقمه (فوق في النص وتحت في النص افتراضيًا)
       • لوجو المنصة في نص الفيديو
   (ج) قالب رسالة ولي الأمر + إعدادات الإرسال التلقائي
   ============================================================ */
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Slider } from '@/components/ui/slider'
import { Badge } from '@/components/ui/badge'
import { Save, RotateCcw, Plus, Trash2, Send, Move, MonitorPlay, Info } from 'lucide-react'
import {
  DEFAULT_PLAYER_CONFIG,
  sanitizePlayerConfig,
  type PlayerConfig,
  type WmSize,
  type WmBlink,
  type WmLogoContent,
  type WmNameContent,
} from '@/lib/player-config'
import { DEFAULT_PARENT_TEMPLATE } from '@/lib/parent-message'

type Sel = { kind: 'qrTL' } | { kind: 'qrBR' } | { kind: 'name'; id: string } | { kind: 'logo' }

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/* QR شكلي للمعاينة — نمط ثابت شبه الـ QR الحقيقي (المشغل الحقيقي بيولد
   QR حقيقي في السيرفر باسم الطالب ورقمه) */
function FakeQr({ size = 34 }: { size?: number }) {
  const cells: React.ReactNode[] = []
  const pattern = [
    1, 0, 1, 1, 0, 1, 1, 0, 1,
    1, 0, 0, 1, 0, 0, 1, 0, 1,
    1, 1, 1, 1, 0, 1, 1, 1, 1,
    0, 1, 0, 0, 1, 0, 0, 1, 0,
    1, 0, 1, 0, 0, 1, 1, 0, 1,
    0, 1, 1, 1, 0, 1, 0, 1, 0,
    1, 1, 1, 0, 1, 0, 1, 1, 1,
    1, 0, 0, 1, 0, 1, 0, 0, 1,
    1, 1, 1, 0, 1, 1, 1, 0, 1,
  ]
  for (let i = 0; i < 81; i++) {
    if (pattern[i]) {
      cells.push(<span key={i} className="absolute bg-black" style={{ width: `${100 / 9}%`, height: `${100 / 9}%`, left: `${(i % 9) * (100 / 9)}%`, top: `${Math.floor(i / 9) * (100 / 9)}%` }} />)
    }
  }
  return (
    <span className="relative block overflow-hidden rounded-[3px] bg-white" style={{ width: size, height: size }}>
      {cells}
    </span>
  )
}

const SIZE_LABELS: Record<WmSize, string> = { sm: 'صغير', md: 'متوسط', lg: 'كبير' }

function SizeButtons({ value, onChange }: { value: WmSize; onChange: (s: WmSize) => void }) {
  return (
    <div className="flex gap-1">
      {(['sm', 'md', 'lg'] as WmSize[]).map((s) => (
        <Button key={s} type="button" size="sm" variant={value === s ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => onChange(s)}>
          {SIZE_LABELS[s]}
        </Button>
      ))}
    </div>
  )
}

export function PlayerSettingsPanel() {
  const [cfg, setCfg] = useState<PlayerConfig>(DEFAULT_PLAYER_CONFIG)
  const [hasSaved, setHasSaved] = useState(false)
  const [savingCfg, setSavingCfg] = useState(false)
  const [selected, setSelected] = useState<Sel | null>(null)
  const [template, setTemplate] = useState<string>(DEFAULT_PARENT_TEMPLATE)
  const [savingTpl, setSavingTpl] = useState(false)
  const [channel, setChannel] = useState<string>('manual')
  const [provider, setProvider] = useState('')
  const [apiUrl, setApiUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [sender, setSender] = useState('')
  const [savingCh, setSavingCh] = useState(false)
  const [testing, setTesting] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Sel | null>(null)

  useEffect(() => {
    ;(async () => {
      try {
        const r = await fetch('/api/admin/player-config')
        const d = await r.json()
        if (d && d.config) { setCfg(sanitizePlayerConfig(d.config)); setHasSaved(true) }
      } catch {}
      try {
        const r = await fetch('/api/admin/parent-msg-template')
        const d = await r.json()
        if (d && d.template) setTemplate(d.template)
        else if (d && d.fallback) setTemplate(d.fallback)
      } catch {}
      try {
        const r = await fetch('/api/admin/msg-channel')
        const d = await r.json()
        if (d && d.channel) {
          setChannel(d.channel.channel || 'manual')
          setProvider(d.channel.provider || '')
          setApiUrl(d.channel.apiUrl || '')
          setApiKey(d.channel.apiKey || '')
          setUsername(d.channel.username || '')
          setPassword(d.channel.password || '')
          setSender(d.channel.sender || '')
        }
      } catch {}
    })()
  }, [])

  /* ===== السحب في المعاينة ===== */
  function updPos(sel: Sel, x: number, y: number) {
    setCfg((prev) => {
      const nx = clamp(Math.round(x * 10) / 10, 0, 100)
      const ny = clamp(Math.round(y * 10) / 10, 0, 100)
      if (sel.kind === 'qrTL') return { ...prev, qrTL: { ...prev.qrTL, x: nx, y: ny } }
      if (sel.kind === 'qrBR') return { ...prev, qrBR: { ...prev.qrBR, x: nx, y: ny } }
      if (sel.kind === 'logo') return { ...prev, centerLogo: { ...prev.centerLogo, x: nx, y: ny } }
      return { ...prev, nameItems: prev.nameItems.map((it) => (it.id === sel.id ? { ...it, x: nx, y: ny } : it)) }
    })
  }
  function onItemPointerDown(e: React.PointerEvent, sel: Sel) {
    e.preventDefault()
    e.stopPropagation()
    setSelected(sel)
    dragRef.current = sel
    try { boxRef.current?.setPointerCapture(e.pointerId) } catch {}
  }
  function onBoxPointerMove(e: React.PointerEvent) {
    if (!dragRef.current || !boxRef.current) return
    const r = boxRef.current.getBoundingClientRect()
    if (!r.width || !r.height) return
    updPos(dragRef.current, ((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100)
  }
  function onBoxPointerUp() { dragRef.current = null }

  const selSize = (() => {
    if (!selected) return 'md' as WmSize
    if (selected.kind === 'qrTL') return cfg.qrTL.size
    if (selected.kind === 'qrBR') return cfg.qrBR.size
    if (selected.kind === 'logo') return cfg.centerLogo.size
    const it = cfg.nameItems.find((i) => i.id === selected.id)
    return it ? it.size : ('md' as WmSize)
  })()
  const selOpacity = (() => {
    if (!selected) return 0.3
    if (selected.kind === 'qrTL') return cfg.qrTL.opacity
    if (selected.kind === 'qrBR') return cfg.qrBR.opacity
    if (selected.kind === 'logo') return cfg.centerLogo.opacity
    const it = cfg.nameItems.find((i) => i.id === selected.id)
    return it ? it.opacity : 0.3
  })()

  function setSize(s: WmSize) {
    if (!selected) return
    setCfg((prev) => {
      if (selected.kind === 'qrTL') return { ...prev, qrTL: { ...prev.qrTL, size: s } }
      if (selected.kind === 'qrBR') return { ...prev, qrBR: { ...prev.qrBR, size: s } }
      if (selected.kind === 'logo') return { ...prev, centerLogo: { ...prev.centerLogo, size: s } }
      return { ...prev, nameItems: prev.nameItems.map((it) => (it.id === selected.id ? { ...it, size: s } : it)) }
    })
  }
  function setOpacity(v: number) {
    if (!selected) return
    setCfg((prev) => {
      if (selected.kind === 'qrTL') return { ...prev, qrTL: { ...prev.qrTL, opacity: v } }
      if (selected.kind === 'qrBR') return { ...prev, qrBR: { ...prev.qrBR, opacity: v } }
      if (selected.kind === 'logo') return { ...prev, centerLogo: { ...prev.centerLogo, opacity: v } }
      return { ...prev, nameItems: prev.nameItems.map((it) => (it.id === selected.id ? { ...it, opacity: v } : it)) }
    })
  }
  /* (MG-3) دورة الظهور والاختفاء — طلب المستر: «أتحكم في المدة بتاعة اختفائها» */
  const selBlink: WmBlink = (() => {
    if (!selected) return { on: false, show: 15, hide: 15 }
    if (selected.kind === 'qrTL') return cfg.qrTL.blink
    if (selected.kind === 'qrBR') return cfg.qrBR.blink
    if (selected.kind === 'logo') return cfg.centerLogo.blink
    const it = cfg.nameItems.find((i) => i.id === selected.id)
    return it ? it.blink : { on: false, show: 15, hide: 15 }
  })()
  function setBlink(patch: Partial<WmBlink>) {
    if (!selected) return
    const nb: WmBlink = { ...selBlink, ...patch }
    setCfg((prev) => {
      if (selected.kind === 'qrTL') return { ...prev, qrTL: { ...prev.qrTL, blink: nb } }
      if (selected.kind === 'qrBR') return { ...prev, qrBR: { ...prev.qrBR, blink: nb } }
      if (selected.kind === 'logo') return { ...prev, centerLogo: { ...prev.centerLogo, blink: nb } }
      return { ...prev, nameItems: prev.nameItems.map((it) => (it.id === selected.id ? { ...it, blink: nb } : it)) }
    })
  }
  /* (MG-3) محتوى اللوجو الوسطاني: لوجو بس / اسم ورقم بس / الاتنين (زي الأول) */
  function setLogoContent(c: WmLogoContent) {
    setCfg((prev) => ({ ...prev, centerLogo: { ...prev.centerLogo, content: c } }))
  }

  const selLabel = selected
    ? selected.kind === 'qrTL' ? 'كارت QR فوق شمال' : selected.kind === 'qrBR' ? 'كارت QR تحت يمين' : selected.kind === 'logo' ? 'لوجو المنصة' : 'اسم/رقم الطالب'
    : null

  /* (MG-5) محتوى عنصر اسم/رقم: الاتنين / اسم بس / رقم بس */
  const selNameContent: WmNameContent = (() => {
    if (!selected || selected.kind !== 'name') return 'both'
    const it = cfg.nameItems.find((i) => i.id === selected.id)
    return (it && it.content) || 'both'
  })()
  function setNameContent(c: WmNameContent) {
    if (!selected || selected.kind !== 'name') return
    setCfg((prev) => ({ ...prev, nameItems: prev.nameItems.map((it) => (it.id === selected.id ? { ...it, content: c } : it)) }))
  }

  /* ===== الحفظ ===== */
  async function saveConfig(conf?: PlayerConfig) {
    setSavingCfg(true)
    try {
      const r = await fetch('/api/admin/player-config', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ config: conf || cfg }) })
      const d = await r.json()
      if (d && d.ok) { setHasSaved(true); toast.success('اتحفظت إعدادات الفيديو — افتح أي فيديو وهتلاقي الشكل الجديد فورًا') }
      else toast.error((d && d.error) || 'حصل خطأ في الحفظ')
    } catch { toast.error('حصل خطأ في الاتصال') }
    setSavingCfg(false)
  }
  async function saveTemplate() {
    setSavingTpl(true)
    try {
      const r = await fetch('/api/admin/parent-msg-template', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ template }) })
      const d = await r.json()
      if (d && d.ok) toast.success('اتحفظ قالب رسالة ولي الأمر')
      else toast.error((d && d.error) || 'حصل خطأ في الحفظ')
    } catch { toast.error('حصل خطأ في الاتصال') }
    setSavingTpl(false)
  }
  async function saveChannel() {
    setSavingCh(true)
    try {
      const r = await fetch('/api/admin/msg-channel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ channel, provider, apiUrl, apiKey, username, password, sender }) })
      const d = await r.json()
      if (d && d.ok) toast.success('اتحفظت إعدادات الإرسال')
      else toast.error((d && d.error) || 'حصل خطأ في الحفظ')
    } catch { toast.error('حصل خطأ في الاتصال') }
    setSavingCh(false)
  }
  async function testSend() {
    setTesting(true)
    try {
      const r = await fetch('/api/admin/messages/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: 'test', message: 'رسالة تجربة من منصة Mr Sherif ElSayed — لو وصلتك يبقى الإرسال شغال ✅' }) })
      const d = await r.json()
      if (d && d.ok && d.mode === 'manual') {
        toast.info('الإرسال التلقائي مش مفعّل — فتحتلك واتساب جاهز على موبايل الأدمن')
        window.open(d.waLink, '_blank')
      } else if (d && d.ok) {
        toast.success('اتبعتت رسالة التجربة لموبايل الأدمن عبر ' + (d.provider || d.mode))
      } else {
        toast.error((d && d.error) || 'فشل الإرسال — راجع بيانات المزود')
      }
    } catch { toast.error('حصل خطأ في الاتصال') }
    setTesting(false)
  }

  const itemCls = 'absolute -translate-x-1/2 -translate-y-1/2 cursor-grab active:cursor-grabbing select-none touch-none'
  const isSel = (s: Sel) =>
    !!selected && s.kind === selected.kind && (s.kind !== 'name' || (selected.kind === 'name' && selected.id === s.id))

  return (
    <div className="space-y-4">
      {/* ===== (أ) أطوال الشريط والدرع ===== */}
      <Card>
        <CardHeader><CardTitle className="text-base flex items-center gap-2"><MonitorPlay className="h-4 w-4" />أطوال الشريط والدرع</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">ارتفاع شريط التحكم (الموبايل)</Label>
              <Badge variant="secondary" className="font-bold">{cfg.barHeightMobile}px</Badge>
            </div>
            <Slider value={[cfg.barHeightMobile]} min={32} max={64} step={1} onValueChange={(v) => setCfg((p) => ({ ...p, barHeightMobile: v[0] }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">ارتفاع شريط التحكم (الكمبيوتر)</Label>
              <Badge variant="secondary" className="font-bold">{cfg.barHeightDesktop}px</Badge>
            </div>
            <Slider value={[cfg.barHeightDesktop]} min={36} max={72} step={1} onValueChange={(v) => setCfg((p) => ({ ...p, barHeightDesktop: v[0] }))} />
          </div>
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <Label className="text-sm">ارتفاع الدرع العلوي (شريط Mr Sherif ElSayed فوق)</Label>
              <Badge variant="secondary" className="font-bold">{cfg.topShieldHeight ? cfg.topShieldHeight + 'px' : 'تلقائي'}</Badge>
            </div>
            <Slider value={[cfg.topShieldHeight]} min={0} max={96} step={2} onValueChange={(v) => setCfg((p) => ({ ...p, topShieldHeight: v[0] }))} />
            <p className="text-xs text-muted-foreground mt-1">صفر = التلقائي (بيتمدد حسب مقاس الشاشة)</p>
          </div>
          {/* (MG-3) علامة اليوتيوب في الشريط — تشغيل/إيقاف + حجم */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5">
            <div>
              <Label className="text-sm">علامة اليوتيوب في شريط التحكم</Label>
              <p className="text-xs text-muted-foreground">ديكور بس — من غير أي لينك، وبتتوسع وتصغر مع الحجم</p>
            </div>
            <div className="flex items-center gap-3">
              <SizeButtons value={cfg.ytMark.size} onChange={(s) => setCfg((p) => ({ ...p, ytMark: { ...p.ytMark, size: s } }))} />
              <Switch checked={cfg.ytMark.on} onCheckedChange={(v) => setCfg((p) => ({ ...p, ytMark: { ...p.ytMark, on: v } }))} />
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button className="gap-1.5" onClick={() => saveConfig()} disabled={savingCfg}><Save className="h-4 w-4" />{savingCfg ? 'بيحفظ…' : 'حفظ إعدادات الفيديو'}</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => { setCfg(DEFAULT_PLAYER_CONFIG); saveConfig(DEFAULT_PLAYER_CONFIG) }}><RotateCcw className="h-4 w-4" />رجّع للافتراضي المقترح</Button>
            {hasSaved && <Badge variant="outline" className="self-center">فيه إعدادات محفوظة بتتطبق على المشغل</Badge>}
          </div>
        </CardContent>
      </Card>

      {/* ===== (ب) مدير الووترمارك ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2"><Move className="h-4 w-4" />مدير الووترمارك</CardTitle>
          <p className="text-xs text-muted-foreground">اسحب أي عنصر بالماوس أو اللمس عشان تغير مكانه — المكان بيتحفظ كنسبة من مقاس الفيديو. الاسم والرقم بيتكتبوا تلقائيًا ببيانات كل طالب على المشغل الحقيقي.</p>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* معاينة 16:9 */}
          <div
            ref={boxRef}
            className="relative w-full aspect-video rounded-lg overflow-hidden border bg-[#0b0b12] touch-none"
            style={{ background: 'linear-gradient(135deg,#111118 0%,#1b1b26 55%,#0b0b12 100%)' }}
            onPointerMove={onBoxPointerMove}
            onPointerUp={onBoxPointerUp}
            onPointerCancel={onBoxPointerUp}
          >
            {/* علامات شبكة خفيفة */}
            <div className="absolute inset-0 opacity-[0.08]" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,.6) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.6) 1px,transparent 1px)', backgroundSize: '12.5% 25%' }} />
            {cfg.centerLogo.on && (
              <div
                className={itemCls + ' font-black text-white/95 whitespace-nowrap text-center ' + (isSel({ kind: 'logo' }) ? 'ring-2 ring-sky-400 rounded px-1' : '')}
                style={{ left: `${cfg.centerLogo.x}%`, top: `${cfg.centerLogo.y}%`, opacity: cfg.centerLogo.opacity, fontSize: cfg.centerLogo.size === 'sm' ? 18 : cfg.centerLogo.size === 'md' ? 30 : 44, textShadow: '0 2px 14px rgba(0,0,0,.55)' }}
                onPointerDown={(e) => onItemPointerDown(e, { kind: 'logo' })}
              >
                {/* (MG-4) نفس شكل المشغل: brand = لوجو بس | name = اسم ثنائي وتحتيه الرقم | both = لوجو فوق + اسم ورقم */}
                {cfg.centerLogo.content === 'both' && <span style={{ display: 'block', fontSize: '0.42em', fontWeight: 900, letterSpacing: 0.5, marginBottom: 2, opacity: 0.9 }}>Mr Sherif ElSayed</span>}
                {cfg.centerLogo.content === 'brand' ? (
                  <span style={{ display: 'block' }}>Mr Sherif ElSayed</span>
                ) : (
                  <>
                    <span style={{ display: 'block' }}>اسم الطالب الثنائي</span>
                    <span style={{ display: 'block', fontSize: '0.4em', fontWeight: 800, marginTop: 2, opacity: 0.95, direction: 'ltr', unicodeBidi: 'plaintext' }}>01xxxxxxxxx</span>
                  </>
                )}
              </div>
            )}
            {cfg.qrTL.on && (
              <div
                className={itemCls + (isSel({ kind: 'qrTL' }) ? ' ring-2 ring-sky-400 rounded-md' : '')}
                style={{ left: `${cfg.qrTL.x}%`, top: `${cfg.qrTL.y}%`, opacity: cfg.qrTL.opacity }}
                onPointerDown={(e) => onItemPointerDown(e, { kind: 'qrTL' })}
              >
                <span className="flex flex-col items-center gap-0.5 rounded-lg border border-white/40 bg-black/66 px-1 py-0.5 shadow-lg" style={{ width: cfg.qrTL.size === 'sm' ? 46 : cfg.qrTL.size === 'md' ? 60 : 76 }}>
                  <FakeQr size={cfg.qrTL.size === 'sm' ? 24 : cfg.qrTL.size === 'md' ? 32 : 42} />
                  <span className="text-white font-bold" style={{ fontSize: cfg.qrTL.size === 'sm' ? 6 : cfg.qrTL.size === 'md' ? 7.5 : 9 }}>اسم الطالب</span>
                  <span className="text-white/85 font-bold" style={{ fontSize: cfg.qrTL.size === 'sm' ? 5.5 : cfg.qrTL.size === 'md' ? 6.5 : 8 }}>01xxxxxxxxx</span>
                </span>
              </div>
            )}
            {cfg.qrBR.on && (
              <div
                className={itemCls + (isSel({ kind: 'qrBR' }) ? ' ring-2 ring-sky-400 rounded-md' : '')}
                style={{ left: `${cfg.qrBR.x}%`, top: `${cfg.qrBR.y}%`, opacity: cfg.qrBR.opacity }}
                onPointerDown={(e) => onItemPointerDown(e, { kind: 'qrBR' })}
              >
                <span className="flex flex-col items-center gap-0.5 rounded-lg border border-white/40 bg-black/66 px-1 py-0.5 shadow-lg" style={{ width: cfg.qrBR.size === 'sm' ? 46 : cfg.qrBR.size === 'md' ? 60 : 76 }}>
                  <FakeQr size={cfg.qrBR.size === 'sm' ? 24 : cfg.qrBR.size === 'md' ? 32 : 42} />
                  <span className="text-white font-bold" style={{ fontSize: cfg.qrBR.size === 'sm' ? 6 : cfg.qrBR.size === 'md' ? 7.5 : 9 }}>اسم الطالب</span>
                  <span className="text-white/85 font-bold" style={{ fontSize: cfg.qrBR.size === 'sm' ? 5.5 : cfg.qrBR.size === 'md' ? 6.5 : 8 }}>01xxxxxxxxx</span>
                </span>
              </div>
            )}
            {cfg.nameItems.map((it) => (
              <div
                key={it.id}
                className={itemCls + (isSel({ kind: 'name', id: it.id }) ? ' ring-2 ring-sky-400 rounded-md' : '')}
                style={{ left: `${it.x}%`, top: `${it.y}%`, opacity: it.opacity }}
                onPointerDown={(e) => onItemPointerDown(e, { kind: 'name', id: it.id })}
              >
                {/* (MG-5) المعاينة بنفس شكل المشغل: اسم ثنائي فوق وتحتيه الرقم — أو اسم بس / رقم بس */}
                <span className="inline-block rounded-lg border border-white/40 bg-black/62 px-2 py-0.5 text-white font-extrabold whitespace-nowrap shadow-lg text-center" style={{ fontSize: it.size === 'sm' ? 9 : it.size === 'md' ? 12 : 16 }}>
                  {it.content === 'number' ? (
                    <span className="block" dir="ltr">01xxxxxxxxx</span>
                  ) : it.content === 'name' ? (
                    <span className="block">اسم الطالب</span>
                  ) : (
                    <>
                      <span className="block">اسم الطالب</span>
                      <span className="block opacity-85 font-bold" dir="ltr" style={{ fontSize: '0.82em', marginTop: 1 }}>01xxxxxxxxx</span>
                    </>
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* عناصر التبديل السريع */}
          <div className="grid gap-2 sm:grid-cols-3">
            {([['qrTL', 'كارت QR فوق شمال'], ['qrBR', 'كارت QR تحت يمين'], ['logo', 'لوجو المنصة في النص']] as const).map(([k, lbl]) => (
              <div key={k} className="flex items-center justify-between rounded-lg border px-3 py-2">
                <span className="text-sm">{lbl}</span>
                <Switch
                  checked={k === 'qrTL' ? cfg.qrTL.on : k === 'qrBR' ? cfg.qrBR.on : cfg.centerLogo.on}
                  onCheckedChange={(v) =>
                    setCfg((p) => (k === 'qrTL' ? { ...p, qrTL: { ...p.qrTL, on: v } } : k === 'qrBR' ? { ...p, qrBR: { ...p.qrBR, on: v } } : { ...p, centerLogo: { ...p.centerLogo, on: v } }))
                  }
                />
              </div>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => {
              const id = 'nm-' + Date.now()
              setCfg((p) => ({ ...p, nameItems: [...p.nameItems, { id, x: 50, y: p.nameItems.length ? clamp(12 + p.nameItems.length * 12, 0, 90) : 12, size: 'md', opacity: 0.6, content: 'both', blink: { on: false, show: 15, hide: 15 } }] }))
              setSelected({ kind: 'name', id })
            }}><Plus className="h-3.5 w-3.5" />ضيف ووتر مارك اسم/رقم</Button>
            {cfg.nameItems.length > 0 && selected && selected.kind === 'name' && (
              <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => {
                setCfg((p) => ({ ...p, nameItems: p.nameItems.filter((i) => i.id !== selected.id) }))
                setSelected(null)
              }}><Trash2 className="h-3.5 w-3.5" />امسح العنصر المختار</Button>
            )}
            {/* (MG-5) طلب المستر الحرفي: «أقدر أحذفهم كلهم من صفحة الأدمن» */}
            <Button size="sm" variant="outline" className="gap-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20" onClick={() => {
              setCfg((p) => ({ ...p, nameItems: [], qrTL: { ...p.qrTL, on: false }, qrBR: { ...p.qrBR, on: false }, centerLogo: { ...p.centerLogo, on: false } }))
              setSelected(null)
              toast.info('اتمسح كل العناصر — ضيف اللي عايزه واضغط حفظ')
            }}><Trash2 className="h-3.5 w-3.5" />امسح كل العناصر</Button>
            <span className="text-xs text-muted-foreground">عدد عناصر الاسم/الرقم: {cfg.nameItems.length} / 10</span>
          </div>

          {/* تحكم العنصر المختار */}
          <div className="rounded-lg border bg-muted/30 p-3">
            {selected ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold"><Move className="h-3.5 w-3.5 text-sky-500" />{selLabel} — اسحبه في المعاينة أو ظبطه من هنا</div>
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2"><span className="text-xs text-muted-foreground">الحجم:</span><SizeButtons value={selSize} onChange={setSize} /></div>
                  <div className="flex items-center gap-2 flex-1 min-w-[200px]">
                    <span className="text-xs text-muted-foreground whitespace-nowrap">الشفافية: {Math.round(selOpacity * 100)}%</span>
                    <Slider className="flex-1" value={[Math.round(selOpacity * 100)]} min={5} max={85} step={1} onValueChange={(v) => setOpacity(v[0] / 100)} />
                  </div>
                </div>
                {/* (MG-5) محتوى عنصر اسم/رقم — طلب المستر: «أضيف ووتر مارك رقم بس واسم بس وهكذا» */}
                {selected.kind === 'name' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">محتوى العنصر:</span>
                    {([['both', 'اسم ثنائي + رقم تحته'], ['name', 'اسم بس'], ['number', 'رقم بس']] as const).map(([k, lbl]) => (
                      <Button key={k} type="button" size="sm" variant={selNameContent === k ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setNameContent(k)}>{lbl}</Button>
                    ))}
                  </div>
                )}
                {/* (MG-3) محتوى اللوجو الوسطاني */}
                {selected.kind === 'logo' && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-muted-foreground">محتوى اللوجو:</span>
                    {([['brand', 'لوجو بس'], ['name', 'اسم الطالب وتحتيه رقمه (زي الأول)'], ['both', 'لوجو فوق + اسم ورقم']] as const).map(([k, lbl]) => (
                      <Button key={k} type="button" size="sm" variant={cfg.centerLogo.content === k ? 'default' : 'outline'} className="h-7 px-2.5 text-xs" onClick={() => setLogoContent(k)}>{lbl}</Button>
                    ))}
                  </div>
                )}
                {/* (MG-3) دورة الظهور والاختفاء — طلب المستر الحرفي */}
                <div className="flex flex-wrap items-center gap-3 pt-2 border-t">
                  <div className="flex items-center gap-2">
                    <Switch checked={selBlink.on} onCheckedChange={(v) => setBlink({ on: v })} id="blinkSw" />
                    <Label htmlFor="blinkSw" className="text-xs cursor-pointer">ظهور واختفاء دوريًا</Label>
                  </div>
                  {selBlink.on && (
                    <>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">يثبت ظاهر (ثواني):</span>
                        <Input type="number" min={1} max={120} value={selBlink.show} onChange={(e) => setBlink({ show: clamp(parseInt(e.target.value || '1', 10), 1, 120) })} className="w-16 h-8 text-xs" dir="ltr" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">يختفي مدة (ثواني):</span>
                        <Input type="number" min={1} max={120} value={selBlink.hide} onChange={(e) => setBlink({ hide: clamp(parseInt(e.target.value || '1', 10), 1, 120) })} className="w-16 h-8 text-xs" dir="ltr" />
                      </div>
                      <span className="text-[11px] text-muted-foreground">الدورة بتتوقف مؤقتًا لو الفيديو متوقف</span>
                    </>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">مكان العنصر: X {selected.kind === 'qrTL' ? Math.round(cfg.qrTL.x) : selected.kind === 'qrBR' ? Math.round(cfg.qrBR.x) : selected.kind === 'logo' ? Math.round(cfg.centerLogo.x) : Math.round(cfg.nameItems.find((i) => i.id === (selected as any).id)?.x || 0)}% — Y {selected.kind === 'qrTL' ? Math.round(cfg.qrTL.y) : selected.kind === 'qrBR' ? Math.round(cfg.qrBR.y) : selected.kind === 'logo' ? Math.round(cfg.centerLogo.y) : Math.round(cfg.nameItems.find((i) => i.id === (selected as any).id)?.y || 0)}%</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">دوس على أي عنصر في المعاينة عشان تظبط حجمه وشفافيته — أو اسحبه مباشرة.</p>
            )}
          </div>

          <div className="flex gap-2 flex-wrap">
            <Button className="gap-1.5" onClick={() => saveConfig()} disabled={savingCfg}><Save className="h-4 w-4" />{savingCfg ? 'بيحفظ…' : 'حفظ الووترمارك'}</Button>
            <p className="text-xs text-muted-foreground self-center">كل العناصر شفافة ومش بتمنع الدوس على الفيديو ولا على أي زرار</p>
          </div>
        </CardContent>
      </Card>

      {/* ===== (ج) قالب رسالة ولي الأمر ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">قالب رسالة ولي الأمر</CardTitle>
          <p className="text-xs text-muted-foreground">
            البلايسهولدرز بتتملي تلقائيًا من بيانات كل طالب: <span className="font-bold text-foreground">{'{student}'}</span> اسم الطالب — <span className="font-bold text-foreground">{'{exams}'}</span> الامتحانات (دخل ولا لسه + الدرجات) — <span className="font-bold text-foreground">{'{homework}'}</span> الواجبات — <span className="font-bold text-foreground">{'{videos}'}</span> نسبة المشاهدة — <span className="font-bold text-foreground">{'{assessment}'}</span> التقييم العام.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea value={template} onChange={(e) => setTemplate(e.target.value)} rows={13} className="text-sm leading-relaxed" dir="rtl" />
          <div className="flex gap-2 flex-wrap">
            <Button className="gap-1.5" onClick={saveTemplate} disabled={savingTpl}><Save className="h-4 w-4" />{savingTpl ? 'بيحفظ…' : 'حفظ القالب'}</Button>
            <Button variant="outline" className="gap-1.5" onClick={() => setTemplate(DEFAULT_PARENT_TEMPLATE)}><RotateCcw className="h-4 w-4" />رجّع للقالب الأصلي</Button>
          </div>
        </CardContent>
      </Card>

      {/* ===== (د) إعدادات الإرسال التلقائي ===== */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">إعدادات الإرسال التلقائي</CardTitle>
          <p className="text-xs text-muted-foreground flex items-start gap-1.5">
            <Info className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            الإرسال التلقائي يحتاج اشتراك في مزود خدمة رسائل (SMS أو WhatsApp Business API) — لو مفيش اشتراك، الزرار هيفتحلك واتساب جاهز بالإرسال اليدوي.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {([['manual', 'يدوي واتساب (افتراضي)'], ['sms', 'SMS Gateway'], ['waapi', 'WhatsApp Business API']] as const).map(([k, lbl]) => (
              <Button key={k} size="sm" variant={channel === k ? 'default' : 'outline'} className="h-8" onClick={() => setChannel(k)}>{lbl}</Button>
            ))}
          </div>
          {channel !== 'manual' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1"><Label className="text-xs">اسم المزود (SMSMisr / Twilio / Custom)</Label><Input value={provider} onChange={(e) => setProvider(e.target.value)} placeholder="مثال: SMSMisr" /></div>
              <div className="space-y-1"><Label className="text-xs">رابط الـ API الكامل</Label><Input value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder={channel === 'sms' ? 'https://smsmisr.com/api/webapi' : 'https://graph.facebook.com/v21.0/{PHONE_ID}/messages'} dir="ltr" /></div>
              <div className="space-y-1"><Label className="text-xs">API Key / Token</Label><Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="••••" dir="ltr" /></div>
              <div className="space-y-1"><Label className="text-xs">اسم المرسل (Sender Name)</Label><Input value={sender} onChange={(e) => setSender(e.target.value)} placeholder="MathGenius" dir="ltr" /></div>
              {channel === 'sms' && provider.toLowerCase() === 'twilio' && (
                <>
                  <div className="space-y-1"><Label className="text-xs">Account SID</Label><Input value={username} onChange={(e) => setUsername(e.target.value)} dir="ltr" /></div>
                  <div className="space-y-1"><Label className="text-xs">Auth Token</Label><Input value={password} onChange={(e) => setPassword(e.target.value)} type="password" dir="ltr" /></div>
                </>
              )}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <Button className="gap-1.5" onClick={saveChannel} disabled={savingCh}><Save className="h-4 w-4" />{savingCh ? 'بيحفظ…' : 'حفظ إعدادات الإرسال'}</Button>
            <Button variant="outline" className="gap-1.5" onClick={testSend} disabled={testing}><Send className="h-4 w-4" />{testing ? 'بيبعت…' : 'تجربة إرسال'}</Button>
            <span className="text-xs text-muted-foreground self-center">التجربة بتتبعت على موبايل الأدمن (11111111111)</span>
          </div>
          <p className="text-xs text-muted-foreground">المفاتيح السرية بتتخزن في السيرفر بس وبتتقنّع في الشاشة — مش بتترجع كاملة لأي متصفح.</p>
        </CardContent>
      </Card>
    </div>
  )
}
