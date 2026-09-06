'use client'
// ============================================================
// VideoWatermark — ووترمارك ديناميكي باسم الطالب ورقمه الكامل فوق الفيديو
// ============================================================
// الفكرة: أي حد يسجل الفيديو (موبايل أو برنامج) اسمه ورقم هاتفه المسجل
// هيبانوا جوه التسجيل بوضوح — دي أقوى رادع عملي ضد إعادة نشر الفيديوهات.
// - واضح (مش شفاف): الطبقة المائية 26% + السطر المتحرك شبه معتم
// - الرقم الكامل المسجل به (مش مقطع ولا مقنع)
// - 3 طبقات: تيل متكرر + سطر متحرك بين الأركان كل 14 ثانية
// - pointer-events-none فمش بيمنع أي تفاعل مع الفيديو
// - بيرجع يترسم كل 6 ثواني لو حد شاله من الـ DOM بالـ devtools
// ============================================================
import { useEffect, useRef, useState } from 'react'

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    // حركة السطر المتحرك
    const moveTimer = setInterval(function () { setTick(function (t) { return t + 1 }) }, 14000)
    // إعادة رسم لو حد شال الطبقة من الـ DOM
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(moveTimer); clearInterval(healTimer) }
  }, [])

  // الرقم الكامل اللي الطالب متسجل بيه (بدون تمويه) — عشان يبان في أي تسجيل شاشة
  const label = [name || 'طالب', phone || ''].filter(Boolean).join(' • ')
  if (!label) return null

  // الأركان اللي بيلف عليها السطر
  const corners = [
    { top: '8%', left: '6%' },
    { top: '8%', right: '6%' },
    { bottom: '14%', left: '6%' },
    { bottom: '14%', right: '6%' },
  ]
  const pos = corners[tick % corners.length]
  const svgTile = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="190">' +
      '<text x="14" y="95" font-size="18" font-weight="bold" fill="rgba(255,255,255,0.26)" transform="rotate(-18 160 95)" font-family="sans-serif">' +
        label.replace(/&/g, '&amp;').replace(/</g, '&lt;') +
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
      <div
        className="absolute text-xs sm:text-sm font-bold text-white px-2.5 py-1 rounded"
        style={{
          ...pos,
          textShadow: '0 1px 4px rgba(0,0,0,0.95), 0 0 2px rgba(0,0,0,0.9)',
          background: 'rgba(0,0,0,0.38)',
          transition: 'all 700ms ease',
          direction: 'rtl',
        }}
      >
        {label}
      </div>
    </div>
  )
}
