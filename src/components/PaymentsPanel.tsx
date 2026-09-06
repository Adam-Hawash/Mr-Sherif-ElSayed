'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import {
  Wallet, Check, X, Loader2, Eye, Trash2, Smartphone, CreditCard,
  Image as ImageIcon, Search, Clock, CheckCircle2, XCircle, Receipt,
  Users, UserCheck, Lock, Unlock, Video, ChevronDown, ChevronUp, UserX, Ban
} from 'lucide-react'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import Image from 'next/image'

interface PaymentItem {
  id: string
  studentId: string
  studentName: string
  studentPhone: string
  studentGrade: string
  videoId: string
  videoTitle: string
  amount: number
  method: string
  receiptPath: string
  receiptType: string
  note: string
  status: string
  reviewedAt: string
  createdAt: string
  updatedAt: string
}

interface PaymentCounts {
  total: number
  pending: number
  approved: number
  rejected: number
}

var methodLabels: Record<string, { label: string; icon: any; color: string }> = {
  vodafone_cash: { label: 'فودافون كاش', icon: Smartphone, color: 'text-red-600 bg-red-100 dark:bg-red-900/30' },
  instapay: { label: 'إنستا باي', icon: CreditCard, color: 'text-violet-600 bg-violet-100 dark:bg-violet-900/30' },
  fawry: { label: 'فوري', icon: CreditCard, color: 'text-blue-600 bg-blue-100 dark:bg-blue-900/30' },
}

var statusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'قيد المراجعة', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  approved: { label: 'مقبول', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
}

