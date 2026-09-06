// FILE: src/lib/device.ts
// PURPOSE: بصمة الجهاز للطالب — كل جهاز ليه ID ثابت. الطالب بيسجل دخول
// من الجهاز اللي عمل بيه الحساب بس، وأي جهاز تاني محتاج سماح من المستر.
//
// الطبقتين: localStorage أساسي + cookie احتياطي (لو مسح بيانات الموقع
// من المتصفح، الكوكي ممكن ينقذه). لو الاتنين اتمسحوا → الجهاز بيتحسب
// جهاز جديد → الطالب يتواصل مع المستر يعمل له سماح (ده المطلوب بالظبط).

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

/** بيجيب/بيعمل بصمة الجهاز — ثابتة لنفس المتصفح على نفس الجهاز */
export function getDeviceId(): string {
  if (typeof window === 'undefined') return ''
  var id = ''
  try { id = window.localStorage.getItem(DEVICE_KEY) || '' } catch (e) {}
  if (!id) id = fromCookie()
  if (!id) {
    id = randomId()
    try { window.localStorage.setItem(DEVICE_KEY, id) } catch (e) {}
  }
  saveCookie(id)
  return id
}
