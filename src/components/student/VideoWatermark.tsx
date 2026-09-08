'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه + رقمه)
// ============================================================
// مواصفات المستر النهائية (تحديث 2026-و):
//  1) **مفيش أي شِپات على الحواف** — اتشالت كلها بطلب المستر،
//     مفيش حاجة غير الووترمارك الكبير في النص + الكارت في الزاوية.
//  2) ووترمارك كبير واحد في نص الخلفية على **سطرين** (زي ما المستر طلب
//     حرفيًا: "الاسم الثنائي وتحتيه الرقم — لازم الرقم يظهر"):
//     • السطر الأول:  الاسم الثنائي (أول كلمتين من اسم الطالب)
//     • السطر التاني: **رقم الطالب تحته** (أصغر شوية — باين ومقروء)
//  3) **الشفافية قلّت + نبض** (طلب المستر 2026-و حرفيًا: "تقللي الشفافية
//     عشان بتاخد من الكلام... تظهر ٥/٦ ثواني وتختفي عشر ثواني وهكذا"):
//     الووترمارك الكبير بيظهر ٦ ثواني → يختفي ١٠ ثواني → يرجع يظهر (نبض
//     16 ثانية) وبشفافية أخف عشان مش يغطي الكلام المكتوب في الفيديو.
//  4) الكارت (الاسم الكامل + الرقم) **ثابت في الزاوية تحت على اليمين**
//     — مفيش أي حركة خالص (ده اللي بيغطي ركن يوتيوب كمان).
//  5) الاسم من غير قص أي حرف:
//     • ممنوع letter-spacing نهائيًا (بيقطع اتصال الحروف العربية)
//     • paintOrder: 'stroke' عشان الحواف السودة متاكلش الحروف
//  6) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  7) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  8) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحده كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

/* النبض: ظهور 6 ثواني (37.5% من دورة 16 ثانية) ثم خفوت ثانية،
   اختفاء ~9 ثواني ثم رجوع تدريجي — زي ما المستر وصف بالظبط:
   "تظهر ٥/٦ ثواني وتختفي عشر ثواني وهكذا" */
const WM_PULSE_CSS = `
@keyframes mgWmPulse{0%,37.5%{opacity:var(--wmo,.5)}43.75%,93.75%{opacity:0}100%{opacity:var(--wmo,.5)}}
.mg-wm-pulse{animation:mgWmPulse 16s linear infinite}
`

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
      <style dangerouslySetInnerHTML={{ __html: WM_PULSE_CSS }} />
      {/* الووترمارك الكبير في نص الخلفية — سطرين: الاسم الثنائي فوق
          والرقم تحته — شفافية أخف + نبض (يظهر 6 ثواني ويختفي ~10 ثواني)
          (طلب المستر: "تقللي الشفافية عشان بتاخد من الكلام") */}
      <div
        className="mg-wm-pulse absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ ['--wmo' as any]: '0.5' }}
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

      {/* كارت الطالب (الاسم الكامل + الرقم) — ثابت في الزاوية تحت على اليمين */}
      <div className="absolute z-[61]" style={{ bottom: '7.5%', right: '2.2%' }}>
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
      </div>
    </div>
  )
}
