'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (رقم الطالب المسجل + اسمه)
// ============================================================
// طلب المستر:
//  1) الووترمارك تبقى واضحة على أي خلفية — حتى السبورة البيضاء.
//     الحل: النص أبيض بحدود سوداء سميكة (outline) → على خلفية بيضاء يبان
//     الحد الأسود، وعلى خلفية غامقة يبان النص الأبيض. مقروء دايمًا في أي
//     تسجيل شاشة. + رفعنا وضوح الطبقة (كانت 26% → دلوقتي 55%).
//  2) تفضل ظاهرة في وضع ملء الشاشة — المكون ده بيتحط جوه عنصر الـ
//     fullscreen نفسه في المشغّلين (YouTube + الملفات المرفوعة).
//  3) رقم الطالب اللي متسجل بيه هو الأول والأبرز (مش اسمه بس).
// - 3 طبقات: تيل متكرر + شريط متحرك بين الأركان كل 14 ثانية
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

  // تيل متكرر: نص أبيض بحد سوداء سميك → مقروء على أي خلفية (سبورة بيضاء/شاشة غامقة)
  // paint-order:stroke يخلي الحدود ترسم ورا النص فالشكل يفضل نضيف
  const esc = function (s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') }
  const svgTile = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="340" height="200">' +
      '<text x="14" y="100" font-size="19" font-weight="bold" fill="rgba(255,255,255,0.55)" stroke="rgba(0,0,0,0.55)" stroke-width="2.6" paint-order="stroke" transform="rotate(-18 170 100)" font-family="sans-serif">' +
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
        className="absolute px-3 py-1.5 rounded-lg text-center"
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
            className="text-sm sm:text-base font-extrabold text-white leading-tight"
            style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)', direction: 'ltr', unicodeBidi: 'plaintext' }}
          >
            {num}
          </p>
        )}
        {nm && (
          <p className="text-[10px] sm:text-xs font-bold text-white/90 leading-tight" style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}>
            {nm}
          </p>
        )}
      </div>
    </div>
  )
}
