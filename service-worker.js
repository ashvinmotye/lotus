const CACHE_NAME = "lotus-shell-v20";
const REMINDER_TEXT = "Take some time to pause and reflect.";
const BADGE_DB_NAME = "lotus-reminder-badge";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./config.js",
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
  if (new URL(event.request.url).origin !== self.location.origin) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request).then((response) => {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
      return response;
    }).catch(() => caches.match("./index.html")))
  );
});

function writeReminderBadge(increment) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(BADGE_DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore("counts");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("counts", "readwrite");
      const store = transaction.objectStore("counts");
      const read = store.get("unseen");
      let count = 0;
      read.onsuccess = () => {
        count = increment ? Math.min(99, (Number(read.result) || 0) + 1) : 0;
        store.put(count, "unseen");
      };
      transaction.oncomplete = () => { db.close(); resolve(count); };
      transaction.onerror = () => { db.close(); reject(transaction.error); };
    };
  });
}

async function clearReminderBadge() {
  try {
    await writeReminderBadge(false);
  } finally {
    if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
  }
}

async function updateReminderBadge() {
  const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  const appVisible = windows.some((client) => client.visibilityState === "visible");
  const count = await writeReminderBadge(!appVisible);
  if (appVisible) {
    if ("clearAppBadge" in self.navigator) await self.navigator.clearAppBadge();
  } else if ("setAppBadge" in self.navigator) {
    await self.navigator.setAppBadge(count);
  }
}

self.addEventListener("message", (event) => {
  if (event.data?.type === "lotus-clear-reminder-badge") {
    event.waitUntil(clearReminderBadge().catch(() => {}));
  }
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
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, {
      body,
      icon: "./assets/lotus-192.png",
      badge: "./assets/lotus-192.png",
      tag: data.tag || "lotus-reminder",
      renotify: true,
      data: { url }
    }),
    updateReminderBadge().catch(() => {})
  ]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "./#today", self.registration.scope).href;
  event.waitUntil(
    clearReminderBadge().catch(() => {}).then(() => clients.matchAll({ type: "window", includeUncontrolled: true })).then((windowClients) => {
      const appClient = windowClients.find((client) => client.url.startsWith(self.registration.scope));
      if (appClient) {
        return appClient.focus().then(() => appClient.navigate(targetUrl));
      }
      return clients.openWindow(targetUrl);
    })
  );
});
