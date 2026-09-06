'use client'

import * as React from 'react'
import katex from 'katex'
import 'katex/dist/katex.min.css'
import { repairCorruptMath } from '@/lib/math-text'

/*
 * FractionText — PROFESSIONAL math renderer (KaTeX engine).
 *
 * Powers sit ON the digit itself as real superscripts (2¹⁰) and fractions are
 * REAL stacked fractions — numerator above a bar, denominator below — exactly
 * like a textbook. Mixed Arabic/English text flows around the math naturally.
 *
 * Pipeline:
 *   1. repairCorruptMath      → fixes JSON-mangled LaTeX ("rac{", control chars)
 *   2. legacy formats          → "3 \n ─── \n 4" and plain "3/4" become \frac{3}{4}
 *   3. segmenter               → splits text into plain-text / math / image runs
 *      (explicit $…$, \(…\), \[…\] AND bare LaTeX like \frac{a}{b}, x^2, 2^{10})
 *   4. KaTeX renderToString    → pixel-perfect math (never leaks raw commands)
 *   5. any KaTeX failure       → graceful plain-text fallback
 */

/* ---------- image markers ---------- */

function extractMarkerUrl(marker: string): string {
  var m = marker.match(/\/api\/files\/[a-z0-9]+/i)
  if (m) return m[0]
  var m2 = marker.match(/(https?:\/\/[^\s\]]+)/i)
  if (m2) return m2[1]
  var m3 = marker.match(/[\w\-.]+\.(?:png|jpe?g|webp|gif)/i)
  if (m3) return '/api/uploads/' + m3[0]
  return ''
}

function splitImageMarkers(src: string): { img?: string; txt?: string }[] {
  var parts: { img?: string; txt?: string }[] = []
  var re = /\[📷[^\]]*\]?/g
  var last = 0
  var m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    if (m.index > last) parts.push({ txt: src.slice(last, m.index) })
    var url = extractMarkerUrl(m[0])
    if (url) parts.push({ img: url })
    else parts.push({ txt: m[0] })
    last = m.index + m[0].length
  }
  if (last < src.length) parts.push({ txt: src.slice(last) })
  if (parts.length === 0) parts.push({ txt: src })
  return parts
}

function MarkerImage({ url }: { url: string }) {
  var [failed, setFailed] = React.useState(false)
  if (failed) {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-primary underline underline-offset-2 align-middle mx-1" dir="ltr">
        🖼 عرض الصورة
      </a>
    )
  }
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" title="فتح الصورة بحجم كامل" className="inline-block align-middle mx-1">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt="صورة مرفقة"
        loading="lazy"
        className="inline-block max-w-[260px] max-h-[200px] w-auto h-auto rounded-lg border border-border shadow-sm hover:shadow-md transition-shadow"
        onError={function () { setFailed(true) }}
      />
    </a>
  )
}

/* ---------- legacy formats ---------- */
var OLD_STACKED_RE = /(\d+(?:\.\d+)?)\s*\n\s*─+\s*\n\s*(\d+(?:\.\d+)?)/g

/* plain digit "a/b" → \frac{a}{b} (guarded: skips urls, dates, multi-slashes) */
function convertSlashFractions(src: string): string {
  var re = /(\d{1,4})\s*\/\s*(\d{1,4})/g
  var out = ''
  var last = 0
  var m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    var before = m.index > 0 ? src[m.index - 1] : ''
    var afterIdx = m.index + m[0].length
    var after = afterIdx < src.length ? src[afterIdx] : ''
    if (/[\d\/.:]/.test(before) || /[\d\/]/.test(after)) continue
    out += src.slice(last, m.index) + '\\frac{' + m[1] + '}{' + m[2] + '}'
    last = afterIdx
  }
  out += src.slice(last)
  return out
}

/* ---------- math-run segmentation ---------- */

type Seg = { t: 'text'; v: string } | { t: 'math'; v: string }

