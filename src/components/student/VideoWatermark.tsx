'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه كامل + رقمه)
// ============================================================
// مواصفات المستر النهائية:
//  1) أسود بالكامل — شِپات + كارت + ووترمارك كبير، كلهم أسود شفاف.
//  2) 6 شِپات على الحواف كلها (فوق وتحت: أركان + منتصفات) بتدور دورة
//     ناعمة مستمرة (الجري) + تعويم خفيف دايمًا.
//  3) ووترمارك كبير في نص الخلفية: شفاف بحواف سودة وبالعرض —
//     محتوى الفيديو يبان تحته عادي.
//  4) كارت طائر أسود فيه الاسم الكامل + الرقم — بينط على الحواف بس،
//     ممنوع يقف في نص الشاشة أبدًا.
//  5) الاسم كامل 100% من غير قص أي حرف — DOM حقيقي فالحروف العربية
//     متوصلة وسليمة (الصورة القديمة كانت بتقطع الحروف).
//  6) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  7) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  8) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحده كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

var WM_SPOTS = [
  { t: '3%', l: '2.5%', tx: '0%', rot: -9 },
  { t: '3%', l: '50%', tx: '-50%', rot: 7 },
  { t: '3%', l: '97.5%', tx: '-100%', rot: -7 },
  { t: '91%', l: '2.5%', tx: '0%', rot: 7 },
  { t: '91%', l: '50%', tx: '-50%', rot: -9 },
  { t: '91%', l: '97.5%', tx: '-100%', rot: 9 },
]

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    // الجري المستمر: الشِپات بتدور على الحواف + إعادة رسم لو حد شال الطبقة
    const moveTimer = setInterval(function () { setTick(function (t) { return t + 1 }) }, 9000)
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(moveTimer); clearInterval(healTimer) }
  }, [])

  const num = (phone || '').trim()
  const nm = (name || '').trim()
  if (!num && !nm) return null
  const chipText = [num, nm].filter(Boolean).join(' • ')

  function applySpot(el: HTMLDivElement | null, p: { t: string; l: string; tx: string; rot: number }) {
    if (!el) return
    el.style.top = p.t
    el.style.left = p.l
    el.style.transform = 'translateX(' + p.tx + ') rotate(' + p.rot + 'deg)'
  }

  // الشِپات بتدور دورة: كل شِپ ياخد مكان اللي بعده — الكل على الحواف بس
  const chipSpot = function (i: number) { return WM_SPOTS[(i + tick) % WM_SPOTS.length] }
  const badgeSpot = WM_SPOTS[(tick * 2 + 3) % WM_SPOTS.length]

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        @keyframes wmFloat2 { 0% { transform: translateY(0) } 100% { transform: translateY(-7px) } }
        .wm-chip-in { animation: wmFloat2 4.6s ease-in-out infinite alternate; }
        .wm-chip-in:nth-child(odd) { animation-duration: 5.8s; animation-delay: -2.4s; }
        @media (max-width: 640px) { .wm-chip-in { font-size: 9px !important; padding: 2px 9px !important; } }
      `}</style>

      {/* الووترمارك الكبير في نص الخلفية — شفاف بحواف سودة وبالعرض */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-center font-black leading-tight"
        style={{
          direction: 'rtl',
          maxWidth: '92%',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          fontSize: 'clamp(26px, 6.5vw, 76px)',
          color: 'rgba(0,0,0,0.17)',
          WebkitTextStroke: '1.6px rgba(0,0,0,0.42)',
          unicodeBidi: 'plaintext',
        }}
      >
        {nm || num}
        {nm && num && (
          <span
            className="block font-extrabold"
            style={{ fontSize: '0.38em', letterSpacing: '0.05em', direction: 'ltr', WebkitTextStroke: '1.1px rgba(0,0,0,0.38)' }}
          >
            {num}
          </span>
        )}
      </div>

      {/* 6 شِپات على الحواف — بتتقلب أماكنها بحركة ناعمة مستمرة */}
      {WM_SPOTS.map(function (_s, i) {
        var spot = chipSpot(i)
        return (
          <div
            key={i}
            ref={function (el) { applySpot(el, spot) }}
            className="absolute transition-all duration-[3200ms] ease-in-out"
            style={{ transitionProperty: 'top, left, transform', transitionTimingFunction: 'cubic-bezier(.45,0,.25,1)' }}
          >
            <span
              className="wm-chip-in inline-block rounded-full font-bold text-white/95"
              style={{
                direction: 'rtl',
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.20)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: 0,
                padding: '3px 11px',
                whiteSpace: 'nowrap',
                maxWidth: '46vw',
                overflow: 'hidden',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
              }}
            >
              {chipText}
            </span>
          </div>
        )
      })}

      {/* الكارت الطائر — الاسم كامل + الرقم — على الحواف بس */}
      <div
        ref={function (el) { applySpot(el, badgeSpot) }}
        className="absolute rounded-xl text-center transition-all duration-[3200ms] ease-in-out"
        style={{
          direction: 'rtl',
          background: 'rgba(0,0,0,0.62)',
          border: '1.5px solid rgba(255,255,255,0.22)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.55)',
          padding: '9px 16px',
          maxWidth: '58%',
          transitionProperty: 'top, left, transform',
          transitionTimingFunction: 'cubic-bezier(.45,0,.25,1)',
        }}
      >
        {num && (
          <p className="text-base font-black text-white leading-tight" style={{ direction: 'ltr', unicodeBidi: 'plaintext', textShadow: '0 1px 3px rgba(0,0,0,0.95)' }}>
            {num}
          </p>
        )}
        {nm && (
          <p
            className="text-xs font-bold text-white/95 leading-snug break-words"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)', letterSpacing: 0, maxWidth: 240, whiteSpace: 'normal' }}
          >
            {nm}
          </p>
        )}
      </div>
    </div>
  )
}
