// Offline support: the app shell and data are cached on install; map tiles and pictures are cached as they are viewed.
const CACHE = 'tarnished-route-1';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'vendor/leaflet.js', 'vendor/leaflet.css', 'fonts/inter.woff2', 'fonts/marcellus.woff2', 'data/route.json', 'data/markers.json', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== CACHE).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  const isAsset = /\/(tiles|icons|items|fonts|vendor)\//.test(e.request.url);
  e.respondWith(caches.open(CACHE).then(async c => {
    const hit = await c.match(e.request);
    const net = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return isAsset ? (hit || net) : net.then(r => r || hit); // assets: cache first; app and data: fresh first, cache when offline
  }));
});
