'use client'
// ============================================================
// VideoWatermark — ووترمارك الطالب فوق الفيديو (اسمه كامل + رقمه)
// ============================================================
// مواصفات المستر النهائية (محدّثة):
//  1) 6 ووترمارك على الحواف **سابتين في مكانهم مفيش حاجة بتتحرك**:
//     • 4 على الخطوط: منتصف فوق + منتصف تحت + منتصف شمال + منتصف يمين
//     • 2 في الزوايا (شكل السنبوكس): الزاوية اليمانية فوق + اليمانية تحت
//     • كل واحدة في مسافة كافية عن التانية — البيانات جوه كلها باينة
//       ومفيش تداخل خالص.
//  2) ووترمارك كبير واحد بس في نص الخلفية: شفاف بحواف سودة وبالعرض،
//     وهو **البس** اللي بيتحرك (نطفة ناعمة زي الجري) — محتوى الفيديو
//     تحته باين عادي.
//  3) الاسم كامل 100% من غير قص أي حرف:
//     • ممنوع letter-spacing نهائيًا (بيقطع اتصال الحروف العربية)
//     • paintOrder: 'stroke' عشان الحواف السودة متاكلش الحروف
//     • النص الكبير بيلف لو طويل بدل ما يتقص
//  4) على الموبايل: الشِپات الجانبية والزوايا بتعرض الرقم بس عشان
//     مفيش تداخل — الاسم كامل باين في الشِپين العلوي والسفلي وفي
//     الووترمارك الكبير.
//  5) pointer-events-none → مش بيمنع أي تفاعل مع الفيديو.
//  6) بيفضل ظاهر في ملء الشاشة (جوه عنصر الـ fullscreen نفسه).
//  7) لو حد شال الطبقة من الـ DOM بـ devtools → بترجع لوحده كل 6 ثواني.
// ============================================================
import { useEffect, useRef, useState } from 'react'

// الأماكن الثابتة الستة — 4 على الخطوط (منتصفات الحواف) + 2 زوايا قطرية
var CHIP_SPOTS: Array<Record<string, string>> = [
  { top: '2.4%', left: '50%', transform: 'translateX(-50%)' },   // 1) منتصف الخط العلوي
  { top: '2.4%', left: '1.8%' },                                  // 2) الزاوية فوق شمال
  { top: '50%', left: '1.8%', transform: 'translateY(-50%)' },    // 3) منتصف الخط الشمال
  { top: '50%', right: '1.8%', transform: 'translateY(-50%)' },   // 4) منتصف الخط اليمين
  { bottom: '2.4%', left: '50%', transform: 'translateX(-50%)' }, // 5) منتصف الخط السفلي
  { bottom: '2.4%', right: '1.8%' },                              // 6) الزاوية تحت يمين
]

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

  return (
    <div
      ref={layerRef}
      data-wm="1"
      className="absolute inset-0 z-[60] pointer-events-none select-none overflow-hidden"
      aria-hidden="true"
    >
      <style>{`
        /* نطفة الووترمارك الكبير — هو بس اللي بيتحرك، ناعم ومستمر */
        @keyframes wmDriftX { 0% { transform: translateX(-1.1em) } 100% { transform: translateX(1.1em) } }
        @keyframes wmDriftY { 0% { transform: translateY(-0.65em) } 100% { transform: translateY(0.65em) } }
        .wm-drift-x { animation: wmDriftX 17s ease-in-out infinite alternate; }
        .wm-drift-y { animation: wmDriftY 11.5s ease-in-out infinite alternate-reverse; }

        /* الشِپات: سابتة — مفيش أي أنيميشن على الحواف خالص */
        .wm-chip { white-space: nowrap; }
        .wm-compact .wm-short { display: none; }
        @media (max-width: 640px) {
          .wm-chip { font-size: 8.5px !important; padding: 2px 8px !important; }
          /* على الموبايل: الجانبية والزوايا تعرض الرقم بس عشان مفيش تداخل */
          .wm-compact .wm-full { display: none; }
          .wm-compact .wm-short { display: inline; }
          /* النطفة الكبيرة على الموبايل أخف */
          .wm-drift-x { animation-duration: 14s; }
          .wm-drift-y { animation-duration: 9.5s; }
        }
      `}</style>

      {/* الووترمارك الكبير في نص الخلفية — شفاف بحواف سودة وبالعرض — هو بس اللي بيتحرك */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="wm-drift-x">
          <div className="wm-drift-y">
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
              {nm || num}
              {nm && num && (
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
                  {num}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* الست شِپات على الحواف — سابتين في مكانهم بالظبط، مفيش حركة */}
      {CHIP_SPOTS.map(function (spot, i) {
        // الشِپات الجانبية والزوايا (2,3,4,6) على الموبايل تعرض الرقم بس
        var compact = i !== 0 && i !== 4
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
    </div>
  )
}
