'use client'

import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useAppStore } from '@/stores/app-store'
import {
  BookOpen,
  Video,
  ClipboardList,
  FileText,
  Layers,
  Trophy,
  Compass,
} from 'lucide-react'

var GUIDE_ICONS = [BookOpen, Video, ClipboardList, FileText, Layers, Trophy]
var GUIDE_COLORS = [
  'bg-[#EA580C]/10 text-[#EA580C] dark:bg-[#EA580C]/15 dark:text-[#FB923C]',
  'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
  'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
  'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
  'bg-sky-500/10 text-sky-600 dark:bg-sky-500/15 dark:text-sky-400',
  'bg-violet-500/10 text-violet-600 dark:bg-violet-500/15 dark:text-violet-400',
]

export default function FeaturesGuideSection() {
  var { siteConfig } = useAppStore()
  var cfg = siteConfig

  var cards = [
    {
      icon: GUIDE_ICONS[0],
      titleAr: cfg.guide_card1_title || 'تسجيل حسابك',
      titleEn: cfg.guide_card1_title_en || 'Register',
      description: cfg.guide_card1_desc || 'أنشئ حسابك في المنصة بسرعة وسهولة. اختر صفّك الدراسي وابدأ رحلتك التعليمية فوراً. Create your account quickly and start learning.',
      color: GUIDE_COLORS[0],
    },
    {
      icon: GUIDE_ICONS[1],
      titleAr: cfg.guide_card2_title || 'مشاهدة الدروس',
      titleEn: cfg.guide_card2_title_en || 'Watch Lessons',
      description: cfg.guide_card2_desc || 'تابع شروحات مبسّطة ومتسلسلة لكل درس رياضيات بأسلوب تفاعلي يجعل الفهم أسهل. Watch simplified, step-by-step video lessons.',
      color: GUIDE_COLORS[1],
    },
    {
      icon: GUIDE_ICONS[2],
      titleAr: cfg.guide_card3_title || 'حل الواجبات',
      titleEn: cfg.guide_card3_title_en || 'Homework',
      description: cfg.guide_card3_desc || 'أكمل واجباتك الأسبوعية وحلّ التمارين لتثبيت المعلومات واختبار فهمك. Complete weekly homework to reinforce your learning.',
      color: GUIDE_COLORS[2],
    },
    {
      icon: GUIDE_ICONS[3],
      titleAr: cfg.guide_card4_title || 'أداء الامتحانات',
      titleEn: cfg.guide_card4_title_en || 'Take Exams',
      description: cfg.guide_card4_desc || 'شارك في الامتحانات الدورية لمتابعة مستواك والاستعداد للامتحانات النهائية. Take periodic exams to track your progress.',
      color: GUIDE_COLORS[3],
    },
    {
      icon: GUIDE_ICONS[4],
      titleAr: cfg.guide_card5_title || 'بطاقات تعليمية',
      titleEn: cfg.guide_card5_title_en || 'Flashcards',
      description: cfg.guide_card5_desc || 'استخدم البطاقات التعليمية لمراجعة المصطلحات والقوانين الرياضية بشكل سريع. Review formulas and terms with flashcards.',
      color: GUIDE_COLORS[4],
    },
    {
      icon: GUIDE_ICONS[5],
      titleAr: cfg.guide_card6_title || 'تحديات ومسابقات',
      titleEn: cfg.guide_card6_title_en || 'Challenges',
      description: cfg.guide_card6_desc || 'تنافس مع زملائك في تحديات رياضية ممتعة واربح مراكز متقدمة. Compete in fun math challenges with your classmates.',
      color: GUIDE_COLORS[5],
    },
  ]

  return (
    <section className="py-16 sm:py-20 bg-muted/30" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Section Header */}
        <div className="text-center mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Compass className="h-4 w-4" />
            <span>{cfg.guide_badge || 'دليلك التعليمي | Learning Guide'}</span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
            {cfg.guide_title || 'كيف تستخدم المنصة؟ | How to Use the Platform'}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
            {cfg.guide_subtitle || 'ست خطوات بسيطة تبدأ بيهم رحلتك معانا في المنصة'}
          </p>
        </div>

        {/* Cards Grid */}
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(function(card, index) {
            return (
              <Card
                key={card.titleEn}
                className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50 bg-card"
              >
                <CardContent className="p-6 space-y-4">
                  {/* Step Number + Icon */}
                  <div className="flex items-center gap-3">
                    <div
                      className={"inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-lg transition-transform duration-300 group-hover:scale-110 " + card.color}
                    >
                      <card.icon className="h-6 w-6" />
                    </div>
                    <Badge
                      variant="secondary"
                      className="text-xs font-medium"
                    >
                      {String(index + 1).padStart(2, '0')}
                    </Badge>
                  </div>

                  {/* Title */}
                  <h3 className="font-semibold text-base leading-snug text-foreground">
                    <span className="block">{card.titleAr}</span>
                    <span className="block text-sm text-muted-foreground font-normal mt-0.5">
                      {card.titleEn}
                    </span>
                  </h3>

                  {/* Description */}
                  <p className="text-sm text-muted-foreground leading-relaxed">
                    {card.description}
                  </p>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
