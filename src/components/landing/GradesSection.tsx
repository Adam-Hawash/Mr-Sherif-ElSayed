'use client'

import { Card, CardContent } from '@/components/ui/card'
import { useAppStore, gradesFromConfig } from '@/stores/app-store'
import { toast } from 'sonner'

/* (ز15) fallback للأيقونات والأسماء الإنجليزية للصفوف القديمة اللي مش
   متسجلة في الكونفج — الجديد بييجي من grades_data بتاعة لوحة الأدمن */
var gradeIcons: Record<string, string> = {
  'الصف السادس الابتدائي': 'G6',
  'أولى إعدادي': '1',
  'تانية إعدادي': '2',
  'تالتة إعدادي': '3',
  'أولى بكالوريا': '1B',
}

var gradeEnNames: Record<string, string> = {
  'الصف السادس الابتدائي': 'Grade 6',
  'أولى إعدادي': 'Prep 1',
  'تانية إعدادي': 'Prep 2',
  'تالتة إعدادي': 'Prep 3',
  'أولى بكالوريا': '1 Bac',
}

export function GradesSection() {
  var { siteConfig } = useAppStore()
  var cfg = siteConfig
  // (ز15) القايمة بقت ديناميكية من لوحة الأدمن (GradesSchedulePanel) —
  // المستر يضيف/يمسح/يرتب الصفوف وبتظهر هنا فورًا (زي Maths-Genius)
  var grades = gradesFromConfig(siteConfig)

  var handleGradeClick = function(gradeName: string) {
    toast.info('سجّل أولاً ثم ادخل حسابك للوصول إلى مواد ' + gradeName)
    useAppStore.getState().setShowStudentRegister(true)
  }

  return (
    <section className="py-12 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="text-center mb-12">
          <h2 className="text-2xl font-bold sm:text-3xl">{cfg.grades_title || 'السنوات الدراسية'}</h2>
          <p className="mt-3 text-muted-foreground max-w-2xl mx-auto">
            {cfg.grades_subtitle || 'اختر صفك الدراسي للوصول إلى المحتوى التعليمي المخصص لك'}
          </p>
        </div>
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
          {grades.map(function(grade) {
            return (
              <Card
                key={grade.ar}
                className="group cursor-pointer hover:shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 border-border/50"
                onClick={function() { handleGradeClick(grade.ar) }}
              >
                <CardContent className="p-4 sm:p-6 text-center space-y-3">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <span className="text-lg font-bold text-primary">
                      {grade.emoji || gradeIcons[grade.ar] || grade.short || grade.ar[0]}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <h3 className="font-semibold text-sm leading-tight">
                      {grade.ar}
                    </h3>
                    <p className="text-[11px] text-muted-foreground font-medium tracking-wide" dir="ltr">
                      {gradeEnNames[grade.ar] || grade.en}
                    </p>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      </div>
    </section>
  )
}
