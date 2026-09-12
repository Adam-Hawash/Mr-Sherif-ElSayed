'use client'

/* ============================================================
 * Geometry Laws — كل قوانين الهندسة بالإنجليزي (طلب المستر حرفيًا:
 * «عاوزه يبقى بالإنجليزي مكتوب area, perimeter ومش بالحاجات اللي
 * أنت عاملها بالعربي» + «عاوز كل شكل يبقى ليه قوانين — لو دوست
 * على المثلث يجيب لي القانون بتاعه ويجيب لي القوانين بتاعته برضه
 * بتاعة Pythagoras theorem وبتاعة Euclid's — كل القوانين دي»
 * + «عاوزه يبقى باين في الموبايل»).
 * كل شكل = كارت قابل للضغط يفتح ورقة القوانين الكاملة بتاعته:
 *   Laws (Area / Perimeter / Volume…) + Theorems (Pythagoras,
 *   Euclid's angle sum, tangents, similarity…) — كله English.
 * + «القسمة عاوزها تحت بعض أو علامة الـ divide» — أي قسمة في الصيغ
 *   بتتكتب توكن [num/den] وبتترسم كسر رأسي (البسط فوق والمقام تحت
 *   بخط في النص) عبر renderFormula/Frac تحت — مش ½ ولا a/b سطر واحد.
 * ============================================================ */

import { useMemo, useState } from 'react'
import { ArrowRight, Search, Ruler, Box, Sparkles, ChevronDown, ScrollText } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const C1 = '#10b981' // لون الشكل (emerald)
const C2 = '#f59e0b' // لون الارتفاعات والمساعدات (amber)
const CT = '#94a3b8' // لون الكتابات

interface Law {
  label: string
  formula: string
}
interface Theorem {
  name: string
  formula: string
  note?: string
}
interface Shape {
  id: string
  ar: string
  en: string
  tags: string
  draw: React.ReactNode
  laws: Law[]
  theorems: Theorem[]
}

/* ---------- الرسوم التوضيحية (SVG) ---------- */

const svgProps = {
  viewBox: '0 0 220 130',
  className: 'w-full max-w-[280px] h-36',
  fill: 'none',
  xmlns: 'http://www.w3.org/2000/svg',
}

function Label({ x, y, children }: { x: number; y: number; children: React.ReactNode }) {
  return (
    <text x={x} y={y} fill={CT} fontSize="13" fontWeight="700" textAnchor="middle" fontFamily="ui-sans-serif, system-ui" >
      {children}
    </text>
  )
}