/* words that KEEP a math run alive (Latin function names) */
var MATH_FUNCS = /^(?:sin|cos|tan|cot|sec|csc|log|ln|lg|lim|exp|max|min|gcd|lcm|HCF|LCM|Mod|mod)$/i

/* single char that can appear freely inside a math run */
function isMathSymbol(c: string): boolean {
  if (c === undefined || c === '') return false
  if (/[0-9]/.test(c)) return true
  if ('+-*/=()[]{}^_.|~<>?!,:;\'"'.indexOf(c) > -1) return true
  if ('×÷·±√π°∞∠∆θ≤≥≠≈∈∉⊂⊆∪∩→←↔↑↓'.indexOf(c) > -1) return true
  if ('⁰¹²³⁴⁵⁶⁷⁸⁹⁻ⁿⁱ½⅓¼¾'.indexOf(c) > -1) return true
  return false
}

function isLatinLetter(c: string): boolean {
  return /[a-zA-Z]/.test(c)
}

function isArabicChar(c: string): boolean {
  return /[\u0600-\u06FF\u0750-\u077F]/.test(c)
}

/* read a balanced {…} group starting at idx (idx points at '{') */
function readGroupAt(src: string, idx: number): number {
  if (src[idx] !== '{') return -1
  var depth = 0
  for (var j = idx; j < src.length; j++) {
    var ch = src[j]
    if (ch === '\\') { j++; continue }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return j + 1
    }
  }
  return src.length /* unbalanced → take the rest */
}

/* read a balanced (…) group starting at idx (idx points at '(') */
function readParenAt(src: string, idx: number): number {
  if (src[idx] !== '(') return -1
  var depth = 0
  for (var j = idx; j < src.length; j++) {
    var ch = src[j]
    if (ch === '\\') { j++; continue }
    if (ch === '(') depth++
    else if (ch === ')') {
      depth--
      if (depth === 0) return j + 1
    }
  }
  return src.length
}

/* read a LaTeX command argument: {group} | (group) | digit-run | single char */
function readArgAt(src: string, idx: number): number {
  if (idx >= src.length) return -1
  if (src[idx] === '{') return readGroupAt(src, idx)
  if (src[idx] === '(') return readParenAt(src, idx)
  var m = /^\d+(?:\.\d+)?/.exec(src.slice(idx))
  if (m) return idx + m[0].length
  if (src[idx] === '-' || src[idx] === '+') {
    var m2 = /^\d+(?:\.\d+)?/.exec(src.slice(idx + 1))
    if (m2) return idx + 1 + m2[0].length
    return idx + 1
  }
  return idx + 1
}

/* absorb a \command (letters) + all immediately-following groups/[optional] */
function readCommandAt(src: string, idx: number): number {
  /* idx points at '\' */
  var m = /^[a-zA-Z]+/.exec(src.slice(idx + 1))
  if (!m) {
    /* escaped single char */
    return idx + 2 <= src.length ? idx + 2 : src.length
  }
  var i = idx + 1 + m[0].length
  if (m[0] === 'sqrt' && src[i] === '[') {
    var close = src.indexOf(']', i + 1)
    if (close > -1) i = close + 1
  }
  /* absorb up to 2 brace groups (frac) or keep absorbing while groups follow */
  var guard = 0
  while (src[i] === '{' && guard < 4) {
    var end = readGroupAt(src, i)
    if (end <= i) break
    i = end
    guard++
  }
  return i
}

