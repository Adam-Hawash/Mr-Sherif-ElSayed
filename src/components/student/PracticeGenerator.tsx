'use client'

// ============================================================
// FILE: src/components/student/PracticeGenerator.tsx
// PURPOSE: (2026-و66) تاب «اتدرب أكتر» — المولد الذكي للأسئلة:
//   الطالب يكتب فكرة/قانون/مسألة بتتعب فيها → POST /api/ai/practice
//   → 10 أسئلة تدريب فريدة بخطوات وخدع المستر.
//   الـ AI بياخد 20-50 ثانية → لذلك شاشة التحميل حية وفخمة:
//   رسائل مصرية بتتغير كل 3 ثواني (framer-motion) + عداد ثواني شغال
//   + شريط تقدم + سكيليتون لأسئلة جاية. فشل؟ رسالة + زر إعادة.
// ============================================================

import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Brain,
  Camera,
  ImagePlus,
  Loader2,
  Eye,
  EyeOff,
  Lightbulb,
  ListOrdered,
  Dices,
  Timer,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { FractionText } from '@/components/FractionText'
import type { PracticeQuestion } from '@/lib/question-gen'

/* ---------- ثوابت العرض ---------- */

// (2026-و66) رسائل التحميل المصرية — بتتغير كل 3 ثواني أثناء التوليد
var LOADING_MSGS = [
  'The smart generator is analyzing your request…',
  'Preparing {n} questions with different numbers…',
  'Writing the step-by-step solution…',
  'Almost there — getting the tricks ready…',
]

// (2026-و66) المواضيع السريعة — الضغطة تملا الصندوق باقتراح جاهز للمولد
// (2026-و68) التلميحات بقت إنجليزي — لأن المولد بيطلع الأسئلة بالإنجليزي
var QUICK_TOPICS = [
  { label: 'Equations', hint: 'Linear and quadratic equations — solve for x' },
  { label: 'Fractions', hint: 'Adding and subtracting fractions' },
  { label: 'Percentages', hint: 'Percentage of a number and percentage change' },
  { label: 'Pythagoras', hint: 'Pythagorean theorem' },
  { label: 'Area & perimeter', hint: 'Area and perimeter of rectangles, triangles and circles' },
  { label: 'Exponents & roots', hint: 'Laws of exponents and square roots' },
  { label: 'Average (mean)', hint: 'Arithmetic mean (average)' },
  { label: 'Speed & time', hint: 'Speed, distance and time' },
]

