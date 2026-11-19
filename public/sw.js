/* ============================================================
   sw.js — Service Worker موحد (دمج و89 + و106)
   (و89) إشعارات أولياء الأمور — push + notificationclick
   (و106) PWA — تثبيت المنصة كتطبيق + صفحة أوفلاين للتنقلات
   ============================================================ */

var PWA_CACHE = 'sherif-pwa-v2'
var OFFLINE_URL = '/offline.html'

self.addEventListener('install', function (event) {
  /* (و89) skipWaiting الأصلي */
  self.skipWaiting()
  /* (و106) PWA — تجهيز صفحة الأوفلاين */
  event.waitUntil(
    caches.open(PWA_CACHE).then(function (cache) {
      return cache.addAll([OFFLINE_URL])
    }).catch(function () {})
  )
})

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(
        keys.filter(function (k) { return k !== PWA_CACHE }).map(function (k) { return caches.delete(k) })
      )
    }).then(function () {
      return self.clients.claim()
    })
  )
})

/* ===== (و106) PWA — التنقلات: شبكة أولاً وصفحة أوفلاين كاحتياط ===== */
self.addEventListener('fetch', function (event) {
  var req = event.request
  if (req.mode === 'navigate') {
    /* (ر23) فشل الشبكة اللحظي مش معناه مفيش نت — ٣ محاولات إعادة متدرجة
       (٧٠٠ ثم ١٣٠٠ ثم ٢٢٠٠ms) قبل ما نطوع صفحة الأوفلاين — عشان رسالة
       «مفيش اتصال» ما تظهرش والمنصة شغالة (المستر: بتقول مفيش نت وبعدين تشتغل) */
    event.respondWith(
      (async function () {
        var waits = [700, 1300, 2200]
        for (var i = -1; i < waits.length; i++) {
          try {
            if (i >= 0) {
              await new Promise(function (resolve) { setTimeout(resolve, waits[i]) })
            }
            return await fetch(req)
          } catch (e) { /* خدعة شبكة لحظية — محاولة تانية */ }
        }
        var hit = await caches.match(OFFLINE_URL)
        return hit || Response.error()
      })()
    )
  }
  /* غير التنقلات (API/ملفات) — تمرير عادي. ممنوع كاش أي API (بيانات حية) */
})

/* ===== (و89) إشعارات أولياء الأمور — زي ما هي حرفيًا ===== */
self.addEventListener('push', function (event) {
  var data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch (err) {
    data = { title: '🔔 إشعار جديد', body: event.data ? event.data.text() : '' }
  }
  var title = String(data.title || '🔔 إشعار جديد')
  var options = {
    body: String(data.body || ''),
    icon: String(data.icon || '/push-icon.png'),
    badge: String(data.badge || '/push-icon.png'),
    tag: String(data.tag || 'parent-notification'),
    renotify: true,
    vibrate: [200, 100, 200],
    requireInteraction: false,
    data: { url: String(data.url || '/#parent-login') },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', function (event) {
  event.notification.close()
  var raw = (event.notification.data && event.notification.data.url) ? String(event.notification.data.url) : '/#parent-login'
  event.waitUntil(
    (async function () {
      var base = new URL(self.registration.scope)
      var target
      try { target = new URL(raw, base).href } catch (e) { target = base.origin + '/#parent-login' }
      var pathOnly = target.split('#')[0]

      var clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i]
        if (c.url && c.url.split('#')[0] === pathOnly) {
          /* المنصة مفتوحة بالفعل — نركزها ونحولها جوه صفحتها نفسها
             (لوولي الأمر مسجل → بورتال الإشعارات / غير كده → شاشة الدخول) */
          try { await c.focus() } catch (eFocus) {}
          try { c.postMessage({ type: 'parent-notification-click', url: raw }) } catch (eMsg) {}
          return
        }
      }
      return self.clients.openWindow(target)
    })()
  )
})

self.addEventListener('message', function (event) {
  if (event.data === 'SKIP_WAITING') self.skipWaiting()
})
