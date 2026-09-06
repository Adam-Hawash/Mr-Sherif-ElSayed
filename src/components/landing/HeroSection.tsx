'use client'

import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import { useEffect, useState } from 'react'
import { Users, BookOpen, Clock, CalendarClock, LogIn, UserPlus, Sparkles } from 'lucide-react'

export default function HeroSection() {
  const {
    setView,
    siteConfig,
    setSiteConfig,
    configLoaded,
    stats,
  } = useAppStore()

  const [fallbackPhotoExists, setFallbackPhotoExists] = useState(false)

  var initialCfg = (typeof window !== 'undefined' && (window as any).__INITIAL_CONFIG__) || {}
  var cfg = configLoaded ? siteConfig : (Object.keys(siteConfig).length > 0 ? siteConfig : initialCfg)

  useEffect(() => {
    if (!configLoaded && Object.keys(siteConfig).length === 0) {
      fetch('/api/config')
        .then((r) => r.json())
        .then((data) => {
          setSiteConfig(data)
          useAppStore.getState().setConfigLoaded(true)
        })
        .catch(() => {})
    }
  }, [configLoaded, setSiteConfig, siteConfig])

  useEffect(() => {
    var hasDbPhoto = !!(siteConfig.instructor_photo || '')
    if (!hasDbPhoto) {
      var img2 = new Image()
      img2.onload = function () { setFallbackPhotoExists(true) }
      img2.onerror = function () { setFallbackPhotoExists(false) }
      img2.src = '/images/instructor.png'
    } else {
      setFallbackPhotoExists(false)
    }
  }, [siteConfig.instructor_photo])

  const dbPhoto = cfg.instructor_photo || ''
  const heroPhoto = dbPhoto || '/images/instructor.png'
  const showPhoto = !!dbPhoto || fallbackPhotoExists

  return (
    <section className="relative overflow-hidden bg-[#12121F]" dir="rtl">
      {/* ===== Background decor: glows + math symbols + glossy dots ===== */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-0" aria-hidden="true">
        {/* Ambient orange orbs (اللمعة) */}
        <div className="absolute -top-24 -right-24 w-[420px] h-[420px] rounded-full orange-orb opacity-70" />
        <div className="absolute bottom-0 -left-32 w-[380px] h-[380px] rounded-full orange-orb opacity-40" />
        <div className="absolute top-1/3 left-1/2 w-[260px] h-[260px] rounded-full orange-orb opacity-20" />

        {/* Faint math symbols */}
        <div className="absolute text-[110px] font-bold text-[#F97316]/[0.07] leading-none select-none" style={{ top: '6%', right: '4%' }}>√</div>
        <div className="absolute text-[85px] font-bold text-white/[0.05] leading-none select-none" style={{ top: '14%', left: '8%' }}>π</div>
        <div className="absolute text-[95px] font-bold text-[#F97316]/[0.06] leading-none select-none" style={{ top: '52%', left: '4%' }}>∑</div>
        <div className="absolute text-[75px] font-bold text-white/[0.05] leading-none select-none" style={{ top: '66%', right: '8%' }}>∫</div>
        <div className="absolute text-[65px] font-bold text-[#F97316]/[0.06] leading-none select-none" style={{ top: '86%', left: '16%' }}>∞</div>
        <div className="absolute text-[55px] font-bold text-white/[0.05] leading-none select-none" style={{ top: '24%', right: '42%' }}>a²</div>
        <div className="absolute text-[52px] font-bold text-[#F97316]/[0.05] leading-none select-none" style={{ top: '72%', left: '42%' }}>b²</div>
        <div className="absolute text-[60px] font-bold text-white/[0.05] leading-none select-none" style={{ top: '40%', right: '6%' }}>Δ</div>
        <div className="absolute text-[70px] font-bold text-[#F97316]/[0.05] leading-none select-none" style={{ top: '82%', right: '30%' }}>÷</div>
        <div className="absolute text-[58px] font-bold text-white/[0.05] leading-none select-none" style={{ top: '10%', left: '32%' }}>θ</div>

        {/* Floating glossy dots (orange family — clean & consistent) */}
        <div className="hero-dot hero-dot-1 w-1.5 h-1.5 rounded-full" style={{ top: '9%', right: '14%', background: '#FB923C', boxShadow: '0 0 8px #F97316' }} />
        <div className="hero-dot hero-dot-2 w-1 h-1 rounded-full" style={{ top: '13%', left: '24%', background: '#FDBA74', boxShadow: '0 0 6px #FB923C' }} />
        <div className="hero-dot hero-dot-3 w-1 h-1 rounded-full" style={{ top: '21%', right: '40%', background: '#F97316', boxShadow: '0 0 8px #EA580C' }} />
        <div className="hero-dot hero-dot-4 w-1.5 h-1.5 rounded-full" style={{ top: '6%', left: '55%', background: '#FFB25C', boxShadow: '0 0 8px #F97316' }} />
        <div className="hero-dot hero-dot-5 w-1 h-1 rounded-full" style={{ top: '29%', right: '7%', background: '#FB923C', boxShadow: '0 0 6px #F97316' }} />
        <div className="hero-dot hero-dot-6 w-1 h-1 rounded-full" style={{ top: '33%', left: '14%', background: '#FDBA74', boxShadow: '0 0 6px #FB923C' }} />
        <div className="hero-dot hero-dot-7 w-1.5 h-1.5 rounded-full" style={{ top: '39%', right: '34%', background: '#F97316', boxShadow: '0 0 8px #EA580C' }} />
        <div className="hero-dot hero-dot-8 w-1 h-1 rounded-full" style={{ top: '26%', left: '46%', background: '#FFB25C', boxShadow: '0 0 6px #F97316' }} />
        <div className="hero-dot hero-dot-1 w-1 h-1 rounded-full" style={{ top: '49%', left: '7%', background: '#FB923C', boxShadow: '0 0 6px #F97316' }} />
        <div className="hero-dot hero-dot-3 w-1.5 h-1.5 rounded-full" style={{ top: '53%', right: '19%', background: '#F97316', boxShadow: '0 0 8px #EA580C' }} />
        <div className="hero-dot hero-dot-5 w-1 h-1 rounded-full" style={{ top: '46%', left: '56%', background: '#FDBA74', boxShadow: '0 0 6px #FB923C' }} />
        <div className="hero-dot hero-dot-2 w-1 h-1 rounded-full" style={{ top: '66%', right: '9%', background: '#FFB25C', boxShadow: '0 0 6px #F97316' }} />
        <div className="hero-dot hero-dot-4 w-1.5 h-1.5 rounded-full" style={{ top: '71%', left: '20%', background: '#FB923C', boxShadow: '0 0 8px #EA580C' }} />
        <div className="hero-dot hero-dot-6 w-1 h-1 rounded-full" style={{ top: '76%', right: '31%', background: '#FDBA74', boxShadow: '0 0 6px #FB923C' }} />
        <div className="hero-dot hero-dot-8 w-1 h-1 rounded-full" style={{ top: '63%', left: '45%', background: '#F97316', boxShadow: '0 0 6px #EA580C' }} />
        <div className="hero-dot hero-dot-7 w-1.5 h-1.5 rounded-full" style={{ top: '89%', right: '14%', background: '#FB923C', boxShadow: '0 0 8px #F97316' }} />
        <div className="hero-dot hero-dot-1 w-1 h-1 rounded-full" style={{ top: '93%', left: '35%', background: '#FFB25C', boxShadow: '0 0 6px #FB923C' }} />
      </div>

      {/* Optional banner image at top (from admin) */}
      {!!(cfg.hero_bg_image || '') && (
        <div className="relative w-full z-[1]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={cfg.hero_bg_image}
            alt="منصة مستر شريف السيد"
            className="w-full h-auto max-h-[360px] object-cover object-center"
          />
        </div>
      )}

      <div className="relative z-[2] mx-auto max-w-7xl px-4 sm:px-6 py-10 sm:py-14 lg:py-16">
        <div className="grid gap-12 lg:grid-cols-2 lg:items-center">
          {/* ===== Text content (right side in RTL) ===== */}
          <div className="space-y-6 text-center lg:text-right order-2 lg:order-1">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 rounded-full glass-card px-4 py-2 text-sm font-medium text-[#FFD9B8] border border-[#F97316]/25 shadow-[0_0_20px_rgba(249,115,22,0.12)]">
              <Sparkles className="h-4 w-4 text-[#FB923C]" />
              <span>
                {cfg.hero_badge || '🎓 تعلّم الرياضيات بطريقة عامة وممتعة!'}
              </span>
            </div>

            {/* Title — glossy orange */}
            <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl lg:text-7xl text-white leading-[1.15]">
              <span className="block shine-text drop-shadow-[0_4px_24px_rgba(249,115,22,0.35)]">
                {cfg.hero_title_line1 || 'مستر شريف السيد'}
              </span>
              <span className="block mt-2 text-xl sm:text-2xl lg:text-3xl font-semibold text-white/75">
                {cfg.hero_title_line2 || 'منصة الرياضيات المتكاملة'}
              </span>
            </h1>

            {/* Subtitle */}
            <p className="max-w-xl text-white/75 text-base sm:text-lg leading-relaxed lg:mx-0 mx-auto">
              {cfg.hero_subtitle ||
                'مدرس رياضيات، بشرحلك الماث بطريقة هتفهمها من أول مرة — شرح سهل، أفكار ذكية، وواجبات وامتحانات على طول.'}
            </p>

            {/* CTA Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center lg:justify-start pt-1">
              <Button
                size="lg"
                className="gloss-btn text-base px-8 py-6 min-h-[52px] text-white font-bold rounded-2xl border-0"
                onClick={() => setView('auth-login')}
              >
                <LogIn className="h-5 w-5 ml-2" />
                ادخل لحسابك دلوقتي
              </Button>
              <Button
                variant="outline"
                size="lg"
                className="text-base px-8 py-6 min-h-[52px] border-[#F97316]/45 text-[#FDBA74] hover:bg-[#F97316]/10 hover:text-[#FDBA74] hover:border-[#F97316]/70 transition-all duration-200 rounded-2xl bg-white/[0.03]"
                onClick={() => setView('auth-register')}
              >
                <UserPlus className="h-5 w-5 ml-2" />
                اعمل حساب جديد
              </Button>
            </div>

            {/* Schedule Button - مواعيد السنتر */}
            <div className="pt-1 flex justify-center lg:justify-start">
              <Button
                variant="outline"
                size="lg"
                className="text-sm px-6 py-4 min-h-[44px] border-white/12 bg-white/5 hover:bg-white/10 text-white/85 font-medium rounded-xl transition-colors duration-200 gap-2"
                onClick={() => window.location.href = '/schedule'}
              >
                <CalendarClock className="h-4 w-4" />
                مواعيد السنتر
              </Button>
            </div>

            {/* Hero Developer / Adam Hawash branding */}
            <div className="pt-3 flex flex-col items-center lg:items-start gap-1">
              <a
                href={cfg.hero_developer_url || 'https://prime-developer-portfolio-11.vercel.app'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold text-white/55 hover:text-[#FB923C] transition-colors"
              >
                {cfg.hero_developer_label || 'Hero Developer'}
              </a>
              <div className="h-px w-16 bg-white/10" />
              <a
                href={cfg.hero_developer_url || 'https://prime-developer-portfolio-11.vercel.app'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-white/35 font-light tracking-wider hover:text-[#FB923C] transition-colors"
              >
                {cfg.footer_made_by_label || 'Made by Adam Hawash'}
              </a>
            </div>

            {/* Stats Row */}
            <div className="flex items-center justify-center lg:justify-start gap-8 pt-5">
              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <BookOpen className="h-4 w-4 text-[#FB923C]/70" />
                  <p className="text-2xl font-bold shine-text">
                    {stats?.totalVideos
                      ? stats.totalVideos
                      : cfg.hero_stat1_value || '100+'}
                  </p>
                </div>
                <p className="text-xs text-white/60">
                  {cfg.hero_stat1_label || 'درس فيديو'}
                </p>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Users className="h-4 w-4 text-[#FB923C]/70" />
                  <p className="text-2xl font-bold shine-text">
                    {stats?.approvedStudents
                      ? stats.approvedStudents
                      : cfg.hero_stat2_value || '500+'}
                  </p>
                </div>
                <p className="text-xs text-white/60">
                  {cfg.hero_stat2_label || 'طالب'}
                </p>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div className="text-center">
                <div className="flex items-center justify-center gap-1.5 mb-1">
                  <Clock className="h-4 w-4 text-[#FB923C]/70" />
                  <p className="text-2xl font-bold shine-text">
                    {cfg.hero_stat3_value || '24/7'}
                  </p>
                </div>
                <p className="text-xs text-white/60">
                  {cfg.hero_stat3_label || 'متابعة'}
                </p>
              </div>
            </div>
          </div>

          {/* ===== Instructor photo — big glossy circle with orange crescent (left side) ===== */}
          <div className="flex justify-center lg:justify-end order-1 lg:order-2 -mt-2 sm:-mt-6">
            <div className="relative group">
              {/* Outer rotating dashed ring */}
              <div className="absolute -inset-5 sm:-inset-7 rounded-full border-2 border-dashed border-[#F97316]/30 spin-slow pointer-events-none" />

              {/* Orange crescent (زي الصورة المرجعية) */}
              <div className="absolute w-[92%] h-[92%] rounded-full bg-gradient-to-br from-[#FB923C] via-[#F97316] to-[#EA580C] translate-x-6 translate-y-8 sm:translate-x-8 sm:translate-y-10 shadow-[0_20px_60px_rgba(249,115,22,0.4)]" />

              {/* Soft glow behind everything */}
              <div className="absolute -inset-10 bg-gradient-to-br from-[#F97316]/25 via-[#F97316]/10 to-transparent blur-3xl transition-opacity duration-500 group-hover:opacity-100 opacity-80 pointer-events-none" />

              {/* The circular photo */}
              <div className="relative w-64 h-64 sm:w-80 sm:h-80 lg:w-[380px] lg:h-[380px] rounded-full overflow-hidden border-4 border-white/90 gold-glow bg-[#1B1B30] shadow-2xl float-soft">
                {showPhoto ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={heroPhoto}
                    alt={cfg.instructor_name || 'مستر شريف السيد'}
                    className="w-full h-full object-cover"
                    style={{ objectPosition: '50% 20%' }}
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-[#F97316]/40 bg-gradient-to-br from-[#1B1B30] to-[#12121F]">
                    <Sparkles className="h-24 w-24" />
                  </div>
                )}
                {/* Subtle glossy top-light */}
                <div className="absolute inset-0 bg-gradient-to-t from-[#12121F]/35 via-transparent to-white/10 pointer-events-none" />
              </div>

              {/* Name badge overlay — English name under the photo */}
              <div className="absolute -bottom-4 left-1/2 -translate-x-1/2 bg-[#12121F] border border-[#F97316]/45 rounded-full px-6 py-2.5 shadow-[0_8px_30px_rgba(0,0,0,0.45),0_0_24px_rgba(249,115,22,0.25)]">
                <p className="shine-text font-extrabold text-base sm:text-lg tracking-wide whitespace-nowrap" dir="ltr">
                  {cfg.instructor_name_en || 'MR. Sherif ElSayed'}
                </p>
              </div>

              {/* Floating mini math chips around the photo */}
              <div className="absolute top-4 -left-2 sm:-left-6 glass-card rounded-xl px-3 py-1.5 text-[#FDBA74] text-sm font-bold shadow-lg float-soft" style={{ animationDelay: '0.8s' }}>π</div>
              <div className="absolute bottom-10 -right-3 sm:-right-7 glass-card rounded-xl px-3 py-1.5 text-[#FDBA74] text-sm font-bold shadow-lg float-soft" style={{ animationDelay: '1.6s' }}>√x</div>
              <div className="absolute top-1/2 -right-4 sm:-right-8 glass-card rounded-xl px-2.5 py-1.5 text-[#FDBA74] text-xs font-bold shadow-lg float-soft" style={{ animationDelay: '2.4s' }}>2²=4</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom edge fade into next section */}
      <div className="relative h-10 z-[2]" aria-hidden="true">
        <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-background/90 to-transparent" />
      </div>
    </section>
  )
}