/* extend a math run forward from `i` while math-ish tokens continue */
function absorbMathTail(src: string, i: number): number {
  var n = src.length
  while (i < n) {
    /* absorb trailing spaces only if a math token follows */
    var j = i
    while (j < n && src[j] === ' ') j++
    if (j >= n) return i /* spaces at end → not part of math */
    var c = src[j]

    /* hard stops */
    if (c === '\n' || c === '$' || isArabicChar(c)) return i

    if (c === '\\') {
      var isCmd = /^[a-zA-Z]+/.test(src.slice(j + 1))
      if (!isCmd) { i = j + 2; continue } /* escaped char inside math */
      i = readCommandAt(src, j)
      continue
    }

    if (isMathSymbol(c)) { i = j + 1; continue }

    if (isLatinLetter(c)) {
      var wm = /^[a-zA-Z]+/.exec(src.slice(j))
      var word = wm ? wm[0] : c
      if (MATH_FUNCS.test(word)) { i = j + word.length; continue }
      if (word.length <= 2) { i = j + word.length; continue } /* x, y, xy, ab */
      return i /* real word (Simplify, ANSWER…) → stop BEFORE it */
    }

    /* anything else (emoji, CJK…) → stop */
    return i
  }
  return i
}

/* content of a (…) group qualifies as math when free of words/Arabic */
function isMathishContent(s: string): boolean {
  var stripped = s.replace(/\\[a-zA-Z]+/g, ' ')
  if (/[\u0600-\u06FF\u0750-\u077F]/.test(stripped)) return false
  if (/[a-zA-Z]{3,}/.test(stripped)) return false
  return true
}

/* find matching ')' scanning backwards from idx (char at idx === ')') */
function matchParenBack(src: string, idx: number): number {
  var depth = 0
  for (var k = idx; k >= 0; k--) {
    if (src[k] === ')') depth++
    else if (src[k] === '(') { depth--; if (depth === 0) return k }
  }
  return -1
}

/* Unicode superscripts for bare ^args with no math base (e.g. Arabic base: ن^2 → ن²) */
var SUP_MAP: Record<string, string> = {
  '0': '\u2070', '1': '\u00b9', '2': '\u00b2', '3': '\u00b3', '4': '\u2074',
  '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
  '+': '\u207a', '-': '\u207b', 'n': '\u207f', 'i': '\u2071', '(': '', ')': '',
}
function toSuperscript(s: string): string | null {
  var out = ''
  for (var k = 0; k < s.length; k++) {
    var ch = SUP_MAP[s[k]]
    if (ch === undefined) return null
    out += ch
  }
  return out
}

/* trailing lone operators at the end of a run belong back in the text */
function trimTrailingOps(v: string): { v: string; cut: string } {
  var m = /[+\-*/=×÷·±<>≤≥≠≈]+[\s]*$/.exec(v)
  if (m && m.index > 0) return { v: v.slice(0, m.index), cut: v.slice(m.index) }
  return { v: v, cut: '' }
}

/*
 * segmentMath — split a plain segment into text/math runs.
 * Explicit delimiters ($…$, $$…$$, \(…\), \[…\]) always win.
 * Bare LaTeX runs start at: a \command, or a ^/_ whose atom extends backwards.
 */
