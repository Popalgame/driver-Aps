// Назва кешу = версія апки (див. src/version.js)
const CACHE = 'driver-aps-0.1.13';
const FILES = ['./', 'index.html', 'style.css', 'src/app.js', 'src/time.js', 'src/report.js', 'src/cloud.js', 'src/manager.js', 'src/settings.js', 'src/install.js', 'src/version.js', 'src/profile.js', 'src/export.js', 'src/xlsx.js', 'src/mileage.js', 'src/mileage-calc.js', 'src/calendar.js', 'src/calendar-calc.js', 'src/projects.js', 'src/feed.js', 'src/inbox.js', 'src/inbox-calc.js', 'src/icons.js', 'src/tasks.js', 'src/mytasks.js', 'src/odo.js', 'src/shift-edit.js', 'src/update.js', 'src/photo.js', 'src/cars.js', 'src/car-calc.js', 'src/notices.js', 'src/notice-calc.js', 'src/firebase-config.js',
  'vendor/firebase.js', 'manifest.webmanifest', 'icon.svg',
  'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];

// Нова версія завантажується файл за файлом — апка показує, скільки вже завантажено.
// Перше встановлення вмикається одразу; оновлення чекає, поки людина натисне «Оновити».
async function tell(msg) {
  const list = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
  for (const c of list) c.postMessage({ type: 'sw-progress', version: CACHE, total: FILES.length, ...msg });
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    let next = 0, done = 0;
    tell({ done });
    const load = async () => {
      while (next < FILES.length) {
        const f = FILES[next++];
        const res = await fetch(new Request(f, { cache: 'reload' }));
        if (!res.ok) throw new Error(`${f}: ${res.status}`);
        await cache.put(f, res);
        tell({ done: ++done });
      }
    };
    try {
      await Promise.all([load(), load(), load(), load()]);
    } catch (err) {
      tell({ failed: true, error: String(err?.message || err) });
      throw err;
    }
    tell({ done: FILES.length, ready: true });
    // Перше встановлення — одразу. Старі версії апки (до 0.1.6) ще не вміють кнопку «Оновити»
    // з прогресом — для них теж одразу, як було раніше.
    const old = (await caches.keys()).some((k) => {
      const v = /^driver-aps-(\d+)\.(\d+)\.(\d+)$/.exec(k);
      return v && +v[1] * 1e6 + +v[2] * 1e3 + +v[3] < 1006;
    });
    if (!self.registration.active || old) self.skipWaiting();
  })());
});

// «Оновити» в апці — нова версія вмикається
self.addEventListener('message', (e) => {
  if (e.data?.type === 'skip') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Спершу кеш (миттєвий запуск, працює офлайн). Файли у кеші не підміняються поштучно:
// нова версія приходить цілим набором разом із новим sw.js (новий CACHE → install → addAll),
// тому старий index.html ніколи не змішається з новими скриптами («вічне завантаження»).
// Апка покаже «Оновити», коли нова версія готова.
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  // Лише власні файли апки. Запити до Firebase (вхід, база) — напряму в мережу.
  if (new URL(e.request.url).origin !== self.location.origin) return;
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(e.request, { ignoreSearch: true });
    if (cached) return cached;
    // Чого немає в кеші — з мережі (і зберегти, щоб працювало офлайн)
    const res = await fetch(e.request).catch(() => null);
    if (res && res.ok) cache.put(e.request, res.clone());
    return res || (await cache.match('./')) || Response.error();
  })());
});
