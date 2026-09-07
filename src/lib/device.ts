// FILE: src/lib/device.ts
// PURPOSE: بصمة الجهاز للطالب — كل جهاز ليه ID ثابت. الطالب بيسجل دخول
// من الجهاز اللي عمل بيه الحساب بس، وأي جهاز تاني محتاج سماح من المستر.
//
// المشكلة القديمة: الـ ID كان عشوائي ومتخزن في localStorage/cookie —
// أول ما الطالب يمسح بيانات المتصفح (أو يدخل من لينك بدومين مختلف)
// الـ ID بيضيع والحساب بيتقفل وكأنه جهاز جديد. المستر قال صراحة:
// "أنت أحفظ بيانات الجهاز — كده البيانات كلها هتضيع".
//
// الحل الجديد (ثلاث طبقات):
//   1) localStorage — أسرع مصدر
//   2) cookie — احتياطي لو الـ localStorage اتمسح
//   3) بصمة ثابتة محسوبة من خصائص الجهاز والمتصفح (UA ممنوع فيه أرقام
//      الإصدارات + اللغة + المنصة + مقاس الشاشة + الـ DPR + المعالج +
//      الذاكرة + التوقيت) — دي بتترسم من الأول بنفس القيمة حتى لو كل
//      التخزين اتمسح، فالجهاز بيفضل هو هو.
// والمتصدّر (getDeviceCandidates) بيبعت كل القيم المحتملة للسيرفر —
// لو أي واحدة فيهم مطابقة للحساب، الدخول بيمشي.

const DEVICE_KEY = 'mg_device_id'
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

/** بصمة محسوبة من خصائص الجهاز — نفس الجهاز + نفس المتصفح = نفس القيمة دايماً */
function traitsFingerprint(): string {
  var raw = ''
  try {
    var n = navigator as any
    var langs = ''
    try { langs = (n.languages || []).slice(0, 3).join(',') } catch (e) {}
    var parts = [
      maskVersions(n.userAgent || ''),
      n.language || '',
      langs,
      n.platform || '',
      (screen && screen.width ? screen.width : 0) + 'x' + (screen && screen.height ? screen.height : 0) + 'x' + (screen && screen.colorDepth ? screen.colorDepth : 24),
      String(window.devicePixelRatio || 1),
      String(n.hardwareConcurrency || 0),
      String(n.deviceMemory || ''),
    ]
    try { parts.push(Intl.DateTimeFormat().resolvedOptions().timeZone || '') } catch (e) { parts.push('') }
    raw = parts.join('|')
  } catch (e) {
    raw = 'fallback'
  }
  var h1 = fnv1a(raw, 0x811c9dc5)
  var h2 = fnv1a(raw + '#v2', 0x01000193)
  return 'dv2_' + h1.toString(36) + h2.toString(36)
}

/** الـ ID الأساسي: المتخزن الأول، ولو مش موجود بنرسم البصمة الثابتة ونتخزنها */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  var id = ''
  try { id = window.localStorage.getItem(DEVICE_KEY) || '' } catch (e) {}
  if (!id) id = fromCookie()
  if (!id) {
    id = traitsFingerprint()
    // لو البصمة الثابتة هي المصدر، بنعدها عشان تبقى شكل ثابت مستقر
    try { window.localStorage.setItem(DEVICE_KEY, id) } catch (e) {}
  }
  saveCookie(id)
  return id
}

/**
 * كل القيم اللي ممكن تمثل الجهاز ده — بنبعتها كلها للسيرفر وقت الدخول،
 * وأي واحدة تطابق الحساب تعدي. كده لو الـ localStorage اتمسح بس الكوكي
 * لسه موجود (أو العكس) — أو حتى الاتنين اتمسحوا — الجهاز بيتعرف برضه.
 */
export function getDeviceCandidates(): string[] {
  if (typeof window === 'undefined') return []
  var ids: string[] = []
  try { var a = window.localStorage.getItem(DEVICE_KEY); if (a) ids.push(a) } catch (e) {}
  var c = fromCookie()
  if (c) ids.push(c)
  var t = traitsFingerprint()
  ids.push(t)
  var unique: string[] = []
  for (var i = 0; i < ids.length; i++) {
    if (ids[i] && unique.indexOf(ids[i]) === -1) unique.push(ids[i])
  }
  return unique
}
