// Offline support with automatic updates.
// App files and data: always asked from the network first (revalidated, never a stale copy); the cached copy is only used offline.
// Map tiles, walkthrough pictures and card pictures: served from the cache once seen, because they are large and do not change between app updates.
const APP = 'app-v3', BIG = 'big-v2';
const SHELL = ['./', 'index.html', 'app.css', 'app.js', 'vendor/leaflet.js', 'vendor/leaflet.css', 'fonts/inter.woff2', 'fonts/marcellus.woff2', 'data/route.json', 'data/markers.json', 'data/cards.json', 'data/extra.json', 'tiles/meta.json', 'manifest.webmanifest'];
self.addEventListener('install', e => e.waitUntil(caches.open(APP).then(c => c.addAll(SHELL.map(u => new Request(u, { cache: 'reload' })))).then(() => self.skipWaiting())));
self.addEventListener('activate', e => e.waitUntil(caches.keys().then(k => Promise.all(k.filter(n => n !== APP && n !== BIG).map(n => caches.delete(n)))).then(() => self.clients.claim())));
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  if (url.pathname.endsWith('/version.json')) return;                       // the update check always goes straight to the network
  if (/\/(tiles|walk|cards)\/.+\.(jpe?g|png|webp)$/i.test(url.pathname)) {
    e.respondWith(caches.open(BIG).then(async c => (await c.match(e.request)) || fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; })));
    return;
  }
  e.respondWith(caches.open(APP).then(async c => {
    const saved = () => c.match(e.request, { ignoreSearch: e.request.mode === 'navigate' });
    try {
      const r = await Promise.race([fetch(e.request, { cache: 'no-cache' }), new Promise((_, no) => setTimeout(() => no(new Error('slow')), 8000))]);
      if (r.ok) { c.put(e.request, r.clone()); return r; }
      return (await saved()) || r;           // the server answered with an error: the saved copy if there is one
    } catch (err) { const hit = await saved(); if (hit) return hit; throw err; }
  }));
});
