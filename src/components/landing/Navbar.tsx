'use client'

import { useState, useSyncExternalStore } from 'react'
import Image from 'next/image'
import { useTheme } from 'next-themes'
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
  Sun,
  Moon,
  LogOut,
  UserPlus,
  LogIn,
  Menu,
  X,
  Loader2,
  LayoutDashboard,
  Shield,
  Youtube,
} from 'lucide-react'
import { toast } from 'sonner'

export function Navbar() {
  const { theme, setTheme } = useTheme()
  const emptySubscribe = () => () => {}
  const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false)
  const [mobileMenu, setMobileMenu] = useState(false)

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
  /* البروفايل: صورة المستر الافتراضية (sherif-profile.png) — والأدمن يقدر يغيرها من لوحة التحكم (profile_photo)
     مستقلة تمامًا عن صورة الهيرو (instructor_photo) عشان الصورة الأصلية تفضل زي ما هي */
  const instructorPhoto = cfg.profile_photo || '/images/sherif-profile.png'
  const youtubeLink = cfg.social_youtube || ''
  const navBrand = cfg.navbar_brand || 'منصة مستر شريف السيد'
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
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          {/* Brand - Right side (RTL start) */}
          <button
            onClick={handleGoHome}
            className="flex items-center gap-2 transition-opacity hover:opacity-80 cursor-pointer"
          >
            {instructorPhoto ? (
              <img
                src={instructorPhoto}
                alt="مستر شريف السيد"
                width={36}
                height={36}
                className="h-9 w-9 rounded-lg object-cover border border-primary/30"
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
            {currentStudent ? (
              <div className="flex items-center gap-3">
                <span className="text-sm text-muted-foreground">
                  مرحباً،{' '}
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
                  خروج
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
                  لوحة التحكم
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  خروج
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
                  سجل دخولك
                </Button>
                <Button
                  size="sm"
                  className="min-h-[44px] bg-[#0F3D3E] hover:bg-[#0a2e2f] dark:bg-[#1e3a5f] dark:hover:bg-[#16294a] text-white rounded-xl transition-all duration-200 shadow-sm"
                  onClick={handleRegisterClick}
                >
                  <UserPlus className="h-4 w-4 ml-1" />
                  اعمل حساب
                </Button>
              </>
            )}
          </nav>

          {/* YouTube + Theme Toggle + Mobile Menu Button */}
          <div className="flex items-center gap-2">
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

            {mounted && (
              <Button
                variant="ghost"
                size="icon"
                className="min-h-[44px] min-w-[44px]"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                aria-label="Toggle theme"
              >
                {theme === 'dark' ? (
                  <Sun className="h-5 w-5" />
                ) : (
                  <Moon className="h-5 w-5" />
                )}
              </Button>
            )}

            {/* Mobile Hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden min-h-[44px] min-w-[44px]"
              onClick={() => setMobileMenu(!mobileMenu)}
              aria-label={mobileMenu ? 'إغلاق القائمة' : 'فتح القائمة'}
            >
              {mobileMenu ? (
                <X className="h-5 w-5" />
              ) : (
                <Menu className="h-5 w-5" />
              )}
            </Button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenu && (
          <div className="md:hidden border-t bg-background/95 backdrop-blur-md px-4 py-3 space-y-2">
            {currentStudent ? (
              <>
                <p className="text-sm text-muted-foreground py-2">
                  مرحباً،{' '}
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
                  خروج
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
                  لوحة التحكم
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full min-h-[44px]"
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4 ml-1" />
                  خروج
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
                  سجل دخولك
                </Button>
                <Button
                  size="sm"
                  className="w-full min-h-[44px] bg-[#0F3D3E] hover:bg-[#0a2e2f] dark:bg-[#1e3a5f] dark:hover:bg-[#16294a] text-white rounded-xl transition-all duration-200 shadow-sm"
                  onClick={handleRegisterClick}
                >
                  <UserPlus className="h-4 w-4 ml-1" />
                  اعمل حساب
                </Button>
              </>
            )}
          </div>
        )}
      </header>

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
            تسجيل دخول المشرفين
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="admin-dialog-email" className="text-foreground">
              البريد الإلكتروني
            </Label>
            <Input
              id="admin-dialog-email"
              type="email"
              placeholder="البريد الإلكتروني"
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
              كلمة المرور
            </Label>
            <Input
              id="admin-dialog-password"
              type="password"
              placeholder="كلمة المرور"
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
                جاري تسجيل الدخول...
              </>
            ) : (
              'دخول لوحة التحكم'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
