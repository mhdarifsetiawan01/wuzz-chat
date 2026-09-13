/**
 * Web Crypto API End-to-End Encryption (E2EE) Module
 * 
 * Standar Kriptografi:
 * - Key Agreement: ECDH (NIST P-256 / secp256r1)
 * - Key Derivation: HKDF-SHA256 (RFC 5869)
 * - Symmetric Cipher: AES-256-GCM (NIST SP 800-38D) dengan 96-bit random IV
 * - Payload Format: e2ee:v1:<base64_iv>:<base64_ciphertext>
 */

export const E2EE_PREFIX = 'e2ee:v1:'

// Helper konversi ArrayBuffer/Uint8Array ke Base64 (Aman memori untuk binary kecil-menengah)
export function bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
  const uint8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let binary = ''
  const len = uint8.byteLength
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(uint8[i])
  }
  return btoa(binary)
}

// Helper konversi Base64 ke Uint8Array
export function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

// Generate pasangan kunci ECDH P-256 baru untuk user
export async function generateKeyPair(): Promise<CryptoKeyPair> {
  if (typeof window === 'undefined' || !window.crypto || !window.crypto.subtle) {
    throw new Error('Web Crypto API tidak tersedia pada lingkungan ini')
  }

  return await window.crypto.subtle.generateKey(
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true, // extractable agar public & private key dapat disimpan di IndexedDB
    ['deriveKey', 'deriveBits']
  )
}

// Export Public Key ke format JSON Web Key (JWK) string
export async function exportPublicKeyJWK(publicKey: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', publicKey)
  return JSON.stringify(jwk)
}

// Export Private Key ke format JWK string (untuk backup / IndexedDB)
export async function exportPrivateKeyJWK(privateKey: CryptoKey): Promise<string> {
  const jwk = await window.crypto.subtle.exportKey('jwk', privateKey)
  return JSON.stringify(jwk)
}

// Import Public Key dari format JWK string
export async function importPublicKeyJWK(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString)
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    []
  )
}

// Import Private Key dari format JWK string
export async function importPrivateKeyJWK(jwkString: string): Promise<CryptoKey> {
  const jwk = JSON.parse(jwkString)
  return await window.crypto.subtle.importKey(
    'jwk',
    jwk,
    {
      name: 'ECDH',
      namedCurve: 'P-256',
    },
    true,
    ['deriveKey', 'deriveBits']
  )
}

// Menurunkan AES-256-GCM symmetric key dari ECDH Shared Secret + HKDF-SHA256
export async function deriveRoomAESKey(
  myPrivateKey: CryptoKey,
  theirPublicKey: CryptoKey,
  roomSalt: string = 'wuzz-chat-salt'
): Promise<CryptoKey> {
  // 1. Hitung Shared Bits via ECDH (256 bits)
  const sharedBits = await window.crypto.subtle.deriveBits(
    {
      name: 'ECDH',
      public: theirPublicKey,
    },
    myPrivateKey,
    256
  )

  // 2. Import Shared Bits ke HKDF Key
  const hkdfKey = await window.crypto.subtle.importKey(
    'raw',
    sharedBits,
    { name: 'HKDF' },
    false,
    ['deriveKey']
  )

  const encoder = new TextEncoder()
  const salt = encoder.encode(roomSalt || 'wuzz-chat-salt')
  const info = encoder.encode('wuzz-chat-e2ee-aes-v1')

  // 3. Derive AES-256-GCM Key
  return await window.crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt,
      info,
    },
    hkdfKey,
    {
      name: 'AES-GCM',
      length: 256,
    },
    false,
    ['encrypt', 'decrypt']
  )
}

// Enkripsi string teks menggunakan AES-256-GCM
export async function encryptText(aesKey: CryptoKey, plaintext: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(plaintext)
  
  // 96-bit (12 bytes) random IV untuk AES-GCM
  const iv = window.crypto.getRandomValues(new Uint8Array(12))

  const ciphertextBuffer = await window.crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    aesKey,
    data
  )

  const ivBase64 = bytesToBase64(iv)
  const ciphertextBase64 = bytesToBase64(ciphertextBuffer)

  return `${E2EE_PREFIX}${ivBase64}:${ciphertextBase64}`
}

// Dekripsi payload terenkripsi e2ee:v1:...
export async function decryptText(aesKey: CryptoKey, encryptedPayload: string): Promise<string> {
  if (!isEncryptedMessage(encryptedPayload)) {
    // Jika pesan bukan format e2ee, kembalikan teks apa adanya (fallback pesan lama)
    return encryptedPayload
  }

  const raw = encryptedPayload.slice(E2EE_PREFIX.length)
  const parts = raw.split(':')
  if (parts.length !== 2) {
    throw new Error('Format payload E2EE tidak valid')
  }

  const [ivBase64, ciphertextBase64] = parts
  const iv = base64ToBytes(ivBase64)
  const ciphertext = base64ToBytes(ciphertextBase64)

  const decryptedBuffer = await window.crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: iv as Uint8Array<ArrayBuffer>,
    },
    aesKey,
    ciphertext as Uint8Array<ArrayBuffer>
  )

  const decoder = new TextDecoder()
  return decoder.decode(decryptedBuffer)
}

// Cek apakah suatu konten string terenkripsi E2EE
export function isEncryptedMessage(content?: string): boolean {
  return typeof content === 'string' && content.startsWith(E2EE_PREFIX)
}

// Generate Safety Number Fingerprint (WhatsApp / Signal style) untuk verifikasi visual dua pihak
export async function generateSafetyNumber(pubKeyJWKA: string, pubKeyJWKB: string): Promise<string> {
  if (!pubKeyJWKA || !pubKeyJWKB) return '00000 00000 00000 00000 00000 00000'

  // Urutkan key secara deterministik agar A-B dan B-A menghasilkan fingerprint yang 100% identik
  const sorted = [pubKeyJWKA, pubKeyJWKB].sort().join('::')
  const encoder = new TextEncoder()
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', encoder.encode(sorted))
  const hashBytes = new Uint8Array(hashBuffer)

  // Format menjadi 6 blok angka 5 digit (total 30 digit)
  const digits: string[] = []
  for (let i = 0; i < 6; i++) {
    // Ambil 4 bytes per blok dan jadikan angka 5 digit
    const val = (hashBytes[i * 4] << 24) | (hashBytes[i * 4 + 1] << 16) | (hashBytes[i * 4 + 2] << 8) | hashBytes[i * 4 + 3]
    const unsigned = Math.abs(val) % 100000
    digits.push(unsigned.toString().padStart(5, '0'))
  }

  return digits.join(' ')
}
