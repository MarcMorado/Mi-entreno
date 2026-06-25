// FORJA Service Worker — permite notificaciones push con la app cerrada
const CACHE = 'forja-v1';

// Instalación: cachea la app para que funcione offline
self.addEventListener('install', (e) => {
  self.skipWaiting();
  e.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(['./index.html', './manifest.json']))
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(self.clients.claim());
});

// Servir desde caché si no hay red (offline)
self.addEventListener('fetch', (e) => {
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request).then((r) => r || caches.match('./index.html')))
  );
});

// AQUÍ está la magia: recibir una notificación push del servidor
self.addEventListener('push', (e) => {
  let data = { title: 'FORJA', body: '¡Hora de entrenar! 💪' };
  try {
    if (e.data) data = e.data.json();
  } catch (err) {
    if (e.data) data = { title: 'FORJA', body: e.data.text() };
  }
  e.waitUntil(
    self.registration.showNotification(data.title || 'FORJA', {
      body: data.body || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      vibrate: [200, 100, 200],
      tag: 'forja-coach',
      renotify: true,
      data: { url: './index.html' }
    })
  );
});

// Al tocar la notificación, abre la app
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then((list) => {
      for (const c of list) {
        if (c.url.includes('index.html') && 'focus' in c) return c.focus();
      }
      if (clients.openWindow) return clients.openWindow('./index.html');
    })
  );
});
