/**
 * WuzzChat Mobile Cryptography Service (E2EE)
 * 
 * Standards & Interoperability:
 * - Key Agreement: ECDH NIST P-256 (secp256r1)
 * - Key Derivation: HKDF-SHA256 (RFC 5869) with salt = roomId, info = "wuzz-chat-e2ee-aes-v1"
 * - Symmetric Cipher: AES-256-GCM (NIST SP 800-38D) with 12-byte CSPRNG IV
 * - Payload Format: e2ee:v1:<base64_iv>:<base64_ciphertext_with_tag>
 * - 100% Bit-Exact Interoperability with Web Crypto API (frontend/lib/crypto/e2ee.ts)
 */

import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import * as ExpoCrypto from 'expo-crypto';

// Polyfill globalThis.crypto.getRandomValues using ExpoCrypto (CSPRNG) for React Native runtime
if (typeof globalThis !== 'undefined') {
  if (!globalThis.crypto) {
    (globalThis as any).crypto = {};
  }
  if (!globalThis.crypto.getRandomValues) {
    (globalThis.crypto as any).getRandomValues = function <T extends ArrayBufferView | null>(array: T): T {
      if (!array) return array;
      const uint8 = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
      const random = ExpoCrypto.getRandomBytes(uint8.byteLength);
      uint8.set(random);
      return array;
    };
  }
}

export const E2EE_PREFIX = 'e2ee:v1:';

const B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

// Pure binary Base64 Encoder (memory safe, zero browser/DOM dependency)
export function bytesToBase64(bytes: Uint8Array): string {
  let result = '';
  const len = bytes.length;
  for (let i = 0; i < len; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < len ? bytes[i + 1] : 0;
    const b2 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[b0 >> 2];
    result += B64_CHARS[((b0 & 3) << 4) | (b1 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b1 & 15) << 2) | (b2 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b2 & 63] : '=';
  }
  return result;
}

// Pure binary Base64 Decoder
export function base64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/[^A-Za-z0-9+/=]/g, '');
  let padLen = 0;
  if (clean.endsWith('==')) padLen = 2;
  else if (clean.endsWith('=')) padLen = 1;
  const byteLen = Math.floor((clean.length * 3) / 4) - padLen;
  const bytes = new Uint8Array(byteLen);
  let p = 0;
  for (let i = 0; i < clean.length; i += 4) {
    const c0 = B64_CHARS.indexOf(clean[i]);
    const c1 = B64_CHARS.indexOf(clean[i + 1]);
    const c2 = B64_CHARS.indexOf(clean[i + 2]);
    const c3 = B64_CHARS.indexOf(clean[i + 3]);
    if (p < byteLen) bytes[p++] = (c0 << 2) | (c1 >> 4);
    if (p < byteLen && c2 !== -1) bytes[p++] = ((c1 & 15) << 4) | (c2 >> 2);
    if (p < byteLen && c3 !== -1) bytes[p++] = ((c2 & 3) << 6) | c3;
  }
  return bytes;
}

