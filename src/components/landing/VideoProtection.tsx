'use client'

import { useEffect } from 'react'

export function VideoProtection() {
  useEffect(() => {
    // Disable right-click on video elements
    const handleContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'VIDEO' || target.closest('.video-protected')) {
        e.preventDefault()
      }
    }

    // Disable keyboard shortcuts for screen recording and developer tools on videos
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'VIDEO' || target.closest('.video-protected')) {
        // Block: Ctrl+Shift+I (dev tools), Ctrl+Shift+S (save), Ctrl+S (save), Ctrl+U (view source)
        // Block: PrintScreen, F12
        if (
          e.key === 'F12' ||
          (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'S' || e.key === 's' || e.key === 'C' || e.key === 'c')) ||
          (e.ctrlKey && (e.key === 's' || e.key === 'S' || e.key === 'u' || e.key === 'U')) ||
          e.key === 'PrintScreen'
        ) {
          e.preventDefault()
          e.stopPropagation()
          return false
        }
      }
    }

    // Disable drag on images and videos
    const handleDragStart = (e: DragEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'VIDEO' || target.tagName === 'IMG' || target.closest('.video-protected')) {
        e.preventDefault()
      }
    }

    // Blur content on tab/window visibility change (anti-screen capture)
    const handleVisibilityChange = () => {
      const videos = document.querySelectorAll('video.video-protected')
      if (document.hidden) {
        videos.forEach((v) => { (v as HTMLVideoElement).pause() })
      }
    }

    document.addEventListener('contextmenu', handleContextMenu, true)
    document.addEventListener('keydown', handleKeyDown, true)
    document.addEventListener('dragstart', handleDragStart, true)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      document.removeEventListener('contextmenu', handleContextMenu, true)
      document.removeEventListener('keydown', handleKeyDown, true)
      document.removeEventListener('dragstart', handleDragStart, true)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [])

  return null
}
