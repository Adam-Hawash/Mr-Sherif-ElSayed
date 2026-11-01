// FILE: src/lib/device.ts
// PURPOSE: بصمة الجهاز للطالب — كل جهاز ليه ID ثابت. الطالب بيسجل دخول
// من الجهاز اللي عمل بيه الحساب بس، وأي جهاز تاني محتاج سماح من المستر.
//
// المشكلة اللي اتكشفت في الإصدار السابق: البصمة كانت متحسوبة من خصائص
// مشتركة بس (مقاس الشاشة + اللغة + النسخة مسحوبة من الـ UA) — فموبايلين
// من نفس الفئة (آيفون على آيفون / سامسونج متشابهين) بيطلعوا **نفس البصمة**
// فالحساب كان بيفتح من أي جهاز شبهه! المستر قال صراحة: "أنا أقدر أدخل
// من أي جهاز — عاوزها من جهاز واحد بس اللي عملت بيه الحساب".
//
// الحل الجديد (بصمة أقوى + هوية فريدة):
//   1) UUID عشوائي فريد — مبيتكررش بين جهازين أبدًا (مخزن localStorage +
//      cookie) — ده هوية الجهاز الأساسية في الربط.
//   2) بصمة "ناتج الجهاز" dv3 — مدعّمة بمصادر تفريق قوية:
//      كانفس (رسم GPU) + كارت الشاشة WebGL + مقاس الشاشة المتاح + اللمس
//      + الـ UA من غير إصدارات — عشان موبايلين متشابهين يطلعوا بصمات مختلفة.
// المتصدّر (getDeviceCandidates) بيبعت كل القيم للسيرفر — السيرفر هو اللي
// بيقفل الحساب على جهاز إنشاء الحساب بس.

const DEVICE_KEY = 'mg_device_id'
const FP_KEY = 'mg_device_fp'
const COOKIE_KEY = 'mg_device'
const ONE_YEAR = 365 * 24 * 60 * 60 * 1000

function fromCookie(): string {
  try {
    var parts = document.cookie.split(';')
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i].trim()
      if (p.indexOf(COOKIE_KEY + '=') === 0) {
        return decodeURIComponent(p.substring(COOKIE_KEY.length + 1))
      }
    }
  } catch (e) {}
  return ''
}

function saveCookie(id: string) {
  try {
    document.cookie = COOKIE_KEY + '=' + encodeURIComponent(id) + '; path=/; max-age=' + Math.floor(ONE_YEAR / 1000) + '; SameSite=Lax'
  } catch (e) {}
}

function randomId(): string {
  var rnd = ''
  try {
    var buf = new Uint8Array(16)
    crypto.getRandomValues(buf)
    for (var i = 0; i < buf.length; i++) rnd += buf[i].toString(16).padStart(2, '0')
  } catch (e) {
    rnd = Math.random().toString(36).slice(2) + Date.now().toString(36)
  }
  return 'dev_' + rnd
}

/** هوية فريدة للجهاز — بتتولد مرة واحدة وبتتحفظ localStorage + cookie */
function ensureUniqueId(): string {
  try {
    var a = window.localStorage.getItem(DEVICE_KEY)
    if (a && a.indexOf('dev_') === 0) return a
  } catch (e) {}
  var c = fromCookie()
  if (c && c.indexOf('dev_') === 0) {
    try { window.localStorage.setItem(DEVICE_KEY, c) } catch (e) {}
    return c
  }
  var id = randomId()
  try { window.localStorage.setItem(DEVICE_KEY, id) } catch (e) {}
  saveCookie(id)
  return id
}

// بنشيل أرقام الإصدارات من الـ UA عشان تحديث المتصفح أو النظام ما يكسرش البصمة
function maskVersions(s: string): string {
  return s.replace(/\d+(\.\d+)*/g, 'X')
}

// FNV-1a 32bit — hash ثابت وسريع من غير مكتبات
function fnv1a(str: string, seed: number): number {
  var h = seed >>> 0
  for (var i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619) >>> 0
  }
  return h >>> 0
}

/* بصمة الكانفس — بترسم نص وأشكال وتعمل hash للنتيجة.
   بتفرّق بين الأجهزة حسب الـ GPU وتفاصيل العرض حتى لو المواصفات متطابقة */
