// ============================================
// ShoreStack Vault — Service Worker
// ============================================
// Caching strategies for PWA offline support.
// NEVER caches decrypted data — only app shell and encrypted API responses.

const CACHE_NAME = 'shorestack-vault-v1';
const STATIC_CACHE = 'shorestack-static-v1';

// App shell files to pre-cache on install
// NOTE: Only pre-cache publicly accessible routes. /dashboard requires auth
// and would cache a redirect to /login, breaking offline.
const APP_SHELL = [
  '/',
  '/login',
  '/manifest.webmanifest',
  '/icon-192.png',
  '/icon-512.png',
];

// --- Install: Pre-cache app shell ---
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(APP_SHELL).catch((err) => {
        console.warn('[SW] Pre-cache partial failure:', err);
      });
    })
  );
  // Activate immediately
  self.skipWaiting();
});

// --- Activate: Clean old caches ---
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME && key !== STATIC_CACHE)
          .map((key) => caches.delete(key))
      );
    })
  );
  // Take control of all pages immediately
  self.clients.claim();
});

// --- Fetch: Strategy-based routing ---
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (mutations should always go to network)
  if (request.method !== 'GET') return;

  // Skip chrome-extension and non-http(s) URLs
  if (!url.protocol.startsWith('http')) return;

  // Supabase API calls: Never cache in service worker.
  // Caching Supabase responses stores kdf_salt, vault_verifier, and auth tokens
  // in Cache Storage, which is accessible to any JS on the origin (XSS risk).
  if (url.hostname.includes('supabase.co')) {
    return; // Let the browser handle it normally — no caching
  }

  // Static assets (fonts, images): Cache-first
  if (
    request.destination === 'image' ||
    request.destination === 'font' ||
    url.pathname.match(/\.(png|jpg|jpeg|svg|gif|ico|woff2?|ttf|eot)$/)
  ) {
    event.respondWith(cacheFirst(request, STATIC_CACHE));
    return;
  }

  // App pages and JS/CSS: Stale-while-revalidate
  event.respondWith(staleWhileRevalidate(request));
});

// --- Caching Strategies ---

async function cacheFirst(request, cacheName = CACHE_NAME) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const response = await fetch(request);
    if (response.ok) {
      const cache = await caches.open(cacheName);
      cache.put(request, response.clone());
    }
    return response;
  } catch {
    return new Response('Offline', { status: 503 });
  }
}

async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        const cache = caches.open(CACHE_NAME);
        cache.then((c) => c.put(request, response.clone()));
      }
      return response;
    })
    .catch(() => cached || new Response('Offline', { status: 503 }));

  return cached || fetchPromise;
}
