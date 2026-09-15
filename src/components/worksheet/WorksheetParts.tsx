'use client'

// ============================================================
// WorksheetParts — عرض ورقة العمل (2026-و40-w)
// ============================================================
// المستر أرى ورقة عمل فيها: بادج دائري لرقم السؤال + جدول (x | f(x) | (x, f(x)))
// الطالب يكتب جواه + رسمة إحداثيات لكل سؤال — وطلب «الواجب والامتحان يبانوا
// زي الملف بالظبط، كل صفحة لوحدها، والطالب يكتب جوه الجداول».
//
// الملف ده مكتبة مشتركة بين بورتال الطالب (يحل) وشاشات الأدمن/النتايج (تعرض
// مقروءة فقط) — كل الحقول اختيارية وسؤال من غير table/figure/sourcePage
// بيتعرض زي ما هو بالظبط (صفر regression).
//
// شكل السؤال الممتد (اختياري كل حاجة — backward compatible):
//   sourcePage?: number          // صفحة المصدر (1-based)
//   srcName?: string             // اسم ملف المصدر («الملف الأول») لأكتر من ملف
//   table?: { headers: string[], rows: Cell[][] }   // Cell = {t:string} | {t:'',blank:true}
//   figure?: { page:number, bbox:{x,y,w,h}, url?:string }  // bbox نسب من صورة الصفحة كلها (0..1)
//   optionFigures?: { bbox:{...}, url?:string }[]  // نادر: صورة لكل اختيار
// ============================================================

import React from 'react'
import { FractionText } from '@/components/FractionText'

/* ---------- أنواع متسامحة ---------- */

export interface WCell { t?: string; blank?: boolean }
export interface WTable { headers?: string[]; rows?: WCell[][] }
export interface WBbox { x?: number; y?: number; w?: number; h?: number }
export interface WFigure { page?: number; bbox?: WBbox; url?: string }

/* ---------- فحص ورقة العمل ---------- */

/** هل السؤال فيه أي حقل ورقة عمل؟ */
export function hasWorksheetFields(q: any): boolean {
  if (!q || typeof q !== 'object') return false
  return !!(
    q.table ||
    q.figure ||
    q.optionFigures ||
    (typeof q.sourcePage === 'number' && q.sourcePage > 0) ||
    (typeof q.sourcePage === 'string' && parseInt(q.sourcePage, 10) > 0) ||
    (q.srcName && String(q.srcName).trim())
  )
}

/** هل المجموعة دي «ورقة عمل»؟ — أي سؤال فيه حقول ورقة عمل يكفي */
export function isWorksheetQuestionSet(qs: any[]): boolean {
  if (!Array.isArray(qs)) return false
  return qs.some(function (q: any) { return hasWorksheetFields(q) })
}

/** مفتاح تجميع الصفحات: srcName|sourcePage */
export function worksheetGroupKey(q: any): string {
  if (!q) return '|1'
  var sn = String(q.srcName || '').trim()
  var sp = parseInt(String(q.sourcePage), 10)
  if (!isFinite(sp) || sp <= 0) sp = 1
  return sn + '|' + sp
}

export interface WorksheetPageGroup {
  key: string
  srcName: string
  page: number
  items: { q: any; idx: number }[]
}

/** تجميع الأسئلة المتتالية حسب srcName|sourcePage — الترتيب زي ما هو.
 * «متتالية» حرفيًا: مجموعة جديدة أول ما المفتاح يتبدل عن السؤال اللي قبله —
 * كده شيب «صفحة N» بيعبّر عن أسئلته بالظبط حتى لو الاستخراج رجّع صفحة متخطّاة */
