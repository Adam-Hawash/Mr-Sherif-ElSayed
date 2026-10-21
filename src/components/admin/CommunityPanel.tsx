'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, Loader2, MessageSquare, Users, Pencil, Trash2, Check, X } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { gradesFromConfig, useAppStore, type Discussion } from '@/stores/app-store'

export function CommunityPanel() {
  // (24-b) قايمة الصفوف بقت ديناميكية من لوحة الأدمن بدل القايمة المحلية الثابتة
  var siteConfig = useAppStore(function (s) { return s.siteConfig })
  var GRADES = gradesFromConfig(siteConfig)
  const [selectedGrade, setSelectedGrade] = useState('')
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  /* (و62) تحكم المستر في الرسايل — تعديل/مسح أي رسالة (بتاعة الناس كمان) */
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')
  const chatEndRef = useRef<HTMLDivElement>(null)

  const loadDiscussions = async () => {
    if (!selectedGrade) { setDiscussions([]); setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/discussions?grade=${encodeURIComponent(selectedGrade)}&pageSize=100`)
      const data = await res.json()
      setDiscussions(data.discussions || [])
    } catch { toast.error('خطأ في تحميل النقاشات') }
    setLoading(false)
  }

  useEffect(() => { loadDiscussions() }, [selectedGrade])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [discussions])

  const handleReply = async () => {
    if (!replyText.trim() || !selectedGrade) return
    setSending(true)
    try {
      await fetch('/api/discussions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grade: selectedGrade,
          content: replyText.trim(),
          isAdminReply: true,
        }),
      })
      setReplyText('')
      setReplyTo(null)
      loadDiscussions()
      toast.success('تم إرسال رسالتك للمجتمع')
    } catch { toast.error('خطأ في إرسال الرد') }
    setSending(false)
  }

  /* (و62) مسح أي رسالة — بنفس نمط تأكيد الحذف في باقي لوحة الأدمن */
  const handleDeleteMessage = async (d: Discussion) => {
    if (!window.confirm('مسح رسالة «' + (d.studentName || '') + '» نهائيًا؟ الطالب مش هيشوفها تاني.')) return
    try {
      const res = await fetch('/api/discussions?id=' + encodeURIComponent(d.id), { method: 'DELETE' })
      if (!res.ok) throw new Error()
      setDiscussions(function (prev) { return prev.filter(function (x) { return x.id !== d.id }) })
      toast.success('الرسالة اتمسحت')
    } catch { toast.error('خطأ في مسح الرسالة') }
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return
    try {
      const res = await fetch('/api/discussions', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingId, content: editText.trim() }),
      })
      if (!res.ok) throw new Error()
      var saved = editText.trim()
      setDiscussions(function (prev) { return prev.map(function (x) { return x.id === editingId ? Object.assign({}, x, { content: saved }) : x }) })
      setEditingId(null)
      setEditText('')
      toast.success('الرسالة اتعدلت')
    } catch { toast.error('خطأ في تعديل الرسالة') }
  }

  const getActionIcons = (action: string) => {
    if (action === 'login') return '🔑'
    if (action === 'watched_video') return '🎬'
    if (action.startsWith('status_changed')) return '📋'
    if (action === 'registered') return '📝'
    return '📌'
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Users className="h-5 w-5" />
            إدارة المجتمعات | Community Management
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedGrade}
              onChange={(e) => setSelectedGrade(e.target.value)}
              className="h-10 rounded-md border border-input bg-transparent px-3 text-sm flex-1"
            >
              <option value="">اختر صف دراسي لإدارة مجتمعه | Select a grade</option>
              {GRADES.map((g) => (
                <option key={g.ar} value={g.ar}>{(g.emoji ? g.emoji + ' ' : '') + g.ar}</option>
              ))}
            </select>
            {selectedGrade && (
              <Badge variant="outline" className="text-xs border-primary/30 text-primary h-10 px-3 flex items-center">
                {discussions.length} رسالة | messages
              </Badge>
            )}
          </div>
        </CardContent>
      </Card>

      {selectedGrade && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <MessageSquare className="h-4 w-4" />
              مجتمع {selectedGrade}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
            ) : discussions.length === 0 ? (
              /* (و63) طلب المستر: يقدر يبعت أول رسالة حتى لو المجتمع فاضي — مش لازم الطالب يبدأ */
              <p className="text-center text-muted-foreground py-10 text-sm">لا توجد رسائل في هذا المجتمع بعد — اكتب أول رسالة من تحت والطلاب هيشوفوها</p>
            ) : (
              <>
                <div className="space-y-3 max-h-[450px] overflow-y-auto custom-scrollbar">
                  {discussions.map((d) => {
                    const isAdmin = d.isAdminReply
                    const isEditing = editingId === d.id
                    return (
                      <div
                        key={d.id}
                        className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 transition-all ${
                            isAdmin
                              ? 'bg-primary/15 dark:bg-primary/20 border border-primary/20 rounded-bl-md'
                              : 'bg-muted rounded-br-md cursor-pointer hover:opacity-90'
                          }`}
                          onClick={() => !isAdmin && !isEditing && setReplyTo(d.studentName)}
                          title={!isAdmin && !isEditing ? 'اضغط للرد على هذه الرسالة' : ''}
                        >
                          {isEditing ? (
                            /* (و62) وضع تعديل الرسالة داخلي */
                            <div className="space-y-2" onClick={function (e) { e.stopPropagation() }}>
                              <textarea
                                value={editText}
                                onChange={(e) => setEditText(e.target.value)}
                                className="w-full min-h-[70px] rounded-md border border-input bg-background p-2 text-sm leading-relaxed resize-y"
                                autoFocus
                              />
                              <div className="flex gap-2 justify-end">
                                <Button size="sm" className="h-7 px-2.5 text-xs" onClick={handleSaveEdit} disabled={!editText.trim()}>
                                  <Check className="h-3 w-3 ml-1" /> حفظ
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 px-2.5 text-xs" onClick={function () { setEditingId(null); setEditText('') }}>
                                  <X className="h-3 w-3 ml-1" /> إلغاء
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <div className="flex items-center gap-2 mb-1">
                                <p className={`text-xs font-semibold ${isAdmin ? 'text-primary' : 'text-foreground'}`}>
                                  {/* (و63) اسم المستر بس من غير أي بادج — طلب المستر: «ولا المعلم ولا أدمن ولا أي حاجة» */}
                                  {d.studentName}
                                </p>
                              </div>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{d.content}</p>
                              <div className="flex items-center gap-1 mt-1">
                                <p className={`text-[10px] ${isAdmin ? 'text-primary/60' : 'text-muted-foreground'}`}>
                                  {new Date(d.createdAt).toLocaleString('ar-EG')}
                                </p>
                                {/* (و62) تحكم المستر: تعديل/مسح أي رسالة — بتاعة الناس كمان */}
                                <span className="flex items-center gap-0.5 mr-auto">
                                  <button
                                    type="button"
                                    onClick={function (e) { e.stopPropagation(); setEditingId(d.id); setEditText(d.content) }}
                                    title="تعديل الرسالة"
                                    aria-label="تعديل الرسالة"
                                    className="h-6 w-6 rounded p-0.5 text-muted-foreground/60 hover:text-primary hover:bg-primary/10 transition-colors"
                                  >
                                    <Pencil className="h-3 w-3" />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={function (e) { e.stopPropagation(); handleDeleteMessage(d) }}
                                    title="مسح الرسالة"
                                    aria-label="مسح الرسالة"
                                    className="h-6 w-6 rounded p-0.5 text-muted-foreground/60 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                  >
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </span>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>
              </>
            )}

            {/* (و63) خانة الكتابة دايمًا ظاهرة — حتى لو المجتمع لسه فاضي */}
            {replyTo && (
              <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-lg px-3 py-1.5">
                <span>الرد على: <strong>{replyTo}</strong></span>
                <button onClick={() => setReplyTo(null)} className="mr-auto text-muted-foreground hover:text-foreground">✕</button>
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <Input
                placeholder="اكتب رسالتك للمجتمع هنا... | Type your message..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                className="flex-1"
              />
              <Button onClick={handleReply} disabled={sending || !replyText.trim()} size="icon">
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}