const CACHE = 'bookshelf-pwa-v5';
const ASSETS = [
  './',
  './index.html',
  './app.js',
  './manifest.webmanifest'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  e.respondWith(
    caches.match(request).then(cacheRes =>
      cacheRes || fetch(request).catch(() => cacheRes)
    )
  );
});