export function groupWorksheetPages(qs: any[]): WorksheetPageGroup[] {
  var groups: WorksheetPageGroup[] = []
  if (!Array.isArray(qs)) return groups
  var lastKey: string | null = null
  var current: WorksheetPageGroup | null = null
  qs.forEach(function (q: any, idx: number) {
    var k = worksheetGroupKey(q)
    if (k !== lastKey || !current) {
      var sn = String((q && q.srcName) || '').trim()
      var sp = parseInt(String((q && q.sourcePage) || 1), 10)
      if (!isFinite(sp) || sp <= 0) sp = 1
      current = { key: k, srcName: sn, page: sp, items: [] }
      groups.push(current)
      lastKey = k
    }
    current.items.push({ q: q, idx: idx })
  })
  return groups
}

/* ---------- إحداثيات الخانات الفاضية (اللي الطالب يكتبها) ---------- */

/** كل المواضع {r,c} للخانات blank بالترتيب (صف-بصف) */
export function tableBlankCoords(table: any): { r: number; c: number }[] {
  var out: { r: number; c: number }[] = []
  var rows = (table && Array.isArray(table.rows)) ? table.rows : []
  rows.forEach(function (row: any, r: number) {
    if (!Array.isArray(row)) return
    row.forEach(function (cell: any, c: number) {
      if (cell && typeof cell === 'object' && cell.blank === true) out.push({ r: r, c: c })
      else if (typeof cell === 'string' && cell.trim() === '') { /* نص فاضي مش blank رسمي — نتخطاه */ }
    })
  })
  return out
}

/** مصفوفة قيم فاضية بحجم الجدول (لكل الخانات — الفارغة بس هي اللي بتتكتب) */
export function emptyTableValues(table: any): string[][] {
  var rows = (table && Array.isArray(table.rows)) ? table.rows : []
  return rows.map(function (row: any) {
    var arr = Array.isArray(row) ? row : []
    return arr.map(function () { return '' })
  })
}

export function tableValuesAreEmpty(values: string[][] | undefined | null): boolean {
  if (!values) return true
  for (var r = 0; r < values.length; r++) {
    var row = values[r] || []
    for (var c = 0; c < row.length; c++) { if (String(row[c] || '').trim() !== '') return false }
  }
  return true
}

/** نص الجدول المقروء: «صف 2: 5، 3؛ صف 3: …» — بنفس الصيغة اللي بتتكتب في الإجابة */
export function worksheetRowsText(table: any, values: string[][] | undefined | null): string {
  var rows = (table && Array.isArray(table.rows)) ? table.rows : []
  var parts: string[] = []
  rows.forEach(function (row: any, r: number) {
    if (!Array.isArray(row)) return
    var vals: string[] = []
    row.forEach(function (cell: any, c: number) {
      var isBlank = cell && typeof cell === 'object' && cell.blank === true
      if (!isBlank) return
      var v = values && values[r] ? String(values[r][c] || '').trim() : ''
      vals.push(v === '' ? '—' : v)
    })
    if (vals.length > 0) parts.push('صف ' + (r + 1) + ': ' + vals.join('، '))
  })
  return parts.join('؛ ')
}

/** إجابة السؤال النهائية: النص + (لو فيه خانات مكتوبة) سطر «الجدول: …» */
export function buildAnswerWithTable(text: string, table: any, values: string[][] | undefined | null): string {
  var base = String(text || '')
  if (!table || tableValuesAreEmpty(values)) return base
  var rowsText = worksheetRowsText(table, values)
  if (!rowsText) return base
  return base + (base.trim() ? '\n' : '') + 'الجدول: ' + rowsText
}

/**
 * fallback: قراية قيم الجدول من نص الإجابة المخزن (للتسليمات القديمة
 * أو اللي اتحفظت من غير tableAnswers) — بترجع مصفوفة مصفوفات بحجم الجدول.
 */
