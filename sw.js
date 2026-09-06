const CACHE = 'klave-v2'; // bumped from v1 — forces old cached shell to be purged
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // don't wait for old tabs to close before activating
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
      self.clients.claim() // take control of already-open tabs immediately
    ])
  );
});

self.addEventListener('fetch', e => {
  // Never cache API calls or the app shell itself — always go to network
  // for these so a deploy is reflected on the very next reload, not just
  // "eventually". Cache is purely an offline fallback for other assets.
  const url = e.request.url;
  if (url.includes('/api/') || url.endsWith('/') || url.endsWith('/index.html')) {
    e.respondWith(fetch(e.request, { cache: 'no-store' }));
    return;
  }
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
