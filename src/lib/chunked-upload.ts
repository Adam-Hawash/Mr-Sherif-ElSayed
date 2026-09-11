// Shared chunked upload utility - bypasses Next.js body size limits
// Splits files into 2MB chunks and sends them to /api/upload/chunk
//
// 2026-و20 — ضمانة «الورقة بتتحمل كاملة 100%» (طلب المستر: اول ما ادخل
// على الورق بنحملها كلها):
//  1. الصورة بترفع فورًا أول ما الطالب يختارها (مش عند التسليم)
//  2. بعد اكتمال الأجزاء بنقارن الحجم المخزن على السيرفر بحجم الملف الأصلي
//     بايت-ببايت — لو مش مطابق بنعيد الرفع **كله من الأول** (uploadId جديد)
//     مرة واحدة تلقائيًا
//  3. لو التععادة فشلت برضه بنرمي خطأ واضح بدل ما نسيب ورقة مقطوعة تتخزن
//     ويصححها الـ AI على إنها ناقصة

const CHUNK_SIZE = 2 * 1024 * 1024 // 2MB per chunk
const UPLOAD_TIMEOUT = 300_000 // 5 minutes max per chunk

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

async function uploadOnce(
  file: File,
  category: string,
  onProgress?: (pct: number) => void,
  statusMsg?: (msg: string) => void
): Promise<ChunkedUploadResult> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE)
  const uploadId = crypto.randomUUID()

  // For small files (< 2MB), send in one request
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

  // Large files - send in chunks
  for (let i = 0; i < totalChunks; i++) {
    const start = i * CHUNK_SIZE
    const end = Math.min(start + CHUNK_SIZE, file.size)
    const chunk = file.slice(start, end)

    const fd = new FormData()
    fd.append('file', chunk, file.name)
    fd.append('uploadId', uploadId)
    fd.append('chunkIndex', String(i))
    fd.append('totalChunks', String(totalChunks))
    fd.append('fileName', file.name)
    fd.append('category', category)

    if (statusMsg) statusMsg(`جاري رفع الجزء ${i + 1} من ${totalChunks}...`)
    if (onProgress) onProgress(Math.round(((i + 1) / totalChunks) * 95))

    const res = await uploadChunkWithRetry('/api/upload/chunk', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `خطأ في رفع الجزء ${i + 1}`)

    if (data.done) {
      verifySize(data, file.size)
      if (onProgress) onProgress(100)
      if (statusMsg) statusMsg('تم الرفع بنجاح!')
      return data
    }
  }

  throw new Error('فشل الرفع - لم يتم استلام كل الأجزاء')
}

/* التحقق من اكتمال الملف المخزن: الحجم بيتقارن بالبايت — أي نقص
 * بيرمي SIZE_MISMATCH عشان الـ wrapper يعيد الرفع كله من الأول */
function verifySize(data: ChunkedUploadResult, expected: number) {
  if (data && typeof data.size === 'number' && data.size !== expected) {
    throw new Error('SIZE_MISMATCH:' + data.size + '/' + expected)
  }
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
