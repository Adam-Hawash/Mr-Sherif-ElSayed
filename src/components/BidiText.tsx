'use client'

// ============================================================
// (2026-و44) BidiText — عرض النصوص المختلطة عربي/إنجليزي **مظبوطة**
// طلب المستر حرفيًا: «الملاحظات بتتكتب بطريقة عشوائية — عاوزها تتكتب
// صح من اليمين للشمال سواء عربي أو إنجليزي».
//
// المشكلة: ملاحظة زي «خلي بالك x = -b/2a هو محور التماثل Axis of symmetry
// والقيمة 4-» جوه حاوية dir="ltr" بتتقلب حروفها وأرقامها عشوائي
// (bidi algorithm بيعيد ترتيب المقاطع المحايدة).
//
// الحل هنا: بنقسم النص لمقاطع — أي مقطع فيه حروف/أرقام لاتينية
// بيتعزل جوه <bdi dir="ltr"> (unicode-bidi: isolate) فبيحتفظ بترتيبه
// الداخلي بالظبط من غير ما يلخبط الجملة العربية حواليه، والجملة كلها
// بتتمدد من اليمين للشمال.
// ============================================================

import * as React from 'react'
import FractionText, { hasMathMarkup } from '@/components/FractionText'

interface BidiSegment { ltr: boolean; t: string }

/* تقسيم النص لمقاطع: مقاطع لاتينية/أرقام (ltr) ومقاطع عربية/محايدة (rtl) */
function segmentBidi(text: string): BidiSegment[] {
  var segs: BidiSegment[] = []
  var buf = ''
  var bufLtr = false
  var flush = function () {
    if (buf !== '') segs.push({ ltr: bufLtr, t: buf })
    buf = ''
    bufLtr = false
  }
  for (var i = 0; i < text.length; i++) {
    var ch = text[i]
    if (ch === '\n') {
      flush()
      segs.push({ ltr: false, t: '\n' })
      continue
    }
    var isAlnum = /[A-Za-z0-9]/.test(ch)
    var isArabic = /[\u0600-\u06FF]/.test(ch)
    if (isArabic) {
      /* أول حرف عربي بيقفل أي مقطع لاتيني مفتوح */
      if (bufLtr) flush()
      buf += ch
      continue
    }
    if (isAlnum) {
      if (!bufLtr) { flush(); bufLtr = true }
      buf += ch
      continue
    }
    /* محايد (علامات/مسافات/رموز رياضة): بيلزق بمقطع لاتيني مفتوح،
       أو بمقطع عربي عادي — فمش بيكسر الترتيب */
    buf += ch
  }
  flush()
  return segs
}

/**
 * BidiText — مرر له نص الملاحظة/الريأكشن وهو بيرسمه مظبوط اتجاهاته.
 * الاختياري dir="auto": لو النص أغلبه إنجليزي رياضة هيبقى LTR أساسي.
 */
export function BidiText({ text, className, style }: { text: string; className?: string; style?: React.CSSProperties }) {
  var raw = String(text || '')
  if (!raw) return null
  var segs = segmentBidi(raw)
  return (
    <span dir="rtl" style={Object.assign({ textAlign: 'right' }, style || {})} className={className}>
      {segs.map(function (s: BidiSegment, i: number) {
        var rendered = hasMathMarkup(s.t) ? <FractionText text={s.t} /> : s.t
        if (s.ltr) {
          return (
            <bdi key={i} dir="ltr" style={{ unicodeBidi: 'isolate' }}>
              {rendered}
            </bdi>
          )
        }
        return <React.Fragment key={i}>{rendered}</React.Fragment>
      })}
    </span>
  )
}

export default BidiText
