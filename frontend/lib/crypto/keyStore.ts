/**
 * IndexedDB KeyStore & Key Lifecycle Manager untuk E2EE
 */

import {
  generateKeyPair,
  exportPublicKeyJWK,
  exportPrivateKeyJWK,
  importPublicKeyJWK,
  importPrivateKeyJWK,
  deriveRoomAESKey,
} from './e2ee'

const DB_NAME = 'wuzz_crypto_db'
const DB_VERSION = 1
const STORE_NAME = 'e2ee_identity_keys'

interface StoredKeyRecord {
  userId: string
  privateKeyJWK: string
  publicKeyJWK: string
  createdAt: number
}

// In-Memory cache untuk Derived AES Keys per room agar performa real-time instan
const derivedAESKeyCache = new Map<string, CryptoKey>()

// Helper pembuka koneksi IndexedDB
function openCryptoDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB tidak tersedia di lingkungan ini'))
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'userId' })
      }
    }

    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

// Mengambil KeyPair milik user dari IndexedDB
export async function getLocalUserKeyPair(userId: string): Promise<{
  privateKey: CryptoKey
  publicKey: CryptoKey
  publicKeyJWK: string
} | null> {
  try {
    const db = await openCryptoDB()
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly')
      const store = tx.objectStore(STORE_NAME)
      const req = store.get(userId)

      req.onsuccess = async () => {
        const record = req.result as StoredKeyRecord | undefined
        if (!record) {
          resolve(null)
          return
        }

        try {
          const privateKey = await importPrivateKeyJWK(record.privateKeyJWK)
          const publicKey = await importPublicKeyJWK(record.publicKeyJWK)
          resolve({
            privateKey,
            publicKey,
            publicKeyJWK: record.publicKeyJWK,
          })
        } catch (err) {
          reject(err)
        }
      }

      req.onerror = () => reject(req.error)
    })
  } catch (err) {
    console.error('[E2EE KeyStore] Gagal membaca key dari IndexedDB:', err)
    return null
  }
}

// Menyimpan KeyPair ke IndexedDB
async function saveLocalUserKeyPair(
  userId: string,
  privateKeyJWK: string,
  publicKeyJWK: string
): Promise<void> {
  const db = await openCryptoDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite')
    const store = tx.objectStore(STORE_NAME)
    const record: StoredKeyRecord = {
      userId,
      privateKeyJWK,
      publicKeyJWK,
      createdAt: Date.now(),
    }
    const req = store.put(record)
    req.onsuccess = () => resolve()
    req.onerror = () => reject(req.error)
  })
}

// Inisialisasi E2EE saat user login / buka aplikasi:
// Jika belum ada key di IndexedDB, generate baru & upload public key ke backend.
export async function initUserE2EE(
  userId: string,
  token: string
): Promise<{ publicKeyJWK: string; privateKey: CryptoKey; publicKey: CryptoKey }> {
  let keyPair = await getLocalUserKeyPair(userId)

  if (!keyPair) {
    // Generate key pair baru
    const rawKeyPair = await generateKeyPair()
    const pubJWK = await exportPublicKeyJWK(rawKeyPair.publicKey)
    const privJWK = await exportPrivateKeyJWK(rawKeyPair.privateKey)

    await saveLocalUserKeyPair(userId, privJWK, pubJWK)

    // Upload public key ke backend Go
    try {
      await fetch('/api/users/public-key', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ public_key: pubJWK }),
      })
    } catch (err) {
      console.warn('[E2EE KeyStore] Gagal sinkronisasi public key ke server:', err)
    }

    return {
      publicKeyJWK: pubJWK,
      privateKey: rawKeyPair.privateKey,
      publicKey: rawKeyPair.publicKey,
    }
  }

  // Jika key pair sudah ada, pastikan server juga punya (idempotent check)
  try {
    fetch('/api/users/public-key', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ public_key: keyPair.publicKeyJWK }),
    }).catch(() => {})
  } catch {}

  return keyPair
}

// Mengambil atau membuat Derived AES Key untuk percakapan direct dengan lawan bicara
export async function getSharedRoomAESKey(
  myUserId: string,
  peerUserId: string,
  peerPublicKeyJWK: string,
  roomId: string
): Promise<CryptoKey | null> {
  if (!myUserId || !peerUserId || !peerPublicKeyJWK || !roomId) {
    return null
  }

  const cacheKey = `${myUserId}:${peerUserId}:${roomId}`
  if (derivedAESKeyCache.has(cacheKey)) {
    return derivedAESKeyCache.get(cacheKey)!
  }

  try {
    const myKeyPair = await getLocalUserKeyPair(myUserId)
    if (!myKeyPair) {
      return null
    }

    const peerPublicKey = await importPublicKeyJWK(peerPublicKeyJWK)
    const aesKey = await deriveRoomAESKey(myKeyPair.privateKey, peerPublicKey, roomId)

    derivedAESKeyCache.set(cacheKey, aesKey)
    return aesKey
  } catch (err) {
    console.error('[E2EE KeyStore] Gagal derive shared AES key:', err)
    return null
  }
}

// Cache peer public key JWK di memory
const peerPubKeyMemoryCache = new Map<string, string>()

export function cachePeerPublicKey(userId: string, publicKeyJWK: string) {
  if (userId && publicKeyJWK) {
    peerPubKeyMemoryCache.set(userId, publicKeyJWK)
  }
}

export function getCachedPeerPublicKey(userId: string): string | undefined {
  return peerPubKeyMemoryCache.get(userId)
}
