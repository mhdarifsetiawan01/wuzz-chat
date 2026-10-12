/**
 * WuzzChat Group Memory AI API — arsip memori forum & review draf.
 *
 * Endpoint mengikuti backend/internal/api/memory_handler.go (kontrak sama dengan web: frontend/lib/api.ts).
 * Semua panggilan lewat apiClient (timeout 15 dtk + AbortSignal opsional) sesuai aturan jaringan lambat.
 * `group_id` selalu grup INDUK (bukan sub_*); `forum_id` adalah topik forum asalnya.
 */

import { apiClient } from './client';

export type MemoryConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

// ─── Arsip (disetujui) ───────────────────────────────────────────────────────

export interface ApprovedMemoryListItem {
  id: string;
  forum_id: string;
  forum_title: string;
  group_id: string;
  approved_by: string;
  approved_by_name: string;
  approved_at: string;
  has_human_edits: boolean;
  snapshot_summary: string;
  snapshot_summary_conf: MemoryConfidence;
  decision_count: number;
  has_journey_lite: boolean;
  is_journey_lite_removed: boolean;
}

export interface ApprovedEvidenceItem {
  message_id: string;
  preview: string;
  sender_name: string;
  sent_at: string;
}

export interface ApprovedDecisionItem {
  position: number;
  text: string;
  confidence: MemoryConfidence;
  is_human_edited?: boolean;
  evidences: ApprovedEvidenceItem[];
}

export interface ApprovedMemoryDetail extends ApprovedMemoryListItem {
  draft_id: string;
  snapshot_decisions: ApprovedDecisionItem[];
  snapshot_journey_lite?: string;
  snapshot_journey_conf?: MemoryConfidence;
  created_at: string;
}

// ─── Draf (review admin) ─────────────────────────────────────────────────────

export interface MemoryDraftListItem {
  draft_id: string;
  forum_id: string;
  forum_title: string;
  group_id: string;
  status: string;
  message_count_processed: number;
  was_truncated: boolean;
  artifact_count: number;
  created_at: string;
}

export interface ArtifactEvidenceItem {
  id: string;
  artifact_id?: string;
  message_id: string;
  message_preview: string;
  message_sender_name: string;
  message_sent_at: string;
}

export type MemoryArtifactType = 'SUMMARY' | 'DECISION' | 'JOURNEY_LITE';

export interface MemoryArtifactItem {
  id: string;
  draft_id: string;
  type: MemoryArtifactType;
  content: string;
  ai_original_content?: string;
  confidence: MemoryConfidence;
  is_human_edited: boolean;
  is_removed: boolean;
  position?: number;
  evidences?: ArtifactEvidenceItem[];
}

export interface MemoryDraftDetail {
  id: string;
  forum_id: string;
  forum_title?: string;
  group_id: string;
  status: 'DRAFT' | 'APPROVED' | 'REJECTED';
  message_count_processed: number;
  was_truncated: boolean;
  truncation_note?: string;
  rejection_reason?: string;
  created_at: string;
  artifacts: MemoryArtifactItem[];
}

const PAGE_SIZE = 20;

export const memoryApi = {
  /** GET /api/groups/{id}/memories — hanya anggota grup. */
  async listApproved(
    groupId: string,
    offset = 0,
    signal?: AbortSignal
  ): Promise<ApprovedMemoryListItem[]> {
    const res = await apiClient<ApprovedMemoryListItem[] | null>(
      `/api/groups/${encodeURIComponent(groupId)}/memories?limit=${PAGE_SIZE}&offset=${offset}`,
      { method: 'GET', signal }
    );
    return Array.isArray(res) ? res : [];
  },

  /** GET /api/memories/{id} */
  async getApproved(memoryId: string, signal?: AbortSignal): Promise<ApprovedMemoryDetail> {
    return apiClient<ApprovedMemoryDetail>(`/api/memories/${encodeURIComponent(memoryId)}`, {
      method: 'GET',
      signal,
    });
  },

  /** GET /api/memory/drafts?group_id= — antrean DRAFT; hanya admin/creator (403 untuk lainnya). */
  async listDrafts(groupId: string, signal?: AbortSignal): Promise<MemoryDraftListItem[]> {
    const res = await apiClient<MemoryDraftListItem[] | null>(
      `/api/memory/drafts?group_id=${encodeURIComponent(groupId)}`,
      { method: 'GET', signal }
    );
    return Array.isArray(res) ? res : [];
  },

  /** GET /api/memory/drafts/{id} */
  async getDraft(draftId: string, signal?: AbortSignal): Promise<MemoryDraftDetail> {
    const res = await apiClient<{ draft: MemoryDraftDetail }>(
      `/api/memory/drafts/${encodeURIComponent(draftId)}`,
      { method: 'GET', signal }
    );
    return res.draft;
  },

  /** POST approve / approve-with-changes (bila ada suntingan manusia). */
  async approveDraft(draftId: string, withChanges: boolean): Promise<void> {
    await apiClient(
      `/api/memory/drafts/${encodeURIComponent(draftId)}/${withChanges ? 'approve-with-changes' : 'approve'}`,
      { method: 'POST' }
    );
  },

  async rejectDraft(draftId: string, reason: string): Promise<void> {
    await apiClient(`/api/memory/drafts/${encodeURIComponent(draftId)}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async updateArtifact(draftId: string, artifactId: string, content: string): Promise<void> {
    await apiClient(
      `/api/memory/drafts/${encodeURIComponent(draftId)}/artifacts/${encodeURIComponent(artifactId)}`,
      { method: 'PATCH', body: JSON.stringify({ content }) }
    );
  },

  /** DELETE /api/memories/{id} — hanya admin/creator; menghapus memori beserta draf, bukti, dan job asalnya. */
  async deleteApproved(memoryId: string): Promise<void> {
    await apiClient(`/api/memories/${encodeURIComponent(memoryId)}`, { method: 'DELETE' });
  },

  /** DELETE /api/memory/drafts/{id} — hanya admin/creator. */
  async deleteDraft(draftId: string): Promise<void> {
    await apiClient(`/api/memory/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
  },

  async removeJourney(draftId: string): Promise<void> {
    await apiClient(`/api/memory/drafts/${encodeURIComponent(draftId)}/journey`, {
      method: 'DELETE',
    });
  },
};

export const MEMORY_PAGE_SIZE = PAGE_SIZE;
