'use client'

// ============================================================
// (2026-و45) SherineChat — شيرين: المساعدة الشخصية للطالب
// طلب الحزمة: شات عائم زراره تحت على الشمال، لوحة RTL باسم شيرين،
// الرسايل بسكرول (max-h)، حقول إدخال + إرسال، نقط تحميل، المحادثة
// محفوظة في localStorage ('sherine_chat') + زرار مسح، وكل أهداف
// اللمس 44px على الأقل — وبتكلم /api/ai/assistant بشخصية 'sherine'.
// ملاحظة: المساعد الذكي القديم (AIAssistant) عائم تحت على اليمين —
// الاتنين مالهمش تعارض في المكان ولا في الشخصية.
// ============================================================

import * as React from 'react'
import { Send, X, Trash2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { useAppStore } from '@/stores/app-store'
import { FractionText } from '@/components/FractionText'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

var STORAGE_KEY = 'sherine_chat'
var MAX_STORED = 60 // بنحفظ آخر 60 رسالة بس في الجهاز
var MAX_HISTORY_SENT = 10 // آخر 10 رسائل للسيرفر (نفس حد المسار)

var GREETING = 'أهلاً بيك 👋 أنا شيرين — مساعدتك الشخصية في الرياضيات.\nاسألني أي حاجة مش فاهمها في الدروس، أو اكتبلي مسألة وحنا نحلها مع بعض خطوة بخطوة 🌟'

function loadStored(): ChatMessage[] {
  try {
    var raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    var parsed = JSON.parse(raw)
    if (parsed && Array.isArray(parsed.messages)) {
      return parsed.messages
        .filter(function (m: any) { return m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim() })
        .slice(-MAX_STORED)
    }
  } catch (e) { /* التخزين التالف مش سبب لكسر حاجة */ }
  return []
}

function saveStored(messages: ChatMessage[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ v: 1, messages: messages.slice(-MAX_STORED) }))
  } catch (e) { /* ممتلئ أو ممنوع — صامت */ }
}

/* نقط التحميل — 3 نقط بتنط بأوقات متأخرة */
function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1 py-1.5" aria-label="شيرين بتكتب">
      <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '0ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '150ms' }} />
      <span className="h-1.5 w-1.5 rounded-full bg-primary/70 animate-bounce" style={{ animationDelay: '300ms' }} />
    </span>
  )
}

