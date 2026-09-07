'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه + الرقم المسجل بيه)
// ============================================================
// مواصفات المستر النهائية:
//  1) كله **أسود شفاف** — الكارت والتيل الخفيف خلفيتهم سوداء شفافة.
//  2) كارت واضح فيه اسم الطالب + الرقم المسجل بيه — بيكبر ويوضح.
//  3) الكارت **بيطير شوية وشوية** بين مواضع على **الحواف بس** —
//     ممنوع يقف في نص الشاشة أبدًا. وحواليه حركة تعويم خفيفة مستمرة.
//  4) التيل المتكرر بقى DOM حقيقي (مش صورة SVG) — عشان **الحروف العربية
//     تطلع سليمة متوصلة** (الصورة القديمة كانت بتقطع الحروف).
//  5) الاسم الطويل بناخد منه أول اسمين بس — يبان كامل بدون قص.
//  6) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  7) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  8) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحدها كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [tick, setTick] = useState(0)

  useEffect(function () {
    // حركة الكارت على الحواف — بطيئة وناعمة (شوية وشوية)
    const moveTimer = setInterval(function () { setTick(function (t) { return t + 1 }) }, 14000)
    // إعادة رسم لو حد شال الطبقة من الـ DOM
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(moveTimer); clearInterval(healTimer) }
  }, [])

  const num = (phone || '').trim()
  const nm = (name || '').trim().split(/\s+/).slice(0, 2).join(' ')
  if (!num && !nm) return null
  const tileLabel = [nm, num].filter(Boolean).join(' • ')

  // مواضع الكارت — على الحواف بس (أعلى/أسفل/أركان) — المنتصف ممنوع خالص
  const spots = [
    { top: '3.5%', left: '3%', tx: '0%' },
    { top: '3.5%', left: '97%', tx: '-100%' },
    { top: '88%', left: '97%', tx: '-100%' },
    { top: '88%', left: '3%', tx: '0%' },
    { top: '3.5%', left: '50%', tx: '-50%' },
    { top: '88%', left: '50%', tx: '-50%' },
  ]
  const raw = spots[tick % spots.length]
  const pos: Record<string, string> = { top: raw.top, left: raw.left }

  // مواضع التيل الخفيف — أربع أركان + منتصفا الضلعين (كلها حواف)
  var tiles = [
    { top: '4%', left: '50%', tx: '-50%', rot: '-14deg' },
    { top: '30%', left: '4%', tx: '0%', rot: '-14deg' },
    { top: '62%', left: '96%', tx: '-100%', rot: '-14deg' },
    { top: '92%', left: '50%', tx: '-50%', rot: '-14deg' },
  ]

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden wm-float-host"
      aria-hidden="true"
    >
      {/* حركة التعويم المستمرة — CSS خفيفة شغالة محليًا */}
      <style>{`
        @keyframes wmBob { 0% { transform: translateY(0px) } 100% { transform: translateY(-7px) } }
        .wm-bob { animation: wmBob 3.4s ease-in-out infinite alternate; }
        @keyframes wmBob2 { 0% { transform: translateY(0px) } 100% { transform: translateY(5px) } }
        .wm-bob2 { animation: wmBob2 4.1s ease-in-out infinite alternate; }
      `}</style>

      {/* التيل المتكرر — DOM حقيقي بحروف عربية سليمة، أسود شفاف.
          الـ outer للتثبيت والدوران، والـ inner لحركة التعويم المستمرة */}
      {tiles.map(function (t, i) {
        return (
          <div
            key={i}
            className="absolute"
            style={{ top: t.top, left: t.left, transform: 'translateX(' + t.tx + ') rotate(' + t.rot + ')' }}
          >
            <div
              className={'rounded-full ' + (i % 2 === 0 ? 'wm-bob' : 'wm-bob2')}
              style={{
                direction: 'rtl',
                background: 'rgba(0,0,0,0.45)',
                border: '1px solid rgba(255,255,255,0.22)',
                color: 'rgba(255,255,255,0.92)',
                fontSize: '10px',
                fontWeight: 700,
                letterSpacing: 0,
                padding: '3px 10px',
                whiteSpace: 'nowrap',
                textShadow: 'none',
                maxWidth: '46vw',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {tileLabel}
            </div>
          </div>
        )
      })}

      {/* الكارت الطائر — أسود شفاف بحدود بيضاء خفيفة، بيتحرك على الحواف.
          الـ outer بيعمل الانتقال بين المواضع، والـ inner بيعمل التعويم */}
      <div
        className="absolute"
        style={{
          ...pos,
          transform: 'translateX(' + raw.tx + ')',
          transition: 'top 1.8s cubic-bezier(.45,0,.25,1), left 1.8s cubic-bezier(.45,0,.25,1)',
        }}
      >
        <div
          className={'rounded-2xl text-center ' + (tick % 2 === 0 ? 'wm-bob' : 'wm-bob2')}
          style={{
            direction: 'rtl',
            background: 'rgba(0,0,0,0.62)',
            border: '1.5px solid rgba(255,255,255,0.32)',
            boxShadow: '0 6px 22px rgba(0,0,0,0.55)',
            padding: '10px 18px',
            maxWidth: '62vw',
          }}
        >
          {num && (
            <p
              className="text-base sm:text-lg font-black text-white leading-tight"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.95)', direction: 'ltr', unicodeBidi: 'plaintext' }}
            >
              {num}
            </p>
          )}
          {nm && (
            <p
              className="text-xs sm:text-sm font-bold text-white/95 leading-snug"
              style={{ textShadow: '0 1px 3px rgba(0,0,0,0.9)', letterSpacing: 0 }}
            >
              {nm}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
