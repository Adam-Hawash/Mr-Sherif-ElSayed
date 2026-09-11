'use client'

/* ============================================================
   (2026-و26) صفحة الشكاوى العامة — من غير تسجيل دخول خالص
   ------------------------------------------------------------
   اللي يدوس على لينك «قسم الشكاوى» في صفحة الدخول/التسجيل
   بيجي هنا ويكتب: اسمه + رقم تليفونه + الشكوى (مثلاً مش عارف
   يدخل على حسابه). الشكوى بتوصل لصفحة الأدمن فورًا
   (بادج «زائر» في لوحة الشكاوى).
   الصفحة عامة 100% — مفيش أي حاجة بتتحقق من الدخول.
   ============================================================ */
import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Loader2, MessageSquareHeart, Send, CheckCircle2, Home, Phone, User, GraduationCap } from 'lucide-react'

var GRADES = [
  'الصف الأول الإعدادي',
  'الصف الثاني الإعدادي',
  'الصف الثالث الإعدادي',
  'الصف الأول الثانوي',
  'الصف الثاني الثانوي',
  'الصف الثالث الثانوي',
]

export default function PublicComplaintsPage() {
  var [name, setName] = useState('')
  var [phone, setPhone] = useState('')
  var [grade, setGrade] = useState('')
  var [message, setMessage] = useState('')
  var [sending, setSending] = useState(false)
  var [done, setDone] = useState(false)
  var [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError('')

    var n = name.trim()
    var p = phone.replace(/[\s-]/g, '')
    var m = message.trim()

    if (n.length < 2) { setError('اكتب اسمك الأول'); return }
    if (!/^0\d{9,11}$/.test(p)) { setError('اكتب رقم تليفون صحيح (زي 010xxxxxxxx)'); return }
    if (m.length < 5) { setError('اكتب الشكوى بتاعتك (5 حروف على الأقل)'); return }

    setSending(true)
    try {
      var res = await fetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName: n, phone: p, grade: grade || '', message: m, source: 'public' }),
      })
      var data: any = {}
      try { data = await res.json() } catch (err) {}
      if (res.ok) {
        setDone(true)
      } else {
        setError(data.error || 'حصلت مشكلة — جرب تاني')
      }
    } catch (err) {
      setError('مفيش اتصال بالسيرفر — اتأكد من النت وجرب تاني')
    }
    setSending(false)
  }

  return (
    <main className="min-h-screen bg-background text-foreground flex flex-col" dir="rtl">
      {/* الهيدر */}
      <header className="border-b bg-card">
        <div className="max-w-2xl mx-auto px-4 py-3.5 flex items-center justify-between gap-3">
          <Link href="/" className="flex items-center gap-2 font-bold text-sm hover:opacity-80 transition-opacity">
            <span className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center">
              <GraduationCap className="h-4 w-4" />
            </span>
            <span className="hidden sm:inline">الصفحة الرئيسية</span>
          </Link>
          <span className="text-[11px] text-muted-foreground">شكواك بتوصل للمستر على طول</span>
        </div>
      </header>

      <div className="flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl">
          {done ? (
            /* ===== شاشة النجاح ===== */
            <Card className="text-center border-emerald-500/40">
              <CardContent className="pt-10 pb-10 space-y-4">
                <span className="mx-auto h-16 w-16 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                  <CheckCircle2 className="h-9 w-9" />
                </span>
                <h1 className="text-2xl font-extrabold">شكواك وصلت للمستر ✅</h1>
                <p className="text-sm text-muted-foreground leading-relaxed max-w-sm mx-auto">
                  المستر هيشوف شكواك في أقرب وقت، ولو كتبت رقم تليفون صحيح هيتم التواصل معاك.
                </p>
                <Button asChild className="mt-2">
                  <Link href="/">
                    <Home className="h-4 w-4 ml-1.5" />
                    الرجوع للمنصة
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (
            /* ===== فورم الشكوى ===== */
            <Card>
              <CardHeader className="text-center space-y-2">
                <span className="mx-auto h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <MessageSquareHeart className="h-7 w-7" />
                </span>
                <CardTitle className="text-2xl font-extrabold">قسم الشكاوى</CardTitle>
                <CardDescription className="leading-relaxed">
                  عندك مشكلة ومش عارف تدخل على حسابك؟ أو أي حاجة تانية؟
                  <br />
                  اكتب اسمك ورقم تليفونك والشكوى — والمستر هيشوفها فورًا. <span className="text-xs">(من غير تسجيل دخول)</span>
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={submit} className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <Label htmlFor="cname" className="text-xs font-bold flex items-center gap-1">
                        <User className="h-3.5 w-3.5" /> الاسم *
                      </Label>
                      <Input id="cname" value={name} onChange={function (e) { setName(e.target.value) }}
                        placeholder="اسمك بالكامل" className="h-10" maxLength={120} required />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="cphone" className="text-xs font-bold flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" /> رقم التليفون *
                      </Label>
                      <Input id="cphone" value={phone} onChange={function (e) { setPhone(e.target.value) }}
                        placeholder="010xxxxxxxx" className="h-10" dir="ltr" inputMode="tel" maxLength={20} required />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold flex items-center gap-1">
                      <GraduationCap className="h-3.5 w-3.5" /> الصف الدراسي (اختياري)
                    </Label>
                    <Select value={grade} onValueChange={setGrade} dir="rtl">
                      <SelectTrigger className="h-10 w-full"><SelectValue placeholder="اختار صفك" /></SelectTrigger>
                      <SelectContent>
                        {GRADES.map(function (g) { return <SelectItem key={g} value={g}>{g}</SelectItem> })}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="cmsg" className="text-xs font-bold">الشكوى *</Label>
                    <Textarea id="cmsg" value={message} onChange={function (e) { setMessage(e.target.value) }}
                      placeholder="اكتب المشكلة بالتفصيل — مثلاً: بحاول أدخل على حسابي بيقولي الجهاز غلط…" className="min-h-[120px]" maxLength={4000} required />
                  </div>

                  {error && (
                    <p className="text-xs font-bold text-destructive bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2.5">{error}</p>
                  )}

                  <Button type="submit" disabled={sending} className="w-full h-11 text-sm font-bold">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin ml-1.5" /> : <Send className="h-4 w-4 ml-1.5" />}
                    {sending ? 'جاري الإرسال…' : 'إرسال الشكوى للمستر'}
                  </Button>

                  <p className="text-[11px] text-muted-foreground text-center leading-relaxed">
                    لو المشكلة في الدخول — اكتب اسم الحساب أو رقم التليفون اللي مسجل بيه عشان نقدر نساعدك أسرع.
                  </p>
                </form>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </main>
  )
}