// (2026-و66) مميزات المولد — تظهر في الحالة الفاضية قبل أول توليد
var FEATURES = [
  {
    icon: Dices,
    title: 'New numbers every time',
    desc: 'Every generation produces unique questions with the same skill — practice that never runs out',
    cls: 'border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  {
    icon: ListOrdered,
    title: 'Step-by-step solutions',
    desc: 'Every question comes with a full worked solution, explained like the teacher does on the board',
    cls: 'border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-400',
  },
  {
    icon: Lightbulb,
    title: 'Quick solving tricks',
    desc: 'A teacher\'s trick for every question so you solve in half the time',
    cls: 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
]

var AR_DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

/* ---------- أدوات مساعدة ---------- */

// تحويل الرقم لأرقام عربية هندية — لإحساس مصري أصيل في الترقيم
function toArNum(n: number): string {
  return String(n)
    .split('')
    .map(function (d) { return AR_DIGITS[Number(d)] ?? d })
    .join('')
}

// (2026-و66) ألوان بادج الصعوبة — (2026-و68) بيدعم الإنجليزي والعربي:
// Easy=زمردي / Medium=عنبري / Hard=وردي
function diffBadgeClass(difficulty: string): string {
  var s = String(difficulty || '')
  if (s.indexOf('Easy') !== -1 || s.toLowerCase() === 'easy') return 'border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
  if (s.indexOf('Hard') !== -1 || s.toLowerCase() === 'hard') return 'border-rose-500/30 bg-rose-500/15 text-rose-600 dark:text-rose-400'
  if (s.indexOf('Medium') !== -1 || s.toLowerCase() === 'medium') return 'border-amber-500/30 bg-amber-500/15 text-amber-600 dark:text-amber-400'
  return 'border-teal-500/30 bg-teal-500/15 text-teal-600 dark:text-teal-400'
}

/* (2026-و68) ضغط صورة المعادلة قبل الرفع — أقصى بعد 1600px وجودة 0.85
   عشان الرفع يكون سريع والـ API ميقبلش حجم كبير */
function compressImageFile(file: File): Promise<string> {
  return new Promise(function (resolve, reject) {
    var reader = new FileReader()
    reader.onerror = function () { reject(new Error('read-fail')) }
    reader.onload = function () {
      var src = String(reader.result || '')
      var img = new Image()
      img.onerror = function () { reject(new Error('img-fail')) }
      img.onload = function () {
        try {
          var maxDim = 1600
          var w = img.naturalWidth || img.width
          var h = img.naturalHeight || img.height
          var scale = Math.min(1, maxDim / Math.max(w, h))
          var canvas = document.createElement('canvas')
          canvas.width = Math.max(1, Math.round(w * scale))
          canvas.height = Math.max(1, Math.round(h * scale))
          var ctx = canvas.getContext('2d')
          if (!ctx) { resolve(src); return }
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        } catch (e) { resolve(src) }
      }
      img.src = src
    }
    reader.readAsDataURL(file)
  })
}

// شكل الرد المتوقع من /api/ai/practice
interface PracticeResponse {
  ok?: boolean
  source?: string
  engine?: string
  questions?: PracticeQuestion[]
  error?: string
}

/* ---------- كارت السؤال الواحد ---------- */

function QuestionCardItem(props: {
  q: PracticeQuestion
  index: number
  open: boolean
  onToggle: () => void
}) {
  var q = props.q
  var index = props.index
  var open = props.open
  var onToggle = props.onToggle

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: Math.min(index * 0.05, 0.5) }}
    >
      <Card className='overflow-hidden'>
        <CardContent className='space-y-3 p-4 sm:p-5'>
          <div className='flex items-start gap-3'>
            {/* رقم السؤال — دايرة تركوازية */}
            <div className='flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/15 text-sm font-bold text-teal-600 dark:text-teal-400'>
              {toArNum(index + 1)}
            </div>

            <div className='min-w-0 flex-1 space-y-2.5'>
              {/* نص السؤال — (2026-و68) إنجليزي فاتجاهه LTR + (و71) FractionText
                  زي امتحانات المنصة: 2^3 بقت 2³ والكسور بتترسم فعلية */}
              <p dir='ltr' className='break-words text-left text-base font-bold leading-relaxed sm:text-lg'>
                <FractionText text={q.question} />
              </p>

              {/* البادجات + زر الحل */}
              <div className='flex flex-wrap items-center gap-2'>
                <Badge className={diffBadgeClass(q.difficulty)}>{q.difficulty || 'Medium'}</Badge>
                {q.topic ? (
                  <Badge variant='outline' className='max-w-48 truncate'>
                    {q.topic}
                  </Badge>
                ) : null}
                <Button
                  type='button'
                  variant='ghost'
                  size='sm'
                  onClick={onToggle}
                  aria-expanded={open}
                  className='h-8 gap-1.5 text-teal-600 hover:bg-teal-500/10 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300'
                >
                  {open ? <EyeOff className='h-4 w-4' /> : <Eye className='h-4 w-4' />}
                  {open ? 'Hide solution' : 'Show solution 👁'}
                </Button>
              </div>

              {/* الحل — بينفتح بأنيميشن ناعم */}
              <AnimatePresence>
                {open && (
                  <motion.div
                    key='solution'
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: 'easeInOut' }}
                    className='overflow-hidden'
                  >
                    <div className='space-y-3 pt-1'>
                      {/* صندوق الإجابة — زمردي */}
                      <div className='rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3'>
                        <div className='flex items-start gap-2.5'>
                          <CheckCircle2 className='mt-0.5 h-5 w-5 shrink-0 text-emerald-600 dark:text-emerald-400' />
                          <div className='min-w-0'>
                            <p className='text-xs font-semibold text-emerald-700 dark:text-emerald-400'>Answer:</p>
                            <p dir='ltr' className='break-words text-left text-base font-bold text-emerald-700 dark:text-emerald-300'>
                              <FractionText text={q.answer} />
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* الحل خطوة بخطوة — قائمة مرقّمة بدواير */}
                      <div className='rounded-lg border bg-muted/40 p-3'>
                        <p className='mb-2.5 flex items-center gap-1.5 text-xs font-bold text-muted-foreground'>
                          <ListOrdered className='h-4 w-4' />
                          Step-by-step solution
                        </p>
                        <ol className='space-y-2.5'>
                          {(q.steps || []).map(function (st, si) {
                            return (
                              <li key={si} className='flex items-start gap-2.5'>
                                <span className='mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-teal-500/30 bg-teal-500/15 text-xs font-bold text-teal-600 dark:text-teal-400'>
                                  {toArNum(si + 1)}
                                </span>
                                <span dir='ltr' className='break-words text-left text-sm leading-relaxed'>
                                  <FractionText text={st} />
                                </span>
                              </li>
                            )
                          })}
                        </ol>
                      </div>

                      {/* خدعة المستر — عنبرية */}
                      {q.trick ? (
                        <div className='rounded-lg border border-amber-500/30 bg-amber-500/10 p-3'>
                          <p dir='ltr' className='break-words text-left text-sm leading-relaxed text-amber-700 dark:text-amber-300'>
                            <span className='font-bold'>💡 Teacher's trick:</span> <FractionText text={q.trick} />
                          </p>
                        </div>
                      ) : null}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  )
}

