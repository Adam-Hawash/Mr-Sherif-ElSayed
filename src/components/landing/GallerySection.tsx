'use client'

import { useAppStore } from '@/stores/app-store'
import { Badge } from '@/components/ui/badge'
import { Camera, Trash2, Heart, ImagePlus, PlayCircle, Film, X, Loader2, Maximize, Minimize } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { ProtectedYouTubeModal } from '@/components/student/ProtectedYouTubePlayer'
import Image from 'next/image'
import type { GalleryImage } from '@/stores/app-store'

function ImageWithSkeleton({ src, alt }: { src: string; alt: string }) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  return (
    <div className="w-full h-full">
      {!loaded && !error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <Loader2 className="h-8 w-8 animate-spin text-primary/40" />
        </div>
      )}
      <Image
        src={src}
        alt={alt}
        fill
        className={"object-cover transition-all duration-500 " + (loaded ? 'opacity-100' : 'opacity-0')}
        sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 25vw"
        onLoad={function() { setLoaded(true) }}
        onError={function() { setError(true) }}
      />
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-muted">
          <ImagePlus className="h-8 w-8 text-muted-foreground/30" />
        </div>
      )}
    </div>
  )
}

function getVideoEmbedUrl(url: string) {
  var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/)
  if (yt) return 'https://www.youtube.com/embed/' + yt[1] + '?modestbranding=1&rel=0&playsinline=1'
  var fb = url.match(/facebook\.com\/.*\/videos\/(\d+)/)
  if (fb) return 'https://www.facebook.com/plugins/video.php?href=' + encodeURIComponent(url)
  return url
}

function getVideoThumb(url: string) {
  var yt = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/)
  if (yt) return 'https://img.youtube.com/vi/' + yt[1] + '/mqdefault.jpg'
  return ''
}

