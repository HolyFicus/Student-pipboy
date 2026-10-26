// Pip-Boy 3000: Student OS Service Worker
// Fully compatible with root domain, local preview, and GitHub Pages subpath
const CACHE_NAME = 'pipboy-student-v2';

self.addEventListener('install', (event) => {
  const scope = self.registration.scope;
  const STATIC_ASSETS = [
    scope,
    scope + 'index.html',
    scope + 'manifest.json',
    scope + 'icon-192.svg',
    scope + 'icon-512.svg'
  ];

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS).catch((err) => {
        console.warn('PWA Cache prefill error (harmless during dev/deploy):', err);
      });
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;

  const url = event.request.url;
  const scope = self.registration.scope;

  // Only handle requests belonging to this app's origin and scope
  if (!url.startsWith(self.location.origin) || !url.startsWith(scope)) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // Cache hit: return cached and update in background
        fetch(event.request)
          .then((freshResponse) => {
            if (freshResponse && freshResponse.status === 200) {
              caches.open(CACHE_NAME).then((cache) => cache.put(event.request, freshResponse));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request).catch(() => caches.match(scope + 'index.html'));
    })
  );
});

// Push & Notification listener
self.addEventListener('push', (event) => {
  let data = { title: 'PIP-BOY ALERT', body: 'Новое обновление контента обнаружено!' };
  if (event.data) {
    try {
      data = event.data.json();
    } catch {
      data.body = event.data.text();
    }
  }

  const scope = self.registration.scope;
  const options = {
    body: data.body,
    icon: scope + 'icon-192.svg',
    badge: scope + 'icon-192.svg',
    data: data.url || scope
  };

  event.waitUntil(
    self.registration.showNotification(data.title || 'PIP-BOY STUDENT MONITOR', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = event.notification.data || self.registration.scope;

  event.waitUntil(
    clients.matchAll({ type: 'window' }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) {
          return client.focus();
        }
      }
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});
