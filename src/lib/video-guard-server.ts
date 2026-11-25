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
  /* (و45) دعم كل الصيغ: watch?v= و youtu.be و shorts و live و embed و v/ */
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

/* ============================================================
 * (و45) ترميم دفاعي لجدول Video — درس و43 الموثق: الـ heal الرئيسي
 * (بصمة ensure-schema) مش مضمون يتشغّل على كل نشر، وأي عمود ناقص
 * في جدول Video بيبوّظ كل قراية/كتابة Prisma (لأن Prisma بيختار كل
 * الأعمدة) → «الفيديو ما بيتضفش» من غير سبب واضح. الدالة دي بتشتغل
 * قبل الكتابة في /api/videos: CREATE TABLE IF NOT EXISTS + ALTER
 * متسامح لكل عمود — مرة واحدة لكل instance، وفشلها ما يمنعش المحاولة.
 * ============================================================ */
var _videoTableReady = false
export async function ensureVideoTable(force = false): Promise<void> {
  if (_videoTableReady && !force) return
  try {
    await db.$executeRawUnsafe(
      'CREATE TABLE IF NOT EXISTS Video (id TEXT PRIMARY KEY, title TEXT NOT NULL, url TEXT DEFAULT "", filePath TEXT DEFAULT "", fileType TEXT DEFAULT "", thumbnail TEXT DEFAULT "", grade TEXT NOT NULL, price REAL DEFAULT 0, createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)'
    )
    var cols = [
      ['url', 'TEXT', "DEFAULT ''"],
      ['filePath', 'TEXT', "DEFAULT ''"],
      ['fileType', 'TEXT', "DEFAULT ''"],
      ['thumbnail', 'TEXT', "DEFAULT ''"],
      ['price', 'REAL', 'DEFAULT 0'],
      // (2026-و106) الدرس متعدد الفيديوهات — ترميم ترميمي لنفس السبب
      ['groupKey', 'TEXT', "DEFAULT ''"],
      ['orderIndex', 'INTEGER', 'DEFAULT 0'],
      // (2026-د) مدة الفيديو بالثواني — بادج ⏱ على كروت الفيديوهات
      ['durationSec', 'INTEGER', 'DEFAULT 0'],
      // (2026-ص) ترتيب الدروس اليدوي — المستر يرتب ب▲▼ من لوحة التحكم
      ['sortIndex', 'INTEGER', 'DEFAULT 0'],
    ]
    for (var i = 0; i < cols.length; i++) {
      try {
        await db.$executeRawUnsafe('ALTER TABLE Video ADD COLUMN ' + cols[i][0] + ' ' + cols[i][1] + ' ' + cols[i][2])
      } catch (eCol) {
        /* duplicate column = تمام — أي خطأ تاني بيتتجاهل والمحاولة الجاية تقول */
      }
    }
    _videoTableReady = true
  } catch (e) {
    console.error('ensureVideoTable error:', e)
  }
}

