/* CastroTide v2 service worker — shell cache-first; external APIs never cached
   (tide/weather data must stay fresh; app keeps last-good data in localStorage). */
const CACHE = "castrotide-v2.9"; // bump this on every shell change so users get updates
const SHELL = [
  "./", "./index.html", "./styles.css", "./data.js", "./scene.js", "./manifest.json",
  "./icon-192-v2.png", "./icon-512-v2.png", "./icon-maskable-512-v2.png"
];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks =>
    Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const u = new URL(e.request.url);
  if (u.origin !== self.location.origin || e.request.method !== "GET") return; // APIs: network pass-through
  e.respondWith(
    caches.match(e.request).then(r => r || fetch(e.request).then(res => {
      const cp = res.clone();
      caches.open(CACHE).then(c => c.put(e.request, cp));
      return res;
    }).catch(() => caches.match("./index.html")))
  );
});
