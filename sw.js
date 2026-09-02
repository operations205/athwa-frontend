const CACHE = 'athwa-v3';
const ASSETS = ['./', './index.html', './guest.html', './staff.html', './owner.html', './manager.html', './team.html',
  './manifest.json', './manifest-guest.json', './manifest-staff.json', './manifest-owner.json', './manifest-manager.json', './manifest-dept.json',
  './icon-192.png', './icon-512.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(()=>{}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

/* Network-first, and ONLY for this app's own static files. Cross-origin
   requests (the backend API on a different Render service, Resend, etc.)
   are left completely untouched below - the worker never calls
   respondWith() for them, so the browser handles them natively and the
   page's own fetch() sees the real response or the real network error.

   Previously this handler wrapped EVERY fetch, same-origin or not, in a
   try-then-fallback-to-cached-HTML. When the production backend's CORS
   policy didn't yet allow the portal.athwa.app origin, that cross-origin
   fetch rejected, and this worker silently served the cached app shell
   instead - a real 200 "successful-looking" page load with a completely
   broken login underneath it, no visible error anywhere. Do not reintroduce
   that: any request this worker does not own must be left alone so a
   backend/CORS/network failure always reaches the app's own error handling
   unmodified. */
self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Only ever intervene for our own origin's requests.
  if (url.origin !== self.location.origin) return;

  // Defensive: never intercept an /api/ path even if same-origin one day -
  // this static origin doesn't serve any today, but this guarantee must
  // hold regardless of future routing changes.
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(()=>{});
      return res;
    }).catch(() => {
      // Offline fallback only makes sense for page navigations. Never
      // substitute cached HTML for a failed script/style/asset request -
      // that can produce a confusing half-stale page.
      if (req.mode === 'navigate') {
        return caches.match(req).then((cached) => cached || caches.match('./guest.html').then((r) => r || caches.match('./index.html')));
      }
      return caches.match(req);
    })
  );
});
