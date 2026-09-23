'use client'

// ============================================================
// (2026-و37) شاشات ولي الأمر — تسجيل + دخول (طلب المستر):
//   التسجيل: اسم الطالب ابنه (زي ما هو متسجل) + رقم تليفون ابنه المسجل
//   + باسورد ابنه + رقم ولي الأمر الشخصي (لازم يكون هو المسجل على حساب
//   ابنه) + باسورد شخصي جديد لولي الأمر — ولو الحاجات مش مربوطة رسالة واضحة
// ============================================================

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/stores/app-store'
import { ArrowRight, Phone, Lock, Loader2, AlertCircle, UserCheck, UserPlus, Eye, EyeOff, X } from 'lucide-react'
import { toast } from 'sonner'

var fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

function ParentPhoneField(props: any) {
  var value = props.value
  var onChange = props.onChange
  var placeholder = props.placeholder
  var id = props.id
  var error = props.error
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-foreground">{placeholder} <span className="text-destructive">*</span></Label>
      <div className="relative">
        <Phone className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input id={id} inputMode="numeric" placeholder={placeholder} value={value} onChange={function (e) { var v = e.target.value.replace(/[^\d]/g, ''); if (v.length <= 11) onChange(v) }} dir="ltr" className={'pr-10 min-h-[44px]' + (error ? ' border-destructive focus-visible:ring-destructive' : '')} maxLength={13} />
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

function ParentPasswordField(props: any) {
  var value = props.value
  var onChange = props.onChange
  var placeholder = props.placeholder
  var id = props.id
  var error = props.error
  var showState = useState(false)
  var show = showState[0]
  var setShow = showState[1]
  return (
    <div className="space-y-2">
      <Label htmlFor={id} className="text-foreground">{placeholder} <span className="text-destructive">*</span></Label>
      <div className="relative">
        <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input id={id} type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={function (e) { onChange(e.target.value) }} dir="ltr" className={'pr-10 pl-10 min-h-[44px]' + (error ? ' border-destructive focus-visible:ring-destructive' : '')} autoComplete="new-password" />
        <button type="button" onClick={function () { setShow(!show) }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer" aria-label="إظهار كلمة المرور">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

export function ParentRegisterView() {
  var store = useAppStore()
  var setView = store.setView
  var setCurrentParent = store.setCurrentParent
  var snState = useState(''); var studentName = snState[0]; var setStudentName = snState[1]
  var spState = useState(''); var studentPhone = spState[0]; var setStudentPhone = spState[1]
  var spwState = useState(''); var studentPassword = spwState[0]; var setStudentPassword = spwState[1]
  var ppState = useState(''); var parentPhone = ppState[0]; var setParentPhone = ppState[1]
  var ppwState = useState(''); var parentPassword = ppwState[0]; var setParentPassword = ppwState[1]
  var ppw2State = useState(''); var parentPassword2 = ppw2State[0]; var setParentPassword2 = ppw2State[1]
  var ls = useState(false); var loading = ls[0]; var setLoading = ls[1]
  var es = useState<Record<string, string>>({}); var errors = es[0]; var setErrors = es[1]
  /* (2026-و92) زرار «إضافة طالب» في التسجيل — طلب المستر الحرفي:
     «لما يجي يعمل حساب يدوس إضافة طالب من قبل ما يدوس يعمل حساب
     ويضيف بيانات الطالب الثاني» — بيانات كل ابن (اسم + رقم + باسورد)
     بتتربط بحساب ولي الأمر من أول ما يتفتح */
  var exsState = useState<Array<{ name: string; phone: string; pwd: string }>>([])
  var extraStudents = exsState[0]; var setExtraStudents = exsState[1]
  var seState = useState(false); var showExtra = seState[0]; var setShowExtra = seState[1]
  var enState = useState(''); var exName = enState[0]; var setExName = enState[1]
  var epState = useState(''); var exPhone = epState[0]; var setExPhone = epState[1]
  var epwState = useState(''); var exPwd = epwState[0]; var setExPwd = epwState[1]

  var addExtraStudent = function () {
    var n = exName.trim(), p = exPhone.trim(), w = exPwd
    if (!n || !p || !w) { toast.error('اكتب اسم ابنك ورقم تليفونه وباسورده كاملين'); return }
    var samePhone = (studentPhone.trim() && p === studentPhone.trim()) || extraStudents.some(function (s) { return s.phone === p })
    if (samePhone) { toast.error('الرقم ده مكتوب قبل كده — كل ابن له رقم مختلف'); return }
    var list = extraStudents.slice()
    list.push({ name: n, phone: p, pwd: w })
    setExtraStudents(list)
    setExName(''); setExPhone(''); setExPwd('')
    setShowExtra(false)
    toast.success('اتضاف ' + n + ' ✅ — هيتربط بحسابك أول ما تعمل الحساب')
  }

  var handleRegister = async function () {
    var e: Record<string, string> = {}
    if (!studentName.trim()) e.studentName = 'اكتب اسم ابنك زي ما هو متسجل'
    if (!studentPhone.trim()) e.studentPhone = 'مطلوب'
    if (!studentPassword.trim()) e.studentPassword = 'مطلوب'
    if (!parentPhone.trim()) e.parentPhone = 'مطلوب'
    if (!parentPassword.trim()) e.parentPassword = 'مطلوب'
    else if (parentPassword.trim().length < 4) e.parentPassword = '4 أحرف على الأقل'
    if (parentPassword2.trim() && parentPassword.trim() !== parentPassword2.trim()) e.parentPassword2 = 'مش مطابق'
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error('الرجاء إكمال الحقول المشار إليها'); return }
    setLoading(true)
    try {
      var res = await fetch('/api/parents/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          studentName: studentName.trim(),
          studentPhone: studentPhone.trim(),
          studentPassword: studentPassword,
          parentPhone: parentPhone.trim(),
          parentPassword: parentPassword,
          parentPassword2: parentPassword2,
          /* (2026-و92) الأبناء الإضافيين من زرار «إضافة طالب» */
          extraStudents: extraStudents.map(function (s) { return { studentName: s.name, studentPhone: s.phone, studentPassword: s.pwd } }),
        }),
      })
      var data = await res.json()
      if (res.ok && data.parent) {
        setCurrentParent(data.parent)
        setView('parent-portal')
        var extraCount = Number(data.linkedExtraStudents || 0)
        toast.success('تم عمل حسابك كولي أمر ✅ دي متابعة ' + (extraCount > 0 ? ('حسابات ' + (extraCount + 1) + ' طلاب') : 'نتايج ' + (data.parent.student ? data.parent.student.name : 'ابنك')))
      } else {
        var msg = data.error || 'حصلت مشكلة في التسجيل'
        toast.error(msg, { duration: 10000 })
        if (data.field) setErrors(function (prev) { var n = { ...prev }; n[data.field] = 'بيانات غير مطابقة'; return n })
      }
    } catch (err) {
      toast.error('حدث خطأ في الاتصال')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
      <motion.div className="w-full max-w-lg" initial="hidden" animate="visible" variants={fadeInUp} transition={{ duration: 0.5, ease: 'easeOut' }}>
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-3"><UserCheck className="h-7 w-7 text-primary" /></div>
          <h1 className="text-2xl font-bold text-foreground mb-1">حساب ولي أمر</h1>
          <p className="text-sm text-muted-foreground">تابع نتايج ابنك ومستوى كل واجب وامتحان</p>
        </div>
        <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-gold-400 via-gold-600 to-gold-400">
          <Card className="rounded-2xl border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="space-y-4">
                <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-3">
                  <p className="text-[13px] leading-relaxed text-foreground">
                    <span className="font-bold">إزاي بيشتغل؟</span> بنربط حسابك بحساب ابنك الموجود في المنصة — فلازم بيانات ابنك تكون زي ما هي متسجلة بالظبط، ورقم تليفونك الشخصي يكون هو المسجل على حسابه.
                  </p>
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">بيانات ابنك (المسجلة في المنصة)</p>
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label htmlFor="pr-student-name" className="text-foreground text-xs">اسم الطالب (ابنك) <span className="text-destructive">*</span></Label>
                      <Input id="pr-student-name" placeholder="زي ما هو متسجل في المنصة بالظبط" value={studentName} onChange={function (e) { setStudentName(e.target.value) }} className={'min-h-[44px]' + (errors.studentName ? ' border-destructive focus-visible:ring-destructive' : '')} />
                      {errors.studentName && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.studentName}</p>}
                    </div>
                    <ParentPhoneField value={studentPhone} onChange={setStudentPhone} placeholder="رقم تليفون ابنك المسجل في المنصة" id="pr-student-phone" error={errors.studentPhone} />
                    <ParentPasswordField value={studentPassword} onChange={setStudentPassword} placeholder="باسورد ابنك (اللي بيدخل بيه)" id="pr-student-password" error={errors.studentPassword} />
                  </div>
                </div>
                {/* (2026-و92) زرار «إضافة طالب» قبل إنشاء الحساب — الأبناء الإضافيين */}
                {extraStudents.length > 0 && (
                  <div className="space-y-1.5">
                    {extraStudents.map(function (s, i) {
                      return (
                        <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-bold text-foreground truncate">{s.name}</p>
                            <p className="text-[10.5px] text-muted-foreground" dir="ltr">{s.phone}</p>
                          </div>
                          <button type="button" onClick={function () { setExtraStudents(extraStudents.filter(function (_, j) { return j !== i })) }} className="shrink-0 h-8 w-8 grid place-items-center rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors cursor-pointer" aria-label="شيل الطالب ده">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      )
                    })}
                  </div>
                )}
                {showExtra ? (
                  <div className="rounded-xl border border-primary/25 bg-primary/[0.04] p-3.5 space-y-3">
                    <p className="text-[13px] font-bold text-foreground">بيانات الابن التاني</p>
                    <div className="space-y-1.5">
                      <Label htmlFor="pr-ex-name" className="text-foreground text-xs">اسم الطالب (زي ما هو متسجل في المنصة) <span className="text-destructive">*</span></Label>
                      <Input id="pr-ex-name" placeholder="زي ما هو متسجل في المنصة بالظبط" value={exName} onChange={function (e) { setExName(e.target.value) }} className="min-h-[44px]" />
                    </div>
                    <ParentPhoneField value={exPhone} onChange={setExPhone} placeholder="رقم تليفونه المسجل في المنصة" id="pr-ex-phone" />
                    <ParentPasswordField value={exPwd} onChange={setExPwd} placeholder="باسورده (اللي بيدخل بيه)" id="pr-ex-password" />
                    <div className="grid grid-cols-2 gap-2">
                      <Button type="button" size="sm" className="h-10 font-bold gap-1.5" onClick={addExtraStudent}><UserPlus className="h-4 w-4" />احفظ الطالب</Button>
                      <Button type="button" size="sm" variant="ghost" className="h-10 font-bold" onClick={function () { setShowExtra(false); setExName(''); setExPhone(''); setExPwd('') }}>إلغاء</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={function () { setShowExtra(true) }}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-primary/40 bg-primary/[0.04] px-3.5 py-3 text-primary hover:bg-primary/[0.08] transition-colors cursor-pointer min-h-[44px]"
                  >
                    <UserPlus className="h-4.5 w-4.5 shrink-0" />
                    <span className="text-[13px] font-bold">عندك ابن تاني؟ اضغط إضافة طالب وحُط بياناته هنا</span>
                  </button>
                )}
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">بياناتك أنت (ولي الأمر)</p>
                  <div className="space-y-3">
                    <ParentPhoneField value={parentPhone} onChange={setParentPhone} placeholder="رقم تليفونك الشخصي (المسجل على حساب ابنك)" id="pr-parent-phone" error={errors.parentPhone} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <ParentPasswordField value={parentPassword} onChange={setParentPassword} placeholder="باسوردك الشخصي (جديد)" id="pr-parent-password" error={errors.parentPassword} />
                      <ParentPasswordField value={parentPassword2} onChange={setParentPassword2} placeholder="تأكيد باسوردك" id="pr-parent-password2" error={errors.parentPassword2} />
                    </div>
                  </div>
                </div>
                <Button className="w-full min-h-[44px] font-semibold" onClick={handleRegister} disabled={loading}>{loading ? (<><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري التسجيل...</>) : 'اعمل حساب ولي أمر'}</Button>
                <p className="text-center text-sm text-muted-foreground">مسجل قبل كده؟ <button onClick={function () { setView('parent-login') }} className="text-primary font-medium hover:underline cursor-pointer">سجل دخولك</button></p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 text-center"><button onClick={function () { setView('landing') }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 cursor-pointer"><ArrowRight className="h-4 w-4" />العودة للرئيسية</button></div>
      </motion.div>
    </div>
  )
}

