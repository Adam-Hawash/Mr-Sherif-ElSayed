/* ============================================================
   PlatformLoader — لودر «Mr. Sherif ElSayed — الرياضيات المتكاملة» (2026-و95)
   ============================================================
   طلب المستر: شكل تحميل للمنصة برموز رياضية بالمادة بتاعتها.
   • نواة برتقالية بعلامة Σ + مدارين برموز رياضية (π √ ∞ ÷ × +) بتلفوا
   • اسم المنصة بلمعة برتقالية متحركة + تاج «الرياضيات المتكاملة»
   • 3 أنماط: full (شاشة كاملة) / inline (جوه سيكشن) / compact (صغير)
   ============================================================ */

import React from 'react'

type PlatformLoaderProps = {
  variant?: 'full' | 'inline' | 'compact'
  /** نص اختاري تحت اللودر — مثال: «جاري التحميل...» */
  label?: string
  className?: string
}

/* المدار الواحد: حلقة متقطعة + رموز بتفضل واقفة صح والحلقة بتلف */
function Orbit({ size }: { size: number }) {
  return (
    <div
      className="pl-orbit relative"
      style={{ ['--pl-size' as string]: size + 'px' } as React.CSSProperties}
      aria-hidden="true"
    >
      <span className="pl-glow" />
      <div className="pl-ring pl-r1">
        <span className="pl-sym s1"><i>π</i></span>
        <span className="pl-sym s2"><i>√</i></span>
        <span className="pl-sym s3"><i>∞</i></span>
      </div>
      <div className="pl-ring pl-r2">
        <span className="pl-sym t1"><i>÷</i></span>
        <span className="pl-sym t2"><i>×</i></span>
        <span className="pl-sym t3"><i>+</i></span>
      </div>
      <span className="pl-core">Σ</span>
    </div>
  )
}

function Wordmark() {
  return (
    <div className="text-center">
      <h1 className="pl-wordmark text-3xl sm:text-4xl font-black tracking-wide" dir="ltr">
        Mr. Sherif ElSayed
      </h1>
      <p className="mt-1 text-sm font-semibold text-[#C2410C] dark:text-[#FB923C]">
        الرياضيات المتكاملة
      </p>
    </div>
  )
}

function Dots() {
  return (
    <div className="pl-dots flex items-center justify-center gap-1.5" aria-hidden="true">
      <span /><span /><span />
    </div>
  )
}

export function PlatformLoader({ variant = 'inline', label, className }: PlatformLoaderProps) {
  const style = <PlatformLoaderStyle />

  /* ===== شاشة كاملة — بوت المنصة والصفحات المستقلة ===== */
  if (variant === 'full') {
    return (
      <>
        {style}
        <div className={'fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-8 overflow-hidden ' + (className || '')} role="status" aria-live="polite">
          {/* رموز رياضية عايمة في الخلفية */}
          <div className="pl-floaters" aria-hidden="true">
            <span className="f1">π</span><span className="f2">∑</span><span className="f3">√</span>
            <span className="f4">∞</span><span className="f5">÷</span><span className="f6">Δ</span>
          </div>
          <Orbit size={190} />
          <Wordmark />
          <div className="flex flex-col items-center gap-3">
            <Dots />
            <p className="text-muted-foreground text-sm">{label || 'جاري التحميل...'}</p>
          </div>
        </div>
      </>
    )
  }

  /* ===== سطر صغير — جوه الكروت والحالات الجانبية ===== */
  if (variant === 'compact') {
    return (
      <>
        {style}
        <div className={'flex items-center justify-center gap-3 py-6 ' + (className || '')} role="status" aria-live="polite">
          <Orbit size={48} />
          {label ? <p className="text-sm font-medium text-muted-foreground">{label}</p> : null}
        </div>
      </>
    )
  }

  /* ===== inline — بلوك جوه السيكشن ===== */
  return (
    <>
      {style}
      <div className={'flex flex-col items-center justify-center gap-5 py-14 ' + (className || '')} role="status" aria-live="polite">
        <Orbit size={130} />
        {label ? <p className="text-muted-foreground text-sm font-medium">{label}</p> : null}
        <Dots />
      </div>
    </>
  )
}

