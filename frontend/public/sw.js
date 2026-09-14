// Service Worker untuk Wuzz Chat Push Notification
// Standard W3C Web Push & Service Worker API

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Tangani event push dari server
self.addEventListener('push', (event) => {
  if (!event.data) {
    return;
  }

  let data = {};
  try {
    data = event.data.json();
  } catch (err) {
    data = {
      title: 'Wuzz Chat',
      body: event.data.text() || 'Pesan baru diterima',
    };
  }

  const title = data.title || 'Wuzz Chat';
  const options = {
    body: data.body || 'Pesan baru diterima',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'wuzz-chat-notification',
    data: data.data || { url: '/chat' },
    vibrate: [100, 50, 100],
    renotify: true,
    requireInteraction: false,
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Tangani klik pada notifikasi
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const targetUrl = (event.notification.data && event.notification.data.url) || '/chat';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 1. Jika ada window Wuzz Chat yang sudah terbuka, fokuskan dan navigasikan
      for (const client of clientList) {
        if (client.url && client.url.includes('/chat') && 'focus' in client) {
          if ('navigate' in client && targetUrl) {
            client.navigate(targetUrl);
          }
          return client.focus();
        }
      }
      // 2. Jika belum ada window yang terbuka, buka tab / window baru
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
