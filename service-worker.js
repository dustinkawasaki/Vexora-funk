const CACHE = "vexora-pwa-v3";
const CORE = ["./", "./index.html", "./dashboard.html", "./manifest.webmanifest", "./icon.svg", "./update.js", "./version.json"];

self.addEventListener("install", event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(CORE)));
  // A new version waits until the user chooses "Jetzt aktualisieren".
});

self.addEventListener("message", event => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key.startsWith("vexora-pwa-") && key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.endsWith("/version.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }));
    return;
  }
  event.respondWith((async () => {
    try {
      const response = await fetch(request);
      if (response && response.ok) {
        const copy = response.clone();
        const cache = await caches.open(CACHE);
        await cache.put(request, copy);
      }
      return response;
    } catch (_) {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === "navigate") return caches.match("./index.html");
      throw _;
    }
  })());
});
