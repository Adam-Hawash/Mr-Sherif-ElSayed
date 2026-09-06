'use client'

import { useState, useRef, useEffect } from 'react'
import { Calculator, X, Delete, CornerDownLeft, Image as ImageIcon, Loader2, Eye } from 'lucide-react'
import { chunkedUpload } from '@/lib/chunked-upload'
import { FractionText, hasMathMarkup } from '@/components/FractionText'

interface MathKeyboardProps {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  rows?: number
  onImageUpload?: (filePath: string) => void
}

interface SymbolButton {
  label: string
  insert: string
  hint?: string
}

interface SymbolGroup {
  title: string
  symbols: SymbolButton[]
}

const SYMBOL_GROUPS: SymbolGroup[] = [
  {
    title: 'Numbers & Operations',
    symbols: [
      { label: '1', insert: '1', hint: 'One' },
      { label: '2', insert: '2', hint: 'Two' },
      { label: '3', insert: '3', hint: 'Three' },
      { label: '4', insert: '4', hint: 'Four' },
      { label: '5', insert: '5', hint: 'Five' },
      { label: '6', insert: '6', hint: 'Six' },
      { label: '7', insert: '7', hint: 'Seven' },
      { label: '8', insert: '8', hint: 'Eight' },
      { label: '9', insert: '9', hint: 'Nine' },
      { label: '0', insert: '0', hint: 'Zero' },
      { label: '.', insert: '.', hint: 'Decimal point' },
      { label: ',', insert: ',', hint: 'Comma' },
      { label: '+', insert: '+', hint: 'Plus' },
      { label: '−', insert: '-', hint: 'Minus' },
      { label: '×', insert: '×', hint: 'Multiply' },
      { label: '÷', insert: '÷', hint: 'Divide' },
      { label: '=', insert: '=', hint: 'Equals' },
      { label: '≠', insert: '≠', hint: 'Not equal' },
      { label: '<', insert: '<', hint: 'Less than' },
      { label: '>', insert: '>', hint: 'Greater than' },
      { label: '≤', insert: '≤', hint: 'Less than or equal' },
      { label: '≥', insert: '≥', hint: 'Greater than or equal' },
      { label: '±', insert: '±', hint: 'Plus or minus' },
      { label: '(', insert: '(', hint: 'Open parenthesis' },
      { label: ')', insert: ')', hint: 'Close parenthesis' },
    ],
  },
  {
    title: 'Powers & Roots',
    symbols: [
      { label: 'x^n', insert: '^', hint: 'Power - type number after ^' },
      { label: 'x^2', insert: '^2', hint: 'Squared' },
      { label: 'x^3', insert: '^3', hint: 'Cubed' },
      { label: 'x^4', insert: '^4', hint: 'Power 4' },
      { label: 'x^5', insert: '^5', hint: 'Power 5' },
      { label: 'x^6', insert: '^6', hint: 'Power 6' },
      { label: '√', insert: '√', hint: 'Square root' },
      { label: '∛', insert: '∛', hint: 'Cube root' },
      { label: '∜', insert: '∜', hint: 'Fourth root' },
    ],
  },
  {
    title: 'Advanced Symbols',
    symbols: [
      { label: '∑', insert: '∑', hint: 'Sigma' },
      { label: '∫', insert: '∫', hint: 'Integral' },
      { label: 'Δ', insert: 'Δ', hint: 'Delta' },
      { label: 'θ', insert: 'θ', hint: 'Theta' },
      { label: 'α', insert: 'α', hint: 'Alpha' },
      { label: 'β', insert: 'β', hint: 'Beta' },
      { label: 'γ', insert: 'γ', hint: 'Gamma' },
      { label: 'λ', insert: 'λ', hint: 'Lambda' },
      { label: 'μ', insert: 'μ', hint: 'Mu' },
      { label: 'σ', insert: 'σ', hint: 'Sigma' },
      { label: 'φ', insert: 'φ', hint: 'Phi' },
      { label: 'ω', insert: 'ω', hint: 'Omega' },
    ],
  },
  {
    title: 'Angles & Ratios',
    symbols: [
      { label: '°', insert: '°', hint: 'Degree' },
      { label: '∠', insert: '∠', hint: 'Angle' },
      { label: '⊥', insert: '⊥', hint: 'Perpendicular' },
      { label: '∥', insert: '∥', hint: 'Parallel' },
      { label: 'sin', insert: 'sin', hint: 'Sine' },
      { label: 'cos', insert: 'cos', hint: 'Cosine' },
      { label: 'tan', insert: 'tan', hint: 'Tangent' },
      { label: 'log', insert: 'log', hint: 'Logarithm' },
      { label: 'ln', insert: 'ln', hint: 'Natural log' },
      { label: '|x|', insert: '|', hint: 'Absolute value' },
      { label: 'gcd', insert: 'gcd', hint: 'GCD' },
      { label: 'lcm', insert: 'lcm', hint: 'LCM' },
    ],
  },
  {
    title: 'Numbers',
    symbols: [
      { label: '0', insert: '0' },
      { label: '1', insert: '1' },
      { label: '2', insert: '2' },
      { label: '3', insert: '3' },
      { label: '4', insert: '4' },
      { label: '5', insert: '5' },
      { label: '6', insert: '6' },
      { label: '7', insert: '7' },
      { label: '8', insert: '8' },
      { label: '9', insert: '9' },
      { label: '.', insert: '.' },
      { label: ',', insert: ',' },
    ],
  },
]