const DRAW = {
  square: (
    <svg {...svgProps}>
      <rect x="65" y="28" width="78" height="78" rx="2" stroke={C1} strokeWidth="2.5" />
      <Label x={104} y={20}>a</Label>
      <Label x={156} y={72}>a</Label>
    </svg>
  ),
  rectangle: (
    <svg {...svgProps}>
      <rect x="30" y="38" width="160" height="58" rx="2" stroke={C1} strokeWidth="2.5" />
      <Label x={110} y={30}>l</Label>
      <Label x={203} y={72}>w</Label>
    </svg>
  ),
  triangle: (
    <svg {...svgProps}>
      <polygon points="35,102 185,102 110,26" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="110" y1="26" x2="110" y2="102" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="110" y="94" width="8" height="8" stroke={C2} strokeWidth="1.2" />
      <Label x={110} y={118}>b</Label>
      <Label x={122} y={62}>h</Label>
      <Label x={30} y={118}>a</Label>
      <Label x={194} y={118}>c</Label>
    </svg>
  ),
  rightTriangle: (
    <svg {...svgProps}>
      <polygon points="55,102 175,102 55,28" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <rect x="55" y="94" width="8" height="8" stroke={C2} strokeWidth="1.2" />
      <Label x={115} y={118}>a</Label>
      <Label x={42} y={68}>b</Label>
      <Label x={130} y={52}>c</Label>
    </svg>
  ),
  equilateral: (
    <svg {...svgProps}>
      <polygon points="45,102 175,102 110,22" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <Label x={68} y={52}>a</Label>
      <Label x={152} y={52}>a</Label>
      <Label x={110} y={118}>a</Label>
    </svg>
  ),
  parallelogram: (
    <svg {...svgProps}>
      <polygon points="55,98 165,98 185,34 75,34" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="85" y1="34" x2="85" y2="98" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="85" y="90" width="8" height="8" stroke={C2} strokeWidth="1.2" />
      <Label x={110} y={116}>b</Label>
      <Label x={76} y={68}>h</Label>
    </svg>
  ),
  rhombus: (
    <svg {...svgProps}>
      <polygon points="110,14 182,66 110,118 38,66" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="110" y1="14" x2="110" y2="118" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="38" y1="66" x2="182" y2="66" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <Label x={120} y={44}>d₁</Label>
      <Label x={152} y={60}>d₂</Label>
      <Label x={104} y={124}>a</Label>
    </svg>
  ),
  trapezoid: (
    <svg {...svgProps}>
      <polygon points="55,102 185,102 160,34 75,34" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="80" y1="34" x2="80" y2="102" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <rect x="80" y="94" width="8" height="8" stroke={C2} strokeWidth="1.2" />
      <Label x={120} y={120}>b₁</Label>
      <Label x={117} y={26}>b₂</Label>
      <Label x={70} y={70}>h</Label>
    </svg>
  ),
  circle: (
    <svg {...svgProps}>
      <circle cx="110" cy="66" r="46" stroke={C1} strokeWidth="2.5" />
      <line x1="110" y1="66" x2="156" y2="66" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="110" cy="66" r="2.5" fill={C2} />
      <Label x={134} y={58}>r</Label>
    </svg>
  ),
  sector: (
    <svg {...svgProps}>
      <path d="M 110 88 L 168 88 A 58 58 0 0 0 81 31 Z" stroke={C1} strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="110" cy="88" r="2.5" fill={C2} />
      <Label x={137} y={82}>r</Label>
      <Label x={124} y={102}>θ</Label>
    </svg>
  ),
  cube: (
    <svg {...svgProps}>
      <rect x="42" y="22" width="62" height="62" rx="2" stroke={C1} strokeWidth="2" strokeDasharray="4 3" />
      <rect x="66" y="44" width="62" height="62" rx="2" stroke={C1} strokeWidth="2.5" />
      <line x1="66" y1="44" x2="42" y2="22" stroke={C1} strokeWidth="2" />
      <line x1="128" y1="44" x2="104" y2="22" stroke={C1} strokeWidth="2" />
      <line x1="128" y1="106" x2="104" y2="84" stroke={C1} strokeWidth="2" />
      <line x1="66" y1="106" x2="42" y2="84" stroke={C1} strokeWidth="2" />
      <Label x={97} y={122}>a</Label>
      <Label x={140} y={78}>a</Label>
    </svg>
  ),
  cuboid: (
    <svg {...svgProps}>
      <rect x="34" y="24" width="84" height="58" rx="2" stroke={C1} strokeWidth="2" strokeDasharray="4 3" />
      <rect x="58" y="46" width="84" height="58" rx="2" stroke={C1} strokeWidth="2.5" />
      <line x1="58" y1="46" x2="34" y2="24" stroke={C1} strokeWidth="2" />
      <line x1="142" y1="46" x2="118" y2="24" stroke={C1} strokeWidth="2" />
      <line x1="142" y1="104" x2="118" y2="82" stroke={C1} strokeWidth="2" />
      <line x1="58" y1="104" x2="34" y2="82" stroke={C1} strokeWidth="2" />
      <Label x={100} y={122}>l</Label>
      <Label x={154} y={80}>w</Label>
      <Label x={42} y={40}>h</Label>
    </svg>
  ),
  cylinder: (
    <svg {...svgProps}>
      <ellipse cx="110" cy="34" rx="46" ry="13" stroke={C1} strokeWidth="2.5" />
      <line x1="64" y1="34" x2="64" y2="100" stroke={C1} strokeWidth="2.5" />
      <line x1="156" y1="34" x2="156" y2="100" stroke={C1} strokeWidth="2.5" />
      <ellipse cx="110" cy="100" rx="46" ry="13" stroke={C1} strokeWidth="2.5" />
      <Label x={136} y={30}>r</Label>
      <Label x={168} y={72}>h</Label>
    </svg>
  ),
  cone: (
    <svg {...svgProps}>
      <line x1="110" y1="18" x2="62" y2="102" stroke={C1} strokeWidth="2.5" />
      <line x1="110" y1="18" x2="158" y2="102" stroke={C1} strokeWidth="2.5" />
      <ellipse cx="110" cy="102" rx="48" ry="13" stroke={C1} strokeWidth="2.5" />
      <line x1="110" y1="18" x2="110" y2="102" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="110" y1="102" x2="158" y2="102" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <Label x={120} y={64}>h</Label>
      <Label x={136} y={116}>r</Label>
      <Label x={146} y={52}>l</Label>
    </svg>
  ),
  sphere: (
    <svg {...svgProps}>
      <circle cx="110" cy="66" r="48" stroke={C1} strokeWidth="2.5" />
      <ellipse cx="110" cy="66" rx="48" ry="14" stroke={C1} strokeWidth="1.5" strokeDasharray="4 3" />
      <line x1="110" y1="66" x2="158" y2="66" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <circle cx="110" cy="66" r="2.5" fill={C2} />
      <Label x={134} y={58}>r</Label>
    </svg>
  ),
  pyramid: (
    <svg {...svgProps}>
      <polygon points="62,104 152,104 176,84 86,84" stroke={C1} strokeWidth="2" strokeDasharray="4 3" />
      <line x1="117" y1="18" x2="62" y2="104" stroke={C1} strokeWidth="2.5" />
      <line x1="117" y1="18" x2="152" y2="104" stroke={C1} strokeWidth="2.5" />
      <line x1="117" y1="18" x2="176" y2="84" stroke={C1} strokeWidth="2" />
      <line x1="117" y1="18" x2="86" y2="84" stroke={C1} strokeWidth="2" strokeDasharray="4 3" />
      <line x1="117" y1="18" x2="117" y2="94" stroke={C2} strokeWidth="1.5" strokeDasharray="4 3" />
      <Label x={107} y={120}>a</Label>
      <Label x={126} y={60}>h</Label>
    </svg>
  ),
}