/* ============================================================
// المولد الذكي — التاب الأساسي
// ============================================================ */

export function PracticeGenerator({ grade }: { grade: string }) {
  const [topic, setTopic] = useState('') // نص الطلب في الصندوق
  /* (و72) عدد الأسئلة — الطالب بيختار (5/10/15/20 والافتراضي 10) */
  const [pCount, setPCount] = useState(10)
  const [image, setImage] = useState('') // (2026-و68) dataURL لصورة معادلة مرفوعة
  const [imgBusy, setImgBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(false)
  const [questions, setQuestions] = useState<PracticeQuestion[]>([])
  const [resultTopic, setResultTopic] = useState('') // الموضوع اللي اتولّد عليه فعلاً
  const [source, setSource] = useState<'ai' | 'local' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({}) // حلول مفتوحة
  const [elapsed, setElapsed] = useState(0) // عداد الثواني أثناء التحميل
  const [msgIdx, setMsgIdx] = useState(0) // رسالة التحميل الحالية
  const topicRef = useRef<HTMLTextAreaElement>(null)
  const lastTopicRef = useRef('') // آخر موضوع اتبعت — لإعادة المحاولة

  /* نجاح = فيه نتائج جاهزة ومفيش تحميل ولا خطأ */
  var success = !loading && questions.length > 0 && !error

  /* (2026-و66) أثناء التحميل: عداد ثواني كل ثانية + رسالة جديدة كل 3 ثواني */
  useEffect(function () {
    if (!loading) return
    var t1 = setInterval(function () { setElapsed(function (s) { return s + 1 }) }, 1000)
    var t2 = setInterval(function () {
      setMsgIdx(function (i) { return (i + 1) % LOADING_MSGS.length })
    }, 3000)
    return function () {
      clearInterval(t1)
      clearInterval(t2)
    }
  }, [loading])

  /* نداء المولد — نفس الدالة للتوليد الأول وإعادة الأسئلة والمحاولة تاني */
  const generate = useCallback(async function (rawTopic: string) {
    var clean = String(rawTopic || '').trim()
    var img = image
    if (!clean && !img) {
      toast.error('Write an idea or an equation… or upload an equation photo ✍️')
      return
    }
    if (clean.length > 1200) clean = clean.slice(0, 1200)
    lastTopicRef.current = clean || 'equation photo'
    setLoading(true)
    setError(null)
    setQuestions([])
    setOpenMap({})
    setElapsed(0)
    setMsgIdx(0)
    try {
      var res = await fetch('/api/ai/practice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic: clean, grade: grade, image: img || undefined, count: pCount }),
      })
      var data: PracticeResponse | null = null
      try { data = await res.json() } catch (e) { data = null }
      if (!res.ok || !data || !data.ok) {
        throw new Error((data && data.error) || 'The generator is busy right now — try again')
      }
      var qs: PracticeQuestion[] = Array.isArray(data.questions) ? data.questions : []
      if (qs.length === 0) {
        throw new Error('Couldn\'t generate questions for that prompt — try writing it a different way')
      }
      // ضمان وجود id لكل سؤال — للتحكم في فتح/قفل الحلول
      qs = qs.map(function (q, i) {
        return Object.assign({}, q, { id: String(q.id || 'q-' + i) })
      })
      setQuestions(qs)
      setResultTopic(clean || 'The equation photo you uploaded 📷')
      setSource(data.source === 'local' ? 'local' : 'ai')
      toast.success('We prepared ' + toArNum(qs.length) + ' questions — let\'s go! 🎉')
    } catch (e) {
      var msg = e instanceof Error && e.message ? e.message : 'Something went wrong — try again'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }, [grade, image, pCount])

  /* (2026-و68) اختيار صورة معادلة — ضغط فوري + معاينة */
  const onPickImage = useCallback(async function (f: File | null) {
    if (!f) return
    if (f.type && f.type.indexOf('image/') !== 0) {
      toast.error('Need an image (JPG/PNG) — snap the equation and send it 📷')
      return
    }
    setImgBusy(true)
    try {
      var dataUrl = await compressImageFile(f)
      setImage(dataUrl)
      toast.success('Image ready — type (or don\'t) anything and hit generate 🚀')
    } catch (e) {
      toast.error('Couldn\'t read the image — try another one')
    } finally {
      setImgBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }, [])

  /* «موضوع تاني» — رجوع لصندوق الإدخال فاضي زي أول مرة */
  const resetAll = function () {
    setQuestions([])
    setResultTopic('')
    setSource(null)
    setError(null)
    setOpenMap({})
    setTopic('')
    setImage('')
    setTimeout(function () { topicRef.current?.focus() }, 50)
  }

  /* فتح/قفل حل سؤال معين */
  const toggleSolution = function (id: string) {
    setOpenMap(function (prev) {
      return Object.assign({}, prev, { [id]: !prev[id] })
    })
  }

  return (
    <div className='space-y-4'>
      {/* ============ صندوق الإدخال (بيختفي لما النتائج تظهر) ============ */}
      {!success && (
        <Card className='border-2 border-violet-500/20 shadow-lg shadow-violet-500/5'>
          <CardHeader className='pb-4'>
            <div className='flex items-start gap-3'>
              <div className='flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-violet-500/30 bg-gradient-to-br from-violet-500/20 to-teal-500/20'>
                <Brain className='h-6 w-6 text-violet-600 dark:text-violet-400' />
              </div>
              <div className='min-w-0'>
                <CardTitle className='text-lg font-bold sm:text-xl'>🧠 Practice More — Smart Generator</CardTitle>
                <CardDescription className='mt-1 text-sm leading-relaxed'>
                  Write any idea, rule, or problem you're stuck on, and the generator will prepare {pCount} practice questions with steps and tricks
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className='space-y-4'>
            {/* الصندوق الكبير للطلب */}
            <Textarea
              ref={topicRef}
              value={topic}
              onChange={function (e) { setTopic(e.target.value) }}
              rows={4}
              maxLength={1200}
              disabled={loading}
              dir='auto'
              placeholder={'Write an equation or an idea… e.g. 6(x - 1) = 18  or  Pythagoras theorem — or snap the equation from your book and upload it 👇'}
              aria-label='Write the idea or equation you want to practice'
              className='min-h-28 resize-none text-base leading-relaxed md:text-base'
            />

            {/* (2026-و68) رفع صورة معادلة — زرار + معاينة */}
            <div className='flex flex-wrap items-center gap-2'>
              <input
                ref={fileRef}
                type='file'
                accept='image/*'
                capture='environment'
                className='hidden'
                onChange={function (e) { onPickImage(e.target.files && e.target.files[0]) }}
                aria-hidden='true'
                tabIndex={-1}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                disabled={loading || imgBusy}
                onClick={function () { fileRef.current?.click() }}
                className='h-9 gap-1.5 rounded-full border-violet-500/40 text-violet-600 hover:bg-violet-500/10 hover:text-violet-700 dark:text-violet-400'
              >
                {imgBusy ? <Loader2 className='h-4 w-4 animate-spin' /> : (image ? <Camera className='h-4 w-4' /> : <ImagePlus className='h-4 w-4' />)}
                {image ? 'Change image' : '📷 Upload an equation photo'}
              </Button>
              {image ? (
                <div className='flex items-center gap-2 rounded-full border bg-muted/50 py-1 pe-1 ps-2'>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image} alt='Equation photo preview' className='h-10 w-14 rounded-full object-cover' />
                  <button
                    type='button'
                    onClick={function () { setImage('') }}
                    aria-label='Remove image'
                    className='flex h-6 w-6 items-center justify-center rounded-full bg-rose-500/15 text-rose-600 transition-colors hover:bg-rose-500/25 dark:text-rose-400'
                  >
                    <X className='h-3.5 w-3.5' />
                  </button>
                </div>
              ) : null}
            </div>

            {/* شيبس المواضيع السريعة — ضغطة تملا الصندوق */}
            <div className='space-y-2'>
              <p className='text-xs font-semibold text-muted-foreground'>💡 Quick topics — tap any one to fill it in instantly:</p>
              <div className='flex flex-wrap gap-2'>
                {QUICK_TOPICS.map(function (t) {
                  return (
                    <Button
                      key={t.label}
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={loading}
                      onClick={function () {
                        setTopic(t.hint)
                        setTimeout(function () { topicRef.current?.focus() }, 30)
                      }}
                      className='h-8 rounded-full px-3 text-xs font-semibold transition-all hover:border-violet-500/40 hover:bg-violet-500/10 hover:text-violet-600 active:scale-95 dark:hover:text-violet-400 sm:text-sm'
                    >
                      {t.label}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* (و72) عدد الأسئلة — شيبس 5/10/15/20 */}
            <div className='space-y-2'>
              <p className='text-xs font-semibold text-muted-foreground'>🔢 Number of questions:</p>
              <div className='flex flex-wrap gap-2'>
                {[5, 10, 15, 20].map(function (n) {
                  return (
                    <Button
                      key={n}
                      type='button'
                      variant='outline'
                      size='sm'
                      disabled={loading}
                      onClick={function () { setPCount(n) }}
                      className={'h-8 rounded-full px-3 text-xs font-bold transition-all sm:text-sm ' +
                        (pCount === n
                          ? 'border-violet-500 bg-violet-500/10 text-violet-600 dark:text-violet-400'
                          : 'text-muted-foreground hover:border-violet-500/40 hover:text-violet-600 dark:hover:text-violet-400')}
                    >
                      {n}
                    </Button>
                  )
                })}
              </div>
            </div>

            {/* زر التوليد الكبير */}
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <Button
                type='button'
                size='lg'
                onClick={function () { generate(topic) }}
                disabled={loading}
                className='h-12 w-full bg-gradient-to-l from-violet-600 to-teal-600 text-base font-bold text-white shadow-md shadow-violet-500/25 hover:from-violet-600/90 hover:to-teal-600/90 sm:w-auto'
              >
                {loading && <Loader2 className='h-5 w-5 animate-spin' />}
                Generate {pCount} questions 🚀
              </Button>
              <span className='text-center text-xs text-muted-foreground sm:text-left'>
                Questions are generated in English — write in any language or upload a photo ✍️
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ============ شاشة التحميل الحية (الـ AI بياخد 20-50 ثانية) ============ */}
      {loading && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className='border-violet-500/30 bg-violet-500/5'>
            <CardContent className='space-y-4 p-5 sm:p-6'>
              <div className='flex flex-col items-center gap-2'>
                <Loader2 className='h-7 w-7 animate-spin text-violet-600 dark:text-violet-400' />
                {/* الرسائل المصرية المتغيرة كل 3 ثواني */}
                <div className='flex min-h-8 items-center' aria-live='polite'>
                  <AnimatePresence mode='wait'>
                    <motion.p
                      key={msgIdx % LOADING_MSGS.length}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.3 }}
                      className='text-center font-bold text-violet-700 dark:text-violet-300 sm:text-lg'
                    >
                      {LOADING_MSGS[msgIdx % LOADING_MSGS.length].replace('{n}', String(pCount))}
                    </motion.p>
                  </AnimatePresence>
                </div>
                {/* عداد الثواني الشغال */}
                <div className='flex items-center gap-1.5 text-sm text-muted-foreground'>
                  <Timer className='h-4 w-4' />
                  <span>
                    Counting <span className='font-bold tabular-nums text-teal-600 dark:text-teal-400'>{toArNum(elapsed)}</span> seconds...
                  </span>
                </div>
              </div>

              {/* شريط تقدم هادي — بيملا على مهل زي وقت الـ AI الحقيقي */}
              <div className='h-1.5 w-full overflow-hidden rounded-full bg-muted'>
                <motion.div
                  className='h-full rounded-full bg-gradient-to-l from-violet-500 via-teal-500 to-violet-500'
                  initial={{ width: '4%' }}
                  animate={{ width: '94%' }}
                  transition={{ duration: 45, ease: 'easeOut' }}
                />
              </div>

              {/* سكيليتون — لمحة عن الأسئلة الجاية */}
              <div className='space-y-2.5'>
                {[0, 1, 2].map(function (i) {
                  return (
                    <div
                      key={i}
                      className='h-11 animate-pulse rounded-xl bg-muted/70'
                      style={{ animationDelay: (i * 0.25) + 's' }}
                    />
                  )
                })}
              </div>

              <p className='text-center text-xs text-muted-foreground'>
                Questions are generated with fresh numbers and verified solutions — keep this open and it'll be ready in a moment 😉
              </p>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ============ حالة الخطأ + إعادة المحاولة ============ */}
      {!loading && error && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <Card className='border-rose-500/30 bg-rose-500/5'>
            <CardContent className='flex flex-col items-center gap-3 p-6 text-center'>
              <div className='flex h-12 w-12 items-center justify-center rounded-full border border-rose-500/30 bg-rose-500/15'>
                <AlertTriangle className='h-6 w-6 text-rose-600 dark:text-rose-400' />
              </div>
              <p className='font-bold text-rose-600 dark:text-rose-400'>Something went wrong while generating</p>
              <p className='max-w-md text-sm leading-relaxed text-muted-foreground'>{error}</p>
              <div className='flex flex-wrap justify-center gap-2 pt-1'>
                <Button
                  type='button'
                  onClick={function () { generate(lastTopicRef.current || topic) }}
                  className='gap-2 bg-rose-600 text-white hover:bg-rose-600/90'
                >
                  <RefreshCw className='h-4 w-4' />
                  Try again 🔄
                </Button>
                <Button type='button' variant='outline' onClick={resetAll}>
                  Try another topic
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* ============ النتائج: 10 أسئلة جاهزة ============ */}
      {success && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className='space-y-4'
        >
          {/* الهيدر: العنوان + بادج المحرك + أزرار التحكم */}
          <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
            <div className='flex min-w-0 flex-wrap items-center gap-2'>
              <h3 className='font-bold text-lg sm:text-xl'>
                {toArNum(questions.length)} questions on "
                <span className='text-teal-600 dark:text-teal-400'>{resultTopic}</span>"
              </h3>
              {source === 'local' ? (
                <Badge className='border-emerald-500/30 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'>
                  ⚡ Platform math generator
                </Badge>
              ) : (
                <Badge className='border-violet-500/30 bg-violet-500/15 text-violet-600 dark:text-violet-400'>
                  ✨ AI-powered
                </Badge>
              )}
            </div>
            <div className='flex shrink-0 items-center gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={function () { generate(resultTopic) }}
                className='gap-1.5 rounded-full'
              >
                <RefreshCw className='h-4 w-4' />
                New questions 🔄
              </Button>
              <Button type='button' variant='ghost' size='sm' onClick={resetAll} className='rounded-full'>
                Another topic
              </Button>
            </div>
          </div>

          {/* كروت الأسئلة — على الموبايل تدفق طبيعي، على الديسكتوب سكرول داخلي أنيق */}
          <div className='space-y-3 lg:max-h-[72vh] lg:overflow-y-auto lg:[scrollbar-width:thin] lg:[&::-webkit-scrollbar-thumb]:rounded-full lg:[&::-webkit-scrollbar-thumb]:bg-teal-500/25 lg:[&::-webkit-scrollbar-track]:bg-transparent lg:pl-1'>
            {questions.map(function (q, i) {
              return (
                <QuestionCardItem
                  key={q.id}
                  q={q}
                  index={i}
                  open={!!openMap[q.id]}
                  onToggle={function () { toggleSolution(q.id) }}
                />
              )
            })}
          </div>
        </motion.div>
      )}

      {/* ============ الحالة الفاضية: المميزات قبل أول توليد ============ */}
      {!loading && !error && !success && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }} className='space-y-3'>
          <p className='text-center text-sm font-semibold text-muted-foreground'>
            Write above or pick a quick topic — we'll handle the rest 👇
          </p>
          <div className='grid gap-3 sm:grid-cols-3'>
            {FEATURES.map(function (f) {
              var Icon = f.icon
              return (
                <div key={f.title} className='flex items-start gap-3 rounded-xl border bg-card p-4'>
                  <div className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ' + f.cls}>
                    <Icon className='h-5 w-5' />
                  </div>
                  <div className='min-w-0'>
                    <p className='text-sm font-bold'>{f.title}</p>
                    <p className='mt-0.5 text-xs leading-relaxed text-muted-foreground'>{f.desc}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </motion.div>
      )}
    </div>
  )
}