function segmentMath(src: string): Seg[] {
  var segs: Seg[] = []
  var textBuf = ''
  var i = 0
  var n = src.length

  var flushText = function () {
    if (textBuf) { segs.push({ t: 'text', v: textBuf }); textBuf = '' }
  }

  while (i < n) {
    var c = src[i]

    /* explicit math: $$…$$ */
    if (c === '$' && src[i + 1] === '$') {
      var close2 = src.indexOf('$$', i + 2)
      if (close2 > -1) {
        flushText()
        segs.push({ t: 'math', v: src.slice(i + 2, close2) })
        i = close2 + 2
        continue
      }
    }
    /* explicit math: $…$ (same line) */
    if (c === '$') {
      var lineEnd = src.indexOf('\n', i + 1)
      var close1 = src.indexOf('$', i + 1)
      if (close1 > -1 && (lineEnd === -1 || close1 < lineEnd) && close1 > i + 1) {
        flushText()
        segs.push({ t: 'math', v: src.slice(i + 1, close1) })
        i = close1 + 1
        continue
      }
    }
    /* explicit math: \(…\) and \[…\] */
    if (c === '\\' && (src[i + 1] === '(' || src[i + 1] === '[')) {
      var closer = src[i + 1] === '(' ? '\\)' : '\\]'
      var closeIdx = src.indexOf(closer, i + 2)
      if (closeIdx > -1) {
        flushText()
        segs.push({ t: 'math', v: src.slice(i + 2, closeIdx) })
        i = closeIdx + 2
        continue
      }
    }

    /* bare math run starting at a \command */
    if (c === '\\' && /^[a-zA-Z]/.test(src.slice(i + 1))) {
      var endCmd = readCommandAt(src, i)
      var endRun = absorbMathTail(src, endCmd)
      var runStart = i
      /* absorb a balanced (…) wrapper that closes exactly at runEnd */
      if (src[runStart - 1] === '(') {
        var op = runStart - 1
        var d2 = 0
        var ok2 = -1
        for (var k2 = op; k2 < endRun && k2 < n; k2++) {
          if (src[k2] === '(') d2++
          else if (src[k2] === ')') { d2--; if (d2 === 0) { ok2 = k2; break } }
        }
        /* the matching ')' must lie INSIDE the run so the group stays balanced */
        if (ok2 >= runStart && ok2 < endRun && isMathishContent(src.slice(op + 1, ok2))) {
          /* the '(' was already appended to textBuf — cut it back out */
          var stolen = i - op
          if (stolen > 0 && textBuf.length >= stolen) {
            textBuf = textBuf.slice(0, textBuf.length - stolen)
          }
          runStart = op
        }
      }
      var cmdV = src.slice(runStart, endRun)
      var cmdT = trimTrailingOps(cmdV)
      flushText()
      if (cmdT.cut) {
        segs.push({ t: 'math', v: cmdT.v })
        textBuf = cmdT.cut
        flushText()
      } else {
        segs.push({ t: 'math', v: cmdV })
      }
      i = endRun
      continue
    }

    /* bare math run starting at ^ or _ (extend backwards over the base atom) */
    if ((c === '^' || c === '_') && i + 1 < n && src[i + 1] !== ' ') {
      var start = i
      /* back over one atom: {group} | (group) | digit-run | single char */
      var prev = i - 1
      if (prev >= 0 && src[prev] === '}') {
        /* find matching opener */
        var depth = 0
        var k = prev
        while (k >= 0) {
          if (src[k] === '}') depth++
          else if (src[k] === '{') { depth--; if (depth === 0) break }
          k--
        }
        if (k >= 0) start = k
      } else if (prev >= 0 && src[prev] === ')') {
        var depth2 = 0
        var k2 = prev
        while (k2 >= 0) {
          if (src[k2] === ')') depth2++
          else if (src[k2] === '(') { depth2--; if (depth2 === 0) break }
          k2--
        }
        if (k2 >= 0) start = k2
      } else if (prev >= 0 && /[0-9.]/.test(src[prev])) {
        var km = /(?:[0-9]+(?:\.[0-9]+)?)$/.exec(src.slice(0, i))
        if (km) start = i - km[0].length
      } else if (prev >= 0 && (isLatinLetter(src[prev]) || '×÷·±√π°∞'.indexOf(src[prev]) > -1)) {
        start = prev
      }
      var argEnd = readArgAt(src, i + 1)
      var prevIsBase = start < i
      if (argEnd > i && !prevIsBase) {
        /* bare ^ with no math base (Arabic/space/start) — never feed a lone '^'
           to KaTeX: degrade to Unicode superscript or plain text */
        var argSrc = src.slice(i + 1, argEnd)
        if (argSrc[0] !== '(' && argSrc[0] !== '{') {
          var sup = toSuperscript(argSrc)
          textBuf += sup !== null ? sup : argSrc
          i = argEnd
          continue
        }
      }
      if (argEnd > i && prevIsBase) {
        var runEnd = absorbMathTail(src, argEnd)
        /* absorb a balanced (…) wrapper whose ')' lies inside the run */
        if (src[start - 1] === '(') {
          var op3 = start - 1
          var d3 = 0
          var ok3 = -1
          for (var k3 = op3; k3 < runEnd && k3 < n; k3++) {
            if (src[k3] === '(') d3++
            else if (src[k3] === ')') { d3--; if (d3 === 0) { ok3 = k3; break } }
          }
          if (ok3 >= argEnd && ok3 < runEnd && isMathishContent(src.slice(op3 + 1, ok3))) {
            start = op3
          }
        }
        /* CRITICAL: the base atom was already appended to textBuf — cut it back */
        var alreadyInBuf = i - start
        if (alreadyInBuf > 0 && textBuf.length >= alreadyInBuf) {
          textBuf = textBuf.slice(0, textBuf.length - alreadyInBuf)
        }
        flushText()
        var mv = src.slice(start, runEnd)
        var trimmed = trimTrailingOps(mv)
        if (trimmed.cut) {
          segs.push({ t: 'math', v: trimmed.v })
          textBuf = trimmed.cut
          flushText()
        } else {
          segs.push({ t: 'math', v: mv })
        }
        i = runEnd
        continue
      }
    }

    textBuf += c
    i += 1
  }
  flushText()
  return segs
}