export function ParentLoginView() {
  var store = useAppStore()
  var setView = store.setView
  var setCurrentParent = store.setCurrentParent
  var phState = useState(''); var phone = phState[0]; var setPhone = phState[1]
  var pwState = useState(''); var password = pwState[0]; var setPassword = pwState[1]
  var ls = useState(false); var loading = ls[0]; var setLoading = ls[1]

  var handleLogin = async function () {
    if (!phone.trim()) { toast.error('اكتب رقم تليفونك'); return }
    if (!password.trim()) { toast.error('اكتب باسوردك'); return }
    setLoading(true)
    try {
      var res = await fetch('/api/parents/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({ phone: phone.trim(), password: password }),
      })
      var data = await res.json()
      if (res.ok && data.parent) {
        setCurrentParent(data.parent)
        setView('parent-portal')
        toast.success('مرحبًا بك — دي متابعة حساب ' + (data.parent.student ? data.parent.student.name : 'ابنك'))
      } else {
        toast.error(data.error || 'الباسورد أو الرقم بتاعك غلط', { duration: 8000 })
      }
    } catch (err) {
      toast.error('حدث خطأ في الاتصال')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4"><UserCheck className="h-8 w-8 text-primary" /></div>
          <h1 className="text-2xl font-bold text-foreground mb-2">دخول ولي أمر</h1>
          <p className="text-sm text-muted-foreground">برقمك الشخصي وباسوردك انت — مش بيانات ابنك</p>
        </div>
        <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-gold-400 via-gold-600 to-gold-400">
          <Card className="rounded-2xl border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="space-y-4">
                <ParentPhoneField value={phone} onChange={setPhone} placeholder="رقم تليفونك الشخصي" id="pl-phone" />
                <ParentPasswordField value={password} onChange={setPassword} placeholder="باسوردك الشخصي" id="pl-password" />
                <button
                  type="button"
                  className="w-full min-h-[44px] font-semibold inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors px-4 py-2 cursor-pointer relative z-10"
                  onClick={handleLogin}
                  disabled={loading}
                  style={{ WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 10 }}
                >
                  {loading ? (<><Loader2 className="h-4 w-4 ml-2 animate-spin" />استنى شوية...</>) : 'ادخل حسابك'}
                </button>
                <p className="text-center text-sm text-muted-foreground">لسه مش عامل حساب؟ <button onClick={function () { setView('parent-register') }} className="text-primary font-medium hover:underline cursor-pointer">اعمل حساب ولي أمر</button></p>
                <p className="text-center text-sm text-muted-foreground">انت طالب؟ <button onClick={function () { setView('auth-login') }} className="text-primary font-medium hover:underline cursor-pointer">سجل دخولك من هنا</button></p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 text-center"><button onClick={function () { setView('landing') }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 cursor-pointer"><ArrowRight className="h-4 w-4" />العودة للرئيسية</button></div>
      </div>
    </div>
  )
}
