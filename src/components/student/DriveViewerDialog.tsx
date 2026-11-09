'use client'

// ============================================================
// (2026-س1) DriveViewerDialog — عارض ملفات جوجل درايف المدمج
// ============================================================
// طلب المستر: «تقبل ملفات جوجل درايف وتعرضها» — الملف بيتعرض **جوه المنصة**
// في نافذة كبيرة (عارض درايف المدمج) — الطالب بيقل الصفحات من غير ما يخرج.
// بيتخدم في: تاب الكتب والملازم + مرفق الواجبات/الامتحانات.
// ============================================================

import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog'
import { BookOpen, Loader2, FileDown, ExternalLink, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { extractDriveFileId, driveDownloadUrl, drivePreviewUrl } from '@/lib/drive'

export function DriveViewerDialog({ url, title, open, onClose }: {
  url: string
  title: string
  open: boolean
  onClose: () => void
}) {
  const [ready, setReady] = useState(false)
  var fileId = url ? extractDriveFileId(url) : ''

  useEffect(function () {
    if (open) setReady(false)
  }, [open, url])

  var download = function () {
    try { window.open(driveDownloadUrl(fileId), '_blank') } catch (e) {}
  }
  var openInDrive = function () {
    try { window.open(url, '_blank') } catch (e) {}
  }

  return (
    <Dialog open={open} onOpenChange={function (o) { if (!o) onClose() }}>
      <DialogContent className="max-w-4xl w-[95vw] p-0 overflow-hidden" dir="rtl">
        <DialogHeader className="px-4 pt-4 pb-2 flex-row items-center justify-between space-y-0">
          <DialogTitle className="text-base flex items-center gap-2 min-w-0">
            <BookOpen className="h-4 w-4 text-sky-500 shrink-0" />
            <span className="truncate">{title || 'ملف جوجل درايف'}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">عارض الملف المدمج</DialogDescription>
          <button type="button" onClick={onClose} className="h-9 w-9 rounded-full hover:bg-muted flex items-center justify-center shrink-0" title="إغلاق" aria-label="إغلاق العارض">
            <X className="h-5 w-5" />
          </button>
        </DialogHeader>
        <div className="relative w-full" style={{ height: '75vh' }}>
          {!ready && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground">
              <Loader2 className="h-7 w-7 animate-spin text-sky-500" />
              <p className="text-xs">بيفتح الملف…</p>
            </div>
          )}
          {fileId && (
            <iframe
              src={drivePreviewUrl(fileId)}
              title={'عرض: ' + (title || 'ملف')}
              className="w-full h-full border-0"
              allow="autoplay"
              onLoad={function () { setReady(true) }}
            />
          )}
        </div>
        <div className="px-4 py-3 border-t flex items-center justify-between gap-2 flex-wrap">
          <p className="text-[11px] text-muted-foreground">الملف من جوجل درايف — بيُعرض هنا من غير ما تخرج من المنصة</p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-8 gap-1" onClick={download}>
              <FileDown className="h-3.5 w-3.5" />تحميل
            </Button>
            <Button size="sm" className="h-8 gap-1" onClick={openInDrive}>
              <ExternalLink className="h-3.5 w-3.5" />فتح في درايف
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
