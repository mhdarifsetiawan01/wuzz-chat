/**
 * WuzzChat Mobile - E2EE Key Transfer Service
 * Handles Zero-Knowledge cryptographic key wrapping & unwrapping for QR device migration.
 * 
 * Cryptographic Standard:
 * - KDF: PBKDF2 (RFC 2898) with HMAC-SHA256, 100,000 iterations, 16-byte random salt.
 * - Cipher: AES-256-GCM (NIST SP 800-38D) with 12-byte CSPRNG IV and 16-byte tag.
 * - Interoperability: 100% bit-exact parity with frontend/lib/crypto/keyTransfer.ts.
 */

import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { pbkdf2 } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { gcm } from '@noble/ciphers/aes.js';
import * as ExpoCrypto from 'expo-crypto';
import {
  bytesToBase64,
  base64ToBytes,
  bytesToBase64Url,
  base64UrlToBytes,
  type E2EEKeyPair,
  type JWKPublicKey,
} from './crypto';
import { secureStorage } from './secureStorage';
import { createTransferSession, consumeTransferSession } from '../api/transfer';

export interface EncryptedTransferPayload {
  ciphertext: string; // Base64 (ciphertext + 16-byte auth tag)
  iv: string;         // Base64 (12 bytes)
  salt: string;       // Base64 (16 bytes)
  v: number;          // Schema version: 2 (HKDF-SHA256, instant) | 1 (legacy PBKDF2)
}

export interface JWKPrivateKey extends JWKPublicKey {
  d: string;
}

/**
 * Generate 32-byte (256-bit entropy) CSPRNG session token in 64-char Hex format.
 */