/* ---------- بيانات الأشكال — Laws بالإنجليزي + Theorems (Pythagoras / Euclid) ---------- */

const FLAT_SHAPES: Shape[] = [
  {
    id: 'square', ar: 'المربع', en: 'Square', tags: 'مربع مساحة محيط قطر area perimeter diagonal square',
    draw: DRAW.square,
    laws: [
      { label: 'Area', formula: 'A = a²' },
      { label: 'Perimeter', formula: 'P = 4a' },
      { label: 'Diagonal', formula: 'd = a√2' },
    ],
    theorems: [
      { name: 'Euclid — Equal sides & right angles', formula: 'كل الأضلاع متساوية وكل الزوايا = 90°', note: 'Definition of a square (Euclid Book I).' },
      { name: 'Euclid — Diagonals', formula: 'd₁ = d₂ , d₁ ∩ d₂ ⊥ و ينصف بعضهم', note: 'Diagonals are equal and bisect each other at right angles.' },
      { name: 'Angle sum (Euclid I.32)', formula: 'Sum of angles = 4 × 90° = 360°' },
    ],
  },
  {
    id: 'rectangle', ar: 'المستطيل', en: 'Rectangle', tags: 'مستطيل مساحة محيط قطر area perimeter diagonal rectangle',
    draw: DRAW.rectangle,
    laws: [
      { label: 'Area', formula: 'A = l × w' },
      { label: 'Perimeter', formula: 'P = 2(l + w)' },
      { label: 'Diagonal', formula: 'd = √(l² + w²)' },
    ],
    theorems: [
      { name: 'Euclid — Opposite sides', formula: 'الأضلاع المتقابلة متساوية ومتوازية', note: 'Euclid I.34 — parallelogram properties.' },
      { name: 'Euclid — Diagonals', formula: 'd₁ = d₂ و ينصف بعضهم', note: 'Diagonals of a rectangle are equal and bisect each other.' },
      { name: 'Angle sum (Euclid I.32)', formula: 'Sum of angles = 360°' },
    ],
  },
  {
    id: 'triangle', ar: 'المثلث', en: 'Triangle', tags: 'مثلث مساحة محيط هيرون area heron triangle',
    draw: DRAW.triangle,
    laws: [
      { label: 'Area', formula: 'A = [1/2] × b × h' },
      { label: 'Heron\u2019s Formula', formula: 'A = √( s(s−a)(s−b)(s−c) ) , s = [a+b+c/2]' },
      { label: 'Perimeter', formula: 'P = a + b + c' },
    ],
    theorems: [
      { name: 'Euclid I.32 — Angle Sum', formula: '∠A + ∠B + ∠C = 180°', note: 'مجموع زوايا المثلث = 180° — أهم نظرية في الامتحان.' },
      { name: 'Euclid I.32 — Exterior Angle', formula: '∠الخارجي = ∠الداخليين المتقابلين', note: 'The exterior angle equals the sum of the two opposite interior angles.' },
      { name: 'Euclid I.5 — Isosceles', formula: 'لو a = c يبقى ∠A = ∠C', note: 'Pons Asinorum: base angles of an isosceles triangle are equal.' },
      { name: 'Pythagoras\u2019 Theorem (Euclid I.47)', formula: 'c² = a² + b²  (لو المثلث قائم)', note: 'شوف كارت Right Triangle للقوانين الكاملة.' },
      { name: 'Euclid VI — Similarity', formula: 'k = نسبة الأضلاع = نسبة الارتفاعات', note: 'نسبة المساحات = k² — شوف Must-Know تحت.' },
    ],
  },
  {
    id: 'right-triangle', ar: 'المثلث القائم', en: 'Right Triangle', tags: 'قائم فيثاغورس وتر pythagoras hypotenuse right triangle',
    draw: DRAW.rightTriangle,
    laws: [
      { label: 'Pythagoras\u2019 Theorem', formula: 'c² = a² + b²  →  c = √(a² + b²)' },
      { label: 'Area', formula: 'A = [1/2] × a × b' },
      { label: 'Perimeter', formula: 'P = a + b + c' },
    ],
    theorems: [
      { name: 'Pythagoras\u2019 Theorem (Euclid I.47)', formula: 'c² = a² + b²', note: 'الوتر تاني = مجموع مربعي الضلعين القائمين — c هي الوتر (أطول ضلع).' },
      { name: 'Converse of Pythagoras (Euclid I.48)', formula: 'لو c² = a² + b² يبقى ∠C = 90°', note: 'العكس صحيح — لو تحقق التساوي يبقى المثلث قائم والضلع الأكبر هو الوتر.' },
      { name: 'Euclid III.31 — Semicircle', formula: 'الزاوية اللي قطرها وتر = 90°', note: 'Angle in a semicircle is a right angle.' },
      { name: '30°-60°-90° Ratio', formula: '1 : √3 : 2', note: 'الأضلاع المقابلة للزوايا بالنسبة دي دايمًا.' },
    ],
  },
  {
    id: 'equilateral', ar: 'المثلث المتساوي الأضلاع', en: 'Equilateral Triangle', tags: 'متساوي الأضلاع مثلث equilateral 60',
    draw: DRAW.equilateral,
    laws: [
      { label: 'Area', formula: 'A = [√3/4] × a²' },
      { label: 'Height', formula: 'h = [√3/2] × a' },
      { label: 'Perimeter', formula: 'P = 3a' },
    ],
    theorems: [
      { name: 'Euclid I.1 / I.5', formula: 'a = b = c , كل الزوايا = 60°', note: 'All three sides equal → all three angles equal (60° each).' },
      { name: 'Pythagoras on the half', formula: '[a/2]² + h² = a²', note: 'الارتفاع بينصف القاعدة — بتشتغل بيها فيثاغورس علشان تطلع h.' },
    ],
  },
  {
    id: 'parallelogram', ar: 'متوازي الأضلاع', en: 'Parallelogram', tags: 'متوازي الاضلاع مساحة parallelogram base height',
    draw: DRAW.parallelogram,
    laws: [
      { label: 'Area', formula: 'A = b × h' },
      { label: 'Perimeter', formula: 'P = 2(a + b)' },
    ],
    theorems: [
      { name: 'Euclid I.34', formula: 'الأضلاع المتقابلة متساوية ومتوازية + الزوايا المتقابلة متساوية' },
      { name: 'Euclid — Diagonals', formula: 'القطرين بينصفوا بعض', note: 'Diagonals bisect each other; each diagonal splits the shape into two congruent triangles.' },
      { name: 'Euclid I.32', formula: 'Sum of angles = 360°' },
    ],
  },
  {
    id: 'rhombus', ar: 'المعين', en: 'Rhombus', tags: 'معين مساحة قطرين rhombus diagonal perpendicular',
    draw: DRAW.rhombus,
    laws: [
      { label: 'Area (Diagonals)', formula: 'A = [1/2] × d₁ × d₂' },
      { label: 'Area (Base × Height)', formula: 'A = a × h' },
      { label: 'Perimeter', formula: 'P = 4a' },
    ],
    theorems: [
      { name: 'Euclid — Rhombus properties', formula: 'الأضلاع الأربعة متساوية' },
      { name: 'Euclid — Diagonals', formula: 'd₁ ⊥ d₂ و بينصفوا بعض و بينصفوا الزوايا', note: 'Diagonals are perpendicular, bisect each other, and bisect the vertex angles.' },
    ],
  },
  {
    id: 'trapezoid', ar: 'شبه المنحرف', en: 'Trapezium', tags: 'منحرف شبه المنحرف مساحة trapezium trapezoid median',
    draw: DRAW.trapezoid,
    laws: [
      { label: 'Area', formula: 'A = [1/2] × (b₁ + b₂) × h' },
      { label: 'Median (Midsegment)', formula: 'm = [1/2] × (b₁ + b₂)' },
      { label: 'Perimeter', formula: 'P = مجموع الأضلاع الأربعة' },
    ],
    theorems: [
      { name: 'Euclid — Bases', formula: 'b₁ ∥ b₂', note: 'القاعدتين المتوازيتين بس — الأضلاع التانية مش شرط تكون متوازية.' },
      { name: 'Median Theorem', formula: 'm ∥ b₁ , b₂  و m = [1/2] × (b₁ + b₂)', note: 'الخط المتوسط موازي للقاعدتين وطوله نص مجموعهم.' },
    ],
  },
  {
    id: 'circle', ar: 'الدائرة', en: 'Circle', tags: 'دائرة مساحة محيط pi نق circle circumference tangent chord',
    draw: DRAW.circle,
    laws: [
      { label: 'Area', formula: 'A = πr²' },
      { label: 'Circumference', formula: 'C = 2πr = πd' },
      { label: 'Pi (π)', formula: 'π ≈ [22/7] ≈ 3.14' },
    ],
    theorems: [
      { name: 'Euclid III.18 — Tangent', formula: 'المماس ⊥ نصف القطر عند نقطة التماس', note: 'A tangent to a circle is perpendicular to the radius at the point of contact.' },
      { name: 'Euclid III.3 — Chord', formula: 'العمودي من المركز على الوتر بينصفه', note: 'Perpendicular from the centre bisects the chord.' },
      { name: 'Euclid III.20 — Central Angle', formula: '∠المركزي = 2 × ∠المحيطي', note: 'Central angle = twice the inscribed angle on the same arc.' },
      { name: 'Euclid III.31 — Semicircle', formula: 'الزاوية في نصف الدائرة = 90°' },
    ],
  },
  {
    id: 'sector', ar: 'القطاع الدائري', en: 'Sector', tags: 'قطاع دائري قوس زاوية sector arc length angle',
    draw: DRAW.sector,
    laws: [
      { label: 'Area', formula: 'A = [θ/360] × πr²' },
      { label: 'Arc Length', formula: 'L = [θ/360] × 2πr' },
      { label: 'Perimeter', formula: 'P = L + 2r' },
    ],
    theorems: [
      { name: 'Euclid III — Proportion', formula: '[θ/360] = [L/2πr] = [A/πr²]', note: 'نسبة الزاوية بتنفع تحسب القوس أو المساحة بالتناسب.' },
    ],
  },
]