export function SherineChat() {
  const { currentStudent } = useAppStore()
  const [open, setOpen] = React.useState(false)
  const [messages, setMessages] = React.useState<ChatMessage[]>([{ role: 'assistant', content: GREETING }])
  const [input, setInput] = React.useState('')
  const [sending, setSending] = React.useState(false)
  const [restored, setRestored] = React.useState(false)
  const messagesEndRef = React.useRef<HTMLDivElement | null>(null)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  /* استرجاع المحادثة مرة واحدة بعد أول رندر (عشان مش نكسر الهيدريشن) */
  React.useEffect(function () {
    var stored = loadStored()
    if (stored.length > 0) setMessages(stored)
    setRestored(true)
  }, [])

  /* حفظ كل تغيير بعد الاسترجاع */
  React.useEffect(function () {
    if (!restored) return
    saveStored(messages)
  }, [messages, restored])

  /* سكرول لآخر رسالة */
  React.useEffect(function () {
    if (messagesEndRef.current) messagesEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, open, sending])

  /* فوكس على خانة الكتابة لما الشات يفتح */
  React.useEffect(function () {
    if (open && inputRef.current) {
      var t = setTimeout(function () { if (inputRef.current) inputRef.current.focus() }, 120)
      return function () { clearTimeout(t) }
    }
  }, [open])

  var send = async function () {
    var text = input.trim()
    if (!text || sending) return
    if (text.length > 2000) {
      toast.error('الرسالة طويلة أوي — اكتبيها في 2000 حرف أو أقل 😅')
      return
    }
    var userMsg: ChatMessage = { role: 'user', content: text }
    var history = messages
      .filter(function (m) { return m.role === 'user' || m.role === 'assistant' })
      .filter(function (m) { return m.content !== GREETING })
      .slice(-MAX_HISTORY_SENT)
      .map(function (m) { return { role: m.role, content: m.content } })

    setMessages(function (prev) { return prev.concat([userMsg]) })
    setInput('')
    setSending(true)
    try {
      var res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          persona: 'sherine',
          stream: false,
          history: history,
          context: { studentId: currentStudent?.id || '', page: 'student-portal' },
        }),
      })
      var data: any = null
      try { data = await res.json() } catch (e) { data = null }
      if (res.ok && data && data.reply) {
        setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: String(data.reply) }]) })
      } else {
        var errMsg = (data && data.error) ? String(data.error) : 'شيرين مشغولة شوية دلوقتي — جرب تاني بعد لحظة 🙏'
        setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: errMsg }]) })
      }
    } catch (e) {
      setMessages(function (prev) { return prev.concat([{ role: 'assistant', content: 'حصلت مشكلة في الاتصال — اتأكد إن النت شغال وجرب تاني 🙏' }]) })
    }
    setSending(false)
  }

  var clearChat = function () {
    setMessages([{ role: 'assistant', content: GREETING }])
    try { localStorage.removeItem(STORAGE_KEY) } catch (e) {}
    toast.success('اتمسحت المحادثة — نبدأ من الأول 🌟')
  }

  /* من غير طالب مسجل دخول — مفيش شيرين */
  if (!currentStudent) return null

  return (
    <>
      {/* الزرار العائم — تحت على الشمال (المساعد الذكي على اليمين) */}
      {!open && (
        <button
          type="button"
          onClick={function () { setOpen(true) }}
          className="fixed bottom-5 left-5 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center cursor-pointer"
          aria-label="افتح شات شيرين — المساعدة الشخصية في الرياضيات"
        >
          <Sparkles className="h-6 w-6" />
        </button>
      )}

      {open && (
        <div
          dir="rtl"
          className="fixed bottom-24 left-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[380px] max-w-[380px] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="شات شيرين — المساعدة الشخصية في الرياضيات"
        >
          {/* الهيدر */}
          <div className="flex items-center justify-between gap-2 px-3 py-2 bg-gradient-to-l from-pink-500/15 to-rose-500/10 border-b border-border">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-9 w-9 shrink-0 rounded-full bg-gradient-to-br from-pink-500 to-rose-500 text-white flex items-center justify-center">
                <Sparkles className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold leading-tight">شيرين</p>
                <p className="text-[10px] text-muted-foreground leading-tight">مساعدتك الشخصية في الرياضيات — بترد فورًا 🌟</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={clearChat}
                className="h-11 w-11 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer"
                aria-label="مسح المحادثة وابدأ من جديد"
                title="مسح المحادثة"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={function () { setOpen(false) }}
                className="h-11 w-11 rounded-lg inline-flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                aria-label="اقفل الشات"
                title="اقفل"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* الرسايل — max-h مع سكرول */}
          <div className="max-h-[380px] min-h-[180px] overflow-y-auto custom-scrollbar px-3 py-3 space-y-2.5">
            {messages.map(function (m, i) {
              var isUser = m.role === 'user'
              return (
                <div key={i} className={'flex ' + (isUser ? 'justify-end' : 'justify-start')}>
                  <div
                    className={
                      'max-w-[85%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap break-words ' +
                      (isUser
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md')
                    }
                  >
                    {isUser ? m.content : <FractionText text={m.content} />}
                  </div>
                </div>
              )
            })}
            {sending && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-md px-3 py-1.5">
                  <LoadingDots />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* خانة الكتابة + الإرسال */}
          <div className="border-t border-border p-2 flex items-center gap-2">
            <input
              ref={inputRef}
              value={input}
              onChange={function (e) { setInput(e.target.value) }}
              onKeyDown={function (e) { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
              placeholder="اكتب سؤالك لشيرين…"
              className="flex-1 h-11 rounded-xl border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-primary/40"
              maxLength={2000}
              disabled={sending}
              aria-label="اكتب رسالتك لشيرين"
            />
            <button
              type="button"
              onClick={send}
              disabled={sending || !input.trim()}
              className="h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-pink-500 to-rose-500 text-white inline-flex items-center justify-center shadow disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 transition-opacity cursor-pointer"
              aria-label="ابعت الرسالة"
            >
              <Send className="h-4 w-4 -scale-x-100" />
            </button>
          </div>
        </div>
      )}
    </>
  )
}

export default SherineChat
