// @ts-nocheck
// ============================================================
// FILE: src/lib/question-gen.ts
// PURPOSE: محرك توليد الأسئلة الرياضية المحلي (القلب الرياضي للميزات الجديدة):
//   • «اتدرب أكتر» (Smart Question Generator) — fallback ذكي مضمون لما
//     الذكاء الاصطناعي (ZAI/Gemini) مش متاح أو رجّع JSON بايظ
//   • «ساحة التحدي» — أسئلة اختياري (MCQ) بأرقام عشوائية جديدة كل مرة
//   • «تحدي الفلاش كاردز» — بطاقات سريعة بنفس المحرك
// القاعدة الذهبية: كل إجابة **محسوبة بالكود** (مش مخزنة) → الدقة 100%
// دايمًا، والأرقام بتتغير كل توليد → «10 أسئلة فريدة بأرقام وخدع مختلفة».
// (2026-و68) اللغة: كل نصوص الأسئلة/الحلول/الخدع **بالإنجليزي** — طلب
// المستر الحرفي: «احنا متفقين إنها بالإنجليزي في الـ Math وبأسلوب الـ
// Math اللي إحنا متعودين عليه» — الحسابات نفسها متلمستش خالص.
// (2026-و71) تعقيم صارم لمخرجات الـ AI + مطابقة المواضيع المعروفة —
// طلب المستر: «عاوز الحاجات تبقى بالماث… زي الحاجات بتاعة الماث اللي
// إحنا عاملينها في منصتنا» → مفيش عربي ولا ماث مكسور يوصل للطالب أبدًا.
// ============================================================

import { repairCorruptMath } from '@/lib/math-text'

export interface PracticeQuestion {
  id: string
  question: string
  answer: string
  steps: string[]
  trick: string
  topic: string
  difficulty: string // Easy | Medium | Hard
}

export interface BattleQuestion {
  id: string
  text: string
  options: string[] // 4 اختيارات
  correctIndex: number
  explanation: string
  timeLimitSec: number
}

export interface MindMapNode {
  id: string
  label: string
  note?: string
  children?: MindMapNode[]
}

export interface MindMapData {
  title: string
  summary?: string
  root: MindMapNode
}

/* ---------- أدوات عشوائية ---------- */
function ri(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)]
}
function shuffle(arr) {
  var a = arr.slice()
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1))
    var t = a[i]; a[i] = a[j]; a[j] = t
  }
  return a
}
function gcd(a, b) {
  a = Math.abs(a); b = Math.abs(b)
  while (b) { var t = b; b = a % b; a = t }
  return a || 1
}
function uid() {
  return 'q' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7)
}

/* نتيجة مولّد — answerNum للأجوبة الرقمية (بنبني منها اختيارات خاطئة ذكية)،
   و distractors للإجابات النصية (كسور/زوج جذور/حدود جبرية) */
interface GenQ {
  text: string
  answer: string
  answerNum: number | null
  steps: string[]
  trick: string
  topic: string
  distractors?: string[]
}

/* ============================================================
 * المولّدات — كل واحدة بترجع سؤال صحيح حسابيًا مضمون
 * hard=true → أرقام أكبر/خطوتين (مستوى صعب)
 * ============================================================ */

function genLinear(hard: boolean): GenQ {
  var x = ri(2, hard ? 15 : 9)
  var a = ri(2, hard ? 12 : 6)
  var b = ri(-14, 14)
  if (b === 0) b = 7
  var c = a * x + b
  var bTxt = b > 0 ? ('+ ' + b) : ('− ' + Math.abs(b))
  return {
    text: 'Solve for x:  ' + a + 'x ' + bTxt + ' = ' + c,
    answer: String(x),
    answerNum: x,
    steps: [
      'Move ' + (b > 0 ? b : ('− ' + Math.abs(b))) + ' to the other side: ' + a + 'x = ' + (c - b),
      'Divide both sides by ' + a + ': x = ' + (c - b) + ' ÷ ' + a + ' = ' + x,
    ],
    trick: 'In a linear equation: keep the unknown alone on one side and the numbers on the other — that is all.',
    topic: 'Linear Equations',
  }
}

function genLinearBrackets(hard: boolean): GenQ {
  var x = ri(2, hard ? 12 : 8)
  var a = ri(2, 6)
  var b = ri(-9, 9)
  if (b === 0) b = 3
  var c = a * (x + b)
  var bTxt = b > 0 ? ('+ ' + b) : ('− ' + Math.abs(b))
  return {
    text: 'Solve for x:  ' + a + '(x ' + bTxt + ') = ' + c,
    answer: String(x),
    answerNum: x,
    steps: [
      'Divide both sides by ' + a + ': x ' + bTxt + ' = ' + (c / a),
      'Move ' + (b > 0 ? b : ('− ' + Math.abs(b))) + ' to the other side: x = ' + x,
    ],
    trick: 'Brackets first: you can divide both sides by the number next to the bracket before expanding — much faster.',
    topic: 'Equations with Brackets',
  }
}

function genSystem2x2(hard: boolean): GenQ {
  var x = ri(1, hard ? 12 : 8)
  var y = ri(1, hard ? 12 : 8)
  var p = x + y
  var q = x - y
  return {
    text: 'Solve the system:  x + y = ' + p + '  ,  x − y = ' + q,
    answer: 'x = ' + x + ' , y = ' + y,
    answerNum: null,
    distractors: [
      'x = ' + y + ' , y = ' + x,
      'x = ' + (x + 1) + ' , y = ' + (y - 1),
      'x = ' + (x - 1) + ' , y = ' + (y + 1),
    ],
    steps: [
      'Add the two equations: (x + y) + (x − y) = 2x = ' + (p + q) + ' → x = ' + x,
      'Substitute in the first: ' + x + ' + y = ' + p + ' → y = ' + y,
    ],
    trick: 'The elimination method: adding the equations cancels y right away — watch the signs.',
    topic: 'Systems of Equations',
  }
}

function genQuadratic(): GenQ {
  var r1 = ri(1, 9)
  var r2 = ri(1, 9)
  while (r2 === r1) r2 = ri(1, 9)
  var s = r1 + r2
  var pr = r1 * r2
  return {
    text: 'Solve the quadratic equation:  x² − ' + s + 'x + ' + pr + ' = 0',
    answer: 'x = ' + Math.min(r1, r2) + ' or x = ' + Math.max(r1, r2),
    answerNum: null,
    distractors: [
      'x = ' + (r1 + 1) + ' or x = ' + r2,
      'x = ' + r1 + ' or x = ' + (r2 - 1),
      'x = ' + (-r1) + ' or x = ' + (-r2),
    ],
    steps: [
      'We need two numbers whose product is ' + pr + ' and sum is ' + s,
      'The numbers are ' + r1 + ' and ' + r2 + ' → (x − ' + r1 + ')(x − ' + r2 + ') = 0',
      'So: x = ' + r1 + ' or x = ' + r2,
    ],
    trick: 'For the form x² − sx + p: find the two factors whose product is p and sum is s — it solves in seconds.',
    topic: 'Quadratic Equations',
  }
}

