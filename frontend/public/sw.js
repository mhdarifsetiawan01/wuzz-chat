// Service Worker untuk Wuzz Chat Push Notification
// Standard W3C Web Push & Service Worker API dengan Zero-Knowledge Client-Side E2EE Background Decryption
// Version: 1.0.4

const SW_VERSION = '1.0.4';

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Listener untuk menjawab permintaan versi Service Worker dari frontend
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'GET_SW_VERSION') {
    if (event.ports && event.ports[0]) {
      event.ports[0].postMessage({ version: SW_VERSION });
    }
  }
});

// Helper Base64 to Uint8Array (Aman untuk format standard & URL-safe Base64)
function base64ToBytes(base64) {
  const normalized = base64.replace(/-/g, '+').replace(/_/g, '/');
  const padding = '='.repeat((4 - (normalized.length % 4)) % 4);
  const binary = atob(normalized + padding);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Mengambil Private Key milik user lokal dari CacheStorage (instan < 1ms) atau IndexedDB
async function getStoredLocalPrivateKey() {
  // 1. Coba baca dari CacheStorage (Sangat cepat < 1ms, tahan banting saat PWA di-kill OS Android)
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open('wuzz-crypto-keys');
      const resp = await cache.match('/__e2ee_identity');
      if (resp) {
        const data = await resp.json();
        if (data && data.privateKeyJWK) {
          return data.privateKeyJWK;
        }
      }
    }
  } catch (e) {}

  // 2. Fallback baca dari IndexedDB wuzz_crypto_db
  return new Promise((resolve) => {
    let resolved = false;
    const timer = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        resolve(null);
      }
    }, 2000);

    try {
      if (typeof indexedDB === 'undefined') {
        clearTimeout(timer);
        return resolve(null);
      }
      const request = indexedDB.open('wuzz_crypto_db', 1);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('e2ee_identity_keys')) {
          db.createObjectStore('e2ee_identity_keys', { keyPath: 'userId' });
        }
      };
      request.onerror = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      request.onblocked = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timer);
          resolve(null);
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('e2ee_identity_keys')) {
          db.close();
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
          return;
        }
        const tx = db.transaction('e2ee_identity_keys', 'readonly');
        const store = tx.objectStore('e2ee_identity_keys');
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result;
          db.close();
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            if (records && records.length > 0) {
              const latest = records[records.length - 1];
              resolve(latest && latest.privateKeyJWK ? latest.privateKeyJWK : null);
            } else {
              resolve(null);
            }
          }
        };
        req.onerror = () => {
          db.close();
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(null);
          }
        };
      };
    } catch (e) {
      if (!resolved) {
        resolved = true;
        clearTimeout(timer);
        resolve(null);
      }
    }
  });
}

