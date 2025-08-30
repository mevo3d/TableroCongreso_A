// Service Worker para Streaming PWA
const CACHE_NAME = 'congreso-streaming-v1';
const urlsToCache = [
  '/streaming-live',
  '/images/parallax/layer-1-nubes.png',
  '/images/parallax/layer-2-volcan.png',
  '/images/parallax/layer-3-congreso.png',
  '/icon-live-180.png',
  '/icon-live-192.png',
  '/icon-live-512.png',
  '/uploads/logo-secundario.png'
];

// Instalación del Service Worker
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Cache abierto');
        return cache.addAll(urlsToCache);
      })
      .catch(error => {
        console.log('Error en cache:', error);
      })
  );
  self.skipWaiting();
});

// Activación del Service Worker
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// Interceptar peticiones
self.addEventListener('fetch', event => {
  // No cachear el streaming de vMix
  if (event.request.url.includes('192.168.150.71:8088')) {
    event.respondWith(fetch(event.request));
    return;
  }
  
  // Para otros recursos, intentar cache primero
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          return response;
        }
        return fetch(event.request);
      })
      .catch(error => {
        console.log('Error en fetch:', error);
      })
  );
});