function genFraction(op: '+' | '−', hard: boolean): GenQ {
  var b = ri(2, hard ? 12 : 8)
  var d = ri(2, hard ? 12 : 8)
  var a = ri(1, b - 1)
  var c = ri(1, d - 1)
  var lcd = (b * d) / gcd(b, d)
  var num = op === '+' ? (a * (lcd / b) + c * (lcd / d)) : (a * (lcd / b) - c * (lcd / d))
  var g = gcd(Math.abs(num), lcd)
  var n2 = num / g
  var d2 = lcd / g
  var frac = function (x: number, y: number) { return x + '/' + y }
  var answer = d2 === 1 ? String(n2) : frac(n2, d2)
  var opTxt = op === '+' ? '+' : '−'
  var distractors: string[] = []
  var cands = op === '+' ? [num + 1, num - 1] : [num + 1, Math.abs(num - 2)]
  for (var i = 0; i < cands.length; i++) {
    var gg = gcd(Math.abs(cands[i]), lcd)
    var nn = cands[i] / gg, dd = lcd / gg
    var sTxt = dd === 1 ? String(nn) : (nn + '/' + dd)
    if (sTxt !== answer && distractors.indexOf(sTxt) === -1) distractors.push(sTxt)
  }
  var gg2 = gcd(Math.abs(a * d + c * b), b * d)
  var crossTxt = (b * d === gg2) ? String((a * d + c * b) / gg2) : (((a * d + c * b) / gg2) + '/' + (b * d / gg2))
  if (crossTxt !== answer && distractors.indexOf(crossTxt) === -1) distractors.push(crossTxt)
  return {
    text: 'Calculate:  ' + a + '/' + b + ' ' + opTxt + ' ' + c + '/' + d + '  = ?',
    answer: answer,
    answerNum: null,
    distractors: distractors.slice(0, 3),
    steps: [
      'The least common denominator = ' + lcd + '  (because ' + b + ' × ' + (lcd / b) + ' = ' + lcd + ' and ' + d + ' × ' + (lcd / d) + ' = ' + lcd + ')',
      op === '+'
        ? ('Add: (' + (a * (lcd / b)) + ' + ' + (c * (lcd / d)) + ') ÷ ' + lcd + ' = ' + num + '/' + lcd)
        : ('Subtract: (' + (a * (lcd / b)) + ' − ' + (c * (lcd / d)) + ') ÷ ' + lcd + ' = ' + num + '/' + lcd),
      num < 0 ? 'The result is negative — keep its sign while simplifying' : 'Simplify by dividing by ' + g + ' → ' + answer,
    ],
    trick: 'The rule: add the numerators over a common denominator — NEVER add numerator with numerator and denominator with denominator.',
    topic: 'Adding & Subtracting Fractions',
  }
}

function genFractionMul(hard: boolean): GenQ {
  var b = ri(2, hard ? 10 : 6)
  var d = ri(2, hard ? 10 : 6)
  var a = ri(1, b)
  var c = ri(1, d)
  var num = a * c
  var den = b * d
  var g = gcd(num, den)
  var n2 = num / g, d2 = den / g
  var answer = d2 === 1 ? String(n2) : (n2 + '/' + d2)
  return {
    text: 'Calculate:  ' + a + '/' + b + ' × ' + c + '/' + d + '  = ?',
    answer: answer,
    answerNum: null,
    distractors: [
      d2 === 1 ? String(n2 + 1) : ((n2 + 1) + '/' + d2),
      (a + c) + '/' + (b + d),
      (a * d + c * b) + '/' + (b * d),
    ].filter(function (s) { return s !== answer }).slice(0, 3),
    steps: [
      'Multiply: numerator × numerator and denominator × denominator = ' + num + '/' + den,
      'Simplify by dividing by ' + g + ' → ' + answer,
    ],
    trick: 'When multiplying fractions, simplify BEFORE multiplying — saves time and effort.',
    topic: 'Multiplying Fractions',
  }
}

function genPercentOf(hard: boolean): GenQ {
  var p = pick(hard ? [15, 35, 45, 65, 85] : [5, 10, 20, 25, 50])
  var N = ri(2, hard ? 30 : 12) * 20
  var ans = (p * N) / 100
  return {
    text: 'Calculate:  ' + p + '% of ' + N + ' = ?',
    answer: String(ans),
    answerNum: ans,
    steps: [
      'Convert the percentage to a fraction: ' + p + '% = ' + p + '/100',
      'Multiply: ' + p + ' × ' + N + ' ÷ 100 = ' + ans,
    ],
    trick: '10% = divide by 10, 50% = half, 25% = quarter — memorize these shortcuts.',
    topic: 'Percentage',
  }
}

function genPercentChange(hard: boolean): GenQ {
  var up = Math.random() < 0.6
  var M = pick([100, 200, 300, 400, 500, 800])
  var p = pick(hard ? [15, 30, 45] : [10, 20, 25, 50])
  var ans = up ? (M * (100 + p) / 100) : (M * (100 - p) / 100)
  return {
    text: up
      ? ('A product costs ' + M + ' EGP and its price increased by ' + p + '% — what is the new price?')
      : ('A product costs ' + M + ' EGP and its price decreased by ' + p + '% — what is the new price?'),
    answer: String(ans),
    answerNum: ans,
    steps: [
      'The change = ' + p + '% of ' + M + ' = ' + ((p * M) / 100) + ' EGP',
      up ? 'New price = ' + M + ' + ' + ((p * M) / 100) + ' = ' + ans : 'New price = ' + M + ' − ' + ((p * M) / 100) + ' = ' + ans,
    ],
    trick: 'Increase: multiply by (1 + p/100) — decrease: multiply by (1 − p/100) — one step.',
    topic: 'Percentage Change',
  }
}

function genPercentChain(): GenQ {
  var combos = [
    { M: 200, up: 25, down: 10 }, { M: 400, up: 20, down: 10 },
    { M: 300, up: 20, down: 20 }, { M: 500, up: 10, down: 20 },
    { M: 600, up: 50, down: 20 },
  ]
  var c = pick(combos)
  var mid = (c.M * (100 + c.up)) / 100
  var fin = (mid * (100 - c.down)) / 100
  return {
    text: 'A phone costs ' + c.M + ' EGP, its price increased by ' + c.up + '% then decreased by ' + c.down + '% — what is the final price?',
    answer: String(fin),
    answerNum: fin,
    steps: [
      'After the increase: ' + c.M + ' × ' + (100 + c.up) + '/100 = ' + mid,
      'After the decrease: ' + mid + ' × ' + (100 - c.down) + '/100 = ' + fin,
    ],
    trick: 'Never add the percentages (+15% and −10% is NOT 5%) — each change applies to the new price.',
    topic: 'Successive Percentages',
    difficulty: 'Hard',
  }
}