function canvasFingerprint(): string {
  try {
    var cv = document.createElement('canvas')
    cv.width = 220
    cv.height = 60
    var ctx = cv.getContext('2d')
    if (!ctx) return 'nocanvas'
    ctx.textBaseline = 'top'
    ctx.font = '16px "Arial"'
    ctx.fillStyle = '#f60'
    ctx.fillRect(0, 0, 110, 30)
    ctx.fillStyle = '#069'
    ctx.fillText('Maths-Genius- fingerprint \ud83d\ude00', 2, 12)
    ctx.fillStyle = 'rgba(102,204,0,0.7)'
    ctx.fillText('بصمة الجهاز 12345', 4, 30)
    ctx.beginPath()
    ctx.arc(180, 30, 22, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(0,0,0,0.6)'
    ctx.stroke()
    var data = cv.toDataURL()
    // hash على شطتين عشان ناخد أكبر قدر من التفاصيل
    var half = Math.floor(data.length / 2)
    var h1 = fnv1a(data.slice(0, half), 0x811c9dc5)
    var h2 = fnv1a(data.slice(half), 0x01000193)
    return 'c' + h1.toString(36) + h2.toString(36)
  } catch (e) {
    return 'cerr'
  }
}

/* كارت الشاشة (WebGL) — اسم الـ GPU بيفرق بين فئات الأجهزة المختلفة */
function webglFingerprint(): string {
  try {
    var cv = document.createElement('canvas')
    var gl = (cv.getContext('webgl') || cv.getContext('experimental-webgl')) as any
    if (!gl) return 'nogl'
    var ext = gl.getExtension('WEBGL_debug_renderer_info')
    var vendor = ext ? String(gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) || '') : String(gl.getParameter(gl.VENDOR) || '')
    var renderer = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : String(gl.getParameter(gl.RENDERER) || '')
    return fnv1a(vendor + '~' + renderer, 0x01993311).toString(36)
  } catch (e) {
    return 'glerr'
  }
}

/* مكوّنات بصمة الجهاز الخام — بتيتم حسابها مرة واحدة وبتتخزن مع الحساب.
   السيرفر بيستخدمها في "مطابقة المكوّنات" عشان يتأكد إن الجهاز هو هو
   حتى لو التخزين اتمسح أو الموبايل اتلفت (الوضع العرضي/الطولي) */
function rawTraits(): Record<string, string> {
  var t: Record<string, string> = {}
  try {
    var n = navigator as any
    var langs = ''
    try { langs = (n.languages || []).slice(0, 3).join(',') } catch (e) {}
    t.ua = maskVersions(n.userAgent || '')
    t.lang = n.language || ''
    t.langs = langs
    t.platform = n.platform || ''
    t.sw = String(screen && screen.width ? screen.width : 0)
    t.sh = String(screen && screen.height ? screen.height : 0)
    t.cd = String(screen && screen.colorDepth ? screen.colorDepth : 24)
    t.aw = String(screen && screen.availWidth ? screen.availWidth : 0)
    t.ah = String(screen && screen.availHeight ? screen.availHeight : 0)
    try { t.orient = (screen.orientation && screen.orientation.type) || '' } catch (e) { t.orient = '' }
    t.dpr = String(window.devicePixelRatio || 1)
    t.cores = String(n.hardwareConcurrency || 0)
    t.mem = String(n.deviceMemory || '')
    t.touch = String(n.maxTouchPoints || 0)
    t.canvas = canvasFingerprint()
    t.webgl = webglFingerprint()
    try { t.tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '' } catch (e) { t.tz = '' }
  } catch (e) {
    t = { fallback: '1' }
  }
  return t
}

var _traitsCache: Record<string, string> | null = null
function getRawTraits(): Record<string, string> {
  if (!_traitsCache) _traitsCache = rawTraits()
  return _traitsCache
}

/* نفس الترتيب والصيغة القديمة بالظبط — أي تغيير هنا بيكسر البصمات المخزنة! */
function rawToDv3(t: Record<string, string>, orientOverride?: string): string {
  var parts = [
    t.ua || '',
    t.lang || '',
    t.langs || '',
    t.platform || '',
    (t.sw || '0') + 'x' + (t.sh || '0') + 'x' + (t.cd || '24'),
    (t.aw || '0') + 'x' + (t.ah || '0'),
    orientOverride !== undefined ? orientOverride : (t.orient || ''),
    t.dpr || '1',
    t.cores || '0',
    t.mem || '',
    t.touch || '0',
    t.canvas || '',
    t.webgl || '',
    t.tz || '',
  ]
  var raw = parts.join('|')
  var h1 = fnv1a(raw, 0x811c9dc5)
  var h2 = fnv1a(raw + '#v3', 0x01000193)
  var h3 = fnv1a(raw + '#deep', 0x09e711)
  return 'dv3_' + h1.toString(36) + h2.toString(36) + h3.toString(36)
}

