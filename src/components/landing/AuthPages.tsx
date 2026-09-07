'use client'

import { useState } from 'react'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { useAppStore, GRADES } from '@/stores/app-store'
import { getDeviceId, getDeviceCandidates, getDeviceType } from '@/lib/device'
import { ArrowRight, Phone, Lock, GraduationCap, Users, Loader2, AlertCircle, AlertTriangle, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

var fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0 },
}

var TEXT_ONLY_REGEX = /^[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFFa-zA-Z\s]+$/
var PHONE_REGEX = /^\d{11}$/

// Hidden admin entry: phone 22222222222 + this password redirects to admin login (تسجيل دخول المشرفين)
var ADMIN_PHONE = '22222222222'
var ADMIN_PASSWORD = 'mr sherif2026#'

// لافتة تحذير الجهاز الواحد — فوق صفحتين الدخول والتسجيل (من غير أي كلام عن مسح بيانات المتصفح)
function DeviceWarningBanner({ mode }: { mode: 'login' | 'register' }) {
  return (
    <div className="mb-5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 flex items-start gap-2.5" role="alert">
      <AlertTriangle className="h-4.5 w-4.5 text-amber-500 shrink-0 mt-0.5" />
      <p className="text-[13px] leading-relaxed text-foreground">
        {mode === 'register' ? (
          <>
            <span className="font-bold">مهم جدًا:</span> الحساب بيتقفل على <span className="font-bold">جهاز واحد بس</span> — الجهاز اللي هتعمل بيه الحساب دلوقتي. اعمل الحساب من الجهاز اللي هتفتح بيه المنصة دايمًا، ولو حصلت أي مشكلة كلم المستر.
          </>
        ) : (
          <>
            <span className="font-bold">تنبيه:</span> الحساب مربوط بـ <span className="font-bold">جهاز واحد بس</span> (الجهاز اللي اتعمل بيه). لو حصلت معاك أي مشكلة كلم المستر.
          </>
        )}
      </p>
    </div>
  )
}