var PYTHO_TRIPLES = [[3, 4, 5], [6, 8, 10], [5, 12, 13], [9, 12, 15], [8, 15, 17], [12, 16, 20], [7, 24, 25], [20, 21, 29], [10, 24, 26], [18, 24, 30]]

function genPythagoras(hard: boolean): GenQ {
  var t = pick(hard ? PYTHO_TRIPLES.slice(4) : PYTHO_TRIPLES.slice(0, 5))
  var askHyp = Math.random() < 0.6
  if (askHyp) {
    var cAns = t[2]
    return {
      text: 'A right triangle has legs of length ' + t[0] + ' and ' + t[1] + ' — find the hypotenuse',
      answer: String(cAns),
      answerNum: cAns,
      steps: [
        'Pythagoras theorem: (hypotenuse)² = (leg 1)² + (leg 2)²',
        '(hypotenuse)² = ' + t[0] + '² + ' + t[1] + '² = ' + (t[0] * t[0]) + ' + ' + (t[1] * t[1]) + ' = ' + (t[2] * t[2]),
        'Hypotenuse = √' + (t[2] * t[2]) + ' = ' + cAns,
      ],
      trick: 'Memorize the famous triples (3,4,5), (5,12,13), (8,15,17) — they save half the time.',
      topic: 'Pythagorean Theorem',
    }
  }
  // ضلع ناقص: نعطي الوتر وقائم واحد
  var miss = t[0]
  var known = t[1]
  return {
    text: 'A right triangle has a hypotenuse of ' + t[2] + ' and one leg of ' + known + ' — find the other leg',
    answer: String(miss),
    answerNum: miss,
    steps: [
      '(hypotenuse)² = (leg 1)² + (leg 2)²',
      (t[2] * t[2]) + ' = ' + (known * known) + ' + (leg 2)²',
      '(leg 2)² = ' + (t[2] * t[2] - known * known) + ' → leg 2 = ' + miss,
    ],
    trick: 'The hypotenuse is ALWAYS the longest side — if you get a smaller one, you made a calculation mistake.',
    topic: 'Pythagorean Theorem (Inverse)',
  }
}

function genRectArea(hard: boolean): GenQ {
  var askArea = Math.random() < 0.5
  var w = ri(3, hard ? 18 : 10)
  var h = ri(3, hard ? 15 : 9)
  if (askArea) {
    var a = w * h
    return {
      text: 'A rectangle has length ' + w + ' cm and width ' + h + ' cm — find its area',
      answer: String(a),
      answerNum: a,
      steps: ['Area of rectangle = length × width', 'Area = ' + w + ' × ' + h + ' = ' + a + ' cm²'],
      trick: 'Area always has a squared unit (cm²) — do not forget to write it.',
      topic: 'Area of a Rectangle',
    }
  }
  var p = 2 * (w + h)
  return {
    text: 'A rectangle has length ' + w + ' cm and width ' + h + ' cm — find its perimeter',
    answer: String(p),
    answerNum: p,
    steps: ['Perimeter of rectangle = 2 × (length + width)', 'Perimeter = 2 × (' + w + ' + ' + h + ') = ' + p + ' cm'],
    trick: 'Perimeter is a walk around the shape — a plain linear unit (cm), not squared.',
    topic: 'Perimeter of a Rectangle',
  }
}

function genTriangleArea(): GenQ {
  var b = ri(2, 12) * 2
  var h = ri(3, 12)
  var a = (b * h) / 2
  return {
    text: 'A triangle has a base of ' + b + ' cm and a height of ' + h + ' cm — its area = ?',
    answer: String(a),
    answerNum: a,
    steps: ['Area of triangle = ½ × base × height', 'Area = ½ × ' + b + ' × ' + h + ' = ' + a + ' cm²'],
    trick: 'The height must be PERPENDICULAR to the base — not just any side counts as a height.',
    topic: 'Area of a Triangle',
  }
}

function genCircle(): GenQ {
  var r = pick([7, 14, 21, 28, 35])
  var askArea = Math.random() < 0.5
  if (askArea) {
    var a = (22 * r * r) / 7
    return {
      text: 'A circle has a radius of ' + r + ' cm — find its area (π = 22/7)',
      answer: String(a),
      answerNum: a,
      steps: [
        'Area of a circle = π × r²',
        'Area = 22/7 × ' + r + ' × ' + r + ' = ' + a + ' cm²',
      ],
      trick: 'When the radius is a multiple of 7, use π = 22/7 — the division always comes out clean.',
      topic: 'Area of a Circle',
    }
  }
  var c = (44 * r) / 7
  return {
    text: 'A circle has a radius of ' + r + ' cm — find its circumference (π = 22/7)',
    answer: String(c),
    answerNum: c,
    steps: [
      'Circumference of a circle = 2 × π × r',
      'Circumference = 2 × 22/7 × ' + r + ' = ' + c + ' cm',
    ],
    trick: 'Circumference = 44/7 × r — multiples of 7 divide nicely.',
    topic: 'Circumference of a Circle',
  }
}

function genCuboidVol(): GenQ {
  var l = ri(2, 12), w = ri(2, 10), h = ri(2, 9)
  var v = l * w * h
  return {
    text: 'A cuboid measures ' + l + ' × ' + w + ' × ' + h + ' cm — find its volume',
    answer: String(v),
    answerNum: v,
    steps: ['Volume = length × width × height', 'Volume = ' + l + ' × ' + w + ' × ' + h + ' = ' + v + ' cm³'],
    trick: 'Volume always has a cubic unit (cm³) — the three dimensions multiply together.',
    topic: 'Volume of a Cuboid',
  }
}

function genCylinderVol(): GenQ {
  var r = pick([7, 14, 21])
  var h = ri(3, 15)
  var v = (22 * r * r * h) / 7
  return {
    text: 'A cylinder has a base radius of ' + r + ' cm and a height of ' + h + ' cm — find its volume (π = 22/7)',
    answer: String(v),
    answerNum: v,
    steps: [
      'Volume of a cylinder = π × r² × height',
      'Volume = 22/7 × ' + (r * r) + ' × ' + h + ' = ' + v + ' cm³',
    ],
    trick: 'Think of it as circular layers stacked up: base area × height.',
    topic: 'Volume of a Cylinder',
  }
}

