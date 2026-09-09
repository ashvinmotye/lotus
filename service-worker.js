const CACHE_NAME = "lotus-shell-v7";
const REMINDER_TEXT = "Take some time to pause and reflect.";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./manifest.webmanifest",
  "./assets/lotus.svg",
  "./assets/lotus-192.png",
  "./assets/lotus-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = data.title || "Lotus";
  const body = data.body || REMINDER_TEXT;
  const url = data.url || "./#today";
  event.waitUntil(self.registration.showNotification(title, {
    body,
    icon: "./assets/lotus-192.png",
    badge: "./assets/lotus-192.png",
    tag: data.tag || "lotus-daily-entry",
    renotify: true,
    data: { url }
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./#today", self.registration.scope).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const appClient = windowClients.find((client) => client.url.startsWith(self.registration.scope));
      if (appClient) {
        return appClient.focus().then(() => appClient.navigate(targetUrl));
      }
      return clients.openWindow(targetUrl);
    })
  );
});
