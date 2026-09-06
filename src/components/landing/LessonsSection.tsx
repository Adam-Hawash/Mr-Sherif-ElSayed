'use client'

import { useEffect, useState, useRef } from 'react'
import { useAppStore, GRADES } from '@/stores/app-store'
import { Badge } from '@/components/ui/badge'
import { BookOpen, Lock, PlayCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import Image from 'next/image'

function getYouTubeId(url: string) {
  var match = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/))([\w-]{11})/)
  return match ? match[1] : null
}

export default function LessonsSection() {
  var store = useAppStore()
  var setView = store.setView
  var [videos, setVideos] = useState<any[]>([])
  var [loading, setLoading] = useState(true)
  var [selectedGrade, setSelectedGrade] = useState('')
  var [centerIndex, setCenterIndex] = useState(0)
  var timerRef = useRef<any>(null)
  var isPausedRef = useRef(false)
  var lenRef = useRef(0)

  useEffect(function() {
    setLoading(true)
    setCenterIndex(0)
    var params = new URLSearchParams({ pageSize: '50' })
    if (selectedGrade) params.set('grade', selectedGrade)
    fetch('/api/videos?' + params.toString())
      .then(function(r) { return r.json() })
      .then(function(data) {
        setVideos(data.videos || [])
        lenRef.current = (data.videos || []).length
      })
      .catch(function() {})
      .finally(function() { setLoading(false) })
  }, [selectedGrade])

  // Auto-rotate every 4 seconds
  useEffect(function() {
    if (videos.length <= 1) return
    function tick() {
      if (isPausedRef.current) return
      setCenterIndex(function(prev) { return (prev + 1) % lenRef.current })
    }
    timerRef.current = setInterval(tick, 4000)
    return function() {
      if (timerRef.current) clearInterval(timerRef.current)
    }
  }, [videos.length])

  function pauseAndGo(dir: number) {
    isPausedRef.current = true
    setCenterIndex(function(prev) { return (prev + dir + lenRef.current) % lenRef.current })
    setTimeout(function() { isPausedRef.current = false }, 8000)
  }

  function goToIndex(i: number) {
    isPausedRef.current = true
    setCenterIndex(i)
    setTimeout(function() { isPausedRef.current = false }, 8000)
  }

  var SLOTS = [-2, -1, 0, 1, 2]
  var vLen = videos.length

  function getStyle(offset: number) {
    var abs = Math.abs(offset)
    if (abs === 0) return { w: '36%', op: 1, sc: 1, z: 20, bl: 0 }
    if (abs === 1) return { w: '20%', op: 0.5, sc: 0.88, z: 10, bl: 1 }
    return { w: '15%', op: 0.2, sc: 0.76, z: 5, bl: 2.5 }
  }

  return (
    <section className="py-16 px-4 sm:px-6 lg:px-8 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <Badge className="mb-3 bg-primary/10 text-primary border-primary/30 hover:bg-primary/20">
            <BookOpen className="h-3.5 w-3.5 ml-1" />الدروس
          </Badge>
          <h2 className="text-3xl sm:text-4xl font-bold text-foreground mb-3">الدروس المتاحة</h2>
          <p className="text-muted-foreground max-w-xl mx-auto">اختر درسك وابدأ التعلم. سجل دخولك للوصول للمحتوى الكامل.</p>
        </div>

        <div className="flex justify-center mb-8">
          <select
            value={selectedGrade}
            onChange={function(e) { setSelectedGrade(e.target.value) }}
            className="h-10 rounded-lg border border-primary/30 bg-card text-foreground px-4 text-sm appearance-none cursor-pointer"
          >
            <option value="">كل الصفوف</option>
            {GRADES.map(function(g) { return <option key={g} value={g}>{g}</option> })}
          </select>
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : videos.length === 0 ? (
          <div className="text-center py-16">
            <BookOpen className="h-12 w-12 text-muted-foreground/20 mx-auto mb-4" />
            <p className="text-muted-foreground/50">لا توجد دروس متاحة حالياً</p>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="relative flex items-center justify-center py-6">
              {videos.length > 1 && (
                <button
                  onClick={function() { pauseAndGo(-1) }}
                  className="absolute right-0 sm:-right-3 z-30 h-10 w-10 rounded-full bg-card border border-border text-foreground flex items-center justify-center hover:bg-accent shadow-lg hover:scale-110 transition-all"
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              )}
              {videos.length > 1 && (
                <button
                  onClick={function() { pauseAndGo(1) }}
                  className="absolute left-0 sm:-left-3 z-30 h-10 w-10 rounded-full bg-card border border-border text-foreground flex items-center justify-center hover:bg-accent shadow-lg hover:scale-110 transition-all"
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
              )}

              <div className="flex items-center justify-center gap-2 sm:gap-3 w-full px-12 sm:px-14">
                {SLOTS.map(function(offset) {
                  var idx = ((centerIndex + offset) % vLen + vLen) % vLen
                  var video = videos[idx]
                  if (!video) return <div key={offset} style={{ width: getStyle(offset).w }} />
                  var s = getStyle(offset)
                  var isCenter = offset === 0
                  var ytId = getYouTubeId(video.url)
                  var thumb = video.thumbnail || (ytId ? 'https://img.youtube.com/vi/' + ytId + '/mqdefault.jpg' : null)

                  return (
                    <div
                      key={offset}
                      onClick={function() { setView('auth-login') }}
                      className="cursor-pointer"
                      style={{
                        width: s.w,
                        opacity: s.op,
                        transform: 'scale(' + s.sc + ')',
                        zIndex: s.z,
                        filter: s.bl > 0 ? 'blur(' + s.bl + 'px)' : 'none',
                        transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
                        willChange: 'transform, opacity, filter',
                      }}
                    >
                      <div className="relative aspect-video rounded-xl overflow-hidden bg-muted border border-border group">
                        {thumb ? (
                          <Image src={thumb} alt={video.title} fill className="object-cover" sizes={isCenter ? '500px' : '200px'} unoptimized />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <PlayCircle className="h-6 w-6 text-muted-foreground/30" />
                          </div>
                        )}
                        <div className="absolute top-2 left-2 z-10 h-7 w-7 rounded-full bg-black/60 flex items-center justify-center">
                          <Lock className="h-3.5 w-3.5 text-white/90" />
                        </div>
                      </div>
                      <div className="mt-2 px-0.5">
                        <p className={"font-medium text-foreground truncate " + (isCenter ? 'text-sm sm:text-base' : 'text-[10px] sm:text-xs')}>
                          {video.title}
                        </p>
                        <p className={"text-muted-foreground truncate mt-0.5 " + (isCenter ? 'text-xs' : 'text-[9px]')}>
                          {video.grade}
                        </p>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {videos.length > 1 && (
              <div className="flex justify-center gap-2">
                {videos.map(function(_, i) {
                  return (
                    <button
                      key={i}
                      onClick={function() { goToIndex(i) }}
                      className={"rounded-full transition-all duration-300 " + (
                        i === centerIndex
                          ? "w-8 h-2.5 bg-primary"
                          : "w-2.5 h-2.5 bg-muted-foreground/30 hover:bg-muted-foreground/50"
                      )}
                    />
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
