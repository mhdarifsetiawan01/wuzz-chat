/**
 * WuzzChat Groups API Endpoints
 * Conforms to docs/openapi.yaml & backend/internal/api/group_handler.go
 */

import { apiClient } from './client';
import {
  CreateGroupRequest,
  CreateGroupResponse,
  GroupDetails,
  GroupMember,
} from './types';

export const groupsApi = {
  /**
   * POST /api/groups
   * Creates a new group conversation.
   */
  async createGroup(input: CreateGroupRequest): Promise<CreateGroupResponse> {
    return apiClient<CreateGroupResponse>('/api/groups', {
      method: 'POST',
      body: JSON.stringify(input),
    });
  },

  /**
   * GET /api/groups/{id}
   * Retrieves group details and member metadata.
   */
  async getGroupDetails(groupId: string): Promise<GroupDetails> {
    return apiClient<GroupDetails>(`/api/groups/${encodeURIComponent(groupId)}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/groups/{id}/members
   * Retrieves list of all members in the group.
   */
  async getGroupMembers(groupId: string): Promise<GroupMember[]> {
    return apiClient<GroupMember[]>(`/api/groups/${encodeURIComponent(groupId)}/members`, {
      method: 'GET',
    });
  },

  /**
   * POST /api/groups/{id}/members
   * Adds new members to the group (Admin / Creator only).
   */
  async addGroupMembers(
    groupId: string,
    memberIds: string[]
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(groupId)}/members`,
      {
        method: 'POST',
        body: JSON.stringify({ member_ids: memberIds }),
      }
    );
  },

  /**
   * DELETE /api/groups/{id}/members/{userId}
   * Removes a member from group (Kick) or allows current user to Leave Group.
   */
  async removeGroupMember(
    groupId: string,
    targetUserId: string
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(targetUserId)}`,
      {
        method: 'DELETE',
      }
    );
  },

  /**
   * PATCH /api/groups/{id}/members/{userId}/role
   * Updates a member's role (admin / member) (Creator / Admin only).
   */
  async updateMemberRole(
    groupId: string,
    targetUserId: string,
    role: 'admin' | 'member'
  ): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(targetUserId)}/role`,
      {
        method: 'PATCH',
        body: JSON.stringify({ role }),
      }
    );
  },

  /**
   * Convenience helper to leave group.
   * Calls DELETE /api/groups/{id}/members/{currentUserId}.
   */
  async leaveGroup(
    groupId: string,
    currentUserId: string
  ): Promise<{ success: boolean; message: string }> {
    return this.removeGroupMember(groupId, currentUserId);
  },

  /**
   * GET /api/groups/search?q=...
   * Searches public groups by title or handle.
   */
  async searchPublicGroups(query: string): Promise<GroupDetails[]> {
    return apiClient<GroupDetails[]>(
      `/api/groups/search?q=${encodeURIComponent(query)}`,
      {
        method: 'GET',
      }
    );
  },

  /**
   * POST /api/groups/{id}/join
   * Joins a public group.
   */
  async joinPublicGroup(groupId: string): Promise<{ success: boolean; message: string }> {
    return apiClient<{ success: boolean; message: string }>(
      `/api/groups/${encodeURIComponent(groupId)}/join`,
      {
        method: 'POST',
      }
    );
  },
};
