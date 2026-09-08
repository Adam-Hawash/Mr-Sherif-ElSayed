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

// ===== Self-heal لجدول تذاكر التشغيل =====
// لو جدول PlayTicket ناقص في الداتابيز (حصل في الإنتاج بعد التحديث)
// كل طلبات التشغيل كانت بتفشل — هنا بنعمله أوتوماتيك أول ما نحس بوجوده.
// force=true بتتجاهل الكاش وبتعمل CREATE TABLE فعليًا — بتستخدم في
// إعادة المحاولة بعد أي فشل (لو الجدول اتمسح والموقع شغال).
var _ticketTableReady = false
export async function ensurePlayTicketTable(force = false): Promise<void> {
  if (_ticketTableReady && !force) return
  try {
    await db.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS PlayTicket (id TEXT PRIMARY KEY, videoId TEXT NOT NULL, studentId TEXT DEFAULT "", createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, expiresAt DATETIME NOT NULL, consumed INTEGER NOT NULL DEFAULT 0)'
    )
    _ticketTableReady = true
  } catch (e) {
    console.error('ensurePlayTicketTable error:', e)
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

// ============================================================
// التسلسل في المشاهدة (طلب المستر): لو فيه أكتر من فيديو على المنصة،
// الفيديو اللي بعده ميقعش يتفتح غير لما الفيديو اللي قبله يتشاف كامل
// — نسبة المشاهدة توصل 100% (أو 99% هامش أمان للتفاوت في مدة اليوتيوب).
// الترتيب: من الأقدم للأحدث (ترتيب نزول الدروس نفسه).
// الفيديوهات اللي مينفعش نتتبع نسبتها (لينك خارجي بس) بتتخطى عشان
// التسلسل ميقلعش على فيديو مش قابل للقياس.
// ============================================================
export const SEQ_UNLOCK_RATIO = 0.99

export async function checkSequentialUnlock(
  videoId: string,
  studentId: string | null | undefined
): Promise<{ ok: boolean; code?: number; reason?: string }> {
  // زائر/معاينة أدمن → التسلسل مبيطبقش عليهم
  if (!studentId) return { ok: true }
  try {
    const video = await db.video.findUnique({ where: { id: videoId } })
    if (!video) return { ok: true }
    const gradeVideos = await db.video.findMany({
      where: { grade: video.grade },
      orderBy: { createdAt: 'asc' },
      select: { id: true, url: true, filePath: true, fileType: true },
    })
    const idx = gradeVideos.findIndex((v) => v.id === videoId)
    // أول فيديو في الترتيب دايمًا مفتوح
    if (idx <= 0) return { ok: true }
    // ندوّر على أقرب فيديو قبله قابل لتتبع النسبة (يوتيوب أو ملف مرفوع)
    for (let i = idx - 1; i >= 0; i--) {
      const v = gradeVideos[i]
      const isYT = Boolean(getYouTubeId(v.url || ''))
      const isFile = Boolean(v.filePath || v.fileType)
      if (!isYT && !isFile) continue // لينك خارجي — مش قابل للتتبع، نتخطاه
      const prog = await db.videoProgress.findUnique({
        where: { studentId_videoId: { studentId, videoId: v.id } },
      }).catch(() => null)
      const ratio = prog && prog.totalSeconds > 0 ? prog.watchedSeconds / prog.totalSeconds : 0
      if (ratio < SEQ_UNLOCK_RATIO) {
        return {
          ok: false,
          code: 423,
          reason: 'الفيديو ده هيتفتح أول ما تشوف الفيديو اللي قبله كامل (100%) — كمّل مشاهدة الفيديو اللي قبله الأول',
        }
      }
      break // أقرب فيديو قبله قابل للتتبع خلص → الفيديو ده مفتوح
    }
    return { ok: true }
  } catch (e) {
    // أي خطأ داخلي → ممنوع نمنع طالب بريء من المشاهدة بسبب عطل تقني
    return { ok: true }
  }
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
