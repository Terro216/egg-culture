/* BUILD and ASSETS are generated from the exact public game asset graph. */
const scope = new URL(self.registration.scope).pathname;
const prefix = 'egg-road-offline:' + scope + ':';
const cacheName = prefix + BUILD;
const assets = new Set(ASSETS);
self.addEventListener('install', event => {
  // Failed or partial downloads cannot replace a working offline build.
  event.waitUntil(caches.open(cacheName).then(cache => cache.addAll(ASSETS)));
  // Deliberately do not skipWaiting: an update waits for existing game tabs.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) if (name.startsWith(prefix) && name !== cacheName) await caches.delete(name);
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Accounts, profiles and records always go to the network, never to a cache.
  const path = request.mode === 'navigate' && url.pathname === scope ? scope : url.pathname;
  if (!assets.has(path)) return;
  event.respondWith((async () => {
    const cache = await caches.open(cacheName), saved = await cache.match(path);
    if (saved) return saved;
    return fetch(request);
  })());
});