/* ---------- KaTeX rendering ---------- */

var katexCache = new Map<string, string>()

function renderMath(tex: string): string | null {
  var cached = katexCache.get(tex)
  if (cached !== undefined) return cached
  var html: string | null = null
  try {
    var body = /[\\{^_]/.test(tex)
      ? /* bigger, textbook-style when real structure is present */
        (tex.indexOf('\\frac') > -1 || tex.indexOf('\\sqrt') > -1 || tex.indexOf('\\dfrac') > -1
          ? '\\displaystyle ' + tex
          : tex)
      : tex
    html = katex.renderToString(body, {
      throwOnError: false,
      strict: 'ignore',
      trust: false,
      output: 'html',
      displayMode: false,
    })
  } catch (e) {
    html = null
  }
  katexCache.set(tex, html || '')
  return html
}

function MathSpan({ tex }: { tex: string }) {
  var html = renderMath(tex)
  if (html === null || html === '') {
    /* graceful fallback: plain text, backslashes stripped */
    return <span dir="ltr" className="inline-block align-middle">{tex.replace(/\\/g, '')}</span>
  }
  return (
    <span
      dir="ltr"
      className="mathx inline-block align-middle mx-0.5"
      style={{ unicodeBidi: 'isolate' }}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/* ---------- public component ---------- */

export function FractionText({ text, className }: { text: string; className?: string }) {
  if (!text) return null
  var raw = String(text)

  /* repair JSON-corrupted math BEFORE anything else */
  raw = repairCorruptMath(raw)

  /* split into text segments + real inline images */
  var segments = splitImageMarkers(raw)

  return (
    <span className={'whitespace-pre-wrap ' + (className || '')}>
      {segments.map(function (seg, si) {
        if (seg.img) return <MarkerImage key={'i' + si} url={seg.img} />
        var segRaw = seg.txt || ''
        /* legacy stacked text → \frac marker */
        segRaw = segRaw.replace(OLD_STACKED_RE, '\\frac{$1}{$2}')
        /* legacy plain digit a/b → \frac marker (guarded) */
        segRaw = convertSlashFractions(segRaw)
        var segs = segmentMath(segRaw)
        return (
          <React.Fragment key={'t' + si}>
            {segs.map(function (s2, mi) {
              if (s2.t === 'math') return <MathSpan key={mi} tex={s2.v} />
              return <React.Fragment key={mi}>{s2.v}</React.Fragment>
            })}
          </React.Fragment>
        )
      })}
    </span>
  )
}

/*
 * hasMathMarkup — true when the string contains math markup that needs
 * rendering (\frac, ^, _, $, old stacked bars, backslash commands).
 */
export function hasMathMarkup(s: string): boolean {
  if (!s) return false
  return /[\\^_$─]|@IMG\d+@/.test(String(s))
}

export default FractionText