export function parseTableValuesFromText(answerText: string, table: any): string[][] | null {
  var rows = (table && Array.isArray(table.rows)) ? table.rows : []
  if (rows.length === 0) return null
  var values = emptyTableValues(table)
  var txt = String(answerText || '')
  var m = txt.match(/الجدول\s*:\s*([\s\S]*)/)
  if (!m) return null
  var body = m[1]
  var rowParts = body.split(/؛|\||\n/)
  var coords = tableBlankCoords(table)
  var coordsByRow: Record<number, { c: number }[]> = {}
  coords.forEach(function (co) {
    if (!coordsByRow[co.r]) coordsByRow[co.r] = []
    coordsByRow[co.r].push({ c: co.c })
  })
  var used = false
  rowParts.forEach(function (rp: string) {
    var mm = rp.match(/صف\s*(\d+)\s*:\s*(.*)/)
    if (!mm) return
    var r = parseInt(mm[1], 10) - 1
    if (r < 0 || r >= rows.length || !coordsByRow[r]) return
    /* (2026-و40-w) الفاصل هو الكوما العربية بس — اللي بيكتبها buildAnswerWithTable.
       ممنوع نقسم على الكوما الإنجليزية: قيمة زي الإحداثية «(-2, -5)» هتتكسر لوصلنا
       (نفس عمود (x, f(x)) في ورقة المستر) */
    var vals = mm[2].split(/،/)
    coordsByRow[r].forEach(function (co, i) {
      var v = String(vals[i] || '').trim()
      if (v && v !== '—') { values[r][co.c] = v; used = true }
    })
  })
  return used ? values : null
}

/* ---------- تنسيق خلية الجدول ---------- */

function cellText(cell: any): string {
  if (cell === null || cell === undefined) return ''
  if (typeof cell === 'object') return String(cell.t === undefined || cell.t === null ? '' : cell.t)
  return String(cell)
}

/* ---------- مكوّنات العرض ---------- */

/** بادج دائري كحلي غامق برقم السؤال — زي ورقة العمل بالظبط */
export function WorksheetQuestionBadge({ n, size }: { n: number; size?: 'sm' | 'md' }) {
  var cls = size === 'sm'
    ? 'h-6 w-6 text-[11px]'
    : 'h-8 w-8 text-sm'
  return (
    <span
      className={'shrink-0 rounded-full bg-slate-900 dark:bg-slate-800 text-white font-bold flex items-center justify-center shadow-sm ' + cls}
      aria-label={'سؤال ' + n}
    >
      {n}
    </span>
  )
}

/** شيب رأس الصفحة: «الملف الأول — صفحة 2» أو «صفحة 2» لو مصدر واحد */
export function WorksheetPageChip({ srcName, page }: { srcName?: string; page: number }) {
  var label = (srcName && srcName.trim() ? srcName.trim() + ' — ' : '') + 'صفحة ' + page
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300/60 dark:border-amber-700/60 px-3 py-1 text-[11px] font-bold text-amber-800 dark:text-amber-300">
        📄 {label}
      </span>
      <span className="flex-1 h-px bg-amber-200 dark:bg-amber-900/50" />
    </div>
  )
}

/** رسمة السؤال: صورة مقصوصة (figure.url) أو صندوق placeholder محايد */
export function WorksheetFigure({ figure, className }: { figure: any; className?: string }) {
  if (!figure) return null
  var url = String(figure.url || '')
  var page = parseInt(String(figure.page || 1), 10) || 1
  var bbox = figure.bbox || {}
  if (url && /^\/api\/files\//.test(url)) {
    return (
      <div className={'mt-2 ' + (className || '')}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={'رسمة السؤال — صفحة ' + page}
          className="max-w-full max-h-80 rounded-lg border border-slate-300 dark:border-slate-700 bg-white object-contain"
          onError={function (e) {
            var t = e.currentTarget as HTMLImageElement
            t.style.display = 'none'
          }}
        />
      </div>
    )
  }
  /* placeholder محايد — فشل القص/الرفع مش بيكسر الواجهة */
  var bw = Math.round((Number(bbox.w) || 0.3) * 100)
  var bh = Math.round((Number(bbox.h) || 0.2) * 100)
  return (
    <div className={'mt-2 flex items-center justify-center rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-900/40 text-slate-500 dark:text-slate-400 ' + (className || '')}
      style={{ minHeight: 84 }}>
      <p className="text-[11px] font-semibold text-center px-3 py-2">
        📐 رسمة السؤال — صفحة {page} ({bw}%×{bh}% من الصفحة)
      </p>
    </div>
  )
}