function genExponents(hard: boolean): GenQ {
  var kind = ri(1, 3)
  var a = pick([2, 3, 5])
  var m = ri(2, hard ? 5 : 3)
  var n = ri(2, hard ? 4 : 3)
  if (kind === 1) {
    var ans = Math.pow(a, m + n)
    return {
      text: 'Calculate:  ' + a + '^' + m + ' × ' + a + '^' + n + ' = ?',
      answer: String(ans),
      answerNum: ans,
      steps: [
        'Same base → add the exponents: ' + a + '^(' + m + '+' + n + ') = ' + a + '^' + (m + n),
        'The result = ' + ans,
      ],
      trick: 'Product rule for same base: add the exponents — the base stays as it is.',
      topic: 'Laws of Exponents',
    }
  }
  if (kind === 2) {
    var m2 = Math.max(m, n), n2 = Math.min(m, n)
    var ans2 = Math.pow(a, m2 - n2)
    return {
      text: 'Calculate:  ' + a + '^' + m2 + ' ÷ ' + a + '^' + n2 + ' = ?',
      answer: String(ans2),
      answerNum: ans2,
      steps: [
        'Division with same base → subtract the exponents: ' + a + '^(' + m2 + '−' + n2 + ') = ' + a + '^' + (m2 - n2),
        'The result = ' + ans2,
      ],
      trick: 'Division = subtract exponents. Multiplication = add exponents. Do not mix them up.',
      topic: 'Laws of Exponents',
    }
  }
  var ans3 = Math.pow(a, m * n)
  return {
    text: 'Calculate:  (' + a + '^' + m + ')^' + n + ' = ?',
    answer: String(ans3),
    answerNum: ans3,
    steps: [
      'A power over a power → multiply the exponents: ' + a + '^(' + m + '×' + n + ') = ' + a + '^' + (m * n),
      'The result = ' + ans3,
    ],
    trick: 'An outer power over an inner power = multiply the exponents together.',
    topic: 'Laws of Exponents',
  }
}

function genRoots(hard: boolean): GenQ {
  if (hard && Math.random() < 0.5) {
    var a = ri(2, 9), b = ri(2, 9)
    var ans = a * b
    return {
      text: 'Calculate:  √(' + (a * a) + ' × ' + (b * b) + ') = ?',
      answer: String(ans),
      answerNum: ans,
      steps: [
        '√(x × y) = √x × √y',
        '= ' + a + ' × ' + b + ' = ' + ans,
      ],
      trick: 'The square root splits over multiplication: take the root of each factor then multiply.',
      topic: 'Square Roots',
    }
  }
  var n = ri(4, 30)
  return {
    text: 'Calculate:  √' + (n * n) + ' = ?',
    answer: String(n),
    answerNum: n,
    steps: ['We need a number that gives ' + (n * n) + ' when multiplied by itself', 'The number is ' + n + ' because ' + n + ' × ' + n + ' = ' + (n * n)],
    trick: 'Memorize the perfect squares up to 30² — square roots become a piece of cake.',
    topic: 'Square Roots',
  }
}

function genAverage(hard: boolean): GenQ {
  var avg = ri(5, hard ? 40 : 20)
  var n1 = avg - ri(1, 6)
  var n2 = avg + ri(1, 6)
  var n3 = avg - ri(1, 4)
  var n4 = 4 * avg - n1 - n2 - n3
  if (n4 <= 0 || n4 === n1 || n4 === n2 || n4 === n3) {
    n4 = avg + ri(1, 5)
    n3 = 4 * avg - n1 - n2 - n4
    if (n3 <= 0) n3 = avg
  }
  return {
    text: 'A student scored ' + n1 + ', ' + n2 + ', ' + n3 + ', ' + n4 + ' in 4 subjects — find the mean (average)',
    answer: String(avg),
    answerNum: avg,
    steps: [
      'The sum = ' + n1 + ' + ' + n2 + ' + ' + n3 + ' + ' + n4 + ' = ' + (4 * avg),
      'Mean = sum ÷ count = ' + (4 * avg) + ' ÷ 4 = ' + avg,
    ],
    trick: 'Trick: if the numbers are close to each other, spot the one in the middle — it is usually the mean.',
    topic: 'Arithmetic Mean',
  }
}

function genSpeed(hard: boolean): GenQ {
  var v = pick(hard ? [45, 65, 75, 85] : [40, 50, 60, 70, 80])
  var t = ri(2, hard ? 6 : 4)
  var s = v * t
  var kind = ri(1, 2)
  if (kind === 1) {
    return {
      text: 'A car travels at ' + v + ' km/h for ' + t + ' hours — find the distance covered',
      answer: String(s),
      answerNum: s,
      steps: ['Distance = speed × time', 'Distance = ' + v + ' × ' + t + ' = ' + s + ' km'],
      trick: 'The magic triangle: distance on top, speed and time below — cover the one you want.',
      topic: 'Speed & Distance',
    }
  }
  return {
    text: 'A car covered ' + s + ' km at ' + v + ' km/h — how long did the trip take?',
    answer: String(t),
    answerNum: t,
    steps: ['Time = distance ÷ speed', 'Time = ' + s + ' ÷ ' + v + ' = ' + t + ' hours'],
    trick: 'Time = distance ÷ speed — keep the units: km ÷ km/h = hours.',
    topic: 'Speed & Time',
  }
}

function genLcmGcd(): GenQ {
  var a = ri(4, 24), b = ri(4, 24)
  var wantGcd = Math.random() < 0.5
  if (wantGcd) {
    var g = gcd(a, b)
    return {
      text: 'Find the greatest common factor (GCF) of ' + a + ' and ' + b,
      answer: String(g),
      answerNum: g,
      steps: [
        'Factors of ' + a + ': ' + factorsText(a),
        'Factors of ' + b + ': ' + factorsText(b),
        'The greatest common factor = ' + g,
      ],
      trick: 'The GCF is never larger than the smaller number — cross out anything bigger right away.',
      topic: 'Greatest Common Factor',
    }
  }
  var l = (a * b) / gcd(a, b)
  return {
    text: 'Find the least common multiple (LCM) of ' + a + ' and ' + b,
    answer: String(l),
    answerNum: l,
    steps: [
      'The GCF = ' + gcd(a, b),
      'LCM = (first × second) ÷ GCF = ' + (a * b) + ' ÷ ' + gcd(a, b) + ' = ' + l,
    ],
    trick: 'LCM is always ≥ the larger number, and GCF is always ≤ the smaller number.',
    topic: 'Least Common Multiple',
  }
}

function factorsText(n: number): string {
  var out: string[] = []
  for (var i = 1; i <= n; i++) if (n % i === 0) out.push(String(i))
  return out.join(', ')
}

