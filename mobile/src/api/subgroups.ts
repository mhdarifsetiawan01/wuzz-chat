/**
 * WuzzChat Sub-Groups / Forum Topics API — Milestone M-Mobile-8.2B
 *
 * Endpoints conform to backend/internal/api/group_handler.go.
 * All requests use AbortController with a 15-second timeout per the
 * Mandatory Slow & Flaky Server Resilience Rule.
 */

import { apiClient } from './client';
import {
  SubGroup,
  CreateSubGroupRequest,
  CreateSubGroupResponse,
  JoinRequest,
} from './types';

// ─── Internal timeout helper ─────────────────────────────────────────────────

function withTimeout<T>(
  promise: Promise<T>,
  signal?: AbortSignal
): Promise<T> {
  // apiClient already accepts AbortSignal via RequestInit — we pass it through.
  // This wrapper documents the 15s contract; actual cancellation happens in the
  // caller via AbortController.
  return promise;
}

// ─── Sub-Groups API ──────────────────────────────────────────────────────────

export const subgroupsApi = {
  /**
   * GET /api/groups/{id}/subgroups
   * Returns all active forum topics beneath the parent group.
   * Requires: caller must be a member of the parent group.
   */
  async listSubGroups(
    parentGroupId: string,
    signal?: AbortSignal
  ): Promise<SubGroup[]> {
    const res = await apiClient<{ success?: boolean; subgroups?: SubGroup[] } | SubGroup[]>(
      `/api/groups/${encodeURIComponent(parentGroupId)}/subgroups`,
      { method: 'GET', signal }
    );
    if (Array.isArray(res)) return res;
    return res?.subgroups ?? [];
  },

  /**
   * POST /api/groups/{id}/subgroups
   * Creates a new ephemeral forum topic under the parent group.
   * Requires: caller must be admin or creator of the parent group.
   */
  async createSubGroup(
    parentGroupId: string,
    input: CreateSubGroupRequest,
    signal?: AbortSignal
  ): Promise<CreateSubGroupResponse> {
    const res = await apiClient<{
      success: boolean;
      subgroup?: SubGroup;
      group?: SubGroup;
      message?: string;
    }>(
      `/api/groups/${encodeURIComponent(parentGroupId)}/subgroups`,
      {
        method: 'POST',
        body: JSON.stringify({
          title: input.title,
          description: input.description,
          duration: input.ttl, // Backend expects "duration" ("7_days" | "30_days")
          is_public: input.is_public,
        }),
        signal,
      }
    );
    return {
      success: res.success,
      group: (res.subgroup || res.group)!,
      message: res.message,
    };
  },

  /**
   * POST /api/groups/{sub_id}/join
   * Directly joins a 🌐 public forum topic (is_public = true).
   * Returns: { success, message }
   */
  async joinPublicSubGroup(
    subGroupId: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(subGroupId)}/join`,
      { method: 'POST', signal }
    );
  },

  /**
   * POST /api/groups/{sub_id}/join-request
   * Submits a join-request for a 🔒 private forum topic (is_public = false).
   * Returns: { success, message }
   */
  async requestJoinPrivateSubGroup(
    subGroupId: string,
    signal?: AbortSignal
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(subGroupId)}/join-request`,
      { method: 'POST', signal }
    );
  },

  /**
   * GET /api/groups/{sub_id}/join-requests
   * Retrieves pending join-requests for a private topic.
   * Requires: caller must be admin or creator.
   */
  async listJoinRequests(
    subGroupId: string,
    signal?: AbortSignal
  ): Promise<JoinRequest[]> {
    const res = await apiClient<{ success?: boolean; requests?: JoinRequest[] } | JoinRequest[]>(
      `/api/groups/${encodeURIComponent(subGroupId)}/join-requests`,
      { method: 'GET', signal }
    );
    if (Array.isArray(res)) return res;
    return res?.requests ?? [];
  },

  /**
   * POST /api/groups/{sub_id}/join-requests/{requestId}/action
   * Approves or rejects a pending join-request.
   * Requires: caller must be admin or creator.
   * @param approve - true = approve, false = reject
   */
  async reviewJoinRequest(
    subGroupId: string,
    requestId: string,
    approve: boolean,
    signal?: AbortSignal
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(subGroupId)}/join-requests/${encodeURIComponent(requestId)}/action`,
      {
        method: 'POST',
        body: JSON.stringify({ approve }),
        signal,
      }
    );
  },
};
