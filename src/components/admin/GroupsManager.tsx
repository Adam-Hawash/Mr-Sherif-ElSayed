'use client'

// ============================================================
// GroupsManager — (2026-و29) تاب «المجموعات» في لوحة الأدمن
// طلب المستر: «عاوزين نقسم الطلاب لمجموعتين... مجموعة التلات أو مجموعة
// الأحد... أقدر أسمي اليوم أو أعمل مجموعة» — إنشاء/تسمية/حذف مجموعات
// وتسكين الطلاب فيها. الأدمن بس.
// ============================================================

import { useEffect, useState, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Loader2, Plus, Pencil, Trash2, Users, UserPlus, X, Search } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'

type Member = { id: string; name: string; phone: string; grade: string; status: string }
type Group = { id: string; name: string; createdAt?: string; members: Member[] }
type Unassigned = { id: string; name: string; phone: string; grade: string; status: string }

export function GroupsManager() {
  const adminId = useAppStore(function (s) { return s.currentAdmin?.id || '' })
  const [groups, setGroups] = useState<Group[]>([])
  const [unassigned, setUnassigned] = useState<Unassigned[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)
  const [renamingId, setRenamingId] = useState('')
  const [renameVal, setRenameVal] = useState('')
  const [managingId, setManagingId] = useState('')
  const [memberQuery, setMemberQuery] = useState('')

  var load = useCallback(async function () {
    if (!adminId) return
    setLoading(true)
    try {
      var res = await fetch('/api/groups?adminId=' + encodeURIComponent(adminId))
      var data = await res.json()
      if (res.ok) {
        setGroups(Array.isArray(data.groups) ? data.groups : [])
        setUnassigned(Array.isArray(data.unassigned) ? data.unassigned : [])
      } else {
        toast.error(data.error || 'خطأ في تحميل المجموعات')
      }
    } catch (e) { toast.error('خطأ في الاتصال') }
    setLoading(false)
  }, [adminId])

  useEffect(function () { load() }, [load])

  var createGroup = async function () {
    var name = newName.trim()
    if (!name) { toast.error('اكتب اسم المجموعة'); return }
    if (!adminId) { toast.error('مفيش جلسة أدمن'); return }
    setCreating(true)
    try {
      var res = await fetch('/api/groups', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, name: name }),
      })
      var data = await res.json()
      if (res.ok) { toast.success(data.message || 'تم إنشاء المجموعة'); setNewName(''); load() }
      else toast.error(data.error || 'خطأ في الإنشاء')
    } catch (e) { toast.error('خطأ في الاتصال') }
    setCreating(false)
  }

  var renameGroup = async function (id: string) {
    var name = renameVal.trim()
    if (!name) { toast.error('اكتب الاسم الجديد'); return }
    try {
      var res = await fetch('/api/groups', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, id: id, name: name }),
      })
      var data = await res.json()
      if (res.ok) { toast.success('تم تحديث الاسم'); setRenamingId(''); load() }
      else toast.error(data.error || 'خطأ')
    } catch (e) { toast.error('خطأ في الاتصال') }
  }

  var deleteGroup = async function (g: Group) {
    if (!confirm('حذف مجموعة «' + g.name + '»؟ الطلاب اللي فيها هيطلعوا منها (مش هيتحذفوا من المنصة)')) return
    try {
      var res = await fetch('/api/groups?adminId=' + encodeURIComponent(adminId) + '&id=' + encodeURIComponent(g.id), { method: 'DELETE' })
      var data = await res.json()
      if (res.ok) { toast.success(data.message || 'تم الحذف'); load() }
      else toast.error(data.error || 'خطأ')
    } catch (e) { toast.error('خطأ في الاتصال') }
  }

  var assignStudents = async function (studentIds: string[], groupId: string, groupName: string) {
    if (studentIds.length === 0) return
    try {
      var res = await fetch('/api/groups/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminId: adminId, studentIds: studentIds, groupId: groupId }),
      })
      var data = await res.json()
      if (res.ok) { toast.success(data.message || 'تم'); load() }
      else toast.error(data.error || 'خطأ')
    } catch (e) { toast.error('خطأ في الاتصال') }
  }

  var removeMember = async function (studentId: string, groupId: string) {
    await assignStudents([studentId], '', '')
    void groupId
  }

  var managing = groups.find(function (g) { return g.id === managingId }) || null
  var q = memberQuery.trim().toLowerCase()
  var filteredMembers = managing && q ? managing.members.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) !== -1 || (m.phone || '').indexOf(q) !== -1 }) : (managing ? managing.members : [])
  var filteredUnassigned = managing && q ? unassigned.filter(function (m) { return (m.name || '').toLowerCase().indexOf(q) !== -1 || (m.phone || '').indexOf(q) !== -1 }) : unassigned

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div>
            <CardTitle className="text-lg">المجموعات</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">قسّم طلابك مجموعات (زي مجموعة السبت ومجموعة التلات) — وبعدين وجّه الفيديوهات والامتحانات والواجبات لمجموعة معينة بميعادها</p>
          </div>
          <div className="flex gap-1.5 w-full sm:w-auto">
            <Input value={newName} onChange={function (e) { setNewName(e.target.value) }} placeholder='اسم المجموعة — زي «مجموعة السبت»' className="h-9 text-sm flex-1 sm:w-56"
              onKeyDown={function (e) { if (e.key === 'Enter') createGroup() }} />
            <Button size="sm" className="h-9 text-xs" disabled={creating} onClick={createGroup}>
              {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}مجموعة جديدة
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : groups.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <Users className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-muted-foreground text-sm">مفيش مجموعات لسه — اكتب اسم المجموعة فوق واضغط «مجموعة جديدة»</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto custom-scrollbar">
            {groups.map(function (g) {
              return (
                <div key={g.id} className="p-3 rounded-lg border bg-card space-y-2">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2">
                      {renamingId === g.id ? (
                        <div className="flex gap-1">
                          <Input value={renameVal} onChange={function (e) { setRenameVal(e.target.value) }} className="h-8 w-44 text-sm" autoFocus
                            onKeyDown={function (e) { if (e.key === 'Enter') renameGroup(g.id) }} />
                          <Button size="sm" className="h-8 text-xs" onClick={function () { renameGroup(g.id) }}>حفظ</Button>
                          <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={function () { setRenamingId('') }}>إلغاء</Button>
                        </div>
                      ) : (
                        <>
                          <span className="font-semibold text-sm">{g.name}</span>
                          <Badge variant="secondary" className="text-[10px]">{g.members.length} طالب</Badge>
                        </>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={function () { setManagingId(managingId === g.id ? '' : g.id); setMemberQuery('') }}>
                        <UserPlus className="h-3 w-3" />إدارة الطلاب
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-blue-600" title="تسمية" onClick={function () { setRenamingId(g.id); setRenameVal(g.name) }}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" title="حذف المجموعة" onClick={function () { deleteGroup(g) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  {managingId === g.id && (
                    <div className="border-t pt-2 space-y-2">
                      <div className="relative">
                        <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                        <Input value={memberQuery} onChange={function (e) { setMemberQuery(e.target.value) }} placeholder="بحث بالاسم أو الرقم" className="h-8 pr-8 text-xs" />
                      </div>
                      {/* أعضاء المجموعة */}
                      <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                        {filteredMembers.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground text-center py-2">مفيش طلاب في المجموعة — ضيفهم من اللي تحت</p>
                        ) : filteredMembers.map(function (m) {
                          return (
                            <div key={m.id} className="flex items-center justify-between gap-2 p-1.5 rounded bg-muted/50">
                              <span className="text-xs font-medium truncate">{m.name} <span className="text-muted-foreground" dir="ltr">({m.phone})</span></span>
                              <button type="button" className="shrink-0 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded p-1 cursor-pointer" title="إخراج من المجموعة"
                                onClick={function () { removeMember(m.id, g.id) }}><X className="h-3.5 w-3.5" /></button>
                            </div>
                          )
                        })}
                      </div>
                      {/* الطلاب غير المسندين */}
                      <div>
                        <p className="text-[11px] font-semibold text-muted-foreground mb-1">طلاب من غير مجموعة — اضغط لإضافته للمجموعة:</p>
                        <div className="space-y-1 max-h-40 overflow-y-auto custom-scrollbar">
                          {filteredUnassigned.length === 0 ? (
                            <p className="text-[11px] text-muted-foreground text-center py-2">كل الطلاب متسكنين في مجموعات</p>
                          ) : filteredUnassigned.slice(0, 50).map(function (m) {
                            return (
                              <button key={m.id} type="button"
                                className="w-full flex items-center justify-between gap-2 p-1.5 rounded border hover:bg-muted/60 cursor-pointer text-right"
                                onClick={function () { assignStudents([m.id], g.id, g.name) }}>
                                <span className="text-xs truncate">{m.name} <span className="text-muted-foreground" dir="ltr">({m.phone})</span></span>
                                <Plus className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                              </button>
                            )
                          })}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