export default function GallerySection() {
  var store = useAppStore()
  var siteConfig = store.siteConfig || {}
  var isAdminLoggedIn = store.isAdminLoggedIn || false
  var galleryImages = (store as any).galleryImages || []
  const [images, setImages] = useState<GalleryImage[]>([])
  const [loading, setLoading] = useState(true)
  const [videoModal, setVideoModal] = useState<string | null>(null)

  var galleryTitle =
    siteConfig.gallery_title ||
    'معرض الصور لطلابي وأبنائي الأعزاء | Photos of My Beloved Students'
  var gallerySubtitle =
    siteConfig.gallery_subtitle ||
    'لحظات مميزة من رحلتنا التعليمية — Moments from our educational journey'

  useEffect(function() {
    var preloaded = Array.isArray(galleryImages) ? galleryImages : []
    if (preloaded.length > 0) {
      setImages(preloaded)
      setLoading(false)
    } else {
      fetch('/api/gallery')
        .then(function(r) { return r.json() })
        .then(function(d) { setImages(d.images || []); setLoading(false) })
        .catch(function() { setLoading(false) })
    }
  }, [galleryImages])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/gallery/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setImages((prev) => prev.filter((img) => img.id !== id))
      }
    } catch {
      // silently fail
    }
  }

  var onlyImages = images.filter(function(img) { return img.type !== 'video' })
  var onlyVideos = images.filter(function(img) { return img.type === 'video' })
  var imageCount = onlyImages.length
  var videoCount = onlyVideos.length

  // Show placeholder when no items
  if (!loading && images.length === 0) {
    return (
      <section className="py-16 sm:py-20 bg-muted/30" dir="rtl">
        <div className="mx-auto max-w-7xl px-4 sm:px-6">
          <div className="text-center mb-12 space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
              <Camera className="h-4 w-4" />
              <span>المعرض | Gallery</span>
            </div>
            <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
              {galleryTitle}
            </h2>
            <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
              {gallerySubtitle}
            </p>
          </div>
          <div className="max-w-lg mx-auto text-center py-16">
            <div className="mx-auto w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center mb-6">
              <Camera className="h-10 w-10 text-primary/60" />
            </div>
            <h3 className="text-lg font-semibold text-foreground mb-2">
              سيتم عرض صور وفيديوهات طلابي الأبطال هنا
            </h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              لحظات مميزة من رحلتنا التعليمية مع أبنائنا الطلاب الأبطال
            </p>
          </div>
        </div>
      </section>
    )
  }

  return (
    <section className="py-16 sm:py-20 bg-muted/30" dir="rtl">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        {/* Header */}
        <div className="text-center mb-12 space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-4 py-1.5 text-sm font-medium text-primary">
            <Camera className="h-4 w-4" />
            <span>المعرض | Gallery</span>
          </div>
          <h2 className="text-2xl font-bold sm:text-3xl text-foreground">
            {galleryTitle}
          </h2>
          <p className="text-muted-foreground max-w-2xl mx-auto text-sm sm:text-base">
            {gallerySubtitle}
          </p>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl overflow-hidden">
                <div className="w-full h-full animate-pulse bg-gradient-to-br from-muted via-muted-foreground/10 to-muted" />
              </div>
            ))}
          </div>
        ) : (
          <>
            {/* ========== قسم الصور ========== */}
            {imageCount > 0 && (
              <div className="mb-12">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <ImagePlus className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">صور الطلاب | Student Photos</h3>
                    <p className="text-xs text-muted-foreground">{imageCount} صورة</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                  {onlyImages.map((img, index) => (
                    <div
                      key={img.id}
                      className="aspect-square rounded-xl overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-border/50 bg-card"
                    >
                      <div className="relative w-full h-full overflow-hidden">
                        <ImageWithSkeleton
                          src={img.filePath}
                          alt={img.title || 'صورة ' + (index + 1)}
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                        <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                          <p className="text-white text-xs font-medium truncate">
                            {img.title || 'صورة ' + (index + 1)}
                          </p>
                        </div>
                        <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                          <Badge variant="secondary" className="bg-black/40 text-white border-0 text-[10px] backdrop-blur-sm">
                            <Heart className="h-3 w-3 ml-1" />
                            {String(index + 1).padStart(2, '0')}
                          </Badge>
                        </div>
                        {isAdminLoggedIn && (
                          <button
                            onClick={() => handleDelete(img.id)}
                            className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-destructive backdrop-blur-sm z-20"
                            aria-label={'حذف ' + (img.title || 'عنصر')}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ========== قسم الفيديوهات (شورتس) ========== */}
            {videoCount > 0 && (
              <div className="mb-4">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Film className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-foreground">فيديوهات الطلاب | Student Videos</h3>
                    <p className="text-xs text-muted-foreground">{videoCount} فيديو</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                  {onlyVideos.map((img, index) => {
                    var thumb = getVideoThumb(img.videoUrl) || img.filePath || ''
                    return (
                      <div
                        key={img.id}
                        className="aspect-[9/16] rounded-xl overflow-hidden group hover:shadow-lg transition-all duration-300 hover:-translate-y-1 border border-border/50 bg-card cursor-pointer"
                        onClick={function() { setVideoModal(img.videoUrl) }}
                      >
                        <div className="relative w-full h-full overflow-hidden">
                          {thumb ? (
                            <Image
                              src={thumb}
                              alt={img.title || 'فيديو ' + (index + 1)}
                              fill
                              className="object-cover"
                              sizes="(max-width: 640px) 50vw, (max-width: 768px) 33vw, (max-width: 1024px) 25vw, 20vw"
                              unoptimized
                              loading="eager"
                              fetchPriority="high"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Film className="h-10 w-10 text-muted-foreground/30" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-black/20 group-hover:bg-black/30 transition-colors" />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none" />
                          <div className="absolute bottom-0 left-0 right-0 p-3 translate-y-4 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none">
                            <p className="text-white text-xs font-medium truncate">
                              {img.title || 'فيديو ' + (index + 1)}
                            </p>
                          </div>
                          <div className="absolute top-3 left-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none">
                            <Badge variant="secondary" className="bg-primary/80 text-white border-0 text-[10px] backdrop-blur-sm">
                              <Film className="h-3 w-3 ml-1" />
                              فيديو
                            </Badge>
                          </div>
                          <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center shadow-xl group-hover:scale-110 transition-transform">
                              <PlayCircle className="h-6 w-6 text-primary ml-0.5" />
                            </div>
                          </div>
                          {isAdminLoggedIn && (
                            <button
                              onClick={function(e) { e.stopPropagation(); handleDelete(img.id) }}
                              className="absolute top-3 right-3 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg bg-destructive/90 text-white opacity-0 group-hover:opacity-100 transition-all duration-300 hover:bg-destructive backdrop-blur-sm z-20"
                              aria-label={'حذف ' + (img.title || 'عنصر')}
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}
          </>
        )}

        {/* Stats */}
        {!loading && images.length > 0 && (
          <div className="flex items-center justify-center gap-4 mt-8 text-muted-foreground text-sm">
            <span className="flex items-center gap-1.5"><ImagePlus className="h-4 w-4" />{imageCount} صورة</span>
            {videoCount > 0 && <span className="flex items-center gap-1.5"><Film className="h-4 w-4" />{videoCount} فيديو</span>}
            <span>— {images.length} عنصر</span>
          </div>
        )}
      </div>

      {/* Video Modal */}
      {videoModal && (
        <GalleryVideoModal url={videoModal} onClose={function() { setVideoModal(null) }} />
      )}
    </section>
  )
}

/* ========== Gallery Video Modal (بدون 3-dot menu / بدون تحميل) ========== */
function GalleryVideoModal({ url, onClose }: { url: string; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const progressRef = useRef<HTMLDivElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [buffered, setBuffered] = useState(0)
  const [showControls, setShowControls] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const hideTimerRef = useRef<any>(null)

  useEffect(function() {
    var onFsChange = function() {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    document.addEventListener('webkitfullscreenchange', onFsChange)
    return function() {
      document.removeEventListener('fullscreenchange', onFsChange)
      document.removeEventListener('webkitfullscreenchange', onFsChange)
    }
  }, [])

  var ytId = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]+)/)
  var isYouTube = !!ytId
  var isDirectVideo = !isYouTube && /\.(mp4|webm|mov|avi|ogg)(\?|$)/i.test(url)

  useEffect(function() {
    if (playing) {
      hideTimerRef.current = setTimeout(function() { setShowControls(false) }, 3000)
    } else {
      setShowControls(true)
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current)
    }
    return function() { if (hideTimerRef.current) clearTimeout(hideTimerRef.current) }
  }, [playing, showControls])

  /* YouTube → protected player (no branding, no captions, quality gear,
     click-catch overlay) — same component used in the student portal.
     Placed AFTER all hooks to respect the rules of hooks. */
  if (isYouTube && ytId) {
    return (
      <ProtectedYouTubeModal
        ytId={ytId[1]}
        onClose={onClose}
      />
    )
  }

  var togglePlay = function(e?: React.MouseEvent | React.TouchEvent) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    var v = videoRef.current
    if (!v) return
    if (v.paused) { v.play().catch(function(){}) } else { v.pause() }
  }

  var handleTimeUpdate = function() {
    var v = videoRef.current
    if (!v) return
    setCurrentTime(v.currentTime)
    if (v.buffered.length > 0 && v.duration > 0) {
      setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100)
    }
  }

  var handleSeek = function(e: React.MouseEvent | React.TouchEvent) {
    var bar = progressRef.current
    var v = videoRef.current
    if (!bar || !v || !v.duration) return
    var rect = bar.getBoundingClientRect()
    var clientX = 'touches' in e ? e.changedTouches[0].clientX : (e as React.MouseEvent).clientX
    var ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    v.currentTime = ratio * v.duration
  }

  var handleFullscreen = function(e: React.MouseEvent | React.TouchEvent) {
    if (e) { e.preventDefault(); e.stopPropagation() }
    // لو Already في fullscreen → خرج
    if (document.fullscreenElement) { document.exitFullscreen().catch(function(){}) ; return }
    if ((document as any).webkitFullscreenElement) { (document as any).webkitExitFullscreen() ; return }
    if (isYouTube) {
      var container = document.getElementById('gallery-modal-container')
      if (container) { (container as any).requestFullscreen && (container as any).requestFullscreen().catch(function(){}) }
      return
    }
    var v = videoRef.current
    if (!v) return
    v.play().then(function() {
      var vv = v as any
      if (vv.webkitEnterFullscreen) { vv.webkitEnterFullscreen() }
      else if (vv.parentElement && vv.parentElement.requestFullscreen) { vv.parentElement.requestFullscreen().catch(function(){}) }
      else if (vv.requestFullscreen) { vv.requestFullscreen().catch(function(){}) }
    }).catch(function(){})
  }

  var formatTime = function(sec: number) {
    if (!sec || !isFinite(sec)) return '0:00'
    var m = Math.floor(sec / 60)
    var s = Math.floor(sec % 60)
    return m + ':' + String(s).padStart(2, '0')
  }

  var progressPercent = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      id="gallery-modal-container"
      className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-4"
      onClick={onClose}
      onContextMenu={function(e) { e.preventDefault() }}
    >
      {/* زرار إغلاق — ثابت في أعلى يمين الشاشة */}
      <button
        className="fixed top-4 right-4 z-[200] min-h-[48px] min-w-[48px] rounded-full bg-white/20 hover:bg-white/30 active:bg-white/40 backdrop-blur-sm flex items-center justify-center text-white transition-colors"
        onClick={function(e) { e.stopPropagation(); onClose() }}
        onTouchEnd={function(e) { e.preventDefault(); e.stopPropagation(); onClose() }}
      >
        <X className="h-6 w-6" />
      </button>

      <div className="relative w-full max-w-5xl aspect-video" onClick={function(e) { e.stopPropagation() }}>

        {isYouTube ? (
          <iframe
            src={"https://www.youtube.com/embed/" + (ytId ? ytId[1] : '') + "?modestbranding=1&rel=0&playsinline=1&controls=0&showinfo=0&iv_load_policy=3&autoplay=1"}
            className="w-full h-full rounded-xl"
            allow="accelerometer; autoplay; encrypted-media; gyroscope"
            allowFullScreen
          />
        ) : isDirectVideo ? (
          <div
            className="w-full h-full relative select-none rounded-xl overflow-hidden bg-black"
            onClick={togglePlay}
            onTouchStart={function() { setShowControls(true) }}
          >
            <video
              ref={videoRef}
              className="w-full h-full object-contain"
              src={url}
              preload="metadata"
              playsInline
              disablePictureInPicture
              disableRemotePlayback
              autoPlay
              onPlay={function() { setPlaying(true) }}
              onPause={function() { setPlaying(false) }}
              onTimeUpdate={handleTimeUpdate}
              onEnded={function() { setPlaying(false); setShowControls(true) }}
              onLoadedMetadata={function() { if (videoRef.current) setDuration(videoRef.current.duration) }}
            />

            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                <div className="w-16 h-16 rounded-full bg-white/90 flex items-center justify-center shadow-2xl">
                  <svg className="h-8 w-8 text-gray-800" style={{ marginLeft: '3px' }} fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z"/>
                  </svg>
                </div>
              </div>
            )}

            <div
              className={
                'absolute bottom-0 left-0 right-0 z-20 transition-opacity duration-300 ' +
                (showControls || !playing ? 'opacity-100' : 'opacity-0 pointer-events-none')
              }
              onClick={function(e) { e.stopPropagation() }}
            >
              <div
                ref={progressRef}
                className="w-full h-1.5 bg-white/30 cursor-pointer group"
                onClick={handleSeek}
                onTouchEnd={function(e) { e.preventDefault(); e.stopPropagation(); handleSeek(e) }}
              >
                <div className="absolute top-0 left-0 h-full bg-white/40 pointer-events-none" style={{ width: buffered + '%' }} />
                <div className="absolute top-0 left-0 h-full bg-primary group-hover:h-2 transition-all pointer-events-none" style={{ width: progressPercent + '%' }} />
              </div>
              <div className="flex items-center gap-1 px-4 py-3 bg-gradient-to-t from-black/80 to-transparent">
                <button className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0" onClick={togglePlay} onTouchEnd={function(e) { e.preventDefault(); e.stopPropagation(); togglePlay() }}>
                  {playing ? (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  ) : (
                    <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                  )}
                </button>
                <span className="text-white text-sm tabular-nums" dir="ltr">{formatTime(currentTime)} / {formatTime(duration)}</span>
                <button className="w-10 h-10 flex items-center justify-center text-white hover:text-primary transition-colors shrink-0" onClick={handleFullscreen} onTouchEnd={function(e) { e.preventDefault(); e.stopPropagation(); handleFullscreen(e) }}>
                  {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        ) : (
          <iframe
            src={getVideoEmbedUrl(url)}
            className="w-full h-full rounded-xl"
            allowFullScreen
            allow="autoplay; encrypted-media; fullscreen"
          />
        )}
      </div>
    </div>
  )
}
