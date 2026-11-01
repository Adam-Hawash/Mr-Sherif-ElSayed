'use client'

// ============================================================
// (24-b منقول من Maths-Genius + ترقية ز15) لوحة الصفوف الدراسية + مواعيد
// السنتر — طلب المستر: «في مستر شريف انا مش عارف اغير مواعيد السنتر،
// ومش عارف اغير الصفوف الدراسية. وانا عاوز اضيف في الاول خالص الصف
// الرابع الابتدائي وخامس ابتدائي... فخليني اقدر اضيف حاجة في الاول»
//
// الحفظ بيتم في SiteConfig بمفتاحين:
//   grades_data    = JSON للصفوف [{ ar, en, emoji, short }]
//   schedule_data  = JSON للمواعيد [{ day, slots: [{ time, grade }] }]
// ولو اسم صف اتغير بالعربي، بننبّه /api/grades/apply-rename بعد
// الحفظ عشان الاسم الجديد ينتشر على كل الطلاب والفيديوهات
// والواجبات والامتحانات.
// ============================================================

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { ArrowUpToLine, CalendarClock, CalendarPlus, ChevronDown, ChevronUp, Clock, GraduationCap, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { gradesFromConfig, useAppStore, type GradeItem } from '@/stores/app-store'

// ===== مواعيد السنتر — نفس شكل src/app/schedule/page.tsx =====
interface ScheduleSlot {
  time: string
  grade: string
}

interface DaySchedule {
  day: string
  slots: ScheduleSlot[]
}

// نفس الـ DEFAULT_SCHEDULE بتاع صفحة /schedule بالظبط (بنسخه هنا عشان
// لوحة الأدمن تبدأ بنفس الجدول لو مفيش بيانات محفوظة — والأول ما المستر
// يحفظ بتستبدلها في كل المنصة)
const DEFAULT_SCHEDULE: DaySchedule[] = [
  {
    day: 'السبت',
    slots: [
      { time: '10:00 صباحًا', grade: 'الصف السادس الابتدائي' },
      { time: '12:00 ظهرًا', grade: 'تالتة إعدادي' },
    ],
  },
  {
    day: 'الأحد',
    slots: [
      { time: '2:00 ظهرًا', grade: 'الصف السادس الابتدائي' },
    ],
  },
  {
    day: 'الإثنين',
    slots: [
      { time: '2:00 ظهرًا', grade: 'تالتة إعدادي' },
    ],
  },
  {
    day: 'الثلاثاء',
    slots: [
      { time: '2:00 ظهرًا', grade: 'الصف السادس الابتدائي' },
      { time: '3:30 عصرًا', grade: 'تالتة إعدادي' },
    ],
  },
  {
    day: 'الأربعاء',
    slots: [
      { time: '2:00 ظهرًا', grade: 'أولى إعدادي' },
      { time: '4:00 عصرًا', grade: 'تانية إعدادي' },
    ],
  },
  {
    day: 'الخميس',
    slots: [
      { time: '2:00 ظهرًا', grade: 'تانية إعدادي' },
      { time: '4:00 عصرًا', grade: 'أولى إعدادي' },
      { time: '5:30 مساءً', grade: 'أولى بكالوريا' },
    ],
  },
]

// مهم نحافظ على الأسماء القياسية للأيام — صفحة /schedule بتلوّن
// الكارت بناءً على اسم اليوم بالظبط (DAY_COLORS)
const ARABIC_DAYS = ['السبت', 'الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة']

// بتفك JSON من siteConfig.schedule_data ولو فاشل/فاضي بترجّع نسخة من الافتراضي
function parseSchedule(siteConfig: { [key: string]: string } | null | undefined): DaySchedule[] {
  try {
    var raw = siteConfig ? siteConfig.schedule_data : null
    if (typeof raw === 'string' && raw.trim() !== '') {
      var parsed = JSON.parse(raw)
      if (Array.isArray(parsed) && parsed.length > 0) {
        var out: DaySchedule[] = []
        for (var i = 0; i < parsed.length; i++) {
          var d: any = parsed[i] || {}
          var slots: ScheduleSlot[] = []
          if (Array.isArray(d.slots)) {
            for (var s = 0; s < d.slots.length; s++) {
              var sl: any = d.slots[s] || {}
              slots.push({ time: String(sl.time || ''), grade: String(sl.grade || '') })
            }
          }
          out.push({ day: String(d.day || ''), slots: slots })
        }
        return out
      }
    }
  } catch (e) { /* فولباك تحت */ }
  return DEFAULT_SCHEDULE.map(function (d) {
    return { day: d.day, slots: d.slots.map(function (s) { return { time: s.time, grade: s.grade } }) }
  })
}

// بنقارن الأسماء العربية القديمة بالجديدة: أي صف اتغير اسمه العربي
// بنرجّع { from, to } لنشرها على كل البيانات
function detectRenames(originals: GradeItem[], current: GradeItem[]): Array<{ from: string; to: string }> {
  var renames: Array<{ from: string; to: string }> = []
  /* (ز15) مطابقة آمنة مع الترتيب والإضافة في الأول: الصف اللي اسمه موجود
     في الأصل مش rename (اتنقل مكانه بس)، والمطابقة بالمكان بتشتغل بس
     لو العدد ثابت والاسم القديم اختفى من القايمة الحالية — عشان إضافة
     صف في الأول ما تترجمش غلط كـ«تغيير اسم» لأول صف قديم */
  var originalArs: Record<string, boolean> = {}
  for (var z = 0; z < originals.length; z++) originalArs[(originals[z].ar || '').trim()] = true
  var currentArs: Record<string, boolean> = {}
  for (var c = 0; c < current.length; c++) currentArs[(current[c].ar || '').trim()] = true
  for (var i = 0; i < current.length; i++) {
    var nu = current[i]
    var newAr = (nu.ar || '').trim()
    if (!newAr) continue
    if (originalArs[newAr]) continue
    var oldMatch: GradeItem | null = null
    for (var j = 0; j < originals.length; j++) {
      var ol = originals[j]
      var sameShort = nu.short.trim() !== '' && ol.short === nu.short.trim()
      var sameEn = nu.en.trim() !== '' && ol.en === nu.en.trim()
      if (sameShort || sameEn) { oldMatch = ol; break }
    }
    if (!oldMatch && originals.length === current.length && i < originals.length) {
      var posOld = originals[i]
      if ((posOld.ar || '').trim() && !currentArs[(posOld.ar || '').trim()]) oldMatch = posOld
    }
    var oldAr = oldMatch ? (oldMatch.ar || '').trim() : ''
    if (oldAr && oldAr !== newAr) {
      var dup = false
      for (var k = 0; k < renames.length; k++) {
        if (renames[k].from === oldAr && renames[k].to === newAr) { dup = true; break }
      }
      if (!dup) renames.push({ from: oldAr, to: newAr })
    }
  }
  return renames
}

export function GradesSchedulePanel() {
  var siteConfig = useAppStore(function (s) { return s.siteConfig })
  var configLoaded = useAppStore(function (s) { return s.configLoaded })

  // ===== القسم أ: الصفوف الدراسية =====
  var [grades, setGrades] = useState<GradeItem[]>(function () { return gradesFromConfig(siteConfig) })
  var [originalGrades, setOriginalGrades] = useState<GradeItem[]>(function () { return gradesFromConfig(siteConfig) })
  var [savingGrades, setSavingGrades] = useState(false)
  var gradesDirtyRef = useRef(false)

  // ===== القسم ب: مواعيد السنتر =====
  var [schedule, setSchedule] = useState<DaySchedule[]>(function () { return parseSchedule(siteConfig) })
  var [savingSchedule, setSavingSchedule] = useState(false)
  var scheduleDirtyRef = useRef(false)

  // لو الكونفج مش محمّل في الستور بنجيبه (نفس نمط صفحة /schedule)
  var [configFetchStarted, setConfigFetchStarted] = useState(false)
  useEffect(function () {
    if (configLoaded || configFetchStarted) return
    setConfigFetchStarted(true)
    fetch('/api/config?fresh=' + Date.now())
      .then(function (r) { return r.json() })
      .then(function (data) {
        useAppStore.getState().setSiteConfig(data || {})
        useAppStore.getState().setConfigLoaded(true)
      })
      .catch(function () { /* صامت */ })
  }, [configLoaded, configFetchStarted])

  // أول ما الكونفج يوصل بنزامن الحالة المحلية مرة واحدة — بس لو
  // المستر مبدأش يعدل (عشان ما نمسحش تعديله لو الكونفج وصل متأخر)
  var hydratedRef = useRef(false)
  useEffect(function () {
    if (hydratedRef.current) return
    if (!configLoaded && !siteConfig.grades_data && !siteConfig.schedule_data) return
    hydratedRef.current = true
    if (!gradesDirtyRef.current) {
      var items = gradesFromConfig(siteConfig)
      setGrades(items)
      setOriginalGrades(items)
    }
    if (!scheduleDirtyRef.current) setSchedule(parseSchedule(siteConfig))
  }, [configLoaded, siteConfig])

  // ===== تعديل الصفوف =====
  function updateGrade(idx: number, patch: Partial<GradeItem>) {
    gradesDirtyRef.current = true
    setGrades(function (prev) {
      var next = prev.slice()
      next[idx] = { ...next[idx], ...patch }
      return next
    })
  }

  function addGrade() {
    gradesDirtyRef.current = true
    setGrades(function (prev) {
      return prev.concat([{ ar: '', en: '', emoji: '🎓', short: '' }])
    })
  }

  /* (ز15) إضافة صف في أول القايمة — طلب المستر: «خليني أقدر أضيف حاجة في الأول» */
  function addGradeAtTop() {
    gradesDirtyRef.current = true
    setGrades(function (prev) {
      return [{ ar: '', en: '', emoji: '🎓', short: '' }].concat(prev)
    })
  }

  /* (ز15) ترتيب الصفوف يدويًا — اللي فوق في اللوحة بيظهر الأول في كل المنصة */
  function moveGrade(idx: number, dir: -1 | 1) {
    gradesDirtyRef.current = true
    setGrades(function (prev) {
      var j = idx + dir
      if (j < 0 || j >= prev.length) return prev
      var next = prev.slice()
      var tmp = next[idx]
      next[idx] = next[j]
      next[j] = tmp
      return next
    })
  }

  function removeGrade(idx: number) {
    gradesDirtyRef.current = true
    setGrades(function (prev) {
      return prev.filter(function (_, i) { return i !== idx })
    })
  }

  async function saveGrades() {
    // تحقق: كل صف لازم يكون ليه اسم عربي
    for (var i = 0; i < grades.length; i++) {
      if (!grades[i].ar.trim()) {
        toast.error('الصف رقم ' + (i + 1) + ' ناقص اسمه بالعربي — اكتب الاسم أو احذف الصف')
        return
      }
      for (var j = i + 1; j < grades.length; j++) {
        if (grades[i].ar.trim() === grades[j].ar.trim()) {
          toast.error('فيه صفين بنفس الاسم: ' + grades[i].ar.trim() + ' — لازم كل صف ليه اسم مختلف')
          return
        }
      }
    }
    // نكشف إعادة التسمية قبل الحفظ (بنقارن بالأسماء المحفوظة)
    var renames = detectRenames(originalGrades, grades)
    setSavingGrades(true)
    try {
      var value = JSON.stringify(grades.map(function (g) {
        return { ar: g.ar.trim(), en: g.en.trim(), emoji: g.emoji.trim(), short: g.short.trim() }
      }))
      var res = await fetch('/api/site-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'grades_data', value: value }),
      })
      if (!res.ok) throw new Error('save failed')
      var st = useAppStore.getState()
      st.setSiteConfig({ ...st.siteConfig, grades_data: value })
      setOriginalGrades(grades.map(function (g) { return { ...g } }))
      gradesDirtyRef.current = false
      toast.success('تم حفظ الصفوف الدراسية | Grades saved')
      // نشر إعادة التسمية على كل الطلاب والواجبات والامتحانات
      if (renames.length > 0) {
        try {
          var rr = await fetch('/api/grades/apply-rename', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ renames: renames }),
          })
          if (rr.ok) {
            toast.success('اسم الصف اتحديث عند كل الطلاب والواجبات', {
              description: renames.map(function (r) { return r.from + ' ← ' + r.to }).join(' | '),
            })
          } else {
            toast.error('الصفوف اتحفظت لكن نشر إعادة التسمية فشل — جرب احفظ تاني')
          }
        } catch (e) {
          toast.error('الصفوف اتحفظت لكن نشر إعادة التسمية فشل — جرب احفظ تاني')
        }
      }
    } catch (e) {
      toast.error('خطأ في حفظ الصفوف')
    }
    setSavingGrades(false)
  }

  // ===== تعديل المواعيد =====
  function updateDay(idx: number, day: string) {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      return prev.map(function (d, i) {
        return i === idx ? { ...d, day: day } : d
      })
    })
  }

  function removeDay(idx: number) {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      return prev.filter(function (_, i) { return i !== idx })
    })
  }

  function addDay() {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      // نختار أول يوم من الأسبوع مش مستخدم عشان الـ Select يبان معبّي
      var used: Record<string, boolean> = {}
      for (var i = 0; i < prev.length; i++) used[prev[i].day] = true
      var day = ''
      for (var j = 0; j < ARABIC_DAYS.length; j++) {
        if (!used[ARABIC_DAYS[j]]) { day = ARABIC_DAYS[j]; break }
      }
      if (!day) day = ARABIC_DAYS[prev.length % ARABIC_DAYS.length]
      return prev.concat([{ day: day, slots: [{ time: '', grade: '' }] }])
    })
  }

  function updateSlot(dayIdx: number, slotIdx: number, patch: Partial<ScheduleSlot>) {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      return prev.map(function (d, i) {
        if (i !== dayIdx) return d
        var slots = d.slots.slice()
        slots[slotIdx] = { ...slots[slotIdx], ...patch }
        return { ...d, slots: slots }
      })
    })
  }

  function addSlot(dayIdx: number) {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      return prev.map(function (d, i) {
        return i === dayIdx ? { ...d, slots: d.slots.concat([{ time: '', grade: '' }]) } : d
      })
    })
  }

  function removeSlot(dayIdx: number, slotIdx: number) {
    scheduleDirtyRef.current = true
    setSchedule(function (prev) {
      return prev.map(function (d, i) {
        if (i !== dayIdx) return d
        return { ...d, slots: d.slots.filter(function (_, si) { return si !== slotIdx }) }
      })
    })
  }

  // خيارات الصف في حصص الجدول = الصفوف الحالية في القسم أ
  // (+ أي صف قديم مستخدم في الجدول مش موجود في القايمة عشان ميختفيش)
  var slotGradeOptions: GradeItem[] = grades.filter(function (g) { return g.ar.trim() !== '' })
  var knownGrades: Record<string, boolean> = {}
  for (var gIdx = 0; gIdx < slotGradeOptions.length; gIdx++) knownGrades[slotGradeOptions[gIdx].ar] = true
  var extraOptions: GradeItem[] = []
  for (var dIdx = 0; dIdx < schedule.length; dIdx++) {
    var daySlots = schedule[dIdx].slots
    for (var sIdx = 0; sIdx < daySlots.length; sIdx++) {
      var gr = daySlots[sIdx].grade.trim()
      if (gr && !knownGrades[gr]) {
        knownGrades[gr] = true
        extraOptions.push({ ar: gr, en: '', emoji: '', short: '' })
      }
    }
  }
  slotGradeOptions = slotGradeOptions.concat(extraOptions)

  async function saveSchedule() {
    // تحقق: كل يوم ليه اسم وكل حصة ليه صف
    for (var i = 0; i < schedule.length; i++) {
      if (!schedule[i].day.trim()) {
        toast.error('فيه يوم من غير اسم — اختار اليوم من القايمة أو احذف الكارت')
        return
      }
      for (var j = 0; j < schedule[i].slots.length; j++) {
        if (!schedule[i].slots[j].grade.trim()) {
          toast.error('في حصة من غير صف في يوم ' + schedule[i].day + ' — اختار الصف أو احذف الحصة')
          return
        }
      }
    }
    setSavingSchedule(true)
    try {
      var value = JSON.stringify(schedule.map(function (d) {
        return {
          day: d.day,
          slots: d.slots.map(function (s) { return { time: s.time.trim(), grade: s.grade.trim() } }),
        }
      }))
      var res = await fetch('/api/site-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: 'schedule_data', value: value }),
      })
      if (!res.ok) throw new Error('save failed')
      var st = useAppStore.getState()
      st.setSiteConfig({ ...st.siteConfig, schedule_data: value })
      scheduleDirtyRef.current = false
      toast.success('تم حفظ مواعيد السنتر | Schedule saved')
    } catch (e) {
      toast.error('خطأ في حفظ المواعيد')
    }
    setSavingSchedule(false)
  }

  return (
    <div className="space-y-6">
      {/* ================= القسم أ: الصفوف الدراسية ================= */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <GraduationCap className="h-5 w-5" />
              الصفوف الدراسية | Grades
            </span>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" className="min-h-[36px]" onClick={addGradeAtTop} title="الصف الجديد يظهر أول القايمة في كل المنصة">
                <ArrowUpToLine className="h-4 w-4 ml-1" />إضافة صف في الأول
              </Button>
              <Button variant="outline" size="sm" className="min-h-[36px]" onClick={addGrade}>
                <Plus className="h-4 w-4 ml-1" />إضافة صف
              </Button>
              <Button size="sm" className="min-h-[36px]" onClick={saveGrades} disabled={savingGrades}>
                {savingGrades ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {savingGrades ? 'جاري الحفظ...' : 'حفظ الصفوف'}
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            الإيموجي بيظهر جنب اسم الصف في كل المنصة. لو غيرت اسم صف بالعربي واحفظت،
            الاسم الجديد بيتنشر تلقائيًا على كل الطلاب والفيديوهات والواجبات والامتحانات.
            استخدم سهمي ▲▼ للترتيب — الترتيب في اللوحة هو نفسه الترتيب في كل المنصة.
          </p>
          {grades.map(function (g, idx) {
            return (
              <div
                key={idx}
                className="flex flex-wrap items-center gap-2 rounded-xl border border-border/60 bg-muted/20 p-2.5"
              >
                <Input
                  value={g.emoji}
                  onChange={function (e) { updateGrade(idx, { emoji: e.target.value }) }}
                  placeholder="6️⃣"
                  maxLength={4}
                  title="إيموجي الصف — اللي بيظهر جنب اسم الصف"
                  className="w-14 text-center text-lg px-1 min-h-[38px]"
                />
                <Input
                  value={g.ar}
                  onChange={function (e) { updateGrade(idx, { ar: e.target.value }) }}
                  placeholder="الاسم بالعربي"
                  className="flex-1 min-w-[150px] min-h-[38px]"
                />
                <Input
                  value={g.en}
                  onChange={function (e) { updateGrade(idx, { en: e.target.value }) }}
                  placeholder="English name"
                  dir="ltr"
                  className="flex-1 min-w-[120px] min-h-[38px]"
                />
                <Input
                  value={g.short}
                  onChange={function (e) { updateGrade(idx, { short: e.target.value }) }}
                  placeholder="G6"
                  dir="ltr"
                  title="الكود القصير"
                  className="w-20 min-h-[38px]"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted"
                  onClick={function () { moveGrade(idx, -1) }}
                  disabled={idx === 0}
                  title="تحريك الصف لفوق"
                >
                  <ChevronUp className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-muted-foreground hover:bg-muted"
                  onClick={function () { moveGrade(idx, 1) }}
                  disabled={idx === grades.length - 1}
                  title="تحريك الصف لتحت"
                >
                  <ChevronDown className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                  onClick={function () { removeGrade(idx) }}
                  title="حذف الصف"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            )
          })}
          {grades.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">
              مفيش صفوف — اضغط «إضافة صف» وابدأ القايمة
            </p>
          )}
        </CardContent>
      </Card>

      {/* ================= القسم ب: مواعيد السنتر ================= */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <CalendarClock className="h-5 w-5" />
              مواعيد السنتر | Center Schedule
            </span>
            <Button size="sm" className="min-h-[36px]" onClick={saveSchedule} disabled={savingSchedule}>
              {savingSchedule ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {savingSchedule ? 'جاري الحفظ...' : 'حفظ المواعيد'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground leading-relaxed">
            نفس الجدول ده بيظهر للطلاب في صفحة «مواعيد السنتر». تقدر تزوّد يوم أو تحذف يوم،
            وتزوّد حصة أو تحذف حصة في أي يوم — واختار الصف من قايمة الصفوف اللي فوق.
          </p>
          {schedule.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-2">
              مفيش مواعيد محفوظة لسه — ابدأ بإضافة يوم
            </p>
          )}
          <div className="grid gap-4 md:grid-cols-2">
            {schedule.map(function (day, dayIdx) {
              var dayOptions = ARABIC_DAYS.indexOf(day.day) !== -1 ? ARABIC_DAYS : [day.day].concat(ARABIC_DAYS)
              return (
                <div key={dayIdx} className="rounded-xl border border-border/60 bg-muted/20 p-3 space-y-3">
                  {/* اسم اليوم + حذف اليوم */}
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-primary shrink-0" />
                    <select
                      value={day.day}
                      onChange={function (e) { updateDay(dayIdx, e.target.value) }}
                      className="h-10 min-h-[38px] flex-1 rounded-md border border-input bg-transparent px-3 text-sm font-bold cursor-pointer"
                    >
                      {dayOptions.map(function (d) {
                        return <option key={d} value={d}>{d || '— اختار اليوم —'}</option>
                      })}
                    </select>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                      onClick={function () { removeDay(dayIdx) }}
                      title="حذف اليوم كله"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  {/* حصص اليوم */}
                  <div className="space-y-2">
                    {day.slots.map(function (slot, slotIdx) {
                      return (
                        <div
                          key={slotIdx}
                          className="flex flex-wrap items-center gap-2 rounded-lg border border-border/40 bg-card p-2"
                        >
                          <Input
                            value={slot.time}
                            onChange={function (e) { updateSlot(dayIdx, slotIdx, { time: e.target.value }) }}
                            placeholder="10:00 صباحًا"
                            className="flex-1 min-w-[125px] min-h-[38px] h-9"
                          />
                          <select
                            value={slot.grade}
                            onChange={function (e) { updateSlot(dayIdx, slotIdx, { grade: e.target.value }) }}
                            className="h-9 min-h-[38px] flex-1 min-w-[135px] rounded-md border border-input bg-transparent px-2 text-sm cursor-pointer"
                          >
                            <option value="">اختر الصف</option>
                            {slotGradeOptions.map(function (g) {
                              return <option key={g.ar} value={g.ar}>{(g.emoji ? g.emoji + ' ' : '') + g.ar}</option>
                            })}
                          </select>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 shrink-0 text-red-600 hover:bg-red-500/10 hover:text-red-700"
                            onClick={function () { removeSlot(dayIdx, slotIdx) }}
                            title="حذف الحصة"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )
                    })}
                    {day.slots.length === 0 && (
                      <p className="text-xs text-muted-foreground text-center py-1">مفيش حصص في اليوم ده</p>
                    )}
                    <Button
                      variant="outline"
                      size="sm"
                      className="min-h-[36px] w-full border-dashed"
                      onClick={function () { addSlot(dayIdx) }}
                    >
                      <Plus className="h-4 w-4 ml-1" />حصة في اليوم ده
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>

          <Button variant="outline" className="min-h-[38px] w-full border-dashed" onClick={addDay}>
            <CalendarPlus className="h-4 w-4 ml-1" />إضافة يوم
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
