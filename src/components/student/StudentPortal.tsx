'use client'

import { useAppStore } from '@/stores/app-store'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Input } from '@/components/ui/input'
import {
  Video, ClipboardList, FileText, Megaphone, MessageSquare, Send,
  LogOut, Loader2, FileDown, Bell, PlayCircle, CheckCircle2,
  BookOpen, Target, TrendingUp, GraduationCap, ChevronLeft, ExternalLink,
  User, Phone, Award, Lock, X, ListTodo,
  HelpCircle, ArrowLeft, Rocket, Flag,
} from 'lucide-react'
import { useState, useEffect, useRef, useMemo } from 'react'
import Image from 'next/image'
import { toast } from 'sonner'
import type { Video as VideoType, Homework, Exam, Announcement, Discussion, ExamResult } from '@/stores/app-store'
import { MathKeyboard } from '@/components/student/MathKeyboard'
import { SecurePlayerModal } from '@/components/student/SecurePlayerModal'
import { StudentComplaints } from '@/components/student/StudentComplaints'
import { FractionText } from '@/components/FractionText'

export function StudentPortal() {
  const { currentStudent, logout } = useAppStore()
  const [dashboardData, setDashboardData] = useState<{
    videos: VideoType[]
    homework: Homework[]
    exams: Exam[]
    announcements: Announcement[]
    examResults: ExamResult[]
    watchedIds: Set<string>
    approvedVideoIds: Set<string>
    videoProgress: Record<string, number>
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [showFullPortal, setShowFullPortal] = useState(false)
  const [showGuide, setShowGuide] = useState(false)
  const [activeTab, setActiveTab] = useState('videos')
  const [completedExamIds, setCompletedExamIds] = useState<Set<string>>(new Set())
  const [completedHwIds, setCompletedHwIds] = useState<Set<string>>(new Set())

  const grade = currentStudent?.grade || ''
  const studentId = currentStudent?.id || ''

  useEffect(() => {
    if (!grade || !studentId) return
    let cancelled = false
    ;(async () => {
      try {
        const [videosRes, hwRes, examsRes, annRes, resultsRes, actRes, payRes, accessRes, progressRes] = await Promise.all([
          fetch(`/api/videos?grade=${encodeURIComponent(grade)}&pageSize=100`).then(r => r.json()),
          fetch(`/api/homework?grade=${encodeURIComponent(grade)}&pageSize=50`).then(r => r.json()),
          fetch(`/api/exams?grade=${encodeURIComponent(grade)}&pageSize=50`).then(r => r.json()),
          fetch(`/api/announcements?grade=${encodeURIComponent(grade)}&pageSize=10`).then(r => r.json()),
          fetch(`/api/exam-results?grade=${encodeURIComponent(grade)}`).then(r => r.json()),
          fetch(`/api/activities?studentId=${studentId}&action=watched_video&pageSize=200`).then(r => r.json()),
          fetch(`/api/payments?studentId=${studentId}&status=approved&pageSize=200`).then(r => r.json()),
          fetch(`/api/video-access?studentId=${studentId}`).then(r => r.json()).catch(() => ({ accesses: [] })),
          fetch(`/api/video-progress?studentId=${studentId}`).then(r => r.json()).catch(() => ({ progress: [] })),
        ])
        if (cancelled) return
        const videos = videosRes.videos || []
        const watchedIds = new Set<string>((actRes.activities || []).map((a: any) => a.details?.replace('Watched: ', '')))
        const approvedPayments = payRes.payments || []
        const paidVideoIds = approvedPayments.map((p: any) => p.videoId).filter(Boolean)
        const grantedVideoIds = (accessRes.accesses || []).map((a: any) => a.videoId).filter(Boolean)
        const approvedVideoIds = new Set<string>([...paidVideoIds, ...grantedVideoIds])
        // Build progress map: videoId -> percentage (0-100)
        const progressMap: Record<string, number> = {}
        ;(progressRes.progress || []).forEach((p: any) => {
          if (p.videoId && p.totalSeconds > 0) {
            var pct = Math.min(100, Math.round((p.watchedSeconds / p.totalSeconds) * 100))
            progressMap[p.videoId] = pct
            if (pct >= 90) watchedIds.add(p.videoId)
          }
        })
        setDashboardData({
          videos,
          homework: hwRes.homework || [],
          exams: examsRes.exams || [],
          announcements: annRes.announcements || [],
          examResults: resultsRes.results || [],
          watchedIds,
          approvedVideoIds,
          videoProgress: progressMap,
        })
      } catch { /* silent */ }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [grade, studentId])

  // Dashboard overview before entering full portal
  if (!showFullPortal) {
    if (loading) {
      return (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
        </div>
      )
    }

    const initialData = dashboardData
    if (!initialData) return null

    // Calculate summary stats
    var totalVideos = initialData.videos.length
    var watchedCount = 0
    var avgProgress = 0
    var progressCount = 0
    initialData.videos.forEach(function(v) {
      var prog = initialData.videoProgress[v.id]
      if (prog !== undefined) {
        avgProgress += prog
        progressCount++
      }
      if (initialData.watchedIds.has(v.id)) watchedCount++
    })
    if (progressCount > 0) avgProgress = Math.round(avgProgress / progressCount)

    var pendingHomework = initialData.homework.length
    var pendingExams = initialData.exams.filter(function(e) {
      return !initialData.examResults.find(function(r) { return r.examId === e.id })
    }).length

    return (
      <div className="flex-1 py-6 px-4 sm:px-6">
        <div className="mx-auto max-w-4xl space-y-5">
          {/* Welcome Card + Quick Actions on top */}
          <Card className="bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-primary/20">
            <CardContent className="p-5">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
                    <User className="h-6 w-6 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h1 className="text-lg font-bold truncate">أهلاً يا {currentStudent?.name?.split(' ')[0]} 👋</h1>
                    <p className="text-xs text-muted-foreground">كل حاجتك هنا في مكان واحد</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <Button variant="outline" size="sm" onClick={() => setShowGuide(true)} className="gap-1.5">
                    <HelpCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">دليل التعامل</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10">
                    <LogOut className="h-4 w-4 ml-1" />
                    <span className="hidden sm:inline">خروج</span>
                  </Button>
                </div>
              </div>
              {/* Big Enter Button */}
              <Button
                onClick={() => setShowFullPortal(true)}
                className="w-full mt-4 min-h-[48px] font-bold text-base gap-2"
              >
                <Rocket className="h-5 w-5" />
                يلا ندخل صفحتنا
              </Button>
            </CardContent>
          </Card>

          {/* Quick Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { icon: Video, label: 'الدروس', value: totalVideos, sub: watchedCount + ' اتفرجت', color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30' },
              { icon: ClipboardList, label: 'الواجبات', value: pendingHomework, sub: pendingHomework > 0 ? 'محتاجة تتسلم' : 'كله تمام', color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
              { icon: FileText, label: 'الامتحانات', value: pendingExams, sub: pendingExams > 0 ? 'لسه متقدمتش' : 'خلصت كلها', color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30' },
              { icon: TrendingUp, label: 'المشاهدة', value: avgProgress + '%', sub: progressCount + ' فيديو', color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30' },
            ].map((s, i) => (
              <Card key={i} className="hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-10 w-10 rounded-lg ${s.color} flex items-center justify-center shrink-0`}>
                      <s.icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-2xl font-bold leading-tight">{s.value}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{s.label}</p>
                      <p className="text-[10px] text-muted-foreground/70 truncate">{s.sub}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pending Tasks Section */}
          {(pendingHomework > 0 || pendingExams > 0) && (
            <Card className="border-amber-500/30 bg-amber-50/50 dark:bg-amber-900/10">
              <CardContent className="p-4">
                <div className="flex items-center gap-2 mb-3">
                  <ListTodo className="h-5 w-5 text-amber-600" />
                  <h2 className="font-bold text-sm">اللي لازم تعمله دلوقتي</h2>
                  <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 mr-auto">{pendingHomework + pendingExams} حاجة</Badge>
                </div>
                <div className="space-y-2">
                  {initialData.homework.slice(0, 3).map(function(hw) {
                    var hasMCQ = false
                    try { if ((hw as any).questions) { var parsed = JSON.parse((hw as any).questions); hasMCQ = parsed.length > 0 } } catch {}
                    return (
                      <button
                        key={hw.id}
                        onClick={() => setShowFullPortal(true)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-white/5 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors text-right"
                      >
                        <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center shrink-0">
                          <ClipboardList className="h-4 w-4 text-blue-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{hw.title}</p>
                          <p className="text-[10px] text-muted-foreground">واجب {hasMCQ ? '· ' + JSON.parse((hw as any).questions || '[]').length + ' أسئلة' : ''}</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] border-blue-500/30 text-blue-500">واجب</Badge>
                        <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    )
                  })}
                  {initialData.exams.filter(function(e) {
                    return !initialData.examResults.find(function(r) { return r.examId === e.id })
                  }).slice(0, 2).map(function(exam) {
                    return (
                      <button
                        key={exam.id}
                        onClick={() => setShowFullPortal(true)}
                        className="w-full flex items-center gap-3 p-2 rounded-lg bg-white dark:bg-white/5 hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors text-right"
                      >
                        <div className="h-8 w-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                          <FileText className="h-4 w-4 text-orange-500" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate">{exam.title}</p>
                          <p className="text-[10px] text-muted-foreground">امتحان</p>
                        </div>
                        <Badge variant="outline" className="text-[9px] border-orange-500/30 text-orange-500">امتحان</Badge>
                        <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Videos Preview with Progress */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-sm flex items-center gap-2">
                <Video className="h-4 w-4 text-purple-600" />
                الدروس ({watchedCount}/{totalVideos} اتفرجت)
              </h2>
              <Button variant="link" size="sm" className="text-xs p-0 h-auto" onClick={() => setShowFullPortal(true)}>
                بص على الكل
              </Button>
            </div>
            <VideosTab videos={initialData.videos} watchedIds={initialData.watchedIds} approvedVideoIds={initialData.approvedVideoIds} studentId={studentId} grade={grade} videoProgress={initialData.videoProgress} studentStatus={currentStudent?.status} isPaidAccess={currentStudent?.isPaidAccess} studentName={currentStudent?.name || ''} studentPhone={currentStudent?.phone || ''} />
          </div>

          {/* Guide modal */}
          {showGuide && <StudentGuide onClose={() => setShowGuide(false)} onEnterPortal={() => { setShowGuide(false); setShowFullPortal(true) }} />}
        </div>
      </div>
    )
  }

  // Full portal
  if (!dashboardData) return null

  const tabs = [
    { id: 'videos', label: 'الدروس', icon: Video },
    { id: 'homework', label: 'الواجبات', icon: ClipboardList },
    { id: 'exams', label: 'الامتحانات', icon: FileText },
    { id: 'announcements', label: 'التنبيهات', icon: Megaphone },
    { id: 'discussions', label: 'المجتمع', icon: MessageSquare },
    { id: 'complaints', label: 'الشكاوي', icon: Flag },
  ]

  return (
    <div className="flex-1 flex flex-col">
      {/* Top Bar */}
      <div className="border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowFullPortal(false)} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline text-xs">رجوع</span>
          </Button>
          <h1 className="font-bold text-sm sm:text-base truncate">{currentStudent?.name?.split(' ')[0]}</h1>
          <Badge variant="outline" className="text-[10px] hidden sm:inline-flex">{grade}</Badge>
        </div>
        <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10">
          <LogOut className="h-4 w-4 ml-1" />
          <span className="hidden sm:inline">خروج</span>
        </Button>
      </div>

      {/* Tab Bar */}
      <div className="border-b px-4 flex gap-1 overflow-x-auto">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'videos' && <VideosTab videos={dashboardData.videos} watchedIds={dashboardData.watchedIds} approvedVideoIds={dashboardData.approvedVideoIds} studentId={studentId} grade={grade} videoProgress={dashboardData.videoProgress} studentStatus={currentStudent?.status} isPaidAccess={currentStudent?.isPaidAccess} studentName={currentStudent?.name || ''} studentPhone={currentStudent?.phone || ''} />}
        {activeTab === 'homework' && <HomeworkTab homework={dashboardData.homework} studentId={studentId} completedHwIds={completedHwIds} onHwSubmitted={(id) => setCompletedHwIds(prev => new Set([...prev, id]))} />}
        {activeTab === 'exams' && <ExamsTab exams={dashboardData.exams} results={dashboardData.examResults} completedExamIds={completedExamIds} onExamSubmitted={(id) => setCompletedExamIds(prev => new Set([...prev, id]))} studentId={studentId} />}
        {activeTab === 'announcements' && <AnnouncementsTab announcements={dashboardData.announcements} />}
        {activeTab === 'discussions' && <DiscussionsTab grade={grade} studentId={studentId} studentName={currentStudent?.name || ''} />}
        {activeTab === 'complaints' && <StudentComplaints studentId={studentId} studentName={currentStudent?.name || ''} studentPhone={currentStudent?.phone || ''} grade={grade} />}
      </div>
    </div>
  )
}

function VideosTab({ videos, watchedIds, approvedVideoIds, studentId, grade, videoProgress, studentStatus, isPaidAccess, studentName, studentPhone }: { videos: VideoType[]; watchedIds: Set<string>; approvedVideoIds: Set<string>; studentId: string; grade: string; videoProgress: Record<string, number>; studentStatus?: string; isPaidAccess?: boolean; studentName?: string; studentPhone?: string }) {
  const { setView, setPendingPaymentVideo } = useAppStore()
  const [localWatched, setLocalWatched] = useState(watchedIds)
  const [activeLessonVideo, setActiveLessonVideo] = useState<VideoType | null>(null)

  // Only an explicitly approved, non-paid student gets free access. A paid account always pays for priced videos.
  const isFreeStudent = studentStatus === 'approved' && isPaidAccess !== true
  const isPaidStudent = studentStatus === 'paid' || isPaidAccess === true

  const trackVideoWatch = (videoId: string) => {
    if (!studentId || localWatched.has(videoId)) return
    setLocalWatched(prev => new Set([...prev, videoId]))
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId, action: 'watched_video', details: `Watched: ${videoId}` }),
    }).catch(() => {})
  }

  const getYouTubeId = (url: string) => {
    const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/)
    return match ? match[1] : null
  }

  // حماية الفيديو: السيرفر مبيرسلش url/filePath خلاص — بنعرف النوع من kind
  // والتشغيل بيتم عبر /api/video-play بس (توكن موقّع للملفات المرفوعة)
  const videoKind = (v: any): 'youtube' | 'file' | 'link' | 'none' => {
    if (v.kind) return v.kind
    if (getYouTubeId(v.url || '')) return 'youtube'
    if (v.filePath && /\.(mp4|webm|mov|avi)$/i.test(v.filePath)) return 'file'
    if (v.url) return 'link'
    return 'none'
  }

  // فتح أي درس (يوتيوب أو ملف مرفوع): بنطلب تذكرة تشغيل واحدة الاستخدام
  // من /api/video-ticket — مفيش أي YouTube ID أو رابط ملف بيرجع للصفحة.
  const openPlayModal = (video: VideoType) => {
    fetch('/api/video-ticket?videoId=' + video.id + '&studentId=' + encodeURIComponent(studentId || ''))
      .then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d } })
      })
      .then(function (res) {
        if (res.ok && res.d.ok && res.d.ticket) {
          setActiveLessonVideo({ ...video, playTicket: res.d.ticket } as any)
        } else {
          toast.error(res.d.error || 'الفيديو مش متاح — لو دفعت تواصل مع الإدارة', { duration: 6000 })
        }
      })
      .catch(function () { toast.error('حصل خطأ في تشغيل الفيديو') })
  }

  if (videos.length === 0) return <EmptyState message="لا توجد دروس حالياً" />

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2">
      {videos.map((video) => {
        const kind = videoKind(video)
        const isVideoFile = kind === 'file'
        const isWatched = localWatched.has(video.id)
        const thumbSrc = video.thumbnail || (video as any).thumb || null
        const hasPrice = (video.price || 0) > 0
        const hasApprovedPayment = approvedVideoIds.has(video.id)
        // A paid account is not a purchase grant. Every priced video stays locked
        // until this specific video has an approved payment/access record.
        const needsPay = hasPrice && !hasApprovedPayment
        const progress = videoProgress[video.id] || 0

        return (
          <Card key={video.id} className={`overflow-hidden transition-all ${isWatched ? 'border-emerald-500/30' : ''}`}>
            <div className="relative aspect-video bg-black">
              {needsPay ? (
                <div className="w-full h-full relative">
                  {thumbSrc ? (
                    <Image src={thumbSrc} alt={video.title} fill className="object-cover blur-sm" sizes="(max-width: 640px) 100vw, 50vw" unoptimized loading="eager" />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-black/80 to-black" />
                  )}
                  <div className="absolute inset-0 bg-black/50 flex flex-col items-center justify-center gap-3 z-20">
                    <div className="h-14 w-14 rounded-full bg-white/10 backdrop-blur-sm flex items-center justify-center">
                      <Lock className="h-7 w-7 text-white" />
                    </div>
                    <Badge className="text-lg px-4 py-1.5 bg-amber-500 text-white">
                      {video.price} ج.م
                    </Badge>
                    <Button
                      className="mt-1"
                      onClick={() => {
                        setPendingPaymentVideo({
                          id: video.id,
                          title: video.title,
                          price: video.price || 0,
                          grade: grade,
                        })
                        setView('student-payment')
                      }}
                    >
                      ادفع الآن
                    </Button>
                  </div>
                </div>
              ) : kind === 'youtube' || isVideoFile ? (
                // Protected lesson card — gallery style thumbnail (no YouTube branding)
                // The actual video opens in a protected modal player on click
                <div
                  className="w-full h-full relative cursor-pointer group/vid"
                  onClick={function () { openPlayModal(video) }}
                  role="button"
                  aria-label={'تشغيل ' + video.title}
                >
                  {thumbSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover transition-transform duration-500 group-hover/vid:scale-105" draggable={false} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-black/80 to-black" />
                  )}
                  <div className="absolute inset-0 bg-black/25 group-hover/vid:bg-black/40 transition-colors" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-white/90 flex items-center justify-center shadow-2xl transition-transform group-hover/vid:scale-110">
                      <PlayCircle className="h-8 w-8 text-primary ml-0.5" />
                    </div>
                  </div>
                </div>
              ) : thumbSrc ? (
                <div className="w-full h-full relative">
                  <Image src={thumbSrc} alt={video.title} fill className="object-cover" sizes="(max-width: 640px) 100vw, 50vw" unoptimized loading="eager" fetchPriority="high" />
                </div>
              ) : video.url ? (
                <a href={video.url} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 w-full h-full text-white/70 hover:text-white transition-colors">
                  <ExternalLink className="h-6 w-6" />
                  <span className="text-sm">فتح الرابط</span>
                </a>
              ) : (
                <div className="flex items-center justify-center w-full h-full">
                  <Video className="h-10 w-10 text-white/30" />
                </div>
              )}
              {/* Progress Bar Overlay */}
              {progress > 0 && !needsPay && (
                <div className="absolute bottom-0 left-0 right-0 z-30">
                  <div className="w-full h-1.5 bg-black/30">
                    <div
                      className={`h-full transition-all ${progress >= 90 ? 'bg-emerald-500' : progress >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                      style={{ width: progress + '%' }}
                    />
                  </div>
                </div>
              )}
              {isWatched && (
                <div className="absolute top-2 right-2 z-30">
                  <Badge className="bg-emerald-500 text-white text-[10px] gap-1">
                    <CheckCircle2 className="h-3 w-3" /> تمت المشاهدة
                  </Badge>
                </div>
              )}
            </div>
            <CardContent className="p-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold text-sm truncate flex-1">{video.title}</h3>
                {progress > 0 && !needsPay && (
                  <span className={`text-[11px] font-bold shrink-0 ${
                    progress >= 90 ? 'text-emerald-600' : progress >= 50 ? 'text-amber-600' : 'text-red-500'
                  }`}>
                    {progress}%
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{new Date(video.createdAt).toLocaleDateString('ar-EG')}</p>
            </CardContent>
          </Card>
        )
      })}
      </div>

      {/* المشغل الآمن — تذكرة واحدة الاستخدام، مفيش أي لينك في الصفحة */}
      {activeLessonVideo && (activeLessonVideo as any).playTicket && (
        <SecurePlayerModal
          ticket={(activeLessonVideo as any).playTicket}
          title={activeLessonVideo.title}
          poster={activeLessonVideo.thumbnail || (activeLessonVideo as any).thumb || undefined}
          videoId={activeLessonVideo.id}
          studentId={studentId}
          onWatch={function () {
            trackVideoWatch(activeLessonVideo.id)
            setLocalWatched(function (prev) { return new Set([...prev, activeLessonVideo.id]) })
          }}
          onClose={function () { setActiveLessonVideo(null) }}
        />
      )}
    </>
  )
}
/* ========== HOMEWORK TAB ========== */
function HomeworkTab({ homework, studentId, completedHwIds, onHwSubmitted }: { homework: Homework[]; studentId: string; completedHwIds: Set<string>; onHwSubmitted: (hwId: string) => void }) {
  const [expandedHw, setExpandedHw] = useState<string | null>(null)
  const [hwAnswers, setHwAnswers] = useState<Record<string, Record<number, number | string>>>({})
  const [hwSubmitting, setHwSubmitting] = useState<string | null>(null)
  const [hwSubmitted, setHwSubmitted] = useState(false)
  const [submittedHwId, setSubmittedHwId] = useState<string | null>(null)
  const [blockedHwId, setBlockedHwId] = useState<string | null>(null)
  const [hwResults, setHwResults] = useState<Record<string, { score: number; maxScore: number }>>({})
  const [hwWrongQuestions, setHwWrongQuestions] = useState<Record<string, { question: string; studentAnswer: string; correctAnswer: string }[]>>({})
  const [hwAllQuestions, setHwAllQuestions] = useState<Record<string, any[]>>({})
  const [hwWritingAnswers, setHwWritingAnswers] = useState<Record<string, any[]>>({})
  const [hwDisplayQuestions, setHwDisplayQuestions] = useState<Record<string, any[]>>({})
  const [hwDisplayMap, setHwDisplayMap] = useState<Record<string, number[]>>({})
  const hwShuffleMaps = useRef<Record<string, number[]>>({})
  const hwPollTimers = useRef<Record<string, any>>({})

  /* Poll the background AI grading until it finishes — then update score + verdicts live */
  const startGradingPoll = (resultId: string, hwId: string) => {
    if (hwPollTimers.current[hwId]) clearInterval(hwPollTimers.current[hwId])
    var tries = 0
    hwPollTimers.current[hwId] = setInterval(async function() {
      tries++
      if (tries > 45) { clearInterval(hwPollTimers.current[hwId]); delete hwPollTimers.current[hwId]; return }
      try {
        var r = await fetch('/api/homework/result/' + resultId)
        var d = await r.json()
        if (d && d.ok && d.result && d.result.gradingDone) {
          clearInterval(hwPollTimers.current[hwId])
          delete hwPollTimers.current[hwId]
          setHwResults(function(prev) { return { ...prev, [hwId]: { score: d.result.score, maxScore: d.result.maxScore } } })
          if (d.result.writingAnswers && d.result.writingAnswers.length > 0) {
            setHwWritingAnswers(function(prev) { return { ...prev, [hwId]: d.result.writingAnswers } })
          }
          toast.success('خلص تصحيح الأسئلة المقالية بالذكاء الاصطناعي ✅')
        }
      } catch (e) {}
    }, 4000)
  }

  useEffect(function() {
    return function cleanup() {
      Object.keys(hwPollTimers.current).forEach(function(k) {
        clearInterval(hwPollTimers.current[k])
        delete hwPollTimers.current[k]
      })
    }
  }, [])

  useEffect(() => {
    if (!studentId) return
    fetch('/api/homework-results?studentId=' + studentId)
      .then(function(r) { return r.json() })
      .then(function(data) {
        var map: Record<string, { score: number; maxScore: number }> = {}
        ;(data.results || []).forEach(function(r: any) {
          map[r.homeworkId] = { score: r.score, maxScore: r.maxScore }
          onHwSubmitted(r.homeworkId)
        })
        setHwResults(map)
      })
      .catch(function() {})
  }, [studentId])

  if (homework.length === 0) return <EmptyState message="لا توجد واجبات حالياً" />

  // BLOCK SCREEN — homework already submitted, cannot re-enter, but show score + wrong answers
  if (blockedHwId) {
    var blockedHw = homework.find(function(h) { return h.id === blockedHwId })
    var bScore = hwResults[blockedHwId]
    var bWrong = hwWrongQuestions[blockedHwId] || []
    // remaining homeworks: not yet submitted (excluding the blocked one)
    var bRemaining = homework.filter(function(h) { return h.id !== blockedHwId && !completedHwIds.has(h.id) })
    var bDone = homework.filter(function(h) { return h.id !== blockedHwId && completedHwIds.has(h.id) })
    return (
      <div className="space-y-4">
        {/* Block header */}
        <div className="flex flex-col items-center justify-center py-10 px-6 space-y-4">
          <div className="h-20 w-20 rounded-full bg-red-500/10 flex items-center justify-center">
            <X className="h-12 w-12 text-red-500" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-bold text-red-600">تم تقديم هذا الواجب بالفعل ولا يمكنك إعادته</h2>
            {blockedHw && <p className="text-sm text-muted-foreground">{blockedHw.title}</p>}
          </div>
          <Button onClick={function() { onHwSubmitted(blockedHwId); setBlockedHwId(null) }} variant="outline">العودة إلى قائمة الواجبات</Button>
        </div>
        {/* Score + wrong answers */}
        {bScore && (
          <div className="mx-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-sm text-emerald-700 dark:text-emerald-400">تم تقديم الواجب بنجاح</p>
                <p className="text-xs text-muted-foreground">النتيجة: {bScore.score}/{bScore.maxScore}</p>
              </div>
            </div>
            {bWrong.length > 0 && (
              <div className="mt-3 space-y-2">
                <p className="text-sm font-semibold text-red-600">الإجابات الخاطئة ({bWrong.length}):</p>
                {bWrong.map(function(wq, wi) {
                  return (
                    <Card key={wi} className="border-red-200 dark:border-red-900/40">
                      <CardContent className="p-3 space-y-2">
                        <p className="text-sm font-medium whitespace-pre-wrap break-words" dir="ltr" style={{ textAlign: 'left' }}>{wi + 1}. <FractionText text={wq.question} /></p>
                        <div className="space-y-1">
                          <p className="text-xs text-red-600">إجابتك: <span dir="ltr"><FractionText text={wq.studentAnswer} /></span></p>
                          <p className="text-xs text-emerald-600">الإجابة الصحيحة: <span dir="ltr"><FractionText text={wq.correctAnswer} /></span></p>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}
            {/* أحسنت ONLY when the student got the FULL final grade (score === maxScore) */}
            {(function() {
              var bWriting = hwWritingAnswers[blockedHwId] || []
              var bWritingBad = bWriting.some(function(wa) { return wa.isCorrect === false && wa.answer && String(wa.answer).trim() })
              var bPending = bWriting.some(function(wa) { return wa.gradingStatus === 'pending' })
              var bFull = !!bScore && bScore.score === bScore.maxScore
              return bWrong.length === 0 && !bWritingBad && !bPending && bFull
            })() && (
              <p className="mt-3 text-sm text-emerald-600 font-medium">أحسنت يا بطل! 🎉 جميع الإجابات صحيحة والدرجة النهائية كاملة</p>
            )}
            {bWrong.length === 0 && (function() {
              var bWriting = hwWritingAnswers[blockedHwId] || []
              var bWritingBad = bWriting.some(function(wa) { return wa.isCorrect === false && wa.answer && String(wa.answer).trim() })
              var bPending = bWriting.some(function(wa) { return wa.gradingStatus === 'pending' })
              var bFull = !!bScore && bScore.score === bScore.maxScore
              return !bWritingBad && !bFull && bPending
            })() && (
              <p className="mt-3 text-sm text-amber-600 font-medium flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> لسه في أسئلة مقالية بتتصحح بالذكاء الاصطناعي — النتيجة النهائية هتتحدث تلقائياً</p>
            )}
          </div>
        )}

        {/* OTHER HOMEWORKS — quick navigation */}
        <div className="mx-4 mt-2 space-y-3">
          {bRemaining.length > 0 && (
            <Card className="border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-900/10">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">واجبات جديدة لم تبدأها ({bRemaining.length})</p>
                </div>
                <div className="space-y-1.5">
                  {bRemaining.map(function(hw) {
                    var qCount = 0
                    try { if ((hw as any).questions) qCount = JSON.parse((hw as any).questions).length } catch {}
                    return (
                      <button
                        key={hw.id}
                        onClick={function() { setBlockedHwId(null); setTimeout(function() { setExpandedHw(hw.id) }, 50) }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-right"
                      >
                        <ClipboardList className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-xs font-medium truncate">{hw.title}</p>
                          {qCount > 0 && <p className="text-[10px] text-muted-foreground">{qCount} سؤال</p>}
                        </div>
                        <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {bRemaining.length === 0 && bDone.length === 0 && (
            <div className="text-center py-6 px-4">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد واجبات أخرى حالياً</p>
              <p className="text-xs text-muted-foreground/70 mt-1">انتظر إضافة المستر لواجبات جديدة</p>
            </div>
          )}
          {bDone.length > 0 && (
            <Card className="border-muted">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                  <p className="text-sm font-bold text-muted-foreground">واجبات مُسلمة ({bDone.length})</p>
                </div>
                <div className="space-y-1.5">
                  {bDone.map(function(hw) {
                    var dScore = hwResults[hw.id]
                    return (
                      <button
                        key={hw.id}
                        onClick={function() { setBlockedHwId(hw.id) }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors text-right"
                      >
                        <ClipboardList className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-xs font-medium truncate">{hw.title}</p>
                          {dScore && <p className="text-[10px] text-muted-foreground">النتيجة: {dScore.score}/{dScore.maxScore}</p>}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    )
  }

  // SUCCESS SCREEN — just submitted, show score + ALL questions review (in display order)
  if (hwSubmitted && submittedHwId) {
    var sScore = hwResults[submittedHwId]
    var sWrong = hwWrongQuestions[submittedHwId] || []
    var sDisplayQuestions = hwDisplayQuestions[submittedHwId] || hwAllQuestions[submittedHwId] || []
    var sWritingAnswers = hwWritingAnswers[submittedHwId] || []
    // remaining homeworks: not yet submitted (excluding just-submitted)
    var sRemaining = homework.filter(function(h) { return h.id !== submittedHwId && !completedHwIds.has(h.id) })
    var sDone = homework.filter(function(h) { return h.id !== submittedHwId && completedHwIds.has(h.id) })
    return (
      <div className="space-y-4">
        <div className="flex flex-col items-center justify-center py-10 px-6 space-y-4">
          <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-lg font-bold text-emerald-600">تم تقديم الواجب بنجاح</h2>
          </div>
          <Button onClick={function() {
            setHwSubmitted(false); setSubmittedHwId(null); setExpandedHw(null)
          }} className="mt-2">العودة إلى قائمة الواجبات</Button>
        </div>
        {/* Score */}
        {sScore && (
          <div className="mx-4">
            <div className="flex items-center gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0" />
              <div>
                <p className="font-bold text-sm text-emerald-700 dark:text-emerald-400">النتيجة: {sScore.score}/{sScore.maxScore}</p>
              </div>
            </div>
          </div>
        )}
        {/* All Questions Review - in the same order the student saw */}
        {sDisplayQuestions.length > 0 && (
          <div className="mx-4 space-y-3">
            <p className="text-sm font-semibold text-foreground">مراجعة الأسئلة:</p>
            {sDisplayQuestions.map(function(q: any, di: number) {
              var qType = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) || (Array.isArray(q.options) && q.options.length > 0 && q.options.every(function(o: string) { return !o || o === 'N/A' || o === 'لا يوجد' || o.trim() === '' })) ? 'writing' : 'mcq'
              var isWrong = sWrong.some(function(w: any) { return w.question === (q.question || q.q) })
              var wrongQ = sWrong.find(function(w: any) { return w.question === (q.question || q.q) })
              var correctIdx = typeof q.correct === 'number' ? q.correct : 0
              var correctAnswer = qType === 'mcq' && Array.isArray(q.options) ? (String.fromCharCode(65 + correctIdx) + ') ' + q.options[correctIdx]) : ''
              // For writing: find matching writing answer
              var writingAns = sWritingAnswers.find(function(wa: any) { return wa.question === (q.question || q.q) })
              var writingIsCorrect = writingAns && writingAns.isCorrect === true
              var writingIsWrong = writingAns && writingAns.isCorrect === false && writingAns.answer && writingAns.answer.trim()
              return (
                <Card key={di} className={qType === 'writing' ? (writingIsWrong ? 'border-red-200 dark:border-red-900/40' : writingIsCorrect ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-amber-200 dark:border-amber-900/40') : isWrong ? 'border-red-200 dark:border-red-900/40' : 'border-emerald-200 dark:border-emerald-900/40'}>
                  <CardContent className="p-3 space-y-2" dir="ltr">
                    <div className="flex items-start gap-2">
                      <span className={"shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full " + (
                        qType === 'writing'
                          ? (writingIsCorrect ? 'bg-emerald-500/10 text-emerald-600' : writingIsWrong ? 'bg-red-500/10 text-red-600' : 'bg-amber-500/10 text-amber-600')
                          : isWrong ? (wrongQ && wrongQ.studentAnswer === 'لم يتم الإجابة' ? 'bg-gray-500/10 text-gray-600' : 'bg-red-500/10 text-red-600') : 'bg-emerald-500/10 text-emerald-600'
                      )}>
                        {qType === 'writing'
                          ? (writingIsCorrect ? 'Correct' : writingIsWrong ? 'Wrong' : (!writingAns || !writingAns.answer || !writingAns.answer.trim() ? 'Empty' : 'Pending'))
                          : isWrong ? (wrongQ && wrongQ.studentAnswer === 'لم يتم الإجابة' ? 'Empty' : 'Wrong') : 'Correct'}
                      </span>
                      <p className="text-sm font-medium flex-1 whitespace-pre-wrap break-words" style={{ textAlign: 'left' }}>{di + 1}. <FractionText text={q.question || q.q} /></p>
                    </div>
                    {qType === 'mcq' ? (
                      <div className="space-y-1 pl-8" dir="ltr">
                        {wrongQ && wrongQ.studentAnswer === 'لم يتم الإجابة' && (
                          <>
                            <p className="text-xs text-gray-500">Your answer: (not answered)</p>
                            {correctAnswer && (
                              <p className="text-xs text-emerald-600">Correct answer: <span dir="ltr">{correctAnswer}</span></p>
                            )}
                          </>
                        )}
                        {wrongQ && wrongQ.studentAnswer !== 'لم يتم الإجابة' && (
                          <>
                            <p className="text-xs text-red-600">Your answer: <span dir="ltr">{wrongQ.studentAnswer}</span></p>
                            <p className="text-xs text-emerald-600">Correct answer: <span dir="ltr">{wrongQ.correctAnswer}</span></p>
                          </>
                        )}
                        {!wrongQ && correctAnswer && (
                          <p className="text-xs text-emerald-600">Your answer is correct: <span dir="ltr">{correctAnswer}</span></p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1 pl-8" dir="ltr">
                        {writingAns && (
                          <div className="space-y-1 p-2 rounded-md bg-muted/30 border border-border/30">
                            <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="ltr">Your answer: <FractionText text={writingAns.answer || '(empty)'} /></p>
                            {/* Image preview */}
                            {(function() {
                              var m = (writingAns.answer || '').match(/\[📷\s*صورة\s*مرفقة:\s*([^\]]+?)\]/)
                              if (m && m[1]) {
                                var path = m[1].trim().replace(/^["']|["']$/g, '')
                                return (
                                  <div className="mt-1">
                                    <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">📷 الصورة المرفقة:</p>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                      src={path}
                                      alt="Your answer image"
                                      className="max-w-[200px] max-h-[150px] rounded-md border border-border/50 object-contain"
                                      onError={function(e) { var t = e.currentTarget as HTMLImageElement; if (t.parentElement) t.parentElement.style.display = 'none' }}
                                    />
                                  </div>
                                )
                              }
                              return null
                            })()}
                            {/* PENDING: background AI grading in progress */}
                            {writingAns.gradingStatus === 'pending' && (
                              <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">جاري التصحيح بالذكاء الاصطناعي... النتيجة هتظهر هنا تلقائياً</p>
                              </div>
                            )}
                            {/* AI extracted answer from image */}
                            {writingAns.aiExtractedAnswer && (
                              <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40">
                                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 mb-1">🤖 AI قرأ إجابتك من الصورة:</p>
                                <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="ltr"><FractionText text={writingAns.aiExtractedAnswer} /></p>
                                {writingAns.aiFeedback && (
                                  <p className="text-[10px] text-muted-foreground mt-1">{writingAns.aiFeedback}</p>
                                )}
                              </div>
                            )}
                            {writingAns.modelAnswer && (
                              <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="ltr">Correct answer: <FractionText text={writingAns.modelAnswer} /></p>
                            )}
                            {writingAns.feedback && !writingAns.aiExtractedAnswer && (
                              <p className="text-[10px] text-muted-foreground" dir="ltr">{writingAns.feedback}</p>
                            )}
                            {writingAns.awardedPoints !== undefined && (
                              <p className="text-[10px] font-semibold text-muted-foreground">Score: {writingAns.awardedPoints}/{writingAns.maxPoints || writingAns.points}</p>
                            )}
                          </div>
                        )}
                        {!writingAns && (
                          <>
                            <p className="text-xs text-gray-500">Your answer: (empty - not answered)</p>
                            {q.modelAnswer && (
                              <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="ltr">Correct answer: <FractionText text={q.modelAnswer} /></p>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        {/* أحسنت ONLY when the student got the FULL final grade (score === maxScore) */}
        {(function() {
          var sWritingBad = sWritingAnswers.some(function(wa) { return wa.isCorrect === false && wa.answer && String(wa.answer).trim() })
          var sPending = sWritingAnswers.some(function(wa) { return wa.gradingStatus === 'pending' })
          var sFull = !!sScore && sScore.score === sScore.maxScore
          return sDisplayQuestions.length === 0 && sWrong.length === 0 && !sWritingBad && !sPending && sFull
        })() && (
          <p className="mx-4 text-sm text-emerald-600 font-medium">أحسنت يا بطل! 🎉 جميع الإجابات صحيحة والدرجة النهائية كاملة</p>
        )}
        {sDisplayQuestions.length === 0 && sWrong.length === 0 && sWritingAnswers.some(function(wa) { return wa.gradingStatus === 'pending' }) && (
          <p className="mx-4 text-sm text-amber-600 font-medium flex items-center gap-1.5"><Loader2 className="h-3.5 w-3.5 animate-spin shrink-0" /> لسه في أسئلة مقالية بتتصحح بالذكاء الاصطناعي — النتيجة النهائية هتتحدث تلقائياً</p>
        )}

        {/* OTHER HOMEWORKS — quick navigation after submission */}
        <div className="mx-4 mt-4 space-y-3">
          {sRemaining.length > 0 && (
            <Card className="border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-900/10">
              <CardContent className="p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <ListTodo className="h-4 w-4 text-emerald-600" />
                  <p className="text-sm font-bold text-emerald-700 dark:text-emerald-400">واجبات جديدة لم تبدأها ({sRemaining.length})</p>
                </div>
                <div className="space-y-1.5">
                  {sRemaining.map(function(hw) {
                    var qCount = 0
                    try { if ((hw as any).questions) qCount = JSON.parse((hw as any).questions).length } catch {}
                    return (
                      <button
                        key={hw.id}
                        onClick={function() { setHwSubmitted(false); setSubmittedHwId(null); setTimeout(function() { setExpandedHw(hw.id) }, 50) }}
                        className="w-full flex items-center gap-2 p-2 rounded-lg bg-white dark:bg-white/5 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors text-right"
                      >
                        <ClipboardList className="h-4 w-4 text-emerald-500 shrink-0" />
                        <div className="flex-1 min-w-0 text-right">
                          <p className="text-xs font-medium truncate">{hw.title}</p>
                          {qCount > 0 && <p className="text-[10px] text-muted-foreground">{qCount} سؤال</p>}
                        </div>
                        <ChevronLeft className="h-3 w-3 text-muted-foreground shrink-0" />
                      </button>
                    )
                  })}
                </div>
              </CardContent>
            </Card>
          )}
          {sRemaining.length === 0 && sDone.length === 0 && (
            <div className="text-center py-6 px-4">
              <ClipboardList className="h-10 w-10 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">لا توجد واجبات أخرى حالياً</p>
              <p className="text-xs text-muted-foreground/70 mt-1">انتظر إضافة المستر لواجبات جديدة</p>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Split homework into new (not submitted) and done (submitted)
  var newHomework = homework.filter(function(hw) { return !completedHwIds.has(hw.id) })
  var doneHomework = homework.filter(function(hw) { return completedHwIds.has(hw.id) })

  return (
    <div className="space-y-4">
      {/* NEW HOMEWORK SECTION — prominently highlighted */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <ListTodo className="h-5 w-5 text-emerald-600" />
          <h2 className="font-bold text-sm text-emerald-700 dark:text-emerald-400">
            {newHomework.length > 0
              ? 'واجبات جديدة (' + newHomework.length + ')'
              : 'لا توجد واجبات جديدة'}
          </h2>
        </div>
        {newHomework.length === 0 && (
          <Card className="border-dashed border-emerald-500/30 bg-emerald-50/30 dark:bg-emerald-900/5">
            <CardContent className="p-6 text-center">
              <ClipboardList className="h-10 w-10 text-emerald-500/40 mx-auto mb-2" />
              <p className="text-sm font-medium text-muted-foreground">خلصت كل الواجبات المتاحة!</p>
              <p className="text-xs text-muted-foreground/70 mt-1">انتظر إضافة المستر لواجبات جديدة، أو راجع واجباتك المسلمة تحت.</p>
            </CardContent>
          </Card>
        )}
        {newHomework.map((hw) => {
        var allQuestions = (hw as any).questions ? JSON.parse((hw as any).questions) : []
        var hasQuestions = Array.isArray(allQuestions) && allQuestions.length > 0

        // Separate MCQ from writing questions
        var mcqQuestions: any[] = []
        var writingQuestions: any[] = []
        if (hasQuestions) {
          allQuestions.forEach(function(q: any) {
            // Detect writing: type field, OR options are empty/N/A
            var isWriting = q.type === 'writing' || q.type === 'essay'
            // Also detect if all options are N/A or empty → treat as writing
            if (!isWriting && Array.isArray(q.options)) {
              var allNA = q.options.length > 0 && q.options.every(function(o: string) { return !o || o === 'N/A' || o === 'لا يوجد' || o.trim() === '' })
              if (allNA) isWriting = true
            }
            // Also detect if options array is empty
            if (!isWriting && (!q.options || q.options.length === 0)) {
              isWriting = true
            }
            if (isWriting) {
              writingQuestions.push(q)
            } else {
              mcqQuestions.push(q)
            }
          })
        }
        var hasMCQ = mcqQuestions.length > 0
        var hasWriting = writingQuestions.length > 0
        var isExpanded = expandedHw === hw.id
        var isSubmitted = completedHwIds.has(hw.id)
        var myAnswers = hwAnswers[hw.id] || {}
        var existingResult = hwResults[hw.id]

        // Use cached shuffle if available, otherwise create new
        var mcqShuffle: number[] = []
        var writingShuffle: number[] = []
        var cachedMap = hwShuffleMaps.current[hw.id]
        if (cachedMap && cachedMap.length === allQuestions.length) {
          // Rebuild display arrays from cached map
          var mcqOrigIdx: number[] = []
          var writingOrigIdx: number[] = []
          allQuestions.forEach(function(q: any, i: number) {
            var isW = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) || (Array.isArray(q.options) && q.options.length > 0 && q.options.every(function(o: string) { return !o || o === 'N/A' || o === 'لا يوجد' || o.trim() === '' }))
            if (isW) writingOrigIdx.push(i)
            else mcqOrigIdx.push(i)
          })
          // Rebuild mcqShuffle and writingShuffle from cached map
          var cachedMcq: number[] = []
          var cachedWriting: number[] = []
          cachedMap.forEach(function(origIdx: number, displayIdx: number) {
            if (displayIdx < mcqOrigIdx.length) {
              cachedMcq.push(mcqOrigIdx.indexOf(origIdx))
            } else {
              cachedWriting.push(writingOrigIdx.indexOf(origIdx))
            }
          })
          mcqShuffle = cachedMcq.filter(function(i: number) { return i >= 0 })
          writingShuffle = cachedWriting.filter(function(i: number) { return i >= 0 })
          if (mcqShuffle.length === 0) mcqShuffle = mcqQuestions.map(function(_, i) { return i })
          if (writingShuffle.length === 0) writingShuffle = writingQuestions.map(function(_, i) { return i })
        } else {
          // Create new shuffle
          mcqShuffle = mcqQuestions.map(function(_, i) { return i })
          for (var si = mcqShuffle.length - 1; si > 0; si--) {
            var sj = Math.floor(Math.random() * (si + 1))
            var st = mcqShuffle[si]; mcqShuffle[si] = mcqShuffle[sj]; mcqShuffle[sj] = st
          }
          writingShuffle = writingQuestions.map(function(_, i) { return i })
          for (var wi = writingShuffle.length - 1; wi > 0; wi--) {
            var wj = Math.floor(Math.random() * (wi + 1))
            var wt = writingShuffle[wi]; writingShuffle[wi] = writingShuffle[wj]; writingShuffle[wj] = wt
          }
          // Build combined map
          var mcqOriginalIndices: number[] = []
          var writingOriginalIndices: number[] = []
          allQuestions.forEach(function(q: any, i: number) {
            var isW = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) || (Array.isArray(q.options) && q.options.length > 0 && q.options.every(function(o: string) { return !o || o === 'N/A' || o === 'لا يوجد' || o.trim() === '' }))
            if (isW) writingOriginalIndices.push(i)
            else mcqOriginalIndices.push(i)
          })
          var combinedMap: number[] = []
          mcqShuffle.forEach(function(shuffleIdx: number) {
            combinedMap.push(mcqOriginalIndices[shuffleIdx])
          })
          writingShuffle.forEach(function(shuffleIdx: number) {
            combinedMap.push(writingOriginalIndices[shuffleIdx])
          })
          hwShuffleMaps.current[hw.id] = combinedMap
        }

        // Build display questions: MCQ first (shuffled), then writing (shuffled)
        var displayMcq = mcqShuffle.length > 0 ? mcqShuffle.map(function(oi: number) { return mcqQuestions[oi] }) : mcqQuestions
        var displayWriting = writingShuffle.length > 0 ? writingShuffle.map(function(oi: number) { return writingQuestions[oi] }) : writingQuestions
        var displayQuestions = [...displayMcq, ...displayWriting]
        // shuffleMap for submit: maps display index → original index
        var shuffleMap = hwShuffleMaps.current[hw.id] || allQuestions.map(function(_: any, i: number) { return i })

        return (
          <Card key={hw.id} className={isSubmitted ? 'border-emerald-500/30' : hasQuestions ? 'cursor-pointer' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3" onClick={hasQuestions ? function() {
                if (isSubmitted) { setBlockedHwId(hw.id); return }
                setExpandedHw(isExpanded ? null : hw.id)
              } : undefined}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 " + (isSubmitted ? 'bg-emerald-500/10' : hasQuestions ? 'bg-emerald-500/10' : 'bg-blue-500/10')}>
                    <ClipboardList className={"h-4 w-4 " + (isSubmitted ? 'text-emerald-500' : hasQuestions ? 'text-emerald-500' : 'text-blue-500')} />
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-sm">{hw.title}</h3>
                    {hw.content && <p className="text-xs text-muted-foreground line-clamp-2">{hw.content}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] text-muted-foreground">{new Date(hw.createdAt).toLocaleDateString('ar-EG')}</p>
                      {hasMCQ && <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-600">{mcqQuestions.length} اختيارات</Badge>}
                      {hasWriting && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">{writingQuestions.length} مقالي</Badge>}
                      {!hasMCQ && !hasWriting && hasQuestions && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">{allQuestions.length} سؤال</Badge>}
                      {isSubmitted && existingResult && <Badge className="text-[10px] bg-emerald-500 text-white">النتيجة: {existingResult.score}/{existingResult.maxScore}</Badge>}
                      {isSubmitted && !existingResult && <Badge className="text-[10px] bg-emerald-500 text-white">تم التسليم</Badge>}
                    </div>
                  </div>
                </div>
                {hw.filePath && !hasQuestions && <FileAttachment filePath={hw.filePath} fileType={hw.fileType} />}
                {hasQuestions && <ChevronLeft className={"h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1 " + (isExpanded ? 'rotate-90' : '')} />}
              </div>

              {/* ACTIVE HOMEWORK - not yet submitted */}
              {isExpanded && hasQuestions && !isSubmitted && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* MCQ Section */}
                  {hasMCQ && (
                    <div className="space-y-4">
                      {hasWriting && <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">الأسئلة الاختيارية:</p>}
                      {displayMcq.map(function(q: any, di: number) {
                        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
                        return (
                          <div key={'mcq-' + di} className="space-y-2 rounded-lg p-2" dir="ltr">
                            <p className="font-medium text-sm whitespace-pre-wrap break-words" style={{ textAlign: 'left' }}>{di + 1}. <FractionText text={q.question || q.q} /> <span className="text-muted-foreground text-xs">({pts} {pts === 1 ? 'درجة' : 'درجات'})</span></p>
                            <div className="space-y-1.5">
                              {(q.options || []).map(function(opt: string, oi: number) {
                                var isSelected = myAnswers[di] === oi
                                return (
                                  <button
                                    key={oi}
                                    onClick={function() { setHwAnswers(function(prev) { var a = { ...prev }; a[hw.id] = { ...(a[hw.id] || {}), [di]: oi }; return a }) }}
                                    className={"w-full p-3 rounded-lg border text-sm transition-colors " + (
                                      isSelected ? 'border-primary bg-primary/10 text-primary font-medium' :
                                      'border-border hover:bg-muted/50'
                                    )}
                                    style={{ textAlign: 'left' }}
                                  >
                                    <span className="mr-2 font-bold">{String.fromCharCode(65 + oi)}.</span><FractionText text={opt} />
                                  </button>
                                )
                              })}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {/* Writing Section */}
                  {hasWriting && (
                    <div className="space-y-4">
                      {hasMCQ && <div className="border-t pt-3"><p className="text-xs font-semibold text-amber-600 dark:text-amber-400">الأسئلة المقالية:</p></div>}
                      {displayWriting.map(function(q: any, wi: number) {
                        var displayIdx = displayMcq.length + wi
                        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 5
                        return (
                          <div key={'writing-' + wi} className="space-y-2 rounded-lg p-2 border border-amber-500/20 bg-amber-50 dark:bg-amber-900/10" dir="ltr">
                            <p className="font-medium text-sm whitespace-pre-wrap break-words" style={{ textAlign: 'left' }}>
                              {hasMCQ ? displayMcq.length + wi + 1 : wi + 1}. <FractionText text={q.question || q.q} />
                              <span className="text-muted-foreground text-xs ml-2">({pts} درجات)</span>
                              <Badge variant="outline" className="text-[9px] ml-2 border-amber-500/40 text-amber-600">مقالي</Badge>
                            </p>
                            <div dir="ltr">
                              <MathKeyboard
                                value={typeof hwAnswers[hw.id]?.[displayIdx] === 'string' ? (hwAnswers[hw.id]?.[displayIdx] as string) : ''}
                                onChange={function(val: string) {
                                  setHwAnswers(function(prev) {
                                    var a = { ...prev }
                                    a[hw.id] = { ...(a[hw.id] || {}), [displayIdx]: val }
                                    return a
                                  })
                                }}
                                placeholder="اكتب إجابتك هنا أو ارفع صورة للحل..."
                                rows={4}
                              />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  <Button size="sm" disabled={Object.keys(myAnswers).length === 0 && Object.keys(hwAnswers[hw.id] || {}).length === 0 || hwSubmitting === hw.id} onClick={async function() {
                    setHwSubmitting(hw.id)
                    try {
                      // Map display answers back to original indices
                      var mappedAnswers: Record<number, any> = {}
                      // MCQ answers (myAnswers keys are display indices)
                      Object.keys(myAnswers).forEach(function(di) {
                        var displayIdx = parseInt(di)
                        var origIdx = shuffleMap[displayIdx] !== undefined ? shuffleMap[displayIdx] : displayIdx
                        mappedAnswers[origIdx] = myAnswers[di]
                      })
                      // Writing answers (hwAnswers keys are display indices)
                      if (hwAnswers[hw.id]) {
                        Object.keys(hwAnswers[hw.id]).forEach(function(di) {
                          var displayIdx = parseInt(di)
                          var origIdx = shuffleMap[displayIdx] !== undefined ? shuffleMap[displayIdx] : displayIdx
                          mappedAnswers[origIdx] = hwAnswers[hw.id][di]
                        })
                      }
                      var res = await fetch('/api/homework/submit', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ studentId, homeworkId: hw.id, answers: mappedAnswers }),
                      })
                      var data = await res.json()
                      if (res.ok || data.alreadySubmitted) {
                        if (data.pendingGrading && data.result && data.result.id) {
                          // Submission saved instantly — AI grades writing questions in the background
                          toast.success('تم التسليم في ثانية ✅ المصحح الذكي بيصحح الأسئلة المقالية دلوقتي والنتيجة هتظهر تلقائياً')
                          startGradingPoll(data.result.id, hw.id)
                        } else {
                          toast.success('تم تقديم الواجب بنجاح')
                        }
                        if (data.result) {
                          setHwResults(function(prev) { return { ...prev, [hw.id]: { score: data.result.score, maxScore: data.result.maxScore } } })
                          if (data.result.wrongQuestions && data.result.wrongQuestions.length > 0) {
                            setHwWrongQuestions(function(prev) { return { ...prev, [hw.id]: data.result.wrongQuestions } })
                          }
                          // Save all questions for review (in display order)
                          setHwAllQuestions(function(prev) { return { ...prev, [hw.id]: allQuestions } })
                          // Save display order (what the student saw)
                          setHwDisplayQuestions(function(prev) { return { ...prev, [hw.id]: displayQuestions } })
                          // Save shuffle map (display index → original index)
                          setHwDisplayMap(function(prev) { return { ...prev, [hw.id]: shuffleMap } })
                          // Save writing answers if graded
                          if (data.result.writingAnswers && data.result.writingAnswers.length > 0) {
                            setHwWritingAnswers(function(prev) { return { ...prev, [hw.id]: data.result.writingAnswers } })
                          }
                        }
                        onHwSubmitted(hw.id)
                        setSubmittedHwId(hw.id)
                        setHwSubmitted(true)
                        setExpandedHw(null)
                      } else {
                        toast.error(data.error || 'خطأ')
                      }
                    } catch { toast.error('خطأ في الاتصال') }
                    setHwSubmitting(null)
                  }}>{hwSubmitting === hw.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسليم الإجابات (' + Object.keys(myAnswers).length + '/' + allQuestions.length + ')'}</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
      </div>

      {/* DONE HOMEWORK SECTION — submitted homeworks collapsed */}
      {doneHomework.length > 0 && (
        <div className="space-y-3 pt-2 border-t border-border/50 mt-4">
          <div className="flex items-center gap-2 pt-3">
            <CheckCircle2 className="h-5 w-5 text-muted-foreground" />
            <h2 className="font-bold text-sm text-muted-foreground">
              واجبات مُسلمة ({doneHomework.length})
            </h2>
          </div>
          {doneHomework.map(function(hw) {
            var dScore = hwResults[hw.id]
            var qCount = 0
            try { if ((hw as any).questions) qCount = JSON.parse((hw as any).questions).length } catch {}
            return (
              <button
                key={hw.id}
                onClick={function() { setBlockedHwId(hw.id) }}
                className="w-full text-right"
              >
                <Card className="border-muted bg-muted/20 hover:bg-muted/40 transition-colors">
                  <CardContent className="p-3 flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    </div>
                    <div className="flex-1 min-w-0 text-right">
                      <p className="text-xs font-medium truncate">{hw.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {dScore && (
                          <Badge className="text-[9px] bg-emerald-500 text-white">النتيجة: {dScore.score}/{dScore.maxScore}</Badge>
                        )}
                        {qCount > 0 && <span className="text-[10px] text-muted-foreground">{qCount} سؤال</span>}
                      </div>
                    </div>
                    <ChevronLeft className="h-4 w-4 text-muted-foreground shrink-0" />
                  </CardContent>
                </Card>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ========== EXAMS TAB ========== */
function ExamsTab({ exams, results, completedExamIds, onExamSubmitted, studentId }: { exams: Exam[]; results: ExamResult[]; completedExamIds: Set<string>; onExamSubmitted: (examId: string) => void; studentId: string }) {
  const [takingExam, setTakingExam] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [writingAnswers, setWritingAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [examQuestions, setExamQuestions] = useState<any[]>([])
  const [examShuffleMap, setExamShuffleMap] = useState<number[]>([])
  const [examSubmitted, setExamSubmitted] = useState(false)
  const [submittedExamId, setSubmittedExamId] = useState<string | null>(null)
  const [checkingServer, setCheckingServer] = useState(false)
  const [blockedExamId, setBlockedExamId] = useState<string | null>(null)
  // نتيجة آخر تسليم (الدرجة + تصحيح المقالية بالذكاء الاصطناعي)
  const [lastResult, setLastResult] = useState<any>(null)
  const [showGradesFor, setShowGradesFor] = useState<string | null>(null)

  if (exams.length === 0) return <EmptyState message="لا توجد امتحانات حالياً" />

  // PERMANENT BLOCK SCREEN — exam already submitted, cannot retake
  if (blockedExamId) {
    const blockedExam = exams.find(e => e.id === blockedExamId)
    return (
      <div className="flex flex-col items-center justify-center py-16 px-6 space-y-6">
        <div className="h-24 w-24 rounded-full bg-red-500/10 flex items-center justify-center">
          <X className="h-14 w-14 text-red-500" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-red-600">تم تقديم هذا الامتحان بالفعل ولا يمكنك إعادته</h2>
          {blockedExam && <p className="text-sm text-muted-foreground">{blockedExam.title}</p>}
          <p className="text-sm text-muted-foreground">انتظر النتيجة من <span dir="ltr" className="font-semibold">Mr. Sherif ElSayed</span></p>
        </div>
        <Button
          onClick={() => {
            onExamSubmitted(blockedExamId)
            setBlockedExamId(null)
          }}
          variant="outline"
          className="mt-4"
        >
          العودة إلى قائمة الامتحانات
        </Button>
      </div>
    )
  }

  // EXAM SUBMITTED SUCCESS SCREEN — with the AI-graded score + writing feedback
  if (examSubmitted) {
    var lrGrades: any[] = (lastResult && lastResult.writingGrades) || []
    return (
      <div className="flex flex-col items-center justify-center py-12 px-6 space-y-5">
        <div className="h-24 w-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
          <CheckCircle2 className="h-14 w-14 text-emerald-500" />
        </div>
        <div className="text-center space-y-2">
          <h2 className="text-xl font-bold text-emerald-600">تم تقديم الامتحان بنجاح</h2>
          {lastResult && typeof lastResult.score === 'number' ? (
            <div className="mt-2 inline-flex flex-col items-center gap-1.5">
              <div className="px-6 py-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30">
                <p className="text-3xl font-bold text-emerald-600" dir="ltr">{lastResult.score} / {lastResult.maxScore}</p>
                <p className="text-[10px] text-muted-foreground mt-1">درجتك في الامتحان</p>
              </div>
              {lrGrades.length > 0 && <p className="text-xs text-emerald-600 font-medium">✅ الأسئلة المقالية اتصححت بالذكاء الاصطناعي من الإجابة النموذجية</p>}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">المصحح الذكي بيصحح الأسئلة المقالية دلوقتي — النتيجة هتظهر في قائمة الامتحانات خلال شوية</p>
          )}
        </div>
        {lrGrades.length > 0 && (
          <div className="w-full max-w-xl space-y-2">
            <p className="text-xs font-semibold text-muted-foreground">تفاصيل تصحيح الأسئلة المقالية:</p>
            {lrGrades.map(function(g: any, i: number) {
              var gOk = g.isCorrect === true
              var gHalf = !gOk && (Number(g.awardedPoints) || 0) > 0
              return (
                <Card key={'wg-' + i} className={gOk ? 'border-emerald-200 dark:border-emerald-900/40' : gHalf ? 'border-amber-200 dark:border-amber-900/40' : 'border-red-200 dark:border-red-900/40'}>
                  <CardContent className="p-3 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-xs font-medium min-w-0" style={{ textAlign: 'left' }}><FractionText text={g.question || ''} /></p>
                      <Badge className={'text-[10px] shrink-0 ' + (gOk ? 'bg-emerald-500 text-white' : gHalf ? 'bg-amber-500 text-white' : 'bg-red-500 text-white')} dir="ltr">{g.awardedPoints}/{g.maxPoints}</Badge>
                    </div>
                    {g.feedback && <p className="text-[10px] text-muted-foreground">{g.feedback}</p>}
                    {g.modelAnswer && (
                      <p className="text-[10px] text-emerald-600" style={{ textAlign: 'left' }}>الإجابة النموذجية: <FractionText text={g.modelAnswer} /></p>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}
        <Button
          onClick={() => {
            if (submittedExamId) onExamSubmitted(submittedExamId)
            setExamSubmitted(false)
            setSubmittedExamId(null)
            setTakingExam(null)
            setAnswers({})
            setWritingAnswers({})
            setExamQuestions([])
            setExamShuffleMap([])
          }}
          className="mt-2"
        >
          العودة إلى صفحتك الرئيسية
        </Button>
      </div>
    )
  }

  // EXAM TAKING VIEW
  if (takingExam) {
    const exam = exams.find(e => e.id === takingExam)
    if (!exam || examQuestions.length === 0) {
      setTakingExam(null)
      return null
    }
    // Separate MCQ from Writing - track DISPLAY index in examQuestions array
    var mcqQs: any[] = []
    var writingQs: any[] = []
    examQuestions.forEach(function(q: any, idx: number) {
      var isWriting = q.type === 'writing' || q.type === 'essay' || (!q.options || q.options.length === 0) || (Array.isArray(q.options) && q.options.length > 0 && q.options.every(function(o: string) { return !o || o === 'N/A' || o === 'لا يوجد' || String(o).trim() === '' }))
      if (isWriting) writingQs.push({ q: q, displayIdx: idx })
      else mcqQs.push({ q: q, displayIdx: idx })
    })
    return (
      <div className="space-y-4" dir="ltr">
        <div className="flex items-center justify-between">
          <h3 className="font-bold">{exam.title}</h3>
          <Button variant="outline" size="sm" onClick={() => { setTakingExam(null); setAnswers({}); setWritingAnswers({}); setExamQuestions([]); setExamShuffleMap([]) }}>رجوع</Button>
        </div>
        
        {/* MCQ Section */}
        {mcqQs.length > 0 && (
          <div className="space-y-3">
            {writingQs.length > 0 && <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">الأسئلة الاختيارية:</p>}
            {mcqQs.map(function(item, mi) {
              var q = item.q
              var displayIdx = item.displayIdx
              var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
              var qText = q.question || q.q || ''
              return (
                <Card key={'mcq-' + mi}>
                  <CardContent className="p-4 space-y-3">
                    <p className="font-medium text-sm" style={{ textAlign: 'left' }}>{mi + 1}. <FractionText text={qText} /> <span className="text-muted-foreground text-xs">({pts} {pts === 1 ? 'درجة' : 'درجات'})</span></p>
                    <div className="space-y-2">
                      {(q.options || []).map((opt: string, oi: number) => (
                        <button
                          key={oi}
                          onClick={() => setAnswers(prev => ({ ...prev, [displayIdx]: oi }))}
                          className={`w-full p-3 rounded-lg border text-sm transition-colors ${
                            answers[displayIdx] === oi ? 'border-primary bg-primary/10 text-primary font-medium' : 'border-border hover:bg-muted/50'
                          }`}
                          style={{ textAlign: 'left' }}
                        >
                          <span className="mr-2 font-bold">{String.fromCharCode(65 + oi)}.</span><FractionText text={opt} />
                        </button>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        {/* Writing Section */}
        {writingQs.length > 0 && (
          <div className="space-y-3">
            {mcqQs.length > 0 && <div className="border-t pt-3"><p className="text-xs font-semibold text-amber-600 dark:text-amber-400">الأسئلة المقالية:</p></div>}
            {writingQs.map(function(item, wi) {
              var q = item.q
              var displayIdx = item.displayIdx
              var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 5
              var qText = q.question || q.q || ''
              return (
                <Card key={'writing-' + wi} className="border-amber-500/20">
                  <CardContent className="p-4 space-y-3">
                    <p className="font-medium text-sm" style={{ textAlign: 'left' }}>
                      {mcqQs.length > 0 ? mcqQs.length + wi + 1 : wi + 1}. <FractionText text={qText} />
                      <span className="text-muted-foreground text-xs ml-2">({pts} درجات)</span>
                      <Badge variant="outline" className="text-[9px] ml-2 border-amber-500/40 text-amber-600">مقالي</Badge>
                    </p>
                    <div dir="ltr">
                      <MathKeyboard
                        value={writingAnswers[displayIdx] || ''}
                        onChange={function(val: string) {
                          setWritingAnswers(function(prev) { return { ...prev, [displayIdx]: val } })
                        }}
                        placeholder="اكتب إجابتك هنا أو ارفع صورة..."
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        )}

        <Button
          className="w-full"
          disabled={submitting}
          onClick={async () => {
            setSubmitting(true)
            try {
              // Combine MCQ + writing answers - use displayIdx as key
              var mappedAnswers: Record<number, any> = {}
              // MCQ answers (answers keys are displayIdx)
              Object.keys(answers).forEach(function(di) {
                var displayIdx = parseInt(di)
                // displayIdx is the position in examQuestions array (shuffled)
                // examShuffleMap maps displayIdx → original question index
                var origIdx = examShuffleMap.length > 0 ? examShuffleMap[displayIdx] : displayIdx
                if (origIdx === undefined) origIdx = displayIdx
                mappedAnswers[origIdx] = answers[di]
              })
              // Writing answers (writingAnswers keys are displayIdx)
              Object.keys(writingAnswers).forEach(function(di) {
                var displayIdx = parseInt(di)
                var origIdx = examShuffleMap.length > 0 ? examShuffleMap[displayIdx] : displayIdx
                if (origIdx === undefined) origIdx = displayIdx
                mappedAnswers[origIdx] = writingAnswers[di]
              })
              // Add client-side timeout (120s — AI grades the writing questions during submit)
              var submitController = new AbortController()
              var submitTimeout = setTimeout(function() { submitController.abort() }, 120000)
              const res = await fetch('/api/exams/submit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ studentId, examId: takingExam, answers: mappedAnswers }),
                signal: submitController.signal,
              })
              clearTimeout(submitTimeout)
              const data = await res.json()
              if (res.ok && (data.submitted || data.alreadySubmitted)) {
                // الدرجة وتصحيح المقالية رجعوا من السيرفر (تصحيح فوري بالذكاء الاصطناعي)
                if (typeof data.score === 'number') {
                  setLastResult({ examId: takingExam, score: data.score, maxScore: data.maxScore, writingGrades: data.writingGrades || [] })
                }
                setSubmittedExamId(takingExam)
                setExamSubmitted(true)
                onExamSubmitted(takingExam)
              } else if (data.blocked || data.alreadySubmitted) {
                onExamSubmitted(takingExam)
                setBlockedExamId(takingExam)
              } else {
                toast.error(data.error || 'خطأ في التقديم')
              }
            } catch (e) {
              // If timeout/network error, treat as submitted (server may still be processing)
              toast.success('تم تقديم الامتحان بنجاح')
              setSubmittedExamId(takingExam)
              setExamSubmitted(true)
              onExamSubmitted(takingExam)
            }
            setSubmitting(false)
          }}
        >
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `تسليم الامتحان (${Object.keys(answers).length + Object.keys(writingAnswers).length}/${examQuestions.length})`}
        </Button>
      </div>
    )
  }

  // EXAM LIST VIEW
  return (
    <div className="space-y-3">
      {exams.map((exam) => {
        const examResult: any = results.find(r => r.examId === exam.id)
        const isCompleted = examResult || completedExamIds.has(exam.id)
        // نتيجة لحظية من آخر تسليم (لو لسه متحدثش في اللستة)
        const liveResult = (lastResult && lastResult.examId === exam.id) ? lastResult : examResult
        const liveGrades: any[] = (liveResult && liveResult.writingGrades) || []
        let hasQuestions = false
        let parsedQuestions: any[] = []
        try { if ((exam as any).questions) { parsedQuestions = JSON.parse((exam as any).questions); hasQuestions = parsedQuestions.length > 0 } } catch {}
        return (
          <Card key={exam.id} className={isCompleted ? 'border-emerald-500/30' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className="h-9 w-9 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0 mt-0.5">
                    <FileText className="h-4 w-4 text-orange-500" />
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="font-semibold text-sm">{exam.title}</h3>
                    {isCompleted ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          تم تقديم الامتحان
                        </Badge>
                        {liveResult && typeof liveResult.score === 'number' && (
                          <Badge className="text-xs bg-primary text-primary-foreground" dir="ltr">{liveResult.score}/{liveResult.maxScore}</Badge>
                        )}
                        {liveGrades.length > 0 && (
                          <button type="button" onClick={function() { setShowGradesFor(showGradesFor === exam.id ? null : exam.id) }} className="text-[11px] font-medium text-primary hover:underline cursor-pointer">
                            {showGradesFor === exam.id ? 'اقفل التصحيح' : 'شوف تصحيح المقالية 👁'}
                          </button>
                        )}
                      </div>
                    ) : hasQuestions ? (
                      <Button size="sm" disabled={checkingServer} onClick={async () => {
                        setCheckingServer(true)
                        try {
                          var checkRes = await fetch('/api/exam-results?studentId=' + studentId + '&examId=' + exam.id)
                          var checkData = await checkRes.json()
                          if (checkData.results && checkData.results.length > 0) {
                            onExamSubmitted(exam.id)
                            setCheckingServer(false)
                            setBlockedExamId(exam.id)
                            return
                          }
                        } catch { /* proceed anyway */ }
                        setCheckingServer(false)
                        // Start exam
                        try {
                          var indices = parsedQuestions.map(function(_: any, i: number) { return i })
                          for (var si = indices.length - 1; si > 0; si--) {
                            var sj = Math.floor(Math.random() * (si + 1))
                            var st = indices[si]; indices[si] = indices[sj]; indices[sj] = st
                          }
                          var shuffled = indices.map(function(i: number) { return parsedQuestions[i] })
                          setExamQuestions(shuffled)
                          setExamShuffleMap(indices)
                          setTakingExam(exam.id)
                          setAnswers({})
                        } catch { toast.error('خطأ في تحميل الأسئلة') }
                      }}>{checkingServer ? <Loader2 className="h-4 w-4 animate-spin" /> : 'ابدأ الامتحان'}</Button>
                    ) : (
                      <Badge variant="secondary" className="text-xs">لم يتم بعد</Badge>
                    )}
                    <p className="text-[10px] text-muted-foreground">{new Date(exam.createdAt).toLocaleDateString('ar-EG')}</p>
                  </div>
                </div>
                {exam.filePath && <FileAttachment filePath={exam.filePath} fileType={exam.fileType} />}
              </div>
              {/* تفاصيل تصحيح المقالية بالذكاء الاصطناعي */}
              {isCompleted && showGradesFor === exam.id && liveGrades.length > 0 && (
                <div className="mt-3 pt-3 border-t space-y-2">
                  {liveGrades.map(function(g: any, gi: number) {
                    var gOk = g.isCorrect === true
                    var gHalf = !gOk && (Number(g.awardedPoints) || 0) > 0
                    return (
                      <div key={'g-' + gi} className={'p-2.5 rounded-lg border space-y-1 ' + (gOk ? 'border-emerald-200 bg-emerald-50/50 dark:border-emerald-900/40 dark:bg-emerald-900/10' : gHalf ? 'border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-900/10' : 'border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-900/10')}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-medium min-w-0" style={{ textAlign: 'left' }}><FractionText text={g.question || ''} /></p>
                          <Badge className={'text-[10px] shrink-0 ' + (gOk ? 'bg-emerald-500 text-white' : gHalf ? 'bg-amber-500 text-white' : 'bg-red-500 text-white')} dir="ltr">{g.awardedPoints}/{g.maxPoints}</Badge>
                        </div>
                        {g.answer && (
                          <p className="text-[10px] text-muted-foreground" style={{ textAlign: 'left' }}>إجابتك: <FractionText text={g.answer} /></p>
                        )}
                        {g.modelAnswer && (
                          <p className="text-[10px] text-emerald-600" style={{ textAlign: 'left' }}>الإجابة النموذجية: <FractionText text={g.modelAnswer} /></p>
                        )}
                        {g.feedback && <p className="text-[10px] text-muted-foreground">🤖 {g.feedback}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}

/* ========== ANNOUNCEMENTS TAB ========== */
function AnnouncementsTab({ announcements }: { announcements: Announcement[] }) {
  if (announcements.length === 0) return <EmptyState message="لا توجد إعلانات حالياً" />
  return (
    <div className="space-y-3">
      {announcements.map((ann) => (
        <Card key={ann.id} className="border-primary/20">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Megaphone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="min-w-0 space-y-1">
                <h3 className="font-semibold text-sm">{ann.title}</h3>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">{ann.content}</p>
                <p className="text-[10px] text-muted-foreground">{new Date(ann.createdAt).toLocaleDateString('ar-EG')}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

/* ========== DISCUSSIONS TAB ========== */
function DiscussionsTab({ grade, studentId, studentName }: { grade: string; studentId: string; studentName: string }) {
  const { currentStudent } = useAppStore()
  const [items, setItems] = useState<Discussion[]>([])
  const [newMessage, setNewMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const fetchDiscussions = async () => {
    try {
      const res = await fetch(`/api/discussions?grade=${encodeURIComponent(grade)}&pageSize=100`)
      const data = await res.json()
      setItems(data.discussions || [])
    } catch { toast.error('خطأ في تحميل النقاشات') }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/discussions?grade=${encodeURIComponent(grade)}&pageSize=100`)
        const data = await res.json()
        if (!cancelled) setItems(data.discussions || [])
      } catch { if (!cancelled) toast.error('خطأ في تحميل النقاشات') }
      if (!cancelled) setLoading(false)
    })()
    return () => { cancelled = true }
  }, [grade])

  useEffect(() => {
    if (chatEndRef.current) chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
  }, [items])

  const handleSend = async () => {
    if (!newMessage.trim()) return
    setSending(true)
    try {
      await fetch('/api/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, studentName: currentStudent?.name || studentName, grade, content: newMessage.trim(), isAdminReply: false }),
      })
      setNewMessage('')
      fetchDiscussions()
      toast.success('تم إرسال رسالتك')
    } catch { toast.error('خطأ في إرسال الرسالة') }
    setSending(false)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="اكتب رسالتك أو سؤالك هنا..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSend()}
          className="flex-1"
        />
        <Button onClick={handleSend} disabled={sending || !newMessage.trim()} size="icon">
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
      {items.length === 0 ? (
        <EmptyState message="ابدأ النقاش! اكتب أول رسالة" />
      ) : (
        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar">
          {items.map((d) => {
            const isMe = d.studentId === (currentStudent?.id || studentId)
            const isAdmin = d.isAdminReply
            return (
              <div key={d.id} className={`flex ${isAdmin ? 'justify-start' : isMe ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
                  isAdmin ? 'bg-primary/15 dark:bg-primary/20 border border-primary/20 rounded-bl-md' :
                  isMe ? 'bg-primary text-primary-foreground rounded-bl-md' :
                  'bg-muted rounded-br-md'
                }`}>
                  <div className="flex items-center gap-2 mb-1">
                    <p className={`text-xs font-medium ${isAdmin ? 'text-primary' : isMe ? 'opacity-75' : 'text-foreground'}`}>{d.studentName}</p>
                    {isAdmin && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">المعلم</Badge>}
                  </div>
                  <p className="text-sm leading-relaxed">{d.content}</p>
                  <p className={`text-[10px] mt-1 ${isAdmin ? 'text-primary/60' : isMe ? 'opacity-60' : 'text-muted-foreground'}`}>{new Date(d.createdAt).toLocaleString('ar-EG')}</p>
                </div>
              </div>
            )
          })}
          <div ref={chatEndRef} />
        </div>
      )}
    </div>
  )
}

