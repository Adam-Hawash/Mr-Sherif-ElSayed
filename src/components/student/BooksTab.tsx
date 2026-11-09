'use client'

// ============================================================
// (2026-و40) BooksTab — تاب «الكتب والملازم» في بورتال الطالب
// ============================================================
// يجيب القايمة من /api/books (بنفس فلتر الصف الضبابي بتاع الواجبات لو
// صف الطالب معروف) ويعرض كروت: فتح (عرض داخلي في تاب جديد) + تحميل
// (?dl=1 → Content-Disposition: attachment).
// (2026-س1) دعم جوجل درايف — طلب المستر: «تقبل ملفات جوجل درايف وتعرضها»:
//   • كتب درايف بتتعرض **مدموجة جوه المنصة** (عارض درايف الداخلي في نافذة
//     كبيرة — الطالب بيقل الصفحات من غير ما يخرج من المنصة).
//   • تحميل درايف بيفتح التحميل المباشر.
// ============================================================

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Loader2, FileDown, ExternalLink, RefreshCw } from 'lucide-react'
import { useState, useEffect } from 'react'
import { isDriveUrl, extractDriveFileId, driveDownloadUrl } from '@/lib/drive'
import { DriveViewerDialog } from '@/components/student/DriveViewerDialog'

function formatBookSize(bytes: number): string {
  var mb = (bytes || 0) / 1024 / 1024
  if (mb >= 1) return mb.toFixed(1) + ' MB'
  var kb = (bytes || 0) / 1024
  return (kb >= 1 ? kb.toFixed(0) + ' KB' : String(bytes || 0) + ' B')
}

export function BooksTab({ grade }: { grade?: string }) {
  const [books, setBooks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  /* (2026-س1) نافذة العرض المدمج لكتب درايف */
  const [viewBook, setViewBook] = useState<any | null>(null)

  var loadBooks = async function () {
    setLoading(true)
    setFailed(false)
    try {
      var url = '/api/books' + (grade ? '?grade=' + encodeURIComponent(grade) : '')
      var res = await fetch(url)
      var data = await res.json()
      if (res.ok) {
        setBooks(data.books || [])
      } else {
        setFailed(true)
      }
    } catch (e) {
      setFailed(true)
    }
    setLoading(false)
  }

  useEffect(function () {
    loadBooks()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grade])

  /* (2026-س1) فتح الكتاب: درايف → نافذة العرض المدمج جوه المنصة —
     غير كده → تاب خارجي زي الأول */
  var openBook = function (b: any) {
    if (b && b.sourceUrl && isDriveUrl(b.sourceUrl)) {
      var id = extractDriveFileId(b.sourceUrl)
      if (id) { setViewBook(b); return }
    }
    var url = (b && b.sourceUrl) ? b.sourceUrl : ((b && b.filePath) || '')
    try { window.open(url, '_blank') } catch (e) {}
  }
  var downloadBook = function (b: any) {
    if (b && b.sourceUrl && isDriveUrl(b.sourceUrl)) {
      var id = extractDriveFileId(b.sourceUrl)
      if (id) { try { window.open(driveDownloadUrl(id), '_blank') } catch (e) {} return }
      try { window.open(b.sourceUrl, '_blank') } catch (e) {}
      return
    }
    if (b && b.sourceUrl) { try { window.open(b.sourceUrl, '_blank') } catch (e) {} return }
    var filePath = (b && b.filePath) || ''
    var url = filePath + (filePath.indexOf('?') !== -1 ? '&' : '?') + 'dl=1'
    try { window.open(url, '_blank') } catch (e) {}
  }
  var closeView = function () { setViewBook(null) }

  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {[0, 1, 2, 3].map(function (i) {
          return (
            <Card key={i}>
              <CardContent className="p-4 flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 bg-muted rounded animate-pulse w-3/4" />
                  <div className="h-3 bg-muted rounded animate-pulse w-1/2" />
                </div>
              </CardContent>
            </Card>
          )
        })}
      </div>
    )
  }

  if (failed) {
    return (
      <div className="text-center py-14">
        <BookOpen className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground mb-3">حصلت مشكلة في تحميل الكتب</p>
        <Button variant="outline" size="sm" onClick={loadBooks}><RefreshCw className="h-4 w-4 ml-1" />إعادة المحاولة</Button>
      </div>
    )
  }

  if (books.length === 0) {
    return (
      <div className="text-center py-14 text-muted-foreground">
        <BookOpen className="h-10 w-10 mx-auto mb-3 opacity-40" />
        <p className="text-sm">مفيش كتب متضافة لسه</p>
      </div>
    )
  }

  var viewDriveId = viewBook && viewBook.sourceUrl ? extractDriveFileId(viewBook.sourceUrl) : ''

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {books.map(function (b: any) {
        var isDriveBook = !!(b.sourceUrl && isDriveUrl(b.sourceUrl))
        return (
          <Card key={b.id} className="hover:shadow-md transition-shadow">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <div className="h-10 w-10 rounded-lg bg-sky-500/10 flex items-center justify-center shrink-0">
                  <BookOpen className="h-5 w-5 text-sky-500" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-sm break-words">{b.title}</h3>
                  {b.description && <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">{b.description}</p>}
                  <div className="flex items-center gap-2 flex-wrap mt-1.5">
                    {b.grade && <Badge variant="outline" className="text-[10px]">{b.grade}</Badge>}
                    {/* (و43 + س1) بادج المصدر: درايف / لينك خارجي / الحجم */}
                    {isDriveBook && <Badge variant="outline" className="text-[10px] border-emerald-500/50 text-emerald-600 dark:text-emerald-400">🟢 جوجل درايف</Badge>}
                    {!isDriveBook && <span className="text-[10px] text-muted-foreground">{b.sourceUrl ? '🔗 لينك خارجي' : formatBookSize(b.sizeBytes)}</span>}
                    {b.createdAt && <span className="text-[10px] text-muted-foreground">{new Date(b.createdAt).toLocaleDateString('ar-EG')}</span>}
                  </div>
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <Button size="sm" className="flex-1 h-8 gap-1" onClick={function () { openBook(b) }}>
                  {isDriveBook ? <BookOpen className="h-3.5 w-3.5" /> : <ExternalLink className="h-3.5 w-3.5" />}
                  {isDriveBook ? 'عرض هنا' : 'فتح'}
                </Button>
                <Button size="sm" variant="outline" className="flex-1 h-8 gap-1" onClick={function () { downloadBook(b) }}>
                  <FileDown className="h-3.5 w-3.5" />تحميل
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* ===== (2026-س1) نافذة العرض المدمج — كتب جوجل درايف جوه المنصة ===== */}
      <DriveViewerDialog
        url={viewDriveId ? (viewBook ? viewBook.sourceUrl : '') : ''}
        title={viewBook ? viewBook.title : ''}
        open={!!viewBook && !!viewDriveId}
        onClose={closeView}
      />
    </div>
  )
}
