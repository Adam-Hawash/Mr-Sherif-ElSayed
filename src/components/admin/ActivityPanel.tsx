'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Loader2, Activity, Eye, LogIn, UserCheck, FileVideo } from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import type { StudentActivity, Student } from '@/stores/app-store'

import { GRADES } from '@/stores/app-store'

const ACTION_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  login: { label: 'تسجيل دخول', color: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20', icon: '🔑' },
  watched_video: { label: 'مشاهدة فيديو', color: 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20', icon: '🎬' },
  registered: { label: 'تسجيل جديد', color: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20', icon: '📝' },
  status_changed_to_approved: { label: 'تم القبول', color: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20', icon: '✅' },
  status_changed_to_rejected: { label: 'تم الرفض', color: 'bg-red-500/10 text-red-600 dark:text-red-400 border-red-500/20', icon: '❌' },
}

export function ActivityPanel() {
  const [activities, setActivities] = useState<StudentActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [filterGrade, setFilterGrade] = useState('')
  const [filterAction, setFilterAction] = useState('')
  const [students, setStudents] = useState<Student[]>([])

  const loadActivities = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ pageSize: '100' })
      if (filterGrade) params.set('grade', filterGrade)
      if (filterAction) params.set('action', filterAction)
      const res = await fetch(`/api/activities?${params}`)
      const data = await res.json()
      setActivities(data.activities || [])
    } catch { toast.error('خطأ في تحميل النشاطات') }
    setLoading(false)
  }

  const loadStudents = async () => {
    try {
      const params = new URLSearchParams({ pageSize: '100' })
      if (filterGrade) params.set('grade', filterGrade)
      const res = await fetch(`/api/students?${params}`)
      const data = await res.json()
      setStudents(data.students || [])
    } catch { /* silent */ }
  }

  useEffect(() => { loadActivities(); loadStudents() }, [filterGrade, filterAction])

  const getActionStyle = (action: string) => {
    return ACTION_STYLES[action] || { label: action, color: 'bg-muted text-muted-foreground border-border', icon: '📌' }
  }

  return (
    <div className="space-y-4">
      {/* Filters & Student Summary */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-5 w-5" />
            متابعة الطلاب | Student Activity Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">كل الصفوف | All Grades</option>
              {GRADES.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="h-9 rounded-md border border-input bg-transparent px-3 text-sm"
            >
              <option value="">كل النشاطات | All Actions</option>
              <option value="login">تسجيل دخول | Login</option>
              <option value="watched_video">مشاهدة فيديو | Watched Video</option>
              <option value="registered">تسجيل | Registration</option>
            </select>
          </div>

          {/* Student Summary Table */}
          {filterGrade && students.length > 0 && (
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-right p-2.5 font-medium text-xs">الطالب</th>
                    <th className="text-right p-2.5 font-medium text-xs">الهاتف</th>
                    <th className="text-center p-2.5 font-medium text-xs">الحالة</th>
                    <th className="text-center p-2.5 font-medium text-xs">تسجيلات الدخول</th>
                    <th className="text-center p-2.5 font-medium text-xs">الفيديوهات المشاهدة</th>
                    <th className="text-center p-2.5 font-medium text-xs">آخر دخول</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {students.map((s) => (
                    <tr key={s.id} className="hover:bg-muted/30 transition-colors">
                      <td className="p-2.5 font-medium">{s.name}</td>
                      <td className="p-2.5 text-muted-foreground" dir="ltr">{s.phone}</td>
                      <td className="p-2.5 text-center">
                        <Badge variant="secondary" className={`text-[10px] ${
                          s.status === 'approved' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' :
                          s.status === 'rejected' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' :
                          'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}>
                          {s.status === 'approved' ? 'مقبول' : s.status === 'rejected' ? 'مرفوض' : 'قيد المراجعة'}
                        </Badge>
                      </td>
                      <td className="p-2.5 text-center font-semibold">{s.loginCount || 0}</td>
                      <td className="p-2.5 text-center">
                        <span className="inline-flex items-center gap-1 text-purple-600 dark:text-purple-400">
                          <FileVideo className="h-3 w-3" />{s.watchedVideoCount || 0}
                        </span>
                      </td>
                      <td className="p-2.5 text-center text-xs text-muted-foreground">
                        {s.lastLogin ? new Date(s.lastLogin).toLocaleDateString('ar-EG') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Activity Feed */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">سجل النشاطات | Activity Log</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : activities.length === 0 ? (
            <p className="text-center text-muted-foreground py-10 text-sm">لا توجد نشاطات مسجلة</p>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar">
              {activities.map((a) => {
                const style = getActionStyle(a.action)
                return (
                  <div key={a.id} className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/20 transition-colors">
                    <span className="text-lg mt-0.5">{style.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{a.student?.name || 'Unknown'}</span>
                        <Badge variant="outline" className={`text-[10px] border ${style.color}`}>{style.label}</Badge>
                        {a.student?.grade && <span className="text-[10px] text-muted-foreground">{a.student.grade}</span>}
                      </div>
                      {a.details && <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.details}</p>}
                      <p className="text-[10px] text-muted-foreground mt-0.5">{new Date(a.createdAt).toLocaleString('ar-EG')}</p>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}