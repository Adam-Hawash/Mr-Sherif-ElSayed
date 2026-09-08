'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه كامل + رقمه)
// ============================================================
// مواصفات المستر النهائية (2026):
//  1) 8 شِپات على الحواف **سابتين في مكانهم مفيش حاجة بتتحرك**:
//     • 3 فوق: فوق شمال + منتصف فوق + فوق يمين
//     • 2 في النص: منتصف شمال + منتصف يمين
//     • 3 تحت: تحت شمال + منتصف تحت + تحت يمين
//     • كل واحدة في مسافة كافية عن التانية — البيانات جوه كلها باينة
//       ومفيش تداخل خالص.
//  2) ووترمارك كبير واحد بس في نص الخلفية: شفاف بحواف سودة وبالعرض
//     — **ثابت تمامًا** (من غير أي حركة).
//  3) الكارت (الاسم الكامل + الرقم) **ثابت كمان** تحت الووترمارك الكبير
//     (طلب المستر: مفيش أي حاجة بتتحرك في الفيديو خالص)
//  4) الاسم كامل 100% من غير قص أي حرف:
//     • ممنوع letter-spacing نهائيًا (بيقطع اتصال الحروف العربية)
//     • paintOrder: 'stroke' عشان الحواف السودة متاكلش الحروف
//     • النص الكبير بيلف لو طويل بدل ما يتقص
//  5) على الموبايل: الشِپات الجانبية والزوايا بتعرض الرقم بس عشان
//     مفيش تداخل — الاسم كامل باين في الشِپين العلوي والسفلي وفي
//     الووترمارك الكبير وفي الكارت.
//  6) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  7) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  8) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحده كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

// الأماكن الثابتة الثمانية — 3 فوق + 2 في النص + 3 تحت
var CHIP_SPOTS: Array<Record<string, string>> = [
  { top: '2.4%', left: '50%', transform: 'translateX(-50%)' },    // 1) منتصف الخط العلوي
  { top: '2.4%', left: '1.8%' },                                   // 2) فوق شمال
  { top: '2.4%', right: '1.8%' },                                  // 3) فوق يمين
  { top: '50%', left: '1.8%', transform: 'translateY(-50%)' },     // 4) منتصف الخط الشمال
  { top: '50%', right: '1.8%', transform: 'translateY(-50%)' },    // 5) منتصف الخط اليمين
  { bottom: '2.4%', left: '1.8%' },                                // 6) تحت شمال
  { bottom: '2.4%', left: '50%', transform: 'translateX(-50%)' },  // 7) منتصف الخط السفلي
  { bottom: '2.4%', right: '1.8%' },                               // 8) تحت يمين
]

// كارت الطالب — ثابت في مكانه تحت الووترمارك الكبير (مفيش أي حركة خالص)
var CARD_POS: Record<string, string> = { top: '66%', left: '50%', transform: 'translate(-50%, 0%)' }

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

  const num = (phone || '').trim()
  const nm = (name || '').trim()
  if (!num && !nm) return null
  const chipText = [num, nm].filter(Boolean).join('  •  ')
  const bigLine1 = nm || num
  const bigLine2 = nm && num ? num : ''
  const card = CARD_POS

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        /* الكارت: ثابت تمامًا — مفيش أي أنيميشن */

        /* الشِپات: سابتة — مفيش أي أنيميشن على الحواف خالص */
        .wm-chip { white-space: nowrap; }
        .wm-compact .wm-short { display: none; }
        @media (max-width: 640px) {
          .wm-chip { font-size: 8.5px !important; padding: 2px 8px !important; }
          /* على الموبايل: الجانبية والزوايا تعرض الرقم بس عشان مفيش تداخل */
          .wm-compact .wm-full { display: none; }
          .wm-compact .wm-short { display: inline; }
        }
      `}</style>

      {/* الووترمارك الكبير في نص الخلفية — شفاف بحواف سودة وبالعرض — ثابت تمامًا */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div
          className="text-center font-black leading-tight"
          style={{
            direction: 'rtl',
            maxWidth: '86%',
            fontSize: 'clamp(20px, 5.6vw, 72px)',
            color: 'rgba(0,0,0,0.13)',
            WebkitTextStroke: '1.8px rgba(0,0,0,0.50)',
            paintOrder: 'stroke',
            unicodeBidi: 'plaintext',
            // هالة بيضاء خفيفة جدًا عشان الحواف السودة تبان حتى على مشهد غامق
            textShadow: '0 0 18px rgba(255,255,255,0.22)',
            letterSpacing: 0,
          }}
        >
          {bigLine1}
          {bigLine2 && (
            <span
              className="block font-extrabold"
              style={{
                fontSize: '0.36em',
                direction: 'ltr',
                unicodeBidi: 'plaintext',
                WebkitTextStroke: '1.2px rgba(0,0,0,0.45)',
                paintOrder: 'stroke',
                letterSpacing: 0,
              }}
            >
              {bigLine2}
            </span>
          )}
        </div>
      </div>

      {/* 8 شِپات على الحواف (3 فوق + 2 نص + 3 تحت) — سابتين في مكانهم بالظبط */}
      {CHIP_SPOTS.map(function (spot, i) {
        // الشِپات الجانبية والزوايا على الموبايل تعرض الرقم بس
        var compact = i !== 0 && i !== 6
        return (
          <div key={i} className={'absolute' + (compact ? ' wm-compact' : '')} style={spot as any}>
            <span
              className="wm-chip inline-block rounded-full font-bold text-white/95"
              style={{
                direction: 'rtl',
                background: 'rgba(0,0,0,0.55)',
                border: '1px solid rgba(255,255,255,0.20)',
                fontSize: 'clamp(8.5px, 1.05vw, 11px)',
                fontWeight: 700,
                letterSpacing: 0,
                padding: '3px 11px',
                whiteSpace: 'nowrap',
                maxWidth: compact ? '30vw' : '46vw',
                overflow: 'hidden',
                textShadow: '0 1px 2px rgba(0,0,0,0.8)',
                unicodeBidi: 'plaintext',
              }}
            >
              <span className="wm-full">{chipText}</span>
              <span className="wm-short">{num}</span>
            </span>
          </div>
        )
      })}

      {/* كارت الطالب (الاسم الكامل + الرقم) — ثابت تحت الووترمارك الكبير */}
      <div
        className="absolute z-[61]"
        style={{
          top: card.top,
          left: card.left,
          transform: card.transform,
        }}
      >
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
            {bigLine1}
          </span>
          {bigLine2 && (
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
              {bigLine2}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
