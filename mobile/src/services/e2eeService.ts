/**
 * WuzzChat Mobile E2EE High-Level Service
 * 
 * Provides:
 * - 30-digit Safety Number Fingerprint generation (100% interoperable with Web e2ee.ts)
 * - Peer Public Key resolution and memory caching
 * - Local Verification Status persistence (WhatsApp/Signal style)
 */

import { sha256 } from '@noble/hashes/sha2.js';
import { getUserPublicKey } from '../api/users';
import { cachePeerPublicKey, getCachedPeerPublicKey } from './crypto';
import { secureStorage } from './secureStorage';

const VERIFIED_STORAGE_PREFIX = 'wuzz_e2ee_verified_';

/**
 * Generate 30-digit Safety Number Fingerprint (6 blocks of 5 digits) for pairwise verification.
 * 100% bit-exact parity with frontend/lib/crypto/e2ee.ts:generateSafetyNumber
 * 
 * @param pubKeyJWKA Canonical JWK JSON string of user A
 * @param pubKeyJWKB Canonical JWK JSON string of user B
 * @returns 30-digit string separated by spaces (e.g. "12345 67890 12345 67890 12345 67890")
 */
export async function generateSafetyNumber(pubKeyJWKA: string, pubKeyJWKB: string): Promise<string> {
  if (!pubKeyJWKA || !pubKeyJWKB) {
    return '00000 00000 00000 00000 00000 00000';
  }

  // Deterministic lexicographical sorting ensures symmetric output regardless of caller order
  const sorted = [pubKeyJWKA, pubKeyJWKB].sort().join('::');
  const encoder = new TextEncoder();
  const hashBytes = sha256(encoder.encode(sorted));

  const digits: string[] = [];
  for (let i = 0; i < 6; i++) {
    // Extract 4 bytes per block and format as 5-digit string
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

/**
 * Resolve peer's public key with memory-cache-first strategy and API fallback
 * @param userId Target user UUID
 */
export async function getOrFetchPeerPublicKey(userId: string): Promise<string | null> {
  if (!userId) return null;

  const cached = getCachedPeerPublicKey(userId);
  if (cached) {
    return cached;
  }

  try {
    const fetched = await getUserPublicKey(userId);
    if (fetched) {
      cachePeerPublicKey(userId, fetched);
      return fetched;
    }
  } catch (err) {
    console.warn(`[e2eeService] Failed to fetch public key for user ${userId}:`, err);
  }

  return null;
}

/**
 * Save manual verification status for a contact's specific safety number
 * @param peerId Peer user UUID
 * @param safetyNumber 30-digit fingerprint string
 * @param verified Verification status (true = verified, false = unverified)
 */
export async function setContactSafetyVerified(
  peerId: string,
  safetyNumber: string,
  verified: boolean
): Promise<void> {
  if (!peerId) return;
  const storageKey = `${VERIFIED_STORAGE_PREFIX}${peerId}`;
  if (verified) {
    const payload = JSON.stringify({
      safetyNumber: safetyNumber.replace(/\s+/g, ''),
      verifiedAt: new Date().toISOString(),
    });
    await secureStorage.setItem(storageKey, payload);
  } else {
    await secureStorage.deleteItem(storageKey);
  }
}

/**
 * Check if a contact is marked as verified for a specific safety number
 * @param peerId Peer user UUID
 * @param currentSafetyNumber Current calculated 30-digit fingerprint
 */
export async function isContactSafetyVerified(
  peerId: string,
  currentSafetyNumber: string
): Promise<boolean> {
  if (!peerId || !currentSafetyNumber) return false;
  const storageKey = `${VERIFIED_STORAGE_PREFIX}${peerId}`;
  try {
    const raw = await secureStorage.getItem(storageKey);
    if (!raw) return false;
    const data = JSON.parse(raw);
    const cleanCurrent = currentSafetyNumber.replace(/\s+/g, '');
    return data.safetyNumber === cleanCurrent;
  } catch {
    return false;
  }
}
