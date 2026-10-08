// Shared chunked upload utility - bypasses Next.js body size limits
// Splits files into chunks and sends them to /api/upload/chunk
//
// 2026-و20 — ضمانة «الورقة بتتحمل كاملة 100%» (طلب المستر: اول ما ادخل
// على الورق بنحملها كلها):
//  1. الصورة بترفع فورًا أول ما الطالب يختارها (مش عند التسليم)
//  2. بعد اكتمال الأجزاء بنقارن الحجم المخزن على السيرفر بحجم الملف الأصلي
//     بايت-ببايت — لو مش مطابق بنعيد الرفع **كله من الأول** (uploadId جديد)
//     مرة واحدة تلقائيًا
//  3. لو التععادة فشلت برضه بنرمي خطأ واضح بدل ما نسيب ورقة مقطوعة تتخزن
//     ويصححها الـ AI على إنها ناقصة

// ============================================================
// (تسريع رفع الفيديوهات — طلب المستر: «الفيديوهات بتاخد وقت عقبال
//  ما بتترفع مع إن النت تمام»)
// التلات تغييرات دي بترفع السرعة الفعلية ~4 أضعاف تقريبًا:
//   1) حجم الجزء 2MB → 3MB (لسه أقل من حد فيرسل 4.5MB للطلب بعد
//      التحويل base64) — عدد الطلبات بيقل للثلث
//   2) **رفع متوازي** — 3 أجزاء في الطريق في نفس الوقت بدل واحد ورا
//      واحد (السيرفر بيخزن كل جزء بمكانه بالفهرس فالترتيب مش مهم)
//   3) الفاينلايز بطلب صريح بعد اكتمال كل الأجزاء — السيرفر ما بيجمعش
//      ويعيد كتابة الملف كله (دي كانت العلة اللي كانت بتخلي الفيديو
//      الكبير ياخد دقايق أو يفشل صامت عند الـ timeout)
// نفس التوقيع chunkedUpload(file, category, onProgress, statusMsg) —
// كل اللي بيستخدمه (لوحة الأدمن/المصحح/الكتب) شغال من غير أي تغيير.
// ============================================================

const CHUNK_SIZE = 3 * 1024 * 1024 // 3MB per chunk (≈4MB base64 — تحت حد فيرسل)
const UPLOAD_TIMEOUT = 300_000 // 5 minutes max per chunk
const PARALLEL_UPLOADS = 3 // عدد الأجزاء في الطريق في نفس الوقت

function uploadWithTimeout(url: string, options: RequestInit): Promise<Response> {
  return Promise.race([
    fetch(url, options),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('انتهت مهلة الرفع - حاول ملف أصغر')), UPLOAD_TIMEOUT)
    ),
  ])
}

/* 2026-و19 — محاولة إضافية أوتوماتيكية لكل جزء: فشل شبكة لحظي
 * مبيفشّلش الرفع كله (المستر كان شايف «فشل الرفع» كتير ببلاش) */
async function uploadChunkWithRetry(url: string, options: RequestInit): Promise<Response> {
  try {
    return await uploadWithTimeout(url, options)
  } catch (err) {
    await new Promise((r) => setTimeout(r, 900))
    return uploadWithTimeout(url, options)
  }
}

export interface ChunkedUploadResult {
  filePath: string
  fileType: string
  filename: string
  size: number
  done?: boolean
}

/* التحقق من اكتمال الملف المخزن: الحجم بيتقارن بالبايت — أي نقص
 * بيرمي SIZE_MISMATCH عشان الـ wrapper يعيد الرفع كله من الأول */
function verifySize(data: ChunkedUploadResult, expected: number) {
  if (data && typeof data.size === 'number' && data.size !== expected) {
    throw new Error('SIZE_MISMATCH:' + data.size + '/' + expected)
  }
}

/* رفع جزء واحد — بيرجع حجم الجزء المتخزن من السيرفر */
async function uploadOneChunk(
  file: File,
  uploadId: string,
  index: number,
  totalChunks: number,
  category: string
): Promise<number> {
  const start = index * CHUNK_SIZE
  const end = Math.min(start + CHUNK_SIZE, file.size)
  const chunk = file.slice(start, end)

  const fd = new FormData()
  fd.append('file', chunk, file.name)
  fd.append('uploadId', uploadId)
  fd.append('chunkIndex', String(index))
  fd.append('totalChunks', String(totalChunks))
  fd.append('fileName', file.name)
  fd.append('category', category)

  const res = await uploadChunkWithRetry('/api/upload/chunk', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || `خطأ في رفع الجزء ${index + 1}`)
  return Number(data.received ?? end - start)
}

