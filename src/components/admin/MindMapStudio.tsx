'use client'

// ============================================================
// (2026-و66) MindMapStudio — استوديو الخرائط الذهنية للأدمن (NotebookLM style)
// ============================================================
// • سيكشن 1 «المصدر»: تابين (لينك يوتيوب / نص المادة) + ملاحظات المدرس
//   → POST /api/admin/mindmap {action:'generate'} بيرجع MindMapData
//     (ai=false → خريطة استرشادية → بانر أمبر يحثه يزود ملاحظات ويعيد التوليد)
// • سيكشن 2 «معاينة + حفظ»: معاينة بالـ MindMapView + تعديل العنوان
//   + ربط اختياري بفيديو من /api/videos + حفظ (action:'save')
// • سيكشن 3 «الخرائط المحفوظة»: GET كامل + معاينة في دايلوج + مسح
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Brain, Eye, FileText, Film, Link2, Loader2, RefreshCw, Save, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { MindMapView } from '@/components/student/MindMapView'
import type { MindMapData } from '@/lib/question-gen'

/* رسائل التحميل المتدوالة — التوليد ممكن ياخد لحد ~50 ثانية */
const LOAD_MSGS = ['بفتح الفيديو…', 'الـ AI بيستخرج المفاهيم والقوانين…', 'ببني الاتصالات…']

interface SavedMap {
  id: string
  videoId: string
  title: string
  sourceType: string
  sourceUrl: string
  sourceName: string
  data: MindMapData
  createdAt: string
}

interface VideoItem {
  id: string
  title: string
}

function fmtDate(s: string): string {
  try {
    return new Date(s).toLocaleDateString('ar-EG', { day: 'numeric', month: 'short', year: 'numeric' })
  } catch (e) {
    return String(s || '').slice(0, 10)
  }
}

