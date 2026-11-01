'use client'

// ============================================================
// GroupTargetPicker — (2026-و29) استهداف الامتحانات والواجبات للمجموعات
// زي StudentTargetPicker بالظبط بس للمجموعات — الأدمن يعلم المجموعات
// اللي تشوف الامتحان/الواجب، والفاضي = الكل يشوفه.
// طلب المستر: «أقدر أخلي الواجب يظهر لمجموعة يوم السبت ومجموعة التلات
// ما يظهرلهاش غير يوم التلات» — الميعاد بيتحدد من scheduledAt الموجود
// (قبل الموعد المحتوى مخفي تمامًا عن طلاب المجموعة).
// ============================================================

import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Loader2, Check, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'

type GroupRow = { id: string; name: string; membersCount: number }

export function GroupTargetPicker({
  open,
  onOpenChange,
  apiPath,
  itemId,
  itemTitle,
  initialIds,
  adminId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  apiPath: string
  itemId: string
  itemTitle?: string
  initialIds: string[]
  adminId?: string
  onSaved?: () => void
}) {
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set(initialIds))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const storeAdminId = useAppStore(function (s) { return s.currentAdmin?.id || '' })

  useEffect(function () {
    if (!open) return
    setSelected(new Set(initialIds || []))
    setLoading(true)
    ;(async function () {
      try {
        var aid = adminId || storeAdminId
        var res = await fetch('/api/groups?adminId=' + encodeURIComponent(aid))
        var data = await res.json()
        if (res.ok && Array.isArray(data.groups)) {
          setGroups(data.groups.map(function (g: any) {
            return { id: g.id, name: g.name, membersCount: Array.isArray(g.members) ? g.members.length : 0 }
          }))
        } else {
          toast.error((data && data.error) || 'خطأ في تحميل المجموعات')
        }
      } catch (e) { toast.error('خطأ في الاتصال') }
      setLoading(false)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  var toggle = function (id: string) {
    var next = new Set(selected)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setSelected(next)
  }

  var save = async function () {
    setSaving(true)
    try {
      var aid = adminId || storeAdminId
      var body: Record<string, unknown> = { targetGroupIds: Array.from(selected) }
      if (aid) body.adminId = aid
      var res = await fetch(apiPath + '/' + itemId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      var data = await res.json().catch(function () { return {} })
      if (res.ok) {
        toast.success(selected.size === 0 ? 'تم — المحتوى ظاهر لكل الطلاب' : ('تم — موجه لـ ' + selected.size + ' مجموعة'))
        onOpenChange(false)
        if (onSaved) onSaved()
      } else {
        toast.error((data && data.error) || 'خطأ في الحفظ')
      }
    } catch (e) { toast.error('خطأ في الاتصال') }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            تحديد المجموعات {itemTitle ? '— ' + itemTitle : ''}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            علّم المجموعات اللي هتشوف العنصر ده. من غير تحديد = كل الطلاب يشوفوه. لو محدد ميعاد الظهور، المجموعات المحددة مش هتشوفه غير في ميعادها.
          </p>
          {loading ? (
            <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
          ) : groups.length === 0 ? (
            <div className="text-center py-6 space-y-1">
              <p className="text-sm text-muted-foreground">مفيش مجموعات لسه</p>
              <p className="text-[11px] text-muted-foreground">اعمل مجموعات الأول من تاب «المجموعات» في اللوحة</p>
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto custom-scrollbar">
              {groups.map(function (g) {
                var on = selected.has(g.id)
                return (
                  <button key={g.id} type="button"
                    className={'w-full flex items-center justify-between gap-2 p-2.5 rounded-lg border text-right cursor-pointer transition-colors ' + (on ? 'border-primary bg-primary/10' : 'hover:bg-muted/60')}
                    onClick={function () { toggle(g.id) }}>
                    <span className="text-sm font-medium">{g.name}</span>
                    <span className="flex items-center gap-2">
                      <span className="text-[10px] text-muted-foreground">{g.membersCount} طالب</span>
                      <span className={'h-4 w-4 rounded border flex items-center justify-center ' + (on ? 'bg-primary border-primary text-primary-foreground' : 'border-input')}>
                        {on && <Check className="h-3 w-3" />}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
          )}
          <div className="flex gap-2 justify-end">
            <Button variant="outline" size="sm" onClick={function () { onOpenChange(false) }} disabled={saving}>إلغاء</Button>
            <Button size="sm" onClick={save} disabled={saving || loading}>
              {saving && <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" />}
              حفظ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
