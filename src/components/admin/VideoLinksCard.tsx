'use client'

/* ============================================================
   (ص119) VideoLinksCard — كارتا «الفيديوهات التعريفية» في لوحة الأدمن
   ============================================================
   نفس واجهة Zicola-Math بالظبط (ChallengesPanel: جزء intro + جزء
   teacher) بس في مكوّن مستقل بيتحط في تاب «المحتوى» (CMSPanel):
    • فيديو المنصة (intro_video_url) — «إزاي تستخدم المنصة»
    • فيديو المستر (teacher_video_url) — «تعرّف على مستر شريف»
   لكل كارت خيارين: لينك (يوتيوب/درايف/فيميو/ستريمابل/أرشايف بيتطبّع
   لصيغة embed قبل الحفظ) أو رفع ملف من الجهاز عبر chunkedUpload.
   + عرض الحالة الحالية (لينك ولا ملف + اسمه/تاريخه) + معاينة على
   المشغل الموحد + حذف (بيفضّي القيمة وبيمسح ملف الـ Media اليتيم
   عبر DELETE /api/files/<id>?adminId=...).
   ============================================================ */

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAppStore } from '@/stores/app-store'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Eye, Trash2, Loader2, Film, Link2, Upload, CalendarDays, GraduationCap } from 'lucide-react'
import { chunkedUpload } from '@/lib/chunked-upload'
import { normalizeIntroVideoUrl, introMediaId, introVideoKind, streamableId } from '@/lib/intro-video'
import { ConfigVideoPlayer } from '@/components/landing/ConfigVideoPlayer'

interface FileMeta { filename: string; createdAt: string | null; fileSize: number }

