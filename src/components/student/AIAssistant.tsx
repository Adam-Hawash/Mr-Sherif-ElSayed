'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, X, Sparkles, Loader2, ImagePlus } from 'lucide-react'
import { toast } from 'sonner'
/* (2026-و33) طلب المستر: المساعد يكتب برموز المنصة اللي بتظهر للطلاب —
   نفس العارض بتاع الأسئلة (كسور رأسية + أُس حقيقي + جذر) بدل LaTeX خام */
import { FractionText } from '@/components/FractionText'

interface Message {
  role: 'user' | 'assistant'
  content: string
  images?: string[]
}

interface PendingImage {
  id: string
  dataUrl: string
}

var MAX_IMAGES = 3 // per message (client side)

/* Read an image file and downscale it to max 1280px JPEG so the
   request payload stays small — IMAGES ONLY. */
async function fileToDataUrl(file: File): Promise<string> {
  var dataUrl = await new Promise<string>(function (resolve, reject) {
    var reader = new FileReader()
    reader.onload = function () { resolve(String(reader.result)) }
    reader.onerror = function () { reject(new Error('read')) }
    reader.readAsDataURL(file)
  })
  try {
    var img = await new Promise<HTMLImageElement>(function (resolve, reject) {
      var im = document.createElement('img')
      im.onload = function () { resolve(im) }
      im.onerror = function () { reject(new Error('decode')) }
      im.src = dataUrl
    })
    var maxDim = 1280
    var w = img.naturalWidth || img.width
    var h = img.naturalHeight || img.height
    if (!w || !h) return dataUrl
    if (w > maxDim || h > maxDim) {
      var k = Math.min(maxDim / w, maxDim / h)
      w = Math.round(w * k)
      h = Math.round(h * k)
    }
    var canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    var ctx = canvas.getContext('2d')
    if (!ctx) return dataUrl
    ctx.drawImage(img, 0, 0, w, h)
    return canvas.toDataURL('image/jpeg', 0.85)
  } catch (e) {
    return dataUrl
  }
}