// Melakukan dekripsi E2EE di background Service Worker
async function tryDecryptPushContent(encryptedPayload, roomId, senderPubKeyJWK, senderId) {
  try {
    if (!encryptedPayload || typeof encryptedPayload !== 'string' || !encryptedPayload.startsWith('e2ee:v1:')) {
      return null;
    }
    if (!roomId) {
      return null;
    }
    if (!self.crypto || !self.crypto.subtle) {
      return null;
    }

    let pubKeyRaw = senderPubKeyJWK;
    if (!pubKeyRaw && senderId) {
      try {
        const resp = await fetch(`/api/users/public-key?id=${encodeURIComponent(senderId)}`);
        if (resp.ok) {
          const keyData = await resp.json();
          if (keyData && keyData.public_key) {
            pubKeyRaw = keyData.public_key;
          }
        }
      } catch (e) {}
    }

    if (!pubKeyRaw) {
      return null;
    }

    const myPrivateKeyJWK = await getStoredLocalPrivateKey();
    if (!myPrivateKeyJWK) {
      return null;
    }

    const privKeyObj = typeof myPrivateKeyJWK === 'string' ? JSON.parse(myPrivateKeyJWK) : { ...myPrivateKeyJWK };
    const pubKeyObj = typeof pubKeyRaw === 'string' ? JSON.parse(pubKeyRaw) : { ...pubKeyRaw };

    // Hapus key_ops, use, dan alg agar impor Web Crypto P-256 selalu valid 100% tanpa DataError
    delete privKeyObj.key_ops;
    delete privKeyObj.use;
    delete privKeyObj.alg;
    delete pubKeyObj.key_ops;
    delete pubKeyObj.use;
    delete pubKeyObj.alg;

    const myPrivateKey = await self.crypto.subtle.importKey(
      'jwk',
      privKeyObj,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits', 'deriveKey']
    );

    const theirPublicKey = await self.crypto.subtle.importKey(
      'jwk',
      pubKeyObj,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // 1. Shared Bits ECDH
    const sharedBits = await self.crypto.subtle.deriveBits(
      { name: 'ECDH', public: theirPublicKey },
      myPrivateKey,
      256
    );

    // 2. HKDF Key
    const hkdfKey = await self.crypto.subtle.importKey(
      'raw',
      sharedBits,
      { name: 'HKDF' },
      false,
      ['deriveKey']
    );

    const encoder = new TextEncoder();
    const salt = encoder.encode(roomId || 'wuzz-chat-salt');
    const info = encoder.encode('wuzz-chat-e2ee-aes-v1');

    // 3. AES-256-GCM Key
    const aesKey = await self.crypto.subtle.deriveKey(
      { name: 'HKDF', hash: 'SHA-256', salt, info },
      hkdfKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );

    // 4. AES-GCM Decrypt
    const raw = encryptedPayload.slice('e2ee:v1:'.length);
    const parts = raw.split(':');
    if (parts.length !== 2) {
      return null;
    }

    const iv = base64ToBytes(parts[0]);
    const ciphertext = base64ToBytes(parts[1]);

    const decryptedBuffer = await self.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      ciphertext
    );

    const decoder = new TextDecoder();
    return decoder.decode(decryptedBuffer);
  } catch (err) {
    console.warn('[SW Push] Gagal dekripsi pesan E2EE:', err);
    return null;
  }
}

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
  let body = data.body || 'Pesan baru diterima';
  const customData = data.data || { url: '/chat' };

  event.waitUntil(
    (async () => {
      // Coba lakukan Client-Side Decryption jika pesan terenkripsi E2EE
      if (
        customData.encrypted_content &&
        typeof customData.encrypted_content === 'string' &&
        customData.encrypted_content.startsWith('e2ee:v1:') &&
        customData.room_id
      ) {
        const decrypted = await tryDecryptPushContent(
          customData.encrypted_content,
          customData.room_id,
          customData.sender_public_key,
          customData.sender_id
        );

        if (decrypted) {
          if (customData.media_type) {
            switch (customData.media_type) {
              case 'image':
                body = `📷 ${decrypted}`;
                break;
              case 'audio':
                body = `🎤 ${decrypted}`;
                break;
              case 'video':
                body = `🎥 ${decrypted}`;
                break;
              case 'document':
                body = `📄 ${decrypted}`;
                break;
              default:
                body = decrypted;
            }
          } else {
            body = decrypted;
          }
        }
      }

      const options = {
        body: body,
        icon: data.icon || '/favicon.ico',
        badge: data.badge || '/favicon.ico',
        tag: data.tag || 'wuzz-chat-notification',
        data: customData,
        vibrate: [200, 100, 200],
        renotify: true,
        requireInteraction: true,
      };

      return self.registration.showNotification(title, options);
    })()
  );
});

// Tangani klik pada notifikasi secara aman (Anti-ANR / Anti-Hang di Android)
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const rawUrl = (event.notification.data && event.notification.data.url) || '/chat';
  const urlToOpen = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      try {
        const clientList = await self.clients.matchAll({
          type: 'window',
          includeUncontrolled: true,
        });

        // 1. Jika ada window Wuzz Chat / PWA yang sudah terbuka di origin ini
        for (const client of clientList) {
          if (client.url && client.url.startsWith(self.location.origin)) {
            if ('focus' in client) {
              await client.focus();
            }
            if ('navigate' in client && client.url !== urlToOpen) {
              try {
                await client.navigate(urlToOpen);
              } catch (navErr) {
                // Abaikan jika navigasi dibatalkan
              }
            }
            return;
          }
        }

        // 2. Jika belum ada window yang terbuka, buka window/PWA baru
        if (self.clients.openWindow) {
          await self.clients.openWindow(urlToOpen);
        }
      } catch (err) {
        console.error('[SW Push] Error menangani notificationclick:', err);
        if (self.clients.openWindow) {
          try {
            await self.clients.openWindow(urlToOpen);
          } catch (e) {}
        }
      }
    })()
  );
});