/** بصمة "ناتج الجهاز" dv3 — مصادر تفريق أقوى عشان مفيش جهازين يطلعوا نفس القيمة */
function traitsFingerprint(): string {
  return rawToDv3(getRawTraits())
}

/** بيانات مكوّنات الجهاز الخام — بتتبعت للسيرفر مع التسجيل والدخول
 *  عشان لو البصمة الدقيقة اتغيرت (اتلفت الموبايل / تحديث المتصفح)
 *  السيرفر يقدر يتأكد بمطابقة المكوّنات إن ده نفس الجهاز فعلًا */
export function getDeviceTraits(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  return getRawTraits()
}

/**
 * الـ ID الأساسي: هوية فريدة عشوائية (dev_) — مبيتكررش بين جهازين.
 * وبنكتب البصمة الثابتة (dv3) جنبها احتياطي.
 * السيرفر بيربط الحساب بالهوية الفريدة + البصمة معًا، والقفل صارم:
 * جهاز إنشاء الحساب بس — وأي جهاز تاني محتاج "سماح" من المستر.
 */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  var id = ensureUniqueId()
  try {
    var fp = traitsFingerprint()
    window.localStorage.setItem(FP_KEY, fp)
    saveCookie(fp)
  } catch (e) {}
  return id
}

/**
 * كل القيم اللي ممكن تمثل الجهاز ده — بنبعتها كلها للسيرفر وقت الدخول:
 *  1) الهوية الفريدة (dev_) — الأساسية في الربط
 *  2) البصمة المحسوبة (dv3_) — بتتعرف على نفس الجهاز حتى لو التخزين اتمسح
 *  3) **نسخ dv3 بكل أوضاع الشاشة** (طولي/عرضي/بدون) — عشان لف الموبايل
 *     ما يكسرش التعرف على الجهاز (كان ده سبب حجب حسابات على جهازها!)
 *  4) البصمات القديمة المخزنة (dv2_ من إصدارات سابقة + الكوكي)
 * السيرفر بيفحص **كل** القيم دي مش أول واحدة بس.
 */
export function getDeviceCandidates(): string[] {
  if (typeof window === 'undefined') return []
  var ids: string[] = []
  try { var a = window.localStorage.getItem(DEVICE_KEY); if (a) ids.push(a) } catch (e) {}
  var t = getRawTraits()
  // البصمة الحالية + كل أشكال اتجاه الشاشة — نفس الصيغة، فرق الاتجاه بس
  ids.push(rawToDv3(t))
  ids.push(rawToDv3(t, 'portrait-primary'))
  ids.push(rawToDv3(t, 'landscape-primary'))
  ids.push(rawToDv3(t, ''))
  try { var f = window.localStorage.getItem(FP_KEY); if (f) ids.push(f) } catch (e) {}
  var c = fromCookie()
  if (c) ids.push(c)
  var unique: string[] = []
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] && unique.indexOf(ids[i]) === -1) unique.push(ids[i])
  }
  return unique
}

/**
 * نوع الجهاز — بيتحفظ مع الحساب عشان المستر يشوف في لوحة التحكم الحساب
 * اتعمل من موبايل ولا تابلت ولا كمبيوتر (لابتوب/ديسكتوب).
 *  - mobile: موبايل (آيفون/أندرويد موبايل/ويندوز فون)
 *  - tablet: تابلت (آيباد/أندرويد تابلت — بما فيهم آيباد الجديد اللي
 *    بيقدم نفسه Macintosh مع لمس)
 *  - computer: كمبيوتر — لابتوب أو ديسكتوب (مش بنفرق بينهم لأن المتصفح
 *    مبيدلش الفرق — الاتنين بيظهروا "كمبيوتر" للمستر)
 */
export function getDeviceType(): string {
  if (typeof window === 'undefined') return ''
  try {
    var ua = navigator.userAgent || ''
    var touch = (navigator.maxTouchPoints || 0) > 1
    var minSide = Math.min(screen.width || 9999, screen.height || 9999)
    // آيباد حديثًا بيقول Macintosh + لمس → تابلت
    var iPadOS = /Macintosh/i.test(ua) && touch && minSide >= 600
    if (/iPad|Tablet/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua)) || iPadOS) return 'tablet'
    if (/Mobi|iPhone|iPod|Windows Phone/i.test(ua)) return 'mobile'
    if (/Android/i.test(ua)) return 'tablet'
    return 'computer'
  } catch (e) {
    return ''
  }
}