const SOLID_SHAPES: Shape[] = [
  {
    id: 'cube', ar: 'المكعب', en: 'Cube', tags: 'مكعب حجم مساحة سطح cube volume surface area euler',
    draw: DRAW.cube,
    laws: [
      { label: 'Volume', formula: 'V = a³' },
      { label: 'Surface Area', formula: 'S = 6a²' },
      { label: 'Lateral Area', formula: 'L = 4a²' },
      { label: 'Diagonal', formula: 'd = a√3' },
    ],
    theorems: [
      { name: 'Euler\u2019s Formula', formula: 'F + V − E = 2  →  6 + 8 − 12 = 2', note: 'أوجه + رؤوس − أحرف = 2 (يناير على كل مجسمات لامتنتهية).' },
      { name: 'Pythagoras in 3D', formula: 'd² = a² + a² + a² = 3a²', note: 'قطر المكعب بيتحسب بفيثاغورس مرتين.' },
    ],
  },
  {
    id: 'cuboid', ar: 'متوازي المستطيلات', en: 'Cuboid', tags: 'متوازي المستطيلات صندوق حجم cuboid volume surface euler',
    draw: DRAW.cuboid,
    laws: [
      { label: 'Volume', formula: 'V = l × w × h' },
      { label: 'Surface Area', formula: 'S = 2(lw + lh + wh)' },
      { label: 'Lateral Area', formula: 'L = 2h(l + w)' },
      { label: 'Diagonal', formula: 'd = √(l² + w² + h²)' },
    ],
    theorems: [
      { name: 'Euler\u2019s Formula', formula: 'F + V − E = 2  →  6 + 8 − 12 = 2' },
      { name: 'Pythagoras in 3D', formula: 'd² = l² + w² + h²' },
    ],
  },
  {
    id: 'cylinder', ar: 'الأسطوانة', en: 'Cylinder', tags: 'اسطوانة أسطوانة حجم cylinder volume curved surface',
    draw: DRAW.cylinder,
    laws: [
      { label: 'Volume', formula: 'V = πr²h' },
      { label: 'Curved Surface (CSA)', formula: 'CSA = 2πrh' },
      { label: 'Total Surface (TSA)', formula: 'TSA = 2πr(r + h)' },
    ],
    theorems: [
      { name: 'Net of a Cylinder', formula: 'CSA = مستطيل طوله 2πr وعرضه h', note: 'فك الأسطوانة = مستطيل + دايرتين — منه بييجي قانون المساحة الجانبية.' },
    ],
  },
  {
    id: 'cone', ar: 'المخروط', en: 'Cone', tags: 'مخروط حجم رازم cone slant height volume',
    draw: DRAW.cone,
    laws: [
      { label: 'Volume', formula: 'V = [1/3] × πr²h' },
      { label: 'Slant Height', formula: 'l = √(r² + h²)' },
      { label: 'Curved Surface (CSA)', formula: 'CSA = πrl' },
      { label: 'Total Surface (TSA)', formula: 'TSA = πr(l + r)' },
    ],
    theorems: [
      { name: 'Pythagoras\u2019 Theorem', formula: 'l² = r² + h²', note: 'الرازم (الراسم) والنق والارتفاع بيعملوا مثلث قائم — فيثاغورس بيطلع الرازم.' },
      { name: 'Volume Ratio', formula: 'V(المخروط) = [1/3] × V(الأسطوانة)', note: 'المخروط بياخد ثلث حجم الأسطوانة بنفس النق والارتفاع.' },
    ],
  },
  {
    id: 'sphere', ar: 'الكرة', en: 'Sphere', tags: 'كرة حجم مساحة sphere volume surface area',
    draw: DRAW.sphere,
    laws: [
      { label: 'Volume', formula: 'V = [4/3] × πr³' },
      { label: 'Surface Area', formula: 'S = 4πr²' },
    ],
    theorems: [
      { name: 'Great Circle', formula: 'أكبر دائرة في الكرة = دايرة عندها نصف قطر الكرة', note: 'مركزها = مركز الكرة ونصف قطرها = r.' },
    ],
  },
  {
    id: 'pyramid', ar: 'الهرم الرباعي القائم', en: 'Square Pyramid', tags: 'هرم حجم قاعدة pyramid volume slant euler',
    draw: DRAW.pyramid,
    laws: [
      { label: 'Volume', formula: 'V = [1/3] × Base Area × h = [1/3] × a² × h' },
      { label: 'Base Area', formula: 'Base = a² (قاعدة مربعة)' },
      { label: 'Slant Height', formula: 'l = √( h² + [a/2]² )' },
    ],
    theorems: [
      { name: 'Euler\u2019s Formula', formula: 'F + V − E = 2  →  5 + 5 − 8 = 2' },
      { name: 'Pythagoras\u2019 Theorem', formula: 'l² = h² + [a/2]²', note: 'الارتفاع بينصف القاعدة في الهرم القائم — فيثاغورس بيطلع الرازم.' },
    ],
  },
]

