/**
 * WuzzChat Star & Grup Privat Berbayar API (V2 Tahap 2a)
 * Conforms to docs/BACKEND_API.md 35d, docs/domains/STARS_WALLET.md & backend/internal/api/stars_handler.go
 *
 * Semua endpoint di belakang sakelar server (STARS_ENABLED, PAID_GROUPS_ENABLED). Sakelar mati = 404, dan klien
 * menyembunyikan seluruh UI Star. Istilah UI netral: "Saldo Star", "Riwayat Star", "Star diterima".
 * Tahap 2a tidak punya pembelian Star (tidak ada tombol "Beli Star").
 */

import * as Crypto from 'expo-crypto';
import { apiClient } from './client';

export type StarLedgerKind = 'purchase' | 'spend' | 'refund' | 'test_grant' | 'adjustment' | 'reversal';

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
    return { balance: res?.balance ?? 0, history: Array.isArray(res?.history) ? res.history : [] };
  },

  /** GET /api/me/stars/received: ringkasan Star diterima per grup (untuk mitra kreator). */
  async getReceived(signal?: AbortSignal): Promise<StarsReceived> {
    const res = await apiClient<StarsReceived>('/api/me/stars/received', { method: 'GET', signal });
    return { is_creator: Boolean(res?.is_creator), groups: Array.isArray(res?.groups) ? res.groups : [] };
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
      return 'Pembatalan';
    default:
      return 'Star';
  }
};