/* ========== SHARED COMPONENTS ========== */
function FileAttachment({ filePath, fileType }: { filePath: string; fileType: string }) {
  const isImage = fileType?.startsWith('image/')
  const isPdf = fileType === 'application/pdf'
  if (isImage) {
    return <Image src={filePath} alt="Attachment" width={48} height={48} className="max-h-12 rounded-lg border" unoptimized />
  }
  return (
    <a href={filePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 p-2 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs shrink-0">
      <FileDown className="h-4 w-4" />
      {isPdf ? 'PDF' : 'ملف'}
    </a>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center mb-3">
        <MessageSquare className="h-6 w-6 text-muted-foreground" />
      </div>
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  )
}

/* ========== Student Guide - دليل التعامل ========== */
function StudentGuide({ onClose, onEnterPortal }: { onClose: () => void; onEnterPortal: () => void }) {
  const steps = [
    {
      icon: Video,
      title: 'اتفرج على الدروس',
      desc: 'افتح تاب "الدروس" واتفرج على فيديوهات المستر. كل ما تشوف فيديو لآخره، هيتسجل إنك خلصته عشان ترجعله بسهولة.',
      color: 'text-purple-600 bg-purple-100 dark:bg-purple-900/30',
    },
    {
      icon: ClipboardList,
      title: 'حل الواجبات',
      desc: 'روح على تاب "الواجبات" وحل الواجبات. كل واجب فيه أسئلة اختيارات أو أسئلة مقالية، تقدر ترفع صورة لحلك في المقالية.',
      color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30',
    },
    {
      icon: FileText,
      title: 'ادخل الامتحانات',
      desc: 'تاب "الامتحانات" فيه كل الامتحانات اللي المستر نزلها لصفك. اضغط على الامتحان وادخل حل الأسئلة، هتشوف نتيجتك بعد ما تخلص.',
      color: 'text-orange-600 bg-orange-100 dark:bg-orange-900/30',
    },
    {
      icon: Megaphone,
      title: 'التنبيهات',
      desc: 'تاب "التنبيهات" فيه كل الإعلانات المهمة من المستر - مواعيد، اخبار، وملاحظات مهمة. دايماً تابعها.',
      color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30',
    },
    {
      icon: MessageSquare,
      title: 'اسأل وزملائك',
      desc: 'تاب "المجتمع" تقدر تسأل أي سؤال وتشارك مع زملائك في نفس الصف. المستر بيرد عليكوا كمان.',
      color: 'text-amber-600 bg-amber-100 dark:bg-amber-900/30',
    },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <Card className="w-full max-w-md max-h-[90vh] overflow-y-auto" onClick={function(e) { e.stopPropagation() }}>
        <CardContent className="p-6 space-y-4">
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center">
                <HelpCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h2 className="font-bold text-base">دليل التعامل</h2>
                <p className="text-[10px] text-muted-foreground">إزاي تستخدم صفحتك</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Steps */}
          <div className="space-y-3">
            {steps.map(function(step, i) {
              return (
                <div key={i} className="flex items-start gap-3 p-3 rounded-lg border bg-card">
                  <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 " + step.color}>
                    <step.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold bg-muted text-muted-foreground rounded-full h-5 w-5 flex items-center justify-center shrink-0">{i + 1}</span>
                      <h3 className="font-semibold text-sm">{step.title}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>

          {/* Footer tip */}
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/15">
            <p className="text-xs text-foreground leading-relaxed">
              <span className="font-bold">نصيحة:</span> لو لقيت واجب أو امتحان مكتوب عليه "محتاجة تتسلم" أو "لسه متقدمتش" يبقى لازم تخلصه. اضغط عليه وادخل تخلصه على طول.
            </p>
          </div>

          {/* CTA */}
          <Button onClick={onEnterPortal} className="w-full gap-2 min-h-[44px] font-semibold">
            <Rocket className="h-4 w-4" />
            يلا نبدأ
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}