export function AIAssistant() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'أهلاً بك 👋 أنا المساعد الذكي بتاع منصة مستر شريف السيد. اسألني عن أي حاجة في الماث، ولو عندك واجب: جرب تحل الأول وصوّر حلك وابعتلي الصورة — هوريك إجابتك زي ما كتبتها وأقارنها بالإجابة الصحيحة سؤال بسؤال 📸',
    },
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [waiting, setWaiting] = useState(false) // sent, no first token yet
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // مرجع دايمًا بيشاور على آخر رسائل — عشان نبعت تاريخ المحادثة للسيرفر
  const messagesRef = useRef<Message[]>([])
  useEffect(function () { messagesRef.current = messages }, [messages])

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, open, loading])

  useEffect(() => {
    if (open && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 100)
    }
  }, [open])

  const handlePickImages = async function (e: React.ChangeEvent<HTMLInputElement>) {
    var files = e.target.files
    if (!files || files.length === 0) return
    var room = MAX_IMAGES - pendingImages.length
    var list: File[] = []
    for (var i = 0; i < files.length && list.length < Math.max(0, room); i++) list.push(files[i])
    if (files.length > list.length) toast.error('أقصى عدد صور في الرسالة الواحدة هو ' + MAX_IMAGES)
    var added: PendingImage[] = []
    for (var j = 0; j < list.length; j++) {
      var f = list[j]
      if (!f.type || f.type.indexOf('image/') !== 0) {
        toast.error('مسموح بالصور فقط: ' + f.name)
        continue
      }
      if (f.size > 10 * 1024 * 1024) {
        toast.error('الصورة كبيرة جداً (الحد الأقصى 10MB): ' + f.name)
        continue
      }
      try {
        var dataUrl = await fileToDataUrl(f)
        added.push({ id: Date.now() + '-' + j, dataUrl: dataUrl })
      } catch (err) {
        toast.error('مش قادر أفتح الصورة: ' + f.name)
      }
    }
    if (added.length > 0) setPendingImages(function (prev) { return prev.concat(added) })
    e.target.value = ''
  }

  const removePendingImage = function (id: string) {
    setPendingImages(function (prev) { return prev.filter(function (p) { return p.id !== id }) })
  }

  const sendMessage = async () => {
    var msg = input.trim()
    var imgs = pendingImages.map(function (p) { return p.dataUrl })
    if ((!msg && imgs.length === 0) || loading) return

    setInput('')
    setPendingImages([])
    // user message + empty assistant placeholder (the streaming target)
    setMessages(function (prev) {
      return [...prev, { role: 'user', content: msg, images: imgs.length > 0 ? imgs : undefined }, { role: 'assistant', content: '' }]
    })
    setLoading(true)
    setWaiting(true)

    // Get current page context
    var page = typeof window !== 'undefined' ? window.location.pathname : ''
    var studentId = ''
    try {
      var stored = localStorage.getItem('current-student')
      if (stored) {
        var parsed = JSON.parse(stored)
        if (parsed && parsed.state && parsed.state.currentStudent) {
          studentId = parsed.state.currentStudent.id || ''
        }
      }
    } catch (e) {}

    // Inactivity timeout: abort only when NO new token arrives for a while
    // (tokens keep resetting it, so a long answer is never cut off)
    var controller = new AbortController()
    var inactivityMs = imgs.length > 0 ? 60000 : 45000
    var inactivityTimer: any = null
    var armInactivity = function () {
      if (inactivityTimer) clearTimeout(inactivityTimer)
      inactivityTimer = setTimeout(function () { try { controller.abort() } catch (e) {} }, inactivityMs)
    }
    armInactivity()

    var gotFirst = false
    var fillAssistant = function (text: string) {
      setMessages(function (prev) {
        var copy = prev.slice()
        for (var i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'assistant') { copy[i] = { role: 'assistant', content: text }; break }
        }
        return copy
      })
    }
    var appendDelta = function (d: string) {
      if (!gotFirst) { gotFirst = true; setWaiting(false) }
      armInactivity()
      setMessages(function (prev) {
        var copy = prev.slice()
        for (var i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'assistant') { copy[i] = { role: 'assistant', content: copy[i].content + d }; break }
        }
        return copy
      })
    }

    try {
      // تاريخ المحادثة: آخر 8 رسائل (من غير placeholder المساعد الفاضي الأخير)
      var historyForApi = (function () {
        var arr = messagesRef.current.slice(0, -1).filter(function (m) { return m.content && m.content.trim() })
        return arr.slice(-8).map(function (m) { return { role: m.role, content: m.content } })
      })()
      var res = await fetch('/api/ai/assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: msg || 'شوف الصور دي وساعدني فيها.',
          images: imgs.length > 0 ? imgs : undefined,
          history: historyForApi,
          context: { page: page, studentId: studentId },
          stream: true,
        }),
        signal: controller.signal,
      })

      var ctype = res.headers.get('content-type') || ''
      if (!res.ok || ctype.indexOf('text/event-stream') < 0) {
        // legacy JSON / error response
        var jdata: any = null
        try { jdata = await res.json() } catch (e) {}
        var reply = (jdata && (jdata.reply || jdata.error)) || 'مش قادر أرد دلوقتي. حاول تاني 🙏'
        fillAssistant(reply)
      } else {
        // ---- SSE stream: append tokens as they arrive ----
        var reader = res.body ? res.body.getReader() : null
        if (!reader) throw new Error('no stream body')
        var decoder = new TextDecoder()
        var buf = ''
        var errMsg = ''
        while (true) {
          var chunk = await reader.read()
          if (chunk.done) break
          buf += decoder.decode(chunk.value, { stream: true })
          var lines = buf.split('\n')
          buf = lines.pop() || ''
          for (var li = 0; li < lines.length; li++) {
            var line = lines[li].trim()
            if (!line || line.indexOf('data:') !== 0) continue
            var payload = line.slice(5).trim()
            if (!payload) continue
            if (payload === '[DONE]') continue
            try {
              var ev = JSON.parse(payload)
              if (ev.delta) appendDelta(ev.delta)
              else if (ev.error) errMsg = String(ev.error)
            } catch (e) {}
          }
        }
        if (errMsg) {
          setMessages(function (prev) {
            var copy = prev.slice()
            for (var i = copy.length - 1; i >= 0; i--) {
              if (copy[i].role === 'assistant') {
                var base = copy[i].content
                copy[i] = { role: 'assistant', content: base ? base + '\n\n' + errMsg : errMsg }
                break
              }
            }
            return copy
          })
        }
      }
    } catch (e) {
      var aborted = (e as any) && (e as any).name === 'AbortError'
      setMessages(function (prev) {
        var copy = prev.slice()
        for (var i = copy.length - 1; i >= 0; i--) {
          if (copy[i].role === 'assistant') {
            var base = copy[i].content
            if (base) {
              // partial answer already streamed — keep it, just note the cut
              if (aborted) copy[i] = { role: 'assistant', content: base + '\n\n(الرد اتقطع — ابعت أي سؤال عشان نكمل 🙏)' }
            } else {
              copy[i] = { role: 'assistant', content: aborted ? 'الرد اتأخر جداً فاتقطع. جرب تاني 🙏' : 'حصلت مشكلة في الاتصال. حاول تاني 🙏' }
            }
            break
          }
        }
        return copy
      })
    }
    if (inactivityTimer) clearTimeout(inactivityTimer)
    setWaiting(false)
    setLoading(false)
  }

  return (
    <>
      {/* Floating Button */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="fixed bottom-5 right-5 z-50 h-14 w-14 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 text-white shadow-lg hover:scale-105 transition-transform flex items-center justify-center"
        style={{ boxShadow: '0 4px 20px rgba(139, 92, 246, 0.4)' }}
        title="مساعد ذكي"
        aria-label="مساعد ذكي"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>

      {/* Chat Window */}
      {open && (
        <div className="fixed bottom-24 right-5 z-50 w-[calc(100vw-2.5rem)] sm:w-[400px] max-w-[400px] max-h-[500px] flex flex-col bg-card border border-border rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-purple-500 to-blue-500 text-white p-3 flex items-center gap-2 shrink-0">
            <div className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
              <Sparkles className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-sm">المساعد الذكي</p>
              <p className="text-[10px] opacity-90">اسألني أي حاجة أو ابعت صورة حلك للمقارنة 📸</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="h-8 w-8 rounded-full hover:bg-white/20 flex items-center justify-center transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar" style={{ minHeight: '250px', maxHeight: '350px' }}>
            {messages.map(function (msg, i) {
              var isUser = msg.role === 'user'
              var showCursor = !isUser && loading && !waiting && i === messages.length - 1
              return (
                <div key={i} className={'flex ' + (isUser ? 'justify-start' : 'justify-end')}>
                  <div
                    className={
                      'max-w-[85%] p-2.5 rounded-2xl text-sm whitespace-pre-wrap break-words ' +
                      (isUser
                        ? 'bg-primary text-primary-foreground rounded-tl-none'
                        : 'bg-muted text-foreground rounded-tr-none')
                    }
                    dir="auto"
                  >
                    {msg.images && msg.images.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mb-1.5">
                        {msg.images.map(function (src, ii) {
                          return (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={ii}
                              src={src}
                              alt="صورة مرفقة"
                              className="w-24 h-24 object-cover rounded-lg border border-white/20 cursor-default"
                              draggable={false}
                            />
                          )
                        })}
                      </div>
                    )}
                    {/* (2026-و33) ردود المساعد بتترسم بعارض رياضيات المنصة نفسه —
                        \frac بيبقى كسر رأسي و^ أُس و\sqrt جذر — وإيدي رسايل الطالب عادية */}
                    {isUser ? msg.content : <FractionText text={msg.content} />}
                    {showCursor && <span className="inline-block w-2 h-3.5 bg-muted-foreground/50 animate-pulse rounded-sm align-middle" aria-hidden="true" />}
                  </div>
                </div>
              )
            })}
            {loading && waiting && (
              <div className="flex justify-end">
                <div className="bg-muted text-foreground p-2.5 rounded-2xl rounded-tr-none flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-xs">بيفكر...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Pending images preview */}
          {pendingImages.length > 0 && (
            <div className="px-3 pt-2 bg-card shrink-0">
              <div className="flex flex-wrap gap-2">
                {pendingImages.map(function (img) {
                  return (
                    <div key={img.id} className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.dataUrl}
                        alt="صورة جاهزة للإرسال"
                        className="w-16 h-16 object-cover rounded-lg border border-border"
                        draggable={false}
                      />
                      <button
                        type="button"
                        aria-label="حذف الصورة"
                        onClick={function () { removePendingImage(img.id) }}
                        className="absolute -top-1.5 -left-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center shadow"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-border bg-card shrink-0">
            <div className="flex items-center gap-2">
              {/* Attach image (images only) */}
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={handlePickImages}
              />
              <button
                type="button"
                aria-label="إرفاق صورة"
                title="ابعت صورة مسألة"
                disabled={loading || pendingImages.length >= MAX_IMAGES}
                onClick={function () { if (fileRef.current) fileRef.current.click() }}
                className="h-10 w-10 rounded-full border border-input bg-background text-muted-foreground hover:text-primary hover:border-primary/40 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
              >
                <ImagePlus className="h-5 w-5" />
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={function (e) { setInput(e.target.value) }}
                onKeyDown={function (e) {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    sendMessage()
                  }
                }}
                placeholder="اكتب سؤالك أو ابعت صورة حلك..."
                disabled={loading}
                className="flex-1 h-10 px-3 rounded-full bg-background border border-input text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                maxLength={500}
              />
              <button
                type="button"
                onClick={sendMessage}
                disabled={loading || (!input.trim() && pendingImages.length === 0)}
                className="h-10 w-10 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center transition-colors shrink-0"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
