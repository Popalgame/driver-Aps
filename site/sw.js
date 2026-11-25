// Назва кешу = версія апки (див. src/version.js)
const CACHE = 'driver-aps-0.1.2';
const FILES = ['./', 'index.html', 'style.css', 'src/app.js', 'src/time.js', 'src/report.js', 'src/cloud.js', 'src/manager.js', 'src/settings.js', 'src/install.js', 'src/version.js', 'src/profile.js', 'src/export.js', 'src/xlsx.js', 'src/mileage.js', 'src/mileage-calc.js', 'src/calendar.js', 'src/calendar-calc.js', 'src/projects.js', 'src/feed.js', 'src/inbox.js', 'src/inbox-calc.js', 'src/icons.js', 'src/tasks.js', 'src/mytasks.js', 'src/odo.js', 'src/notices.js', 'src/notice-calc.js', 'src/firebase-config.js',
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

// Спершу кеш (миттєвий запуск, працює офлайн), а мережею у фоні оновлюємо кеш:
// нова версія з'явиться при наступному відкритті (апка покаже «Оновити»).
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Лише власні файли апки. Запити до Firebase (вхід, база) — напряму в мережу.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request, { ignoreSearch: true });
    const network = fetch(e.request)
      .then((res) => {
        if (res.ok) cache.put(e.request, res.clone());
        return res;
      })
      .catch(() => null);
    if (cached) {
      e.waitUntil(network);
      return cached;
    }
    return (await network) || (await cache.match('./')) || Response.error();
  })());
});
