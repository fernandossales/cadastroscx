// Cache para abrir o app sem sinal no campo. Rede primeiro (pega versão nova), cache se offline.
const C = 'cadastroscx-v1';
const ARQ = ['./', 'index.html', 'schema.js', 'manifest.json', 'icone.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(C).then(c => c.addAll(ARQ))); self.skipWaiting(); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== C).map(k => caches.delete(k))))); self.clients.claim(); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(fetch(e.request).then(r => { const cp = r.clone(); caches.open(C).then(c => c.put(e.request, cp)); return r; }).catch(() => caches.match(e.request, { ignoreSearch: true })));
});
