'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/stores/app-store'
import { useEffect, useState } from 'react'
import { CalendarClock, Clock, GraduationCap, ArrowRight, BookOpen, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface ScheduleSlot {
  time: string
  grade: string
}

interface DaySchedule {
  day: string
  slots: ScheduleSlot[]
}

// Default schedule - editable from admin via siteConfig.schedule_data (JSON)
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
      { time: '2:00 ظهرًا', grade: 'الصف الرابع الابتدائي' },
    ],
  },
  {
    day: 'الإثنين',
    slots: [
      { time: '2:00 ظهرًا', grade: 'الصف الخامس الابتدائي' },
    ],
  },
  {
    day: 'الثلاثاء',
    slots: [
      { time: '2:00 ظهرًا', grade: 'الصف الثالث الابتدائي' },
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

const DAY_COLORS: Record<string, string> = {
  'السبت': 'from-amber-500 to-orange-500',
  'الأحد': 'from-rose-500 to-pink-500',
  'الإثنين': 'from-blue-500 to-cyan-500',
  'الثلاثاء': 'from-emerald-500 to-teal-500',
  'الأربعاء': 'from-violet-500 to-purple-500',
  'الخميس': 'from-fuchsia-500 to-pink-500',
}

// Arabic pluralization for "حصة"
function slotCountLabel(count: number): string {
  if (count === 1) return 'حصة واحدة'
  if (count === 2) return 'حصتين'
  if (count >= 3 && count <= 10) return count + ' حصص'
  return count + ' حصة'
}

export default function SchedulePage() {
  const { siteConfig, setSiteConfig, configLoaded } = useAppStore()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!configLoaded) {
      fetch('/api/config')
        .then((r) => r.json())
        .then((data) => {
          setSiteConfig(data)
          useAppStore.getState().setConfigLoaded(true)
        })
        .catch(() => {})
        .finally(() => setLoading(false))
    } else {
      setLoading(false)
    }
  }, [configLoaded, setSiteConfig])

  // Parse schedule from siteConfig.schedule_data (JSON string) or use default
  let schedule: DaySchedule[] = DEFAULT_SCHEDULE
  let scheduleTitle = 'مواعيد السنتر'
  let scheduleSubtitle = 'جدول مواعيد الحصص الأسبوعية لكل الصفوف الدراسية — اختر اليوم المناسب لك وتابع موعد حصتك'
  let scheduleBadge = 'جدول الحصص الأسبوعي'
  let scheduleFooterNote = 'جميع المواعيد بتوقيت القاهرة. لو عندك أي استفسار عن موعد حصتك تواصل معنا عبر واتساب.'
  let brandName = 'منصة مستر شريف السيد'

  try {
    if (siteConfig.schedule_data) {
      const parsed = JSON.parse(siteConfig.schedule_data)
      if (Array.isArray(parsed) && parsed.length > 0) {
        schedule = parsed
      }
    }
    if (siteConfig.schedule_title) scheduleTitle = siteConfig.schedule_title
    if (siteConfig.schedule_subtitle) scheduleSubtitle = siteConfig.schedule_subtitle
    if (siteConfig.schedule_badge) scheduleBadge = siteConfig.schedule_badge
    if (siteConfig.schedule_footer_note) scheduleFooterNote = siteConfig.schedule_footer_note
    if (siteConfig.schedule_brand) brandName = siteConfig.schedule_brand
  } catch (e) {
    // keep defaults
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
              <CalendarClock className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-base sm:text-lg font-bold text-foreground leading-tight">
                {scheduleTitle}
              </h1>
              <p className="text-[11px] text-muted-foreground">{brandName}</p>
            </div>
          </div>
          <Link href="/">
            <Button variant="outline" size="sm" className="min-h-[44px]">
              <ArrowRight className="h-4 w-4 ml-1" />
              العودة للرئيسية
            </Button>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8 sm:py-12">
        {/* Title */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-xs font-medium text-primary mb-4">
            <CalendarClock className="h-3.5 w-3.5" />
            <span>{scheduleBadge}</span>
          </div>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">
            {scheduleTitle}
          </h2>
          <p className="text-sm sm:text-base text-muted-foreground max-w-2xl mx-auto">
            {scheduleSubtitle}
          </p>
        </div>

        {/* Schedule Grid */}
        <div className="grid gap-5 md:grid-cols-2">
          {schedule.map((daySchedule, dayIdx) => {
            const gradient = DAY_COLORS[daySchedule.day] || 'from-primary to-primary'
            const count = daySchedule.slots.length
            return (
              <Card
                key={dayIdx}
                className="overflow-hidden border-border/50 hover:shadow-lg transition-shadow"
              >
                {/* Day header with gradient */}
                <div className={`bg-gradient-to-l ${gradient} px-5 py-3 flex items-center justify-between`}>
                  <h3 className="text-white font-bold text-lg">
                    {daySchedule.day}
                  </h3>
                  <span className="text-white/90 text-xs font-medium bg-white/20 px-2.5 py-0.5 rounded-full">
                    {slotCountLabel(count)}
                  </span>
                </div>

                {/* Slots */}
                <CardContent className="p-0">
                  <div className="divide-y divide-border/40">
                    {daySchedule.slots.map((slot, idx) => (
                      <div
                        key={idx}
                        className="flex items-center gap-4 px-5 py-4 hover:bg-muted/40 transition-colors"
                      >
                        {/* Time */}
                        <div className="flex items-center gap-2 shrink-0 min-w-[110px]">
                          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
                            <Clock className="h-4 w-4 text-primary" />
                          </div>
                          <span className="text-sm font-bold text-foreground" dir="ltr">
                            {slot.time}
                          </span>
                        </div>

                        {/* Divider */}
                        <div className="h-8 w-px bg-border/50" />

                        {/* Grade */}
                        <div className="flex items-center gap-2 flex-1">
                          <GraduationCap className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-medium text-foreground">
                            {slot.grade}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>

        {/* Footer note */}
        <div className="mt-10 text-center">
          <div className="inline-flex items-center gap-2 rounded-xl bg-muted/50 border border-border/40 px-5 py-3 max-w-2xl">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              {scheduleFooterNote}
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
