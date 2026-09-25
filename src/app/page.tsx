'use client'

import { useAppStore } from '@/stores/app-store'
import { Navbar } from '@/components/landing/Navbar'
import { Footer } from '@/components/landing/Footer'
import { StudentPendingView } from '@/components/landing/StudentPendingView'
import { StudentPaymentView } from '@/components/landing/StudentPaymentView'
import { LoginView, RegisterView } from '@/components/landing/AuthPages'
import dynamic from 'next/dynamic'
import { useEffect, useState, useRef } from 'react'
import { PlatformLoader } from '@/components/PlatformLoader'

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
const ParentPortal = dynamic(() => import('@/components/parent/ParentPortal').then(m => ({ default: (m as any).ParentPortal })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})
const ParentLoginView = dynamic(() => import('@/components/parent/ParentAuthPages').then(m => ({ default: m.ParentLoginView })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})
const ParentRegisterView = dynamic(() => import('@/components/parent/ParentAuthPages').then(m => ({ default: m.ParentRegisterView })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})
const AdminDashboard = dynamic(() => import('@/components/admin/AdminDashboard').then(m => ({ default: (m as any).default || m.AdminDashboard })), {
  loading: () => <div className="flex items-center justify-center py-20"><div className="animate-spin h-8 w-8 border-2 border-primary border-t-transparent rounded-full" /></div>,
})

// Minimum loading screen duration (ms)
// (2026-و30) طلب المستر: «لما يجي يدخل الطفل الأولاني بيقعد وقت — سرّعه»
// كان 2000ms انتظار إجباري حتى لو البيانات وصلت — بقى 600ms بس (نفس
// الوظيفة: منع وميض المحتوى غير المُبراند) والدخول بقى فوري تقريبًا
var MIN_LOADING_MS = 600
// Maximum loading screen duration - force show content even if APIs fail (ms)
// (2026-و30) كان 5000 — بقى 3000 عشان البوابة ماتعلقش على API بطيء
var MAX_LOADING_MS = 3000

export default function HomePage() {
  var store = useAppStore()
  var currentView = store.currentView || 'landing'
  var setGalleryImages = (store as any).setGalleryImages || function(){}
  var siteConfig = store.siteConfig || {}
  var configLoaded = store.configLoaded
  var setSiteConfig = store.setSiteConfig
  var setConfigLoaded = store.setConfigLoaded
  var setStats = store.setStats

  /* (و98) تسخين صورة المستر — «الصورة تتحمل في الحتة الأولى» (شاشة التحميل):
     بنبدأ تحميل الصورة فورًا من الكونفيج المُحقون سيرفر سايد + بعد وصول
     الكونفيج — بدل ما تظهر متأخرة ~5 ثواني بعد الهيدريشن */
  var preloadPhoto = function(url: any) {
    try {
      var u = String(url || '')
      if (!u || typeof window === 'undefined') return
      var im = new Image()
      im.src = u
    } catch (e) {}
  }

  const [appReady, setAppReady] = useState(false)
  const startTimeRef = useRef(Date.now())

  /* ===== (2026-و39) مفيش استرجاع جلسة تلقائي — طلب المستر الحرفي:
     «الطالب اللي يفتح منصة يفتح عليه على الصفحة الرئيسية اللي فيها صورة
     المستر والحاجات دي وهو يعمل تسجيل دخول بنفسه — ونفس الكلام لولي الأمر».
     الفتح دايمًا على الرئيسية (landing) والدخول يدوي كل مرة.
     mg_student/mg_parent بتتكتب عند الدخول عشان باقي الواجهات تستخدمها
     جوه الجلسة، بس مش بترجّع حد لأي بورتال لوحده.
     حماية شاشة الحل (و38: mg_active_solve + المسودات) شغالة زي ما هي
     وبتتفعل بعد الدخول اليدوي. */

  // Load config + gallery + stats on mount
  useEffect(function() {
    /* (2026-و88) لينك إشعار ولي الأمر الخارجي (واتساب/SMS) بييجي بالشكل
       /#parent-login — أول ما الصفحة تفتح بننتقل على طول لشاشة تسجيل
       دخول ولي الأمر (نفس تدفق المستر: «يدوس على الإشعار من بره → يفتحه
       على صفحة تسجيل الدخول → يسجل دخول → يشوف الإشعار جوه المنصة»)
       (2026-و89) لوولي الأمر لسه مسجل جوه الجلسة → ندخله بورتاله على طول */
    try {
      var h = String(window.location.hash || '').replace('#', '')
      if (h === 'parent-login') {
        var par = (store as any).currentParent
        ;(store as any).setView && (store as any).setView(par && par.id ? 'parent-portal' : 'parent-login')
        if (window.history && window.history.replaceState) window.history.replaceState(null, '', window.location.pathname)
      }
    } catch (eHash) {}

    /* (2026-و89) Service Worker إشعارات ولي الأمر — تسجيل + استقبال ضغطة
       الإشعار الخارجي (بره على شاشة الموبايل): لو المنصة مفتوحة بالفعل
       والـ SW ركّز النافذة، بنوجّه الصفحة: مسجل دخول → بورتال الإشعارات،
       غير كده → شاشة تسجيل دخول ولي الأمر (نفس تدفق المستر) */
    try {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(function () {})
        navigator.serviceWorker.addEventListener('message', function (ev: MessageEvent) {
          var d: any = ev && ev.data ? ev.data : null
          if (!d || d.type !== 'parent-notification-click') return
          try {
            var st = (store as any)
            if (st.currentParent && st.currentParent.id) st.setView && st.setView('parent-portal')
            else st.setView && st.setView('parent-login')
          } catch (eSwp) {}
        })
      }
    } catch (eSw) {}

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
      /* (و98) لو صورة الكونفيج المُحقون مختلفة — سخّنها برضه */
      try {
        preloadPhoto((cfg as any).instructor_photo)
      } catch (ePc) {}
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

  // (2026-و95) لودر رموز الرياضيات الموحد
  if (!appReady) {
    return <PlatformLoader variant="full" />
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

      {/* (2026-و37) شاشات ولي الأمر */}
      {currentView === 'parent-login' && (
        <main className="flex-1">
          <ParentLoginView />
        </main>
      )}
      {currentView === 'parent-register' && (
        <main className="flex-1">
          <ParentRegisterView />
        </main>
      )}
      {currentView === 'parent-portal' && <ParentPortal />}

      {showFooter && <Footer />}
      {showWhatsApp && <WhatsAppButton />}
      {showWhatsApp && <FloatingLoginButton />}
    </div>
  )
}
