/**
 * Solia PWA Service Worker
 * Basic offline-capable service worker for PWABuilder compatibility.
 * Caches app shell on install, serves from cache with network fallback.
 */

const CACHE_NAME = 'solia-v2';
const PRECACHE_URLS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
];

// Install: cache app shell
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(PRECACHE_URLS);
    })
  );
  self.skipWaiting();
});

// Activate: clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch: network-first for API/RPC, cache-first for static assets
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Skip non-GET requests and cross-origin API calls
  if (event.request.method !== 'GET') return;
  if (url.origin !== self.location.origin) return;

  // Always fetch legal pages fresh from network (static HTML, not React app)
  if (['/terms', '/privacy', '/license'].includes(url.pathname)) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const fetchPromise = fetch(event.request).then((response) => {
        // Cache successful responses for static assets
        if (response.ok && !url.pathname.startsWith('/api')) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      }).catch(() => cached); // Fallback to cache if offline

      return cached || fetchPromise;
    })
  );
});
