// MagnumB2B service worker — enables install (PWA) and web-push notifications.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
// A (no-op) fetch handler is required for installability on some browsers.
self.addEventListener("fetch", () => {});

// Web push: show the notification sent by the server.
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text() }; }
  const title = data.title || "מגנום";
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    dir: "rtl",
    lang: "he",
    data: { url: data.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(self.clients.matchAll({ type: "window" }).then((cs) => {
    for (const c of cs) { if (c.url.includes(url) && "focus" in c) return c.focus(); }
    return self.clients.openWindow(url);
  }));
});
