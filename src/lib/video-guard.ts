// ============================================================
// VIDEO GUARD — حماية الفيديوهات من سرقة اللينكات
// ============================================================
// القاعدة الذهبية: لينك اليوتيوب الخام أو مسار ملف الفيديو المرفوع
// ممنوع يوصل لأي كلاينت غير متحقق من السيرفر.
// - /api/videos بيرجع القوائم من غير url/filePath أبداً (إلا للأدمن)
// - التشغيل بيتم عن طريق /api/video-play اللي بيتحقق من الصلاحية
//   ويرجّع YouTube ID أو توكن قصير العمر للملف المرفوع
// - ملفات الفيديو المرفوعة بتتخدم من /api/files/[id] بس بتوكن صالح
// ============================================================
import crypto from 'crypto'
import { db } from '@/lib/db'

// ثابت ومستقر — التوكنات قصيرة العمر (ساعتين) فالتغيير مش ضروري
const TOKEN_SECRET = process.env.VIDEO_TOKEN_SECRET || 'vguard-9f2k-stable-2026'

export interface VideoTokenPayload {
  f: string // media id
  s: string // requester id (studentId / adminId / 'anon')
  exp: number // expiry ms
}

export function signVideoToken(mediaId: string, requesterId: string, ttlSeconds = 60 * 60 * 2): string {
  const payload: VideoTokenPayload = { f: mediaId, s: requesterId, exp: Date.now() + ttlSeconds * 1000 }
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url')
  return body + '.' + sig
}

export function verifyVideoToken(token: string | null | undefined, mediaId: string, requesterId: string): boolean {
  if (!token) return false
  const parts = String(token).split('.')
  if (parts.length !== 2) return false
  const [body, sig] = parts
  const expected = crypto.createHmac('sha256', TOKEN_SECRET).update(body).digest('base64url')
  if (sig.length !== expected.length) return false
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString()) as VideoTokenPayload
    return payload.f === mediaId && payload.s === requesterId && payload.exp > Date.now()
  } catch {
    return false
  }
}

export function getYouTubeId(url: string): string | null {
  if (!url) return null
  const m = String(url).match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/|live\/))([\w-]{11})/)
  return m ? m[1] : null
}

export function mediaIdFromPath(filePath: string): string {
  const m = String(filePath || '').match(/\/api\/files\/([\w-]+)/)
  return m ? m[1] : ''
}

export async function isAdmin(adminId: string | null | undefined): Promise<boolean> {
  if (!adminId) return false
  try {
    const a = await db.admin.findUnique({ where: { id: String(adminId) } })
    return Boolean(a)
  } catch {
    return false
  }
}

export async function getStudentAnyStatus(studentId: string | null | undefined) {
  if (!studentId) return null
  try {
    return await db.student.findUnique({ where: { id: String(studentId) } })
  } catch {
    return null
  }
}

export async function getActiveStudent(studentId: string | null | undefined) {
  const s = await getStudentAnyStatus(studentId)
  // حالات القبول في المنصة: approved (مجاني) أو paid (اشتراك) — pending/rejected مرفوضين
  return s && (s.status === 'approved' || s.status === 'paid' || s.status === 'active') ? s : null
}

export interface PlaybackResult {
  ok: boolean
  code: number
  reason: string
  video?: { id: string; title: string; url: string; filePath: string; price: number }
}

// قاعدة الوصول المركزية (على السيرفر):
// - فيديو مجاني (price=0) → مفتوح (للانonymوس على صفحة الهبوط + للطلاب)
// - فيديو بسعر → طالب مسجل مفعل + (دفعة معتمدة لهذا الفيديو أو صلاحية VideoAccess)
export async function computePlayback(videoId: string, studentId: string | null | undefined): Promise<PlaybackResult> {
  const video = await db.video.findUnique({ where: { id: videoId } })
  if (!video) return { ok: false, code: 404, reason: 'الفيديو غير موجود' }
  const isFree = !video.price || Number(video.price) <= 0
  if (isFree) return { ok: true, code: 200, reason: 'free', video }
  if (!studentId) return { ok: false, code: 401, reason: 'سجل الدخول الأول' }
  const student = await getActiveStudent(studentId)
  if (!student) return { ok: false, code: 401, reason: 'الحساب غير مفعل' }
  try {
    const access = await db.videoAccess.findUnique({
      where: { videoId_studentId: { videoId, studentId } },
    })
    if (access) return { ok: true, code: 200, reason: 'granted', video }
    const payment = await db.payment.findFirst({
      where: { studentId, videoId, status: 'approved' },
    })
    if (payment) return { ok: true, code: 200, reason: 'paid', video }
  } catch {
    // جداول ناقصة — سياسة الـ auto-heal هتصلحها في /api/health
  }
  return { ok: false, code: 402, reason: 'محتاج تسديد الفيديو ده الأول' }
}

// الصورة المصغرة من غير ما نكشف لينك اليوتيوب:
// لو محفوظة نرجعها زي ما هي (صور عامة)، لو يوتيوب نبعت عبر بروكسي
// /api/video-thumb/[id] اللي بيجيب الصورة من يوتيوب على السيرفر
// فالكلاينك مش شايف الـ ID في مصدر الصفحة.
export function safeThumb(video: { thumbnail?: string; url?: string; id: string }): string {
  if (video.thumbnail) return video.thumbnail
  if (getYouTubeId(video.url || '')) return '/api/video-thumb/' + video.id
  return ''
}
