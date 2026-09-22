'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAppStore } from '@/stores/app-store'
import {
  LogOut,
  UserPlus,
  LogIn,
  Menu,
  X,
  Loader2,
  LayoutDashboard,
  Shield,
  Youtube,
  Trophy,
  Shapes,
  CalendarClock,
} from 'lucide-react'
import { toast } from 'sonner'
/* زراير الثيم واللغة الموحدة في كل المنصة + نظام الترجمة */
import { ThemeToggle, LangToggle } from '@/components/platform-toggles'
import { useT } from '@/lib/i18n'
/* (2026-و29) «أوائل الطلبة» في النافبار — طلب المستر: زرار جنب Geometry
   يفتح دايلوج بأول 3 طلاب — والقسم اتشال من الصفحة الرئيسية */
import { TopStudentsDialog } from './TopStudentsDialog'

export function Navbar() {
  const [mobileMenu, setMobileMenu] = useState(false)
  /* (2026-و29) دايلوج أوائل الطلبة */
  const [topStudentsOpen, setTopStudentsOpen] = useState(false)
  const T = useT()

  const {
    currentView,
    setView,
    showAdminLogin,
    setShowAdminLogin,
    currentStudent,
    currentAdmin,
    isAdminLoggedIn,
    setCurrentAdmin,
    setAdminLoggedIn,
    logout,
    siteConfig,
  } = useAppStore()

  const cfg = siteConfig
  /* (2026-و33) البروفايل: الفولباك = نفس صورة المعلم الأساسية بالظبط (instructor.png نسخة مطابقة
     لصورة الداتابيز) — طلب المستر: «الصورة البديلة تبقى هي نفس الصورة الأساسية لكل منصة»
     والأدمن يقدر يغيرها من لوحة التحكم (profile_photo) */
  const instructorPhoto = cfg.profile_photo || '/images/instructor.png'
  const youtubeLink = cfg.social_youtube || ''
  const navBrand = cfg.navbar_brand || 'Mr. Sherif ElSayed'
  const navSubtitle = cfg.navbar_subtitle || 'الرياضيات بقت أسهل'

  const isAuthenticated = !!currentStudent || isAdminLoggedIn
  const isAuthPage = currentView === 'auth-login' || currentView === 'auth-register'

  const handleLogout = () => {
    logout()
    setMobileMenu(false)
    toast.success('تم تسجيل الخروج بنجاح')
  }

  const handleGoHome = () => {
    if (currentAdmin && isAdminLoggedIn) return
    setView('landing')
    setMobileMenu(false)
  }

  const handleLoginClick = () => {
    setView('auth-login')
    setMobileMenu(false)
  }

  const handleRegisterClick = () => {
    setView('auth-register')
    setMobileMenu(false)
  }

  return (
    <>
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-md">
        {/* (و43) توقيع المطور فوق النافبار — نص عادي بدون أيكونات وبدون لون خاص */}
        {currentView === 'landing' && (
          <div className="w-full border-b border-border/50 bg-background/95">
            <a
              href={cfg.hero_developer_url || 'https://prime-developer-portfolio-11.vercel.app'}
              target="_blank"
              rel="noopener noreferrer"
              title="Developer Portfolio"
              className="flex items-center justify-center py-1.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline underline-offset-2 transition-colors"
            >
              <span dir="ltr">{cfg.footer_made_by_label || 'Developed by Adam Hawash'}</span>
            </a>
          </div>
        )}
        <div className="mx-auto flex h-14 sm:h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand - Right side (RTL start) */}
          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 transition-opacity hover:opacity-80 cursor-pointer shrink-0"
          >
            {instructorPhoto ? (
              <img
                src={instructorPhoto}
                alt="مستر شريف السيد"
                width={36}
                height={36}
                className="h-9 w-9 rounded-xl object-cover border border-primary/40 shadow-sm"
              />
            ) : (
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                <span className="text-xs font-bold">MS</span>
              </div>
            )}
            <div className="hidden sm:block">
              <h1 className="text-sm font-bold leading-tight text-foreground">
                {navBrand}
              </h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                {navSubtitle}
              </p>
            </div>
          </button>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-2">
            {/* (2026-و31) طلب المستر: «ويبقى في الأول أوائل الطلبة» — أوائل الطلبة أول عنصر */}
            <button
              type="button"
              onClick={function () { setTopStudentsOpen(true) }}
              title="أوائل الطلبة — أفضل 3 طلاب"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-bold text-[#EA580C] dark:text-[#FB923C] hover:bg-[#EA580C]/10 transition-colors cursor-pointer"
            >
              <Trophy className="h-4 w-4" />
              {T('أوائل الطلبة', 'Top Students')}
            </button>
            {/* (2026-و31) Geometry Laws — منقول من منصة مستر وائل طبق الأصل «هي هي»
                (طلب المستر: «الـ geometry بالظبط هو هو بتاع منصة مستر وائل») */}
            <a
              href="/geometry-laws"
              title="Geometry Laws — كل قوانين الهندسة: مساحات ومحيطات وحجوم"
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-xl text-sm font-bold text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/10 transition-colors"
            >
              <Shapes className="h-4 w-4" />
              Geometry Laws
            </a>
            {/* (و43) مواعيد السنتر: اتشالت من قايمة الشاشات الكبيرة — موجودة في قايمة الموبايل بس */}
            {currentStudent ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  {T('مرحباً', 'Welcome')},{' '}
                  <span className="font-semibold text-foreground">
                    {currentStudent.name}
                  </span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  {T('خروج', 'Logout')}
                </Button>
              </div>
            ) : isAdminLoggedIn && currentAdmin ? (
              <div className="flex items-center gap-3">
                <Button
                  variant="ghost"
                  size="sm"
                  className="min-h-[44px] text-foreground"
                  onClick={() => setView('admin-dashboard')}
                >
                  <LayoutDashboard className="h-4 w-4 ml-1" />
                  {T('لوحة التحكم', 'Dashboard')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  {T('خروج', 'Logout')}
                </Button>
              </div>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px] bg-card border-border hover:bg-muted text-foreground rounded-xl transition-all duration-200"
                  onClick={handleLoginClick}
                >
                  <LogIn className="h-4 w-4 ml-1" />
                  {T('سجل دخولك', 'Login')}
                </Button>
                <Button
                  size="sm"
                  className="min-h-[44px] bg-[#0F3D3E] hover:bg-[#0a2e2f] dark:bg-[#1e3a5f] dark:hover:bg-[#16294a] text-white rounded-xl transition-all duration-200 shadow-sm"
                  onClick={handleRegisterClick}
                >
                  <UserPlus className="h-4 w-4 ml-1" />
                  {T('اعمل حساب', 'Sign Up')}
                </Button>
              </>
            )}
          </nav>

          {/* YouTube + Theme Toggle + Mobile Menu Button */}
          <div className="flex items-center gap-2">
            {/* (2026-و29) «أوائل الطلبة» في الموبايل فوق — أول عنصر بطلب المستر (و31) */}
            <button
              type="button"
              onClick={function () { setTopStudentsOpen(true) }}
              title="أوائل الطلبة — أفضل 3"
              aria-label="أوائل الطلبة — أفضل 3 طلاب"
              className="md:hidden flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-[#EA580C] dark:text-[#FB923C] bg-[#EA580C]/10 border border-[#EA580C]/40 hover:bg-[#EA580C]/20 transition-colors cursor-pointer"
            >
              <Trophy className="h-4 w-4" />
              <span className="text-[11px] font-bold">{T('الأوائل', 'Top')}</span>
            </button>
            {/* (2026-و31) Geometry جنب الأوائل في الموبايل — زي جينيوس بالظبط */}
            <a
              href="/geometry-laws"
              title="Geometry Laws — قوانين الهندسة"
              aria-label="Geometry Laws — قوانين الهندسة"
              className="md:hidden flex items-center gap-1 min-h-[36px] px-2 rounded-lg text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 hover:bg-emerald-500/20 transition-colors"
            >
              <Shapes className="h-4 w-4" />
              <span dir="ltr" className="text-[11px] font-bold">Geometry</span>
            </a>
            {youtubeLink && (
              <a
                href={youtubeLink}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center min-h-[44px] min-w-[44px] text-muted-foreground hover:text-red-500 transition-colors"
                title="YouTube"
              >
                <Youtube className="h-4 w-4" />
              </a>
            )}

            {/* زرار الثيم الموحد — شمس/قمر في كل المنصة */}
            <ThemeToggle />

            {/* Mobile Hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-9 w-9 min-h-[36px] min-w-[36px]"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label={mobileMenu ? T('إغلاق القائمة', 'Close menu') : T('فتح القائمة', 'Open menu')}
            >
              {mobileMenu ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
            {/* سويتش اللغة EN|عربي — آخر عنصر في طرف النافبار
                (بعد الهامبرجر) وباين على الموبايل والديسكتوب من غير ما تفتح القايمة */}
            <LangToggle />
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenu && (
          <div className="md:hidden border-t bg-background/95 backdrop-blur-md px-4 py-3 space-y-2">
            {/* (2026-و31) أوائل الطلبة — أول عنصر في قايمة الموبايل بطلب المستر */}
            <button
              type="button"
              onClick={function () { setMobileMenu(false); setTopStudentsOpen(true) }}
              className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-[#EA580C]/40 bg-[#EA580C]/10 text-[#EA580C] dark:text-[#FB923C] font-bold text-sm cursor-pointer"
            >
              <Trophy className="h-4 w-4" />
              {T('أوائل الطلبة', 'Top Students')}
            </button>
            {/* (2026-و31) Geometry Laws — منقولة من جينيوس طبق الأصل، ظاهرة للكل */}
            <a
              href="/geometry-laws"
              onClick={() => setMobileMenu(false)}
              className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-bold text-sm"
            >
              <Shapes className="h-4 w-4" />
              Geometry Laws — {T('قوانين الهندسة', 'Geometry Rules')}
            </a>
            {/* (و35) مواعيد السنتر في قايمة الموبايل */}
            <a
              href="/schedule"
              onClick={() => setMobileMenu(false)}
              className="flex items-center gap-2 min-h-[44px] px-3 rounded-xl border border-border bg-muted/40 text-foreground font-bold text-sm"
            >
              <CalendarClock className="h-4 w-4" />
              {T('مواعيد السنتر — جدول الحصص', 'Center Schedule')}
            </a>
            {currentStudent ? (
              <>
                <p className="text-sm text-muted-foreground py-2">
                  {T('مرحباً', 'Welcome')},{' '}
                  <span className="font-semibold text-foreground">
                    {currentStudent.name}
                  </span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  {T('خروج', 'Logout')}
                </Button>
              </>
            ) : isAdminLoggedIn && currentAdmin ? (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full min-h-[44px] justify-start text-foreground"
                  onClick={() => {
                    setView('admin-dashboard')
                    setMobileMenu(false)
                  }}
                >
                  <LayoutDashboard className="h-4 w-4 ml-2" />
                  {T('لوحة التحكم', 'Dashboard')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  {T('خروج', 'Logout')}
                </Button>
              </>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px] bg-card border-border hover:bg-muted text-foreground rounded-xl transition-all duration-200"
                  onClick={handleLoginClick}
                >
                  <LogIn className="h-4 w-4 ml-1" />
                  {T('سجل دخولك', 'Login')}
                </Button>
                <Button
                  size="sm"
                  className="w-full min-h-[44px] bg-[#0F3D3E] hover:bg-[#0a2e2f] dark:bg-[#1e3a5f] dark:hover:bg-[#16294a] text-white rounded-xl transition-all duration-200 shadow-sm"
                  onClick={handleRegisterClick}
                >
                  <UserPlus className="h-4 w-4 ml-1" />
                  {T('اعمل حساب', 'Sign Up')}
                </Button>
              </>
            )}
          </div>
        )}
      </header>

      {/* (2026-و29) دايلوج أوائل الطلبة — أول 3 طلاب */}
      <TopStudentsDialog open={topStudentsOpen} onOpenChange={setTopStudentsOpen} />

      {/* Admin Login Dialog - Hidden Entry Point */}
      <AdminLoginDialog />
    </>
  )
}