export function MathKeyboard({ value, onChange, placeholder = 'Type your answer here...', rows = 4, onImageUpload }: MathKeyboardProps) {
  const [showKeyboard, setShowKeyboard] = useState(false)
  const [activeGroup, setActiveGroup] = useState(0)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [uploadedImage, setUploadedImage] = useState<string>('')
  const [cursorPos, setCursorPos] = useState(0)
  const [showFraction, setShowFraction] = useState(false)
  const [fractionTop, setFractionTop] = useState('')
  const [fractionBottom, setFractionBottom] = useState('')

  // Smart insert: detect math context for "natural" writing feel
  // e.g. √ then 3 → ∛ (cube root), ^ then 2 → ² (squared), ^ then 3 → ³
  const insertSymbol = (symbol: string) => {
    if (!textareaRef.current) {
      onChange(value + symbol)
      return
    }
    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd

    // Look at the last character before cursor for smart insertion
    const charBefore = start > 0 ? value[start - 1] : ''
    let actualSymbol = symbol

    // SMART: cube root, fourth root, etc.
    // If user typed √ then presses 3 → convert to ∛ (cube root)
    // If user typed √ then presses 4 → convert to ∜ (fourth root)
    if (charBefore === '√') {
      if (symbol === '3') {
        // Replace √ with ∛
        const newValue = value.substring(0, start - 1) + '∛' + value.substring(end)
        onChange(newValue)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(start, start)
          }
        }, 0)
        return
      } else if (symbol === '4') {
        const newValue = value.substring(0, start - 1) + '∜' + value.substring(end)
        onChange(newValue)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(start, start)
          }
        }, 0)
        return
      } else if (symbol === '2') {
        // √2 stays as √2 (square root of 2)
        const newValue = value.substring(0, start) + symbol + value.substring(end)
        onChange(newValue)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(start + 1, start + 1)
          }
        }, 0)
        return
      }
    }

    // SMART: powers — ^ then number → superscript
    // ^2 → ², ^3 → ³, ^4 → ⁴ (and similar for higher powers using Unicode where available)
    if (charBefore === '^') {
      const superMap: Record<string, string> = {
        '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
        '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
      }
      if (superMap[symbol]) {
        // Replace ^ + digit with superscript digit
        const newValue = value.substring(0, start - 1) + superMap[symbol] + value.substring(end)
        onChange(newValue)
        setTimeout(() => {
          if (textareaRef.current) {
            textareaRef.current.focus()
            textareaRef.current.setSelectionRange(start, start)
          }
        }, 0)
        return
      }
      // x^n where x is letter (like x^2) - convert x^2 → x²
      if (/[0-9a-z]/i.test(charBefore) === false) {
        // ^ alone (no preceding letter), insert as superscript directly
        const superMap2: Record<string, string> = {
          '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
          '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
        }
        if (superMap2[symbol]) {
          const newValue = value.substring(0, start - 1) + superMap2[symbol] + value.substring(end)
          onChange(newValue)
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus()
              textareaRef.current.setSelectionRange(start, start)
            }
          }, 0)
          return
        }
      }
    }

    // SMART: × or ÷ between numbers — automatically space them
    if (symbol === '×' || symbol === '÷' || symbol === '+' || symbol === '-') {
      // Check if surrounded by numbers — auto-insert spaces around operator for readability
      const charAfter = end < value.length ? value[end] : ''
      const hasNumBefore = /[0-9²³⁴⁵⁶⁷⁸⁹⁰¹]/.test(charBefore)
      const hasNumAfter = /[0-9a-zA-Z(√∑∫π]/.test(charAfter)
      if (hasNumBefore && hasNumAfter) {
        // Already well-formed, just insert the operator
        actualSymbol = ' ' + symbol + ' '
      }
    }

    // SMART: opening parenthesis after function name (sin, cos, tan, log, ln)
    // e.g. typing sin then ( → sin(
    if (symbol === '(' && start >= 3) {
      const prevThree = value.substring(start - 3, start).toLowerCase()
      if (['sin', 'cos', 'tan', 'log', 'lcm', 'gcd'].includes(prevThree)) {
        actualSymbol = '('
      }
    }

    const newValue = value.substring(0, start) + actualSymbol + value.substring(end)
    onChange(newValue)
    setCursorPos(start + actualSymbol.length)
    setTimeout(() => {
      if (textareaRef.current) {
        textareaRef.current.focus()
        textareaRef.current.setSelectionRange(start + actualSymbol.length, start + actualSymbol.length)
      }
    }, 0)
  }

  const handleBackspace = () => {
    if (!textareaRef.current) {
      onChange(value.slice(0, -1))
      return
    }
    const start = textareaRef.current.selectionStart
    const end = textareaRef.current.selectionEnd
    if (start === end && start > 0) {
      const newValue = value.substring(0, start - 1) + value.substring(end)
      onChange(newValue)
      setCursorPos(start - 1)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(start - 1, start - 1)
        }
      }, 0)
    } else if (start !== end) {
      const newValue = value.substring(0, start) + value.substring(end)
      onChange(newValue)
      setCursorPos(start)
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus()
          textareaRef.current.setSelectionRange(start, start)
        }
      }, 0)
    }
  }

  const handleEnter = () => {
    insertSymbol('\n')
  }

  const handleFractionInsert = () => {
    var top = fractionTop.trim()
    var bottom = fractionBottom.trim()
    if (top && bottom) {
      // Insert the machine marker — the UI renders it as a REAL stacked
      // fraction (numerator above the bar, denominator below) via
      // FractionText everywhere question text is displayed.
      var fraction = ' \\frac{' + top + '}{' + bottom + '} '
      insertSymbol(fraction)
    }
    setFractionTop('')
    setFractionBottom('')
    setShowFraction(false)
  }

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    // Allow multiple files to be selected
    const files = e.target.files
    if (!files || files.length === 0) return

    setUploading(true)
    try {
      // Upload each file and append markers
      var newMarkers = ''
      var uploadedPaths: string[] = []
      for (let i = 0; i < files.length; i++) {
        const file = files[i]
        // Validate it's an image
        if (!file.type.startsWith('image/')) {
          alert('برجاء اختيار صور فقط: ' + file.name)
          continue
        }
        // Check size (max 10MB)
        if (file.size > 10 * 1024 * 1024) {
          alert('حجم الصورة ' + file.name + ' كبير جداً (الحد الأقصى 10MB)')
          continue
        }
        try {
          const data = await chunkedUpload(file, 'homework-answers', undefined, undefined)
          uploadedPaths.push(data.filePath)
          newMarkers += '\n[📷 صورة مرفقة: ' + data.filePath + ']\n'
        } catch (err: any) {
          alert('فشل رفع ' + file.name + ': ' + (err.message || 'حاول مرة أخرى'))
        }
      }
      if (newMarkers) {
        setUploadedImage(uploadedPaths[uploadedPaths.length - 1] || '')
        // Append ALL uploaded markers to the existing value
        onChange(value + newMarkers)
        if (onImageUpload) {
          onImageUpload(uploadedPaths[0] || '')
        }
      }
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <div className="w-full space-y-2">
      {/* Toolbar above textarea - not overlapping */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-muted text-muted-foreground hover:bg-muted/80 transition-colors disabled:opacity-50"
          title="Upload image"
        >
          {uploading ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ImageIcon className="h-3.5 w-3.5" />
          )}
          <span>{uploading ? 'Uploading...' : 'Image'}</span>
        </button>
        <button
          type="button"
          onClick={() => setShowKeyboard(!showKeyboard)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
            showKeyboard
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:bg-muted/80'
          }`}
          title="آلة حاسبة للرموز الرياضية"
        >
          <Calculator className="h-3.5 w-3.5" />
          <span>Symbols</span>
        </button>
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleImageUpload}
      />
      {/* Textarea below the toolbar */}
      <div className="relative">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            // Auto-convert ^ followed by digit to superscript
            var val = e.target.value
            var superMap: Record<string, string> = {
              '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴',
              '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
            }
            // Replace ^digit patterns with superscript
            var converted = val.replace(/\^([0-9])/g, function(match, digit) {
              return superMap[digit] || match
            })
            // Also handle multi-digit powers like ^12 → ¹²
            converted = converted.replace(/\^([0-9]+)/g, function(match, digits) {
              var result = ''
              for (var i = 0; i < digits.length; i++) {
                result += superMap[digits[i]] || digits[i]
              }
              return result
            })
            // Also convert √3 → ∛ and √4 → ∜ (smart root conversion)
            converted = converted.replace(/√3/g, '∛').replace(/√4/g, '∜')
            onChange(converted)
          }}
          placeholder={placeholder}
          rows={rows}
          className="w-full min-h-[120px] p-3 text-sm rounded-lg border border-border bg-background text-foreground resize-y font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary"
          dir="auto"
        />
      </div>

      {/* Live rendered preview — shows fractions stacked / powers as superscripts exactly like the student sees */}
      {value && hasMathMarkup(value) && (
        <div className="p-2 rounded-lg bg-muted/40 border border-border/40">
          <p className="text-[10px] font-semibold text-muted-foreground mb-1 flex items-center gap-1"><Eye className="h-3 w-3" /> المعاينة (زي ما الطالب هيشوفها):</p>
          <div className="text-sm text-foreground" dir="ltr" style={{ textAlign: 'left' }}>
            <FractionText text={value} />
          </div>
        </div>
      )}

      {uploadedImage && (
        <div className="mt-2 flex items-center gap-2 p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-900/40">
          <ImageIcon className="h-4 w-4 text-emerald-600" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300">تم رفع الصورة بنجاح - هتظهر للأستاذ في التصحيح</span>
          <button
            type="button"
            onClick={() => {
              setUploadedImage('')
              if (onImageUpload) onImageUpload('')
            }}
            className="mr-auto text-xs text-red-500 hover:underline"
          >
            حذف
          </button>
        </div>
      )}

      {showKeyboard && (
        <div className="mt-2 border border-border rounded-lg bg-card shadow-lg overflow-hidden">
          {/* Group tabs */}
          <div className="flex overflow-x-auto border-b border-border bg-muted/30 custom-scrollbar">
            {SYMBOL_GROUPS.map((group, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => setActiveGroup(idx)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap transition-colors ${
                  activeGroup === idx
                    ? 'bg-card text-primary border-b-2 border-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {group.title}
              </button>
            ))}
          </div>

          {/* Symbols grid */}
          <div className="p-2">
            <div className="grid grid-cols-6 sm:grid-cols-8 gap-1.5">
              {SYMBOL_GROUPS[activeGroup].symbols.map((sym, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => insertSymbol(sym.insert)}
                  title={sym.hint || sym.label}
                  className="aspect-square flex items-center justify-center text-lg font-semibold bg-muted/50 hover:bg-primary hover:text-primary-foreground rounded-md transition-colors border border-border/50 select-none"
                >
                  {sym.label}
                </button>
              ))}

              {/* Backspace button */}
              <button
                type="button"
                onClick={handleBackspace}
                title="حذف"
                className="aspect-square flex items-center justify-center bg-red-500/10 hover:bg-red-500/20 text-red-600 rounded-md transition-colors border border-red-500/20 select-none"
              >
                <Delete className="h-4 w-4" />
              </button>

              {/* Fraction button - opens popup with numerator/denominator */}
              <button
                type="button"
                onClick={() => setShowFraction(true)}
                title="Fraction - Numerator / Denominator"
                className="aspect-square flex flex-col items-center justify-center bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-400 rounded-md transition-colors border border-amber-500/20 select-none"
              >
                <span className="text-[10px] font-bold leading-none">a</span>
                <span className="w-5 border-t border-current my-0.5"></span>
                <span className="text-[10px] font-bold leading-none">b</span>
              </button>

              {/* Enter button */}
              <button
                type="button"
                onClick={handleEnter}
                title="سطر جديد"
                className="aspect-square flex items-center justify-center bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 rounded-md transition-colors border border-emerald-500/20 select-none"
              >
                <CornerDownLeft className="h-4 w-4" />
              </button>
            </div>

            {/* Close button */}
            <button
              type="button"
              onClick={() => setShowKeyboard(false)}
              className="mt-2 w-full py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md transition-colors flex items-center justify-center gap-1.5"
            >
              <X className="h-3.5 w-3.5" />
              Close keyboard
            </button>
          </div>
        </div>
      )}

      {/* Fraction popup - numerator on top, denominator below */}
      {showFraction && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={() => setShowFraction(false)}>
          <div className="bg-card border border-border rounded-xl p-4 shadow-2xl w-full max-w-xs" onClick={function(e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold">Enter Fraction</p>
              <button type="button" onClick={() => setShowFraction(false)} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>
            {/* Fraction visual: box on top, line, box below */}
            <div className="flex flex-col items-center gap-1 mb-3">
              <input
                type="text"
                value={fractionTop}
                onChange={function(e) { setFractionTop(e.target.value) }}
                onKeyDown={function(e) { if (e.key === 'Enter') { var b = document.getElementById('frac-bottom'); if (b) b.focus() } }}
                placeholder="Numerator"
                dir="ltr"
                className="w-24 text-center text-lg font-bold px-2 py-1.5 rounded-md border-2 border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 focus:outline-none focus:border-amber-500"
                autoFocus
              />
              <div className="w-32 h-0.5 bg-foreground"></div>
              <input
                id="frac-bottom"
                type="text"
                value={fractionBottom}
                onChange={function(e) { setFractionBottom(e.target.value) }}
                onKeyDown={function(e) { if (e.key === 'Enter') handleFractionInsert() }}
                placeholder="Denominator"
                dir="ltr"
                className="w-24 text-center text-lg font-bold px-2 py-1.5 rounded-md border-2 border-amber-500/40 bg-amber-50 dark:bg-amber-900/10 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              type="button"
              onClick={handleFractionInsert}
              disabled={!fractionTop.trim() || !fractionBottom.trim()}
              className="w-full py-2 text-sm font-bold rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Insert Fraction
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

