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
import { apiRequest } from '../api'

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
        db.close()
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

      req.onerror = () => {
        db.close()
        reject(req.error)
      }
    })
  } catch (err) {
    console.error('[E2EE KeyStore] Gagal membaca key dari IndexedDB:', err)
    return null
  }
}

// Simpan juga ke CacheStorage agar Service Worker di Android dapat membaca instan (< 1ms) tanpa LevelDB lock
async function saveToCacheStorage(userId: string, privateKeyJWK: string, publicKeyJWK: string) {
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await window.caches.open('wuzz-crypto-keys')
      await cache.put(
        '/__e2ee_identity',
        new Response(JSON.stringify({ userId, privateKeyJWK, publicKeyJWK }), {
          headers: { 'Content-Type': 'application/json' },
        })
      )
    }
  } catch {}
}

// Menyimpan KeyPair ke IndexedDB dan CacheStorage
async function saveLocalUserKeyPair(
  userId: string,
  privateKeyJWK: string,
  publicKeyJWK: string
): Promise<void> {
  saveToCacheStorage(userId, privateKeyJWK, publicKeyJWK)
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
    req.onsuccess = () => {
      db.close()
      resolve()
    }
    req.onerror = () => {
      db.close()
      reject(req.error)
    }
  })
}

// Helper unik device ID per peramban/aplikasi
export function getOrCreateDeviceId(): string {
  if (typeof window === 'undefined') return 'server_ssr'
  const KEY = 'wuzz_device_id'
  let id = localStorage.getItem(KEY)
  if (!id) {
    id = 'dev_' + (window.crypto?.randomUUID ? window.crypto.randomUUID() : Math.random().toString(36).substring(2, 15))
    localStorage.setItem(KEY, id)
  }
  return id
}

// Custom error untuk mendeteksi konflik perangkat aktif
export class E2EEDeviceConflictError extends Error {
  keyVersion?: number
  isRotated?: boolean

  constructor(message: string, keyVersion?: number, isRotated: boolean = false) {
    super(message)
    this.name = 'E2EEDeviceConflictError'
    this.keyVersion = keyVersion
    this.isRotated = isRotated
  }
}

// Menghapus keypair lokal dari IndexedDB dan CacheStorage
export async function clearLocalKeyPair(userId: string): Promise<void> {
  try {
    const db = await openCryptoDB()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const req = store.delete(userId)
      req.onsuccess = () => {
        db.close()
        resolve()
      }
      req.onerror = () => {
        db.close()
        reject(req.error)
      }
    })
  } catch (err) {
    console.warn('[E2EE KeyStore] Gagal hapus key lokal:', err)
  }

  // Bersihkan juga dari CacheStorage
  try {
    if (typeof window !== 'undefined' && 'caches' in window) {
      const cache = await window.caches.open('wuzz-crypto-keys')
      await cache.delete('/__e2ee_identity')
    }
  } catch {}
}

// Inisialisasi E2EE saat user login / buka aplikasi:
// Jika belum ada key di IndexedDB, generate baru & registrasikan ke backend.
// Jika backend menolak (409 Conflict), lempar E2EEDeviceConflictError agar UI menampilkan modal pilihan.
export async function initUserE2EE(
  userId: string,
  _token?: string
): Promise<{ publicKeyJWK: string; privateKey: CryptoKey; publicKey: CryptoKey }> {
  const deviceId = getOrCreateDeviceId()
  let keyPair = await getLocalUserKeyPair(userId)

  if (!keyPair) {
    // Generate key pair baru
    const rawKeyPair = await generateKeyPair()
    const pubJWK = await exportPublicKeyJWK(rawKeyPair.publicKey)
    const privJWK = await exportPrivateKeyJWK(rawKeyPair.privateKey)

    // Upload public key ke backend Go dengan device_id
    const res = await apiRequest<{ status: string; key_version?: number; error?: string }>(
      '/api/users/public-key',
      {
        method: 'PUT',
        body: JSON.stringify({ public_key: pubJWK, device_id: deviceId }),
      }
    )

    if (res.status === 409 || res.error?.includes('KEY_ALREADY_REGISTERED')) {
      // Perangkat lain sedang aktif! JANGAN simpan key ini ke IndexedDB.
      throw new E2EEDeviceConflictError(
        'Akun ini sudah aktif di perangkat lain. Kunci keamanan tidak dapat ditimpa otomatis.',
        res.data?.key_version,
        false
      )
    }

    // Sukses atau fallback offline: Simpan key ke IndexedDB & CacheStorage
    await saveLocalUserKeyPair(userId, privJWK, pubJWK)

    return {
      publicKeyJWK: pubJWK,
      privateKey: rawKeyPair.privateKey,
      publicKey: rawKeyPair.publicKey,
    }
  }

  // Jika key pair sudah ada di IndexedDB device ini:
  // Simpan ke CacheStorage untuk Service Worker
  try {
    saveToCacheStorage(userId, keyPair.privateKey ? await exportPrivateKeyJWK(keyPair.privateKey) : '', keyPair.publicKeyJWK)
    
    // Verifikasi device kepemilikan di backend
    const res = await apiRequest<{ status: string; key_version?: number; error?: string }>(
      '/api/users/public-key',
      {
        method: 'PUT',
        body: JSON.stringify({ public_key: keyPair.publicKeyJWK, device_id: deviceId }),
      }
    )

    if (res.status === 409 || res.error?.includes('KEY_ALREADY_REGISTERED')) {
      // Kunci keamanan telah di-reset dari perangkat lain!
      // Hapus kunci lokal yang usang agar tidak terjadi pembacaan pesan korup
      await clearLocalKeyPair(userId)
      throw new E2EEDeviceConflictError(
        'Kunci keamanan telah di-reset dari perangkat lain. Sesi keamanan di perangkat ini telah berakhir.',
        res.data?.key_version,
        true
      )
    }
  } catch (err) {
    if (err instanceof E2EEDeviceConflictError) {
      throw err
    }
  }

  return keyPair
}

// Force reset E2EE key saat user memilih "Reset & Masuk di Sini"
export async function forceResetUserE2EE(
  userId: string
): Promise<{ publicKeyJWK: string; privateKey: CryptoKey; publicKey: CryptoKey }> {
  const deviceId = getOrCreateDeviceId()

  const rawKeyPair = await generateKeyPair()
  const pubJWK = await exportPublicKeyJWK(rawKeyPair.publicKey)
  const privJWK = await exportPrivateKeyJWK(rawKeyPair.privateKey)

  const res = await apiRequest<{ status: string; key_version?: number; error?: string }>(
    '/api/users/public-key/reset',
    {
      method: 'POST',
      body: JSON.stringify({ public_key: pubJWK, device_id: deviceId }),
    }
  )

  if (res.error) {
    throw new Error(res.error)
  }

  await saveLocalUserKeyPair(userId, privJWK, pubJWK)
  derivedAESKeyCache.clear()

  return {
    publicKeyJWK: pubJWK,
    privateKey: rawKeyPair.privateKey,
    publicKey: rawKeyPair.publicKey,
  }
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