function genLikeTerms(): GenQ {
  var add = Math.random() < 0.5
  var v = pick(['x', 'y', 'z'])
  if (add) {
    var a = ri(3, 12), b = ri(2, 9)
    return {
      text: 'Simplify:  ' + a + v + ' + ' + b + v + ' = ?',
      answer: (a + b) + v,
      answerNum: null,
      distractors: [(a * b) + v, (a + b) + v + '²', (a + b + 1) + v],
      steps: [
        'Like terms (same ' + v + ') add together',
        '(' + a + ' + ' + b + ')' + v + ' = ' + (a + b) + v,
      ],
      trick: 'Like terms are like apples with apples: 3 apples + 5 apples = 8 apples.',
      topic: 'Simplifying Algebraic Expressions',
    }
  }
  var a2 = ri(5, 14), b2 = ri(2, 4)
  return {
    text: 'Simplify:  ' + a2 + v + ' − ' + b2 + v + ' = ?',
    answer: (a2 - b2) + v,
    answerNum: null,
    distractors: [(a2 - b2 - 1) + v, (a2 * b2) + v, (a2 - b2) + v + '²'],
    steps: [
      'Subtract the coefficients because the terms are like terms',
      '(' + a2 + ' − ' + b2 + ')' + v + ' = ' + (a2 - b2) + v,
    ],
    trick: 'You can never subtract unlike terms: x − y never becomes a single term.',
    topic: 'Simplifying Algebraic Expressions',
  }
}

function genProportion(): GenQ {
  var unit = pick([3, 4, 5, 6, 8, 10, 12, 15])
  var q1 = ri(2, 6)
  var q2 = q1 + ri(1, 6)
  var p1 = unit * q1
  var ans = unit * q2
  var item = pick(['pens', 'notebooks', 'rulers', 'books'])
  return {
    text: 'If ' + q1 + ' ' + item + ' cost ' + p1 + ' EGP, how much do ' + q2 + ' ' + item + ' of the same kind cost?',
    answer: String(ans),
    answerNum: ans,
    steps: [
      'Price of one item = ' + p1 + ' ÷ ' + q1 + ' = ' + unit + ' EGP',
      'Price of ' + q2 + ' items = ' + unit + ' × ' + q2 + ' = ' + ans + ' EGP',
    ],
    trick: 'In direct proportion: divide to get the unit price, then multiply.',
    topic: 'Ratio & Proportion',
  }
}

function genTriangleAngles(): GenQ {
  var a1 = ri(30, 75)
  var a2 = ri(30, 80)
  while (a2 === a1) a2 = ri(30, 80)
  var a3 = 180 - a1 - a2
  if (a3 < 15) { a3 = 15 + ri(0, 20); a1 = 180 - a2 - a3 }
  return {
    text: 'A triangle has two angles of ' + a1 + '° and ' + a2 + '° — find the third angle',
    answer: String(a3),
    answerNum: a3,
    steps: [
      'The sum of angles in a triangle = 180°',
      'The third angle = 180 − (' + a1 + ' + ' + a2 + ') = ' + a3 + '°',
    ],
    trick: 'The 180° rule is one of the most important laws — it solves half of geometry questions.',
    topic: 'Angles of a Triangle',
  }
}

function genSimplifyFraction(): GenQ {
  var g = pick([2, 3, 4, 5, 6])
  var n2 = ri(2, 9)
  var num = n2 * g
  var den = n2 * g + g * ri(1, 5)
  var gg = gcd(num, den)
  var ans = (num / gg) + '/' + (den / gg)
  return {
    text: 'Simplify the fraction:  ' + num + '/' + den,
    answer: ans,
    answerNum: null,
    distractors: [
      (num / (gg * 2) === Math.floor(num / (gg * 2)) && den / (gg * 2) === Math.floor(den / (gg * 2))) ? (num / (gg * 2)) + '/' + (den / (gg * 2)) : (num) + '/' + (den + 1),
      (num - 1) + '/' + (den - 1),
      (num) + '/' + (den - gg),
    ].filter(function (s) { return s !== ans && s.indexOf('/') > 0 }).slice(0, 3),
    steps: [
      'The greatest common factor of ' + num + ' and ' + den + ' = ' + gg,
      'Divide the numerator and denominator by ' + gg + ' → ' + ans,
    ],
    trick: 'Simplifying: divide the numerator AND the denominator by the same number — if one becomes a decimal, you made a mistake.',
    topic: 'Simplifying Fractions',
  }
}

/* ============================================================
 * (و72) مولّدات السهول الأساسية + الفلاش كاردز — السباق الفردي:
 *   easy   = حساب بسيط (خانات/خانتين) + جدول الضرب + كسور بسيطة
 *   flash  = أسئلة وذكر سريع (حساب فوري) بمدة قصيرة لكل بطاقة
 * كلها بترجع نفس شكل GenQ — الإجابة محسوبة بالكود 100%
 * ============================================================ */
function genArithBasic(hard: boolean): GenQ {
  var kind = pick(hard ? ['mul', 'add', 'sub', 'mul'] : ['add', 'sub', 'mul'])
  if (kind === 'mul') {
    var a = ri(2, hard ? 15 : 9)
    var b = ri(2, hard ? 12 : 9)
    var ans = a * b
    return {
      text: 'Calculate:  ' + a + ' × ' + b + ' = ?',
      answer: String(ans),
      answerNum: ans,
      steps: [a + ' × ' + b + ' = ' + ans],
      trick: hard ? 'Break it: ' + a + ' × ' + b + ' = ' + a + ' × ' + (b - (b % 10)) + ' + ' + a + ' × ' + (b % 10) + '.' : 'Use the times table — memorize it and you answer in one second.',
      topic: 'Multiplication',
    }
  }
  var a2 = ri(11, hard ? 88 : 49)
  var b2 = ri(2, hard ? 78 : 40)
  if (kind === 'add') {
    var sum = a2 + b2
    return {
      text: 'Calculate:  ' + a2 + ' + ' + b2 + ' = ?',
      answer: String(sum),
      answerNum: sum,
      steps: [a2 + ' + ' + b2 + ' = ' + sum],
      trick: 'Add the tens first, then the units — much faster.',
      topic: 'Addition',
    }
  }
  var big = Math.max(a2, b2)
  var small = Math.min(a2, b2)
  var diff = big - small
  return {
    text: 'Calculate:  ' + big + ' − ' + small + ' = ?',
    answer: String(diff),
    answerNum: diff,
    steps: [big + ' − ' + small + ' = ' + diff],
    trick: 'Count up from the small number to the big one — that is the answer.',
    topic: 'Subtraction',
  }
}

