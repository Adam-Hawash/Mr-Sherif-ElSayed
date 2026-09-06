'use client'

import { useAppStore } from '@/stores/app-store'
import { GraduationCap } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function StudentPendingView() {
  const { logout } = useAppStore()

  return (
    <div className="flex-1 flex items-center justify-center p-6">
      <div className="text-center space-y-6 max-w-md">
        <div className="relative inline-block">
          <div className="absolute -inset-6 rounded-full bg-amber-500/10 blur-xl" />
          <div className="relative w-20 h-20 rounded-2xl bg-amber-500/10 flex items-center justify-center">
            <GraduationCap className="h-10 w-10 text-amber-500" />
          </div>
        </div>
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">طلبك قيد المراجعة</h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            تم استلام طلبك بنجاح وجاري مراجعته من قبل الأدمن. اعمل تسجيل دخول في أي وقت وشوف حالة طلبك — لو اتمقبولت هتدخل المنصة على طول.
          </p>
        </div>
        <Button variant="ghost" onClick={logout}>
          تسجيل خروج
        </Button>
      </div>
    </div>
  )
}

