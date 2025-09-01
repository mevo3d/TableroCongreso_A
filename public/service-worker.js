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
  // Temporalmente deshabilitado para evitar errores
  console.log('Service Worker instalado (cache deshabilitado temporalmente)');
  self.skipWaiting();
});

self.addEventListener('fetch', event => {
  // Simplemente pasar todas las peticiones sin cache
  event.respondWith(fetch(event.request));
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