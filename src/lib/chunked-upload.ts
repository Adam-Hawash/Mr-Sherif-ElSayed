// Shared chunked upload utility - bypasses Next.js body size limits
// Splits files into 2MB chunks and sends them to /api/upload/chunk

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

export async function chunkedUpload(
  file: File,
  category: string,
  onProgress?: (pct: number) => void,
  statusMsg?: (msg: string) => void
): Promise<{ filePath: string; fileType: string; filename: string; size: number }> {
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

    const res = await uploadWithTimeout('/api/upload/chunk', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'فشل الرفع')
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

    const res = await uploadWithTimeout('/api/upload/chunk', { method: 'POST', body: fd })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || `خطأ في رفع الجزء ${i + 1}`)

    if (data.done) {
      if (onProgress) onProgress(100)
      if (statusMsg) statusMsg('تم الرفع بنجاح!')
      return data
    }
  }

  throw new Error('فشل الرفع - لم يتم استلام كل الأجزاء')
}
