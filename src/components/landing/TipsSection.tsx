'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useAppStore } from '@/stores/app-store'
import { Lightbulb, Clock, Brain, Pencil, MessageCircle } from 'lucide-react'
import { useState, useEffect } from 'react'

var TIP_ICONS = [Clock, Brain, Pencil, MessageCircle]
var TIP_COLORS = [
  'bg-[#EA580C]/10 text-[#EA580C] dark:bg-[#EA580C]/15 dark:text-[#FB923C]',
  'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
]

export default function TipsSection() {
  var { siteConfig, setSiteConfig, configLoaded } = useAppStore()

  var initialCfg = (typeof window !== 'undefined' && (window as any).__INITIAL_CONFIG__) || {}
  var cfg = configLoaded ? siteConfig : (Object.keys(siteConfig).length > 0 ? siteConfig : initialCfg)

  useEffect(function() {
    if (!configLoaded && Object.keys(siteConfig).length === 0) {
      fetch('/api/config')
        .then(function(r) { return r.json() })
        .then(function(data) {
          setSiteConfig(data)
          useAppStore.getState().setConfigLoaded(true)
        })
        .catch(function() {})
    }
  }, [configLoaded, siteConfig, setSiteConfig])

  var tipsBgImage = cfg.tips_bg_image || ''
  var tipsSectionImage = cfg.tips_section_image || ''
  var tipImages = [
    cfg.tip1_image || '',
    cfg.tip2_image || '',
    cfg.tip3_image || '',
  ]
  var [tipLoaded, setTipLoaded] = useState([false, false, false, false])
  var [bgLoaded, setBgLoaded] = useState(false)
  var [sectionImgLoaded, setSectionImgLoaded] = useState(false)

  var tips = [
    {
      icon: TIP_ICONS[0],
      titleAr: cfg.tips_card1_title || 'حدد وقت يومي للمراجعة',
      titleEn: cfg.tips_card1_title_en || 'Set Daily Review Time',
      description: cfg.tips_card1_desc || 'خصص 20-30 دقيقة كل يوم لمراجعة ما تعلمته. الاستمرارية هي مفتاح التفوّق في الرياضيات. Dedicate 20-30 minutes daily for review.',
      color: TIP_COLORS[0],
    },
    {
      icon: TIP_ICONS[1],
      titleAr: cfg.tips_card2_title || 'ركز على الفهم وليس الحفظ',
      titleEn: cfg.tips_card2_title_en || 'Focus on Understanding, Not Memorization',
      description: cfg.tips_card2_desc || 'حاول فهم لماذا وليس كيف فقط. الفهم العميق يبقي المعلومة لفترة أطول ويساعدك في حل مسائل جديدة. Understand why, not just how.',
      color: TIP_COLORS[1],
    },
    {
      icon: TIP_ICONS[2],
      titleAr: cfg.tips_card3_title || 'حل مسائل إضافية كل يوم',
      titleEn: cfg.tips_card3_title_en || 'Solve Extra Problems Daily',
      description: cfg.tips_card3_desc || 'لا تكتفي بالواجبات فقط. حل مسائل إضافية من الكتاب المدرسي لتعزيز مهاراتك. Practice beyond homework for stronger skills.',
      color: TIP_COLORS[2],
    },
    {
      icon: TIP_ICONS[3],
      titleAr: cfg.tips_card4_title || 'لا تتردد في السؤال',
      titleEn: cfg.tips_card4_title_en || 'Never Hesitate to Ask',
      description: cfg.tips_card4_desc || 'إذا لم تفهم شيئاً اسأل فوراً. السؤال الجيد هو بداية الفهم العميق. Ask immediately when something is unclear.',
      color: TIP_COLORS[3],
    },
  ]

  function renderTipCard(tip, idx) {
    return (
      <Card
        key={tip.titleEn}
        className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-0.5 border-border/50 bg-card"
      >
        <CardContent className="p-4 sm:p-5 flex gap-4 items-start">
          {tipImages[idx] ? (
            <div className="h-11 w-11 shrink-0 rounded-lg overflow-hidden border border-border/50 relative">
              {!tipLoaded[idx] && <div className="h-full w-full animate-pulse bg-muted" />}
              <img
                src={tipImages[idx]}
                alt={tip.titleAr}
                className={"h-full w-full object-cover transition-opacity duration-300 " + (tipLoaded[idx] ? 'opacity-100' : 'opacity-0 absolute')}
                loading="eager"
                onLoad={function() { setTipLoaded(function(prev) { var n = [...prev]; n[idx] = true; return n }) }}
              />
            </div>
          ) : (
            <div
              className={"inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 " + tip.color}
            >
              <tip.icon className="h-5 w-5" />
            </div>
          )}
          <div className="space-y-1.5 min-w-0">
            <h3 className="font-semibold text-sm sm:text-base text-foreground leading-snug">
              <span className="block">{tip.titleAr}</span>
              <span className="block text-xs sm:text-sm text-muted-foreground font-normal mt-0.5">
                {tip.titleEn}
              </span>
            </h3>
            <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
              {tip.description}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <section className="py-16 sm:py-20 relative" dir="rtl">
      {/* Background image */}
      {tipsBgImage && (
        <>
          {!bgLoaded && (
            <div className="absolute inset-0 animate-pulse bg-muted/50" />
          )}
          <img
            src={tipsBgImage}
            alt=""
            className={"absolute inset-0 w-full h-full object-cover -z-10 transition-opacity duration-500 " + (bgLoaded ? 'opacity-100' : 'opacity-0')}
            loading="eager"
            fetchPriority="high"
            onLoad={function() { setBgLoaded(true) }}
          />
          <div className="absolute inset-0 -z-10 bg-muted/80" />
        </>
      )}
      {!tipsBgImage && <div className="absolute inset-0 -z-10 bg-muted/30" />}

      <div className="mx-auto max-w-5xl px-4 sm:px-6 relative z-10">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Lightbulb className="h-4 w-4" />
            <span>{cfg.tips_badge || 'نصائح للتفوّق | Tips for Excellence'}</span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
            {cfg.tips_title || 'نصائح للتفوّق في الرياضيات | Tips for Excellence'}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
            {cfg.tips_subtitle || 'نصائح ذهبية للتفوّق في الرياضيات — Golden advice for excellence in Mathematics'}
          </p>
        </div>

        {/* Two-column layout: Tips (left) + Image (right) */}
        <div className="grid grid-cols-1 lg:grid-cols-[2fr_3fr] gap-6 lg:gap-8 items-start">
          {/* Tips column - on mobile: order 2 (below), on desktop: LEFT (order 2 in RTL) */}
          <div className="order-2 lg:order-2 space-y-4">
            {tips.map(function(tip, idx) {
              return renderTipCard(tip, idx)
            })}
          </div>

          {/* Image column - on mobile: order 1 (on top), on desktop: RIGHT (order 1 in RTL) */}
          {tipsSectionImage && (
            <div className="order-1 lg:order-1">
              <div className="lg:sticky lg:top-24 relative rounded-2xl overflow-hidden shadow-xl border border-border/20">
                {!sectionImgLoaded && (
                  <div className="w-full aspect-[3/4] animate-pulse bg-muted" />
                )}
                <img
                  src={tipsSectionImage}
                  alt="نصائح مستر شريف"
                  className={"w-full aspect-[3/4] object-cover transition-opacity duration-500 " + (sectionImgLoaded ? 'opacity-100' : 'opacity-0 absolute inset-0')}
                  loading="eager"
                  onLoad={function() { setSectionImgLoaded(true) }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
