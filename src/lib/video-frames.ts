// @ts-nocheck
/* (2026-و107) قراءة أي فيديو على السيرفر واستخراج لقطات منه بـ ffmpeg —
   طلب المستر الحرفي: «أي لينك فيديو يشتغل — الغي رسالة لازم من موقع كذا / حط mp4».
   السيرفر بيقرأ الرابط نفسه مباشرة (HTTP range) — ولو المصدر ما ردّش بينزّل
   الملف مؤقتًا ويقراه محليًا. مفيش قيود صيغة: mp4 / mov / webm / mkv / avi /
   m4v — أي حاجة ffmpeg يفهمها. مفيش CORS أصلاً لأن القراءة سيرفر-سيرفر.
   SERVER-ONLY — ممنوع استيرادها من أي كود كلينت */

import { execFile } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import os from 'os'

var UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/* (و107) فحص توفر ffmpeg مرة واحدة — بيحدد هل الطبقة الأولى (اللقطات السريعة) متاحة.
   بيئات زي Vercel مافيهاش ffmpeg → بنقفز على طول للطبقة التانية (video-gemini) */
var _ffOk: boolean | null = null
export async function hasFfmpeg(): Promise<boolean> {
  if (_ffOk !== null) return _ffOk
  _ffOk = await new Promise(function (resolve) {
    execFile('ffmpeg', ['-version'], { timeout: 6000 }, function (err: any) { resolve(!err) })
  })
  return _ffOk
}

/* حماية SSRF — اللينكات الخارجية لازم تكون عامة. لينكات المنصة نفسها
   (/api/files/…) بتتفحص قبلها كاستثناء same-origin فمتلحقهش الحماية دي */
export function isSafePublicVideoUrl(u: string): boolean {
  try {
    var p = new URL(u)
    if (p.protocol !== 'http:' && p.protocol !== 'https:') return false
    var h = (p.hostname || '').toLowerCase()
    if (!h) return false
    if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return false
    if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h) || /^0\./.test(h)) return false
    var m172 = h.match(/^172\.(\d+)\./)
    if (m172) { var nn = parseInt(m172[1], 10); if (nn >= 16 && nn <= 31) return false }
    if (h.indexOf(':') > -1 && (/^fc|^fd|^fe80/i.test(h) || h === '::1')) return false
    return true
  } catch (e) { return false }
}

/* مدة الفيديو — ffprobe بيقرا الميتاداتا بس (من غير تنزيل الملف كله) */
function probeDuration(target: string): Promise<number> {
  return new Promise(function (resolve) {
    var args = ['-v', 'quiet', '-print_format', 'json', '-show_format',
      '-user_agent', UA, '-rw_timeout', '20000000',
      '-reconnect', '1', '-reconnect_streamed', '1',
      target]
    execFile('ffprobe', args, { timeout: 30000, maxBuffer: 4 * 1024 * 1024 }, function (err, stdout) {
      if (err || !stdout) return resolve(0)
      try {
        var j = JSON.parse(stdout)
        var d = parseFloat(j && j.format && j.format.duration)
        resolve(isFinite(d) && d > 0 ? d : 0)
      } catch (e) { resolve(0) }
    })
  })
}

/* لقطة واحدة عند ثانية محددة — -ss قبل -i = سريع (بيقرا الجزء المطلوب بس) */
function captureOne(target: string, t: number, outFile: string): Promise<boolean> {
  return new Promise(function (resolve) {
    var args = ['-hide_banner', '-loglevel', 'error',
      '-user_agent', UA, '-rw_timeout', '20000000',
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4',
      '-ss', String(Math.max(0, t)), '-i', target,
      '-frames:v', '1', '-q:v', '4', '-vf', 'scale=min(640\\,iw):-2',
      '-y', outFile]
    execFile('ffmpeg', args, { timeout: 25000, maxBuffer: 1024 * 1024 }, function (err) {
      if (err) return resolve(false)
      fs.stat(outFile).then(function (st) { resolve(st && st.size > 1200) }).catch(function () { resolve(false) })
    })
  })
}

/* fallback: مرور واحد بياخد إطارات موزعة بـ fps — للمصادر اللي الـ seek عليها فاشل */
function singlePass(target: string, total: number, dur: number, outPrefix: string): Promise<number> {
  return new Promise(function (resolve) {
    var fpsExpr = (total / Math.max(1, dur || 600)).toFixed(4)
    var args = ['-hide_banner', '-loglevel', 'error',
      '-user_agent', UA, '-rw_timeout', '20000000',
      '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '4',
      '-i', target,
      '-vf', 'fps=' + fpsExpr + ',scale=min(640\\,iw):-2',
      '-frames:v', String(total), '-q:v', '4', '-y', outPrefix + '%03d.jpg']
    execFile('ffmpeg', args, { timeout: 90000, maxBuffer: 1024 * 1024 }, function () {
      resolve(0) /* العدّ بيحصل في extractFramesFromVideoUrl بعد الرجوع */
    })
  })
}

