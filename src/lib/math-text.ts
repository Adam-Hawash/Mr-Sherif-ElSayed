// FILE: src/lib/math-text.ts
// PURPOSE: Repair math text corrupted by JSON round-trips + repair model JSON
//          before parsing. Shared by FractionText (client) and AI routes (server).
//
// THE ROOT BUG THIS FIXES:
//   AI models sometimes write LaTeX with SINGLE backslashes inside JSON strings.
//   JSON.parse then eats valid JSON escapes and corrupts the math:
//     \frac{a}{b}  →  <FF>rac{a}{b}      (\f = form feed!)  → students see "rac"
//     \times       →  <TAB>imes          (\t = tab)
//     \beta \boxed →  <BS>eta …          (\b = backspace)
//     \right \rho  →  <CR>ight …         (\r = carriage return)
//   Extraction routes store whatever the model returned, so legacy DB rows
//   are corrupted — this lib repairs them at render time (repairCorruptMath)
//   and prevents NEW corruption at parse time (repairModelJson).

/*
 * repairCorruptMath — fix ALREADY-CORRUPTED stored text (render time).
 * Safe on any string: only touches control chars sitting exactly where a
 * LaTeX command would start, plus the bare "rac{" leftover signature.
 * Also repairs structurally-broken LaTeX the models keep producing:
 *   \frac{A}^{B}   →  \frac{A}{B}
 *   a^b^c          →  a^{b^{c}}     (nested exponents stack properly)
 */
export function repairCorruptMath(input: string): string {
  if (!input) return input
  var s = String(input)
  // U+FFFD replacement chars are lossy-encoding leftovers — never legitimate
  s = s.replace(/\uFFFD/g, '')
  // <FF>rac{…} → \frac{…}  (restore only when letters follow — a real command)
  s = s.replace(/\f(?=[a-zA-Z])/g, '\\f')
  // leftover invisible FF junk (not part of a command) → drop
  s = s.replace(/\f/g, '')
  // <TAB>imes / <TAB>ext / <TAB>heta … → \times / \text / \theta
  s = s.replace(/\t(?=(?:imes|ext|heta|herefore|hereis|binom))([a-z]*)/g, '\\t$1')
  // <BS>eta / <BS>oxed → \beta / \boxed
  s = s.replace(/[\u0008](?=(?:eta|oxed|inom|ig))/g, '\\b')
  // <CR>ight / <CR>ho / <CR>angle → \right / \rho / \rangle
  s = s.replace(/\r(?=(?:ho|ight|angle|m))/g, '\\r')
  // stray CR without a command after it → plain newline
  s = s.replace(/\r/g, '\n')
  // bare "rac{…}" (control char already stripped by an older lossy layer) → \frac{…}
  s = s.replace(/(^|[^\\a-zA-Z])rac(?=[\s{(])/g, '$1\\frac')
  // ---- structural repairs (model-authored broken LaTeX) ----
  // \frac{A}^{B} or \frac(A)^{B}  →  \frac{A}{B}
  for (var p = 0; p < 2; p++) {
    s = s.replace(/\\(?:d|t)?frac\s*\{([^{}]*)\}\s*\^\s*\{([^{}]*)\}/g, '\\frac{$1}{$2}')
    s = s.replace(/\\(?:d|t)?frac\s*\(([^()]*)\)\s*\^\s*\{([^{}]*)\}/g, '\\frac{$1}{$2}')
  }
  // chained exponents  a^b^c  →  a^{b^{c}}  (repeat to catch triples; ASCII + Arabic-Indic digits)
  var SUP_ATOM = '(\\{(?:[^{}]|\\{[^{}]*\\})*\\}|[A-Za-z0-9\\u0660-\\u0669\\u06F0-\\u06F9]+)'
  for (var q = 0; q < 3; q++) {
    var chainRe = new RegExp('\\^\\s*' + SUP_ATOM + '\\s*\\^\\s*' + SUP_ATOM, 'g')
    s = s.replace(chainRe, function (_m, a: string, b: string) {
      return '^{' + a + '^{' + b + '}}'
    })
  }
  return s
}

/*
 * repairModelJson — prepare raw model output BEFORE JSON.parse so LaTeX with
 * single backslashes survives as text instead of being eaten by JSON escapes.
 * Single-pass scanner (no regex ordering traps):
 *  - `\\` pairs pass through (model already escaped properly)
 *  - `\uXXXX` passes through
 *  - LaTeX commands colliding with JSON escapes (\frac \times \text \theta
 *    \beta \boxed \right \rho \neq \nabla …) get their backslash doubled
 *  - genuine JSON escapes (\" \/ \n newline \t tab …) stay functional
 *  - every other backslash sequence (invalid JSON: \sqrt \div \{ …) is doubled
 */
export function repairModelJson(raw: string): string {
  var s = String(raw)
  if (s.indexOf('\\') === -1) return s
  var out = ''
  var i = 0
  var n = s.length
  while (i < n) {
    var c = s.charAt(i)
    if (c !== '\\') { out += c; i += 1; continue }
    var next = s.charAt(i + 1)
    if (next === undefined || next === '') { out += '\\\\'; i += 1; continue }
    if (next === '\\') { out += '\\\\'; i += 2; continue }
    if (next === 'u' && /^[0-9a-fA-F]{4}/.test(s.slice(i + 2))) { out += s.slice(i, i + 6); i += 6; continue }
    var rest = s.slice(i + 2)
    // LaTeX commands whose first letter collides with a valid JSON escape
    var isLatexCollide =
      (next === 'f' && /^rac/.test(rest)) ||
      (next === 't' && /^(?:imes|ext|heta|herefore|hereis|binom)/.test(rest)) ||
      (next === 'b' && /^(?:eta|oxed|inom)/.test(rest)) ||
      (next === 'r' && /^(?:ho|ight|angle|m)/.test(rest)) ||
      (next === 'n' && /^(?:eq|abla|otin|quad|parallel)/.test(rest))
    if (isLatexCollide) { out += '\\\\' + next; i += 2; continue }
    if (/^["\\/bfnrt]/.test(next)) { out += '\\' + next; i += 2; continue }
    if (/^[{}[\]$%&_^]/.test(next)) { out += '\\\\' + next; i += 2; continue }
    // anything else (e.g. \sqrt, \div, \pi …) — invalid JSON escape → LaTeX → double
    out += '\\\\' + next; i += 2; continue
  }
  return out
}