function genTimesTable(hard: boolean): GenQ {
  var n = pick([2, 3, 4, 5, 6, 7, 8, 9])
  var k = ri(2, hard ? 12 : 9)
  var ans = n * k
  return {
    text: 'Calculate:  ' + n + ' × ' + k + ' = ?',
    answer: String(ans),
    answerNum: ans,
    steps: [n + ' × ' + k + ' = ' + ans],
    trick: hard ? n + ' × ' + k + ' = ' + n + ' × ' + (k - 1) + ' + ' + n + ' = ' + (ans - n) + ' + ' + n + '.' : 'The ' + n + ' times table: just add ' + n + ' every step.',
    topic: 'Times Tables',
  }
}

function genSquareFact(hard: boolean): GenQ {
  var n = ri(4, hard ? 20 : 12)
  var ans = n * n
  return {
    text: 'Calculate:  ' + n + '^2 = ?',
    answer: String(ans),
    answerNum: ans,
    steps: [n + '^2 = ' + n + ' × ' + n + ' = ' + ans],
    trick: hard ? '(' + n + ')^2 = (' + (n - 1) + ')^2 + 2×' + (n - 1) + ' + 1 = ' + ((n - 1) * (n - 1)) + ' + ' + (2 * (n - 1)) + ' + 1.' : 'Squares up to 12 are worth memorizing: 11^2 = 121, 12^2 = 144.',
    topic: 'Squares',
  }
}

function genSimpleFraction(hard: boolean): GenQ {
  var d = pick(hard ? [6, 8, 9, 10, 12] : [3, 4, 5, 6, 8])
  var n1 = ri(1, d - 2)
  var n2 = ri(1, d - n1 - 1)
  var num = n1 + n2
  var gg = gcd(num, d)
  var rn = num / gg
  var rd = d / gg
  var ans = rd === 1 ? String(rn) : rn + '/' + rd
  var wrong1 = gg === 1 ? (num + 1) + '/' + d : num + '/' + d
  var wrong2 = rd === 1 ? String(rn + 1) : (rn + 1) + '/' + (rd + 1)
  var wrong3 = rd === 1 ? String(rn + 2) : (rn - 1 > 0 ? rn - 1 : rn + 2) + '/' + rd
  return {
    text: 'Calculate:  ' + n1 + '/' + d + ' + ' + n2 + '/' + d + ' = ?',
    answer: ans,
    answerNum: null,
    distractors: [wrong1, wrong2, wrong3].filter(function (s, si, arr) { return s !== ans && s.indexOf('0/') !== 0 && arr.indexOf(s) === si }),
    steps: [
      'Same denominator: add the numerators → ' + n1 + ' + ' + n2 + ' = ' + num + ' → ' + num + '/' + d,
      gg > 1 ? 'Simplify by ' + gg + ' → ' + ans : 'Already in simplest form: ' + ans,
    ],
    trick: 'Same denominator? Add the tops only — the bottom never changes.',
    topic: 'Basic Fractions',
  }
}

var GENERATORS_EASY = [genLinear, genPercentOf, genRectArea, genAverage, genExponents, genRoots, genSpeed, genLikeTerms, genSimplifyFraction, genTriangleAngles, genProportion, genFractionMul]
var GENERATORS_MED = [genFraction, genPythagoras, genCircle, genCuboidVol, genPercentChange, genSystem2x2, genLinearBrackets, genLcmGcd, genProportion, genCylinderVol, genTriangleArea]
var GENERATORS_HARD = [genQuadratic, genPercentChain, genSystem2x2, genPythagoras, genLinearBrackets, genFraction, genCylinderVol, genExponents]
/* (و72) عائلات السهول (حساب بسيط + جدول ضرب + كسور بسيطة) وعائلات الفلاش (ذكر سريع) */
var GENERATORS_BASICS = [genArithBasic, genTimesTable, genSimpleFraction, genSimplifyFraction]
var GENERATORS_FLASH = [genTimesTable, genArithBasic, genSquareFact]

/* ============================================================
 * 1) مولّد أسئلة «اتدرب أكتر» — 10 أسئلة بخطوات وخدع
 *    topic: كلام الطالب — بنحلل الكلمات المفتاحية ونختار المولّدات المناسبة
 *    (الكلمات المفتاحية بتدعم عربي وإنجليزي — الطالب يكتب بأي لغة)
 * ============================================================ */
var TOPIC_KEYWORDS: Array<{ re: RegExp; keys: string[] }> = [
  { re: /(معادل|مجهول|equation|solve|x\s*=|حل\s+و)/i, keys: ['linear', 'brackets', 'system', 'quadratic'] },
  { re: /(تربيعية|تربيعي|quadratic|x²|x\^2)/i, keys: ['quadratic'] },
  { re: /(كسر|كسور|قوام|بسط|مقام|fraction)/i, keys: ['fracAdd', 'fracSub', 'fracMul', 'simplify'] },
  { re: /(نسبة|مئوي|%|بالمئة|خصم|ربح|percent|discount)/i, keys: ['percentOf', 'percentChange', 'percentChain'] },
  { re: /(فيثاغورس|قائم|وتر|قائمه|pythagor)/i, keys: ['pytho'] },
  { re: /(مساح|محيط|دائرة|مستطيل|مثلث|مربع|area|perimeter|circle|rectangle|triangle)/i, keys: ['rectArea', 'triArea', 'circle', 'angles'] },
  { re: /(حجم|أسطوانة|مكعب|متوازي|volume|cylinder|cuboid)/i, keys: ['cuboid', 'cylinder'] },
  { re: /(أس|أسس|قوة|أُس|قدرة|exponent|power)/i, keys: ['exp', 'roots'] },
  { re: /(جذر|تربيع\s*الجذر|√|root|square root)/i, keys: ['roots'] },
  { re: /(متوسط|وسط\s*حسابي|إحصاء|average|mean|statistics)/i, keys: ['average'] },
  { re: /(سرعة|مسافة|زمن|ساعة|كم|speed|distance|time)/i, keys: ['speed'] },
  { re: /(مضاعف|عامل\s+مشترك|تحليل|lcm|gcf|multiple|factor)/i, keys: ['lcmGcd'] },
  { re: /(تبسيط|حدود|جبر|متشابهة|simplify|like terms|algebra)/i, keys: ['likeTerms'] },
  { re: /(تناسب|تناسب طردى|طردية|نسبة\s+سعر|proportion|ratio)/i, keys: ['proportion'] },
]

/* (2026-و71) matchTopicKey — هل نص الطالب بيطابق موضوع من مواضيع المنصة المعروفة؟
   بيرجع الـ keys المتطابقة (فاضية = مش موضوع معروف → ساعتها بس نتوجه للـ AI).
   بتستخدم في /api/ai/practice عشان المحرك المحلي المضمون (ماث إنجليزي
   محسوب بالكود زي امتحانات المنصة بالظبط) يشتغل **الأول** للمواضيع المعروفة. */
