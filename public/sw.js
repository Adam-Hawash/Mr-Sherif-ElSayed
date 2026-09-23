/* ============================================================
   (2026-و89) sw.js — Service Worker إشعارات أولياء الأمور
   الهدف بطلب المستر: «الإشعار اللي هيجي لولي الأمر بره — إشعار
   براوزر حقيقي يظهر على شاشة الموبايل، ولما يدوس عليه يخش على
   الإشعارات اللي جوه المنصة».

   - push: بيستقبل الحمولة { title, body, url, tag, icon } ويعرضها
     على شاشة القفل/النظام بره المنصة.
   - notificationclick: ضغطة ولي الأمر على الإشعار → فتح المنصة
     على /#parent-login (شاشة دخول ولي الأمر — وبعد الدخول يشوف
     الإشعار جوه المنصة). لو المنصة مفتوحة بالفعل بيتُركّز ونفس
     الصفحة بتوجّه نفسها (لوولي الأمر مسجل → بورتال الإشعارات).
   ============================================================ */

self.addEventListener('install', function (event) {
  self.skipWaiting()
})

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim())
})

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
