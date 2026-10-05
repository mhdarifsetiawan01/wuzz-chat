/**
 * WuzzChat User Connections & Friendlist API Client
 * Conforms to docs/domains/USER_CONNECTIONS.md & Milestone M-Mobile-10
 */

import { apiClient } from './client';
import {
  ConnectionSourceType,
  ConnectionStatusResponse,
  FriendsListResponse,
  PendingRequestItem,
  UserConnection,
} from './types';

export const connectionsApi = {
  /**
   * POST /api/connections/request
   * Mengirim permohonan koneksi / pertemanan baru ke target user.
   */
  async requestConnection(
    targetUserId: string,
    sourceType: ConnectionSourceType = 'in_app_request'
  ): Promise<UserConnection> {
    return apiClient<UserConnection>('/api/connections/request', {
      method: 'POST',
      body: JSON.stringify({
        target_user_id: targetUserId,
        source_type: sourceType,
      }),
    });
  },

  /**
   * POST /api/connections/respond
   * Menerima atau menolak permohonan koneksi yang ditujukan kepada user saat ini.
   */
  async respondConnection(
    connectionId: string,
    action: 'accept' | 'decline'
  ): Promise<UserConnection> {
    return apiClient<UserConnection>('/api/connections/respond', {
      method: 'POST',
      body: JSON.stringify({
        connection_id: connectionId,
        action,
      }),
    });
  },

  /**
   * GET /api/connections/friends?cursor=<cursor>&limit=<limit>
   * Mengambil daftar teman terhubung menggunakan pagination cursor-based index seek.
   */
  async getFriends(cursor?: string, limit?: number): Promise<FriendsListResponse> {
    const queryParams = new URLSearchParams();
    if (cursor) {
      queryParams.append('cursor', cursor);
    }
    if (limit && limit > 0) {
      queryParams.append('limit', String(limit));
    }
    const queryStr = queryParams.toString();
    const endpoint = queryStr ? `/api/connections/friends?${queryStr}` : '/api/connections/friends';

    return apiClient<FriendsListResponse>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * GET /api/connections/pending?direction=<incoming|outgoing|all>
   * Mengambil daftar permohonan pertemanan yang menunggu respon.
   */
  async getPendingRequests(
    direction: 'incoming' | 'outgoing' | 'all' = 'all'
  ): Promise<PendingRequestItem[]> {
    return apiClient<PendingRequestItem[]>(`/api/connections/pending?direction=${direction}`, {
      method: 'GET',
    });
  },

  /**
   * GET /api/connections/status/:targetUserId
   * Mengecek status relasi pertemanan dan izin berkirim pesan / panggilan dengan target user.
   */
  async getConnectionStatus(targetUserId: string): Promise<ConnectionStatusResponse> {
    return apiClient<ConnectionStatusResponse>(`/api/connections/status/${targetUserId}`, {
      method: 'GET',
    });
  },

  /**
   * DELETE /api/connections/:targetUserId
   * Menghapus relasi pertemanan (unfriend) dengan target user.
   */
  async unfriend(targetUserId: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>(`/api/connections/${targetUserId}`, {
      method: 'DELETE',
    });
  },

  /**
   * POST /api/connections/block
   * Memblokir pengguna: pertemanan diputus dan pihak yang diblokir tidak bisa lagi mengirim pesan/permintaan.
   */
  async blockUser(userId: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>('/api/connections/block', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },

  /**
   * DELETE /api/connections/block/:targetUserId
   * Membuka blokir yang dibuat sendiri.
   */
  async unblockUser(targetUserId: string): Promise<{ message: string }> {
    return apiClient<{ message: string }>(`/api/connections/block/${targetUserId}`, {
      method: 'DELETE',
    });
  },
};
