'use client'

import { useAppStore } from '@/stores/app-store'
import { LogIn } from 'lucide-react'
import { useState, useEffect } from 'react'

export function FloatingLoginButton() {
  var store = useAppStore()
  var setView = store.setView
  var currentView = store.currentView
  var [mounted, setMounted] = useState(false)

  useEffect(function() {
    setMounted(true)
  }, [])

  if (!mounted) return null
  if (currentView !== 'landing') return null

  return (
    <button
      onClick={function() { setView('auth-login') }}
      className="fixed bottom-[5.5rem] right-5 z-50 flex items-center gap-1.5 h-10 px-4 rounded-full bg-[#2563EB] text-white shadow-lg hover:shadow-xl hover:scale-105 active:scale-95 transition-all duration-300 text-xs font-semibold"
      aria-label="تسجيل الدخول"
    >
      <LogIn className="h-3.5 w-3.5" />
      <span>تسجيل الدخول</span>
    </button>
  )
}
