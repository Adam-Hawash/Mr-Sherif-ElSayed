import * as React from 'react'

/*
 * FractionText — FINAL math renderer for the whole platform.
 * Renders mixed plain-text + math as it should appear to students:
 *
 *   1. \frac{a}{b}        → REAL stacked fraction (a above a bar, b below)
 *                            with FULLY NESTED content support:
 *                            \frac{(2^{4})}{(2^{3})}, \frac{2^{12}}{2^{5}},
 *                            \frac{(a^5b^7)(a^4)}{(a^3b^2)} … all work.
 *   2. powers             → 2^5, 2^{12}, x^{n-4} rendered as real superscripts
 *                           (Unicode superscripts ² ³ ⁴ also pass through as-is)
 *   3. subscripts         → x_1, x_{n+1} rendered as real subscripts
 *   4. \sqrt{x}, \sqrt[3]{x} → real radical sign with overline
 *   5. LaTeX symbol commands → Unicode: \times ×, \div ÷, \cdot ·, \pi π,
 *                           \pm ±, \le ≤, \ge ≥, \ne ≠, \approx ≈, \angle ∠ …
 *   6. $…$, $$…$$, \left \right, stray braces → stripped gracefully
 *   7. Legacy: old stacked text "3 ⏎ ─── ⏎ 4" and plain digit "3/4"
 *      fractions are still converted to the same stacked visual.
 *   8. Image markers "[📷 صورة مرفقة: …]" are protected from the math
 *      parser and shown back untouched.
 *
 * Unknown LaTeX commands degrade gracefully (backslash dropped, word kept)
 * so the renderer NEVER leaks raw "\command" junk to the user.
 */

type Node =
  | { t: 'text'; v: string }
  | { t: 'frac'; a: Node[]; b: Node[] }
  | { t: 'sqrt'; deg: Node[] | null; body: Node[] }
  | { t: 'sup'; body: Node[] }
  | { t: 'sub'; body: Node[] }

/* ---------- legacy patterns ---------- */
/* old stacked-text format: "3 \n ─── \n 4" */
var OLD_STACKED_RE = /(\d+(?:\.\d+)?)\s*\n\s*─+\s*\n\s*(\d+(?:\.\d+)?)/g
/* image attachment markers inserted by MathKeyboard */
var IMG_RE = /\[📷[^\]]*\]/g

/* ---------- LaTeX command → Unicode symbol map ---------- */
var SYMBOL_MAP: Record<string, string> = {
  times: '×', div: '÷', cdot: '·', pi: 'π', pm: '±', mp: '∓',
  le: '≤', leq: '≤', ge: '≥', geq: '≥', ne: '≠', neq: '≠',
  approx: '≈', equiv: '≡', propto: '∝', angle: '∠', degree: '°', circ: '∘',
  infty: '∞', because: '∵', therefore: '∴',
  alpha: 'α', beta: 'β', gamma: 'γ', delta: 'δ', Delta: 'Δ', epsilon: 'ε',
  theta: 'θ', lambda: 'λ', mu: 'μ', sigma: 'σ', Sigma: 'Σ', omega: 'ω', Omega: 'Ω',
  phi: 'φ', rho: 'ρ', tau: 'τ', eta: 'η', kappa: 'κ',
  int: '∫', sum: '∑', prod: '∏', sqrtsym: '√',
  cup: '∪', cap: '∩', in: '∈', notin: '∉', subset: '⊂', subseteq: '⊆',
  to: '→', rightarrow: '→', Rightarrow: '⇒', leftarrow: '←', Leftarrow: '⇐',
  leftrightarrow: '↔', uparrow: '↑', downarrow: '↓',
  perp: '⊥', parallel: '∥', nparallel: '∦', percent: '%',
  Triangle: '△', square: '□', bot: '⊥', ast: '∗', star: '⋆',
  sin: 'sin', cos: 'cos', tan: 'tan', cot: 'cot', sec: 'sec', csc: 'csc',
  log: 'log', ln: 'ln', max: 'max', min: 'min', gcd: 'gcd', lcm: 'lcm',
}

/* ---------- protected image markers ---------- */
function protectImages(src: string): { text: string; imgs: string[] } {
  var imgs: string[] = []
  var text = src.replace(IMG_RE, function (m) {
    imgs.push(m)
    return '@IMG' + (imgs.length - 1) + '@'
  })
  return { text: text, imgs: imgs }
}

function restoreImages(nodes: Node[], imgs: string[]): void {
  nodes.forEach(function (n) {
    if (n.t === 'text') {
      n.v = n.v.replace(/@IMG(\d+)@/g, function (_m, d) { return imgs[+d] || '' })
    } else if (n.t === 'frac') {
      restoreImages(n.a, imgs); restoreImages(n.b, imgs)
    } else if (n.t === 'sqrt') {
      if (n.deg) restoreImages(n.deg, imgs)
      restoreImages(n.body, imgs)
    } else if (n.t === 'sup' || n.t === 'sub') {
      restoreImages(n.body, imgs)
    }
  })
}