/* قوانين لازم تحفظها — تغطي معظم أسئلة الامتحانات (بالإنجليزي) */
const MUST_KNOW: { title: string; body: string }[] = [
  { title: 'Pythagoras\u2019 Theorem (Euclid I.47)', body: 'In a right triangle: (hypotenuse)² = (leg 1)² + (leg 2)² → c² = a² + b². Converse (Euclid I.48): if c² = a² + b² then the triangle is right-angled and the LONGEST side is the hypotenuse.' },
  { title: 'Similarity Ratios (Euclid VI)', body: 'If two shapes are similar with ratio k: perimeters ratio = k , areas ratio = k² , volumes ratio = k³.' },
  { title: 'Angle Facts (Euclid I.32 / I.15)', body: 'Triangle angles sum = 180° , quadrilateral = 360° , angles on a straight line = 180° , vertically opposite angles are equal.' },
  { title: 'Area & Volume Unit Conversions', body: '1 cm² = 100 mm² , 1 m² = 10,000 cm² , 1 m³ = 1,000,000 cm³ , 1 litre = 1,000 cm³.' },
]

/* ---------- عرض القسمة كسر رأسي (طلب المستر: «تحت بعض أو علامة الـ divide») ---------- */

function Frac({ num, den }: { num: string; den: string }) {
  return (
    <span dir="ltr" className="inline-flex flex-col items-center align-middle leading-none font-bold">
      <span className="px-1">{num}</span>
      <span aria-hidden="true" className="w-full border-t-[1.5px] border-current my-[2px]" />
      <span className="px-1">{den}</span>
    </span>
  )
}

