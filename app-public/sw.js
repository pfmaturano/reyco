// sw.js — Service worker mínimo para hacer la app instalable (PWA)
const CACHE_NAME = 'reyco-app-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Estrategia simple: red primero, sin caché agresivo (evita ver datos viejos)
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request).catch(() => caches.match(event.request))
  );
});