// (ملغاة 2026-و4) self-heal عمود nativeEmbed + extractEmbedSrc — ميزة
// «إضافة فيديو من كود HTML» اتنست بطلب المستر نفسه (كانت بتجيب واجهة
// يوتيوب ومفيش تحكم فعلي في الجودة). العمود القديم في داتابيز قديمة هيفضل
// موجود بس مش بيتقري من أي كود.

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
// التسلسل في المشاهدة (طلب المستر): الفيديو ميفتحش غير لما اللي قبله
// يتشاف كامل — والحاكم هو **قايمة الطالب نفسها بالحرف** (إصلاح 2026-ص3):
//   1) نفس ترتيب العرض عند الطالب: الترتيب اليدوي (sortIndex) ثم الأحدث
//      فوق (createdAt تنازلي) — زي orderedVideos في البوابة بالحرف.
//   2) نفس تجميع الدروس: أجزاء الدرس (groupKey) بترتيب orderIndex ومكانها
//      عند أول جزء ظاهر — زي lessons في البوابة بالحرف.
//   3) **الفيديو المخفي عن الطالب مش بيدخل السلسلة أصلًا** — إصلاح مشكلة
//      المستر: «الفيديو اللي خفيته يتلغي من عند الطالب يبقى أول فيديو
//      ليه اللي هو الفيديو الموجود عنده». الإخفاء بكل أنواعه:
//      أ) إخفاء فيديو واحد عن طالب (VideoSchedule.hiddenStudentIds)
//      ب) إخفاء درس كامل عن طلاب (LessonHide — ز13)
//      ج) فيديو مجموعات مش موجّه لمجموعته أو ميعاده مجاي (VideoGroupSchedule)
//      ⇒ أول فيديو شايفه الطالب في قايمته = أول فيديو في السلسلة = مفتوح دايمًا،
//        ومفيش رسالة «شوف اللي قبله» على فيديو أصلاً مش موجود عنده.
//   4) اللي الطالب شافه أو بدأه قبل كده (أي نسبة > 0) عمره ما يتقفل تاني
//      — حتى لو المستر نزل فيديو جديد فوقه أو أعاد الترتيب.
//   5) الفيديو اللي بفلوس والطالب مالوش وصول له = اختياري صامت (ز22)
//      — مش بيحجب اللي بعده ومش بيعدّ «اللي قبله».
//   6) الحكم على «خلص» بنفس حساب البوابة بالحرف: 97%+ بتتحسب 100%
//      (نفس تسنية /api/video-progress) — فالسيرفر والبوابة نفس الحكم،
//      ومفيش «النسبة معروضة 100 والفيديو مقفول» ولا العكس.
// الفيديوهات اللي مينفعش نتتبع نسبتها (لينك خارجي بس) بتتخطى.
// ============================================================
export const SEQ_UNLOCK_RATIO = 0.97

