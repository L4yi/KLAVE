const CACHE = 'klave-v2'; // bump this string on any future deploy that changes cached assets
const ASSETS = [
  '/',
  '/index.html'
];

self.addEventListener('install', e => {
  self.skipWaiting(); // activate the new service worker immediately, don't wait for old tabs to close
  e.waitUntil(
    caches.open(CACHE).then(cache => cache.addAll(ASSETS))
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim()) // take control of already-open tabs right away
  );
});

self.addEventListener('fetch', e => {
  // always fetch API calls fresh, cache everything else
  if (e.request.url.includes('/api/')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});
