const CACHE_NAME = 'smartstore-ai-shell-v2';
const APP_SHELL = [
  '/offline.html',
  '/brand/smartstore-mark-192.png',
  '/brand/smartstore-mark-512.png',
  '/favicon-32x32.png',
];

globalThis.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(APP_SHELL))
      .then(() => globalThis.skipWaiting()),
  );
});

globalThis.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => caches.delete(key)),
      ))
      .then(() => globalThis.clients.claim()),
  );
});

globalThis.addEventListener('fetch', (event) => {
  const request = event.request;

  if (request.method !== 'GET') {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== globalThis.location.origin) {
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .catch(() => caches.match('/offline.html')),
    );
    return;
  }

  if (url.pathname.startsWith('/_next/')) {
    return;
  }

  if (
    url.pathname.startsWith('/brand/')
    || url.pathname.startsWith('/favicon')
  ) {
    event.respondWith(
      caches.match(request).then((cached) => {
        return cached ?? fetch(request).then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
          return response;
        });
      }),
    );
  }
});
