/**
 * WuzzChat — pembelian Star lewat Google Play (V2 Tahap 2b, docs/plans/backlog/STARS_PLAY_BILLING.md).
 *
 * Satu-satunya modul yang memakai expo-iap. Alur:
 *  1. Paket dan account_id dari server (GET /api/me/stars/packages; 404 = fitur mati, tidak ada koneksi ke Play).
 *  2. requestPurchase dengan obfuscatedAccountId = account_id (pembelian terikat ke akun Wuzz).
 *  3. Hasil datang lewat purchaseUpdatedListener → token dikirim ke server (POST /api/me/stars/purchases, idempoten),
 *     server memverifikasi ke Google, menambah Star, lalu mengonsumsi pembelian.
 *  4. Setelah server menjawab "credited", finishTransaction(isConsumable) dipanggil juga (galat diabaikan: server
 *     biasanya sudah mengonsumsi).
 *  5. Pemulihan: pembelian yang belum selesai (aplikasi mati setelah bayar, jaringan putus) dikirim ulang saat
 *     aplikasi dibuka atau layar Saldo Star dibuka. Aman karena server idempoten per token.
 *
 * Star tidak pernah ditambahkan di klien: saldo selalu dari jawaban server.
 */

import { Platform } from 'react-native';
import {
  finishTransaction,
  fetchProducts,
  getAvailablePurchases,
  initConnection,
  isUserCancelledError,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestPurchase,
} from 'expo-iap';
import type { Purchase } from 'expo-iap';
import { isStarsUnavailable, starsApi } from '../api/stars';

export type StarBillingEvent =
  | { type: 'credited'; starsAdded: number; balance: number; debt: number }
  | { type: 'pending' }
  | { type: 'cancelled' }
  | { type: 'failed'; message: string; retryable: boolean };

const STAR_PRODUCT_PREFIX = 'star_';

let connectPromise: Promise<void> | null = null;
let listenersAttached = false;
const subscribers = new Set<(e: StarBillingEvent) => void>();
const inFlight = new Set<string>();

const emit = (e: StarBillingEvent) => subscribers.forEach((fn) => fn(e));

export const isStarBillingSupported = (): boolean => Platform.OS === 'android';

/** Berlangganan peristiwa pembelian (untuk layar Saldo Star). Mengembalikan fungsi berhenti berlangganan. */
export function subscribeStarBilling(fn: (e: StarBillingEvent) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}

function attachListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  purchaseUpdatedListener((purchase) => {
    void handlePurchase(purchase);
  });
  purchaseErrorListener((error) => {
    if (isUserCancelledError(error)) {
      emit({ type: 'cancelled' });
      return;
    }
    emit({ type: 'failed', message: 'Pembelian tidak berhasil. Coba lagi beberapa saat lagi.', retryable: true });
  });
}

async function ensureBilling(): Promise<void> {
  if (!isStarBillingSupported()) throw new Error('Pembelian Star hanya tersedia di Android.');
  if (!connectPromise) {
    connectPromise = (async () => {
      attachListeners();
      await initConnection();
    })().catch((err) => {
      connectPromise = null; // izinkan mencoba lagi
      throw err;
    });
  }
  return connectPromise;
}

/** Harga lokal dari Google Play per ID produk (mis. "Rp 10.000"). Produk yang tidak dikenal Play tidak ada di hasil. */
export async function loadStarPrices(productIds: string[]): Promise<Record<string, string>> {
  if (productIds.length === 0) return {};
  await ensureBilling();
  const products = await fetchProducts({ skus: productIds, type: 'in-app' });
  const out: Record<string, string> = {};
  for (const p of (products ?? []) as Array<{ id: string; displayPrice?: string }>) {
    if (p?.id && p.displayPrice) out[p.id] = p.displayPrice;
  }
  return out;
}

/** Memulai alur pembelian Google Play. Hasilnya datang sebagai peristiwa (subscribeStarBilling). */
export async function buyStars(productId: string, accountId: string): Promise<void> {
  if (!accountId) throw new Error('Akun belum siap untuk pembelian. Coba buka ulang layar ini.');
  await ensureBilling();
  await requestPurchase({
    request: { google: { skus: [productId], obfuscatedAccountId: accountId } },
    type: 'in-app',
  });
}

const isStarPurchase = (p: Purchase): boolean => typeof p?.productId === 'string' && p.productId.startsWith(STAR_PRODUCT_PREFIX);

/** Mengirim satu pembelian Play ke server lalu menyelesaikannya. Aman dipanggil berulang untuk token yang sama. */
async function handlePurchase(purchase: Purchase): Promise<void> {
  if (!isStarPurchase(purchase)) return;
  if (purchase.purchaseState === 'pending') {
    emit({ type: 'pending' });
    return;
  }
  const token = purchase.purchaseToken;
  if (purchase.purchaseState !== 'purchased' || !token || inFlight.has(token)) return;
  inFlight.add(token);
  try {
    const res = await starsApi.submitPlayPurchase(purchase.productId, token);
    if (res.state === 'pending') {
      emit({ type: 'pending' });
      return;
    }
    // Server sudah menambah Star dan biasanya sudah mengonsumsi; galat di sini (mis. item sudah dikonsumsi) diabaikan.
    await finishTransaction({ purchase, isConsumable: true }).catch(() => {});
    emit({ type: 'credited', starsAdded: res.stars_added, balance: res.balance, debt: res.debt });
  } catch (err: any) {
    const code = err?.code;
    if (code === 'purchase_account_mismatch') {
      // Dibeli saat masuk dengan akun Wuzz lain di perangkat ini. Tidak diselesaikan: Google mengembalikan dana otomatis
      // bila tidak ada akun yang mengklaimnya dalam 3 hari.
      emit({ type: 'failed', message: 'Pembelian ini terikat ke akun WuzzChat lain di perangkat ini.', retryable: false });
    } else if (code === 'purchase_cancelled' || code === 'invalid_purchase_token' || code === 'product_mismatch') {
      emit({ type: 'failed', message: 'Pembelian tidak valid atau sudah dibatalkan Google Play.', retryable: false });
    } else {
      // Jaringan/server/Google sibuk: pembelian tetap tersimpan di Google dan dikirim ulang saat pemulihan berikutnya.
      emit({
        type: 'failed',
        message: 'Pembayaran sudah diterima Google Play, tetapi Star belum tercatat. Kami akan mencoba lagi otomatis; buka ulang layar ini sebentar lagi.',
        retryable: true,
      });
    }
  } finally {
    inFlight.delete(token);
  }
}

/**
 * Mengirim ulang pembelian Star yang belum selesai. Tidak membuka koneksi Play bila fitur mati di server (404).
 * Dipanggil saat aplikasi dibuka dan saat layar Saldo Star dibuka. Galat diabaikan (akan dicoba lagi lain kali).
 */
export async function recoverStarPurchases(): Promise<void> {
  if (!isStarBillingSupported()) return;
  try {
    await starsApi.getPackages();
  } catch (err) {
    if (isStarsUnavailable(err)) return;
    return;
  }
  try {
    await ensureBilling();
    const purchases = await getAvailablePurchases();
    for (const p of purchases ?? []) {
      await handlePurchase(p);
    }
  } catch {
    // Play Store tidak tersedia/tidak terhubung: coba lagi saat berikutnya.
  }
}
