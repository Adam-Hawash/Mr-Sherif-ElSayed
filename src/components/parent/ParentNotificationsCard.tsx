'use client'

// ============================================================
// (2026-و87) كارت إشعارات ولي الأمر — جوه بورتال ولي الأمر:
//   - كل إشعار = تسليم امتحان/واجب لابنه بالاسم والدرجة
//   - غير المقروء: خلفية بلون المنصة الخفيف + نص غليظ + بادج «جديد»
//     (اللي بيشوفه ولي الأمر أول ما يفتح البورتال بعد الإشعار الخارجي)
//   - بعد 5 ثواني من العرض بيتعلم مقروء تلقائي زي الواتساب
//     + زرار «تحديد الكل كمقروء» + الضغط على الإشعار بيحيّده لوحده
//   - القايمة محدودة بآخر 50 من السيرفر — سكرول أنيق
// ============================================================

import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { BellRing, CheckCheck, Loader2, MessageSquareText } from 'lucide-react'

interface ParentNotificationRow {
  id: number
  studentName: string
  message: string
  isRead: number
  createdAt: string
}

/* وقت نسبي مصري — «الآن / من 5 دقايق / من ساعتين / التاريخ */
function relTimeAr(iso: string): string {
  try {
    var d = new Date(String(iso || ''))
    if (isNaN(d.getTime())) return ''
    var diff = Date.now() - d.getTime()
    var m = Math.floor(diff / 60000)
    if (m < 1) return 'الآن'
    if (m < 60) return 'من ' + m + (m === 1 ? ' دقيقة' : m === 2 ? ' دقيقتين' : m <= 10 ? ' دقايق' : ' دقيقة')
    var h = Math.floor(m / 60)
    if (h < 24) return 'من ' + h + (h === 1 ? ' ساعة' : h === 2 ? ' ساعتين' : h <= 10 ? ' ساعات' : ' ساعة')
    return d.toLocaleDateString('ar-EG', { day: 'numeric', month: 'long' }) + ' — ' + d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })
  } catch (e) {
    return ''
  }
}

export default function ParentNotificationsCard({ parentId }: { parentId: string }) {
  var rowsState = useState<ParentNotificationRow[]>([])
  var rows = rowsState[0]
  var setRows = rowsState[1]
  var ldState = useState(true)
  var loading = ldState[0]
  var setLoading = ldState[1]
  var mkState = useState(false)
  var marking = mkState[0]
  var setMarking = mkState[1]

  var load = useCallback(async function () {
    if (!parentId) return
    setLoading(true)
    try {
      var res = await fetch('/api/parent/notifications?parentId=' + encodeURIComponent(parentId), { cache: 'no-store' })
      var json = await res.json()
      if (res.ok && json && json.ok) setRows(Array.isArray(json.notifications) ? json.notifications : [])
    } catch (e) {}
    setLoading(false)
  }, [parentId])

  useEffect(function () { load() }, [load])

  var markRead = useCallback(async function (id: number | null, silent: boolean) {
    if (!parentId) return
    if (!silent) setMarking(true)
    try {
      await fetch('/api/parent/notifications', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { parentId: parentId, id: id } : { parentId: parentId, all: true }),
      })
    } catch (e) {}
    setRows(function (prev) {
      return prev.map(function (r) {
        if (id === null || r.id === id) return Object.assign({}, r, { isRead: 1 })
        return r
      })
    })
    if (!silent) setMarking(false)
  }, [parentId])

  /* تعليم تلقائي كمقروء بعد 5 ثواني من العرض — زي فتح الشات في الواتساب */
  var hasUnread = false
  for (var hi = 0; hi < rows.length; hi++) { if (!rows[hi].isRead) { hasUnread = true; break } }
  useEffect(function () {
    if (!hasUnread) return
    var to = setTimeout(function () { markRead(null, true) }, 5000)
    return function () { clearTimeout(to) }
  }, [hasUnread, markRead, rows])

  var unread = 0
  for (var ui = 0; ui < rows.length; ui++) { if (!rows[ui].isRead) unread++ }

  return (
    <Card className="border-primary/20">
      <CardContent className="p-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="relative shrink-0 h-9 w-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <BellRing className="h-4.5 w-4.5 text-primary" />
              {unread > 0 && (
                <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center" aria-label={unread + ' إشعار جديد'}>
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-bold text-foreground">إشعاراتك</h2>
              <p className="text-[11px] text-muted-foreground">درجات أبنائك لحظة تسليم الامتحان أو الواجب</p>
            </div>
          </div>
          {unread > 0 && (
            <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs shrink-0" onClick={function () { markRead(null, false) }} disabled={marking}>
              {marking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCheck className="h-3.5 w-3.5" />}
              تحديد الكل كمقروء
            </Button>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-6 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-xs">جاري تحميل الإشعارات…</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-6 text-center">
            <MessageSquareText className="mx-auto mb-2 h-5 w-5 text-muted-foreground/60" />
            <p className="text-sm text-muted-foreground">مفيش إشعارات لسه — أول ما ابنك يسلّم امتحان أو واجب هيظهرلك إشعار هنا بالدرجة</p>
          </div>
        ) : (
          <div className="custom-scrollbar max-h-96 space-y-2 overflow-y-auto pr-1">
            {rows.map(function (r) {
              var unreadRow = !r.isRead
              return (
                <div
                  key={r.id}
                  role={unreadRow ? 'button' : undefined}
                  tabIndex={unreadRow ? 0 : undefined}
                  aria-label={unreadRow ? 'تعليم الإشعار كمقروء' : undefined}
                  onClick={unreadRow ? function () { markRead(r.id, false) } : undefined}
                  onKeyDown={unreadRow ? function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); markRead(r.id, false) } } : undefined}
                  className={'rounded-xl border px-3.5 py-3 transition-colors ' + (unreadRow ? 'border-primary/30 bg-primary/10 cursor-pointer hover:bg-primary/15' : 'border-border bg-card')}
                >
                  <div className="flex items-start gap-2.5">
                    <span className={'mt-1.5 h-2 w-2 shrink-0 rounded-full ' + (unreadRow ? 'bg-primary' : 'bg-muted-foreground/25')} aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className={'whitespace-pre-line break-words text-[13px] leading-relaxed ' + (unreadRow ? 'font-bold text-foreground' : 'text-muted-foreground')}>{r.message}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground/80">{relTimeAr(r.createdAt)}</span>
                        {unreadRow && (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-[9px] font-bold text-primary-foreground">جديد</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
