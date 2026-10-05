/**
 * WuzzChat Reports API (laporan konten/pengguna; kebijakan UGC Google Play)
 */

import { apiClient } from './client';

export type ReportTargetType = 'message' | 'user' | 'post' | 'comment' | 'group';
export type ReportReason =
  | 'spam'
  | 'harassment'
  | 'hate'
  | 'sexual'
  | 'violence'
  | 'illegal'
  | 'impersonation'
  | 'other';

export interface CreateReportRequest {
  target_type: ReportTargetType;
  target_id: string;
  /** Pemilik konten yang dilaporkan (opsional, membantu moderator). */
  target_user_id?: string;
  reason: ReportReason;
  details?: string;
  /** Salinan teks yang dilaporkan. Wajib dikirim pelapor untuk pesan E2EE karena server tidak bisa membacanya. */
  evidence?: string;
}

export const reportsApi = {
  /**
   * POST /api/reports (idempoten per pelapor + target)
   */
  async create(payload: CreateReportRequest): Promise<{ status: string; message?: string }> {
    return apiClient<{ status: string; message?: string }>('/api/reports', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};
