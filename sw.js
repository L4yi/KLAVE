const CACHE = 'klave-v3';
const ASSETS = [
  '/',
  '/index.html',
  '/css/base.css',
  '/css/layout.css',
  '/css/screens.css',
  '/js/firebase-init.js',
  '/js/data.js',
  '/js/beat-of-the-week.js',
  '/js/player.js',
  '/js/marketplace.js',
  '/js/producer.js',
  '/js/auth-profile.js',
  '/js/app.js'
];

self.addEventListener('install', e => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    Promise.all([
      caches.keys().then(keys =>
        Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
      ),
      self.clients.claim()
    ])
  );
});

self.addEventListener('fetch', e => {
  const url = e.request.url;
  if (url.includes('/api/') || url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
