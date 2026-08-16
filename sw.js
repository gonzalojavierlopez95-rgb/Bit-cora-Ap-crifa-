// Service Worker mínimo — solo existe para que Chrome permita instalar
// la Bitácora como app nativa (no como acceso directo con logo de Chrome).
// No cachea nada: cada carga sigue yendo a la red, así que ver la versión
// más nueva después de actualizar el HTML sigue funcionando igual que antes.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(fetch(event.request));
});
