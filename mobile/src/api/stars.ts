/**
 * WuzzChat Star & Grup Privat Berbayar API (V2 Tahap 2a)
 * Conforms to docs/BACKEND_API.md 35d, docs/domains/STARS_WALLET.md & backend/internal/api/stars_handler.go
 *
 * Semua endpoint di belakang sakelar server (STARS_ENABLED, PAID_GROUPS_ENABLED). Sakelar mati = 404, dan klien
 * menyembunyikan seluruh UI Star. Istilah UI netral: "Saldo Star", "Riwayat Star", "Star diterima".
 * Tahap 2b: Star dibeli lewat Google Play (sakelar STARS_PLAY_BILLING; 404 = tombol "Tambah Star" tersembunyi).
 * Alur pembelian native ada di services/starBilling.ts; berkas ini hanya klien HTTP (bebas modul native, diuji di Node).
 */

import * as Crypto from 'expo-crypto';
import { apiClient } from './client';

export type StarLedgerKind = 'purchase' | 'spend' | 'refund' | 'test_grant' | 'adjustment' | 'reversal' | 'debt_repay';

export interface StarLedgerEntry {
  id: string;
  delta: number;
  kind: StarLedgerKind | string;
  group_id?: string;
  group_title?: string;
  ref_id?: string;
  reason?: string;
  created_by?: string;
  created_at: string;
}

export interface StarWallet {
  balance: number;
  /** Utang Star dari pembelian Play yang dibatalkan Google. Selama > 0, bayar akses grup ditolak (402 stars_debt). */
  debt: number;
  /** 50 entri terbaru, terbaru lebih dulu. */
  history: StarLedgerEntry[];
}

export interface StarsReceivedGroup {
  group_id: string;
  group_title: string;
  purchases: number;
  stars: number;
  pending_stars: number;
  available_stars: number;
  amount_minor: number;
  currency: string;
}

export interface StarsReceived {
  /** Mitra kreator aktif (boleh mengaktifkan grup berbayar). */
  is_creator: boolean;
  groups: StarsReceivedGroup[];
}

export interface PaidGroupInfo {
  group_id: string;
  creator_id: string;
  price_stars: number;
  enabled: boolean;
}

export interface PaidGroupSettings {
  paid: PaidGroupInfo | null;
  /** Pemanggil adalah mitra kreator aktif (bukan role grup). */
  is_creator: boolean;
  price_min: number;
  price_max: number;
}

/** Paket Star yang dijual lewat Google Play (Tahap 2b). */
export interface StarPackage {
  product_id: string;
  stars: number;
}

export interface StarPackagesResponse {
  packages: StarPackage[];
  /** SHA-256 ID pengguna; wajib dipasang sebagai obfuscatedAccountId saat membeli. */
  account_id: string;
}

/** Hasil POST /api/me/stars/purchases. state "pending" = pembayaran belum selesai di Google (HTTP 202). */
export interface PlayCreditResult {
  state: 'credited' | 'pending';
  stars_added: number;
  balance: number;
  debt: number;
}

export type CreatorApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface CreatorApplication {
  id: string;
  status: CreatorApplicationStatus;
  message: string;
  /** Catatan admin saat memutuskan (terlihat oleh pemohon). */
  decision_note?: string;
  decided_at?: string;
  created_at: string;
}

/** Status "Daftar menjadi Creator" milik pemanggil. 404 = grup berbayar mati: sembunyikan tombol. */
export interface CreatorApplicationState {
  is_creator: boolean;
  application: CreatorApplication | null;
  can_apply: boolean;
  /** Diisi bila permohonan terakhir ditolak dan jeda pengajuan ulang (7 hari) belum lewat. */
  retry_at?: string;
}

export const CREATOR_APP_MESSAGE_MIN = 10;
export const CREATOR_APP_MESSAGE_MAX = 500;

export interface StarPurchaseResult {
  group_id: string;
  status: 'member';
  stars_paid: number;
  balance: number;
}

/** 404 dari endpoint Star = sakelar mati atau tenant bukan default: sembunyikan UI. */
export const isStarsUnavailable = (err: any): boolean => err?.status === 404;

/** Kunci idempoten untuk satu niat bayar; dipakai ulang saat mencoba lagi setelah timeout. */
export const newIdempotencyKey = (): string => Crypto.randomUUID();

