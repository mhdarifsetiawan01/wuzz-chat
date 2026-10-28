/**
 * WuzzChat Short Links API
 * Conforms to docs/openapi.yaml & backend/internal/api/short_link_handler.go
 */

import { apiClient } from './client';

/** Kode pendek 8 karakter (tanpa 0/O/1/l/I); ID grup/subgrup selalu berawalan grp_/sub_ sehingga tidak bisa tertukar. */
const SHORT_CODE_PATTERN = /^[2-9a-hj-km-np-zA-HJ-NP-Z]{8}$/;

export const isShortCode = (value: string): boolean => SHORT_CODE_PATTERN.test(value);

export const linksApi = {
  /**
   * POST /api/links
   * Mengambil (atau membuat) kode pendek grup/subgrup. Hanya anggota yang boleh meminta.
   */
  async createShortLink(roomId: string): Promise<{ code: string; path: string }> {
    return apiClient<{ code: string; path: string }>('/api/links', {
      method: 'POST',
      body: JSON.stringify({ room_id: roomId }),
    });
  },

  /**
   * GET /api/links/{code}
   * Menerjemahkan kode pendek menjadi ID grup/subgrup.
   */
  async resolveShortCode(code: string): Promise<{ room_id: string }> {
    return apiClient<{ room_id: string }>(`/api/links/${encodeURIComponent(code)}`, { method: 'GET' });
  },
};
