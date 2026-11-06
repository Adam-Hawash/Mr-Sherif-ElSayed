'use client'

/* ============================================================
   (2026-ز38) لوحة المستر — مركز الألعاب (الجيميفيكيشن)
   طلب المستر الحرفي:
   «Admin dashboard allows setting challenge cycles (e.g., 7 or 10
   days) per grade level» + باني أسئلة يومية متدرجة + متابعة الشارات
   والإحصائيات — كل حاجة لكل صف لوحده.
   ------------------------------------------------------------
   • إعدادات الدورة لكل صف: عدد أيام الدورة + XP لكل إجابة + قفل/فتح الصناديق والمراهنات
   • باني الأسئلة اليومية: يوم 1 سؤال → يوم 2 سؤالين → صعوبة تصاعدية
   • الشارات: الثلاث ندرات + عدد اللي فتحوها
   • إحصائيات حية: ستريكات نشيطة / XP مصروف / صناديق / مراهنات
   ============================================================ */

import { useState, useEffect, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Gamepad2, Plus, Trash2, Save, Loader2, RefreshCw, Zap, Gift, Coins,
  Medal, Trophy, Flame, Check, X, Settings2, ListPlus, Crown, Brain, Rocket, CalendarCheck, Target, Sparkles, Award,
} from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore, gradesFromConfig } from '@/stores/app-store'
import { useT } from '@/lib/i18n'

interface QRow { text: string; options: string[]; correctIndex: number; xp: number }
interface DayRec { id: string; grade: string; dayNumber: number; questions: QRow[] }
interface ConfigRec { grade: string; cycleDays: number; xpPerCorrect: number; mysteryEnabled: boolean; bettingEnabled: boolean }
interface BadgeDef { code: string; name: string; rarity: string; description: string; icon?: string }

var BADGE_ICONS: Record<string, any> = {
  Rocket: Rocket, Flame: Flame, Gift: Gift, CalendarCheck: CalendarCheck,
  Coins: Coins, Target: Target, Sparkles: Sparkles, Brain: Brain, Crown: Crown, Award: Award,
}

function emptyQuestion(): QRow {
  return { text: '', options: ['', '', '', ''], correctIndex: 0, xp: 0 }
}