export function generateTransferSessionToken(): string {
  const bytes = ExpoCrypto.getRandomBytes(32);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Derive 256-bit AES-GCM symmetric key.
 * Uses HKDF-SHA256 (RFC 5869) for high-entropy 256-bit CSPRNG tokens (instant <1ms).
 * Falls back to PBKDF2 if decrypting legacy v1 bundles.
 */
export function deriveTransferAESKey(sessionToken: string, salt: Uint8Array, version: number = 2): Uint8Array {
  const encoder = new TextEncoder();
  const tokenBytes = encoder.encode(sessionToken);

  if (version === 1) {
    return pbkdf2(sha256, tokenBytes, salt, { c: 100000, dkLen: 32 });
  }

  // Version 2 (Default): HKDF-SHA256 with info = 'wuzz-transfer-aes-v1'
  const info = encoder.encode('wuzz-transfer-aes-v1');
  return hkdf(sha256, tokenBytes, salt, info, 32);
}

/**
 * Convert mobile local keypair (Hex + Public JWK) to private JWK format with scalar 'd'.
 */
export function keyPairToJWK(keyPair: E2EEKeyPair): { privateKeyJWK: string; publicKeyJWK: string } {
  const privBytes = new Uint8Array(
    keyPair.privateKeyHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []
  );

  let pubJWK: JWKPublicKey;
  try {
    pubJWK = typeof keyPair.publicKeyJWK === 'string'
      ? JSON.parse(keyPair.publicKeyJWK)
      : keyPair.publicKeyJWK;
  } catch {
    // If public JWK is somehow malformed, derive point from private key
    const pubUncompressed = p256.getPublicKey(privBytes, false);
    const xBytes = pubUncompressed.slice(1, 33);
    const yBytes = pubUncompressed.slice(33, 65);
    pubJWK = {
      kty: 'EC',
      crv: 'P-256',
      x: bytesToBase64Url(xBytes),
      y: bytesToBase64Url(yBytes),
      ext: true,
      key_ops: [],
    };
  }

  const privJWK: JWKPrivateKey = {
    ...pubJWK,
    d: bytesToBase64Url(privBytes),
    key_ops: ['deriveKey'],
  };

  return {
    privateKeyJWK: JSON.stringify(privJWK),
    publicKeyJWK: typeof keyPair.publicKeyJWK === 'string' ? keyPair.publicKeyJWK : JSON.stringify(pubJWK),
  };
}

/**
 * Convert decrypted JWK keypair bundle to mobile local format (Hex + Public JWK).
 */
export function jwkToKeyPair(privateKeyJWKString: string, publicKeyJWKString: string): E2EEKeyPair {
  const privJWK: JWKPrivateKey =
    typeof privateKeyJWKString === 'string' ? JSON.parse(privateKeyJWKString) : privateKeyJWKString;

  if (!privJWK.d) {
    throw new Error('JWK Private Key tidak memuat koordinat skalar d');
  }

  const privBytes = base64UrlToBytes(privJWK.d);
  const privateKeyHex = Array.from(privBytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  return {
    privateKeyHex,
    publicKeyJWK: typeof publicKeyJWKString === 'string' ? publicKeyJWKString : JSON.stringify(publicKeyJWKString),
  };
}

/**
 * Encrypt local E2EE keypair bundle with session token for server upload.
 */
export async function encryptKeyBundleForTransfer(
  keyPair: E2EEKeyPair,
  sessionToken: string
): Promise<string> {
  if (!keyPair.privateKeyHex || !keyPair.publicKeyJWK || !sessionToken) {
    throw new Error('Data kunci atau session token tidak valid');
  }

  const salt = ExpoCrypto.getRandomBytes(16);
  const iv = ExpoCrypto.getRandomBytes(12);

  const aesKey = deriveTransferAESKey(sessionToken, salt);
  const { privateKeyJWK, publicKeyJWK } = keyPairToJWK(keyPair);

  const rawPayload = JSON.stringify({
    privateKeyJWK,
    publicKeyJWK,
    createdAt: Date.now(),
  });

  const encoder = new TextEncoder();
  const cipher = gcm(aesKey, iv);
  const ciphertextWithTag = cipher.encrypt(encoder.encode(rawPayload));

  const result: EncryptedTransferPayload = {
    ciphertext: bytesToBase64(ciphertextWithTag),
    iv: bytesToBase64(iv),
    salt: bytesToBase64(salt),
    v: 2,
  };

  return JSON.stringify(result);
}

/**
 * Decrypt E2EE keypair bundle received from transfer session.
 */
export async function decryptKeyBundleFromTransfer(
  encryptedBundleJSON: string,
  sessionToken: string
): Promise<E2EEKeyPair> {
  let payload: EncryptedTransferPayload;
  try {
    payload = JSON.parse(encryptedBundleJSON);
  } catch {
    throw new Error('Format bundle terenkripsi tidak valid');
  }

  if (!payload.ciphertext || !payload.iv || !payload.salt) {
    throw new Error('Komponen enkripsi (ciphertext, iv, salt) tidak lengkap');
  }

  const salt = base64ToBytes(payload.salt);
  const iv = base64ToBytes(payload.iv);
  const ciphertextWithTag = base64ToBytes(payload.ciphertext);

  const aesKey = deriveTransferAESKey(sessionToken, salt, payload.v || 1);
  const cipher = gcm(aesKey, iv);

  try {
    const decryptedBytes = cipher.decrypt(ciphertextWithTag);
    const decoder = new TextDecoder();
    const rawData = JSON.parse(decoder.decode(decryptedBytes));

    if (!rawData.privateKeyJWK || !rawData.publicKeyJWK) {
      throw new Error('Struktur kunci JWK yang didekripsi tidak valid');
    }

    return jwkToKeyPair(rawData.privateKeyJWK, rawData.publicKeyJWK);
  } catch (err) {
    console.error('[keyTransfer] Gagal mendekripsi bundle:', err);
    throw new Error('Gagal mendekripsi kunci keamanan. Token sesi salah atau data transfer rusak.');
  }
}

/**
 * Upload encrypted keypair bundle to server (Source Device / Sender).
 */
export async function uploadTransferSession(
  keyPair: E2EEKeyPair,
  sessionToken: string
): Promise<{ expires_in: number }> {
  const encryptedBundle = await encryptKeyBundleForTransfer(keyPair, sessionToken);
  const res = await createTransferSession(sessionToken, encryptedBundle);
  return { expires_in: res.expires_in || 300 };
}

/**
 * Consume transfer session from server and save keypair to Keystore (Target Device / Receiver).
 */
export async function consumeAndImportTransfer(
  userId: string,
  sessionToken: string,
  deviceId: string
): Promise<E2EEKeyPair> {
  const res = await consumeTransferSession(sessionToken, deviceId);
  if (!res.encrypted_bundle) {
    throw new Error('Server tidak mengembalikan bundle terenkripsi');
  }

  const keyPair = await decryptKeyBundleFromTransfer(res.encrypted_bundle, sessionToken);
  await secureStorage.setE2EEKeyPair(userId, keyPair);
  return keyPair;
}

/**
 * Robust parser to extract session token from various QR Code formats:
 * - Direct Web URL: https://chat.wuzzhub.id/transfer?token=abcd...
 * - JSON Payload: {"type":"wuzz_transfer","token":"abcd..."}
 * - Raw Hex Token: 64-char hex string
 */
export function parseTransferQRData(scannedData: string): string | null {
  if (!scannedData || typeof scannedData !== 'string') return null;
  const clean = scannedData.trim();

  // 1. Try parse as URL query parameter
  if (clean.includes('token=')) {
    try {
      const match = clean.match(/[?&]token=([a-fA-F0-9]{16,128})/);
      if (match && match[1]) {
        return match[1].toLowerCase();
      }
    } catch {
      // ignore
    }
  }

  // 2. Try parse as JSON
  if (clean.startsWith('{') && clean.endsWith('}')) {
    try {
      const obj = JSON.parse(clean);
      const token = obj.token || obj.session_token || obj.sessionToken;
      if (token && typeof token === 'string' && /^[a-fA-F0-9]{16,128}$/.test(token.trim())) {
        return token.trim().toLowerCase();
      }
    } catch {
      // ignore
    }
  }

  // 3. Try parse as direct Hex Token string
  if (/^[a-fA-F0-9]{16,128}$/.test(clean)) {
    return clean.toLowerCase();
  }

  return null;
}