export function matchTopicKey(text: string): string[] {
  var t = String(text || '')
  var keys: string[] = []
  for (var i = 0; i < TOPIC_KEYWORDS.length; i++) {
    if (TOPIC_KEYWORDS[i].re.test(t)) {
      var ks = TOPIC_KEYWORDS[i].keys
      for (var k = 0; k < ks.length; k++) {
        if (keys.indexOf(ks[k]) === -1) keys.push(ks[k])
      }
    }
  }
  return keys
}

function pickGeneratorsFor(topic: string): Array<{ fn: Function; key: string }> {
  var t = String(topic || '')
  var keys: string[] = []
  for (var i = 0; i < TOPIC_KEYWORDS.length; i++) {
    if (TOPIC_KEYWORDS[i].re.test(t)) {
      for (var k = 0; k < TOPIC_KEYWORDS[i].keys.length; k++) {
        if (keys.indexOf(TOPIC_KEYWORDS[i].keys[k]) === -1) keys.push(TOPIC_KEYWORDS[i].keys[k])
      }
    }
  }
  if (keys.length === 0) {
    // طلب عام → خليط متوازن من كل المنهج
    keys = ['linear', 'fracAdd', 'percentOf', 'pytho', 'rectArea', 'exp', 'average', 'speed', 'likeTerms', 'circle', 'system', 'proportion']
  }
  var map: Record<string, { fn: Function }> = {
    linear: { fn: genLinear }, brackets: { fn: genLinearBrackets }, system: { fn: genSystem2x2 },
    quadratic: { fn: genQuadratic }, fracAdd: { fn: function (h) { return genFraction('+', h) } },
    fracSub: { fn: function (h) { return genFraction('−', h) } }, fracMul: { fn: genFractionMul },
    simplify: { fn: genSimplifyFraction }, percentOf: { fn: genPercentOf },
    percentChange: { fn: genPercentChange }, percentChain: { fn: genPercentChain },
    pytho: { fn: genPythagoras }, rectArea: { fn: genRectArea }, triArea: { fn: genTriangleArea },
    circle: { fn: genCircle }, cuboid: { fn: genCuboidVol }, cylinder: { fn: genCylinderVol },
    exp: { fn: genExponents }, roots: { fn: genRoots }, average: { fn: genAverage },
    speed: { fn: genSpeed }, lcmGcd: { fn: genLcmGcd }, likeTerms: { fn: genLikeTerms },
    proportion: { fn: genProportion }, angles: { fn: genTriangleAngles },
  }
  var out = []
  for (var j = 0; j < keys.length; j++) {
    if (map[keys[j]]) out.push({ fn: map[keys[j]].fn, key: keys[j] })
  }
  return out.length > 0 ? out : [{ fn: genLinear, key: 'linear' }]
}

/* توليد أسئلة تدريب — (و72) العدد بيبقى parameter (افتراضي 10) وصعوبتها
   بتزيد تدريجيًا (~30% سهل في الأول / ~40% متوسط / الباقي صعب) */
export function generatePracticeSet(topic: string, count?: number): PracticeQuestion[] {
  var n = Math.max(1, Math.min(Number(count) || 10, 50))
  var gens = pickGeneratorsFor(topic)
  var out: PracticeQuestion[] = []
  var usedTexts: Record<string, boolean> = {}
  /* خطة الصعوبة — تدرج حسب العدد المطلوب (10 → 3/4/3 زي ما كان بالظبط) */
  var nEasy = Math.max(1, Math.round(n * 0.3))
  var nHard = Math.max(1, Math.round(n * 0.3))
  var nMed = Math.max(0, n - nEasy - nHard)
  var plan: string[] = []
  for (var pe = 0; pe < nEasy; pe++) plan.push('easy')
  for (var pm = 0; pm < nMed; pm++) plan.push('med')
  for (var ph = 0; ph < nHard; ph++) plan.push('hard')
  var attempts = 0
  while (out.length < n && attempts < 200) {
    attempts++
    var idx = out.length
    var diff = plan[idx] || 'med'
    var g = gens[(idx + Math.floor(Math.random() * gens.length)) % gens.length]
    var hard = diff === 'hard'
    var q: GenQ = null
    try { q = g.fn(hard) } catch (e) { continue }
    if (!q || !q.text || usedTexts[q.text]) continue
    usedTexts[q.text] = true
    out.push({
      id: uid(),
      question: q.text,
      answer: String(q.answer),
      steps: (q.steps || []).map(function (s) { return String(s) }),
      trick: String(q.trick || ''),
      topic: String(q.topic || ''),
      difficulty: diff === 'easy' ? 'Easy' : (diff === 'med' ? 'Medium' : 'Hard'),
    })
  }
  // لو اتعذر إكمال العدد المطلوب (نظريًا مستحيل) — كرر بمولد عام
  while (out.length < n) {
    var q2 = genLinear(true)
    out.push({ id: uid(), question: q2.text, answer: q2.answer, steps: q2.steps, trick: q2.trick, topic: q2.topic, difficulty: 'Hard' })
  }
  return out
}

/* ============================================================
 * 2) مولّد أسئلة ساحة التحدي (MCQ) — 4 اختيارات مع مشتتات ذكية
 * ============================================================ */
function buildDistractors(ansNum: number, count: number): string[] {
  var cands = [ansNum + 1, ansNum - 1, ansNum + 2, ansNum - 2, ansNum + 5, ansNum - 5, ansNum * 2, ansNum + 10, ansNum - 10, Math.round(ansNum / 2), ansNum + 3, ansNum - 3]
  var out: string[] = []
  cands = shuffle(cands)
  for (var i = 0; i < cands.length && out.length < count; i++) {
    var c = cands[i]
    if (c === ansNum || c <= 0 || out.indexOf(String(c)) !== -1) continue
    out.push(String(c))
  }
  return out
}

/* ============================================================
 * (و72) مولّد أسئلة السباق — اختيارات MCQ 4 مع مشتتات ذكية + فلتر صعوبة:
 *   opts?: number → (توافق قديم) timeLimitSec ثابت لكل الأسئلة
 *   opts?: { difficulty?: 'easy'|'medium'|'hard'|'mixed',
 *            style?: 'general'|'flash', cardSeconds?: number, timeLimitSec?: number }
 *   easy   = حساب بسيط + جدول الضرب + كسور بسيطة
 *   medium = الخليط الكلاسيكي (السهل + المتوسط)
 *   hard   = خطوات متعددة + نسب + جبر خفيف
 *   mixed  = السلوك الحالي (كل العائلات)
 *   style 'flash' → أسئلة وذكر سريع و timeLimitSec = cardSeconds
 * شكل المخرجات مش متغير خالص: text / options / correctIndex / explanation / timeLimitSec
 * ============================================================ */
