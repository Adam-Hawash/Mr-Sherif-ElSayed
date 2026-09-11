'use client'

/* ============================================================
   (2026-و26) منتقي الطلاب المستهدفين — بطلب المستر:
   «أقدر أحدد الطلاب اللي هيشوفوها دلوقتي… زي نظام الفيديوهات بالظبط»
   ------------------------------------------------------------
   دايلوج فيه قايمة الطلاب (بحث + تحديد بالعلامة) — الناتج array من
   ids الطلاب. فاضي = الكل يشوف العنصر (نفس نمط VideoSchedule).
   بيشتغل مع أي عنصر (امتحان/واجب) — الحفظ بـ PATCH على {apiPath}/{id}
   ============================================================ */
import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Loader2, Search, Users, X, Check } from 'lucide-react'
import { toast } from 'sonner'

/* ملاحظة (إصلاح بناء Vercel): بنستخدم checkbox مخصص + overflow div عادي
   بدل @/components/ui/checkbox وscroll-area — باكدجات radix بتاعتهم
   مش متسطبة في المنصة (أخطاء tsc الباسلاين) وأي import ليهم بيفشل البيلد */

type StudentRow = { id: string; name: string; phone?: string; grade?: string }

/* (2026-و26) قراءة قايمة الاستهداف المخزنة (JSON string → array)
   مشتركة بين صفوف الامتحانات والواجبات في لوحة الأدمن */
export function parseTargetStudentIds(raw: unknown): string[] {
  try {
    var p = JSON.parse(String(raw == null ? '[]' : raw))
    return Array.isArray(p) ? p.map(function (x) { return String(x) }) : []
  } catch (e) { return [] }
}

export function StudentTargetPicker({
  open,
  onOpenChange,
  apiPath,
  itemId,
  initialIds,
  itemTitle,
  adminId,
  onSaved,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  apiPath: string
  itemId: string
  initialIds: string[]
  itemTitle?: string
  adminId?: string
  onSaved?: (ids: string[]) => void
}) {
  const [students, setStudents] = useState<StudentRow[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [saving, setSaving] = useState(false)

  /* تحميل الطلاب أول ما الدايلوج يفتح */
  useEffect(function () {
    if (!open) return
    setSelected(new Set(initialIds || []))
    setSearch('')
    var mounted = true
    setLoading(true)
    ;(async function () {
      try {
        var res = await fetch('/api/students?page=1&pageSize=500')
        var data: any = {}
        try { data = await res.json() } catch (e) {}
        if (mounted && res.ok && Array.isArray(data.students)) {
          setStudents(data.students.map(function (s: any) {
            return { id: String(s.id), name: String(s.name || 'طالب'), phone: s.phone ? String(s.phone) : '', grade: s.grade ? String(s.grade) : '' }
          }))
        }
      } catch (e) {}
      if (mounted) setLoading(false)
    })()
    return function () { mounted = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  var filtered = useMemo(function () {
    var q = search.trim().toLowerCase()
    if (!q) return students
    return students.filter(function (s) {
      return (s.name || '').toLowerCase().indexOf(q) !== -1 || (s.phone || '').indexOf(q) !== -1
    })
  }, [students, search])

  function toggle(id: string) {
    setSelected(function (prev) {
      var n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  function toggleVisibleAll() {
    setSelected(function (prev) {
      var n = new Set(prev)
      var allVisible = filtered.length > 0 && filtered.every(function (s) { return n.has(s.id) })
      if (allVisible) filtered.forEach(function (s) { return n.delete(s.id) })
      else filtered.forEach(function (s) { return n.add(s.id) })
      return n
    })
  }

  async function save(ids: string[]) {
    setSaving(true)
    try {
      var res = await fetch(apiPath + '/' + itemId, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        /* (2026-و26) auth الأدمن — الـ PATCH بيتحقق ضد adminId فلازم نبعته */
        body: JSON.stringify({ adminId: adminId || '', targetStudentIds: ids }),
      })
      if (res.ok) {
        toast.success(ids.length === 0
          ? 'تم — العنصر ظاهر لكل الطلاب'
          : ('تم — موجه لـ ' + ids.length + ' طالب بس'))
        if (onSaved) onSaved(ids)
        onOpenChange(false)
      } else {
        var d: any = {}
        try { d = await res.json() } catch (e) {}
        toast.error(d.error || 'خطأ في الحفظ', { duration: 8000 })
      }
    } catch (e) {
      toast.error('خطأ في الاتصال', { duration: 8000 })
    }
    setSaving(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            مين يشوف؟ {itemTitle ? <span className="text-muted-foreground font-normal text-sm truncate max-w-[180px]">({itemTitle})</span> : null}
          </DialogTitle>
          <DialogDescription className="text-xs leading-relaxed">
            من غير تحديد = <span className="font-bold text-foreground">كل الطلاب</span> يشوفوه.
            حدد طلاب معينين = <span className="font-bold text-foreground">هما بس</span> اللي هيشوفوه (زي الفيديوهات بالظبط).
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5">
              <div className="relative flex-1">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={search} onChange={function (e) { setSearch(e.target.value) }}
                  placeholder="بحث بالاسم أو رقم التليفون…" className="h-8 text-xs pr-8" />
              </div>
              <Button type="button" variant="outline" size="sm" className="h-8 text-[10px] px-2 shrink-0" onClick={toggleVisibleAll}>
                تحديد الكل
              </Button>
            </div>

            <div className="h-[280px] overflow-y-auto rounded-lg border custom-scrollbar" style={{ scrollbarWidth: 'thin' }}>
              <div className="p-1.5 space-y-0.5">
                {filtered.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-8">مفيش نتائج</p>
                ) : filtered.map(function (s) {
                  var checked = selected.has(s.id)
                  return (
                    <label key={s.id}
                      className={'flex items-center gap-2.5 rounded-md px-2 py-1.5 cursor-pointer transition-colors ' + (checked ? 'bg-primary/10' : 'hover:bg-muted/60')}>
                      {/* checkbox مخصص — بدون باكدجات خارجية */}
                      <span className={'flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 transition-colors ' + (checked ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40 bg-transparent')}>
                        {checked && <Check className="h-3 w-3" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{s.name}</p>
                        <p className="text-[10px] text-muted-foreground truncate" dir="ltr">{s.phone}{s.grade ? ' • ' + s.grade : ''}</p>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 flex-wrap">
              <Badge variant={selected.size === 0 ? 'secondary' : 'default'} className="text-[10px] gap-1">
                <Users className="h-3 w-3" />
                {selected.size === 0 ? 'ظاهر لكل الطلاب' : ('موجه لـ ' + selected.size + ' طالب')}
              </Badge>
              {selected.size > 0 && (
                <Button type="button" variant="ghost" size="sm" className="h-7 text-[10px] px-2 text-destructive"
                  disabled={saving} onClick={function () { setSelected(new Set()) }}>
                  <X className="h-3 w-3 ml-0.5" /> إلغاء التحديد (الكل يشوفه)
                </Button>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button type="button" variant="outline" size="sm" disabled={saving} onClick={function () { onOpenChange(false) }}>إلغاء</Button>
          <Button type="button" size="sm" disabled={saving || loading} onClick={function () { save(Array.from(selected)) }}>
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : null}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