function AdminLoginDialog() {
  const {
    showAdminLogin,
    setShowAdminLogin,
    setCurrentAdmin,
    setAdminLoggedIn,
    setView,
  } = useAppStore()
  const T = useT()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')

  const handleLogin = async () => {
    if (!email || !password) {
      toast.error('الرجاء إدخال البريد وكلمة المرور')
      return
    }
    if (loading) return // Prevent double-submit
    setLoading(true)
    setStatusMsg('جاري الاتصال بالسيرفر...')

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s hard timeout

    try {
      setStatusMsg('جاري التحقق من البيانات...')
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
        signal: controller.signal,
      })
      const data = await res.json()
      if (res.ok) {
        setStatusMsg('جاري تحميل لوحة التحكم...')
        setCurrentAdmin(data.admin)
        setAdminLoggedIn(true)
        setShowAdminLogin(false)
        setView('admin-dashboard')
        toast.success('مرحباً بك في لوحة التحكم')
      } else {
        toast.error(data.error || 'خطأ في تسجيل الدخول')
      }
    } catch (err: any) {
      if (err.name === 'AbortError') {
        toast.error('انتهت مهلة الاتصال — حاول مرة أخرى')
      } else {
        toast.error('حدث خطأ في الاتصال')
      }
    } finally {
      clearTimeout(timeout)
      setLoading(false)
      setStatusMsg('')
    }
  }

  return (
    <Dialog open={showAdminLogin} onOpenChange={(open) => { if (!loading) setShowAdminLogin(open) }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-center gap-2 text-lg">
            <Shield className="h-5 w-5 text-primary" />
            {T('تسجيل دخول المشرفين', 'Admin Login')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="admin-dialog-email" className="text-foreground">
              {T('البريد الإلكتروني', 'Email')}
            </Label>
            <Input
              id="admin-dialog-email"
              type="email"
              placeholder={T('البريد الإلكتروني', 'Email')}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
              dir="ltr"
              className="min-h-[44px]"
              disabled={loading}
              autoComplete="email"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="admin-dialog-password" className="text-foreground">
              {T('كلمة المرور', 'Password')}
            </Label>
            <Input
              id="admin-dialog-password"
              type="password"
              placeholder={T('كلمة المرور', 'Password')}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !loading && handleLogin()}
              dir="ltr"
              className="min-h-[44px]"
              disabled={loading}
              autoComplete="current-password"
            />
          </div>
          {statusMsg && (
            <p className="text-xs text-center text-muted-foreground animate-pulse">{statusMsg}</p>
          )}
          <Button
            className="w-full min-h-[44px] font-semibold"
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                {T('جاري تسجيل الدخول...', 'Logging in...')}
              </>
            ) : (
              T('دخول لوحة التحكم', 'Login to Dashboard')
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
