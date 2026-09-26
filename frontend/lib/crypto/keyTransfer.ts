/**
 * E2EE Key Transfer Manager (Opsi 2: QR Code Device Migration)
 * Memungkinkan migrasi keypair E2EE antar perangkat secara Zero-Knowledge.
 */

import { apiRequest } from '../api'
import { getOrCreateDeviceId, importAndSaveTransferredKeyPair } from './keyStore'

export interface EncryptedTransferPayload {
  ciphertext: string // Base64
  iv: string         // Base64
  salt: string       // Base64
  v: number
}

// Generate 32-byte (256-bit entropy) session token dalam format Hex string
export function generateTransferSessionToken(): string {
  if (typeof window === 'undefined' || !window.crypto) {
    throw new Error('Web Crypto API tidak didukung di lingkungan ini')
  }
  const bytes = new Uint8Array(32)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Derive AES-GCM key menggunakan HKDF-SHA256 (v2, instant <1ms) atau PBKDF2 (v1 fallback)
async function deriveTransferAESKey(
  sessionToken: string,
  salt: Uint8Array,
  version: number = 2
): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const tokenBytes = enc.encode(sessionToken)

  if (version === 1) {
    const baseKey = await window.crypto.subtle.importKey(
      'raw',
      tokenBytes,
      { name: 'PBKDF2' },
      false,
      ['deriveKey']
    )
    return window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt as any,
        iterations: 100000,
        hash: 'SHA-256',
      },
      baseKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    )
  }

  // Version 2 (Default): HKDF-SHA256 (RFC 5869) - Instant (<1ms)
  const baseKey = await window.crypto.subtle.importKey(
    'raw',
    tokenBytes,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )
  return window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: salt as any,
      info: enc.encode('wuzz-transfer-aes-v1') as any,
    },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  )
}

// Helper konversi Uint8Array <-> Base64
function uint8ToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

function base64ToUint8(b64: string): Uint8Array {
  const binary = atob(b64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Enkripsi keypair bundle di device lama sebelum diupload ke server
export async function encryptKeyBundleForTransfer(
  privateKeyJWK: string,
  publicKeyJWK: string,
  sessionToken: string
): Promise<string> {
  if (!privateKeyJWK || !publicKeyJWK || !sessionToken) {
    throw new Error('Data kunci atau session token tidak valid')
  }

  const salt = new Uint8Array(16)
  const iv = new Uint8Array(12)
  window.crypto.getRandomValues(salt)
  window.crypto.getRandomValues(iv)

  const aesKey = await deriveTransferAESKey(sessionToken, salt, 2)

  const payload = JSON.stringify({
    privateKeyJWK,
    publicKeyJWK,
    createdAt: Date.now(),
  })

  const enc = new TextEncoder()
  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: iv as any },
    aesKey,
    enc.encode(payload)
  )

  const result: EncryptedTransferPayload = {
    ciphertext: uint8ToBase64(new Uint8Array(ciphertextBuffer)),
    iv: uint8ToBase64(iv),
    salt: uint8ToBase64(salt),
    v: 2,
  }

  return JSON.stringify(result)
}

// Dekripsi keypair bundle di device baru setelah didownload dari server
export async function decryptKeyBundleFromTransfer(
  encryptedBundleJSON: string,
  sessionToken: string
): Promise<{ privateKeyJWK: string; publicKeyJWK: string }> {
  let payload: EncryptedTransferPayload
  try {
    payload = JSON.parse(encryptedBundleJSON)
  } catch {
    throw new Error('Format bundle terenkripsi tidak valid')
  }

  if (!payload.ciphertext || !payload.iv || !payload.salt) {
    throw new Error('Komponen enkripsi (ciphertext, iv, salt) tidak lengkap')
  }

  const salt = base64ToUint8(payload.salt)
  const iv = base64ToUint8(payload.iv)
  const ciphertext = base64ToUint8(payload.ciphertext)

  const aesKey = await deriveTransferAESKey(sessionToken, salt, payload.v || 1)

  try {
    const decryptedBuffer = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: iv as any },
      aesKey,
      ciphertext as any
    )

    const dec = new TextDecoder()
    const jsonStr = dec.decode(decryptedBuffer)
    const rawData = JSON.parse(jsonStr)

    if (!rawData.privateKeyJWK || !rawData.publicKeyJWK) {
      throw new Error('Struktur kunci JWK yang didekripsi tidak valid')
    }

    return {
      privateKeyJWK: rawData.privateKeyJWK,
      publicKeyJWK: rawData.publicKeyJWK,
    }
  } catch (err) {
    console.error('[KeyTransfer] Gagal mendekripsi bundle:', err)
    throw new Error('Gagal mendekripsi kunci keamanan. Token sesi mungkin salah atau bundle rusak.')
  }
}

// Upload bundle terenkripsi ke server (device lama)
export async function uploadTransferSession(
  sessionToken: string,
  encryptedBundle: string
): Promise<{ expires_in: number }> {
  const res = await apiRequest<{ status: string; expires_in: number; error?: string }>(
    '/api/users/transfer/create',
    {
      method: 'POST',
      body: JSON.stringify({
        session_token: sessionToken,
        encrypted_bundle: encryptedBundle,
      }),
    }
  )

  if (res.error) {
    throw new Error(res.error)
  }

  return { expires_in: res.data?.expires_in || 300 }
}

// Ambil bundle terenkripsi dari server (device baru) dan selesaikan migrasi
export async function consumeAndImportTransfer(
  userId: string,
  sessionToken: string
): Promise<{ publicKeyJWK: string }> {
  const deviceId = getOrCreateDeviceId()

  const res = await apiRequest<{
    status: string
    encrypted_bundle?: string
    error?: string
    code?: string
  }>('/api/users/transfer/consume', {
    method: 'POST',
    body: JSON.stringify({
      session_token: sessionToken,
      device_id: deviceId,
    }),
  })

  if (res.error) {
    throw new Error(res.error)
  }

  if (!res.data?.encrypted_bundle) {
    throw new Error('Server tidak mengembalikan bundle terenkripsi')
  }

  // Dekripsi bundle lokal
  const { privateKeyJWK, publicKeyJWK } = await decryptKeyBundleFromTransfer(
    res.data.encrypted_bundle,
    sessionToken
  )

  // Simpan ke IndexedDB & CacheStorage
  await importAndSaveTransferredKeyPair(userId, privateKeyJWK, publicKeyJWK)

  return { publicKeyJWK }
}
