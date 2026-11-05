// App shell em cache: abre na hora, mesmo sem sinal; atualiza em segundo plano (stale-while-revalidate).
const C = 'cadastroscx-v4';
const ARQ = ['./', 'index.html', 'app.js', 'geo.js', 'schema.js', 'manifest.json', 'icone.svg', 'icone-180.png', 'preencher.html'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(ARQ))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  e.respondWith(caches.open(C).then(async c => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    const rede = fetch(e.request).then(r => { if (r.ok) c.put(e.request, r.clone()); return r; }).catch(() => hit);
    return hit || rede;
  }));
});