export async function checkSequentialUnlock(
  videoId: string,
  studentId: string | null | undefined
): Promise<{ ok: boolean; code?: number; reason?: string }> {
  // زائر/معاينة أدمن → التسلسل مبيطبقش عليهم
  if (!studentId) return { ok: true }
  try {
    const video = await db.video.findUnique({ where: { id: videoId } })
    if (!video) return { ok: true }
    // نفس استعلام قايمة البوابة بالحرف (نفس الترتيب اللي الطالب شايفه)
    var rows: any[] = await db.video.findMany({
      where: { grade: video.grade },
      orderBy: [{ sortIndex: 'asc' }, { createdAt: 'desc' }],
      select: {
        id: true, title: true, url: true, filePath: true, fileType: true,
        price: true, groupKey: true, orderIndex: true,
      },
    })
    var gkOf = function (v: any): string { return String((v && v.groupKey) || '') }

    /* ===== (1) كل أنواع الإخفاء عن الطالب ده — نفس مصادر البوابة بالحرف ===== */
    // أ) إخفاء فيديو واحد (VideoSchedule.hiddenStudentIds)
    var hiddenVideoIds: Record<string, boolean> = {}
    try {
      var vsRows: any[] = await db.$queryRawUnsafe('SELECT videoId, hiddenStudentIds FROM VideoSchedule')
      for (var vi = 0; vi < (vsRows || []).length; vi++) {
        var vRow = vsRows[vi]
        var hiddenIds: string[] = []
        try { hiddenIds = JSON.parse(String(vRow.hiddenStudentIds || '[]')) } catch (e) {}
        if (hiddenIds.indexOf(String(studentId)) !== -1) hiddenVideoIds[String(vRow.videoId || '')] = true
      }
    } catch (e) { /* جدول ناقص — من غير جدولة قديمة */ }
    // ب) إخفاء درس كامل (LessonHide — ز13)
    var hiddenGroupKeys: Record<string, boolean> = {}
    try {
      var lhRows: any[] = await db.$queryRawUnsafe('SELECT groupKey, studentIds FROM LessonHide')
      for (var li = 0; li < (lhRows || []).length; li++) {
        var lRow = lhRows[li]
        var lIds: string[] = []
        try { lIds = JSON.parse(String(lRow.studentIds || '[]')) } catch (e) {}
        if (lIds.indexOf(String(studentId)) !== -1) hiddenGroupKeys[String(lRow.groupKey || '')] = true
      }
    } catch (e) { /* جدول ناقص — من غير إخفاء دروس */ }
    // ج) جدولة المجموعات (VideoGroupSchedule) — نفس فلاتر /api/videos بالحرف
    var plansByVideo: Record<string, { groupId: string; unlockAt: string | null }[]> = {}
    var myGroup = ''
    try {
      var sgRows: any[] = await db.$queryRawUnsafe('SELECT groupId FROM Student WHERE id = ? LIMIT 1', studentId)
      if (sgRows && sgRows.length > 0) myGroup = String(sgRows[0].groupId || '')
    } catch (e) {}
    try {
      var schedRows: any[] = await db.$queryRawUnsafe('SELECT videoId, groupId, unlockAt FROM VideoGroupSchedule')
      for (var ri = 0; ri < (schedRows || []).length; ri++) {
        var sRow = schedRows[ri]
        var sVid = String(sRow.videoId || '')
        if (!plansByVideo[sVid]) plansByVideo[sVid] = []
        plansByVideo[sVid].push({ groupId: String(sRow.groupId || ''), unlockAt: sRow.unlockAt ? String(sRow.unlockAt) : null })
      }
    } catch (e) { /* جدول ناقص — من غير جدولة مجموعات */ }
    var groupVisible = function (vid: string): boolean {
      var plans = plansByVideo[vid]
      if (!plans || plans.length === 0) return true // من غير جدولة مجموعات = للكل
      if (!myGroup) return false
      for (var pi = 0; pi < plans.length; pi++) {
        if (plans[pi].groupId !== myGroup) continue
        if (!plans[pi].unlockAt) return true // مجموعته من غير ميعاد → ظاهر فورًا
        var t = new Date(plans[pi].unlockAt as string).getTime()
        if (isNaN(t)) return true
        return Date.now() >= t // جه الميعاد → ظاهر، لسه → مخفي
      }
      return false // مجموعته مش مستهدفة في الفيديو ده
    }

    /* الهدف نفسه متخفي صراحةً عن الطالب؟ القايمة بتشيله عنده خالص —
       أي محاولة تشغيل مباشرة (تاب قديم مثلًا) ترفض برسالة واضحة */
    var targetRow: any = null
    for (var ti = 0; ti < rows.length; ti++) { if (rows[ti].id === videoId) { targetRow = rows[ti]; break } }
    if (targetRow) {
      if (hiddenVideoIds[videoId]) {
        return { ok: false, code: 403, reason: 'الفيديو ده مش متاح ليك حالياً — اتحذف من قايمتك' }
      }
      var tgk = gkOf(targetRow)
      if (tgk && hiddenGroupKeys[tgk]) {
        return { ok: false, code: 403, reason: 'الدرس ده مش متاح ليك حالياً — اتحذف من قايمتك' }
      }
    }

    /* ===== نسب المشاهدة — طلبة واحدة + نفس تسنية /api/video-progress ===== */
    var ratioOf: Record<string, number> = {}
    try {
      var progRows = await db.videoProgress.findMany({
        where: { studentId: String(studentId) },
        select: { videoId: true, watchedSeconds: true, totalSeconds: true },
      })
      for (var pIdx = 0; pIdx < progRows.length; pIdx++) {
        var pRow = progRows[pIdx]
        ratioOf[pRow.videoId] = pRow.totalSeconds > 0 ? pRow.watchedSeconds / pRow.totalSeconds : 0
      }
    } catch (e) { /* مفيش نسب مسجلة — السلسلة تطلب المشاهدة عادي */ }
    // نفس حساب البوابة بالحرف: 97%+ بتتعرض 100% (تسنية GET /api/video-progress)
    var pctOf = function (id: string): number {
      var r = ratioOf[id] || 0
      if (r >= SEQ_UNLOCK_RATIO) return 100
      return Math.min(100, Math.round(r * 100))
    }
    /* القاعدة الأهم: اللي الطالب شافه أو بدأه قبل كده عمره ما يتقفل تاني
       — الحماية المباشرة من «فيديو شفته 16% ومش راضي يفتح» */
    if ((ratioOf[videoId] || 0) > 0) return { ok: true }

    /* ===== (2) نفس قايمة البوابة بالحرف: lessons (الجروب على مكان أول جزء) =====
       المخفي عن الطالب مش موجود عنده أصلًا → مش بيدخل السلسلة خالص */
    var byKey: Record<string, any[]> = {}
    rows.forEach(function (v) {
      if (hiddenVideoIds[v.id]) return
      var k = gkOf(v)
      if (!k) return
      if (hiddenGroupKeys[k]) return // الدرس المخفي كامل — أجزاءه ما تتجمعش
      ;(byKey[k] = byKey[k] || []).push(v)
    })
    var chain: any[] = []
    var groupInserted: Record<string, boolean> = {}
    rows.forEach(function (v) {
      if (hiddenVideoIds[v.id]) return
      var k = gkOf(v)
      if (k && hiddenGroupKeys[k]) return
      if (!k) { chain.push(v); return }
      if (groupInserted[k]) return
      groupInserted[k] = true
      var parts = (byKey[k] || []).slice().sort(function (a: any, b: any) {
        return (Number(a.orderIndex) || 0) - (Number(b.orderIndex) || 0)
      })
      for (var pi2 = 0; pi2 < parts.length; pi2++) chain.push(parts[pi2])
    })

    /* ===== (3) مشية البوابة نفسها (lockedMap): أول فيديو قابل للتتبع
       في قايمته مفتوح دايمًا، وكل اللي بعده محتاج اللي قبله (قابل للتتبع)
       يكون خلص ≥99% — مفيش قفل دائري ولا رسالة على فيديو مش موجود عنده ===== */
    var prevTrackable: any = null
    for (var ci = 0; ci < chain.length; ci++) {
      var v = chain[ci]
      if (!groupVisible(v.id)) continue // مخفي بجدولة المجموعات — مش جزء من سلسلة الطالب
      var isYT = Boolean(getYouTubeId(v.url || ''))
      var isFile = Boolean(v.filePath || v.fileType)
      var trackable = isYT || isFile
      if (v.id === videoId) {
        // لينك خارجي (مش قابل للتتبع) → مفتوح دايمًا زي البوابة بالحرف
        if (trackable && prevTrackable) {
          var prevPct = pctOf(prevTrackable.id)
          if (prevPct < 99) {
            return {
              ok: false,
              code: 423,
              reason: 'الفيديو ده هيتفتح أول ما تشوف فيديو «' + (prevTrackable.title || 'اللي قبله') + '» كامل (100%) — الفيديو ده مفتوح عندك دلوقتي، كمّله الأول',
            }
          }
        }
        return { ok: true }
      }
      /* (ز22) المُسعّر من غير وصول = اختياري صامت — مش بيحجب ومش بيعدّ «اللي قبله» */
      if (trackable && v.price && Number(v.price) > 0) {
        var acc = await db.videoAccess.findUnique({
          where: { videoId_studentId: { videoId: v.id, studentId: String(studentId) } },
        }).catch(() => null)
        if (!acc) {
          var pay = await db.payment.findFirst({
            where: { studentId: String(studentId), videoId: v.id, status: 'approved' },
          }).catch(() => null)
          if (!pay) continue
        }
      }
      if (trackable) prevTrackable = v
    }
    // الهدف مش في سلسلة الطالب (مخفي بجدولة مجموعات مثلًا) — الوصول بيتحكم فيه computePlayback
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
