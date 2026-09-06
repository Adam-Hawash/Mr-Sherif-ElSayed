'use client'

import { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Loader2, Lock, Play } from 'lucide-react'
import { useAppStore, GRADES } from '@/stores/app-store'

interface VideoItem {
  id: string
  title: string
  url: string
  filePath: string
  fileType: string
  thumbnail: string
  grade: string
  price: number
}

function getYouTubeThumbnail(url: string) {
  var match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  if (match) return `https://img.youtube.com/vi/${match[1]}/hqdefault.jpg`
  return ''
}

export function PublicVideosSection() {
  var setView = useAppStore(function (s) { return s.setView })
  var [videos, setVideos] = useState<VideoItem[]>([])
  var [loading, setLoading] = useState(true)
  var [gradeFilter, setGradeFilter] = useState('all')

  useEffect(function () {
    var cancelled = false
    ;(async function () {
      try {
        var res = await fetch('/api/videos?pageSize=100')
        var data = await res.json()
        if (!cancelled) {
          setVideos(Array.isArray(data) ? data : (data.videos || []))
          setLoading(false)
        }
      } catch (e) {
        if (!cancelled) setLoading(false)
      }
    })()
    return function () { cancelled = true }
  }, [])

  var filtered = gradeFilter === 'all'
    ? videos
    : videos.filter(function (v) { return v.grade === gradeFilter })

  if (loading) {
    return (
      <section className="py-16 px-4">
        <div className="max-w-6xl mx-auto text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
        </div>
      </section>
    )
  }

  if (videos.length === 0) return null

  return (
    <section className="py-16 px-4 bg-muted/30">
      <div className="max-w-6xl mx-auto">
        <div className="text-center mb-10">
          <h2 className="text-3xl font-bold mb-3">الفيديوهات التعليمية</h2>
          <p className="text-muted-foreground text-lg">تابع الدروس التعليمية في الرياضيات</p>
        </div>

        {/* Grade filter tabs - Arabic only */}
        <div className="flex flex-wrap justify-center gap-2 mb-8">
          {[
            { value: 'all', label: 'الكل' },
            { value: 'الصف السادس الابتدائي', label: 'الصف السادس' },
            { value: 'الصف الأول الاعدادي', label: 'الأول الإعدادي' },
            { value: 'الصف الثاني الاعدادي', label: 'الثاني الإعدادي' },
            { value: 'الصف الثالث الاعدادي', label: 'الثالث الإعدادي' },
            { value: 'أولى بكالوريا', label: 'أولى بكالوريا' },
          ].map(function (g) {
            var isActive = gradeFilter === g.value
            return (
              <button
                key={g.value}
                onClick={function () { setGradeFilter(g.value) }}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-card border border-border hover:bg-accent'
                }`}
              >
                {g.label}
              </button>
            )
          })}
        </div>

        {/* Video grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {filtered.map(function (video) {
            var thumb = video.thumbnail || (video.url && getYouTubeThumbnail(video.url)) || ''
            return (
              <Card
                key={video.id}
                className="overflow-hidden cursor-pointer hover:shadow-lg transition-shadow group"
                onClick={function () { setView('auth-login') }}
              >
                <div className="relative aspect-video bg-muted">
                  {thumb ? (
                    <img
                      src={thumb}
                      alt={video.title}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-muted">
                      <Play className="h-12 w-12 text-muted-foreground" />
                    </div>
                  )}
                  {/* Lock overlay */}
                  <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-2">
                    <div className="h-12 w-12 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
                      <Lock className="h-6 w-6 text-white" />
                    </div>
                    <span className="text-white text-sm font-medium">سجل دخولك</span>
                  </div>
                </div>
                <div className="p-3">
                  <h3 className="font-semibold text-sm line-clamp-2 leading-relaxed">
                    {video.title}
                  </h3>
                  <p className="text-xs text-muted-foreground mt-1">{video.grade}</p>
                </div>
              </Card>
            )
          })}
        </div>

        {filtered.length === 0 && (
          <div className="text-center py-12 text-muted-foreground">
            لا توجد فيديوهات في هذا الصف
          </div>
        )}
      </div>
    </section>
  )
}
