// Network-first service worker: deployed changes take priority over old cached pages.
const CACHE_NAME = 'rabab-salon-online-v12';
const CORE = [
  './',
  './index.html',
  './salon-history.js?v=1',
  './salon-auth.js?v=5',
  './salon-sync.js?v=3',
  './manifest.json',
  './favicon.ico',
  './favicon-32x32.png',
  './favicon-16x16.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(CORE)).catch(() => {}));
  self.skipWaiting();
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key)))),
    self.clients.claim()
  ]));
});
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(fetch(req).then(response => {
    if (response.ok && new URL(req.url).pathname !== '/sw.js') {
      const copy = response.clone();
      event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.put(req, copy)).catch(() => {}));
    }
    return response;
  }).catch(async () => (await caches.match(req)) || Response.error()));
});