/* ---------- plain digit "a/b" → \frac{a}{b} (guarded like legacy) ---------- */
function convertSlashFractions(src: string): string {
  var re = /(\d{1,4})\s*\/\s*(\d{1,4})/g
  var out = ''
  var last = 0
  var m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    var before = m.index > 0 ? src[m.index - 1] : ''
    var afterIdx = m.index + m[0].length
    var after = afterIdx < src.length ? src[afterIdx] : ''
    /* keep "1/2/3", "3.5/2", urls like http:// … as plain text */
    if (/[\d\/.:]/.test(before) || /[\d\/]/.test(after)) continue
    out += src.slice(last, m.index) + '\\frac{' + m[1] + '}{' + m[2] + '}'
    last = afterIdx
  }
  out += src.slice(last)
  return out
}

/* ---------- recursive-descent parser ---------- */

/* reads a {…} group starting at idx (handles nesting) */
function readGroup(src: string, idx: number): { nodes: Node[]; idx: number } | null {
  if (src[idx] !== '{') return null
  var depth = 0
  for (var j = idx; j < src.length; j++) {
    var ch = src[j]
    if (ch === '\\') { j++; continue } /* skip escaped char */
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return { nodes: parse(src.slice(idx + 1, j)), idx: j + 1 }
    }
  }
  /* unbalanced — consume the rest */
  return { nodes: parse(src.slice(idx + 1)), idx: src.length }
}

/* reads the argument of ^ or _ : {group} | digit-run | single char */
function readArg(src: string, idx: number): { nodes: Node[]; idx: number } | null {
  if (idx >= src.length) return null
  if (src[idx] === '{') return readGroup(src, idx)
  var m = /^\d+/.exec(src.slice(idx))
  if (m) return { nodes: parse(m[0]), idx: idx + m[0].length }
  return { nodes: parse(src[idx]), idx: idx + 1 }
}

function parse(src: string): Node[] {
  var nodes: Node[] = []
  var buf = ''
  var i = 0

  var flush = function () {
    if (buf) { nodes.push({ t: 'text', v: buf }); buf = '' }
  }

  while (i < src.length) {
    var c = src[i]

    if (c === '\\') {
      var mCmd = /^[a-zA-Z]+/.exec(src.slice(i + 1))
      if (mCmd) {
        var name = mCmd[0]
        i += 1 + name.length

        if (name === 'frac' || name === 'dfrac' || name === 'tfrac' || name === 'cfrac') {
          var ga = readGroup(src, i)
          if (ga) {
            var gb = readGroup(src, ga.idx)
            if (gb) {
              i = gb.idx
              flush()
              nodes.push({ t: 'frac', a: ga.nodes, b: gb.nodes })
              continue
            }
            /* \frac{a} missing denominator → degrade to text */
            buf += '\\frac{' + renderPlain(ga.nodes) + '}{?}'
            i = ga.idx
            continue
          }
          /* \frac12 without braces → single-token args */
          var aa = readArg(src, i)
          if (aa) {
            var ab = readArg(src, aa.idx)
            if (ab) {
              i = ab.idx
              flush()
              nodes.push({ t: 'frac', a: aa.nodes, b: ab.nodes })
              continue
            }
          }
          buf += '\\' + name
          continue
        }

        if (name === 'sqrt') {
          var deg: Node[] | null = null
          if (src[i] === '[') {
            var closeBracket = src.indexOf(']', i + 1)
            if (closeBracket > -1) {
              deg = parse(src.slice(i + 1, closeBracket))
              i = closeBracket + 1
            }
          }
          var gBody = readGroup(src, i)
          if (gBody) {
            i = gBody.idx
            flush()
            nodes.push({ t: 'sqrt', deg: deg, body: gBody.nodes })
            continue
          }
          buf += '√'
          continue
        }

        /* \left / \right / sizing commands — drop command, keep delimiter */
        if (name === 'left' || name === 'right' || name === 'big' || name === 'Big' ||
            name === 'bigg' || name === 'Bigg' || name === 'bigl' || name === 'bigr' ||
            name === 'displaystyle' || name === 'limits' || name === 'nolimits') {
          continue
        }

        /* \text{…} / \mathrm{…} → keep content as plain text */
        if (name === 'text' || name === 'mathrm' || name === 'mathbf' || name === 'mathit' || name === 'operatorname') {
          var tg = readGroup(src, i)
          if (tg) { i = tg.idx; buf += renderPlain(tg.nodes); continue }
          continue
        }

        if (name === 'quad') { buf += '  '; continue }
        if (name === 'qquad') { buf += '    '; continue }

        if (SYMBOL_MAP[name]) { buf += SYMBOL_MAP[name]; continue }

        /* unknown command — drop the backslash, keep the word (graceful) */
        buf += name
        continue
      } else {
        /* escaped single char: \{ \} \\ \% \$ \, \; \: etc. */
        var nxt = src[i + 1]
        i += 2
        if (nxt === undefined) break
        if (nxt === '{' || nxt === '}') buf += nxt
        else if (nxt === '\\') buf += '\n'
        else if (nxt === ',' || nxt === ';' || nxt === ':' || nxt === ' ') buf += ' '
        else if (nxt === '!') { /* negative thin space → nothing */ }
        else buf += nxt
        continue
      }
    }

    if (c === '^' || c === '_') {
      var arg = readArg(src, i + 1)
      if (arg) {
        flush()
        nodes.push({ t: c === '^' ? 'sup' : 'sub', body: arg.nodes })
        i = arg.idx
        continue
      }
      buf += c
      i += 1
      continue
    }

    if (c === '{') {
      var g = readGroup(src, i)
      if (g) {
        flush()
        var inner = g.nodes
        for (var k = 0; k < inner.length; k++) nodes.push(inner[k])
        i = g.idx
        continue
      }
      buf += c
      i += 1
      continue
    }

    if (c === '}') { /* stray closing brace — swallow */ i += 1; continue }
    if (c === '$') { /* math wrapper — strip */ i += 1; continue }

    buf += c
    i += 1
  }
  flush()
  return nodes
}