/* [num/den] → كسر رأسي في نفس السطر مع باقي الصيغة — باقي النص يفضل زي ما هو */
function renderFormula(formula: string): React.ReactNode {
  var re = /\[([^[\]/]+)\/([^[\]/]+)\]/g
  var out: React.ReactNode[] = []
  var last = 0
  var k = 0
  var m: RegExpExecArray | null
  while ((m = re.exec(formula)) !== null) {
    if (m.index > last) out.push(formula.slice(last, m.index))
    out.push(<Frac key={'frac-' + k} num={m[1]} den={m[2]} />)
    k = k + 1
    last = m.index + m[0].length
  }
  if (last < formula.length) out.push(formula.slice(last))
  if (out.length === 0) return formula
  return out
}

function LawRow({ l }: { l: Law }) {
  return (
    <div className="flex items-start justify-between gap-2 rounded-lg bg-muted/40 border border-border/40 px-2.5 py-2">
      <span className="text-muted-foreground shrink-0 text-xs font-bold mt-0.5">{l.label}</span>
      <span
        dir="ltr"
        className="inline-flex flex-wrap items-center gap-x-1 gap-y-0.5 font-bold text-foreground text-[13px] text-left leading-relaxed"
      >
        {renderFormula(l.formula)}
      </span>
    </div>
  )
}