// Base64URL helpers for JWK x/y coordinates
export function bytesToBase64Url(bytes: Uint8Array): string {
  return bytesToBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(str: string): Uint8Array {
  let b64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (b64.length % 4) b64 += '=';
  return base64ToBytes(b64);
}

export interface JWKPublicKey {
  kty: 'EC';
  crv: 'P-256';
  x: string;
  y: string;
  ext?: boolean;
  key_ops?: string[];
}

export interface E2EEKeyPair {
  privateKeyHex: string; // 32 bytes hex
  publicKeyJWK: string;  // Canonical JSON string
}

/**
 * Generate a new NIST P-256 keypair for the mobile user
 */
export function generateE2EEKeyPair(): E2EEKeyPair {
  const seed = ExpoCrypto.getRandomBytes(48);
  const { secretKey: privateKeyBytes } = p256.keygen(seed);
  const pubKeyUncompressed = p256.getPublicKey(privateKeyBytes, false); // 65 bytes: 0x04 || X (32) || Y (32)

  const xBytes = pubKeyUncompressed.slice(1, 33);
  const yBytes = pubKeyUncompressed.slice(33, 65);

  const jwk: JWKPublicKey = {
    kty: 'EC',
    crv: 'P-256',
    x: bytesToBase64Url(xBytes),
    y: bytesToBase64Url(yBytes),
    ext: true,
    key_ops: [],
  };

  // Convert private key to hex string for persistent storage
  const privateKeyHex = Array.from(privateKeyBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    privateKeyHex,
    publicKeyJWK: JSON.stringify(jwk),
  };
}

/**
 * Parse a JWK Public Key string into uncompressed P-256 point bytes (65 bytes)
 */
export function parseJWKToPublicKeyBytes(jwkString: string): Uint8Array {
  try {
    const jwk: JWKPublicKey = typeof jwkString === 'string' ? JSON.parse(jwkString) : jwkString;
    if (jwk.kty !== 'EC' || jwk.crv !== 'P-256' || !jwk.x || !jwk.y) {
      throw new Error('Invalid P-256 JWK format');
    }

    const xBytes = base64UrlToBytes(jwk.x);
    const yBytes = base64UrlToBytes(jwk.y);

    const uncompressed = new Uint8Array(65);
    uncompressed[0] = 0x04;
    uncompressed.set(xBytes, 1);
    uncompressed.set(yBytes, 33);
    return uncompressed;
  } catch (err: any) {
    throw new Error(`Failed to parse JWK public key: ${err?.message || err}`);
  }
}

/**
 * Derive AES-256-GCM room symmetric key from local private key and peer's public key JWK
 * using ECDH + HKDF-SHA256 (identical to Web Crypto deriveKey)
 */
export function deriveRoomAESKey(
  privateKeyHex: string,
  theirPublicKeyJWK: string,
  roomId: string = 'wuzz-chat-salt'
): Uint8Array {
  // Convert privateKeyHex to Uint8Array
  const privateKeyBytes = new Uint8Array(
    privateKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  const theirPubKeyBytes = parseJWKToPublicKeyBytes(theirPublicKeyJWK);

  // ECDH Shared Point (65 bytes uncompressed: 0x04 || X (32) || Y (32))
  const sharedPoint = p256.getSharedSecret(privateKeyBytes, theirPubKeyBytes, false);
  const sharedX = sharedPoint.slice(1, 33); // 32-byte affine X coordinate

  const encoder = new TextEncoder();
  const salt = encoder.encode(roomId || 'wuzz-chat-salt');
  const info = encoder.encode('wuzz-chat-e2ee-aes-v1');

  // HKDF-SHA256 derivation -> 32 bytes (256-bit) AES key
  return hkdf(sha256, sharedX, salt, info, 32);
}

/**
 * Encrypt plaintext string using AES-256-GCM and return e2ee:v1 wire format
 */
export function encryptText(aesKey: Uint8Array, plaintext: string): string {
  const encoder = new TextEncoder();
  const data = encoder.encode(plaintext);

  // 12 bytes random IV using CSPRNG
  const iv = ExpoCrypto.getRandomBytes(12);

  const cipher = gcm(aesKey, iv);
  const ciphertextWithTag = cipher.encrypt(data);

  const ivBase64 = bytesToBase64(iv);
  const cipherBase64 = bytesToBase64(ciphertextWithTag);

  return `${E2EE_PREFIX}${ivBase64}:${cipherBase64}`;
}

/**
 * Decrypt e2ee:v1 wire format payload using AES-256-GCM
 */
export function decryptText(aesKey: Uint8Array, encryptedPayload: string): string {
  if (!isEncryptedMessage(encryptedPayload)) {
    // Plaintext fallback (for historical or unencrypted messages)
    return encryptedPayload;
  }

  const raw = encryptedPayload.slice(E2EE_PREFIX.length);
  const parts = raw.split(':');
  if (parts.length !== 2) {
    throw new Error('Invalid E2EE payload wire format');
  }

  const [ivBase64, ciphertextBase64] = parts;
  const iv = base64ToBytes(ivBase64);
  const ciphertextWithTag = base64ToBytes(ciphertextBase64);

  const cipher = gcm(aesKey, iv);
  const decryptedBytes = cipher.decrypt(ciphertextWithTag);

  const decoder = new TextDecoder();
  return decoder.decode(decryptedBytes);
}

/**
 * Check if a message string has the E2EE wire format prefix
 */
export function isEncryptedMessage(content?: string): boolean {
  return typeof content === 'string' && content.startsWith(E2EE_PREFIX);
}

/**
 * Generate 30-digit Safety Number Fingerprint (6 blocks of 5 digits) for pairwise verification
 */
export function generateSafetyNumber(pubKeyJWKA: string, pubKeyJWKB: string): string {
  if (!pubKeyJWKA || !pubKeyJWKB) return '00000 00000 00000 00000 00000 00000';

  const sorted = [pubKeyJWKA, pubKeyJWKB].sort().join('::');
  const encoder = new TextEncoder();
  const hashBytes = sha256(encoder.encode(sorted));

  const digits: string[] = [];
  for (let i = 0; i < 6; i++) {
    const val =
      (hashBytes[i * 4] << 24) |
      (hashBytes[i * 4 + 1] << 16) |
      (hashBytes[i * 4 + 2] << 8) |
      hashBytes[i * 4 + 3];
    const unsigned = Math.abs(val) % 100000;
    digits.push(unsigned.toString().padStart(5, '0'));
  }

  return digits.join(' ');
}

// Memory caches to eliminate redundant derivations and network roundtrips
const peerPublicKeyMemoryCache = new Map<string, string>();
const derivedAESKeyMemoryCache = new Map<string, Uint8Array>();

export function cachePeerPublicKey(userId: string, publicKeyJWK: string): void {
  if (userId && publicKeyJWK) {
    peerPublicKeyMemoryCache.set(userId, publicKeyJWK);
  }
}

export function getCachedPeerPublicKey(userId: string): string | undefined {
  return peerPublicKeyMemoryCache.get(userId);
}

function roomKeyCacheId(myPrivateKeyHex: string, theirPublicKeyJWK: string, roomId: string): string {
  // Masukan LENGKAP (bukan potongan): 32 karakter pertama JWK hanya memuat 1 karakter `x`, sehingga peer yang
  // berganti kunci dalam satu sesi bisa tabrakan dan terus memakai kunci lama. Cache hanya di memori, dan kunci
  // privat memang sudah ada di memori, jadi tidak ada paparan baru; tanpa biaya hash per dekripsi.
  return `${myPrivateKeyHex}\n${theirPublicKeyJWK}\n${roomId}`;
}

/**
 * Derivasi ECDH P-256 murni JS memakan ±120 ms per room di Hermes (terukur di perangkat) dan
 * memblokir thread JS. Pemanggil di jalur UI sebaiknya memakai ensureRoomAESKey (roomKeyStore.ts),
 * yang memulihkan kunci dari penyimpanan aman lebih dulu lalu memanggil fungsi ini sebagai cadangan.
 */
export function getOrDeriveRoomAESKey(
  myPrivateKeyHex: string,
  theirPublicKeyJWK: string,
  roomId: string
): Uint8Array {
  const cacheKey = roomKeyCacheId(myPrivateKeyHex, theirPublicKeyJWK, roomId);
  if (derivedAESKeyMemoryCache.has(cacheKey)) {
    return derivedAESKeyMemoryCache.get(cacheKey)!;
  }
  const derived = deriveRoomAESKey(myPrivateKeyHex, theirPublicKeyJWK, roomId);
  derivedAESKeyMemoryCache.set(cacheKey, derived);
  return derived;
}

/** Baca cache memori tanpa menurunkan kunci. */
export function peekRoomAESKey(
  myPrivateKeyHex: string,
  theirPublicKeyJWK: string,
  roomId: string
): Uint8Array | undefined {
  return derivedAESKeyMemoryCache.get(roomKeyCacheId(myPrivateKeyHex, theirPublicKeyJWK, roomId));
}

/** Isi cache memori dengan kunci yang dipulihkan dari penyimpanan aman (tanpa ECDH). */
export function primeRoomAESKey(
  myPrivateKeyHex: string,
  theirPublicKeyJWK: string,
  roomId: string,
  key: Uint8Array
): void {
  derivedAESKeyMemoryCache.set(roomKeyCacheId(myPrivateKeyHex, theirPublicKeyJWK, roomId), key);
}

/**
 * Checksum integritas kunci turunan yang disimpan (SHA-256 atas sidik jari + kunci base64).
 * Mendeteksi byte kunci yang rusak walau panjangnya masih 32, supaya jatuh ke derivasi ulang
 * dan bukan terjebak memakai kunci salah (dekripsi gagal terus).
 */
export function roomKeyChecksum(fingerprint: string, keyBase64: string): string {
  const input = new TextEncoder().encode(`wuzz-room-key-ck-v1\n${fingerprint}\n${keyBase64}`);
  return Array.from(sha256(input), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Sidik jari masukan derivasi (SHA-256 atas kunci privat + kunci publik peer + roomId, dengan pemisah domain).
 * Disimpan bersama kunci turunan: bila salah satu masukan berubah (reset kunci, peer ganti kunci),
 * sidik jari tidak cocok dan kunci tersimpan tidak dipakai.
 */
export function roomKeyFingerprint(
  myPrivateKeyHex: string,
  theirPublicKeyJWK: string,
  roomId: string
): string {
  const input = new TextEncoder().encode(
    `wuzz-room-key-fp-v1\n${myPrivateKeyHex}\n${theirPublicKeyJWK}\n${roomId}`
  );
  return Array.from(sha256(input), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Helper to decrypt a snippet for conversation lists with graceful fallback
 */
export function decryptSnippet(
  rawContent?: string,
  roomId?: string,
  peerPublicKeyJWK?: string,
  myPrivateKeyHex?: string
): string {
  if (!rawContent || !isEncryptedMessage(rawContent)) {
    return rawContent || '';
  }
  if (!roomId || !peerPublicKeyJWK || !myPrivateKeyHex) {
    return '🔒 Pesan terenkripsi';
  }
  try {
    const aesKey = getOrDeriveRoomAESKey(myPrivateKeyHex, peerPublicKeyJWK, roomId);
    return decryptText(aesKey, rawContent);
  } catch {
    return '🔒 Pesan terenkripsi';
  }
}

/**
 * Extracts the other user's ID (peer ID) from a direct message room ID.
 * Handles both multi-tenant formats (dm_<tenant>_<userA>_<userB>) and legacy formats (dm_<userA>_<userB>).
 */
export function extractDMPeerId(roomId: string, currentUserId?: string): string {
  if (!roomId || !roomId.startsWith('dm_')) return '';
  const parts = roomId.replace(/^dm_/, '').split('_');
  if (parts.length === 0) return '';

  // If format is dm_<tenant>_<userA>_<userB> (3 or more parts)
  if (parts.length >= 3) {
    const candidates = parts.slice(1);
    if (currentUserId) {
      const match = candidates.find((id) => id !== currentUserId);
      if (match) return match;
    }
    return candidates[0] || '';
  }

  // If format is dm_<userA>_<userB> (2 parts)
  if (parts.length === 2) {
    if (currentUserId) {
      return parts[0] === currentUserId ? parts[1] : parts[0];
    }
    return parts[0];
  }

  return parts.find((p) => p !== currentUserId && p !== 'default') || '';
}

