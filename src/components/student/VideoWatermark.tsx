'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (رقم الطالب المسجل + اسمه)
// ============================================================
// طلب المستر (التحديث الأخير):
//  1) التيل المتكرر بقى **أسود شفاف** بحواف بيضاء خفيفة — واضح على أي خلفية.
//  2) الكارت المتحرك (اسم + رقم) بقى أكبر وأوضح — أسود شفاف كأنه كارت.
//  3) الكارت بيطير على **الحواف بس** — ممنوع يقف في نص الشاشة أبدًا،
//     وبيتحرك حركة ناعمة بطيئة (شوية وشوية) كل 14 ثانية.
//  4) الاسم الطويل بناخد منه أول اسمين بس عشان يبان كامل.
//  5) بيفضل ظاهر في وضع ملء الشاشة — المكون جوه عنصر الـ fullscreen نفسه.
//  6) رقم الطالب المسجل بيه هو الأول والأبرز.
// - pointer-events-none فمش بيمنع أي تفاعل مع الفيديو
// - بيرجع يترسم كل 6 ثواني لو حد شاله من الـ DOM بالـ devtools
// ============================================================
import { useEffect, useRef, useState } from 'react'

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    // حركة الكارت على الحواف — بطيئة وناعمة
    const moveTimer = setInterval(function () { setTick(function (t) { return t + 1 }) }, 14000)
    // إعادة رسم لو حد شال الطبقة من الـ DOM
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(moveTimer); clearInterval(healTimer) }
  }, [])

  // الرقم المسجل بيه الطالب هو المهم — بنقدمه الأول وبأبرز شكل
  // طلب المستر: الاسم الطويل ناخد أول اسمين بس — الرقم والاسم يبانوا كاملين
  const num = (phone || '').trim()
  const nm = (name || '').trim().split(/\s+/).slice(0, 2).join(' ')
  if (!num && !nm) return null
  const tileLabel = [nm, num].filter(Boolean).join(' • ')

  // مواضع على الحواف بس — top-center وحسنا لأنه حافة، وممنوع المنتصف خالص
  const spots = [
    { top: '3.5%', left: '3%' },
    { top: '3.5%', left: '55%', tx: '-50%' },
    { top: '3.5%', left: '97%', tx: '-100%' },
    { top: '72%', left: '97%', tx: '-100%' },
    { top: '78%', left: '50%', tx: '-50%' },
    { top: '72%', left: '3%' },
  ]
  const raw = spots[tick % spots.length]
  const pos: Record<string, string> = { top: raw.top, left: raw.left }
  const transform = 'translateX(' + (raw.tx || '0%') + ')'

  // تيل متكرر أسود شفاف بحواف بيضاء — طلب المستر
  const esc = function (s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  const svgTile = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="500" height="300">' +
      '<text x="24" y="150" font-size="14" font-weight="bold" fill="rgba(0,0,0,0.75)" stroke="rgba(255,255,255,0.8)" stroke-width="1.8" paint-order="stroke" transform="rotate(-18 250 150)" font-family="sans-serif">' +
        esc(tileLabel) +
      '</text>' +
    '</svg>'
  )

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
      style={{ backgroundImage: 'url("data:image/svg+xml,' + svgTile + '")' }}
      aria-hidden="true"
    >
      {/* الكارت الطائر — أسود شفاف + حدود بيضاء خفيفة، بيتحرك على الحواف بس */}
      <div
        className="absolute rounded-2xl text-center"
        style={{
          ...pos,
          transform,
          transition: 'top 1.6s cubic-bezier(.45,0,.25,1), left 1.6s cubic-bezier(.45,0,.25,1), transform 1.6s cubic-bezier(.45,0,.25,1)',
          direction: 'rtl',
          background: 'rgba(0,0,0,0.58)',
          border: '1.5px solid rgba(255,255,255,0.30)',
          boxShadow: '0 6px 22px rgba(0,0,0,0.5)',
          padding: '9px 16px',
          maxWidth: '56%',
        }}
      >
        {num && (
          <p
            className="text-[15px] sm:text-base font-black text-white leading-tight"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)', direction: 'ltr', unicodeBidi: 'plaintext' }}
          >
            {num}
          </p>
        )}
        {nm && (
          <p className="text-[11px] sm:text-xs font-bold text-white/95 leading-snug max-w-[170px] sm:max-w-[190px] truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            {nm}
          </p>
        )}
      </div>
    </div>
  )
}