export function MindMapStudio() {
  /* ===== تاب المصدر والحقول ===== */
  const [tab, setTab] = useState<'youtube' | 'text'>('youtube')
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [ytNotes, setYtNotes] = useState('')
  const [text, setText] = useState('')
  const [txtNotes, setTxtNotes] = useState('')

  /* ===== التوليد ===== */
  const [generating, setGenerating] = useState(false)
  const [loadIdx, setLoadIdx] = useState(0)
  const [result, setResult] = useState<MindMapData | null>(null)
  const [aiFlag, setAiFlag] = useState(true)

  /* ===== الحفظ ===== */
  const [saveTitle, setSaveTitle] = useState('')
  const [videos, setVideos] = useState<VideoItem[]>([])
  const [videoId, setVideoId] = useState('none')
  const [saving, setSaving] = useState(false)

  /* ===== الخرائط المحفوظة ===== */
  const [maps, setMaps] = useState<SavedMap[]>([])
  const [mapsLoading, setMapsLoading] = useState(true)
  const [preview, setPreview] = useState<SavedMap | null>(null)

  /* رسائل التحميل بتلف كل 4 ثواني طول ما التوليد شغال — التصفير بيحصل في الهاندلر نفسه */
  useEffect(function () {
    if (!generating) return
    const t = setInterval(function () {
      setLoadIdx(function (i) { return Math.min(i + 1, LOAD_MSGS.length - 1) })
    }, 4000)
    return function () { clearInterval(t) }
  }, [generating])

  /* فيديوهات المنصة للربط — بنفحص شكل الاستجابة وقت التشغيل وبنقع بأدب لو فشلت */
  useEffect(function () {
    fetch('/api/videos')
      .then(function (r) { return r.json() })
      .then(function (d: any) {
        const list = Array.isArray(d) ? d : d.videos || []
        const items: VideoItem[] = (list || [])
          .filter(function (v: any) { return v && v.id && v.title })
          .map(function (v: any) { return { id: String(v.id), title: String(v.title) } })
        setVideos(items)
      })
      .catch(function () { setVideos([]) }) // فشل → نخفي السيلكت خالص من غير إزعاج
  }, [])

  const loadMaps = useCallback(async function () {
    try {
      const res = await fetch('/api/admin/mindmap')
      const data = await res.json()
      setMaps((data.maps || []) as SavedMap[])
    } catch (e) {
      toast.error('مشكلة في تحميل الخرائط المحفوظة')
    }
    setMapsLoading(false)
  }, [])

  useEffect(function () {
    // (2026-و66) تحميل أولي للقايمة — الفيتش async والقاعدة هنا بتحمي من cascade متزامن بس
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadMaps()
  }, [loadMaps])

  /* ===== توليد الخريطة ===== */
  const generate = async function () {
    if (tab === 'youtube' && !youtubeUrl.trim()) {
      toast.error('الصق لينك يوتيوب الأول')
      return
    }
    if (tab === 'text' && !text.trim() && !txtNotes.trim()) {
      toast.error('الصق نص المادة أو اكتب ملاحظاتك عن الدرس')
      return
    }
    setGenerating(true)
    setResult(null)
    setLoadIdx(0)
    setAiFlag(true)
    try {
      const res = await fetch('/api/admin/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate',
          sourceType: tab,
          youtubeUrl: tab === 'youtube' ? youtubeUrl.trim() : '',
          text: tab === 'text' ? text : '',
          notes: tab === 'youtube' ? ytNotes : txtNotes,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok && data.map) {
        setResult(data.map as MindMapData)
        setAiFlag(!!data.ai)
        setSaveTitle(String(data.map.title || ''))
        toast.success(data.ai ? 'الخريطة جاهزة 🌳' : 'جاهزة — بس خد بالك من التنبيه')
      } else {
        toast.error(String(data.error || 'التوليد فشل — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setGenerating(false)
  }

  /* ===== حفظ الخريطة ===== */
  const save = async function () {
    if (!result || !result.root) {
      toast.error('مفيش خريطة نقدر نحفظها — ولّد واحدة الأول')
      return
    }
    setSaving(true)
    try {
      const res = await fetch('/api/admin/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          videoId: videoId === 'none' ? '' : videoId,
          title: saveTitle.trim() || result.title,
          sourceType: tab,
          sourceUrl: tab === 'youtube' ? youtubeUrl.trim() : '',
          sourceName: result.title || '',
          map: result,
        }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success('اتحفظت! الطالب هيشوفها في الدرس 🌳')
        loadMaps()
      } else {
        toast.error(String(data.error || 'الحفظ فشل — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
    setSaving(false)
  }

  /* ===== (2026-و67) ربط/فك ربط خريطة محفوظة بدرس — طلب المستر:
     الخريطة ممنوع تظهر على فيديو غير لما هو يربطها، ويقدر يفكها/ينقلها في أي وقت.
     فك الربط = الخريطة تفضل محفوظة بس مش بتظهر على أي درس للطالب ===== */
  const [linkDialog, setLinkDialog] = useState<SavedMap | null>(null)
  const [linkVideoChoice, setLinkVideoChoice] = useState('none')
  const linkMap = async function (m: SavedMap, videoId: string) {
    try {
      const res = await fetch('/api/admin/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'link', id: m.id, videoId: videoId }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success(videoId ? 'الخريطة اتربطت بالدرس 📎 — هتظهر للطالب في الكارت' : 'اتفك ربط الخريطة — مش هتظهر على أي درس')
        setMaps(function (prev) { return prev.map(function (x) { return x.id === m.id ? Object.assign({}, x, { videoId: videoId }) : x }) })
      } else {
        toast.error(String(data.error || 'الربط فشل — جرب تاني'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
  }

  /* ===== مسح خريطة محفوظة ===== */
  const removeMap = async function (m: SavedMap) {
    if (!window.confirm('متأكد من مسح «' + m.title + '»؟ الطالب مش هيشوفها تاني')) return
    try {
      const res = await fetch('/api/admin/mindmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id: m.id }),
      })
      const data = await res.json()
      if (res.ok && data.ok) {
        toast.success('اتمسحت الخريطة')
        if (preview && preview.id === m.id) setPreview(null)
        loadMaps()
      } else {
        toast.error(String(data.error || 'المسح فشل'))
      }
    } catch (e) {
      toast.error('مشكلة في الاتصال — جرب تاني')
    }
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* ============ سيكشن 1: المصدر ============ */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Sparkles className="h-5 w-5 text-emerald-600" />
            مصدر الخريطة الذهنية
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Tabs value={tab} onValueChange={function (v) { setTab(v as 'youtube' | 'text') }}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="youtube" className="gap-1.5">
                <Film className="h-4 w-4" />
                🎬 لينك يوتيوب
              </TabsTrigger>
              <TabsTrigger value="text" className="gap-1.5">
                <FileText className="h-4 w-4" />
                📝 نص المادة
              </TabsTrigger>
            </TabsList>

            {/* تاب اليوتيوب */}
            <TabsContent value="youtube" className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">لينك الفيديو</label>
                <Input
                  dir="ltr"
                  value={youtubeUrl}
                  onChange={function (e) { setYoutubeUrl(e.target.value) }}
                  placeholder="https://www.youtube.com/watch?v=..."
                  className="text-left"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">ملاحظاتك عن الدرس (اختياري — بتساعد الـ AI)</label>
                <Textarea
                  rows={3}
                  value={ytNotes}
                  onChange={function (e) { setYtNotes(e.target.value) }}
                  placeholder="مثال: الدرس عن قانون فيثاغورس — ركّز على الأمثلة الأخيرة والخطأ الشائع في الوحدات"
                />
              </div>
            </TabsContent>

            {/* تاب نص المادة */}
            <TabsContent value="text" className="mt-4 space-y-3">
              <div>
                <label className="mb-1.5 block text-sm font-medium">نص المادة / الدرس</label>
                <Textarea
                  rows={8}
                  value={text}
                  onChange={function (e) { setText(e.target.value) }}
                  placeholder="الصق نص المادة هنا… الكلام اللي هتشرحه أو ملخص الدرس"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium">ملاحظاتك عن الدرس (اختياري — بتساعد الـ AI)</label>
                <Textarea
                  rows={3}
                  value={txtNotes}
                  onChange={function (e) { setTxtNotes(e.target.value) }}
                  placeholder="مثال: ركّز على تحويل الكسور العشرية لنسب — والطلبة غالبًا بيغلطوا في التقريب"
                />
              </div>
            </TabsContent>
          </Tabs>

          <Button
            onClick={generate}
            disabled={generating}
            size="lg"
            className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
          >
            {generating ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                {LOAD_MSGS[loadIdx]}
              </>
            ) : (
              <>
                <Brain className="h-5 w-5" />
                🧠 ولّد الخريطة الذهنية
              </>
            )}
          </Button>
          {generating ? (
            <p className="text-center text-xs text-muted-foreground">التوليد ممكن ياخد دقيقة — سيبني لحد ما يخلص 🙏</p>
          ) : null}
        </CardContent>
      </Card>

      {/* ============ سيكشن 2: معاينة + حفظ ============ */}
      {result && result.root ? (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">معاينة + حفظ</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* لو الخريطة استرشادية (بدون AI) — بانر أمبر */}
            {!aiFlag ? (
              <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-200">
                <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />
                <span>خريطة استرشادية من العنوان — زوّد ملاحظاتك وولّد تاني للدقة</span>
              </div>
            ) : null}

            <MindMapView mapData={result} compact />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-sm font-medium">عنوان الخريطة</label>
                <Input
                  value={saveTitle}
                  onChange={function (e) { setSaveTitle(e.target.value) }}
                  placeholder="عنوان يظهر للطالب"
                />
              </div>
              {videos.length > 0 ? (
                <div>
                  <label className="mb-1.5 block text-sm font-medium">اربط الدرس بفيديو (اختياري)</label>
                  <Select value={videoId} onValueChange={setVideoId}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="من غير ربط — عام للجميع" />
                    </SelectTrigger>
                    <SelectContent className="max-h-60">
                      <SelectItem value="none">🚫 من غير ربط</SelectItem>
                      {videos.map(function (v) {
                        return (
                          <SelectItem key={v.id} value={v.id}>
                            {v.title}
                          </SelectItem>
                        )
                      })}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <Button
              onClick={save}
              disabled={saving || generating}
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700 sm:w-auto"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              احفظ الخريطة
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {/* ============ سيكشن 3: الخرائط المحفوظة ============ */}
      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
          <CardTitle className="text-lg">الخرائط المحفوظة</CardTitle>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={function () {
              setMapsLoading(true)
              loadMaps()
            }}
            aria-label="تحديث"
          >
            <RefreshCw className={'h-4 w-4' + (mapsLoading ? ' animate-spin' : '')} />
          </Button>
        </CardHeader>
        <CardContent>
          {mapsLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              بنحمّل الخرائط…
            </div>
          ) : maps.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              لسه مفيش خرائط محفوظة — ولّد واحدة من فوق واحفظها 🌱
            </p>
          ) : (
            <div className="max-h-96 space-y-2 overflow-y-auto pl-1">
              {maps.map(function (m) {
                const branchCount = m.data && m.data.root && Array.isArray(m.data.root.children) ? m.data.root.children.length : 0
                return (
                  <div key={m.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold">{m.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge
                          variant="outline"
                          className={
                            m.sourceType === 'text'
                              ? 'border-teal-300 bg-teal-50 text-[10px] text-teal-700 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300'
                              : 'border-amber-300 bg-amber-50 text-[10px] text-amber-700 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                          }
                        >
                          {m.sourceType === 'text' ? '📝 نص' : '🎬 يوتيوب'}
                        </Badge>
                        <Badge variant="secondary" className="text-[10px]">
                          🌳 {branchCount} فروع
                        </Badge>
                        {m.videoId ? (
                          <Badge variant="outline" className="text-[10px] border-violet-300 bg-violet-50 text-violet-700 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300 gap-1">
                            <Link2 className="h-3 w-3" />
                            {(videos.find(function (v) { return v.id === m.videoId }) || ({} as VideoItem)).title || 'درس'}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] text-muted-foreground">من غير ربط — مش ظاهرة للطالب</Badge>
                        )}
                        <span className="text-[11px] text-muted-foreground">{fmtDate(m.createdAt)}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        title="اختار الدرس اللي هتظهر عليه الخريطة — أو فك الربط خالص"
                        onClick={function () { setLinkVideoChoice(m.videoId || 'none'); setLinkDialog(m) }}
                      >
                        <Link2 className="h-3.5 w-3.5" />
                        {m.videoId ? 'الربط' : 'اربط بدرس'}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1"
                        onClick={function () { setPreview(m) }}
                      >
                        <Eye className="h-3.5 w-3.5" />
                        معاينة
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-muted-foreground hover:text-rose-600"
                        onClick={function () { removeMap(m) }}
                        aria-label="مسح"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* (2026-و67) دايلوج ربط الخريطة بدرس — ربط/نقل/فك ربط */}
      <Dialog open={!!linkDialog} onOpenChange={function (o) { if (!o) setLinkDialog(null) }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">ربط الخريطة بدرس</DialogTitle>
            <DialogDescription className="text-right">
              اختار الدرس اللي هتظهر عليه «خريطة الدرس الذهنية» في واجهة الطالب — «من غير ربط» = مش هتظهر خالص
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <Select value={linkVideoChoice} onValueChange={setLinkVideoChoice}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="اختار الدرس" />
              </SelectTrigger>
              <SelectContent className="max-h-60">
                <SelectItem value="none">🚫 من غير ربط — مش ظاهرة للطالب</SelectItem>
                {videos.map(function (v) {
                  return (
                    <SelectItem key={v.id} value={v.id}>
                      {v.title}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <Button
              className="w-full bg-emerald-600 text-white hover:bg-emerald-700"
              onClick={function () {
                if (!linkDialog) return
                linkMap(linkDialog, linkVideoChoice === 'none' ? '' : linkVideoChoice)
                setLinkDialog(null)
              }}
            >
              <Save className="h-4 w-4" />
              احفظ الربط
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* دايلوج معاينة خريطة محفوظة */}
      <Dialog open={!!preview} onOpenChange={function (o) { if (!o) setPreview(null) }}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">{preview ? preview.title : ''}</DialogTitle>
            <DialogDescription className="text-right">
              {preview ? (preview.sourceType === 'text' ? '📝 من نص مادة' : '🎬 من فيديو يوتيوب') + ' · ' + fmtDate(preview.createdAt) : ''}
            </DialogDescription>
          </DialogHeader>
          {preview && preview.data && preview.data.root ? (
            <MindMapView mapData={preview.data} compact />
          ) : (
            <p className="py-6 text-center text-sm text-muted-foreground">بيانات الخريطة مش متاحة</p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
