/**
 * WuzzChat Mobile - roomKeyStore
 * Menyediakan kunci AES room tanpa memblokir thread JS.
 *
 * Masalah: derivasi ECDH P-256 murni JS memakan ±120 ms per room di Hermes dan berjalan sinkron;
 * N DM saat cold start = N x 120 ms thread JS beku. Solusi:
 *  1. Cache memori (crypto.ts).
 *  2. Kunci turunan yang tersimpan di SecureStore (Keystore), divalidasi dengan sidik jari masukan.
 *  3. Bila belum ada: derivasi diserialkan dan diberi jeda antar-room agar frame UI bisa dirender,
 *     lalu hasilnya disimpan untuk cold start berikutnya.
 *
 * Catatan keamanan: kunci simetris room ikut tersimpan di perangkat, dengan kelas perlindungan yang sama
 * dengan kunci privat (SecureStore, AFTER_FIRST_UNLOCK), dihapus bersama kunci E2EE (secureStorage).
 */

import {
  base64ToBytes,
  bytesToBase64,
  getOrDeriveRoomAESKey,
  peekRoomAESKey,
  primeRoomAESKey,
  roomKeyChecksum,
  roomKeyFingerprint,
} from './crypto';
import { createExclusiveQueue } from './exclusiveQueue';
import { secureStorage } from './secureStorage';

const PERSISTED_FORMAT_VERSION = 1;
const AES_KEY_BYTES = 32;

/** Jeda antar-derivasi (≈ satu frame) agar render/gesture bisa berjalan di antara dua blok ±120 ms. */
const YIELD_BETWEEN_DERIVATIONS_MS = 16;

const runDerivation = createExclusiveQueue();
const inFlight = new Map<string, Promise<Uint8Array>>();

const yieldToUI = () =>
  new Promise<void>((resolve) => setTimeout(resolve, YIELD_BETWEEN_DERIVATIONS_MS));

async function restorePersistedKey(
  userId: string,
  roomId: string,
  fingerprint: string
): Promise<Uint8Array | null> {
  try {
    const raw = await secureStorage.getDerivedRoomKey(userId, roomId);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      parsed?.v !== PERSISTED_FORMAT_VERSION ||
      parsed.fp !== fingerprint ||
      typeof parsed.k !== 'string' ||
      parsed.c !== roomKeyChecksum(fingerprint, parsed.k)
    ) {
      return null;
    }
    const key = base64ToBytes(parsed.k);
    return key.length === AES_KEY_BYTES ? key : null;
  } catch {
    // Entri rusak / tak terbaca: perlakukan seperti belum ada, akan diturunkan ulang
    return null;
  }
}

async function resolveRoomKey(
  userId: string,
  privateKeyHex: string,
  peerPublicKeyJWK: string,
  roomId: string,
  fingerprint: string
): Promise<Uint8Array> {
  const restored = await restorePersistedKey(userId, roomId, fingerprint);
  if (restored) {
    primeRoomAESKey(privateKeyHex, peerPublicKeyJWK, roomId, restored);
    return restored;
  }

  const derived = await runDerivation(async () => {
    // Pemanggil lain mungkin sudah menurunkan kunci ini saat kita mengantre
    const already = peekRoomAESKey(privateKeyHex, peerPublicKeyJWK, roomId);
    if (already) return already;
    await yieldToUI();
    const startedAt = performance.now();
    const key = getOrDeriveRoomAESKey(privateKeyHex, peerPublicKeyJWK, roomId);
    // Jarang muncul setelah kunci tersimpan; level warn agar tetap ada di build release (log/info dibuang Babel)
    console.warn(
      `[roomKeyStore] ECDH room ${roomId.slice(0, 12)} ${(performance.now() - startedAt).toFixed(0)}ms`
    );
    return key;
  });

  // Simpan untuk cold start berikutnya; kegagalan menyimpan tidak boleh menggagalkan pemanggil
  const keyBase64 = bytesToBase64(derived);
  secureStorage
    .setDerivedRoomKey(
      userId,
      roomId,
      JSON.stringify({
        v: PERSISTED_FORMAT_VERSION,
        fp: fingerprint,
        k: keyBase64,
        c: roomKeyChecksum(fingerprint, keyBase64),
      })
    )
    .catch(() => {});

  return derived;
}

/**
 * Mengembalikan kunci AES room. Setelah ini selesai, getOrDeriveRoomAESKey(...) dengan masukan yang
 * sama dijamin kena cache memori (aman dipanggil sinkron).
 */
export function ensureRoomAESKey(
  userId: string,
  privateKeyHex: string,
  peerPublicKeyJWK: string,
  roomId: string
): Promise<Uint8Array> {
  const cached = peekRoomAESKey(privateKeyHex, peerPublicKeyJWK, roomId);
  if (cached) return Promise.resolve(cached);

  const fingerprint = roomKeyFingerprint(privateKeyHex, peerPublicKeyJWK, roomId);
  const pending = inFlight.get(fingerprint);
  if (pending) return pending;

  const task = resolveRoomKey(userId, privateKeyHex, peerPublicKeyJWK, roomId, fingerprint).finally(
    () => {
      inFlight.delete(fingerprint);
    }
  );
  inFlight.set(fingerprint, task);
  return task;
}