export function VideoLinksCard() {
  /* ================= فيديو المنصة (intro_video_url) ================= */
  const [introUrl, setIntroUrl] = useState('')
  const [introSaving, setIntroSaving] = useState(false)
  const [introUploading, setIntroUploading] = useState(false)
  const [introStatus, setIntroStatus] = useState('')
  const [introMeta, setIntroMeta] = useState<FileMeta | null>(null)
  const introFileRef = useRef<HTMLInputElement>(null)
  /* آخر قيمة محفوظة فعليًا على السيرفر — بتفرق عن introUrl (اللي بيتغير
     لحظة الكتابة في الخانة) عشان مسح الملف اليتيم يبص على القيمة المخزنة القديمة */
  const savedIntroRef = useRef('')

  /* ================= فيديو المستر (teacher_video_url) ================= */
  const [teacherUrl, setTeacherUrl] = useState('')
  const [teacherSaving, setTeacherSaving] = useState(false)
  const [teacherUploading, setTeacherUploading] = useState(false)
  const [teacherStatus, setTeacherStatus] = useState('')
  const [teacherMeta, setTeacherMeta] = useState<FileMeta | null>(null)
  const teacherFileRef = useRef<HTMLInputElement>(null)
  const savedTeacherRef = useRef('')

  /* ميتاداتا الملف الحالي (اسم/تاريخ) — من /api/files/<id>?meta=1 */
  const refreshMeta = useCallback(function (value: string, setter: (m: FileMeta | null) => void) {
    var mediaId = introMediaId(value)
    if (!mediaId) { setter(null); return }
    var adminIdNow = useAppStore.getState().currentAdmin?.id || ''
    fetch('/api/files/' + mediaId + '?meta=1&adminId=' + encodeURIComponent(adminIdNow))
      .then(function (r) { return r.ok ? r.json() : null })
      .then(function (d) {
        if (d && d.filename) setter({ filename: d.filename, createdAt: d.createdAt || null, fileSize: Number(d.fileSize || 0) })
        else setter(null)
      })
      .catch(function () { setter(null) })
  }, [])

  /* تحميل الفيديوهات من الكونفيج */
  useEffect(function () {
    fetch('/api/config?fresh=' + Date.now())
      .then(function (r) { return r.json() })
      .then(function (d) {
        var v = d && typeof d.intro_video_url === 'string' ? d.intro_video_url : ''
        savedIntroRef.current = v
        setIntroUrl(v)
        refreshMeta(v, setIntroMeta)
        var tv = d && typeof d.teacher_video_url === 'string' ? d.teacher_video_url : ''
        savedTeacherRef.current = tv
        setTeacherUrl(tv)
        refreshMeta(tv, setTeacherMeta)
      })
      .catch(function () {})
  }, [refreshMeta])

  /* مسح ملف الـ Media اليتيم (لينك/ملف جديد استبدل ملف قديم) */
  function removeMediaIfOrphan(oldValue: string) {
    var oldId = introMediaId(oldValue)
    if (!oldId) return
    var adminIdNow = useAppStore.getState().currentAdmin?.id || ''
    fetch('/api/files/' + oldId + '?adminId=' + encodeURIComponent(adminIdNow), { method: 'DELETE' })
      .catch(function () {})
  }

  /* حفظ قيمة جديدة في المفتاح الواحد (القيمة الجديدة تغيب القديمة) */
  async function writeConfig(key: string, value: string): Promise<boolean> {
    const res = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [key]: value }),
    })
    return res.ok
  }

  async function saveIntroLink() {
    if (introSaving || introUploading) return
    var raw = introUrl.trim()
    var normalized = normalizeIntroVideoUrl(raw)
    setIntroSaving(true)
    try {
      var ok = await writeConfig('intro_video_url', normalized)
      if (!ok) { toast.error('فشل الحفظ'); return }
      var prevSaved = savedIntroRef.current
      if (normalized !== prevSaved) removeMediaIfOrphan(prevSaved)
      savedIntroRef.current = normalized
      setIntroUrl(normalized)
      refreshMeta(normalized, setIntroMeta)
      if (!normalized) {
        toast.success('الفيديو التعريفي اتشال — القسم اختفى من الصفحة الرئيسية')
      } else {
        toast.success('الفيديو التعريفي اتسجل ✅ — هيظهر فوق في الصفحة الرئيسية')
      }
    } catch { toast.error('فشل الاتصال') }
    setIntroSaving(false)
  }

  async function uploadIntroFile(file: File) {
    if (!file) return
    if (file.type && file.type.indexOf('video/') !== 0) {
      toast.error('اختار ملف فيديو (mp4 / webm / mov)')
      return
    }
    setIntroUploading(true)
    setIntroStatus('جاري الرفع...')
    try {
      const result = await chunkedUpload(file, 'videos', function (pct) {
        setIntroStatus('جاري الرفع... ' + pct + '%')
      }, function (msg) { setIntroStatus(msg) })
      setIntroStatus('جاري الحفظ...')
      var ok = await writeConfig('intro_video_url', result.filePath)
      if (!ok) { toast.error('الفيديو اترفع لكن الحفظ فشل — جرب تاني'); return }
      var prevSavedFile = savedIntroRef.current
      if (result.filePath !== prevSavedFile) removeMediaIfOrphan(prevSavedFile)
      savedIntroRef.current = result.filePath
      setIntroUrl(result.filePath)
      setIntroMeta({ filename: result.filename || file.name, createdAt: new Date().toISOString(), fileSize: result.size || file.size })
      toast.success('الفيديو اترفع وبقى ظاهر للطلاب ✅')
    } catch (e: any) {
      toast.error(e?.message || 'فشل رفع الفيديو — حاول تاني')
    }
    setIntroUploading(false)
    setIntroStatus('')
  }

  async function deleteIntro() {
    if (introSaving || introUploading) return
    if (!introUrl) return
    if (!window.confirm('حذف الفيديو التعريفي؟ القسم هيختفي من الصفحة الرئيسية.')) return
    setIntroSaving(true)
    try {
      var ok = await writeConfig('intro_video_url', '')
      if (!ok) { toast.error('فشل الحذف'); return }
      removeMediaIfOrphan(savedIntroRef.current)
      savedIntroRef.current = ''
      setIntroUrl('')
      setIntroMeta(null)
      toast.success('الفيديو التعريفي اتمسح ✅')
    } catch { toast.error('فشل الاتصال') }
    setIntroSaving(false)
  }

  async function saveTeacherLink() {
    if (teacherSaving || teacherUploading) return
    var raw = teacherUrl.trim()
    var normalized = normalizeIntroVideoUrl(raw)
    setTeacherSaving(true)
    try {
      var ok = await writeConfig('teacher_video_url', normalized)
      if (!ok) { toast.error('فشل الحفظ'); return }
      var prevSaved = savedTeacherRef.current
      if (normalized !== prevSaved) removeMediaIfOrphan(prevSaved)
      savedTeacherRef.current = normalized
      setTeacherUrl(normalized)
      refreshMeta(normalized, setTeacherMeta)
      if (!normalized) {
        toast.success('فيديو المستر اتشال — القسم اختفى من الصفحة الرئيسية')
      } else {
        toast.success('فيديو المستر اتسجل ✅ — هيظهر قبل قسم المعرض في الرئيسية')
      }
    } catch { toast.error('فشل الاتصال') }
    setTeacherSaving(false)
  }

  async function uploadTeacherFile(file: File) {
    if (!file) return
    if (file.type && file.type.indexOf('video/') !== 0) {
      toast.error('اختار ملف فيديو (mp4 / webm / mov)')
      return
    }
    setTeacherUploading(true)
    setTeacherStatus('جاري الرفع...')
    try {
      const result = await chunkedUpload(file, 'videos', function (pct) {
        setTeacherStatus('جاري الرفع... ' + pct + '%')
      }, function (msg) { setTeacherStatus(msg) })
      setTeacherStatus('جاري الحفظ...')
      var ok = await writeConfig('teacher_video_url', result.filePath)
      if (!ok) { toast.error('الفيديو اترفع لكن الحفظ فشل — جرب تاني'); return }
      var prevSavedFile = savedTeacherRef.current
      if (result.filePath !== prevSavedFile) removeMediaIfOrphan(prevSavedFile)
      savedTeacherRef.current = result.filePath
      setTeacherUrl(result.filePath)
      setTeacherMeta({ filename: result.filename || file.name, createdAt: new Date().toISOString(), fileSize: result.size || file.size })
      toast.success('فيديو المستر اترفع وبقى ظاهر للطلاب ✅')
    } catch (e: any) {
      toast.error(e?.message || 'فشل رفع الفيديو — حاول تاني')
    }
    setTeacherUploading(false)
    setTeacherStatus('')
  }

  async function deleteTeacher() {
    if (teacherSaving || teacherUploading) return
    if (!teacherUrl) return
    if (!window.confirm('حذف فيديو تعريف المستر؟ القسم هيختفي من الصفحة الرئيسية.')) return
    setTeacherSaving(true)
    try {
      var ok = await writeConfig('teacher_video_url', '')
      if (!ok) { toast.error('فشل الحذف'); return }
      removeMediaIfOrphan(savedTeacherRef.current)
      savedTeacherRef.current = ''
      setTeacherUrl('')
      setTeacherMeta(null)
      toast.success('فيديو المستر اتمسح ✅')
    } catch { toast.error('فشل الاتصال') }
    setTeacherSaving(false)
  }

  /* نوع القيمة المخزنة — بتحدد شكل «الحالة الحالية» */
  const introKind = introVideoKind(introUrl)
  const introIsStreamable = !!streamableId(introUrl)
  const introKindLabel = introKind === 'youtube' ? 'لينك يوتيوب'
    : introKind === 'drive' ? 'لينك جوجل درايف'
    : introKind === 'vimeo' ? 'لينك فيميو'
    : introKind === 'file' ? 'ملف مرفوع من الجهاز'
    : introKind === 'link' ? (introIsStreamable ? 'لينك ستريمابل — بيتشغل على مشغل المنصة' : 'لينك خارجي')
    : ''

  const teacherKind = introVideoKind(teacherUrl)
  const teacherIsStreamable = !!streamableId(teacherUrl)
  const teacherKindLabel = teacherKind === 'youtube' ? 'لينك يوتيوب'
    : teacherKind === 'drive' ? 'لينك جوجل درايف'
    : teacherKind === 'vimeo' ? 'لينك فيميو'
    : teacherKind === 'file' ? 'ملف مرفوع من الجهاز'
    : teacherKind === 'link' ? (teacherIsStreamable ? 'لينك ستريمابل — بيتشغل على مشغل المنصة' : 'لينك خارجي')
    : ''

  return (
    <div className="space-y-6">
      {/* ============ فيديو المنصة — إزاي تستخدم المنصة ============ */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-base sm:text-lg">
              <Eye className="h-5 w-5 text-primary" />
              الفيديو التعريفي — إزاي تستخدم المنصة
            </h3>
            {introKind !== 'none' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteIntro}
                disabled={introSaving || introUploading}
                className="min-h-[36px] hover:bg-red-500/10 text-red-600 border-red-200"
              >
                {introSaving && !introUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                حذف الفيديو
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            خيارين — لينك أو رفع من الجهاز. لو فاضي الاتنين القسم مش هيظهر للطلاب خالص.
          </p>

          {/* الحالة الحالية */}
          {introKind !== 'none' ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white text-[11px] font-black px-2 py-0.5">
                  ● الحالة الحالية
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground text-[11px] font-bold px-2 py-0.5">
                  {introKind === 'file' ? <Film className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {introKindLabel}
                </span>
                {introKind === 'file' ? (
                  <span className="text-xs font-bold truncate max-w-full">
                    {introMeta?.filename || 'فيديو مرفوع'}
                    {introMeta?.createdAt ? <span className="text-muted-foreground font-normal"> — {new Date(introMeta.createdAt).toLocaleDateString('ar-EG')}</span> : null}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground truncate max-w-full" dir="ltr">{introUrl}</span>
                )}
              </div>
              {/* معاينة سريعة — المشغل الموحد (ستريمابل بيتشغل على مشغلنا كمان) */}
              <div className="aspect-video max-h-44 overflow-hidden rounded-lg bg-black">
                <ConfigVideoPlayer url={introUrl} title="معاينة الفيديو التعريفي" />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              مفيش فيديو حاليًا — القسم مخفي تمامًا عن الطلاب. حط لينك أو ارفع ملف وسيبه يظهر.
            </div>
          )}

          {/* الخيار الأول: لينك */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-bold">
              <Link2 className="h-4 w-4 text-primary" />
              الخيار الأول: لينك (يوتيوب / جوجل درايف / فيميو / ستريمابل)
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={introUrl}
                onChange={function (e) { setIntroUrl(e.target.value) }}
                placeholder="https://www.youtube.com/watch?v=... أو لينك درايف أو ستريمابل"
                className="min-h-[44px]"
                dir="ltr"
              />
              <Button onClick={saveIntroLink} disabled={introSaving || introUploading} className="min-h-[44px] font-bold shrink-0">
                {introSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ اللينك
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">أي لينك معروف بيتحول أوتوماتيك لصيغة تشغيل جوه المنصة (حتى لينك ستريمابل اللي كان بيبان أسود).</p>
          </div>

          {/* الخيار التاني: رفع من الجهاز */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-bold">
              <Upload className="h-4 w-4 text-primary" />
              الخيار التاني: رفع فيديو من الجهاز (mp4)
            </Label>
            <input
              ref={introFileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
              className="hidden"
              onChange={function (e) { const f = e.target.files?.[0]; if (f) uploadIntroFile(f); e.target.value = '' }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={function () { introFileRef.current?.click() }}
                disabled={introUploading || introSaving}
                className="min-h-[44px]"
              >
                {introUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {introUploading ? (introStatus || 'جاري الرفع...') : 'اختار فيديو وارفعه'}
              </Button>
              {introKind === 'file' && !introUploading ? <span className="text-xs text-emerald-600 font-bold">✅ الفيديو المرفوع هو المعروض دلوقتي</span> : null}
            </div>
            {introUploading && introStatus ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" /> {introStatus}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">الرفع بنفس نظام المنصة (أجزاء 2MB) — يدعم الفيديوهات الكبيرة، والفيديو بيتعرض تحت عنوان «الفيديو التعريفي» فوق في الرئيسية.</p>
          </div>
        </CardContent>
      </Card>

      {/* ============ فيديو تعريف المستر — قبل قسم المعرض ============ */}
      <Card>
        <CardContent className="p-4 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 font-bold text-base sm:text-lg">
              <GraduationCap className="h-5 w-5 text-primary" />
              الفيديو التعريفي عن المستر
            </h3>
            {teacherKind !== 'none' ? (
              <Button
                variant="outline"
                size="sm"
                onClick={deleteTeacher}
                disabled={teacherSaving || teacherUploading}
                className="min-h-[36px] hover:bg-red-500/10 text-red-600 border-red-200"
              >
                {teacherSaving && !teacherUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                حذف الفيديو
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">
            بيظهر قبل قسم المعرض في الصفحة الرئيسية — فيديو تعريفي عنك أنت. لو فاضي القسم مش هيظهر خالص.
          </p>

          {/* الحالة الحالية */}
          {teacherKind !== 'none' ? (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500 text-white text-[11px] font-black px-2 py-0.5">
                  ● الحالة الحالية
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-muted text-muted-foreground text-[11px] font-bold px-2 py-0.5">
                  {teacherKind === 'file' ? <Film className="h-3 w-3" /> : <Link2 className="h-3 w-3" />}
                  {teacherKindLabel}
                </span>
                {teacherKind === 'file' ? (
                  <span className="text-xs font-bold truncate max-w-full">
                    {teacherMeta?.filename || 'فيديو مرفوع'}
                    {teacherMeta?.createdAt ? <span className="text-muted-foreground font-normal"> — {new Date(teacherMeta.createdAt).toLocaleDateString('ar-EG')}</span> : null}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground truncate max-w-full" dir="ltr">{teacherUrl}</span>
                )}
              </div>
              {/* معاينة سريعة — المشغل الموحد (ستريمابل بيتشغل على مشغلنا كمان) */}
              <div className="aspect-video max-h-44 overflow-hidden rounded-lg bg-black">
                <ConfigVideoPlayer url={teacherUrl} title="معاينة فيديو المستر" />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border p-3 text-xs text-muted-foreground">
              مفيش فيديو حاليًا — القسم مخفي تمامًا عن الطلاب. حط لينك أو ارفع ملف وسيبه يظهر.
            </div>
          )}

          {/* الخيار الأول: لينك */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-bold">
              <Link2 className="h-4 w-4 text-primary" />
              الخيار الأول: لينك (يوتيوب / جوجل درايف / فيميو / ستريمابل)
            </Label>
            <div className="flex flex-col sm:flex-row gap-2">
              <Input
                value={teacherUrl}
                onChange={function (e) { setTeacherUrl(e.target.value) }}
                placeholder="https://www.youtube.com/watch?v=... أو لينك درايف أو ستريمابل"
                className="min-h-[44px]"
                dir="ltr"
              />
              <Button onClick={saveTeacherLink} disabled={teacherSaving || teacherUploading} className="min-h-[44px] font-bold shrink-0">
                {teacherSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                حفظ اللينك
              </Button>
            </div>
            <p className="text-[11px] text-muted-foreground">أي لينك معروف بيتحول أوتوماتيك لصيغة تشغيل جوه المنصة (حتى لينك ستريمابل اللي كان بيبان أسود).</p>
          </div>

          {/* الخيار التاني: رفع من الجهاز */}
          <div className="rounded-xl border border-border/60 bg-muted/20 p-3 sm:p-4 space-y-2">
            <Label className="flex items-center gap-1.5 text-sm font-bold">
              <Upload className="h-4 w-4 text-primary" />
              الخيار التاني: رفع فيديو من الجهاز (mp4)
            </Label>
            <input
              ref={teacherFileRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
              className="hidden"
              onChange={function (e) { const f = e.target.files?.[0]; if (f) uploadTeacherFile(f); e.target.value = '' }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={function () { teacherFileRef.current?.click() }}
                disabled={teacherUploading || teacherSaving}
                className="min-h-[44px]"
              >
                {teacherUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Film className="h-4 w-4" />}
                {teacherUploading ? (teacherStatus || 'جاري الرفع...') : 'اختار فيديو وارفعه'}
              </Button>
              {teacherKind === 'file' && !teacherUploading ? <span className="text-xs text-emerald-600 font-bold">✅ الفيديو المرفوع هو المعروض دلوقتي</span> : null}
            </div>
            {teacherUploading && teacherStatus ? (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <CalendarDays className="h-3 w-3" /> {teacherStatus}
              </p>
            ) : null}
            <p className="text-[11px] text-muted-foreground">الرفع بنفس نظام المنصة (أجزاء 2MB) — الفيديو بيتعرض تحت عنوان «تعرّف على مستر شريف» في الرئيسية.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default VideoLinksCard