/* flatten nodes back to plain text (used in degrade paths) */
function renderPlain(nodes: Node[]): string {
  return nodes.map(function (n) {
    if (n.t === 'text') return n.v
    if (n.t === 'frac') return '\\frac{' + renderPlain(n.a) + '}{' + renderPlain(n.b) + '}'
    if (n.t === 'sqrt') return '√' + renderPlain(n.body)
    if (n.t === 'sup') return '^' + renderPlain(n.body)
    return '_' + renderPlain(n.body)
  }).join('')
}

/* ---------- React rendering ---------- */

function Frac({ a, b }: { a: React.ReactNode; b: React.ReactNode }) {
  return (
    <span
      dir="ltr"
      className="inline-flex flex-col items-center align-middle mx-1 text-[0.92em] leading-[1.15]"
    >
      <span className="px-1 whitespace-nowrap">{a}</span>
      <span className="w-full border-t-[1.5px] border-current" aria-hidden="true" />
      <span className="px-1 whitespace-nowrap">{b}</span>
    </span>
  )
}

function Radical({ deg, body }: { deg: React.ReactNode | null; body: React.ReactNode }) {
  return (
    <span dir="ltr" className="inline-flex items-stretch align-middle mx-0.5">
      {deg !== null && (
        <span className="text-[0.55em] self-start mt-[0.1em] mr-[-0.2em] relative z-10">{deg}</span>
      )}
      <span className="leading-none">√</span>
      <span className="border-t-[1.5px] border-current mt-[0.15em] pt-[0.1em] px-px">{body}</span>
    </span>
  )
}

function renderNodes(nodes: Node[], keyPrefix: string): React.ReactNode[] {
  return nodes.map(function (n, i) {
    var key = keyPrefix + '-' + i
    if (n.t === 'text') return <React.Fragment key={key}>{n.v}</React.Fragment>
    if (n.t === 'frac') {
      return <Frac key={key} a={renderNodes(n.a, key + 'a')} b={renderNodes(n.b, key + 'b')} />
    }
    if (n.t === 'sqrt') {
      return (
        <Radical
          key={key}
          deg={n.deg ? renderNodes(n.deg, key + 'd') : null}
          body={renderNodes(n.body, key + 'b')}
        />
      )
    }
    if (n.t === 'sup') {
      return <sup key={key} className="text-[0.72em] leading-none align-super">{renderNodes(n.body, key + 's')}</sup>
    }
    return <sub key={key} className="text-[0.72em] leading-none">{renderNodes(n.body, key + 's')}</sub>
  })
}

/* ---------- public component ---------- */

export function FractionText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  var raw = String(text)

  /* protect image markers from the math parser */
  var prot = protectImages(raw)
  raw = prot.text

  /* legacy stacked text → \frac marker */
  raw = raw.replace(OLD_STACKED_RE, '\\frac{$1}{$2}')

  /* legacy plain digit a/b → \frac marker (guarded) */
  raw = convertSlashFractions(raw)

  var nodes = parse(raw)
  restoreImages(nodes, prot.imgs)

  return (
    <span className={'whitespace-pre-wrap ' + (className || '')}>
      {renderNodes(nodes, 'm')}
    </span>
  )
}

/*
 * hasMathMarkup — true when the string contains math markup that needs
 * rendering (\frac, ^, _, $, old stacked bars, backslash commands).
 * Used to decide where to show the rendered preview next to raw inputs.
 */
export function hasMathMarkup(s: string): boolean {
  if (!s) return false
  return /[\\^_$─]|@IMG\d+@/.test(String(s))
}

export default FractionText