/* طلب الفاينلايز: السيرفر بيتأكد إن كل الأجزاء موجودة وبيسجل المانيفست */
async function finalizeUpload(
  file: File,
  uploadId: string,
  totalChunks: number,
  category: string
): Promise<ChunkedUploadResult> {
  const fd = new FormData()
  fd.append('uploadId', uploadId)
  fd.append('totalChunks', String(totalChunks))
  fd.append('fileName', file.name)
  fd.append('fileType', file.type || 'application/octet-stream')
  fd.append('category', category)
  fd.append('finalize', '1')

  const res = await uploadChunkWithRetry('/api/upload/chunk', { method: 'POST', body: fd })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'فشل إتمام الرفع')
  return data
}

async function uploadOnce(
  file: File,
  category: string,
  onProgress?: (pct: number) => void,
  statusMsg?: (msg: string) => void
): Promise<ChunkedUploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const uploadId = crypto.randomUUID()

  // For small files (< 1 chunk), send in one request
  if (totalChunks <= 1) {
    if (statusMsg) statusMsg('جاري الرفع...')
    const fd = new FormData()
    fd.append('file', file, file.name)
    fd.append('uploadId', uploadId)
    fd.append('chunkIndex', '0')
    fd.append('totalChunks', '1')
    fd.append('fileName', file.name)
    fd.append('category', category)

    const res = await uploadChunkWithRetry('/api/upload/chunk', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'فشل الرفع')
    verifySize(data, file.size)
    if (onProgress) onProgress(100)
    if (statusMsg) statusMsg('تم الرفع بنجاح!')
    return data
  }

  // ===== رفع متوازي: عدد PARALLEL_UPLOADS أجزاء في الطريق مع بعض =====
  let nextIndex = 0
  let doneCount = 0
  let firstError: Error | null = null

  async function worker(): Promise<void> {
    while (true) {
      if (firstError) return // حد فشل — الباقي يوقف فورًا
      const i = nextIndex
      if (i >= totalChunks) return // خلصت الأجزاء
      nextIndex++
      try {
        await uploadOneChunk(file, uploadId, i, totalChunks, category)
        doneCount++
        if (onProgress) onProgress(Math.round((doneCount / totalChunks) * 95))
        if (statusMsg) statusMsg(`جاري الرفع... ${doneCount} من ${totalChunks}`)
      } catch (e: any) {
        if (!firstError) firstError = e
        return
      }
    }
  }

  const workers: Promise<void>[] = []
  for (let w = 0; w < Math.min(PARALLEL_UPLOADS, totalChunks); w++) {
    workers.push(worker())
  }
  await Promise.all(workers)
  if (firstError) throw firstError

  // ===== الفاينلايز: تأكيد الأجزاء + تسجيل المانيفست (INSERT خفيف) =====
  if (statusMsg) statusMsg('بنسجل الملف...')
  if (onProgress) onProgress(97)
  const result = await finalizeUpload(file, uploadId, totalChunks, category)
  verifySize(result, file.size)
  if (onProgress) onProgress(100)
  if (statusMsg) statusMsg('تم الرفع بنجاح!')
  return result
}

export async function chunkedUpload(
  file: File,
  category: string,
  onProgress?: (pct: number) => void,
  statusMsg?: (msg: string) => void
): Promise<ChunkedUploadResult> {
  try {
    return await uploadOnce(file, category, onProgress, statusMsg)
  } catch (err: any) {
    const msg = String(err && err.message ? err.message : '')
    if (msg.indexOf('SIZE_MISMATCH') === 0) {
      // الملف المخزن ناقص → محاولة أخيرة بـ uploadId جديد بالكامل
      if (statusMsg) statusMsg('بنرجّع الرفع من الأول عشان الورقة توصل كاملة...')
      const retry = await uploadOnce(file, category, onProgress, statusMsg)
      verifySize(retry, file.size)
      return retry
    }
    throw err
  }
}
