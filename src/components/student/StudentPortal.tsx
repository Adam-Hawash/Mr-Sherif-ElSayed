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
  User, Phone, Award, Lock, X, ListTodo, Search,
  HelpCircle, ArrowLeft, Rocket, Flag, XCircle, Timer,
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
        const [videosRes, hwRes, examsRes, annRes, resultsRes, actRes, payRes, accessRes, progressRes, hwResultsRes] = await Promise.all([
          fetch(`/api/videos?grade=${encodeURIComponent(grade)}&pageSize=100`).then(r => r.json()),
          fetch(`/api/homework?grade=${encodeURIComponent(grade)}&pageSize=50&studentId=${encodeURIComponent(studentId)}`).then(r => r.json()),
          fetch(`/api/exams?grade=${encodeURIComponent(grade)}&pageSize=50&studentId=${encodeURIComponent(studentId)}`).then(r => r.json()),
          fetch(`/api/announcements?grade=${encodeURIComponent(grade)}&pageSize=10`).then(r => r.json()),
          fetch(`/api/exam-results?studentId=${studentId}`).then(r => r.json()),
          fetch(`/api/activities?studentId=${studentId}&action=watched_video&pageSize=200`).then(r => r.json()),
          fetch(`/api/payments?studentId=${studentId}&status=approved&pageSize=200`).then(r => r.json()),
          fetch(`/api/video-access?studentId=${studentId}`).then(r => r.json()).catch(() => ({ accesses: [] })),
          fetch(`/api/video-progress?studentId=${studentId}`).then(r => r.json()).catch(() => ({ progress: [] })),
          fetch(`/api/homework-results?studentId=${studentId}`).then(r => r.json()).catch(() => ({ results: [] })),
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
        /* الواجبات اللي الطالب سلّمها بالفعل — عشان "اللي لازم تعمله دلوقتي"
           ميعرضهالوش تاني (طلب المستر): اللي خلص واجب أو امتحان مش هيتكرر */
        var doneHw: string[] = []
        ;(hwResultsRes.results || []).forEach(function (r: any) {
          if (r && r.homeworkId) doneHw.push(r.homeworkId)
        })
        if (doneHw.length > 0) {
          setCompletedHwIds(function (prev) { var n = new Set(prev); doneHw.forEach(function (id) { n.add(id) }); return n })
        }
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

    // المطلوب دلوقتي = الواجبات اللي لسه ماسلّمهاش + الامتحانات اللي ماعملهاش
    // (اللي خلصهم مش بيترجعلهم تاني — طلب المستر)
    var pendingHwList = initialData.homework.filter(function (h) { return !completedHwIds.has(h.id) })
    var pendingExamList = initialData.exams.filter(function (e) {
      /* (25-b2) المجدول مستقبليًا مينزلش للطالب من الـ API — لو شوفت scheduledAt
         مستقبلي في بيانات قديمة (كاش) نتجاهله بصمت من أي قايمة للطالب */
      if (isExamScheduledAhead(e)) return false
      return !initialData.examResults.find(function (r) { return r.examId === e.id })
    })
    var pendingHomework = pendingHwList.length
    var pendingExams = pendingExamList.length

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
                  <Button variant="outline" size="sm" onClick={() => setShowGuide(true)} className="gap-1.5 h-11 sm:h-8">
                    <HelpCircle className="h-4 w-4" />
                    <span className="hidden sm:inline">دليل التعامل</span>
                  </Button>
                  <Button variant="ghost" size="sm" onClick={logout} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-11 sm:h-8 shrink-0">
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
                  {pendingHwList.slice(0, 3).map(function(hw) {
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
                  {pendingExamList.slice(0, 2).map(function(exam) {
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
          <Button variant="ghost" size="sm" onClick={() => setShowFullPortal(false)} className="gap-1 h-11 sm:h-8 shrink-0">
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
        {activeTab === 'exams' && <ExamsTab exams={dashboardData.exams} results={dashboardData.examResults} completedExamIds={completedExamIds} onExamSubmitted={(id) => setCompletedExamIds(prev => new Set([...prev, id]))} studentId={studentId} onGoHome={() => setActiveTab('videos')} />}
        {activeTab === 'announcements' && <AnnouncementsTab announcements={dashboardData.announcements} />}
        {activeTab === 'discussions' && <DiscussionsTab grade={grade} studentId={studentId} studentName={currentStudent?.name || ''} />}
        {activeTab === 'complaints' && <StudentComplaints studentId={studentId} studentName={currentStudent?.name || ''} studentPhone={currentStudent?.phone || ''} grade={grade} />}
      </div>
    </div>
  )
}

// أدوات نوع الفيديو — على مستوى الملف عشان نقدر نستخدمها في الـ memo بشكل آمن
function ytIdOf(url: string) {
  const match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/)
  return match ? match[1] : null
}

// اللينك المباشر لملف فيديو (MP4/WebM/M3U8/…) بيتشغل في المشغل العادي
// (من غير أي يوتيوب + إعدادات جودة ظاهرة) — فبيتصنف file مش link خارجي
function isDirectMediaUrl(url: string): boolean {
  if (!url) return false
  const s = String(url).trim()
  if (!/^https?:\/\//i.test(s) && !s.startsWith('/')) return false
  return /\.(mp4|webm|m3u8|mov|ogg|ogv)(\?.*)?$/i.test(s)
}

function videoKindOf(v: any): 'youtube' | 'file' | 'link' | 'none' {
  if (v.kind) {
    // (2026-و3) فيديو مضاف من كود HTML embed — بيتشغل في المشغل الآمن
    // بتقدمة زي يوتيوب بالظبط (كنترولز الموقع الأصلي بجودة حقيقية جواه)
    if (v.kind === 'embed') return 'youtube'
    return v.kind === 'link' && isDirectMediaUrl(v.url || '') ? 'file' : v.kind
  }
  if (ytIdOf(v.url || '')) return 'youtube'
  if (v.filePath && /\.(mp4|webm|mov|avi)$/i.test(v.filePath)) return 'file'
  if (v.url && isDirectMediaUrl(v.url)) return 'file'
  if (v.url) return 'link'
  return 'none'
}

function VideosTab({ videos, watchedIds, approvedVideoIds, studentId, grade, videoProgress, studentStatus, isPaidAccess, studentName, studentPhone }: { videos: VideoType[]; watchedIds: Set<string>; approvedVideoIds: Set<string>; studentId: string; grade: string; videoProgress: Record<string, number>; studentStatus?: string; isPaidAccess?: boolean; studentName?: string; studentPhone?: string }) {
  const { setView, setPendingPaymentVideo } = useAppStore()
  const [localWatched, setLocalWatched] = useState(watchedIds)
  // (2026-ف — رجعة نظام الجدولة القديم زي ما كان بالظبط)
  const [videoSchedules, setVideoSchedules] = useState<Record<string, any>>({})
  const [hiddenVideoIds, setHiddenVideoIds] = useState<Set<string>>(new Set())
  const [activeLessonVideo, setActiveLessonVideo] = useState<VideoType | null>(null)

  // Load video schedules for this student
  useEffect(() => {
    if (!studentId) return
    fetch('/api/video-schedule?studentId=' + studentId)
      .then(function(r) { return r.json() })
      .then(function(data) {
        var map: Record<string, any> = {}
        ;(data.schedules || []).forEach(function(s: any) {
          map[s.videoId] = s
        })
        setVideoSchedules(map)
        setHiddenVideoIds(new Set(data.hiddenVideoIds || []))
      })
      .catch(function() {})
  }, [studentId])

  // Check if video is locked for this student (scheduled but not yet unlocked)
  const isVideoLocked = (videoId: string): { locked: boolean; unlockAt?: Date; schedule?: any } => {
    var sched = videoSchedules[videoId]
    if (!sched || !sched.unlockAt) return { locked: false }
    var unlockDate = new Date(sched.unlockAt)
    if (unlockDate.getTime() > Date.now()) {
      return { locked: true, unlockAt: unlockDate, schedule: sched }
    }
    return { locked: false }
  }

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

  // نسب المشاهدة المحلية — بتتحدث أول ما المشغل يقفل عشان الأقفال تتحدث لحظيًا
  const [progressOverrides, setProgressOverrides] = useState<Record<string, number>>({})
  const mergedProgress = useMemo(function () {
    return Object.assign({}, videoProgress, progressOverrides)
  }, [videoProgress, progressOverrides])

  // ترتيب الدروس من الأقدم للأحدث — ده ترتيب نزول الدروس نفسه (الأول في المنهج فوق)
  const orderedVideos = useMemo(function () {
    return videos.slice().sort(function (a, b) {
      var ta = new Date((a as any).createdAt || 0).getTime()
      var tb = new Date((b as any).createdAt || 0).getTime()
      return ta - tb
    })
  }, [videos])

  // قفل التسلسل (طلب المستر): الفيديو ميفتحش غير لما اللي قبله يتشاف كامل 100%
  const lockedMap = useMemo(function () {
    var map: Record<string, boolean> = {}
    var prevTrackable: string | null = null
    orderedVideos.forEach(function (v) {
      var k = videoKindOf(v)
      var trackable = k === 'youtube' || k === 'file'
      if (trackable && prevTrackable) {
        var pct = mergedProgress[prevTrackable] || 0
        map[v.id] = pct < 99
      } else {
        map[v.id] = false
      }
      if (trackable) prevTrackable = v.id
    })
    return map
  }, [orderedVideos, mergedProgress])

  // الفيديو اللي قبل كل فيديو (عشان نعرض نسبته على كارت المقفول)
  const prevVideoMap = useMemo(function () {
    var map: Record<string, string> = {}
    var prevTrackable: string | null = null
    orderedVideos.forEach(function (v) {
      var k = videoKindOf(v)
      var trackable = k === 'youtube' || k === 'file'
      if (trackable && prevTrackable) map[v.id] = prevTrackable
      if (trackable) prevTrackable = v.id
    })
    return map
  }, [orderedVideos])

  // فتح أي درس (يوتيوب أو ملف مرفوع): بنطلب تذكرة تشغيل واحدة الاستخدام
  // من /api/video-ticket — مفيش أي YouTube ID أو رابط ملف بيرجع للصفحة.
  // المشغل نفسه بيتفتح من /api/player/[ticket] على السيرفر.
  const openPlayModal = (video: VideoType) => {
    // قفل التسلسل: اللي قبله لسه متشافش كامل → منع + رسالة (طلب المستر)
    if (lockedMap[video.id]) {
      toast.error('الفيديو ده هيتفتح أول ما تشوف الفيديو اللي قبله كامل (100%) — كمّل مشاهدة الفيديو اللي قبله الأول', { duration: 6000 })
      return
    }
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
      {orderedVideos.map((video) => {
        // Skip hidden videos entirely (الجدولة القديمة — الإخفاء)
        if (hiddenVideoIds.has(video.id)) return null
        const kind = videoKindOf(video)
        const isVideoFile = kind === 'file'
        const isWatched = localWatched.has(video.id)
        const thumbSrc = video.thumbnail || (video as any).thumb || null
        const hasPrice = (video.price || 0) > 0
        const hasApprovedPayment = approvedVideoIds.has(video.id)
        // A paid account is not a purchase grant. Every priced video stays locked
        // until this specific video has an approved payment/access record.
        const needsPay = hasPrice && !hasApprovedPayment
        const progress = mergedProgress[video.id] || 0
        // مقفول بالتسلسل؟ الفيديو اللي قبله لسه نسبته أقل من 99%
        const isSeqLocked = lockedMap[video.id] === true
        const prevVideoId = prevVideoMap[video.id]
        const prevPct = prevVideoId ? (mergedProgress[prevVideoId] || 0) : 0
        const scheduleInfo = isVideoLocked(video.id)

        // If video is scheduled and locked, show countdown instead (الجدولة القديمة)
        if (scheduleInfo.locked && scheduleInfo.unlockAt) {
          return (
            <Card key={video.id} className="overflow-hidden border-amber-500/30">
              <div className="relative aspect-video bg-gradient-to-br from-amber-900/50 to-black flex flex-col items-center justify-center gap-3 p-4">
                <div className="h-14 w-14 rounded-full bg-amber-500/20 flex items-center justify-center">
                  <Lock className="h-7 w-7 text-amber-400" />
                </div>
                <div className="text-center">
                  <p className="text-white font-bold text-sm mb-1">الفيديو هيفتح بعد ما تحضر الحصة بتاعتك</p>
                  <CountdownTimer unlockAt={scheduleInfo.unlockAt} />
                </div>
              </div>
              <CardContent className="p-3">
                <h3 className="font-semibold text-sm">{video.title}</h3>
              </CardContent>
            </Card>
          )
        }

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
              ) : isSeqLocked ? (
                // مقفول بالتسلسل — قفل + رسالة (طلب المستر: هيتفتح أول ما تشوف اللي قبله كامل)
                <div
                  className="w-full h-full relative cursor-not-allowed select-none"
                  onClick={function () { toast.error('الفيديو ده هيتفتح أول ما تشوف الفيديو اللي قبله كامل (100%) — كمّل مشاهدة الفيديو اللي قبله الأول', { duration: 6000 }) }}
                  role="button"
                  aria-label="الفيديو مقفول — هيتفتح أول ما تشوف الفيديو اللي قبله كامل"
                >
                  {thumbSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={thumbSrc} alt={video.title} className="w-full h-full object-cover opacity-25 grayscale" draggable={false} />
                  ) : (
                    <div className="w-full h-full bg-gradient-to-br from-black/80 to-black" />
                  )}
                  <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center gap-2 z-20 px-4 text-center">
                    <div className="h-12 w-12 rounded-full bg-red-500/20 border border-red-400/40 flex items-center justify-center shrink-0">
                      <Lock className="h-6 w-6 text-red-400" />
                    </div>
                    <p className="text-white text-xs sm:text-sm font-bold leading-relaxed">
                      الفيديو ده هيتفتح أول ما تشوف الفيديو اللي قبله كامل
                    </p>
                    {prevPct > 0 && (
                      <p className="text-white/60 text-[10px]">نسبة الفيديو اللي قبله دلوقتي: {prevPct}%</p>
                    )}
                  </div>
                </div>
              ) : kind === 'youtube' || isVideoFile ? (
                // كارت الدرس المحمي — صورة مصغرة بس (من غير أي براندينج ولا لينكات)
                // الفيديو نفسه بيتفتح في المشغل الآمن عن طريق تذكرة واحدة الاستخدام
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
          onClose={function () {
            var vid = activeLessonVideo.id
            setActiveLessonVideo(null)
            // نجيب نسبة المشاهدة الأخيرة للفيديو — عشان قفل الفيديو اللي بعده يتحدّث فورًا
            if (!studentId) return
            fetch('/api/video-progress?studentId=' + studentId + '&videoId=' + vid)
              .then(function (r) { return r.json() })
              .then(function (d) {
                var row = (d.progress || [])[0]
                if (row && row.totalSeconds > 0) {
                  var pct = Math.min(100, Math.round((row.watchedSeconds / row.totalSeconds) * 100))
                  setProgressOverrides(function (prev) {
                    var n = Object.assign({}, prev)
                    n[vid] = pct
                    return n
                  })
                }
              })
              .catch(function () {})
          }}
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
  /* 2026-و20 — ممنوع تسليم الواجب لحد ما صور ورقة الحل توصل كاملة */
  const [hwPhotoBusy, setHwPhotoBusy] = useState<Record<string, boolean>>({})
  const [hwSubmitted, setHwSubmitted] = useState(false)
  const [submittedHwId, setSubmittedHwId] = useState<string | null>(null)
  const [blockedHwId, setBlockedHwId] = useState<string | null>(null)
  /* (2026-و25) resultId مع النتيجة عشان شاشة المراجعة تعرف تجيب
     writingResults المخزنة من /api/homework/result/[id] عند إعادة الفتح */
  const [hwResults, setHwResults] = useState<Record<string, { score: number; maxScore: number; resultId?: string }>>({})
  const [hwWrongQuestions, setHwWrongQuestions] = useState<Record<string, { question: string; studentAnswer: string; correctAnswer: string }[]>>({})
  const [hwAllQuestions, setHwAllQuestions] = useState<Record<string, any[]>>({})
  const [hwWritingAnswers, setHwWritingAnswers] = useState<Record<string, any[]>>({})
  const [hwDisplayQuestions, setHwDisplayQuestions] = useState<Record<string, any[]>>({})
  const [hwDisplayMap, setHwDisplayMap] = useState<Record<string, number[]>>({})
  const hwShuffleMaps = useRef<Record<string, number[]>>({})
  const hwPollTimers = useRef<Record<string, any>>({})

  // ===== الترتيب التسلسلي للواجبات (زي الفيديوهات بالظبط — طلب المستر) =====
  // الواجب ميفتحش غير لما الواجب اللي قبله يتسلّم. الترتيب: من الأقدم للأحدث
  // (ترتيب نزول الواجبات نفسه). الواجبات اللي ملهاش أسئلة (ملف بس) بتتخطى
  // عشان التسلسل ميقلعش على حاجة مش قابلة للتسليم.
  var orderedHw = useMemo(function() {
    return homework.slice().sort(function(a, b) {
      var ta = new Date((a as any).createdAt || 0).getTime()
      var tb = new Date((b as any).createdAt || 0).getTime()
      return ta - tb
    })
  }, [homework])

  var hwTrackable = function(h: any) {
    try {
      var qs = JSON.parse((h as any).questions || '[]')
      return Array.isArray(qs) && qs.length > 0
    } catch (e) { return false }
  }

  var hwLockMap = useMemo(function() {
    var map: Record<string, boolean> = {}
    var prevTrackable: string | null = null
    orderedHw.forEach(function(h) {
      var track = hwTrackable(h)
      if (track && prevTrackable) {
        map[h.id] = !completedHwIds.has(prevTrackable)
      } else {
        map[h.id] = false
      }
      if (track) prevTrackable = h.id
    })
    return map
  }, [orderedHw, completedHwIds])

  // الواجب اللي قبل كل واجب (عشان نعرض اسمه على كارت المقفول)
  var hwPrevMap = useMemo(function() {
    var map: Record<string, string> = {}
    var prevTrackable: string | null = null
    orderedHw.forEach(function(h) {
      var track = hwTrackable(h)
      if (track && prevTrackable) map[h.id] = prevTrackable
      if (track) prevTrackable = h.id
    })
    return map
  }, [orderedHw])

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
          setHwResults(function(prev) { return { ...prev, [hwId]: { score: d.result.score, maxScore: d.result.maxScore, resultId: resultId } } })
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
        var map: Record<string, { score: number; maxScore: number; resultId?: string }> = {}
        ;(data.results || []).forEach(function(r: any) {
          map[r.homeworkId] = { score: r.score, maxScore: r.maxScore, resultId: r.id }
          onHwSubmitted(r.homeworkId)
        })
        setHwResults(map)
      })
      .catch(function() {})
  }, [studentId])

  /* (2026-و25) — كتابة التصحيح الخلفي (writingResults) توصل للطالب هنا:
     لما يفتح واجب متسلّم من القايمة بنجيب الحكم المخزنة مرة واحدة، ولو
     لسه pending — تحديث تلقائي واحد بعد ~12 ثانية + زرار تحديث خفيف.
     ممنوع polling دائم (طلب المهمة) — الفتح مرة + تحديث واحد كفاية. */
  const [hwReviewRefreshing, setHwReviewRefreshing] = useState(false)
  const fetchHwReviewOnce = async (hwId: string): Promise<boolean> => {
    var res = hwResults[hwId]
    var resultId = res && res.resultId
    if (!resultId) return true
    try {
      var r = await fetch('/api/homework/result/' + resultId)
      var d = await r.json()
      if (d && d.ok && d.result) {
        if (d.result.writingAnswers && d.result.writingAnswers.length > 0) {
          setHwWritingAnswers(function(prev) { return { ...prev, [hwId]: d.result.writingAnswers } })
        }
        if (typeof d.result.score === 'number') {
          setHwResults(function(prev) { return { ...prev, [hwId]: { score: d.result.score, maxScore: d.result.maxScore, resultId: resultId } } })
        }
        return !!d.result.gradingDone
      }
    } catch (e) {}
    return true
  }
  const openHwReview = (hwId: string) => {
    setBlockedHwId(hwId)
    var cached = hwWritingAnswers[hwId]
    if (cached && cached.length > 0) return
    ;(async function() {
      var done = await fetchHwReviewOnce(hwId)
      /* تحديث تلقائي واحد بس بعد ~12 ثانية لو التصحيح لسه شغال */
      if (!done) setTimeout(async function() { await fetchHwReviewOnce(hwId) }, 12000)
    })()
  }
  const refreshHwReview = async (hwId: string) => {
    if (hwReviewRefreshing) return
    setHwReviewRefreshing(true)
    try { await fetchHwReviewOnce(hwId) } finally { setHwReviewRefreshing(false) }
  }

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
            {/* (2026-و25) مراجعة الأسئلة المقالية عند إعادة الفتح — كتابة التصحيح
                الخلفي (writingResults) بتوصل للطالب هنا: الدرجة + ملاحظة المصحح
                تحت كل سؤال، ولو لسه pending «بيتصحح دلوقتي…» مع تحديث خفيف */}
            {(function() {
              var bWriting = hwWritingAnswers[blockedHwId] || []
              var bPendingW = bWriting.some(function(wa) { return wa.gradingStatus === 'pending' })
              var showRefresh = bWriting.length === 0 || bPendingW
              return (
                <div className="mt-3 space-y-2">
                  {bWriting.length > 0 && (
                    <p className="text-sm font-semibold text-foreground">مراجعة الأسئلة المقالية:</p>
                  )}
                  {bWriting.map(function(wa: any, wi: number) {
                    var waPending = wa.gradingStatus === 'pending' || wa.needsGrading === true
                    return (
                      <Card key={'w' + wi} className={waPending ? 'border-amber-200 dark:border-amber-900/40' : wa.isCorrect ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-red-200 dark:border-red-900/40'}>
                        <CardContent className="p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <span className={"shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full " + (waPending ? 'bg-amber-500/10 text-amber-600' : wa.isCorrect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600')}>
                              {waPending ? 'Pending' : wa.isCorrect ? 'Correct' : ((wa.answer || '').trim() ? 'Wrong' : 'Empty')}
                            </span>
                            <p className="text-sm font-medium flex-1 whitespace-pre-wrap break-words" dir="auto">{wi + 1}. <FractionText text={wa.question} /></p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="auto">إجابتك: <FractionText text={wa.answer || '(فارغ)'} /></p>
                            {wa.modelAnswer && (
                              <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="auto">الإجابة الصحيحة: <FractionText text={wa.modelAnswer} /></p>
                            )}
                            {!waPending && wa.awardedPoints !== undefined && (
                              <p className="text-[10px] font-semibold text-muted-foreground">الدرجة: {wa.awardedPoints}/{wa.maxPoints || wa.points}</p>
                            )}
                            {waPending && (
                              <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-center gap-2">
                                <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">بيتصحح دلوقتي…</p>
                              </div>
                            )}
                            {!waPending && (wa.aiFeedback || wa.feedback) && (
                              <div className={'mt-2.5 p-3 rounded-xl border-2 ' + (wa.isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800')}>
                                <p className={'text-xs font-bold mb-1 flex items-center gap-1.5 ' + (wa.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                                  <span>📝</span> ملاحظة المصحح الذكي:
                                </p>
                                <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words" style={{ textAlign: 'right' }}>{wa.aiFeedback || wa.feedback}</p>
                              </div>
                            )}
                          </div>
                        </CardContent>
                      </Card>
                    )
                  })}
                  {showRefresh && (
                    <button
                      onClick={function() { refreshHwReview(blockedHwId) }}
                      disabled={hwReviewRefreshing}
                      className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2 disabled:opacity-60"
                    >
                      {hwReviewRefreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <span>🔄</span>} تحديث نتيجة التصحيح
                    </button>
                  )}
                </div>
              )
            })()}
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
                        onClick={function() { openHwReview(hw.id) }}
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
                                <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">بيتصحح دلوقتي… النتيجة هتظهر هنا تلقائيًا</p>
                              </div>
                            )}
                            {/* AI extracted answer from image */}
                            {writingAns.aiExtractedAnswer && (
                              <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-900/40">
                                <p className="text-[10px] font-bold text-blue-700 dark:text-blue-400 mb-1">🤖 AI قرأ إجابتك من الصورة:</p>
                                <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="ltr"><FractionText text={writingAns.aiExtractedAnswer} /></p>
                              </div>
                            )}
                            {writingAns.modelAnswer && (
                              <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="ltr">Correct answer: <FractionText text={writingAns.modelAnswer} /></p>
                            )}
                            {writingAns.awardedPoints !== undefined && (
                              <p className="text-[10px] font-semibold text-muted-foreground">Score: {writingAns.awardedPoints}/{writingAns.maxPoints || writingAns.points}</p>
                            )}
                            {/* 2026-و23 — ملاحظة المصحح الذكي في آخر السؤال (طلب المستر الحرفي:
                                «يديني ملاحظة في آخر السؤال ليه السؤال ده غلط أو ليه السؤال ده صح —
                                زي ما نحن بنتكلم شات») — صندوق واضح بلون الحكم */}
                            {(writingAns.aiFeedback || writingAns.feedback) && writingAns.gradingStatus !== 'pending' && (
                              <div className={'mt-2.5 p-3 rounded-xl border-2 ' + (writingAns.isCorrect === true ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-700' : writingAns.isCorrect === false ? 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800' : 'bg-muted/40 border-border')}>
                                <p className={'text-xs font-bold mb-1 flex items-center gap-1.5 ' + (writingAns.isCorrect === true ? 'text-emerald-700 dark:text-emerald-400' : writingAns.isCorrect === false ? 'text-red-700 dark:text-red-400' : 'text-foreground')}>
                                  <span>📝</span> ملاحظة المصحح الذكي:
                                </p>
                                <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words" style={{ textAlign: 'right' }}>{writingAns.aiFeedback || writingAns.feedback}</p>
                              </div>
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
        // مقفول بالتسلسل؟ الواجب اللي قبله لسه متسلمش (زي الفيديوهات — طلب المستر)
        var isHwSeqLocked = hwLockMap[hw.id] === true
        var prevHwId = hwPrevMap[hw.id]
        var prevHwTitle = prevHwId ? ((homework.find(function(x) { return x.id === prevHwId }) || ({} as any)).title || '') : ''
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
          <Card key={hw.id} className={isHwSeqLocked ? 'border-red-500/30 opacity-90' : isSubmitted ? 'border-emerald-500/30' : hasQuestions ? 'cursor-pointer' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3" onClick={hasQuestions ? function() {
                if (isHwSeqLocked) { toast.error('الواجب ده هيتفتح أول ما تسلّم الواجب اللي قبله — سلّم الواجب اللي قبله الأول', { duration: 6000 }); return }
                if (isSubmitted) { openHwReview(hw.id); return }
                setExpandedHw(isExpanded ? null : hw.id)
              } : undefined}>
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 " + (isHwSeqLocked ? 'bg-red-500/10' : isSubmitted ? 'bg-emerald-500/10' : hasQuestions ? 'bg-emerald-500/10' : 'bg-blue-500/10')}>
                    {isHwSeqLocked ? <Lock className="h-4 w-4 text-red-500" /> : <ClipboardList className={"h-4 w-4 " + (isSubmitted ? 'text-emerald-500' : hasQuestions ? 'text-emerald-500' : 'text-blue-500')} />}
                  </div>
                  <div className="min-w-0 space-y-1">
                    <h3 className="font-semibold text-sm">{hw.title}</h3>
                    {isHwSeqLocked && (
                      <p className="text-[11px] text-red-500 font-bold leading-relaxed">
                        🔒 الواجب ده هيتفتح أول ما تسلّم الواجب اللي قبله{prevHwTitle ? ' — "' + prevHwTitle + '"' : ''}
                      </p>
                    )}
                    {hw.content && <p className="text-xs text-muted-foreground line-clamp-2">{hw.content}</p>}
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[10px] text-muted-foreground">{new Date(hw.createdAt).toLocaleDateString('ar-EG')}</p>
                      {hasMCQ && <Badge variant="outline" className="text-[10px] border-blue-500/40 text-blue-600">{mcqQuestions.length} اختيارات</Badge>}
                      {hasWriting && <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">{writingQuestions.length} مقالي</Badge>}
                      {!hasMCQ && !hasWriting && hasQuestions && <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600">{allQuestions.length} سؤال</Badge>}
                      {isHwSeqLocked && <Badge className="text-[10px] bg-red-500 text-white gap-0.5"><Lock className="h-2.5 w-2.5" /> مقفول</Badge>}
                      {isSubmitted && existingResult && <Badge className="text-[10px] bg-emerald-500 text-white">النتيجة: {existingResult.score}/{existingResult.maxScore}</Badge>}
                      {isSubmitted && !existingResult && <Badge className="text-[10px] bg-emerald-500 text-white">تم التسليم</Badge>}
                    </div>
                  </div>
                </div>
                {hw.filePath && !hasQuestions && <FileAttachment filePath={hw.filePath} fileType={hw.fileType} />}
                {hasQuestions && !isHwSeqLocked && <ChevronLeft className={"h-4 w-4 text-muted-foreground transition-transform shrink-0 mt-1 " + (isExpanded ? 'rotate-90' : '')} />}
              </div>

              {/* ACTIVE HOMEWORK - not yet submitted */}
              {isExpanded && hasQuestions && !isSubmitted && !isHwSeqLocked && (
                <div className="mt-4 pt-4 border-t space-y-4">
                  {/* MCQ Section */}
                  {hasMCQ && (
                    <div className="space-y-4">
                      {hasWriting && <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">الأسئلة الاختيارية:</p>}
                      {displayMcq.map(function(q: any, di: number) {
                        var pts = (typeof q.points === 'number' && q.points > 0) ? q.points : 1
                        return (
                          <div key={'mcq-' + di} className="space-y-2 rounded-lg p-2" dir="ltr">
                            <p className="font-medium text-sm whitespace-pre-wrap break-words" style={{ textAlign: 'left' }}>{di + 1}. <FractionText text={q.question || q.q} /> <span className="text-muted-foreground text-xs">({pts} {pts === 1 ? 'pt' : 'pts'})</span></p>
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
                              <span className="text-muted-foreground text-xs ml-2">({pts} pts)</span>
                              <Badge variant="outline" className="text-[9px] ml-2 border-amber-500/40 text-amber-600">Writing</Badge>
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
                                onUploadStateChange={function(busy: boolean) {
                                  setHwPhotoBusy(function(prev) { return { ...prev, [hw.id]: busy } })
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

                  <Button size="sm" className="w-full sm:w-auto h-11 sm:h-8 mt-1" disabled={Object.keys(myAnswers).length === 0 && Object.keys(hwAnswers[hw.id] || {}).length === 0 || hwSubmitting === hw.id || hwPhotoBusy[hw.id] === true} onClick={async function() {
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
                          setHwResults(function(prev) { return { ...prev, [hw.id]: { score: data.result.score, maxScore: data.result.maxScore, resultId: data.result.id } } })
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
                  }}>{hwPhotoBusy[hw.id] ? <span className="flex items-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> مستني صورة ورقة الحل تترفع كاملة...</span> : hwSubmitting === hw.id ? <Loader2 className="h-4 w-4 animate-spin" /> : 'تسليم الإجابات (' + Object.keys(myAnswers).length + '/' + allQuestions.length + ')'}</Button>
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
                onClick={function() { openHwReview(hw.id) }}
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

/* ========== (25-b2) امتحانات: مؤقت تنازلي + نتيجة فورية — أدوات مشتركة ========== */
/* الامتحان المجدول مستقبليًا مينزلش للطالب أصلًا من الـ API — لو ظهر scheduledAt
   مستقبلي في بيانات قديمة (كاش) نتجاهله بصمت من أي قايمة للطالب */
function isExamScheduledAhead(e: any): boolean {
  try {
    var s = e && e.scheduledAt
    if (!s) return false
    var t = new Date(s).getTime()
    return isFinite(t) && t > Date.now()
  } catch (err) { return false }
}

/* تنسيق العداد التنازلي بصيغة MM:SS */
function formatExamClock(ms: number): string {
  var total = Math.max(0, Math.floor(ms / 1000))
  var m = Math.floor(total / 60)
  var s = total % 60
  return (m < 10 ? '0' + m : String(m)) + ':' + (s < 10 ? '0' + s : String(s))
}

/* تطبيع عناصر تصحيح الأسئلة المقالية من رد نتيجة الامتحان — متسامح مع أكثر من
   شكل رد محتمل من الـ API (writingAnswers / writingResults / writingGrades JSON) */
function normalizeExamWritingItems(raw: any): any[] {
  if (!raw) return []
  var src: any = null
  try {
    src = raw.writingAnswers || raw.writingResults || null
    if (!src && typeof raw.writingGrades === 'string' && raw.writingGrades.trim()) {
      try { src = JSON.parse(raw.writingGrades) } catch (e2) { src = null }
    } else if (!src && Array.isArray(raw.writingGrades)) {
      src = raw.writingGrades
    }
  } catch (e) { return [] }
  if (!Array.isArray(src)) return []
  return src.map(function(it: any) {
    if (!it || typeof it !== 'object') return { question: '', answer: '', pending: true }
    var pending = it.gradingStatus === 'pending' || it.needsGrading === true || (it.isCorrect !== true && it.isCorrect !== false && it.isGraded !== true)
    return {
      question: it.question || it.q || '',
      answer: it.answer || it.studentAnswer || '',
      modelAnswer: it.modelAnswer || '',
      isCorrect: typeof it.isCorrect === 'boolean' ? it.isCorrect : null,
      awardedPoints: typeof it.awardedPoints === 'number' ? it.awardedPoints : undefined,
      maxPoints: (typeof it.maxPoints === 'number' ? it.maxPoints : it.points),
      feedback: it.aiFeedback || it.feedback || '',
      pending: pending,
    }
  })
}

/* ========== EXAMS TAB ========== */
function ExamsTab({ exams, results, completedExamIds, onExamSubmitted, studentId, onGoHome }: { exams: Exam[]; results: ExamResult[]; completedExamIds: Set<string>; onExamSubmitted: (examId: string) => void; studentId: string; onGoHome?: () => void }) {
  const [takingExam, setTakingExam] = useState<string | null>(null)
  const [answers, setAnswers] = useState<Record<number, number>>({})
  const [writingAnswers, setWritingAnswers] = useState<Record<number, string>>({})
  const [submitting, setSubmitting] = useState(false)
  /* 2026-و20 — ممنوع تسليم الامتحان لحد ما صور ورقة الحل توصل كاملة */
  const [examPhotoBusy, setExamPhotoBusy] = useState(false)
  const [examQuestions, setExamQuestions] = useState<any[]>([])
  const [examShuffleMap, setExamShuffleMap] = useState<number[]>([])
  const [examSubmitted, setExamSubmitted] = useState(false)
  const [submittedExamId, setSubmittedExamId] = useState<string | null>(null)
  const [checkingServer, setCheckingServer] = useState(false)
  const [blockedExamId, setBlockedExamId] = useState<string | null>(null)
  /* 2026-و12 — طلب المستر: مفيش أي نتيجة تظهر للطالب خالص
     (الدرجة والتصحيح بيوصل مستر شريف بس من الأدمن)
     (25-b2) استثناء وحيد: لو المستر فعّل showResult للامتحان نفسه — كارت النتيجة الفوري بيظهر بعد التسليم */

  /* ===== (25-b2) العداد التنازلي الاختياري — timeLimitMin > 0 فقط =====
     وقت البدء بيتسجل مرة واحدة في localStorage (mg_exam_start_{examId}_{studentId})
     — الـ refresh بيلاقي المفتاح بيكمّل من نفس النقطة مش من الأول.
     امتحانات بلا وقت: كل الحالات دي فاضية = صفر تغيير عن الحالي */
  const [examTimeLimitMs, setExamTimeLimitMs] = useState<number | null>(null)
  const [examTimeLeftMs, setExamTimeLeftMs] = useState<number | null>(null)
  const [examTimeUp, setExamTimeUp] = useState(false)
  const [examTimeUpAuto, setExamTimeUpAuto] = useState(false)
  const examDeadlineRef = useRef<number | null>(null)
  const examAutoSubmitDoneRef = useRef(false)
  const examSubmitInFlightRef = useRef(false)

  /* ===== (25-b2) كارت النتيجة الفوري — showResult=true فقط ===== */
  const [examSubmitResult, setExamSubmitResult] = useState<any | null>(null)
  const [examWritingReview, setExamWritingReview] = useState<any[] | null>(null)
  const [examWritingDone, setExamWritingDone] = useState(false)
  const [examReviewScore, setExamReviewScore] = useState<{ score: number; maxScore: number } | null>(null)
  const [examReviewRefreshing, setExamReviewRefreshing] = useState(false)
  const examReviewBusyRef = useRef(false)
  const examAutoRefreshDoneRef = useRef(false)
  const doSubmitExamRef = useRef<null | ((opts?: { auto?: boolean }) => Promise<void>)>(null)

  // ===== الترتيب التسلسلي للامتحانات (زي الفيديوهات بالظبط — طلب المستر) =====
  // الامتحان ميفتحش غير لما الامتحان اللي قبله يتقدّم. الترتيب: من الأقدم للأحدث.
  // (25-b2) الامتحان المجدول مستقبليًا بيتجاهل بصمت من الترتيب كمان عشان ميقلعش التسلسل
  var orderedExams = useMemo(function() {
    return exams.slice().filter(function(e) { return !isExamScheduledAhead(e) }).sort(function(a, b) {
      var ta = new Date((a as any).createdAt || 0).getTime()
      var tb = new Date((b as any).createdAt || 0).getTime()
      return ta - tb
    })
  }, [exams])

  var examLockMap = useMemo(function() {
    var map: Record<string, boolean> = {}
    var prevTrackable: string | null = null
    orderedExams.forEach(function(e) {
      var track = false
      try {
        var qs = JSON.parse((e as any).questions || '[]')
        track = Array.isArray(qs) && qs.length > 0
      } catch (err) { track = false }
      if (track && prevTrackable) {
        var prevDone = completedExamIds.has(prevTrackable) || (results || []).some(function(r) { return r.examId === prevTrackable })
        map[e.id] = !prevDone
      } else {
        map[e.id] = false
      }
      if (track) prevTrackable = e.id
    })
    return map
  }, [orderedExams, completedExamIds, results])

  var examPrevMap = useMemo(function() {
    var map: Record<string, string> = {}
    var prevTrackable: string | null = null
    orderedExams.forEach(function(e) {
      var track = false
      try {
        var qs = JSON.parse((e as any).questions || '[]')
        track = Array.isArray(qs) && qs.length > 0
      } catch (err) { track = false }
      if (track && prevTrackable) map[e.id] = prevTrackable
      if (track) prevTrackable = e.id
    })
    return map
  }, [orderedExams])

  /* ===== (25-b2) دالة التسليم الموحدة — نفس منطق زرار التسليم الأصلي بالظبط
     (نفس mappedAnswers من answers/writingAnswers state) — والعداد التنازلي
     بيسلّم بيها تلقائيًا عند 0 بنفس إجابات الطالب المتاحة (حتى لو فاضية) ===== */
  async function submitExamNow(opts?: { auto?: boolean }) {
    var auto = !!(opts && opts.auto)
    var examIdLocal = takingExam
    if (!examIdLocal || submitting || examPhotoBusy) return
    /* guard مزامن: التسليم مبيحصلش مرتين ولا من العداد ولا من الزرار */
    if (examSubmitInFlightRef.current) return
    examSubmitInFlightRef.current = true
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
        body: JSON.stringify({ studentId, examId: examIdLocal, answers: mappedAnswers }),
        signal: submitController.signal,
      })
      clearTimeout(submitTimeout)
      const data = await res.json()
      if (res.ok && (data.submitted || data.alreadySubmitted)) {
        /* (25-b2) showResult=true → كارت النتيجة الفوري بدل رسالة الانتظار —
           غير كده الشاشة الحالية زي ما هي بالظبط */
        if (data.showResult === true) setExamSubmitResult(data)
        else setExamSubmitResult(null)
        if (auto) {
          /* (25-b2) التسليم حصل تلقائيًا بسبب انتهاء الوقت */
          toast.warning('انتهى وقت الامتحان — تم تسليم إجاباتك')
          setExamTimeUpAuto(true)
        } else {
          /* (2026-و15) نص المستر: تم بنجاح + انتظر النتيجة من المستر —
             نص ثابت زي ما هو بالظبط (showResult=false = صفر تغيير) */
          toast.success('تم تسليم الامتحان بنجاح — انتظر النتيجة من المستر ✅')
        }
        /* العداد خلص مهمته — نمسح مفتاح وقت البدء */
        try { localStorage.removeItem('mg_exam_start_' + examIdLocal + '_' + studentId) } catch (e) {}
        setSubmittedExamId(examIdLocal)
        setExamSubmitted(true)
        onExamSubmitted(examIdLocal)
      } else if (data.blocked || data.alreadySubmitted) {
        onExamSubmitted(examIdLocal)
        setBlockedExamId(examIdLocal)
      } else {
        toast.error(data.error || 'خطأ في التقديم')
      }
    } catch (e) {
      /* (إصلاح 2026-و10) ممنوع الكذب: الانقطاع/التايم أوت كان بيقول
         «تم التقديم» حتى لو التسليم ماوصلش للسيرفر أصلًا — فكان الطالب
         بيختفي من عند المستر وهو فاكر نفسه سلم. دلوقتي بنسأل السيرفر
         بجد: هل فيه نتيجة للامتحان ده؟ لو موجودة → اتسلم فعلًا،
         لو لأ → رسالة صادقة + زرار التسليم لسه شغال يقدر يعيد */
      try {
        var verifyRes = await fetch('/api/exam-results?studentId=' + encodeURIComponent(studentId) + '&examId=' + encodeURIComponent(examIdLocal))
        var verifyData = await verifyRes.json()
        var vResults = Array.isArray(verifyData) ? verifyData : (verifyData.results || [])
        var landed = vResults.some(function(r: any) { return r && r.examId === examIdLocal })
        if (landed) {
          if (auto) {
            toast.warning('انتهى وقت الامتحان — تم تسليم إجاباتك')
            setExamTimeUpAuto(true)
          } else {
            toast.success('تم تقديم الامتحان — التسليم وصل ✅')
          }
          setSubmittedExamId(examIdLocal)
          setExamSubmitted(true)
          onExamSubmitted(examIdLocal)
        } else {
          toast.error('حصل انقطاع والتسليم ماوصلش — جرب تسلّم تاني، إجاباتك محفوظة عندك')
        }
      } catch (vErr) {
        toast.error('حصل انقطاع في الشبكة — اتأكد من النت وجرّب تسلّم تاني')
      }
    }
    examSubmitInFlightRef.current = false
    setSubmitting(false)
  }

  /* أحدث نسخة من دالة التسليم للـ ref — العداد بيناديها عند 0 بدون stale closure */
  useEffect(function() {
    doSubmitExamRef.current = submitExamNow
  })

  /* ===== (25-b2) العداد التنازلي — interval خفيف كل ثانية، بينضف في cleanup
     وعند الخروج من شاشة الحل. عند 0 → منع التعديل + التسليم التلقائي تحت ===== */
  useEffect(function() {
    if (!takingExam || examSubmitted || !examTimeLimitMs || !examDeadlineRef.current) return
    var tick = function() {
      var remain = (examDeadlineRef.current || 0) - Date.now()
      if (remain <= 0) {
        setExamTimeLeftMs(0)
        setExamTimeUp(true)
      } else {
        setExamTimeLeftMs(remain)
      }
    }
    tick()
    var iv = setInterval(tick, 1000)
    return function() { clearInterval(iv) }
  }, [takingExam, examTimeLimitMs, examSubmitted])

  /* ===== (25-b2) التسليم التلقائي عند 0 — مرة واحدة بس (guard flag).
     لو صورة ورقة الحل بتترفع لحظة الانتهاء بيستنى الرفع يخلص الأول (2026-و20)
     ولو الطالب فتح امتحان وقت خلصانة أصلًا → بيتسلم فورًا بالإجابات المتاحة ===== */
  useEffect(function() {
    if (!examTimeUp || !takingExam || examSubmitted) return
    if (examAutoSubmitDoneRef.current) return
    if (submitting || examPhotoBusy) return
    examAutoSubmitDoneRef.current = true
    ;(async function() {
      try { await doSubmitExamRef.current?.({ auto: true }) } catch (e) {}
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examTimeUp, takingExam, examSubmitted, submitting, examPhotoBusy])

  /* ===== (25-b2) تحديث نتيجة المقالي بعد التسليم (showResult=true) — نفس
     endpoint نتايج الطالب المعتمد في الملف (/api/exam-results) — ممنوع endpoint جديد ===== */
  async function refreshExamResult() {
    if (!submittedExamId || examReviewBusyRef.current) return
    examReviewBusyRef.current = true
    setExamReviewRefreshing(true)
    try {
      var r = await fetch('/api/exam-results?studentId=' + encodeURIComponent(studentId) + '&examId=' + encodeURIComponent(submittedExamId))
      var d = await r.json()
      var raw: any = null
      if (d && Array.isArray(d.results) && d.results.length > 0) raw = d.results[0]
      else if (d && d.result) raw = d.result
      else if (d && (d.writingAnswers || d.writingResults || d.writingGrades || d.allQuestions || typeof d.score === 'number')) raw = d
      var items = normalizeExamWritingItems(raw)
      if (items.length > 0) setExamWritingReview(items)
      var anyPending = items.some(function(w) { return w.pending })
      if (items.length > 0 && !anyPending) setExamWritingDone(true)
      else if (raw && (raw.gradingDone === true || raw.writingPending === false)) setExamWritingDone(true)
      if (raw && typeof raw.score === 'number') {
        setExamReviewScore({ score: raw.score, maxScore: typeof raw.maxScore === 'number' ? raw.maxScore : ((examSubmitResult && examSubmitResult.maxScore) || 0) })
      }
    } catch (e) { /* silent — زرار التحديث شغال تاني */ }
    examReviewBusyRef.current = false
    setExamReviewRefreshing(false)
  }

  /* أول ظهور لو المقالي لسه بيتصحح: تحديث تلقائي واحد بعد ~12 ثانية
     (نفس نمط مراجعة الواجب المقالية 2026-و25) — وبعدها زرار «تحديث الملاحظات» اليدوي */
  useEffect(function() {
    if (!examSubmitted || !examSubmitResult || examSubmitResult.writingPending !== true) return
    if (examWritingDone || examAutoRefreshDoneRef.current) return
    examAutoRefreshDoneRef.current = true
    var t = setTimeout(function() { refreshExamResult() }, 12000)
    return function() { clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [examSubmitted, examSubmitResult, examWritingDone])

  /* الخروج من شاشة النجاح — تصفير كامل لحالة العداد والنتيجة */
  function resetAfterExamView() {
    if (submittedExamId) onExamSubmitted(submittedExamId)
    setExamSubmitted(false)
    setSubmittedExamId(null)
    setTakingExam(null)
    setAnswers({})
    setWritingAnswers({})
    setExamQuestions([])
    setExamShuffleMap([])
    /* (25-b2) تصفير العداد والنتيجة */
    setExamTimeLimitMs(null)
    setExamTimeLeftMs(null)
    setExamTimeUp(false)
    setExamTimeUpAuto(false)
    examDeadlineRef.current = null
    examAutoSubmitDoneRef.current = false
    setExamSubmitResult(null)
    setExamWritingReview(null)
    setExamWritingDone(false)
    setExamReviewScore(null)
    examAutoRefreshDoneRef.current = false
    if (onGoHome) onGoHome()
  }

  if (orderedExams.length === 0) return <EmptyState message="لا توجد امتحانات حالياً" />

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

  // EXAM SUBMITTED SUCCESS SCREEN — (2026-و15) تحديث نص المستر: «تم تسليم الامتحان بنجاح
  // انتظر النتيجة من المستر» — برضه من غير أي درجة ولا تصحيح ولا أسئلة — بس زرار العودة.
  // (25-b2) استثناء: لو رد التسليم جاب showResult:true → كارت النتيجة الفوري
  if (examSubmitted) {
    var cardRes: any = examSubmitResult && examSubmitResult.showResult === true ? examSubmitResult : null
    if (!cardRes) {
      return (
        <div className="flex flex-col items-center justify-center py-12 px-6 space-y-5">
          <div className="h-24 w-24 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-14 w-14 text-emerald-500" />
          </div>
          <div className="text-center space-y-2">
            <h2 className="text-xl font-bold text-emerald-600">تم تسليم الامتحان بنجاح</h2>
            <p className="text-sm text-muted-foreground">انتظر النتيجة من المستر</p>
            {/* (25-b2) يظهر بس لما العداد سلّم تلقائيًا بعد انتهاء الوقت */}
            {examTimeUpAuto && <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">⏰ انتهى وقت الامتحان — تم تسليم إجاباتك تلقائيًا</p>}
          </div>
          <Button onClick={resetAfterExamView} className="mt-2 min-h-[44px] px-6">
            العودة إلى صفحتك
          </Button>
        </div>
      )
    }
    var writingStillPending = cardRes.writingPending === true && !examWritingDone
    return (
      <div className="space-y-4 pb-8">
        {/* هيدر أخضر «تم تسليم الامتحان بنجاح ✓» */}
        <div className="flex flex-col items-center justify-center pt-10 px-6 space-y-3 text-center">
          <div className="h-20 w-20 rounded-full bg-emerald-500/10 flex items-center justify-center">
            <CheckCircle2 className="h-12 w-12 text-emerald-500" />
          </div>
          <h2 className="text-xl font-bold text-emerald-600">تم تسليم الامتحان بنجاح ✓</h2>
          {examTimeUpAuto && <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">⏰ انتهى وقت الامتحان — تم تسليم إجاباتك تلقائيًا</p>}
        </div>

        <Card className="border-emerald-500/30 mx-auto w-full max-w-2xl">
          <CardContent className="p-4 sm:p-5 space-y-4">
            {/* درجة الاختياري — ولو المقالي اتصحح الدرجة الكلية بتتحدث من التحديث */}
            <div className="flex items-start gap-3 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 shrink-0 mt-0.5" />
              <div className="min-w-0">
                {examReviewScore ? (
                  <p className="font-bold text-sm sm:text-base text-emerald-700 dark:text-emerald-400">درجتك: {examReviewScore.score} / {examReviewScore.maxScore}</p>
                ) : (
                  <p className="font-bold text-sm sm:text-base text-emerald-700 dark:text-emerald-400">
                    درجتك في الاختياري: {typeof cardRes.mcqScore === 'number' ? cardRes.mcqScore : 0} / {typeof cardRes.maxScore === 'number' ? cardRes.maxScore : 0}
                    {cardRes.writingPending === true && <span className="text-xs font-semibold text-amber-600 dark:text-amber-400"> (المقالي لسه بيتصحح)</span>}
                  </p>
                )}
              </div>
            </div>

            {/* قائمة كل سؤال اختياري صح/غلط — سكرول نظيف للقاائم الطويلة */}
            {Array.isArray(cardRes.mcqResults) && cardRes.mcqResults.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">مراجعة أسئلة الاختياري:</p>
                <div className="max-h-96 overflow-y-auto custom-scrollbar space-y-2 pl-0.5">
                  {cardRes.mcqResults.map(function(m: any, mi: number) {
                    var pts = typeof m.points === 'number' ? m.points : null
                    return (
                      <div key={'mcqr-' + mi} className={'flex items-start gap-2 p-2.5 rounded-lg border text-sm ' + (m.isCorrect ? 'border-emerald-500/30 bg-emerald-500/5' : 'border-red-500/30 bg-red-500/5')}>
                        {m.isCorrect ? <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" /> : <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />}
                        <div className="flex-1 min-w-0 space-y-0.5">
                          <p className="text-xs sm:text-sm font-medium break-words" dir="auto">{mi + 1}. <FractionText text={m.question || ''} /></p>
                          <p className="text-xs text-foreground/90 break-words" dir="auto">
                            إجابتك: <span dir="ltr" className="font-semibold"><FractionText text={m.studentAnswer || '(فارغ)'} /></span>
                            {m.isCorrect ? (
                              <span className="text-emerald-600 font-semibold"> — صح ✓</span>
                            ) : (
                              <span> — <span className="text-muted-foreground">الصح:</span> <span dir="ltr" className="text-emerald-600 font-semibold"><FractionText text={m.correctAnswer || ''} /></span></span>
                            )}
                          </p>
                          {pts !== null && <p className="text-[10px] font-semibold text-muted-foreground">({pts} {pts === 1 ? 'درجة' : 'درجات'})</p>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* مراجعة الأسئلة المقالية بعد ما التصحيح يخلص — «📝 ملاحظة المصحح الذكي» بنفس ستايل مراجعة الواجب */}
            {examWritingReview && examWritingReview.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold text-foreground">مراجعة الأسئلة المقالية:</p>
                {examWritingReview.map(function(w: any, wi: number) {
                  return (
                    <Card key={'ewr-' + wi} className={w.pending ? 'border-amber-200 dark:border-amber-900/40' : w.isCorrect ? 'border-emerald-200 dark:border-emerald-900/40' : 'border-red-200 dark:border-red-900/40'}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-start gap-2">
                          <span className={'shrink-0 mt-0.5 text-xs font-bold px-2 py-0.5 rounded-full ' + (w.pending ? 'bg-amber-500/10 text-amber-600' : w.isCorrect ? 'bg-emerald-500/10 text-emerald-600' : 'bg-red-500/10 text-red-600')}>
                            {w.pending ? 'Pending' : w.isCorrect ? 'Correct' : ((w.answer || '').trim() ? 'Wrong' : 'Empty')}
                          </span>
                          <p className="text-sm font-medium flex-1 whitespace-pre-wrap break-words" dir="auto">{wi + 1}. <FractionText text={w.question} /></p>
                        </div>
                        <p className="text-xs text-foreground whitespace-pre-wrap break-words" dir="auto">إجابتك: <FractionText text={w.answer || '(فارغ)'} /></p>
                        {w.modelAnswer && <p className="text-xs text-emerald-600 whitespace-pre-wrap break-words" dir="auto">الإجابة الصحيحة: <FractionText text={w.modelAnswer} /></p>}
                        {!w.pending && w.awardedPoints !== undefined && <p className="text-[10px] font-semibold text-muted-foreground">الدرجة: {w.awardedPoints}/{w.maxPoints}</p>}
                        {w.pending && (
                          <div className="mt-2 p-2 rounded bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 flex items-center gap-2">
                            <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600 shrink-0" />
                            <p className="text-[11px] font-semibold text-amber-700 dark:text-amber-400">بيتصحح دلوقتي…</p>
                          </div>
                        )}
                        {!w.pending && w.feedback && (
                          <div className={'mt-2.5 p-3 rounded-xl border-2 ' + (w.isCorrect ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-400 dark:border-emerald-700' : 'bg-red-50 dark:bg-red-900/20 border-red-300 dark:border-red-800')}>
                            <p className={'text-xs font-bold mb-1 flex items-center gap-1.5 ' + (w.isCorrect ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400')}>
                              <span>📝</span> ملاحظة المصحح الذكي:
                            </p>
                            <p className="text-xs leading-relaxed text-foreground whitespace-pre-wrap break-words" style={{ textAlign: 'right' }}>{w.feedback}</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            )}

            {/* بانر المقالي — بتصحح بالذكاء الاصطناعي + زرار تحديث واحد (وتلقائي بعد 12 ثانية) */}
            {writingStillPending && (
              <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-900/40 space-y-2.5">
                <p className="text-xs font-semibold text-amber-700 dark:text-amber-400 flex items-start gap-2 leading-relaxed">
                  <Loader2 className="h-3.5 w-3.5 animate-spin shrink-0 mt-0.5" />
                  <span>الأسئلة المقالية بتصحح بالذكاء الاصطناعي دلوقتي — ملاحظات المصحح الذكية هتظهر بعد لحظات</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] w-full sm:w-auto border-amber-400/60 text-amber-700 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-900/40"
                  disabled={examReviewRefreshing}
                  onClick={function() { refreshExamResult() }}
                >
                  {examReviewRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <span>🔄</span>}
                  تحديث الملاحظات
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex justify-center">
          <Button onClick={resetAfterExamView} className="min-h-[44px] px-6">العودة إلى صفحتك</Button>
        </div>
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
        <div className="flex items-center justify-between gap-2">
          <h3 className="font-bold truncate min-w-0">{exam.title}</h3>
          <Button variant="outline" size="sm" className="h-11 sm:h-8 shrink-0" onClick={() => { setTakingExam(null); setAnswers({}); setWritingAnswers({}); setExamQuestions([]); setExamShuffleMap([]); setExamTimeLimitMs(null); setExamTimeLeftMs(null); setExamTimeUp(false); examDeadlineRef.current = null }}>رجوع</Button>
        </div>

        {/* (25-b2) العداد التنازلي — ظابط فوق منطقة الحل — primary عادي،
            وأحمر نابض animate-pulse في آخر دقيقة — وعند 0 بيسلّم تلقائيًا */}
        {examTimeLimitMs !== null && (
          <div className="sticky top-0 z-40" dir="rtl">
            <div
              className={
                'flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2 rounded-xl font-bold text-sm shadow-sm border backdrop-blur transition-colors ' +
                (examTimeUp
                  ? 'bg-red-100/95 dark:bg-red-900/40 border-red-400/60 text-red-700 dark:text-red-300'
                  : examTimeLeftMs !== null && examTimeLeftMs <= 60000
                    ? 'bg-destructive text-white border-destructive animate-pulse'
                    : 'bg-primary text-primary-foreground border-primary/40')
              }
            >
              <Timer className="h-4 w-4 shrink-0" />
              {examTimeUp ? (
                <span>انتهى وقت الامتحان — جاري تسليم إجاباتك…</span>
              ) : (
                <>
                  <span>الوقت المتبقي:</span>
                  <span dir="ltr" className="tabular-nums">{formatExamClock(examTimeLeftMs || 0)}</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* 2026-و19 — ورقة الامتحان جوه شاشة الحل — طلب المستر «الورق ما بيحملش كله»:
            الطالب يقدر يفتح الورقة كاملة في أي لحظة وهو بيحل، ثابتة فوق دايمًا
            (25-b2: لما العداد شغال بينزل تحت العداد عشان الاتنين sticky فوق) */}
        {exam.filePath && (
          <a
            href={exam.filePath}
            target="_blank"
            rel="noopener noreferrer"
            className={(examTimeLimitMs !== null ? 'sticky top-[48px] z-30' : 'sticky top-0 z-30') + " flex items-center justify-center gap-2 w-full min-h-[44px] px-4 py-2.5 rounded-xl font-bold text-sm text-amber-900 dark:text-amber-300 bg-amber-100/95 dark:bg-amber-900/40 border border-amber-400/60 shadow-sm backdrop-blur hover:bg-amber-200/95 dark:hover:bg-amber-900/60 transition-colors"}
            dir="rtl"
          >
            <FileText className="h-4 w-4 shrink-0" />
            ورقة الامتحان — اضغط في أي وقت لعرضها كاملة
            <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-70" />
          </a>
        )}
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
                          disabled={examTimeUp}
                          onClick={() => setAnswers(prev => ({ ...prev, [displayIdx]: oi }))}
                          className={`w-full p-3 rounded-lg border text-sm transition-colors disabled:opacity-60 disabled:cursor-not-allowed ${
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
                    {/* (25-b2) عند انتهاء الوقت: منع تعديل نهائي — pointer-events +
                        قفل الكيبورد على الـ MathKeyboard من غير لمس الملف بتاعه */}
                    <div
                      dir="ltr"
                      className={examTimeUp ? 'pointer-events-none select-none opacity-60' : ''}
                      onKeyDownCapture={examTimeUp ? function(e: any) { e.preventDefault(); e.stopPropagation() } : undefined}
                      aria-disabled={examTimeUp || undefined}
                    >
                      <MathKeyboard
                        value={writingAnswers[displayIdx] || ''}
                        onChange={function(val: string) {
                          setWritingAnswers(function(prev) { return { ...prev, [displayIdx]: val } })
                        }}
                        onUploadStateChange={function(busy: boolean) {
                          setExamPhotoBusy(busy)
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

        {/* (25-b2) زرار التسليم — نفس المنطق في submitExamNow (والعداد بيستخدم نفس الدالة).
            مفيش disable عند examTimeUp عشان لو التسليم التلقائي فشل شبكة الطالب يقدر يعيد بنفسه */}
        <Button
          className="w-full h-11 sm:h-10"
          disabled={submitting || examPhotoBusy}
          onClick={function() { submitExamNow() }}
        >
          {examPhotoBusy ? <span className="flex items-center justify-center gap-1.5"><Loader2 className="h-4 w-4 animate-spin" /> مستني صورة ورقة الحل تترفع كاملة...</span> : submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : `تسليم الامتحان (${Object.keys(answers).length + Object.keys(writingAnswers).length}/${examQuestions.length})`}
        </Button>
      </div>
    )
  }

  // EXAM LIST VIEW
  return (
    <div className="space-y-3">
      {/* (25-b2) الامتحان المجدول مستقبليًا يتجاهل بصمت من القايمة */}
      {exams.filter(function(e) { return !isExamScheduledAhead(e) }).map((exam) => {
        const examResult: any = results.find(r => r.examId === exam.id)
        const isCompleted = examResult || completedExamIds.has(exam.id)
        // مقفول بالتسلسل؟ الامتحان اللي قبله لسه متقدمش (زي الفيديوهات — طلب المستر)
        const isExamSeqLocked = examLockMap[exam.id] === true
        const prevExamId = examPrevMap[exam.id]
        const prevExamTitle = prevExamId ? ((exams.find(function(x) { return x.id === prevExamId }) || ({} as any)).title || '') : ''
        /* 2026-و12 — مفيش نتيجة لحظية ولا تصحيح يتشاف من الطالب */
        let hasQuestions = false
        let parsedQuestions: any[] = []
        try { if ((exam as any).questions) { parsedQuestions = JSON.parse((exam as any).questions); hasQuestions = parsedQuestions.length > 0 } } catch {}
        return (
          <Card key={exam.id} className={isExamSeqLocked ? 'border-red-500/30 opacity-90' : isCompleted ? 'border-emerald-500/30' : ''}>
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3 min-w-0 flex-1">
                  <div className={"h-9 w-9 rounded-lg flex items-center justify-center shrink-0 mt-0.5 " + (isExamSeqLocked ? 'bg-red-500/10' : 'bg-orange-500/10')}>
                    {isExamSeqLocked ? <Lock className="h-4 w-4 text-red-500" /> : <FileText className="h-4 w-4 text-orange-500" />}
                  </div>
                  <div className="min-w-0 space-y-1.5">
                    <h3 className="font-semibold text-sm">{exam.title}</h3>
                    {/* النموذج المخصص للطالب عشوائيًا (لو الامتحان فيه نماذج) */}
                    {(exam as any).modelName && (
                      <Badge className="text-[10px] bg-purple-500 text-white">
                        📄 {(exam as any).modelName}
                      </Badge>
                    )}
                    {/* (25-b2) امتحان عليه وقت محدد — العلامة تظهر قبل ما يبدأ */}
                    {(function() {
                      var tlShow = Number((exam as any).timeLimitMin || 0)
                      return isFinite(tlShow) && tlShow > 0 ? (
                        <Badge variant="outline" className="text-[10px] border-primary/40 text-primary w-fit">⏱ {tlShow} دقيقة</Badge>
                      ) : null
                    })()}
                    {isExamSeqLocked && (
                      <p className="text-[11px] text-red-500 font-bold leading-relaxed">
                        🔒 الامتحان ده هيتفتح أول ما تاخد الامتحان اللي قبله{prevExamTitle ? ' — "' + prevExamTitle + '"' : ''}
                      </p>
                    )}
                    {isCompleted ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className="text-xs bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                          تم تسليم الامتحان
                        </Badge>
                      </div>
                    ) : isExamSeqLocked ? (
                      <button
                        type="button"
                        onClick={function() { toast.error('الامتحان ده هيتفتح أول ما تاخد الامتحان اللي قبله — امتحان " ' + (prevExamTitle || 'اللي قبله') + ' " الأول', { duration: 6000 }) }}
                        className="inline-flex items-center gap-1.5 text-[11px] font-bold text-red-500 hover:text-red-600 cursor-not-allowed"
                        aria-label="الامتحان مقفول — هيتفتح أول ما تاخد الامتحان اللي قبله"
                      >
                        <Lock className="h-3.5 w-3.5" />
                        مقفول — سلّم اللي قبله الأول
                      </button>
                    ) : hasQuestions ? (
                      <Button size="sm" className="h-11 sm:h-8" disabled={checkingServer} onClick={async () => {
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
                          setAnswers({})
                          /* ===== (25-b2) تهيئة العداد التنازلي + تصفير حالة النتيجة =====
                             وقت البدء بيتسجل مرة واحدة في localStorage — لو موجود بيتاخد زي ما هو
                             (الـ refresh بيكمّل من نفس النقطة مش من الأول)، ولو العدّاد خلص
                             أصلًا setExamTimeUp(true) → التسليم التلقائي فورًا بالإجابات المتاحة */
                          examAutoSubmitDoneRef.current = false
                          examSubmitInFlightRef.current = false
                          setExamSubmitResult(null)
                          setExamWritingReview(null)
                          setExamWritingDone(false)
                          setExamReviewScore(null)
                          examAutoRefreshDoneRef.current = false
                          setExamTimeUpAuto(false)
                          var tlMin = Number((exam as any).timeLimitMin || 0)
                          if (isFinite(tlMin) && tlMin > 0) {
                            var startKey = 'mg_exam_start_' + exam.id + '_' + studentId
                            var startVal: string | null = null
                            try { startVal = localStorage.getItem(startKey) } catch (e) {}
                            var startNum = startVal ? parseInt(startVal, 10) : NaN
                            if (!isFinite(startNum) || startNum <= 0) {
                              startNum = Date.now()
                              try { localStorage.setItem(startKey, String(startNum)) } catch (e) {}
                            }
                            examDeadlineRef.current = startNum + tlMin * 60 * 1000
                            setExamTimeLimitMs(tlMin * 60 * 1000)
                            var remainMs = examDeadlineRef.current - Date.now()
                            setExamTimeLeftMs(Math.max(0, remainMs))
                            setExamTimeUp(remainMs <= 0)
                          } else {
                            /* امتحان بلا وقت — صفر تغيير */
                            examDeadlineRef.current = null
                            setExamTimeLimitMs(null)
                            setExamTimeLeftMs(null)
                            setExamTimeUp(false)
                          }
                          setTakingExam(exam.id)
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
/* 2026-و19 — «الورق ما بيحملش كله» — المرفق بقى بيتفتح كامل: صورة الورقة
 * قابلة للضغط بتفتح الصورة الأصلية كاملة (تبويب جديد + زوم المتصفح)
 * والـ PDF زرار واضح 44px — والطالب بيشوف الورقة كاملة مش مصغرة 48px */
function FileAttachment({ filePath, fileType }: { filePath: string; fileType: string }) {
  const isImage = fileType?.startsWith('image/')
  const isPdf = fileType === 'application/pdf'
  if (isImage) {
    return (
      <a href={filePath} target="_blank" rel="noopener noreferrer" className="inline-block group align-top" title="اضغط لعرض الورقة كاملة">
        <Image src={filePath} alt="ورقة الامتحان — اضغط للعرض الكامل" width={120} height={96} className="max-h-24 w-auto rounded-lg border group-hover:ring-2 ring-primary/60 transition-all" unoptimized />
        <span className="flex items-center gap-1 text-[11px] font-bold text-primary mt-1">
          <Search className="h-3 w-3" />
          اضغط لعرض الورقة كاملة
        </span>
      </a>
    )
  }
  return (
    <a href={filePath} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 px-3 py-2.5 min-h-[44px] rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors text-xs font-bold shrink-0">
      <FileDown className="h-4 w-4" />
      {isPdf ? 'افتح الورقة كاملة (PDF)' : 'افتح الملف كامل'}
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
      desc: 'تاب "الامتحانات" فيه كل الامتحانات اللي المستر نزلها لصفك. اضغط على الامتحان وادخل حل الأسئلة، ونتيجتك هتظهر لمستر شريف بعد ما تسلّم.',
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


/* ========== Countdown Timer for scheduled videos (الجدولة القديمة) ========== */
function CountdownTimer({ unlockAt }: { unlockAt: Date }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 })

  useEffect(() => {
    var interval = setInterval(function() {
      var now = Date.now()
      var diff = unlockAt.getTime() - now
      if (diff <= 0) {
        setTimeLeft({ days: 0, hours: 0, minutes: 0, seconds: 0 })
        clearInterval(interval)
        return
      }
      var days = Math.floor(diff / (1000 * 60 * 60 * 24))
      var hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
      var minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      var seconds = Math.floor((diff % (1000 * 60)) / 1000)
      setTimeLeft({ days, hours, minutes, seconds })
    }, 1000)
    return function() { clearInterval(interval) }
  }, [unlockAt])

  return (
    <div className="flex items-center justify-center gap-2 text-white">
      {timeLeft.days > 0 && (
        <div className="text-center">
          <div className="text-2xl font-bold bg-white/10 rounded-lg px-2 py-1 min-w-[40px]">{timeLeft.days}</div>
          <div className="text-[9px] text-white/70">يوم</div>
        </div>
      )}
      <div className="text-center">
        <div className="text-2xl font-bold bg-white/10 rounded-lg px-2 py-1 min-w-[40px]">{String(timeLeft.hours).padStart(2, '0')}</div>
        <div className="text-[9px] text-white/70">ساعة</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold bg-white/10 rounded-lg px-2 py-1 min-w-[40px]">{String(timeLeft.minutes).padStart(2, '0')}</div>
        <div className="text-[9px] text-white/70">دقيقة</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold bg-white/10 rounded-lg px-2 py-1 min-w-[40px]">{String(timeLeft.seconds).padStart(2, '0')}</div>
        <div className="text-[9px] text-white/70">ثانية</div>
      </div>
    </div>
  )
}