function PhoneField(props) {
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
        <Input id={id} placeholder={placeholder} value={value} onChange={function (e) { var v = e.target.value.replace(/[^\d]/g, ''); if (v.length <= 11) onChange(v) }} dir="ltr" className={'pr-10 min-h-[44px]' + (error ? ' border-destructive focus-visible:ring-destructive' : '')} maxLength={11} />
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

function NameField(props) {
  var value = props.value
  var onChange = props.onChange
  var placeholder = props.placeholder
  var id = props.id
  var error = props.error
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-foreground text-xs">{placeholder} <span className="text-destructive">*</span></Label>
      <Input id={id} placeholder={placeholder} value={value} onChange={function (e) { onChange(e.target.value) }} className={'min-h-[44px]' + (error ? ' border-destructive focus-visible:ring-destructive' : '')} />
      {error && <p className="text-[10px] text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

function PasswordField(props) {
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
        <Input id={id} type={show ? 'text' : 'password'} placeholder={placeholder} value={value} onChange={function (e) { onChange(e.target.value) }} dir="ltr" className={'pr-10 pl-10 min-h-[44px]' + (error ? ' border-destructive focus-visible:ring-destructive' : '')} autoComplete={id.includes('login') ? 'current-password' : 'new-password'} />
        <button type="button" onClick={function() { setShow(!show) }} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer">
          {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
        </button>
      </div>
      {error && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{error}</p>}
    </div>
  )
}

export function LoginView() {
  var store = useAppStore()
  var setView = store.setView
  var setCurrentStudent = store.setCurrentStudent
  var setShowAdminLogin = store.setShowAdminLogin
  var phoneState = useState('')
  var studentPhone = phoneState[0]
  var setStudentPhone = phoneState[1]
  var passState1 = useState('')
  var studentPassword = passState1[0]
  var setStudentPassword = passState1[1]
  var loadState1 = useState(false)
  var studentLoading = loadState1[0]
  var setStudentLoading = loadState1[1]
  // رسالة الجهاز الحمراء — بتظهر جوه الكارت مش توست بس عشان الطالب يشوفها واخد باله
  var dbState = useState('')
  var deviceBlockMsg = dbState[0]
  var setDeviceBlockMsg = dbState[1]

  var handleStudentLogin = async function () {
    if (studentLoading) return
    if (!studentPhone.trim()) { toast.error('الرجاء إدخال رقم الهاتف'); return }
    if (!PHONE_REGEX.test(studentPhone.trim())) { toast.error('رقم الهاتف يجب أن يكون 11 رقم'); return }
    if (!studentPassword.trim()) { toast.error('الرجاء إدخال كلمة المرور'); return }
    setDeviceBlockMsg('')

    // Hidden admin entry: special phone + password redirects to admin login
    var squashPw = function (v: string) { return String(v || '').replace(/\s+/g, '') }
    if (studentPhone.trim() === ADMIN_PHONE && squashPw(studentPassword) === squashPw(ADMIN_PASSWORD)) {
      toast.success('جاري تحويلك إلى تسجيل دخول المشرفين...')
      setStudentPhone('')
      setStudentPassword('')
      setShowAdminLogin(true)
      setView('landing')
      return
    }

    setStudentLoading(true)
    try {
      var res = await fetch('/api/students?phone=' + encodeURIComponent(studentPhone.trim()) + '&password=' + encodeURIComponent(studentPassword.trim()) + '&deviceId=' + encodeURIComponent(getDeviceId()) + '&deviceIds=' + encodeURIComponent(JSON.stringify(getDeviceCandidates())) + '&deviceType=' + encodeURIComponent(getDeviceType()))
      var data = await res.json()
      // ربط الجهاز: الحساب مربوط بجهاز تاني → رسالة حمراء واضحة جوه الكارت
      if (res.status === 403 && data.deviceBlocked) {
        var msg = data.error || '🚫 لازم تدخل بالجهاز اللي انت عملت من عليه الحساب — الحساب ده مربوط بجهاز واحد بس. لو حصلت معاك أي مشكلة كلم المستر.'
        setDeviceBlockMsg(msg)
        toast.error(msg, { duration: 12000 })
        setStudentPassword('')
        return
      }
      // خطأ سيرفر (مش بيانات غلط) → رسالة صريحة مش "الباسورد غلط"
      if (!res.ok && data.error) {
        toast.error(data.error, { duration: 8000 })
        return
      }
      var students = data.students || []
      var student: any = null
      for (var i = 0; i < students.length; i++) {
        if (students[i].phone === studentPhone.trim()) { student = students[i]; break }
      }
      if (!student) {
        toast.error('الباسورد أو الرقم بتاعك غلط')
      } else if (student.status === 'pending') {
        setCurrentStudent(student); setView('student-pending')
        toast.info('حسابك لسه في المراجعة — جرب تعمل تسجيل دخول تاني بعدين وشوف اتمقبلت ولا لسه')
      } else if (student.status === 'approved' || student.status === 'paid') {
        setCurrentStudent(student); setView('student-portal')
        toast.success('مرحباً ' + student.name + '!')
        fetch('/api/students/track-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ studentId: student.id })
        }).catch(function () {})
      } else if (student.status === 'rejected' || student.status === 'refused') {
        toast.error('❌ الحساب بتاعك مرفوض من المنصة. لو عندك استفسار تواصل مع المستر', { duration: 8000 })
        setStudentPhone('')
        setStudentPassword('')
      } else {
        toast.error('تم حذف حسابك من المنصة، تواصل مع المستر')
      }
    } catch (e) {
      toast.error('حدث خطأ في الاتصال')
    } finally {
      setStudentLoading(false)
    }
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <DeviceWarningBanner mode="login" />
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center h-16 w-16 rounded-2xl bg-primary/10 mb-4"><GraduationCap className="h-8 w-8 text-primary" /></div>
          <h1 className="text-2xl font-bold text-foreground mb-2">تسجيل الدخول</h1>
          <p className="text-sm text-muted-foreground">ادخل لحسابك وكمل تعلم</p>
        </div>
        <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-gold-400 via-gold-600 to-gold-400">
          <Card className="rounded-2xl border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="space-y-4">
                {deviceBlockMsg && (
                  <div className="rounded-xl border-2 border-red-500 bg-red-50 dark:bg-red-950/40 p-4 text-center" role="alert">
                    <p className="text-sm font-extrabold text-red-700 dark:text-red-300 leading-relaxed" style={{ whiteSpace: 'pre-line' }}>{deviceBlockMsg}</p>
                  </div>
                )}
                <PhoneField value={studentPhone} onChange={setStudentPhone} placeholder="رقم الهاتف" id="login-phone" />
                <PasswordField value={studentPassword} onChange={setStudentPassword} placeholder="كلمة المرور" id="login-password" />
                <button
                  type="button"
                  className="w-full min-h-[44px] font-semibold inline-flex items-center justify-center gap-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:pointer-events-none transition-colors px-4 py-2 cursor-pointer relative z-10"
                  onClick={handleStudentLogin}
                  disabled={studentLoading}
                  style={{ WebkitTapHighlightColor: 'transparent', position: 'relative', zIndex: 10 }}
                >
                  {studentLoading ? (<><Loader2 className="h-4 w-4 ml-2 animate-spin" />استنى شوية...</>) : 'ادخل لحسابك'}
                </button>
                <p className="text-center text-sm text-muted-foreground">عندك حساب؟ <button onClick={function () { setView('auth-register') }} className="text-primary font-medium hover:underline cursor-pointer">اعمل حساب جديد</button></p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 text-center"><button onClick={function () { setView('landing') }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 cursor-pointer"><ArrowRight className="h-4 w-4" />العودة للرئيسية</button></div>
      </div>
    </div>
  )
}

export function RegisterView() {
  var store = useAppStore()
  var setView = store.setView
  var setCurrentStudent = store.setCurrentStudent
  var n1s = useState(''); var name1 = n1s[0]; var setName1 = n1s[1]
  var n2s = useState(''); var name2 = n2s[0]; var setName2 = n2s[1]
  var n3s = useState(''); var name3 = n3s[0]; var setName3 = n3s[1]
  var n4s = useState(''); var name4 = n4s[0]; var setName4 = n4s[1]
  var ps = useState(''); var phone = ps[0]; var setPhone = ps[1]
  var pwdState = useState(''); var password = pwdState[0]; var setPassword = pwdState[1]
  var pwd2State = useState(''); var password2 = pwd2State[0]; var setPassword2 = pwd2State[1]
  var gs = useState(''); var grade = gs[0]; var setGrade = gs[1]
  var p1s = useState(''); var parentName1 = p1s[0]; var setParentName1 = p1s[1]
  var p2s = useState(''); var parentName2 = p2s[0]; var setParentName2 = p2s[1]
  var pps = useState(''); var parentPhone = pps[0]; var setParentPhone = pps[1]
  var ls = useState(false); var loading = ls[0]; var setLoading = ls[1]
  var es = useState<Record<string, string>>({}); var errors = es[0]; var setErrors = es[1]

  var validate = function () {
    var e: Record<string, string> = {}
    if (!name1.trim()) e.name1 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(name1.trim())) e.name1 = 'حروف فقط'
    if (!name2.trim()) e.name2 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(name2.trim())) e.name2 = 'حروف فقط'
    if (!name3.trim()) e.name3 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(name3.trim())) e.name3 = 'حروف فقط'
    if (!name4.trim()) e.name4 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(name4.trim())) e.name4 = 'حروف فقط'
    if (!phone.trim()) e.phone = 'مطلوب'; else if (!PHONE_REGEX.test(phone.trim())) e.phone = 'يجب أن يكون 11 رقم بالضبط'
    if (!password.trim()) e.password = 'مطلوب'; else if (password.trim().length < 4) e.password = 'كلمة المرور يجب أن تكون 4 أحرف على الأقل'
    if (password.trim() !== password2.trim()) e.password2 = 'كلمتا المرور غير متطابقتين'
    if (!grade) e.grade = 'مطلوب'
    if (!parentName1.trim()) e.parentName1 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(parentName1.trim())) e.parentName1 = 'حروف فقط'
    if (!parentName2.trim()) e.parentName2 = 'مطلوب'; else if (!TEXT_ONLY_REGEX.test(parentName2.trim())) e.parentName2 = 'حروف فقط'
    if (!parentPhone.trim()) e.parentPhone = 'مطلوب'; else if (!PHONE_REGEX.test(parentPhone.trim())) e.parentPhone = 'يجب أن يكون 11 رقم بالضبط'
    setErrors(e)
    if (Object.keys(e).length > 0) { toast.error('الرجاء تصحيح الحقول المشار إليها'); return false }
    return true
  }

  var handleRegister = async function () {
    if (!validate()) return
    var fullName = name1.trim() + ' ' + name2.trim() + ' ' + name3.trim() + ' ' + name4.trim()
    var fullParentName = parentName1.trim() + ' ' + parentName2.trim()
    setLoading(true)
    try {
      var res = await fetch('/api/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: fullName, phone: phone.trim(), grade: grade, parentName: fullParentName, parentPhone: parentPhone.trim(), password: password.trim(), deviceId: getDeviceId(), deviceIds: getDeviceCandidates(), deviceType: getDeviceType() }) })
      var data = await res.json()
      if (res.ok) { setCurrentStudent(data.student); setView('student-pending'); toast.success('تم تسجيل طلبك بنجاح! خش اعمل تسجيل دخول وشوف اتمقبلت ولا لسه') }
      else { toast.error(data.error || 'حدث خطأ في التسجيل') }
    } catch (e) { toast.error('حدث خطأ في الاتصال') }
    setLoading(false)
  }

  return (
    <div className="min-h-[calc(100vh-4rem)] flex items-center justify-center px-4 py-8">
      <motion.div className="w-full max-w-lg" initial="hidden" animate="visible" variants={fadeInUp} transition={{ duration: 0.5, ease: 'easeOut' }}>
        <DeviceWarningBanner mode="register" />
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center h-14 w-14 rounded-2xl bg-primary/10 mb-3"><Users className="h-7 w-7 text-primary" /></div>
          <h1 className="text-2xl font-bold text-foreground mb-1">اعمل حساب جديد</h1>
          <p className="text-sm text-muted-foreground">سجل بياناتك وابدأ رحلتك معنا</p>
        </div>
        <div className="relative rounded-2xl p-[2px] bg-gradient-to-br from-gold-400 via-gold-600 to-gold-400">
          <Card className="rounded-2xl border-0 shadow-lg">
            <CardContent className="p-5">
              <div className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">اسم الطالب الرباعي</p>
                  <div className="grid grid-cols-2 gap-2">
                    <NameField value={name1} onChange={setName1} placeholder="الاسم الأول" id="reg-name1" error={errors.name1} />
                    <NameField value={name2} onChange={setName2} placeholder="الاسم الثاني" id="reg-name2" error={errors.name2} />
                    <NameField value={name3} onChange={setName3} placeholder="الاسم الثالث" id="reg-name3" error={errors.name3} />
                    <NameField value={name4} onChange={setName4} placeholder="الاسم الرابع" id="reg-name4" error={errors.name4} />
                  </div>
                </div>
                <PhoneField value={phone} onChange={setPhone} placeholder="رقم هاتف الطالب" id="reg-phone" error={errors.phone} />
                <div className="grid grid-cols-2 gap-2">
                  <PasswordField value={password} onChange={setPassword} placeholder="كلمة المرور" id="reg-password" error={errors.password} />
                  <PasswordField value={password2} onChange={setPassword2} placeholder="تأكيد كلمة المرور" id="reg-password2" error={errors.password2} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="reg-grade" className="text-foreground">الصف الدراسي <span className="text-destructive">*</span></Label>
                  <div className="relative">
                    <GraduationCap className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <select id="reg-grade" value={grade} onChange={function (e) { setGrade(e.target.value) }} className={'flex h-11 w-full rounded-md border border-input bg-transparent pr-10 pl-3 py-1 text-sm shadow-xs transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring min-h-[44px] appearance-none cursor-pointer' + (errors.grade ? ' border-destructive' : '')}>
                      <option value="">اختر الصف الدراسي</option>
                      {GRADES.map(function (g) { return <option key={g} value={g}>{g}</option> })}
                    </select>
                  </div>
                  {errors.grade && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="h-3 w-3" />{errors.grade}</p>}
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground mb-2">اسم ولي الأمر</p>
                  <div className="grid grid-cols-2 gap-2">
                    <NameField value={parentName1} onChange={setParentName1} placeholder="الاسم الأول" id="reg-pname1" error={errors.parentName1} />
                    <NameField value={parentName2} onChange={setParentName2} placeholder="الاسم الثاني" id="reg-pname2" error={errors.parentName2} />
                  </div>
                </div>
                <PhoneField value={parentPhone} onChange={setParentPhone} placeholder="رقم هاتف ولي الأمر" id="reg-parent-phone" error={errors.parentPhone} />
                <Button className="w-full min-h-[44px] font-semibold" onClick={handleRegister} disabled={loading}>{loading ? (<><Loader2 className="h-4 w-4 ml-2 animate-spin" />جاري التسجيل...</>) : 'اعمل الحساب'}</Button>
                <p className="text-center text-sm text-muted-foreground">عندك حساب؟ <button onClick={function () { setView('auth-login') }} className="text-primary font-medium hover:underline cursor-pointer">سجل دخولك</button></p>
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="mt-6 text-center"><button onClick={function () { setView('landing') }} className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors min-h-[44px] px-3 cursor-pointer"><ArrowRight className="h-4 w-4" />العودة للرئيسية</button></div>
      </motion.div>
    </div>
  )
}
