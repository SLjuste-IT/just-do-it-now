// Service Worker for JUST DO IT NOW
// Served as a static file from the site root so it gets full origin scope ("/"),
// which lets it reliably handle notification clicks AND cache static assets so
// repeat visits (and slow mobile connections) load near-instantly.
//
// Caching strategy (deliberately conservative + fail-fast):
//   • /api/*            → never touched (auth/data proxy — always goes to network)
//   • navigations       → network-first (short timeout), fall back to cached shell
//                         when offline/slow. Online users still get the freshest
//                         HTML, so deploys are picked up immediately.
//   • versioned CDN libs/fonts → cache-first: cached copy is served INSTANTLY and
//                         refreshed in the background; cold misses go to the network
//                         with a timeout. These URLs are immutable, so this is safe.
//   • everything else   → straight to network (no caching, no surprises)
//
// Every network hop is wrapped in a timeout so a stalled CDN on a flaky mobile
// connection can never hang the page — we fall back to cache or fail fast instead.

const CACHE = 'jdin-static-v1';
const NET_TIMEOUT = 7000; // ms before we stop waiting on the network

// Hosts whose assets are content-stable/version-pinned and worth caching.
const CDN_HOSTS = [
  'cdn.jsdelivr.net',        // PocketBase SDK, Flatpickr
  'cdnjs.cloudflare.com',    // Font Awesome CSS + webfonts
  'fonts.googleapis.com',    // Google Fonts stylesheet
  'fonts.gstatic.com'        // Google Fonts woff2 files
];

self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)));
    await self.clients.claim();
  })());
});

function cacheable(response) {
  // Keep successful same-origin/CORS responses and cross-origin opaque ones
  // (CDN scripts/fonts fetched no-cors still serve fine from cache).
  return response && (response.ok || response.type === 'opaque');
}

function fetchWithTimeout(request, ms) {
  if (typeof AbortController === 'undefined') return fetch(request);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(request, { signal: ctrl.signal }).finally(() => clearTimeout(t));
}

function refresh(request, cache) {
  // Background revalidation — never blocks the response, never throws.
  fetchWithTimeout(request, NET_TIMEOUT)
    .then((res) => { if (cacheable(res)) cache.put(request, res.clone()); })
    .catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }

  // Never intercept the PocketBase API proxy — auth tokens & live data.
  if (url.origin === self.location.origin && url.pathname.startsWith('/api/')) return;

  // Cache-first for immutable CDN libraries/fonts: instant from cache, refreshed
  // quietly in the background; cold misses hit the network with a timeout.
  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) { refresh(req, cache); return hit; }
      try {
        const res = await fetchWithTimeout(req, NET_TIMEOUT);
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return Response.error();
      }
    })());
    return;
  }

  // Network-first for page navigations, with an offline fallback to the cached shell.
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetchWithTimeout(req, NET_TIMEOUT);
        if (cacheable(res)) cache.put(req, res.clone());
        return res;
      } catch (_) {
        return (await cache.match(req)) || (await cache.match('/')) || Response.error();
      }
    })());
    return;
  }

  // Everything else: default to the network untouched.
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clientsArr) => {
      if (clientsArr.length) return clientsArr[0].focus();
      return self.clients.openWindow('/');
    })
  );
});
