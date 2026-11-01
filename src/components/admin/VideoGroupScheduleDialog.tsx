'use client'

// ============================================================
// VideoGroupScheduleDialog — (2026-و29) جدولة الفيديو للمجموعات
// طلب المستر الحرفي: «هخلي الفيديو ده يظهر لمجموعة يوم السبت، ومجموعة
// التلات ما يظهرلهاش الفيديو ده... يظهرلها يوم التلات. بس الفيديو ما
// يظهرش ليهم، مش يقول له فاضلك كذا، الفيديو ما يظهرش ليهم غير في الميعاد ده»
// — كل مجموعة ليها ميعادها لوحدها، وقبل الميعاد الفيديو مخفي عنها تمامًا
// (بدون عداد)، والمجموعات غير المحددة ما تشوف الفيديو أصلًا.
// ============================================================

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Loader2, Check, Users, Clock } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'

type GroupRow = { id: string; name: string; membersCount: number }
type Plan = { groupId: string; unlockAt: string } // unlockAt = '' (فوري) أو datetime-local

function toLocalInputValue(iso: any): string {
  try {
    if (!iso) return ''
    var d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    var pad = function (n: number) { return (n < 10 ? '0' : '') + n }
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
  } catch (e) { return '' }
}

export function VideoGroupScheduleDialog({
  open,
  onOpenChange,
  videoId,
  videoTitle,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  videoId: string
  videoTitle?: string
  onSaved?: () => void
}) {
  const adminId = useAppStore(function (s) { return s.currentAdmin?.id || '' })
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [plans, setPlans] = useState<Record<string, string>>({}) // groupId → datetime-local ('' = ظاهر فورًا)
  const [enabled, setEnabled] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(function () {
    if (!open || !videoId) return
    setLoading(true)
    ;(async function () {
      try {
        var [gRes, pRes] = await Promise.all([
          fetch('/api/groups?adminId=' + encodeURIComponent(adminId)),
          fetch('/api/video-group-schedule?adminId=' + encodeURIComponent(adminId) + '&videoId=' + encodeURIComponent(videoId)),
        ])
        var gData = await gRes.json()
        if (gRes.ok && Array.isArray(gData.groups)) {
          setGroups(gData.groups.map(function (g: any) {
            return { id: g.id, name: g.name, membersCount: Array.isArray(g.members) ? g.members.length : 0 }
          }))
        } else {
          toast.error((gData && gData.error) || 'خطأ في تحميل المجموعات')
        }
        var pData = await pRes.json()
        var newPlans: Record<string, string> = {}
        var newEnabled = new Set<string>()
        if (pRes.ok && Array.isArray(pData.plans)) {
          for (var i = 0; i < pData.plans.length; i++) {
            var p = pData.plans[i]
            if (!p || !p.groupId) continue
            newPlans[p.groupId] = toLocalInputValue(p.unlockAt)
            newEnabled.add(p.groupId)
          }
        }
        setPlans(newPlans)
        setEnabled(newEnabled)
      } catch (e) { toast.error('خطأ في الاتصال') }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, videoId])

  var toggleGroup = function (id: string) {
    var next = new Set(enabled)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setEnabled(next)
  }

  var save = async function () {
    setSaving(true)
    try {
      var payload: { groupId: string; unlockAt: string | null }[] = []
      enabled.forEach(function (gid) {
        var v = plans[gid] || ''
        payload.push({ groupId: gid, unlockAt: v ? new Date(v).toISOString() : null })
      })
      var res = await fetch('/api/video-group-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, videoId: videoId, plans: payload }),
      })
      var data = await res.json()
      if (res.ok) {
        toast.success(data.message || 'تم الحفظ')
        onOpenChange(false)
        if (onSaved) onSaved()
      } else {
        toast.error(data.error || 'خطأ في الحفظ')
      }
    } catch (e) { toast.error('خطأ في الاتصال') }
    setSaving(false)
  }

  var hasAny = enabled.size > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            جدولة المجموعات {videoTitle ? '— ' + videoTitle : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            علّم المجموعات اللي تشوف الفيديو ده وحدد ميعاد كل مجموعة. قبل الميعاد الفيديو <span className="font-bold text-foreground">مخفي تمامًا</span> عن المجموعة (من غير عداد) وبيظهر عند موعدها. المجموعات غير المحددة مش هتشوف الفيديو أصلًا.
          </p>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="text-sm text-muted-foreground">مفيش مجموعات لسه</p>
              <p className="text-[11px] text-muted-foreground">اعمل مجموعات الأول من تاب «المجموعات» في اللوحة</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-72 overflow-y-auto custom-scrollbar">
              {groups.map(function (g) {
                var on = enabled.has(g.id)
                return (
                  <div key={g.id} className={'p-2.5 rounded-lg border space-y-2 ' + (on ? 'border-primary bg-primary/5' : '')}>
                    <button type="button" className="w-full flex items-center justify-between gap-2 cursor-pointer text-right"
                      onClick={function () { toggleGroup(g.id) }}>
                      <span className="text-sm font-medium">{g.name}</span>
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground">{g.membersCount} طالب</span>
                        <span className={'h-4 w-4 rounded border flex items-center justify-center ' + (on ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>
                          {on && <Check className="h-3 w-3" />}
                        </span>
                      </span>
                    </button>
                    {on && (
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <Input type="datetime-local" value={plans[g.id] || ''} className="h-8 text-[11px] flex-1"
                          onChange={function (e) { setPlans(Object.assign({}, plans, { [g.id]: e.target.value })) }} />
                        <span className="text-[10px] text-muted-foreground whitespace-nowrap">فاضي = فورًا</span>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={function () { onOpenChange(false) }} disabled={saving}>إلغاء</Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />}
              {hasAny ? 'حفظ الجدولة' : 'مسح الجدولة (ظاهر للكل)'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