/* تنزيل مؤقت — للمصادر اللي ما بتردش على قراءة الميتاداتا من الرابط */
function downloadToTmp(url: string, outFile: string, capBytes: number, timeoutMs: number): Promise<boolean> {
  return new Promise(function (resolve) {
    var ctrl = new AbortController()
    var to = setTimeout(function () { try { ctrl.abort() } catch (e) {} }, timeoutMs)
    fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'user-agent': UA, 'accept': '*/*' },
    }).then(async function (res) {
      if (!res.ok || !res.body) { clearTimeout(to); return resolve(false) }
      var buf = Buffer.alloc(0)
      var reader = res.body.getReader()
      try {
        for (;;) {
          var chunk = await reader.read()
          if (chunk.done) break
          buf = Buffer.concat([buf, Buffer.from(chunk.value)])
          if (buf.length > capBytes) { try { ctrl.abort() } catch (e) {} ; break }
        }
      } catch (eR) { clearTimeout(to); return resolve(buf.length > 0) }
      clearTimeout(to)
      if (buf.length === 0) return resolve(false)
      try { await fs.writeFile(outFile, buf); resolve(true) } catch (eW) { resolve(false) }
    }).catch(function () { clearTimeout(to); resolve(false) })
  })
}

async function readJpeg(file: string): Promise<string> {
  try {
    var b = await fs.readFile(file)
    if (!b || b.length < 1200) return ''
    return 'data:image/jpeg;base64,' + b.toString('base64')
  } catch (e) { return '' }
}

/* النقطة الرئيسية: لينك فيديو → لقطات dataURL جاهزة تتبعت لـ Gemini Vision */
export async function extractFramesFromVideoUrl(rawUrl: string, count: number, selfOrigin: string): Promise<{ frames: string[]; error: string }> {
  if (!(await hasFfmpeg())) return { frames: [], error: 'no-ffmpeg' }
  var url = String(rawUrl || '').trim()
  if (!url) return { frames: [], error: 'empty' }
  /* لينك داخلي نسبي (/api/files/…) → نكمّله بأصل المنصة */
  if (url.indexOf('/') === 0) url = String(selfOrigin || '').replace(/\/+$/, '') + url
  if (!/^https?:\/\//i.test(url)) return { frames: [], error: 'scheme' }
  var sameOrigin = !!selfOrigin && url.indexOf(String(selfOrigin).replace(/\/+$/, '')) === 0
  if (!sameOrigin && !isSafePublicVideoUrl(url)) return { frames: [], error: 'blocked' }

  var n = Math.max(3, Math.min(12, parseInt(String(count), 10) || 6))
  var outDir = path.join(os.tmpdir(), 'vf-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8))
  var tmpFile = ''
  try {
    await fs.mkdir(outDir, { recursive: true })
    var dur = await probeDuration(url)
    var target = url
    if (!dur) {
      tmpFile = path.join(outDir, 'src.bin')
      var okDl = await downloadToTmp(url, tmpFile, 500 * 1024 * 1024, 100000)
      if (okDl) { target = tmpFile; dur = await probeDuration(tmpFile) }
    }
    var frames: string[] = []
    if (dur > 0) {
      var times: number[] = []
      for (var i = 0; i < n; i++) {
        var t = dur * (0.05 + 0.9 * (i / Math.max(1, n - 1)))
        times.push(Math.max(0.1, Math.min(t, Math.max(0.1, dur - 0.1))))
      }
      for (var k = 0; k < times.length && frames.length < n; k++) {
        var f = path.join(outDir, 'f' + k + '.jpg')
        if (await captureOne(target, times[k], f)) {
          var d = await readJpeg(f)
          if (d) frames.push(d)
        }
      }
    }
    if (frames.length === 0) {
      /* fallback: مرور واحد موزع — بيغطي المصادر الغريبة اللي seek بيروح */
      await singlePass(target, n, dur, path.join(outDir, 's'))
      var files: string[] = []
      try { files = (await fs.readdir(outDir)).filter(function (x) { return /^s\d+\.jpg$/.test(x) }).sort() } catch (e) {}
      for (var q = 0; q < files.length && frames.length < n; q++) {
        var d2 = await readJpeg(path.join(outDir, files[q]))
        if (d2) frames.push(d2)
      }
    }
    return { frames: frames, error: frames.length ? '' : 'no-frames' }
  } catch (e) {
    return { frames: [], error: 'exception' }
  } finally {
    try { await fs.rm(outDir, { recursive: true, force: true }) } catch (e) {}
  }
}
