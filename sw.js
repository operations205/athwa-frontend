const CACHE = 'athwa-v2';
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

/* Network-first: always try to fetch the latest file from the server first
   (so app updates show up immediately), and only fall back to the cached
   copy if the network request fails (offline). This avoids the old
   cache-first behavior where visitors could get stuck on a stale build. */
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).then((res) => {
      const copy = res.clone();
      caches.open(CACHE).then((cache) => cache.put(e.request, copy)).catch(()=>{});
      return res;
    }).catch(() => caches.match(e.request).then((cached) => cached || caches.match('./guest.html').then(r=>r||caches.match('./index.html'))))
  );
});