function battleHardRoll(difficulty: string): boolean {
  if (difficulty === 'easy') return false
  if (difficulty === 'hard') return Math.random() < 0.9
  return Math.random() < 0.25
}

export function generateBattleQuestions(count: number, opts?: any): BattleQuestion[] {
  var o = (typeof opts === 'number') ? { timeLimitSec: opts } : (opts || {})
  var difficulty = ['easy', 'medium', 'hard', 'mixed'].indexOf(String(o.difficulty || '')) !== -1 ? String(o.difficulty) : 'mixed'
  var style = String(o.style || 'general') === 'flash' ? 'flash' : 'general'
  var cardSeconds = Math.max(5, Math.min(Number(o.cardSeconds) || 15, 90))
  var forcedSec = Number(o.timeLimitSec) || 0
  var n = Math.max(3, Math.min(count || 8, 15))

  var pool: Function[]
  if (style === 'flash') {
    /* فلاش كاردز — عائلات وذكر سريع (الصعوبة بتتحكم في حجم الأرقام جوه المولدات) */
    pool = GENERATORS_FLASH
  } else if (difficulty === 'easy') {
    pool = GENERATORS_BASICS
  } else if (difficulty === 'medium') {
    pool = GENERATORS_EASY.concat(GENERATORS_MED)
  } else if (difficulty === 'hard') {
    pool = GENERATORS_HARD
  } else {
    pool = GENERATORS_EASY.concat(GENERATORS_MED, GENERATORS_HARD)
  }

  var out: BattleQuestion[] = []
  var used: Record<string, boolean> = {}
  var guard = 0
  while (out.length < n && guard < 300) {
    guard++
    var g = pick(pool)
    var q: GenQ = null
    try { q = g(battleHardRoll(difficulty)) } catch (e) { continue }
    if (!q || !q.text || used[q.text]) continue
    var options: string[] = []
    var correctTxt = String(q.answer)
    if (q.answerNum !== null && isFinite(q.answerNum)) {
      var dis = buildDistractors(q.answerNum, 3)
      if (dis.length < 3) continue
      options = shuffle([correctTxt].concat(dis))
    } else {
      var disTxt = (q.distractors || []).filter(function (s: string, si: number, arr: string[]) { return s !== correctTxt && arr.indexOf(s) === si }).slice(0, 3)
      if (disTxt.length < 3) continue
      options = shuffle([correctTxt].concat(disTxt))
    }
    used[q.text] = true
    var timeLimitSec = forcedSec || (style === 'flash' ? cardSeconds : 0) || (25 + Math.floor(Math.random() * 3) * 5)
    out.push({
      id: uid(),
      text: q.text,
      options: options,
      correctIndex: options.indexOf(correctTxt),
      explanation: (q.steps || []).join(' → ') || String(q.trick || ''),
      timeLimitSec: timeLimitSec,
    })
  }
  return out
}

/* بطاقات الفلاش كاردز — أسئلة قصيرة سريعة
   (2026-و68) المدة بتتحدد من الأدمن — الافتراضي 15 ثانية (طلب المستر)
   (و72) بيدعم فلتر الصعوبة + أسلوب الفلاش السريع — والمدة والعدد parameters */
export var FLASHCARD_DEFAULT_SEC = 15

export function generateFlashcards(count: number, timeSec?: number, difficulty?: string): BattleQuestion[] {
  var sec = Math.max(5, Math.min(Number(timeSec) || FLASHCARD_DEFAULT_SEC, 90))
  var qs = generateBattleQuestions(count, { style: 'flash', difficulty: difficulty || 'mixed', cardSeconds: sec })
  return qs
}

/* (2026-و71) تعقيم صارم لمجموعة أسئلة الـ AI — طلب المستر الحرفي:
   «بيجيب لي الحاجات بالعربي بتبقى مش مظبوطة… أنا عاوز الحاجات تبقى بالماث».
   القواعد:
   • إصلاح الماث المكسور أولًا (repairCorruptMath: rac{ / U+FFFD / أسس متسلسلة)
   • رفض أي سؤال/إجابة/خطوة/خدعة فيها حرف عربي /[\u0600-\u06FF]/
   • رفض الأسئلة اللي فيها علامات ماث مكسور (\rac / \f / U+FFFD / undefined / NaN)
   • الإجابة لازم تكون قصيرة منطقيًا (<= 40 حرف)
   اللي يعدي التعقيم بيدخل — والباقي الـ route بيكمله من المحرك المحلي. */
var ARABIC_RE = /[\u0600-\u06FF]/
var BROKEN_MATH_RE = /(?:\uFFFD|\u000C|\\?\brac\s*[\s{(]|undefined|NaN)/

export function sanitizeAiPractice(items: any, maxCount?: number): PracticeQuestion[] {
  var cap = Math.max(1, Math.min(Number(maxCount) || 10, 50))
  var out: PracticeQuestion[] = []
  if (Array.isArray(items)) {
    for (var i = 0; i < items.length && out.length < cap; i++) {
      var it = items[i] || {}
      var q = repairCorruptMath(String(it.question || it.q || '')).trim()
      var a = repairCorruptMath(String(it.answer || it.a || '')).trim()
      var trick = repairCorruptMath(String(it.trick || it.tip || '')).trim()
      var steps = Array.isArray(it.steps)
        ? it.steps.map(function (s) { return repairCorruptMath(String(s)).trim() }).filter(Boolean)
        : []
      if (!q || !a) continue
      /* ممنوع عربي في أي حاجة بتتعرض للطالب — ماث إنجليزي بس */
      if (ARABIC_RE.test(q) || ARABIC_RE.test(a) || ARABIC_RE.test(trick)) continue
      var hasArabicStep = false
      for (var si = 0; si < steps.length; si++) {
        if (ARABIC_RE.test(steps[si])) { hasArabicStep = true; break }
      }
      if (hasArabicStep) continue
      /* علامات الماث المكسور — نص السؤال/الإجابة */
      if (BROKEN_MATH_RE.test(q) || BROKEN_MATH_RE.test(a)) continue
      /* الإجابة القصيرة هي الإجابة — أي حاجة أطول من كده دي شرح مش إجابة */
      if (a.length > 40) continue
      if (steps.length === 0) steps = [a]
      var topicTxt = String(it.topic || '').trim()
      /* موضوع بعربي؟ نشيله خالص (بادج عرض بس) من غير ما نضيّع السؤال السليم */
      if (ARABIC_RE.test(topicTxt)) topicTxt = ''
      out.push({
        id: uid(),
        question: q,
        answer: a,
        steps: steps.slice(0, 6),
        trick: trick,
        topic: topicTxt,
        difficulty: String(it.difficulty || 'Medium').trim(),
      })
    }
  }
  return out
}