export function GameZonePanel({ adminId }: { adminId: string }) {
  const T = useT()
  const siteConfig = useAppStore(function (s) { return s.siteConfig })
  var gradesList = gradesFromConfig(siteConfig)

  const [loading, setLoading] = useState(true)
  const [configs, setConfigs] = useState<ConfigRec[]>([])
  const [days, setDays] = useState<DayRec[]>([])
  const [badges, setBadges] = useState<BadgeDef[]>([])
  const [badgeCounts, setBadgeCounts] = useState<Record<string, number>>({})
  const [stats, setStats] = useState({ activeStreaks: 0, totalXpIssued: 0, boxesOpened: 0, openBets: 0, dailySolves: 0, betWins: 0, betLosses: 0 })

  // الإعدادات
  const [cfgGrade, setCfgGrade] = useState('')
  const [cycleDays, setCycleDays] = useState('7')
  const [xpPerCorrect, setXpPerCorrect] = useState('10')
  const [mysteryEnabled, setMysteryEnabled] = useState(true)
  const [bettingEnabled, setBettingEnabled] = useState(true)
  const [savingCfg, setSavingCfg] = useState(false)

  // الباني
  const [bGrade, setBGrade] = useState('')
  const [bDay, setBDay] = useState(1)
  const [dayRows, setDayRows] = useState<QRow[]>([emptyQuestion()])
  const [savingDay, setSavingDay] = useState(false)

  const loadAll = useCallback(async function () {
    if (!adminId) return
    try {
      const res = await fetch('/api/game/admin?adminId=' + encodeURIComponent(adminId))
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ')); return }
      setConfigs(Array.isArray(data.configs) ? data.configs : [])
      setDays(Array.isArray(data.days) ? data.days : [])
      setBadges(Array.isArray(data.badges) ? data.badges : [])
      setBadgeCounts(data.badgeCounts || {})
      setStats(data.stats || stats)
    } catch (e) { toast.error('الاتصال ضعيف — جرّب تاني') }
    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId])

  useEffect(function () { setLoading(true); loadAll() }, [adminId])

  // صفوف الصفول المخصصة (من إعدادات الأدمن) أو الموجودة فعلًا في configs
  var gradeNames: string[] = []
  for (var gi = 0; gi < gradesList.length; gi++) gradeNames.push(gradesList[gi].ar)
  for (var ci = 0; ci < configs.length; ci++) {
    if (configs[ci].grade && gradeNames.indexOf(configs[ci].grade) === -1) gradeNames.push(configs[ci].grade)
  }

  function configFor(grade: string): ConfigRec | null {
    for (var i = 0; i < configs.length; i++) if (configs[i].grade === grade) return configs[i]
    return null
  }
  function dayFor(grade: string, day: number): DayRec | null {
    for (var i = 0; i < days.length; i++) if (days[i].grade === grade && days[i].dayNumber === day) return days[i]
    return null
  }
  var builderCycleDays = bGrade ? (configFor(bGrade) ? configFor(bGrade)!.cycleDays : 7) : 7

  // تحميل بيانات اليوم في المحرر لما الصف/اليوم يتغيروا
  useEffect(function () {
    var rec = bGrade ? dayFor(bGrade, bDay) : null
    if (rec && rec.questions.length > 0) setDayRows(rec.questions.map(function (q) { return { text: q.text, options: q.options.slice(0, 4).concat(Array(4).fill('')).slice(0, 4), correctIndex: q.correctIndex, xp: q.xp } }))
    else setDayRows([emptyQuestion()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bGrade, bDay, days])

  async function saveConfig() {
    if (!cfgGrade) { toast.error(T('اختار الصف الأول', 'Pick a grade first')); return }
    var cd = Math.floor(Number(cycleDays) || 0)
    var xc = Math.floor(Number(xpPerCorrect) || 0)
    if (cd < 1 || cd > 30) { toast.error(T('عدد أيام الدورة من 1 لـ 30', 'Cycle days must be 1–30')); return }
    if (xc < 1) { toast.error(T('XP لكل إجابة لازم يكون 1 أو أكتر', 'XP per correct must be ≥ 1')); return }
    setSavingCfg(true)
    try {
      const res = await fetch('/api/game/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, action: 'saveConfig', grade: cfgGrade, cycleDays: cd, xpPerCorrect: xc, mysteryEnabled: mysteryEnabled, bettingEnabled: bettingEnabled }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ')); return }
      toast.success('🎮 ' + T('إعدادات الصف اتسجلت', 'Grade config saved') + ' — ' + cfgGrade)
      await loadAll()
    } catch (e) { toast.error('الاتصال ضعيف') }
    setSavingCfg(false)
  }

  async function saveDay() {
    if (!bGrade) { toast.error(T('اختار الصف الأول', 'Pick a grade first')); return }
    var clean: QRow[] = []
    for (var i = 0; i < dayRows.length; i++) {
      var r = dayRows[i]
      if (!String(r.text || '').trim()) continue
      var opts = (r.options || []).map(function (o) { return String(o || '').trim() }).filter(function (o) { return o !== '' })
      if (opts.length < 2) { toast.error(T('السؤال رقم', 'Question') + ' ' + (i + 1) + ' ' + T('لازم يبقى له اختيارين على الأقل', 'needs at least 2 options')); return }
      clean.push({ text: String(r.text).trim(), options: opts, correctIndex: Math.min(r.correctIndex, opts.length - 1), xp: Math.max(0, Math.floor(Number(r.xp) || 0)) })
    }
    if (clean.length === 0) { toast.error(T('لازم سؤال واحد على الأقل', 'Need at least one question')); return }
    setSavingDay(true)
    try {
      const res = await fetch('/api/game/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, action: 'saveDay', grade: bGrade, dayNumber: bDay, questions: clean }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ')); return }
      toast.success('✅ ' + T('أسئلة اليوم', 'Questions for day') + ' ' + bDay + ' ' + T('اتسجلت (' + clean.length + ' سؤال)', 'saved (' + clean.length + ')'))
      await loadAll()
    } catch (e) { toast.error('الاتصال ضعيف') }
    setSavingDay(false)
  }

  async function deleteDay() {
    if (!bGrade) return
    try {
      const res = await fetch('/api/game/admin', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, action: 'deleteDay', grade: bGrade, dayNumber: bDay }),
      })
      var data: any = await res.json()
      if (!res.ok) { toast.error(String(data.error || 'حصل خطأ')); return }
      toast.success(T('أسئلة اليوم اتمسحت', 'Day questions deleted'))
      setDayRows([emptyQuestion()])
      await loadAll()
    } catch (e) { toast.error('الاتصال ضعيف') }
  }

  function updateRow(idx: number, patch: Partial<QRow>) {
    setDayRows(function (prev) {
      var nx = prev.slice()
      nx[idx] = { ...nx[idx], ...patch }
      return nx
    })
  }

  if (loading) {
    return <div className="flex items-center justify-center py-16"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>
  }

  var totalBuiltDays = days.reduce(function (acc, d) { return acc + (d.questions.length > 0 ? 1 : 0) }, 0)

  return (
    <div className="space-y-4">
      {/* إحصائيات سريعة فوق */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
        {[
          { label: T('ستريكات نشيطة', 'Active streaks'), value: stats.activeStreaks, icon: Flame, cls: 'text-orange-500' },
          { label: T('حلول يومية', 'Daily solves'), value: stats.dailySolves, icon: Zap, cls: 'text-primary' },
          { label: T('XP مصروف', 'XP issued'), value: stats.totalXpIssued, icon: Coins, cls: 'text-amber-500' },
          { label: T('صناديق اتفتحت', 'Boxes opened'), value: stats.boxesOpened, icon: Gift, cls: 'text-fuchsia-500' },
          { label: T('مراهنات مفتوحة', 'Open bets'), value: stats.openBets, icon: Target, cls: 'text-emerald-500' },
          { label: T('أيام مبنية', 'Built days'), value: totalBuiltDays, icon: ListPlus, cls: 'text-violet-500' },
        ].map(function (s, i) {
          var Icon = s.icon
          return (
            <Card key={i} className="p-3">
              <div className="flex items-center gap-2">
                <Icon className={'h-4 w-4 ' + s.cls} />
                <div>
                  <div className="text-lg font-black leading-none tabular-nums">{s.value.toLocaleString('en-US')}</div>
                  <div className="text-[10px] text-muted-foreground">{s.label}</div>
                </div>
              </div>
            </Card>
          )
        })}
      </div>

      <Tabs defaultValue="config" className="space-y-4">
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          <TabsTrigger value="config" className="text-xs sm:text-sm gap-1"><Settings2 className="h-4 w-4" /><span className="hidden sm:inline">{T('إعدادات الدورة', 'Cycles')}</span></TabsTrigger>
          <TabsTrigger value="builder" className="text-xs sm:text-sm gap-1"><ListPlus className="h-4 w-4" /><span className="hidden sm:inline">{T('باني الأسئلة اليومية', 'Daily Builder')}</span></TabsTrigger>
          <TabsTrigger value="badges" className="text-xs sm:text-sm gap-1"><Medal className="h-4 w-4" /><span className="hidden sm:inline">{T('الشارات', 'Badges')}</span></TabsTrigger>
        </TabsList>

        {/* ============ إعدادات الدورة لكل صف ============ */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <Gamepad2 className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-black">{T('دورة التحدي لكل صف', 'Challenge cycle per grade')}</div>
                  <div className="text-[11px] text-muted-foreground">{T('المستر بيحدد عدد أيام الدورة (مثال 7 أو 10) وXP لكل إجابة صح — وكل صف لوحده', 'Set the cycle length (e.g., 7 or 10 days) and XP per correct answer — independently per grade')}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{T('الصف', 'Grade')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {gradeNames.length === 0 && <p className="text-xs text-muted-foreground">{T('مفيش صفوف متاحة', 'No grades available')}</p>}
                  {gradeNames.map(function (g) {
                    var rec = configFor(g)
                    return (
                      <button key={g} onClick={function () { setCfgGrade(g) }}
                        className={'rounded-full border px-3 py-2 text-xs font-bold transition-all min-h-[40px] ' + (cfgGrade === g ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/25 hover:border-primary/50')}>
                        {g}
                        {rec && <span className="ms-1 text-[9px] opacity-70">• {rec.cycleDays}{T(' يوم', 'd')}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {cfgGrade && (
                <div className="space-y-4 rounded-xl border p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>{T('أيام الدورة', 'Cycle days')}</Label>
                      <div className="flex items-center gap-2">
                        <Input type="number" min={1} max={30} value={cycleDays} onChange={function (e) { setCycleDays(e.target.value) }} className="h-11 w-24 text-center font-black" dir="ltr" />
                        {[7, 10].map(function (q) {
                          return <Button key={q} size="sm" variant="outline" className="h-10 px-3 text-xs" onClick={function () { setCycleDays(String(q)) }}>{q} {T('يوم', 'days')}</Button>
                        })}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{T('بعد آخر يوم الدورة تبدأ من الأول تاني والستريك بيكمل', 'After the final day the cycle loops and the streak keeps going')}</p>
                    </div>
                    <div className="space-y-1.5">
                      <Label>{T('XP لكل إجابة صح', 'XP per correct answer')}</Label>
                      <Input type="number" min={1} max={500} value={xpPerCorrect} onChange={function (e) { setXpPerCorrect(e.target.value) }} className="h-11 w-24 text-center font-black" dir="ltr" />
                      <p className="text-[10px] text-muted-foreground">{T('لو السؤال له XP مخصص بيتقدّم على الرقم ده', 'Per-question XP overrides this value')}</p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-6">
                    <div className="flex items-center gap-3">
                      <Gift className="h-4 w-4 text-fuchsia-500" />
                      <div>
                        <div className="text-sm font-bold">{T('صناديق الأسرار', 'Mystery boxes')}</div>
                        <div className="text-[10px] text-muted-foreground">{mysteryEnabled ? T('مفعّلة للصف', 'Enabled') : T('مقفولة للصف', 'Disabled')}</div>
                      </div>
                      <Switch checked={mysteryEnabled} onCheckedChange={setMysteryEnabled} />
                    </div>
                    <div className="flex items-center gap-3">
                      <Coins className="h-4 w-4 text-emerald-500" />
                      <div>
                        <div className="text-sm font-bold">{T('المراهنات', 'XP betting')}</div>
                        <div className="text-[10px] text-muted-foreground">{bettingEnabled ? T('مفعّلة للصف', 'Enabled') : T('مقفولة للصف', 'Disabled')}</div>
                      </div>
                      <Switch checked={bettingEnabled} onCheckedChange={setBettingEnabled} />
                    </div>
                  </div>
                  <Button onClick={saveConfig} disabled={savingCfg} className="w-full sm:w-auto h-11 font-black">
                    {savingCfg ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {T('احفظ إعدادات الصف', 'Save grade config')}
                  </Button>
                </div>
              )}

              {/* الإعدادات المحفوظة */}
              {configs.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-xs font-bold text-muted-foreground">{T('الصفوف المضبوطة', 'Configured grades')}</div>
                  {configs.map(function (c) {
                    return (
                      <div key={c.grade} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-xs flex-wrap">
                        <span className="font-bold">{c.grade}</span>
                        <span className="text-muted-foreground">
                          {T('دورة', 'Cycle')} <b className="text-foreground">{c.cycleDays}</b> {T('يوم', 'd')} • <b className="text-foreground">+{c.xpPerCorrect}</b> XP/{'إجابة'} • {c.mysteryEnabled ? '🎁' : '🚫🎁'} {c.bettingEnabled ? '🎲' : '🚫🎲'}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ باني الأسئلة اليومية ============ */}
        <TabsContent value="builder" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-4">
              <div className="flex items-center gap-2">
                <ListPlus className="h-5 w-5 text-primary" />
                <div>
                  <div className="font-black">{T('باني الأسئلة اليومية المتدرجة', 'Progressive daily question builder')}</div>
                  <div className="text-[11px] text-muted-foreground">{T('التوصية الجيمنج: يوم 1 سؤال واحد، يوم 2 سؤالين، صعوبة تزيد تدريجيًا — كل يوم له صفته الخاصة', 'Gaming recipe: Day 1 has 1 question, Day 2 has 2 — difficulty escalates. Each day has its own set')}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>{T('الصف', 'Grade')}</Label>
                <div className="flex flex-wrap gap-1.5">
                  {gradeNames.length === 0 && <p className="text-xs text-muted-foreground">{T('مفيش صفوف متاحة', 'No grades available')}</p>}
                  {gradeNames.map(function (g) {
                    var built = days.filter(function (d) { return d.grade === g && d.questions.length > 0 }).length
                    return (
                      <button key={g} onClick={function () { setBGrade(g) }}
                        className={'rounded-full border px-3 py-2 text-xs font-bold transition-all min-h-[40px] ' + (bGrade === g ? 'border-primary bg-primary/10 text-primary' : 'border-muted-foreground/25 hover:border-primary/50')}>
                        {g}
                        {built > 0 && <span className="ms-1 text-[9px] opacity-70">• {built} {T('يوم مبنّي', 'built')}</span>}
                      </button>
                    )
                  })}
                </div>
              </div>

              {bGrade && (
                <>
                  {/* اختيار اليوم */}
                  <div className="space-y-2">
                    <Label>{T('يوم الدورة (1 —', 'Cycle day (1 –')} {builderCycleDays})</Label>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: builderCycleDays }, function (_, i) { return i + 1 }).map(function (d) {
                        var rec = dayFor(bGrade, d)
                        var built = rec && rec.questions.length > 0
                        return (
                          <button key={d} onClick={function () { setBDay(d) }}
                            className={'relative rounded-lg border px-3 py-2 text-xs font-bold transition-all min-h-[40px] min-w-[44px] ' + (bDay === d ? 'border-primary bg-primary/10 text-primary' : built ? 'border-emerald-500/50 text-emerald-600' : 'border-muted-foreground/25 text-muted-foreground hover:border-primary/50')}>
                            {d}
                            {built && <Check className="absolute -top-1 -end-1 h-3.5 w-3.5 rounded-full bg-emerald-500 text-white p-0.5" />}
                          </button>
                        )
                      })}
                    </div>
                    {dayFor(bGrade, bDay) && dayFor(bGrade, bDay)!.questions.length > 0 && dayFor(bGrade, bDay)!.questions.length < bDay && (
                      <p className="text-[11px] font-bold text-amber-500">💡 {T('التوصية: يوم', 'Recipe tip: day')} {bDay} {T('يفضّل يكون فيه', 'works best with')} {bDay} {T('أسئلة — حاليًا فيه', 'questions — it currently has')} {dayFor(bGrade, bDay)!.questions.length}</p>
                    )}
                  </div>

                  {/* محرر الأسئلة */}
                  <div className="space-y-3">
                    {dayRows.map(function (row, ri) {
                      return (
                        <div key={ri} className="space-y-2 rounded-xl border p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-black text-primary">{T('سؤال', 'Q')} {ri + 1}</span>
                            {dayRows.length > 1 && (
                              <Button size="sm" variant="ghost" className="h-8 text-rose-500 hover:bg-rose-500/10" onClick={function () { setDayRows(function (p) { return p.filter(function (_x, xi) { return xi !== ri }) }) }}>
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                          <Input placeholder={T('نص السؤال (بالإنجليزي حسب سياسة المنصة للأسئلة المستخرجة — أو بالعربي لو حابب)', 'Question text')} value={row.text} onChange={function (e) { updateRow(ri, { text: e.target.value }) }} className="h-11 font-bold" />
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                            {row.options.map(function (opt, oi) {
                              return (
                                <label key={oi} className={'flex items-center gap-2 rounded-lg border px-2 py-1.5 cursor-pointer transition-colors ' + (row.correctIndex === oi ? 'border-emerald-500 bg-emerald-500/10' : 'border-muted-foreground/25')}>
                                  <input
                                    type="radio"
                                    name={'correct_' + ri}
                                    checked={row.correctIndex === oi}
                                    onChange={function () { updateRow(ri, { correctIndex: oi }) }}
                                    className="accent-emerald-600"
                                    aria-label={T('الإجابة الصحيحة', 'Correct answer') + ' ' + String.fromCharCode(65 + oi)}
                                  />
                                  <Input
                                    placeholder={T('اختيار', 'Option') + ' ' + String.fromCharCode(65 + oi)}
                                    value={opt}
                                    onChange={function (e) {
                                      var nx = row.options.slice(); nx[oi] = e.target.value
                                      updateRow(ri, { options: nx })
                                    }}
                                    className="h-9 border-0 bg-transparent shadow-none focus-visible:ring-0 font-medium"
                                  />
                                </label>
                              )
                            })}
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">{T('XP مخصص (اختياري)', 'Custom XP (optional)')}</Label>
                            <Input type="number" min={0} max={1000} value={row.xp || ''} placeholder={T('افتراضي', 'default')} onChange={function (e) { updateRow(ri, { xp: Math.floor(Number(e.target.value) || 0) }) }} className="h-9 w-20 text-center" dir="ltr" />
                          </div>
                        </div>
                      )
                    })}
                    <div className="flex flex-wrap gap-2">
                      <Button variant="outline" className="h-11 font-bold" onClick={function () { setDayRows(function (p) { return p.concat([emptyQuestion()]) }) }}>
                        <Plus className="h-4 w-4" />{T('ضيف سؤال', 'Add question')}
                      </Button>
                      <Button onClick={saveDay} disabled={savingDay} className="h-11 font-black bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white">
                        {savingDay ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {T('احفظ يوم', 'Save day')} {bDay}
                      </Button>
                      {dayFor(bGrade, bDay) && (
                        <Button variant="outline" className="h-11 text-rose-500 border-rose-400/40 hover:bg-rose-500/10" onClick={deleteDay}>
                          <Trash2 className="h-4 w-4" />{T('مسح أسئلة اليوم', 'Delete day questions')}
                        </Button>
                      )}
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ============ الشارات ============ */}
        <TabsContent value="badges" className="space-y-4">
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center gap-2">
                <Medal className="h-5 w-5 text-primary" />
                <div className="font-black">{T('شارات الإنجاز — الثلاث ندرات', 'Achievement badges — three rarity tiers')}</div>
              </div>
              <p className="text-[11px] text-muted-foreground">{T('الشارات بتتفتح أوتوماتيك لما الطالب يحقق الشرط — الأدمن بيشتغل بس المشاهدة والإحصائيات', 'Badges unlock automatically when students hit their milestone — admin view shows counts')}</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {badges.map(function (b) {
                  var Icon = BADGE_ICONS[b.icon || 'Award'] || Award
                  var rc = b.rarity === 'legendary' ? { cls: 'game-card-legendary text-amber-500', label: 'أسطورية' } : b.rarity === 'rare' ? { cls: 'game-card-rare text-violet-500', label: 'نادرة' } : { cls: 'game-card-common text-slate-400', label: 'عادية' }
                  var count = badgeCounts[b.code] || 0
                  return (
                    <div key={b.code} className={'flex items-center gap-3 rounded-xl border p-3 ' + rc.cls}>
                      <Icon className="h-7 w-7 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-black">{b.name} <span className="text-[9px] opacity-60">({rc.label})</span></div>
                        <div className="text-[10px] text-muted-foreground truncate">{b.description}</div>
                      </div>
                      <Badge variant="outline" className="shrink-0 tabular-nums">{count} {T('طالب', 'students')}</Badge>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>

          {/* إحصائيات التفصيلية */}
          <Card>
            <CardContent className="p-4 sm:p-5 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="font-black flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500" />{T('إحصائيات الألعاب', 'Gaming stats')}</div>
                <Button size="sm" variant="outline" className="min-h-[40px]" onClick={loadAll}><RefreshCw className="h-3.5 w-3.5" />{T('تحديث', 'Refresh')}</Button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                {[
                  { label: T('كسب مراهنات', 'Bets won'), value: stats.betWins, cls: 'text-emerald-500' },
                  { label: T('خسائر مراهنات', 'Bets lost'), value: stats.betLosses, cls: 'text-rose-500' },
                  { label: T('مفتوحة حاليًا', 'Currently open'), value: stats.openBets, cls: 'text-amber-500' },
                  { label: T('XP مصروف كليًا', 'Total XP issued'), value: stats.totalXpIssued, cls: 'text-primary' },
                ].map(function (s, i) {
                  return (
                    <div key={i} className="rounded-xl border p-3">
                      <div className={'text-2xl font-black tabular-nums ' + s.cls}>{s.value.toLocaleString('en-US')}</div>
                      <div className="text-[10px] text-muted-foreground">{s.label}</div>
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