export const starsApi = {
  /** GET /api/me/stars: saldo + 50 entri terakhir. 404 bila STARS_ENABLED mati. */
  async getWallet(signal?: AbortSignal): Promise<StarWallet> {
    const res = await apiClient<StarWallet>('/api/me/stars', { method: 'GET', signal });
    return { balance: res?.balance ?? 0, debt: res?.debt ?? 0, history: Array.isArray(res?.history) ? res.history : [] };
  },

  /** GET /api/me/stars/packages: paket Star yang dijual. 404 bila STARS_PLAY_BILLING mati. */
  async getPackages(signal?: AbortSignal): Promise<StarPackagesResponse> {
    const res = await apiClient<StarPackagesResponse>('/api/me/stars/packages', { method: 'GET', signal });
    return { packages: Array.isArray(res?.packages) ? res.packages : [], account_id: res?.account_id ?? '' };
  },

  /**
   * POST /api/me/stars/purchases: server memverifikasi token ke Google lalu menambah Star. Idempoten per token, jadi aman
   * dikirim ulang (setelah timeout atau saat memulihkan pembelian yang belum selesai).
   */
  async submitPlayPurchase(productId: string, purchaseToken: string, signal?: AbortSignal): Promise<PlayCreditResult> {
    return apiClient<PlayCreditResult>('/api/me/stars/purchases', {
      method: 'POST',
      body: JSON.stringify({ product_id: productId, purchase_token: purchaseToken }),
      signal,
      timeoutMs: 30_000,
    });
  },

  /** GET /api/me/stars/received: ringkasan Star diterima per grup (untuk mitra kreator). */
  async getReceived(signal?: AbortSignal): Promise<StarsReceived> {
    const res = await apiClient<StarsReceived>('/api/me/stars/received', { method: 'GET', signal });
    return { is_creator: Boolean(res?.is_creator), groups: Array.isArray(res?.groups) ? res.groups : [] };
  },

  /** GET /api/me/stars/creator-application. 404 bila PAID_GROUPS_ENABLED mati. */
  async getCreatorApplication(signal?: AbortSignal): Promise<CreatorApplicationState> {
    const res = await apiClient<CreatorApplicationState>('/api/me/stars/creator-application', { method: 'GET', signal });
    return normalizeCreatorState(res);
  },

  /** POST /api/me/stars/creator-application {message}: ajukan diri menjadi Creator (ditinjau admin). */
  async submitCreatorApplication(message: string, signal?: AbortSignal): Promise<CreatorApplicationState> {
    const res = await apiClient<CreatorApplicationState>('/api/me/stars/creator-application', {
      method: 'POST',
      body: JSON.stringify({ message: message.trim() }),
      signal,
    });
    return normalizeCreatorState(res);
  },

  /** GET /api/groups/{grp_id}/paid. 404 bila PAID_GROUPS_ENABLED mati. */
  async getGroupPaid(groupId: string, signal?: AbortSignal): Promise<PaidGroupSettings> {
    return apiClient<PaidGroupSettings>(`/api/groups/${encodeURIComponent(groupId)}/paid`, { method: 'GET', signal });
  },

  /** PUT /api/groups/{grp_id}/paid. Mengubah status berbayar mereset tautan undangan aktif. */
  async setGroupPaid(groupId: string, priceStars: number, enabled: boolean, signal?: AbortSignal): Promise<PaidGroupInfo | null> {
    const res = await apiClient<{ paid: PaidGroupInfo | null }>(`/api/groups/${encodeURIComponent(groupId)}/paid`, {
      method: 'PUT',
      body: JSON.stringify({ price_stars: priceStars, enabled }),
      signal,
    });
    return res?.paid ?? null;
  },

  /**
   * POST /api/invites/{token}/purchase: bayar Star lalu langsung masuk (atomik di server).
   * Kunci idempoten yang sama = hasil yang sama tanpa potongan ganda, jadi aman diulang setelah timeout.
   */
  async purchase(token: string, expectedPrice: number, idempotencyKey: string, signal?: AbortSignal): Promise<StarPurchaseResult> {
    return apiClient<StarPurchaseResult>(`/api/invites/${encodeURIComponent(token)}/purchase`, {
      method: 'POST',
      headers: { 'Idempotency-Key': idempotencyKey },
      body: JSON.stringify({ expected_price: expectedPrice }),
      signal,
    });
  },
};

const normalizeCreatorState = (res: any): CreatorApplicationState => ({
  is_creator: Boolean(res?.is_creator),
  application: res?.application ?? null,
  can_apply: Boolean(res?.can_apply),
  retry_at: res?.retry_at || undefined,
});

/** Validasi isian sebelum dikirim; null = valid. Batas sama dengan server (10-500 karakter setelah trim). */
export const validateCreatorMessage = (message: string): string | null => {
  const n = Array.from(message.trim()).length;
  if (n < CREATOR_APP_MESSAGE_MIN) return `Tulis minimal ${CREATOR_APP_MESSAGE_MIN} karakter.`;
  if (n > CREATOR_APP_MESSAGE_MAX) return `Maksimal ${CREATOR_APP_MESSAGE_MAX} karakter.`;
  return null;
};

/** Pesan galat pengajuan Creator dari kode server. */
export const creatorApplyErrorMessage = (err: any): string => {
  switch (err?.code) {
    case 'message_invalid':
      return `Ceritakan rencana grup Anda (${CREATOR_APP_MESSAGE_MIN}-${CREATOR_APP_MESSAGE_MAX} karakter).`;
    case 'application_pending':
      return 'Permohonan Anda masih ditinjau.';
    case 'already_creator':
      return 'Akun Anda sudah terdaftar sebagai Creator.';
    case 'reapply_cooldown':
      return 'Permohonan sebelumnya ditolak. Anda bisa mengajukan lagi nanti.';
    default:
      if (err?.status === 429) return 'Terlalu banyak percobaan. Coba lagi nanti.';
      return 'Permohonan belum terkirim. Periksa koneksi lalu coba lagi.';
  }
};

/** "1.250 Star" dengan pemisah ribuan Indonesia. */
export const formatStars = (n: number): string => `${formatThousands(n)} Star`;

/** Pemisah ribuan titik tanpa bergantung pada data locale Intl (Hermes). */
export const formatThousands = (n: number): string => {
  const v = Math.trunc(n);
  const s = Math.abs(v).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return v < 0 ? `-${s}` : s;
};

/** Label netral untuk jenis entri Riwayat Star. */
export const starKindLabel = (kind: string): string => {
  switch (kind) {
    case 'spend':
      return 'Akses grup';
    case 'refund':
      return 'Star dikembalikan';
    case 'test_grant':
      return 'Kredit uji';
    case 'adjustment':
      return 'Penyesuaian';
    case 'purchase':
      return 'Tambah Star';
    case 'reversal':
      return 'Pembatalan pembelian';
    case 'debt_repay':
      return 'Pelunasan Star';
    default:
      return 'Star';
  }
};
