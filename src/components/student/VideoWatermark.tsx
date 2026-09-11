'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه + رقمه)
// ============================================================
// مواصفات المستر الجديدة (طلب حرفي 2026-ح):
//  1) **4 ووترمارك صغيرة ثابتة** ظاهرة على طول:
//     • واحدة فوق في النص
//     • اتنين في نص الفيديو: واحدة على اليمين وواحدة على الشمال
//     • واحدة تحت خالص في نص الفيديو
//  2) **الووترمارك الكبيرة الشفافة في نص الفيديو**: بتظهر **10 ثواني**
//     وبتختفي **20 ثانية** (دورة 30 ثانية — بتكرر لوحدها على طول).
//  3) الاسم من غير قص أي حرف:
//     • ممنوع letter-spacing نهائيًا (بيقطع اتصال الحروف العربية)
//     • paintOrder: 'stroke' عشان الحواف السودة متاكلش الحروف
//  4) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  5) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  6) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحده كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

/* دورة الووترمارك الكبيرة: 30 ثانية = ظاهرة 10 ثواني (0→33%) + مخفية 20 ثانية (33%→100%)
   مع انتقال ناعم بسيط عند الظهور والاختفاء */
const WM_BLINK_CSS =
  '@keyframes wmBlink30 {' +
  '0% { opacity: 0 } 1.5% { opacity: 0.5 } 31.5% { opacity: 0.5 } 33.5% { opacity: 0 } ' +
  '98.5% { opacity: 0 } 100% { opacity: 0.5 } }'

/* الكارت المشترك (الاسم الكامل + الرقم) — نفس الشكل في المواضع الأربعة */
function WmCard({ nm, num }: { nm: string; num: string }) {
  return (
    <div
      style={{
        display: 'inline-block',
        background: 'rgba(0,0,0,0.72)',
        border: '1px solid rgba(255,255,255,0.28)',
        color: '#fff',
        borderRadius: 14,
        padding: '7px 18px',
        textAlign: 'center',
        direction: 'rtl',
        boxShadow: '0 8px 26px rgba(0,0,0,0.55)',
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: 'clamp(11px, 1.5vw, 15px)',
          fontWeight: 800,
          unicodeBidi: 'plaintext',
          letterSpacing: 0,
          whiteSpace: 'nowrap',
          textShadow: '0 1px 2px rgba(0,0,0,0.8)',
        }}
      >
        {nm || num}
      </span>
      {nm && num && (
        <span
          style={{
            display: 'block',
            fontSize: 'clamp(9.5px, 1.2vw, 12px)',
            fontWeight: 700,
            direction: 'ltr',
            unicodeBidi: 'plaintext',
            letterSpacing: 0,
            opacity: 0.85,
            marginTop: 2,
          }}
        >
          {num}
        </span>
      )}
    </div>
  )
}

export function VideoWatermark({ name, phone }: { name?: string; phone?: string }) {
  const layerRef = useRef<HTMLDivElement>(null)
  const [, setTick] = useState(0)

  useEffect(function () {
    // إعادة رسم لو حد شال الطبقة من الـ DOM (حماية من التلاعب)
    const healTimer = setInterval(function () {
      if (layerRef.current && !document.body.contains(layerRef.current)) setTick(function (t) { return t + 1 })
    }, 6000)
    return function () { clearInterval(healTimer) }
  }, [])

  var num = (phone || '').trim()
  var nm = (name || '').trim()
  if (!num && !nm) return null
  // الاسم الثنائي: أول كلمتين بس من اسم الطالب — سطر واحد في النص بدل الاسم كله
  var parts = nm.split(/\s+/).filter(Boolean)
  var shortName = parts.slice(0, 2).join(' ') || num

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      <style dangerouslySetInnerHTML={{ __html: WM_BLINK_CSS }} />

      {/* ===== الووترمارك الكبيرة الشفافة في نص الفيديو =====
          بتظهر 10 ثواني وبتختفي 20 ثانية (دورة 30 ثانية متكررة —
          الـ keyframes فوق هي اللي بتتحكم في الظهور والاختفاء) */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ animation: 'wmBlink30 30s linear infinite' }}
      >
        <div
          className="text-center font-black"
          style={{
            direction: 'rtl',
            maxWidth: '94%',
            fontSize: 'clamp(20px, 5.6vw, 72px)',
            letterSpacing: 0,
          }}
        >
          {/* السطر الأول: الاسم الثنائي — شفافية أخف (حواف أرفع وتعبئة أخف) */}
          <div
            className="leading-tight"
            style={{
              whiteSpace: 'nowrap',
              color: 'rgba(0,0,0,0.10)',
              WebkitTextStroke: '1.3px rgba(0,0,0,0.42)',
              paintOrder: 'stroke',
              unicodeBidi: 'plaintext',
              // هالة بيضاء خفيفة جدًا عشان الحواف السودة تبان حتى على مشهد غامق
              textShadow: '0 0 16px rgba(255,255,255,0.16)',
            }}
          >
            {shortName}
          </div>
          {/* السطر التاني: رقم الطالب تحته — أصغر لكن واضح ومقروء */}
          {num && shortName !== num && (
            <div
              style={{
                fontSize: '0.5em',
                direction: 'ltr',
                unicodeBidi: 'plaintext',
                marginTop: '0.12em',
                lineHeight: 1.15,
                whiteSpace: 'nowrap',
                color: 'rgba(0,0,0,0.10)',
                WebkitTextStroke: '1px rgba(0,0,0,0.40)',
                paintOrder: 'stroke',
                textShadow: '0 0 12px rgba(255,255,255,0.16)',
              }}
            >
              {num}
            </div>
          )}
        </div>
      </div>

      {/* ===== 4 ووترمارك ثابتة (طلب المستر الحرفي) ===== */}

      {/* 1) فوق في النص */}
      <div className="absolute z-[61]" style={{ top: '2.8%', left: '50%', transform: 'translateX(-50%)' }}>
        <WmCard nm={nm} num={num} />
      </div>

      {/* 2) نص الفيديو على اليمين */}
      <div className="absolute z-[61]" style={{ top: '50%', right: '2.2%', transform: 'translateY(-50%)' }}>
        <WmCard nm={nm} num={num} />
      </div>

      {/* 3) نص الفيديو على الشمال */}
      <div className="absolute z-[61]" style={{ top: '50%', left: '2.2%', transform: 'translateY(-50%)' }}>
        <WmCard nm={nm} num={num} />
      </div>

      {/* 4) تحت خالص في النص — واقفة **بالظبط** على حد الشريط العلوي
          (الشريط بقى 60px في 2026-و23 — «واصل لأول الـ watermark ما يعديهاش») */}
      <div className="absolute z-[61]" style={{ bottom: 60, left: '50%', transform: 'translateX(-50%)' }}>
        <WmCard nm={nm} num={num} />
      </div>
    </div>
  )
}
