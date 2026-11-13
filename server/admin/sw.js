const CACHE = 'betspapa-admin-shell-v1';
const SHELL = [
  '/admin',
  '/admin/manifest.webmanifest',
  '/admin/icons/icon-192.png',
  '/admin/icons/icon-512.png',
  '/admin/icons/icon-maskable-512.png',
  '/admin/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (event.request.method !== 'GET') return;
  if (url.pathname !== '/admin' && !url.pathname.startsWith('/admin/')) return;
  event.respondWith((async () => {
    try {
      const fresh = await fetch(event.request);
      if (fresh.ok && !url.pathname.startsWith('/api/')) {
        const cache = await caches.open(CACHE);
        await cache.put(event.request, fresh.clone());
      }
      return fresh;
    } catch (error) {
      const cached = await caches.match(event.request) || await caches.match('/admin');
      if (cached) return cached;
      throw error;
    }
  })());
});
