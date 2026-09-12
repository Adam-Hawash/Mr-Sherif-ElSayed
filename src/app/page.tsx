'use client'

import { useAppStore } from '@/stores/app-store'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { StudentPendingView } from '@/components/landing/StudentPendingView'
import { StudentPaymentView } from '@/components/landing/StudentPaymentView'
import { LoginView, RegisterView } from '@/components/landing/AuthPages'
import dynamic from 'next/dynamic'
import { useEffect, useState, useRef } from 'react'
import { GraduationCap, Loader2 } from 'lucide-react'

const HeroSection = dynamic(() => import('@/components/landing/HeroSection'), {
  loading: () => <div className="min-h-[70vh] bg-background" />,
})
const FeaturesGuideSection = dynamic(() => import('@/components/landing/FeaturesGuideSection'), {
  loading: () => <div className="h-20" />,
})
const FeaturesSection = dynamic(() => import('@/components/landing/FeaturesSection').then(function(m) { return { default: m.FeaturesSection } }), {
  loading: () => <div className="h-20" />,
})
const GradesSection = dynamic(() => import('@/components/landing/GradesSection').then(function(m) { return { default: m.GradesSection } }), {
  loading: () => <div className="h-20" />,
})
/* (2026-و29) قسم الأوائل اتشال من الصفحة الرئيسية بطلب المستر — بقى زرار
   «أوائل الطلبة» في النافبار يفتح دايلوج بأول 3 طلاب (TopStudentsDialog) */
const TipsSection = dynamic(() => import('@/components/landing/TipsSection'), {
  loading: () => <div className="h-20" />,
})
const GallerySection = dynamic(() => import('@/components/landing/GallerySection'), {
  loading: () => <div className="h-20" />,
})
const LessonsSection = dynamic(() => import('@/components/landing/LessonsSection'), {
  loading: () => <div className="h-20" />,
  ssr: false,
})
const WhatsAppButton = dynamic(() => import('@/components/landing/WhatsAppButton').then(m => ({ default: m.WhatsAppButton })), {
  ssr: false,
})
const FloatingLoginButton = dynamic(() => import('@/components/landing/FloatingLoginButton').then(function(m) { return { default: m.FloatingLoginButton } }), {
  ssr: false,
})
const VideoProtection = dynamic(() => import('@/components/landing/VideoProtection').then(m => ({ default: m.VideoProtection })), {
  ssr: false,
})
const StudentPortal = dynamic(() => import('@/components/student/StudentPortal').then(m => ({ default: (m as any).default || m.StudentPortal })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})
const AdminDashboard = dynamic(() => import('@/components/admin/AdminDashboard').then(m => ({ default: (m as any).default || m.AdminDashboard })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})

// Minimum loading screen duration (ms)
var MIN_LOADING_MS = 2000
// Maximum loading screen duration - force show content even if APIs fail (ms)
var MAX_LOADING_MS = 5000

export default function HomePage() {
  var store = useAppStore()
  var currentView = store.currentView || 'landing'
  var setGalleryImages = (store as any).setGalleryImages || function(){}
  var siteConfig = store.siteConfig || {}
  var configLoaded = store.configLoaded
  var setSiteConfig = store.setSiteConfig
  var setConfigLoaded = store.setConfigLoaded
  var setStats = store.setStats

  const [appReady, setAppReady] = useState(false)
  const startTimeRef = useRef(Date.now())

  // Load config + gallery + stats on mount
  useEffect(function() {
    var dataReady = false
    var minTimerDone = false

    // Minimum display timer - ensures loading screen shows for at least 2s
    var minTimer = setTimeout(function() {
      minTimerDone = true
      if (dataReady) setAppReady(true)
    }, MIN_LOADING_MS)

    // Safety timer - force show content after 5s no matter what
    var maxTimer = setTimeout(function() {
      setAppReady(true)
    }, MAX_LOADING_MS)

    Promise.all([
      fetch('/api/config').then(function(r) { return r.json() }).catch(function() { return {} }),
      fetch('/api/gallery').then(function(r) { return r.json() }).catch(function() { return {} }),
      fetch('/api/stats').then(function(r) { return r.json() }).catch(function() { return {} }),
    ]).then(function(results) {
      var cfg = results[0]
      var gal = results[1]
      var sta = results[2]
      if (cfg && cfg.error && cfg.defaults) {
        cfg = cfg.defaults
      }
      if (cfg && !configLoaded) {
        setSiteConfig(cfg)
        setConfigLoaded(true)
      }
      if (gal && gal.images) {
        setGalleryImages(gal.images)
      }
      if (sta && sta.totalStudents !== undefined) {
        setStats(sta)
      }
      dataReady = true
      if (minTimerDone) {
        clearTimeout(maxTimer)
        setAppReady(true)
      }
    })

    return function() {
      clearTimeout(minTimer)
      clearTimeout(maxTimer)
    }
  }, [])

  const showFooter = currentView === 'landing'
  const showWhatsApp = currentView === 'landing' || currentView === 'auth-login' || currentView === 'auth-register'

  // Full-page loading screen
  if (!appReady) {
    return (
      <div className="fixed inset-0 z-[9999] bg-background flex flex-col items-center justify-center gap-6">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full bg-[#EA580C]/10 blur-xl" />
          <div className="relative w-20 h-20 rounded-2xl bg-muted border border-[#EA580C]/30 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-[#C2410C] dark:text-[#FB923C]" />
          </div>
        </div>
        <div className="text-center space-y-3">
          <h1 className="text-2xl font-bold text-foreground tracking-wide" dir="ltr">
            <span className="shine-text">Mr. Sherif ElSayed</span>
          </h1>
          <div className="flex items-center gap-3 justify-center" dir="ltr">
            <Loader2 className="h-4 w-4 animate-spin text-[#EA580C]" />
            <p className="text-muted-foreground text-sm">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col">
      <VideoProtection />
      <Navbar />

      {currentView === 'landing' && (
        <main className="flex-1">
          <HeroSection />
          <FeaturesGuideSection />
          <FeaturesSection />
          <GradesSection />
          {/* (2026-و29) أفضل 3 طلاب بقوا في النافبار (زرار أوائل الطلبة) بدل الرئيسية */}
          <LessonsSection />
          <TipsSection />
          <GallerySection />
        </main>
      )}

      {currentView === 'auth-login' && (
        <main className="flex-1">
          <LoginView />
        </main>
      )}

      {currentView === 'auth-register' && (
        <main className="flex-1">
          <RegisterView />
        </main>
      )}

      {currentView === 'student-pending' && <StudentPendingView />}
      {currentView === 'student-portal' && <StudentPortal />}
      {currentView === 'student-payment' && <StudentPaymentView />}
      {currentView === 'admin-dashboard' && <AdminDashboard />}

      {showFooter && <Footer />}
      {showWhatsApp && <WhatsAppButton />}
      {showWhatsApp && <FloatingLoginButton />}
    </div>
  )
}
