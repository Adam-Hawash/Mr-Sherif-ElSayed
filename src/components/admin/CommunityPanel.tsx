'use client'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Send, Loader2, MessageSquare, Users } from 'lucide-react'
import { useState, useEffect, useRef } from 'react'
import { toast } from 'sonner'
import type { Discussion } from '@/stores/app-store'

const GRADES = [
  'الصف الثالث الابتدائي',
  'الصف الرابع الابتدائي',
  'الصف الخامس الابتدائي',
  'الصف السادس الابتدائي',
  'الصف الأول الاعدادي',
  'الصف الثاني الاعدادي',
  'الصف الثالث الاعدادي',
]

export function CommunityPanel() {
  const [selectedGrade, setSelectedGrade] = useState('')
  const [discussions, setDiscussions] = useState<Discussion[]>([])
  const [loading, setLoading] = useState(true)
  const [replyText, setReplyText] = useState('')
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
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
      toast.success('تم إرسال الرد بنجاح')
    } catch { toast.error('خطأ في إرسال الرد') }
    setSending(false)
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
                <option key={g} value={g}>{g}</option>
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
              <p className="text-center text-muted-foreground py-10 text-sm">لا توجد رسائل في هذا المجتمع بعد</p>
            ) : (
              <>
                <div className="space-y-3 max-h-[450px] overflow-y-auto custom-scrollbar">
                  {discussions.map((d) => {
                    const isAdmin = d.isAdminReply
                    return (
                      <div
                        key={d.id}
                        className={`flex ${isAdmin ? 'justify-start' : 'justify-end'}`}
                      >
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2.5 cursor-pointer transition-all hover:opacity-90 ${
                            isAdmin
                              ? 'bg-primary/15 dark:bg-primary/20 border border-primary/20 rounded-bl-md'
                              : 'bg-muted rounded-br-md'
                          }`}
                          onClick={() => !isAdmin && setReplyTo(d.studentName)}
                          title={!isAdmin ? 'اضغط للرد على هذه الرسالة' : ''}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <p className={`text-xs font-semibold ${isAdmin ? 'text-primary' : 'text-foreground'}`}>
                              {d.studentName}
                            </p>
                            {isAdmin && <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary/30 text-primary">Admin</Badge>}
                          </div>
                          <p className="text-sm leading-relaxed">{d.content}</p>
                          <p className={`text-[10px] mt-1 ${isAdmin ? 'text-primary/60' : 'text-muted-foreground'}`}>
                            {new Date(d.createdAt).toLocaleString('ar-EG')}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                  <div ref={chatEndRef} />
                </div>

                {replyTo && (
                  <div className="flex items-center gap-2 text-xs text-primary bg-primary/5 rounded-lg px-3 py-1.5">
                    <span>الرد على: <strong>{replyTo}</strong></span>
                    <button onClick={() => setReplyTo(null)} className="mr-auto text-muted-foreground hover:text-foreground">✕</button>
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t">
                  <Input
                    placeholder="اكتب ردك كمسؤول هنا... | Type your admin reply..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleReply()}
                    className="flex-1"
                  />
                  <Button onClick={handleReply} disabled={sending || !replyText.trim()} size="icon">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}