function TheoremRow({ t }: { t: Theorem }) {
  return (
    <div className="rounded-lg border border-teal-500/25 bg-teal-500/5 px-3 py-2.5 space-y-1">
      <div className="flex items-start justify-between gap-2">
        <p dir="ltr" className="text-xs font-bold text-teal-700 dark:text-teal-400 text-left">{t.name}</p>
      </div>
      <p dir="auto" className="text-[13px] font-semibold text-foreground leading-relaxed">{renderFormula(t.formula)}</p>
      {t.note && <p className="text-[11px] text-muted-foreground leading-relaxed">{t.note}</p>}
    </div>
  )
}

function ShapeCard({ s, onOpen }: { s: Shape; onOpen: (s: Shape) => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      aria-label={s.en + ' — open all laws'}
      onClick={function () { onOpen(s) }}
      onKeyDown={function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(s) } }}
      className="overflow-hidden group hover:border-emerald-500/50 hover:shadow-md transition-all cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50"
    >
      <div className="flex items-center justify-center h-40 border-b border-border/50 bg-gradient-to-br from-emerald-500/8 via-transparent to-amber-500/8">
        {s.draw}
      </div>
      <CardContent className="p-4 space-y-2.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h3 dir="ltr" className="font-black text-foreground text-base text-left">{s.en}</h3>
          <span className="text-[11px] font-semibold text-muted-foreground">{s.ar}</span>
        </div>
        <ul className="space-y-1.5">
          {s.laws.map(function (l, i) {
            return <li key={i}><LawRow l={l} /></li>
          })}
        </ul>
        <button
          type="button"
          onClick={function (e) { e.stopPropagation(); onOpen(s) }}
          className="w-full inline-flex items-center justify-center gap-1.5 min-h-[40px] rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold hover:bg-emerald-500/15 transition-colors"
        >
          <ScrollText className="h-3.5 w-3.5" />
          All Laws + Theorems ({s.theorems.length}) — اضغط هنا
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </CardContent>
    </Card>
  )
}

