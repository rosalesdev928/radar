const CACHE = 'radar-v1';
const ESENCIALES = ['/', '/index.html', '/manifest.json', '/icon-192.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ESENCIALES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);

  // Nunca cachear datos en vivo: Portal, backend, tiles del mapa
  if (
    e.request.method !== 'GET' ||
    url.hostname.includes('useportal.co') ||
    url.hostname.includes('cartocdn.com') ||
    url.pathname.startsWith('/eventos')
  ) {
    return;
  }

  // Red primero, caché como respaldo si no hay conexión
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copia = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copia));
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});