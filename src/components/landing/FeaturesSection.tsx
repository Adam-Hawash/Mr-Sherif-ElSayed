'use client'

import { useAppStore } from '@/stores/app-store'
import { Card, CardContent } from '@/components/ui/card'
import { BookOpen, Brain, Puzzle, ClipboardCheck } from 'lucide-react'

export function FeaturesSection() {
  const { siteConfig } = useAppStore()
  const cfg = siteConfig

  const features = [
    {
      icon: BookOpen,
      title: cfg.feature1_title || 'شرح مبسط | Simplified Explanations',
      description: cfg.feature1_desc || 'شرح واضح ومبسط لكل درس رياضيات بطريقة تساعد الطالب على الفهم السريع والاستيعاب العميق لمفاهيم Algebra و Geometry الأساسية.',
      color: 'bg-[#EA580C]/10 text-[#EA580C] dark:bg-[#EA580C]/15 dark:text-[#FB923C]',
    },
    {
      icon: Brain,
      title: cfg.feature2_title || 'فهم العمليات | Deep Understanding',
      description: cfg.feature2_desc || 'نركّز على فهم العمليات الرياضية من الجذور وليس الحفظ فقط، مما يبني قدرة حقيقية على حل أي مسألة في Formulas و Problem Solving.',
      color: 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400',
    },
    {
      icon: Puzzle,
      title: cfg.feature3_title || 'حل المسائل | Step-by-Step Solutions',
      description: cfg.feature3_desc || 'حل خطوة بخطوة للمسائل المعقدة مع Cheat Sheets وملخصات بصرية تسهّل الفهم والتذكّر لكل من Algebra و Trigonometry.',
      color: 'bg-amber-500/10 text-amber-600 dark:bg-amber-500/15 dark:text-amber-400',
    },
    {
      icon: ClipboardCheck,
      title: cfg.feature4_title || 'تحضير وامتحانات | Reviews & Exams',
      description: cfg.feature4_desc || 'تحضير شامل ومراجعات دورية واختبارات أسبوعية لضمان التفوّق والاستعداد الكامل للامتحانات النهائية في جميع فروع الرياضيات.',
      color: 'bg-rose-500/10 text-rose-600 dark:bg-rose-500/15 dark:text-rose-400',
    },
  ]

  return (
    <section className="py-16 sm:py-20 bg-muted/30">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold sm:text-3xl">{cfg.features_title || 'لماذا تختارنا؟ | Why Choose Us?'}</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {cfg.features_subtitle || 'نقدّم لك تجربة تعليمية فريدة تجمع بين الشرح المبسط والتطبيق العملي في Algebra, Geometry, and More'}
          </p>
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {features.map((feature) => (
            <Card
              key={feature.title}
              className="group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border-border/50"
            >
              <CardContent className="p-6 space-y-4">
                <div
                  className={`inline-flex h-12 w-12 items-center justify-center rounded-lg ${feature.color}`}
                >
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="font-semibold text-base leading-snug">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {feature.description}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </section>
  )
}