/* ===== الستايل — ذاتي بالكامل (مفيش تعديل على globals.css) ===== */
function PlatformLoaderStyle() {
  return (
    <style>{`
      .pl-orbit { width: var(--pl-size); height: var(--pl-size); }
      .pl-glow {
        position: absolute; inset: -18%; border-radius: 9999px;
        background: radial-gradient(circle, rgba(249,115,22,.22) 0%, rgba(249,115,22,0) 65%);
        animation: pl-glow-pulse 2.4s ease-in-out infinite;
      }
      .pl-ring {
        position: absolute; border-radius: 9999px;
        border: 1.5px dashed rgba(249,115,22,.4);
        animation: pl-spin 9s linear infinite;
      }
      .pl-r1 { inset: 0; }
      .pl-r2 { inset: 17%; border-color: rgba(234,88,12,.28); animation: pl-spin-rev 6.5s linear infinite; }
      /* الرموز بتقف على الحلقة، والدوران العكسي بيخليها واقفة صح دايمًا */
      .pl-sym {
        position: absolute; width: 1.9em; height: 1.9em;
        display: flex; align-items: center; justify-content: center;
        font-size: calc(var(--pl-size) * 0.11); color: #F97316;
        animation: inherit; animation-direction: reverse;
      }
      .pl-sym i { font-style: normal; font-weight: 700; line-height: 1; }
      .pl-r1 .pl-sym { color: #F97316; }
      .pl-r2 .pl-sym { color: #EA580C; font-size: calc(var(--pl-size) * 0.095); }
      .dark .pl-r2 .pl-sym { color: #FB923C; }
      .dark .pl-r1 .pl-sym { color: #FB923C; }
      .pl-sym.s1 { top: -.95em; left: calc(50% - .95em); }
      .pl-sym.s2 { top: calc(50% - .95em); right: -.95em; }
      .pl-sym.s3 { bottom: -.95em; left: calc(50% - .95em); }
      .pl-sym.t1 { top: calc(50% - .95em); left: -.95em; }
      .pl-sym.t2 { bottom: -.8em; right: -.8em; }
      .pl-sym.t3 { top: -.8em; right: -.8em; }
      .pl-core {
        position: absolute; top: 50%; left: 50%;
        width: 42%; height: 42%;
        transform: translate(-50%, -50%);
        display: flex; align-items: center; justify-content: center;
        font-size: calc(var(--pl-size) * 0.19); font-weight: 900; color: #fff;
        border-radius: 28%;
        background: linear-gradient(135deg, #FDBA74 0%, #F97316 48%, #C2410C 100%);
        box-shadow: 0 6px 22px rgba(249,115,22,.45), inset 0 1px 2px rgba(255,255,255,.55);
        text-shadow: 0 1px 3px rgba(0,0,0,.25);
        animation: pl-core-beat 2.4s ease-in-out infinite;
      }
      .pl-wordmark {
        background: linear-gradient(100deg, #C2410C 18%, #F97316 38%, #FFEDD5 50%, #F97316 62%, #C2410C 82%);
        background-size: 220% 100%;
        -webkit-background-clip: text; background-clip: text; color: transparent;
        animation: pl-shine 2.8s linear infinite;
      }
      .pl-dots span {
        width: .5rem; height: .5rem; border-radius: 9999px; background: #F97316;
        animation: pl-bob 1.1s ease-in-out infinite;
      }
      .pl-dots span:nth-child(2) { animation-delay: .16s; }
      .pl-dots span:nth-child(3) { animation-delay: .32s; }
      .pl-floaters { position: absolute; inset: 0; pointer-events: none; }
      .pl-floaters span {
        position: absolute; font-weight: 800; color: rgba(249,115,22,.13);
        animation: pl-float 7s ease-in-out infinite;
      }
      .pl-floaters .f1 { top: 12%; left: 10%; font-size: 3.4rem; }
      .pl-floaters .f2 { top: 18%; right: 12%; font-size: 4rem; animation-delay: .8s; }
      .pl-floaters .f3 { bottom: 22%; left: 14%; font-size: 3rem; animation-delay: 1.6s; }
      .pl-floaters .f4 { bottom: 14%; right: 10%; font-size: 3.8rem; animation-delay: 2.4s; }
      .pl-floaters .f5 { top: 44%; left: 4%;  font-size: 2.6rem; animation-delay: 3.2s; }
      .pl-floaters .f6 { top: 40%; right: 5%; font-size: 2.8rem; animation-delay: 4s; }
      @keyframes pl-spin { to { transform: rotate(360deg); } }
      @keyframes pl-spin-rev { to { transform: rotate(-360deg); } }
      @keyframes pl-glow-pulse { 0%, 100% { opacity: .55; transform: scale(1); } 50% { opacity: 1; transform: scale(1.08); } }
      @keyframes pl-core-beat { 0%, 100% { transform: translate(-50%,-50%) scale(1); } 50% { transform: translate(-50%,-50%) scale(1.06); } }
      @keyframes pl-shine { from { background-position: 130% 0; } to { background-position: -130% 0; } }
      @keyframes pl-bob { 0%, 100% { transform: translateY(0); opacity: .4; } 50% { transform: translateY(-6px); opacity: 1; } }
      @keyframes pl-float { 0%, 100% { transform: translateY(0) rotate(-4deg); } 50% { transform: translateY(-16px) rotate(5deg); } }
      @media (prefers-reduced-motion: reduce) {
        .pl-ring, .pl-sym, .pl-glow, .pl-core, .pl-wordmark, .pl-dots span, .pl-floaters span { animation: none !important; }
      }
    `}</style>
  )
}
