'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (رقم الطالب المسجل + اسمه)
// ============================================================
// طلب المستر (آخر تحديث):
//  1) عدد الووترمارك أقل — مش كتير قوي (كبّرنا المسافة بين التكرارات).
//  2) الحجم أصغر — عشان ميفضهماش على الفيديو.
//  3) أهم حاجة: الاسم والرقم يبانوا **كاملين** — كبّرنا مربع التكرار
//     والخط أصغر فالاسم الطويل مش بيتقطع.
//  4) واضح على أي خلفية — أبيض بحدود سوداء (على الأبيض يبان الحد الأسود،
//     وعلى الغامق يبان النص الأبيض).
//  5) تفضل ظاهرة في وضع ملء الشاشة — المكون جوه عنصر الـ fullscreen نفسه.
//  6) رقم الطالب المسجل بيه هو الأول والأبرز.
// - تيل متكرر + شريط متحرك بين الأركان كل 14 ثانية
// - pointer-events-none فمش بيمنع أي تفاعل مع الفيديو
// - بيرجع يترسم كل 6 ثواني لو حد شاله من الـ DOM بالـ devtools
// ============================================================
import { useEffect, useRef, useState } from 'react'

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    // حركة الشريط المتحرك
    const moveTimer = setInterval(function () { setTick(function (t) { return t + 1 }) }, 14000)
    // إعادة رسم لو حد شال الطبقة من الـ DOM
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(moveTimer); clearInterval(healTimer) }
  }, [])

  // الرقم المسجل بيه الطالب هو المهم — بنقدمه الأول وبأبرز شكل
  const num = (phone || '').trim()
  const nm = (name || '').trim()
  if (!num && !nm) return null
  const tileLabel = [nm, num].filter(Boolean).join(' • ')

  // الأركان اللي بيلف عليها الشريط
  const corners = [
    { top: '8%', left: '6%' },
    { top: '8%', right: '6%' },
    { bottom: '16%', left: '6%' },
    { bottom: '16%', right: '6%' },
  ]
  const pos = corners[tick % corners.length]

  // تيل متكرر: نص أصغر (14px) في مربع أكبر (520×300) → تكرار أقل بكثير
  // + الاسم الطويل بياخد مساحة كافية فمش بيتقطع أبدًا
  const esc = function (s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  const svgTile = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="520" height="300">' +
      '<text x="26" y="150" font-size="13.5" font-weight="bold" fill="rgba(255,255,255,0.5)" stroke="rgba(0,0,0,0.5)" stroke-width="2" paint-order="stroke" transform="rotate(-18 260 150)" font-family="sans-serif">' +
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
      {/* الشريط المتحرك — رقم الطالب فوق واسمه تحته، خلفية معتمة + حدود فتبان على أي لون */}
      <div
        className="absolute px-2.5 py-1 rounded-lg text-center"
        style={{
          ...pos,
          transition: 'all 700ms ease',
          direction: 'rtl',
          background: 'rgba(0,0,0,0.62)',
          border: '1.5px solid rgba(255,255,255,0.75)',
          boxShadow: '0 2px 10px rgba(0,0,0,0.65)',
        }}
      >
        {num && (
          <p
            className="text-xs sm:text-sm font-extrabold text-white leading-tight"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)', direction: 'ltr', unicodeBidi: 'plaintext' }}
          >
            {num}
          </p>
        )}
        {nm && (
          <p className="text-[9px] sm:text-[11px] font-bold text-white/90 leading-tight max-w-[150px] sm:max-w-[180px] truncate" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            {nm}
          </p>
        )}
      </div>
    </div>
  )
}
