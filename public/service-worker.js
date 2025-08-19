const CACHE_NAME = 'votacion-v1';
const urlsToCache = [
  '/',
  '/css/login.css',
  '/css/admin.css',
  '/css/diputado.css',
  '/css/presidente.css',
  '/js/main.js',
  '/js/admin.js',
  '/js/diputado.js',
  '/js/presidente.js'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', event => {
  if (event.request.url.includes('/api/')) {
    event.respondWith(
      fetch(event.request)
        .catch(() => {
          return new Response(
            JSON.stringify({ error: 'Sin conexión al servidor' }),
            { headers: { 'Content-Type': 'application/json' } }
          );
        })
    );
  } else {
    event.respondWith(
      caches.match(event.request)
        .then(response => {
          if (response) {
            return response;
          }
          return fetch(event.request)
            .then(response => {
              if (!response || response.status !== 200 || response.type !== 'basic') {
                return response;
              }
              const responseToCache = response.clone();
              caches.open(CACHE_NAME)
                .then(cache => {
                  cache.put(event.request, responseToCache);
                });
              return response;
            });
        })
    );
  }
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});