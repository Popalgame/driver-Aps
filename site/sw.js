const CACHE = 'driver-time-v9';
const FILES = ['./', 'index.html', 'style.css', 'src/app.js', 'src/time.js', 'src/report.js', 'src/cloud.js', 'src/manager.js', 'src/firebase-config.js',
  'vendor/firebase.js', 'manifest.webmanifest', 'icon.svg',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Спершу мережа, без мережі — кеш (апка працює офлайн у дорозі)
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Лише власні файли апки. Запити до Firebase (вхід, база) — напряму в мережу.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});
