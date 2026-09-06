'use client'

import { useAppStore } from '@/stores/app-store'
import { Clock, ArrowRight, CreditCard, CheckCircle2, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { useEffect, useState } from 'react'

export function StudentPaymentPendingView() {
  const { setView, logout, currentStudent } = useAppStore()
  const [payments, setPayments] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!currentStudent?.id) return
    const load = async () => {
      try {
        const res = await fetch(`/api/video-access/my-payments?studentId=${currentStudent.id}`)
        const data = await res.json()
        setPayments(data.payments || [])
      } catch {}
      setLoading(false)
    }
    load()
    const interval = setInterval(load, 15000)
    return () => clearInterval(interval)
  }, [currentStudent?.id])

  const methodLabels: Record<string, string> = {
    fawry: 'فوري (Fawry)',
    instapay: 'تحويل بنكي / InstaPay',
    vodafone_cash: 'فودافون كاش (Vodafone Cash)',
  }

  const pendingCount = payments.filter(p => p.status === 'pending').length

  return (
    <div className="flex-1 py-8 px-4">
      <div className="mx-auto max-w-lg space-y-6">
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10">
            <Clock className="h-8 w-8 text-amber-500 animate-pulse" />
          </div>
          <h1 className="text-2xl font-bold">انتظر موافقة الأدمن</h1>
          <p className="text-sm text-muted-foreground">
            تم إرسال إيصال الدفع بنجاح. سيتم مراجعته من قبل الأدمن وسيتم فتح المحتوى فور القبول.
          </p>
          {pendingCount > 0 && (
            <Badge className="bg-amber-500 text-white">{pendingCount} دفعة في الانتظار</Badge>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
          </div>
        ) : payments.length > 0 ? (
          <div className="space-y-3">
            <h3 className="font-semibold text-sm">سجل المدفوعات</h3>
            {payments.map((p) => (
              <Card key={p.id} className="overflow-hidden">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${
                        p.status === 'approved' ? 'bg-emerald-500/10' :
                        p.status === 'rejected' ? 'bg-red-500/10' :
                        'bg-amber-500/10'
                      }`}>
                        {p.status === 'approved' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> :
                         p.status === 'rejected' ? <XCircle className="h-4 w-4 text-red-500" /> :
                         <CreditCard className="h-4 w-4 text-amber-500 animate-pulse" />}
                      </div>
                      <div className="min-w-0 space-y-1">
                        <p className="font-medium text-sm">{p.videoTitle || 'دفع'}</p>
                        <p className="text-xs text-muted-foreground">{methodLabels[p.method] || p.method}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-bold text-primary">{p.amount} جنيه</span>
                          <Badge className={`text-[10px] ${
                            p.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                            p.status === 'rejected' ? 'bg-red-100 text-red-700' :
                            'bg-amber-100 text-amber-700'
                          }`}>
                            {p.status === 'approved' ? 'مقبول - تم فتح المحتوى' :
                             p.status === 'rejected' ? 'مرفوض' : 'في الانتظار'}
                          </Badge>
                        </div>
                        <p className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</p>
                      </div>
                    </div>
                    {p.receiptPath && (
                      <a href={p.receiptPath} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline shrink-0">
                        عرض الوصل
                      </a>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <p className="text-center text-sm text-muted-foreground py-4">لا توجد مدفوعات</p>
        )}

        <div className="flex gap-3 justify-center">
          <Button variant="outline" onClick={() => setView('student-portal')}>
            <ArrowRight className="h-4 w-4 ml-1" />
            العودة للبوابة
          </Button>
          <Button variant="ghost" onClick={logout}>تسجيل خروج</Button>
        </div>
      </div>
    </div>
  )
}
