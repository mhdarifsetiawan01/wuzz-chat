/**
 * Status paket pengguna (batas forum aktif, durasi yang diizinkan, kuota ringkasan AI).
 * GET /api/me/entitlement — hanya data milik pemanggil; server adalah penentu, klien hanya menampilkan.
 */

import { apiClient } from './client';
import type { EntitlementStatus } from '../utils/entitlement';

export type { EntitlementStatus };

export const entitlementApi = {
  async getMine(signal?: AbortSignal): Promise<EntitlementStatus> {
    return apiClient<EntitlementStatus>('/api/me/entitlement', { method: 'GET', signal });
  },
};