interface TableEditableProps {
  table: any
  values: string[][]
  onChange?: (r: number, c: number, v: string) => void
  disabled?: boolean
}

/** جدول قابل للكتابة — الخانات blank = input يكتب فيه الطالب */
export function WorksheetTableEditable({ table, values, onChange, disabled }: TableEditableProps) {
  if (!table) return null
  var headers = Array.isArray(table.headers) ? table.headers : []
  var rows = Array.isArray(table.rows) ? table.rows : []
  return (
    <div className="mt-2 overflow-x-auto" dir="rtl">
      <table className="w-full text-sm border-collapse rounded-lg overflow-hidden">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map(function (h: any, hi: number) {
                return (
                  <th key={hi} className="border border-slate-300 dark:border-slate-600 bg-muted px-2 py-1.5 text-center font-bold text-[13px]">
                    <FractionText text={cellText(h)} />
                  </th>
                )
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(function (row: any, r: number) {
            var cells = Array.isArray(row) ? row : []
            return (
              <tr key={r}>
                {cells.map(function (cell: any, c: number) {
                  var isBlank = cell && typeof cell === 'object' && cell.blank === true
                  if (isBlank) {
                    var v = values && values[r] ? String(values[r][c] || '') : ''
                    return (
                      <td key={c} className="border border-slate-300 dark:border-slate-600 p-0 bg-amber-50/70 dark:bg-amber-900/10" style={{ minWidth: 64 }}>
                        <input
                          type="text"
                          inputMode="text"
                          value={v}
                          disabled={disabled}
                          onChange={function (e) { if (onChange) onChange(r, c, e.target.value) }}
                          className="min-h-9 w-full bg-transparent px-2 py-1.5 text-center text-sm outline-none focus:bg-amber-100/80 dark:focus:bg-amber-900/30 disabled:opacity-60"
                          aria-label={'خانة صف ' + (r + 1) + ' عمود ' + (c + 1)}
                        />
                      </td>
                    )
                  }
                  return (
                    <td key={c} className="border border-slate-300 dark:border-slate-600 px-2 py-1.5 text-center text-[13px]" dir="auto">
                      <FractionText text={cellText(cell)} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

/** جدول مقروء فقط — الخانات معباية بقيم الطالب (أو —) */
export function WorksheetTableReadonly({ table, values, className }: { table: any; values?: string[][] | null; className?: string }) {
  if (!table) return null
  var headers = Array.isArray(table.headers) ? table.headers : []
  var rows = Array.isArray(table.rows) ? table.rows : []
  return (
    <div className={'mt-2 overflow-x-auto ' + (className || '')} dir="rtl">
      <table className="w-full text-sm border-collapse rounded-lg overflow-hidden">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map(function (h: any, hi: number) {
                return (
                  <th key={hi} className="border border-slate-300 dark:border-slate-600 bg-muted px-2 py-1 text-center font-bold text-[12px]">
                    <FractionText text={cellText(h)} />
                  </th>
                )
              })}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map(function (row: any, r: number) {
            var cells = Array.isArray(row) ? row : []
            return (
              <tr key={r}>
                {cells.map(function (cell: any, c: number) {
                  var isBlank = cell && typeof cell === 'object' && cell.blank === true
                  var v = isBlank && values && values[r] ? String(values[r][c] || '').trim() : ''
                  if (isBlank) {
                    return (
                      <td key={c} className={'border border-slate-300 dark:border-slate-600 px-2 py-1 text-center text-[12px] font-semibold ' + (v ? 'bg-amber-50 dark:bg-amber-900/20 text-foreground' : 'bg-muted/30 text-muted-foreground')}>
                        {v || '—'}
                      </td>
                    )
                  }
                  return (
                    <td key={c} className="border border-slate-300 dark:border-slate-600 px-2 py-1 text-center text-[12px]" dir="auto">
                      <FractionText text={cellText(cell)} />
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
