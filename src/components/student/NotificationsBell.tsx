'use client'

// ============================================================
// (2026-و44) NotificationsBell — جرس الإشعارات للطالب
// طلب المستر: «لما الأدمن يرد على الطالب يجيله إشعار إن الشكوى اتحلت …
//   في الكتب والملازم لو اتضافت حاجة يظهر له إشعار … أي حاجة يتضاف
//   تظهر له إشعار للطالب»
// بيدور كل دقيقة على /api/notifications + بادج بالعدد غير المقروء +
// لستة منسدلة (أقصى ارتفاع مع سكرول) + «علّم الكل مقروء».
// ============================================================

import * as React from 'react'
import { Bell, CheckCheck } from 'lucide-react'
import { toast } from 'sonner'

interface NotifItem {
  id: string
  type: string
  title: string
  body: string
  read: boolean
  createdAt: string
}

var TYPE_ICONS: Record<string, string> = {
  complaint_reply: '💬',
  book: '📕',
  exam: '📝',
  homework: '📚',
  announcement: '📣',
  general: '🔔',
}

export function NotificationsBell({ studentId }: { studentId: string }) {
  var openState = React.useState(false)
  var open = openState[0]
  var setOpen = openState[1]
  var itemsState = React.useState<NotifItem[]>([])
  var items = itemsState[0]
  var setItems = itemsState[1]
  var unreadState = React.useState(0)
  var unread = unreadState[0]
  var setUnread = unreadState[1]
  var boxRef = React.useRef<HTMLDivElement | null>(null)

  var load = React.useCallback(async function () {
    if (!studentId) return
    try {
      var res = await fetch('/api/notifications?studentId=' + encodeURIComponent(studentId), { cache: 'no-store' })
      var json = await res.json()
      if (res.ok) {
        setItems(json.notifications || [])
        setUnread(Number(json.unreadCount) || 0)
      }
    } catch (e) { /* صامت — الإشعارات مش سبب لكسر حاجة */ }
  }, [studentId])

  React.useEffect(function () {
    if (!studentId) return
    load()
    var t = setInterval(load, 60000)
    return function () { clearInterval(t) }
  }, [studentId, load])

  /* اقفال المنسدلة بالضغط بره */
  React.useEffect(function () {
    if (!open) return
    var onDoc = function (e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return function () { document.removeEventListener('mousedown', onDoc) }
  }, [open])

  var markAll = async function () {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId: studentId, action: 'read-all' }),
      })
      setItems(function (prev) { return prev.map(function (n) { return Object.assign({}, n, { read: true }) }) })
      setUnread(0)
      toast.success('تمام — كل الإشعارات اتقريت ✓')
    } catch (e) { /* صامت */ }
  }

  if (!studentId) return null

  return (
    <div className="relative" ref={boxRef}>
      <button
        type="button"
        onClick={function () { setOpen(!open); if (!open) load() }}
        className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg hover:bg-muted transition-colors cursor-pointer"
        aria-label={'الإشعارات' + (unread > 0 ? ' — عندك ' + unread + ' إشعار جديد' : '')}
      >
        <Bell className="h-4.5 w-4.5" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -left-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute left-0 top-full mt-2 z-50 w-[min(92vw,360px)] rounded-xl border border-border bg-card shadow-xl overflow-hidden">
          <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-border bg-muted/40">
            <p className="text-xs font-bold">الإشعارات {unread > 0 ? '(' + unread + ' جديد)' : ''}</p>
            {unread > 0 && (
              <button type="button" onClick={markAll} className="text-[11px] font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer">
                <CheckCheck className="h-3.5 w-3.5" /> علّم الكل مقروء
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto custom-scrollbar">
            {items.length === 0 ? (
              <p className="text-xs text-muted-foreground text-center py-6">مفيش إشعارات لسه — أول ما المستر يبعت حاجة هتلاقيها هنا</p>
            ) : (
              items.map(function (n: NotifItem) {
                return (
                  <div key={n.id} className={'px-3 py-2.5 border-b border-border/60 last:border-0 ' + (n.read ? 'opacity-70' : 'bg-primary/5')}>
                    <div className="flex items-start gap-2">
                      <span className="shrink-0 text-sm mt-0.5">{TYPE_ICONS[n.type] || '🔔'}</span>
                      <div className="min-w-0 flex-1">
                        <p className={'text-xs leading-snug break-words ' + (n.read ? 'text-foreground' : 'font-bold text-foreground')}>{n.title}</p>
                        {n.body && <p className="text-[11px] text-muted-foreground mt-0.5 whitespace-pre-wrap break-words">{n.body}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">
                          {new Date(n.createdAt).toLocaleString('ar-EG', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      {!n.read && <span className="shrink-0 h-2 w-2 rounded-full bg-red-500 mt-1.5" />}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationsBell
