/**
 * WuzzChat Private Group Invite Links API (V2 Tahap 1)
 * Conforms to docs/openapi.yaml, docs/BACKEND_API.md 35c & backend/internal/api/group_invite_handler.go
 *
 * Token undangan memberi hak MENGAJUKAN gabung ke grup privat; admin/creator yang memutuskan.
 */

import { apiClient } from './client';

/** Token undangan: 16 karakter dari alfabet tautan pendek (tanpa 0/O/1/l/I). */
const INVITE_TOKEN_PATTERN = /^[2-9a-km-np-zA-HJ-NP-Z]{16}$/;

export const isInviteToken = (value: string): boolean => INVITE_TOKEN_PATTERN.test(value);

export interface InviteLink {
  token: string;
  /** "/join/<token>"; URL publik = https://chat.wuzzhub.id{path} */
  path: string;
  mode: 'approval';
  created_by: string;
  created_at: string;
}

export type InviteStatus = 'member' | 'pending' | 'rejected' | 'none';

export interface InvitePreview {
  group_id: string;
  title: string;
  avatar_url: string;
  member_count: number;
  mode: 'approval';
  my_status: InviteStatus;
  /** Hanya saat my_status = rejected dan jeda 24 jam belum lewat. */
  retry_after_seconds?: number;
}

export interface InviteJoinResult {
  group_id: string;
  status: 'member' | 'pending';
}

export const invitesApi = {
  /** GET /api/groups/{grp_id}/invite-link (creator/admin). null = belum ada tautan aktif. */
  async getLink(groupId: string, signal?: AbortSignal): Promise<InviteLink | null> {
    const res = await apiClient<{ link: InviteLink | null }>(
      `/api/groups/${encodeURIComponent(groupId)}/invite-link`,
      { method: 'GET', signal }
    );
    return res?.link ?? null;
  },

  /** POST /api/groups/{grp_id}/invite-link. reset = cabut tautan lama dan buat baru. */
  async createLink(groupId: string, reset = false, signal?: AbortSignal): Promise<InviteLink> {
    const res = await apiClient<{ link: InviteLink }>(
      `/api/groups/${encodeURIComponent(groupId)}/invite-link`,
      { method: 'POST', body: JSON.stringify({ reset }), signal }
    );
    return res.link;
  },

  /** DELETE /api/groups/{grp_id}/invite-link: matikan tanpa pengganti. */
  async revokeLink(groupId: string, signal?: AbortSignal): Promise<void> {
    await apiClient(`/api/groups/${encodeURIComponent(groupId)}/invite-link`, { method: 'DELETE', signal });
  },

  /** GET /api/invites/{token}: pratinjau grup dan status pemanggil. */
  async preview(token: string, signal?: AbortSignal): Promise<InvitePreview> {
    return apiClient<InvitePreview>(`/api/invites/${encodeURIComponent(token)}`, { method: 'GET', signal });
  },

  /** POST /api/invites/{token}/join: idempoten, aman dicoba ulang setelah timeout. */
  async requestJoin(token: string, signal?: AbortSignal): Promise<InviteJoinResult> {
    return apiClient<InviteJoinResult>(`/api/invites/${encodeURIComponent(token)}/join`, { method: 'POST', signal });
  },

  /** DELETE /api/invites/{token}/request: batalkan pengajuan sendiri. */
  async cancelRequest(token: string, signal?: AbortSignal): Promise<void> {
    await apiClient(`/api/invites/${encodeURIComponent(token)}/request`, { method: 'DELETE', signal });
  },
};