export function GeometryLaws() {
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<Shape | null>(null)

  var q = query.trim().toLowerCase()
  var flat = useMemo(function () {
    if (!q) return FLAT_SHAPES
    return FLAT_SHAPES.filter(function (s) {
      var hay = (s.ar + ' ' + s.en + ' ' + s.tags + ' ' + s.laws.map(function (l) { return l.label }).join(' ') + ' ' + s.theorems.map(function (t) { return t.name }).join(' ')).toLowerCase()
      return hay.indexOf(q) >= 0
    })
  }, [q])
  var solids = useMemo(function () {
    if (!q) return SOLID_SHAPES
    return SOLID_SHAPES.filter(function (s) {
      var hay = (s.ar + ' ' + s.en + ' ' + s.tags + ' ' + s.laws.map(function (l) { return l.label }).join(' ') + ' ' + s.theorems.map(function (t) { return t.name }).join(' ')).toLowerCase()
      return hay.indexOf(q) >= 0
    })
  }, [q])

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        {/* Header */}
        <div className="border-b bg-gradient-to-b from-emerald-500/8 to-transparent">
          <div className="mx-auto max-w-6xl px-4 sm:px-6 py-6 sm:py-8 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <a
                href="/"
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-colors"
              >
                <ArrowRight className="h-4 w-4" />
                رجوع للرئيسية
              </a>
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1.5">
                <Ruler className="h-3.5 w-3.5" />
                Mr. Sherif ElSayed
              </span>
            </div>
            <div className="text-center space-y-2">
              <h1 dir="ltr" className="text-3xl sm:text-4xl font-black tracking-tight text-foreground">
                Geometry <span className="text-emerald-600 dark:text-emerald-400">Laws</span>
              </h1>
              <p className="text-sm sm:text-base text-muted-foreground font-medium">
                Every Area, Perimeter & Volume law in English — اضغط على أي شكل يفتح لك كل قوانينه ونظرياته (Pythagoras & Euclid)
              </p>
            </div>
            {/* Search */}
            <div className="relative max-w-md mx-auto">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <input
                type="search"
                value={query}
                onChange={function (e) { setQuery(e.target.value) }}
                placeholder="ابحث: Triangle, Circle, Cone, Pythagoras, مثلث…"
                aria-label="ابحث في قوانين الهندسة"
                className="w-full h-11 pr-10 pl-4 rounded-xl border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500/50"
              />
            </div>
          </div>
        </div>

        {/* Flat shapes */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 py-8 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
              <Ruler className="h-4 w-4" />
            </span>
            <h2 dir="ltr" className="text-lg font-bold text-foreground">Plane Shapes — Area & Perimeter</h2>
          </div>
          {flat.length === 0 && solids.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">مفيش شكل بالاسم ده — جرب كلمة تانية (مثل «Triangle» أو «مربع»)</p>
          ) : flat.length === 0 ? null : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {flat.map(function (s) { return <ShapeCard key={s.id} s={s} onOpen={setSelected} /> })}
            </div>
          )}
        </section>

        {/* Solid shapes */}
        {solids.length > 0 && (
          <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-8 space-y-4">
            <div className="flex items-center gap-2">
              <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-amber-500/12 text-amber-600 dark:text-amber-400">
                <Box className="h-4 w-4" />
              </span>
              <h2 dir="ltr" className="text-lg font-bold text-foreground">Solid Shapes — Volume & Surface Area</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {solids.map(function (s) { return <ShapeCard key={s.id} s={s} onOpen={setSelected} /> })}
            </div>
          </section>
        )}

        {/* Must-know laws */}
        <section className="mx-auto max-w-6xl px-4 sm:px-6 pb-12 space-y-4">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center h-8 w-8 rounded-lg bg-teal-500/12 text-teal-600 dark:text-teal-400">
              <Sparkles className="h-4 w-4" />
            </span>
            <h2 dir="ltr" className="text-lg font-bold text-foreground">Must-Know Theorems</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {MUST_KNOW.map(function (m, i) {
              return (
                <Card key={i} className="border-teal-500/25 bg-teal-500/5">
                  <CardContent className="p-4 space-y-1.5">
                    <h3 dir="ltr" className="font-bold text-foreground text-sm text-left">{m.title}</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">{m.body}</p>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </section>
      </main>

      {/* Full law sheet for the clicked shape */}
      <Dialog open={!!selected} onOpenChange={function (open) { if (!open) setSelected(null) }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto custom-scrollbar" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 flex-wrap">
                  <span dir="ltr" className="text-emerald-600 dark:text-emerald-400">{selected.en}</span>
                  <span className="text-sm font-medium text-muted-foreground">{selected.ar}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="flex items-center justify-center rounded-xl border border-border/50 bg-gradient-to-br from-emerald-500/8 via-transparent to-amber-500/8 py-2">
                {selected.draw}
              </div>
              <div className="space-y-2">
                <p dir="ltr" className="text-xs font-black uppercase tracking-wide text-muted-foreground text-left">Laws</p>
                <div className="space-y-1.5">
                  {selected.laws.map(function (l, i) { return <LawRow key={i} l={l} /> })}
                </div>
              </div>
              <div className="space-y-2">
                <p dir="ltr" className="text-xs font-black uppercase tracking-wide text-muted-foreground text-left">Theorems — Pythagoras & Euclid</p>
                <div className="space-y-2">
                  {selected.theorems.map(function (t, i) { return <TheoremRow key={i} t={t} /> })}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      <footer className="mt-auto border-t bg-background/60 py-4 text-center text-xs text-muted-foreground">
        Mr. Sherif ElSayed — مستر شريف السيد • Geometry Laws — قوانين الهندسة
      </footer>
    </div>
  )
}