var studentStatusConfig: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'قيد المراجعة', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Clock },
  approved: { label: 'مقبول (مجاني)', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  rejected: { label: 'مرفوض', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', icon: XCircle },
  paid: { label: 'مشاهدة بفلوس', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: Wallet },
}

export function PaymentsPanel({ onRefresh }: { onRefresh: () => void }) {
  const [subTab, setSubTab] = useState<'payments' | 'students'>('payments')
  const [payments, setPayments] = useState<PaymentItem[]>([])
  const [counts, setCounts] = useState<PaymentCounts>({ total: 0, pending: 0, approved: 0, rejected: 0 })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'pending' | 'approved' | 'rejected' | 'all'>('pending')
  const [search, setSearch] = useState('')
  const [viewingReceipt, setViewingReceipt] = useState<string | null>(null)
  const [receiptBlobUrl, setReceiptBlobUrl] = useState<string | null>(null)
  const [receiptLoading, setReceiptLoading] = useState(false)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [showRejectNotes, setShowRejectNotes] = useState<string | null>(null)
  const [rejectNotes, setRejectNotes] = useState('')
  const [showApproveConfirm, setShowApproveConfirm] = useState<string | null>(null)

  /* ===== Students sub-tab state ===== */
  const [students, setStudents] = useState<any[]>([])
  const [studentsLoading, setStudentsLoading] = useState(false)
  const [studentSearch, setStudentSearch] = useState('')
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null)
  const [studentVideos, setStudentVideos] = useState<any[]>([])
  const [studentVideosLoading, setStudentVideosLoading] = useState(false)
  const [accessActionLoading, setAccessActionLoading] = useState<string | null>(null)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  var loadPayments = async function(showLoader: boolean = true) {
    if (showLoader) setLoading(true)
    try {
      var params = new URLSearchParams({ pageSize: '100' })
      if (filter !== 'all') params.set('status', filter)
      var res = await fetch('/api/payments?' + params)
      if (!res.ok) { toast.error('خطأ في تحميل المدفوعات'); setLoading(false); return }
      var data = await res.json()
      setPayments(data.payments || [])
      setCounts(data.counts || { total: 0, pending: 0, approved: 0, rejected: 0 })
    } catch { toast.error('خطأ في الاتصال') }
    setLoading(false)
  }

  useEffect(function() { loadPayments() }, [filter])

  /* ===== Load students for students tab ===== */
  var loadStudents = async function() {
    setStudentsLoading(true)
    try {
      var res = await fetch('/api/students?pageSize=200')
      if (res.ok) {
        var data = await res.json()
        setStudents(data.students || [])
      }
    } catch { /* silent */ }
    setStudentsLoading(false)
  }

  useEffect(function() {
    if (subTab === 'students') loadStudents()
  }, [subTab])

  /* ===== Load student's grade videos ===== */
  var loadStudentVideos = async function(studentId: string, studentGrade: string) {
    setStudentVideosLoading(true)
    try {
      // Load all videos for this student's grade
      var videosRes = await fetch('/api/videos?grade=' + encodeURIComponent(studentGrade) + '&pageSize=100')
      var videosData = await videosRes.json()
      var gradeVideos = videosData.videos || []

      // Load approved payments for this student
      var payRes = await fetch('/api/payments?studentId=' + studentId + '&status=approved&pageSize=200')
      var payData = await payRes.json()
      var approvedPayments = payData.payments || []
      var approvedVideoIds = new Set(approvedPayments.map(function(p: any) { return p.videoId }).filter(Boolean))

      // Load explicit video accesses
      var accessRes = await fetch('/api/video-access?studentId=' + studentId)
      var accessData = await accessRes.json()
      var accessVideoIds = new Set((accessData.accesses || []).map(function(a: any) { return a.videoId }))

      // Merge: video is unlocked if student has approved payment OR explicit access
      var unlockedIds = new Set([...approvedVideoIds, ...accessVideoIds])

      var enriched = gradeVideos.map(function(v: any) {
        return {
          ...v,
          isUnlocked: unlockedIds.has(v.id),
          unlockReason: accessVideoIds.has(v.id) ? 'granted' : approvedVideoIds.has(v.id) ? 'payment' : 'none',
        }
      })

      setStudentVideos(enriched)
    } catch { setStudentVideos([]) }
    setStudentVideosLoading(false)
  }

  var handleToggleStudent = function(student: any) {
    if (expandedStudent === student.id) {
      setExpandedStudent(null)
      setStudentVideos([])
    } else {
      setExpandedStudent(student.id)
      loadStudentVideos(student.id, student.grade)
    }
  }

  /* ===== Change student status ===== */
  var handleStatusChange = async function(studentId: string, newStatus: string) {
    setStatusLoading(studentId)
    try {
      var res = await fetch('/api/students/' + studentId, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (res.ok) {
        var label = newStatus === 'approved' ? 'مقبول (مجاني)' : newStatus === 'rejected' ? 'مرفوض (بفلوس)' : newStatus
        toast.success('تم تغيير حالة الطالب إلى: ' + label)
        loadStudents()
        onRefresh()
        // Refresh videos if this student is expanded
        if (expandedStudent === studentId) {
          var st = students.find(function(s) { return s.id === studentId })
          if (st) loadStudentVideos(studentId, st.grade)
        }
      } else { toast.error('خطأ في تغيير الحالة') }
    } catch { toast.error('خطأ في الاتصال') }
    setStatusLoading(null)
  }

  /* ===== Delete student ===== */
  var handleDeleteStudent = async function(studentId: string) {
    if (!confirm('هل أنت متأكد من حذف هذا الطالب؟ سيتم حذفه نهائياً من المنصة.')) return
    try {
      var res = await fetch('/api/students/' + studentId, { method: 'DELETE' })
      if (res.ok) {
        toast.success('تم حذف الطالب نهائياً')
        if (expandedStudent === studentId) { setExpandedStudent(null); setStudentVideos([]) }
        loadStudents()
        onRefresh()
      } else { toast.error('خطأ في الحذف') }
    } catch { toast.error('خطأ في الاتصال') }
  }

  /* ===== Grant/Remove video access for a student ===== */
  var handleGrantAccess = async function(studentId: string, videoId: string, videoTitle: string) {
    setAccessActionLoading(studentId + '_' + videoId)
    try {
      var res = await fetch('/api/video-access/grant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, videoId }),
      })
      if (res.ok) {
        toast.success('تم فتح الفيديو: ' + videoTitle)
        var st = students.find(function(s) { return s.id === studentId })
        if (st) loadStudentVideos(studentId, st.grade)
      } else { toast.error('خطأ') }
    } catch { toast.error('خطأ في الاتصال') }
    setAccessActionLoading(null)
  }

  var handleRemoveAccess = async function(studentId: string, videoId: string, videoTitle: string) {
    setAccessActionLoading(studentId + '_' + videoId)
    try {
      var res = await fetch('/api/video-access/grant', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentId, videoId }),
      })
      if (res.ok) {
        toast.success('تم إغلاق الفيديو: ' + videoTitle)
        var st = students.find(function(s) { return s.id === studentId })
        if (st) loadStudentVideos(studentId, st.grade)
      } else { toast.error('خطأ') }
    } catch { toast.error('خطأ في الاتصال') }
    setAccessActionLoading(null)
  }

  var filteredPayments = payments.filter(function(p) {
    if (!search.trim()) return true
    var s = search.toLowerCase()
    return (
      (p.studentName || '').toLowerCase().includes(s) ||
      (p.videoTitle || '').toLowerCase().includes(s) ||
      (p.method || '').toLowerCase().includes(s) ||
      String(p.amount).includes(s)
    )
  })

  var filteredStudents = students.filter(function(st) {
    if (!studentSearch.trim()) return true
    var s = studentSearch.toLowerCase()
    return (
      (st.name || '').toLowerCase().includes(s) ||
      (st.phone || '').includes(s) ||
      (st.grade || '').toLowerCase().includes(s)
    )
  })

  var handleViewReceipt = async function(paymentId: string) {
    var payment = payments.find(function(p) { return p.id === paymentId })
    if (!payment || !payment.receiptPath) { toast.error('لا يوجد إيصال'); return }
    setViewingReceipt(paymentId)
    setReceiptLoading(true)
    setReceiptBlobUrl(null)
    try {
      var res = await fetch('/api/files/' + payment.receiptPath)
      if (res.ok) { var blob = await res.blob(); setReceiptBlobUrl(URL.createObjectURL(blob)) }
      else { toast.error('فشل تحميل الإيصال'); setViewingReceipt(null) }
    } catch { toast.error('خطأ'); setViewingReceipt(null) }
    setReceiptLoading(false)
  }

  var handleApprove = async function(paymentId: string) {
    setActionLoading(paymentId)
    try {
      var res = await fetch('/api/payments/' + paymentId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved' }) })
      if (res.ok) { toast.success('تم قبول الدفع بنجاح'); loadPayments(false); onRefresh(); setShowApproveConfirm(null) }
      else { var d = await res.json(); toast.error(d.error || 'خطأ') }
    } catch { toast.error('خطأ') }
    setActionLoading(null)
  }

  var handleReject = async function(paymentId: string) {
    setActionLoading(paymentId)
    try {
      var res = await fetch('/api/payments/' + paymentId, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'rejected', adminNotes: rejectNotes }) })
      if (res.ok) { toast.success('تم رفض الدفع'); loadPayments(false); onRefresh(); setShowRejectNotes(null); setRejectNotes('') }
      else { var d = await res.json(); toast.error(d.error || 'خطأ') }
    } catch { toast.error('خطأ') }
    setActionLoading(null)
  }

  var handleDelete = async function(paymentId: string) {
    if (!confirm('هل أنت متأكد؟')) return
    try {
      var res = await fetch('/api/payments/' + paymentId, { method: 'DELETE' })
      if (res.ok) { toast.success('تم الحذف'); loadPayments(false); onRefresh() }
      else { toast.error('خطأ') }
    } catch { toast.error('خطأ') }
  }

  var closeReceiptDialog = function() {
    if (receiptBlobUrl) URL.revokeObjectURL(receiptBlobUrl)
    setViewingReceipt(null)
    setReceiptBlobUrl(null)
  }

  return (
    <>
      {/* Sub-tab switcher */}
      <div className="flex gap-2 mb-4">
        <Button variant={subTab === 'payments' ? 'default' : 'outline'} size="sm" onClick={function() { setSubTab('payments') }}>
          <Wallet className="h-4 w-4 ml-1" />
          المدفوعات
          {counts.pending > 0 && <Badge className="mr-2 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-amber-500 text-white">{counts.pending}</Badge>}
        </Button>
        <Button variant={subTab === 'students' ? 'default' : 'outline'} size="sm" onClick={function() { setSubTab('students') }}>
          <Users className="h-4 w-4 ml-1" />
          الطلاب
        </Button>
      </div>

      {/* ===== PAYMENTS TAB ===== */}
      {subTab === 'payments' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={function() { setFilter('pending') }}>
              <CardContent className="p-3 text-center">
                <Clock className="h-5 w-5 text-amber-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-amber-600 dark:text-amber-400">{counts.pending}</p>
                <p className="text-[10px] text-muted-foreground">قيد المراجعة</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={function() { setFilter('approved') }}>
              <CardContent className="p-3 text-center">
                <CheckCircle2 className="h-5 w-5 text-emerald-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{counts.approved}</p>
                <p className="text-[10px] text-muted-foreground">مقبول</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={function() { setFilter('rejected') }}>
              <CardContent className="p-3 text-center">
                <XCircle className="h-5 w-5 text-red-500 mx-auto mb-1" />
                <p className="text-xl font-bold text-red-600 dark:text-red-400">{counts.rejected}</p>
                <p className="text-[10px] text-muted-foreground">مرفوض</p>
              </CardContent>
            </Card>
            <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={function() { setFilter('all') }}>
              <CardContent className="p-3 text-center">
                <Receipt className="h-5 w-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{counts.total}</p>
                <p className="text-[10px] text-muted-foreground">الإجمالي</p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Wallet className="h-5 w-5 text-primary" />
                  إدارة المدفوعات
                </CardTitle>
                <div className="flex gap-2 items-center flex-wrap">
                  <div className="relative">
                    <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input value={search} onChange={function(e) { setSearch(e.target.value) }} placeholder="بحث..." className="h-8 w-44 pr-8 text-xs" />
                  </div>
                  <div className="flex gap-1 bg-muted rounded-lg p-1">
                    {(['pending', 'all', 'approved', 'rejected'] as const).map(function(f) {
                      return (<Button key={f} variant={filter === f ? 'default' : 'ghost'} size="sm" className="text-xs h-7 px-2" onClick={function() { setFilter(f) }}>{f === 'pending' ? 'معلق' : f === 'approved' ? 'مقبول' : f === 'rejected' ? 'مرفوض' : 'الكل'}</Button>)
                    })}
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>) : filteredPayments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Wallet className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                  <p className="text-sm text-muted-foreground">لا يوجد مدفوعات</p>
                </div>
              ) : (
                <div className="space-y-3 max-h-[600px] overflow-y-auto custom-scrollbar">
                  {filteredPayments.map(function(p) {
                    var method = methodLabels[p.method] || { label: p.method, icon: Wallet, color: 'text-muted-foreground bg-muted' }
                    var status = statusConfig[p.status] || statusConfig.pending
                    var MethodIcon = method.icon
                    var StatusIcon = status.icon
                    return (
                      <div key={p.id} className={"p-4 rounded-xl border transition-all " + (p.status === 'pending' ? 'border-amber-200 dark:border-amber-800/50 bg-amber-50/50 dark:bg-amber-900/10' : 'bg-card')}>
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className="font-semibold text-sm">{p.studentName || 'طالب'}</span>
                              <Badge className={"text-[10px] " + status.color}><StatusIcon className="h-3 w-3 ml-1" />{status.label}</Badge>
                            </div>
                            <p className="text-xs text-muted-foreground">فيديو: {p.videoTitle || '—'}</p>
                          </div>
                          <div className="text-left shrink-0">
                            <p className="text-lg font-bold text-primary">{p.amount} <span className="text-xs font-normal text-muted-foreground">ج.م</span></p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 flex-wrap mb-3">
                          <div className={"flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium " + method.color}><MethodIcon className="h-3.5 w-3.5" />{method.label}</div>
                          <span className="text-[10px] text-muted-foreground">{new Date(p.createdAt).toLocaleDateString('ar-EG')}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          {p.receiptPath && (<Button size="sm" variant="outline" className="text-xs h-8" onClick={function() { handleViewReceipt(p.id) }}><Eye className="h-3.5 w-3.5 ml-1" />الإيصال</Button>)}
                          {p.status === 'pending' && (<>
                            <Button size="sm" className="text-xs h-8 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={function() { setShowApproveConfirm(p.id) }} disabled={actionLoading === p.id}>{actionLoading === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 ml-1" />}قبول</Button>
                            <Button size="sm" variant="outline" className="text-xs h-8 text-destructive" onClick={function() { setShowRejectNotes(p.id); setRejectNotes('') }} disabled={actionLoading === p.id}>{actionLoading === p.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3 ml-1" />}رفض</Button>
                          </>)}
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive ml-auto" onClick={function() { handleDelete(p.id) }}><Trash2 className="h-3.5 w-3.5" /></Button>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}

      {/* ===== STUDENTS TAB ===== */}
      {subTab === 'students' && (
        <Card>
          <CardHeader className="pb-3">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                حالة الطلاب والفيديوهات
              </CardTitle>
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <Input value={studentSearch} onChange={function(e) { setStudentSearch(e.target.value) }} placeholder="بحث بالاسم أو الصف..." className="h-8 w-52 pr-8 text-xs" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {studentsLoading ? (<div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>) : filteredStudents.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="h-12 w-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">لا يوجد طلاب</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[600px] overflow-y-auto custom-scrollbar">
                {filteredStudents.map(function(st) {
                  var isExpanded = expandedStudent === st.id
                  var stConf = studentStatusConfig[st.status] || studentStatusConfig.pending
                  var StIcon = stConf.icon
                  return (
                    <div key={st.id} className="rounded-xl border bg-card overflow-hidden">
                      <div className="flex items-center gap-3 p-3 cursor-pointer hover:bg-muted/30 transition-colors" onClick={function() { handleToggleStudent(st) }}>
                        <div className={"h-9 w-9 rounded-full flex items-center justify-center shrink-0 " + (st.status === 'approved' ? 'bg-emerald-100 dark:bg-emerald-900/30' : st.status === 'rejected' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-amber-100 dark:bg-amber-900/30')}>
                          <UserCheck className={"h-4 w-4 " + (st.status === 'approved' ? 'text-emerald-600' : st.status === 'rejected' ? 'text-red-600' : 'text-amber-600')} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold truncate">{st.name}</p>
                          <p className="text-[10px] text-muted-foreground">{st.grade} · {st.phone}</p>
                        </div>
                        <Badge className={"text-[10px] " + stConf.color}>
                          <StIcon className={"h-3 w-3 ml-1"} />
                          {stConf.label}
                        </Badge>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground shrink-0" /> : <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />}
                      </div>

                      {isExpanded && (
                        <div className="border-t p-3 bg-muted/20 space-y-3">
                          {/* Status change buttons */}
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[10px] text-muted-foreground ml-1">تغيير الحالة:</span>
                            {st.status !== 'approved' && (
                              <Button size="sm" variant="outline" className={"text-xs h-7 " + (st.status === 'approved' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : '')} onClick={function(e) { e.stopPropagation(); handleStatusChange(st.id, 'approved') }} disabled={statusLoading === st.id}>
                                {statusLoading === st.id ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Check className="h-3 w-3 ml-1" />}
                                مقبول (مجاني)
                              </Button>
                            )}
{st.status !== 'paid' && (
  <Button size="sm" variant="outline" className="text-xs h-7 border-amber-500 text-amber-700 hover:bg-amber-50" onClick={function(e) { e.stopPropagation(); handleStatusChange(st.id, 'paid') }} disabled={statusLoading === st.id}>
  {statusLoading === st.id ? <Loader2 className="h-3 w-3 animate-spin ml-1" /> : <Wallet className="h-3 w-3 ml-1" />}
  مشاهدة بفلوس
  </Button>
  )}
                            <Button size="sm" variant="ghost" className="text-xs h-7 text-destructive hover:bg-destructive/10" onClick={function(e) { e.stopPropagation(); handleDeleteStudent(st.id) }}>
                              <Trash2 className="h-3 w-3 ml-1" />
                              حذف من المنصة
                            </Button>
                          </div>

                          {/* Videos list */}
                          {studentVideosLoading ? (<div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>) : studentVideos.length === 0 ? (
                            <div className="text-center py-6">
                              <Video className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                              <p className="text-xs text-muted-foreground">لا توجد فيديوهات لهذا الصف</p>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              <p className="text-xs font-semibold text-muted-foreground mb-2">فيديوهات الصف ({studentVideos.length}) — {st.status === 'approved' ? 'الطالب يشوف الكل مجاناً' : 'الطالب محتاج يدفع للفيديوهات المدفوعة'}</p>
                              {studentVideos.map(function(v: any) {
                                var loading = accessActionLoading === (st.id + '_' + v.id)
                                var isFree = !v.price || v.price === 0
                                var isUnlocked = v.isUnlocked || st.status === 'approved'
                                return (
                                  <div key={v.id} className={"flex items-center gap-3 p-2.5 rounded-lg bg-background border " + (isUnlocked ? 'border-emerald-500/30' : '')}>
                                    <div className={"h-8 w-8 rounded-lg flex items-center justify-center shrink-0 " + (isUnlocked ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30')}>
                                      {isUnlocked ? <Unlock className="h-4 w-4 text-emerald-600" /> : <Lock className="h-4 w-4 text-red-600" />}
                                    </div>
                                    <div className="min-w-0 flex-1">
                                      <p className="text-xs font-medium truncate">{v.title}</p>
                                      <div className="flex items-center gap-2">
                                        <p className="text-[10px] text-muted-foreground">{isFree ? 'مجاني' : v.price + ' ج.م'}</p>
                                        {isUnlocked && <span className="text-[9px] text-emerald-600">{v.unlockReason === 'payment' ? '✓ مدفوع' : v.unlockReason === 'granted' ? '✓ مفتوح' : '✓ مجاني (مقبول)'}</span>}
                                      </div>
                                    </div>
                                    {!isFree && st.status !== 'approved' && (
                                      <Button size="sm" variant="ghost" className={"h-7 w-7 p-0 shrink-0 " + (isUnlocked ? 'text-emerald-600 hover:bg-emerald-50' : 'text-blue-600 hover:bg-blue-50')} onClick={function(e) { e.stopPropagation(); isUnlocked ? handleRemoveAccess(st.id, v.id, v.title) : handleGrantAccess(st.id, v.id, v.title) }} disabled={loading}>
                                        {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : isUnlocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
                                      </Button>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Receipt Dialog */}
      {viewingReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm" onClick={closeReceiptDialog}>
          <div className="bg-card border rounded-2xl p-4 w-full max-w-lg mx-4 shadow-2xl" onClick={function(e) { e.stopPropagation() }}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-sm flex items-center gap-2"><ImageIcon className="h-4 w-4 text-primary" />صورة الإيصال</h3>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={closeReceiptDialog}><X className="h-4 w-4" /></Button>
            </div>
            {receiptLoading ? (<div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>) : receiptBlobUrl ? (
              <div className="relative rounded-lg overflow-hidden border bg-black/5 aspect-[3/4] max-h-[70vh]"><Image src={receiptBlobUrl} alt="إيصال" fill className="object-contain" unoptimized /></div>
            ) : (<p className="text-center py-10 text-sm text-muted-foreground">فشل التحميل</p>)}
          </div>
        </div>
      )}

      {/* Approve Confirm Dialog */}
      {showApproveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={function() { setShowApproveConfirm(null) }}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={function(e) { e.stopPropagation() }}>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center"><CheckCircle2 className="h-7 w-7 text-emerald-600" /></div>
              <div>
                <h3 className="font-bold text-lg">تأكيد القبول</h3>
                <p className="text-sm text-muted-foreground mt-1">سيتم تفعيل الوصول للفيديو</p>
              </div>
              <div className="flex gap-2 w-full">
                <Button className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white" onClick={function() { handleApprove(showApproveConfirm) }} disabled={actionLoading === showApproveConfirm}>{actionLoading === showApproveConfirm ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4 ml-1" />}نعم</Button>
                <Button variant="outline" className="flex-1" onClick={function() { setShowApproveConfirm(null) }}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reject Dialog */}
      {showRejectNotes && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={function() { setShowRejectNotes(null) }}>
          <div className="bg-card border rounded-2xl p-6 w-full max-w-sm mx-4 shadow-2xl" onClick={function(e) { e.stopPropagation() }}>
            <div className="flex flex-col items-center text-center space-y-4">
              <div className="h-14 w-14 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center"><XCircle className="h-7 w-7 text-red-600" /></div>
              <div className="w-full text-right">
                <h3 className="font-bold text-lg">سبب الرفض (اختياري)</h3>
              </div>
              <Textarea value={rejectNotes} onChange={function(e) { setRejectNotes(e.target.value) }} placeholder="مثال: الإيصال غير واضح..." rows={3} className="w-full text-sm" />
              <div className="flex gap-2 w-full">
                <Button className="flex-1 bg-red-600 hover:bg-red-700 text-white" onClick={function() { handleReject(showRejectNotes) }} disabled={actionLoading === showRejectNotes}>{actionLoading === showRejectNotes ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4 ml-1" />}رفض</Button>
                <Button variant="outline" className="flex-1" onClick={function() { setShowRejectNotes(null); setRejectNotes('') }}>إلغاء</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
