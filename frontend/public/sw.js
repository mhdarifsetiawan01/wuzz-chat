// Service Worker untuk Wuzz Chat Push Notification
// Standard W3C Web Push & Service Worker API dengan Zero-Knowledge Client-Side E2EE Background Decryption

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// Helper Base64 to Uint8Array
function base64ToBytes(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

// Mengambil Private Key milik user lokal dari IndexedDB wuzz_crypto_db
function getStoredLocalPrivateKey() {
  return new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        return resolve(null);
      }
      const request = indexedDB.open('wuzz_crypto_db', 1);
      request.onerror = () => resolve(null);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('e2ee_identity_keys')) {
          db.createObjectStore('e2ee_identity_keys', { keyPath: 'userId' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('e2ee_identity_keys')) {
          db.close();
          return resolve(null);
        }
        const tx = db.transaction('e2ee_identity_keys', 'readonly');
        const store = tx.objectStore('e2ee_identity_keys');
        const req = store.getAll();
        req.onsuccess = () => {
          const records = req.result;
          db.close();
          if (records && records.length > 0) {
            // Ambil record yang terakhir disimpan
            const latest = records[records.length - 1];
            resolve(latest && latest.privateKeyJWK ? latest.privateKeyJWK : null);
          } else {
            resolve(null);
          }
        };
        req.onerror = () => {
          db.close();
          resolve(null);
        };
      };
    } catch (e) {
      resolve(null);
    }
  });
}

// Melakukan dekripsi E2EE di background Service Worker
async function tryDecryptPushContent(encryptedPayload, roomId, senderPubKeyJWK) {
  try {
    if (!encryptedPayload || typeof encryptedPayload !== 'string' || !encryptedPayload.startsWith('e2ee:v1:')) {
      return null;
    }
    if (!senderPubKeyJWK || !roomId) {
      return null;
    }
    if (!self.crypto || !self.crypto.subtle) {
      return null;
    }

    const myPrivateKeyJWK = await getStoredLocalPrivateKey();
    if (!myPrivateKeyJWK) {
      return null;
    }

    const privKeyObj = typeof myPrivateKeyJWK === 'string' ? JSON.parse(myPrivateKeyJWK) : myPrivateKeyJWK;
    const pubKeyObj = typeof senderPubKeyJWK === 'string' ? JSON.parse(senderPubKeyJWK) : senderPubKeyJWK;

    const myPrivateKey = await self.crypto.subtle.importKey(
      'jwk',
      privKeyObj,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      ['deriveBits']
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
        customData.sender_public_key &&
        customData.room_id
      ) {
        const decrypted = await tryDecryptPushContent(
          customData.encrypted_content,
          customData.room_id,
          customData.sender_public_key
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
