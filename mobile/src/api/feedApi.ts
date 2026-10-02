/**
 * WuzzChat Community Social Feed API Endpoints
 * Conforms to docs/domains/COMMUNITY_FEED.md & docs/BACKEND_API.md Section 3.11
 */

import { apiClient } from './client';
import {
  CreateFeedCommentRequest,
  CreateFeedPostRequest,
  FeedCommentsResponse,
  FeedComment,
  FeedLikeResponse,
  FeedPost,
  FeedTabKey,
  FeedTimelineResponse,
} from './types';

export const feedApi = {
  /**
   * GET /api/feed?tab=<tab>&seed=<seed>&before=<timestamp>&offset=<offset>&limit=<limit>
   * Mengambil linimasa postingan komunitas (tab 'latest' atau 'explore').
   */
  async getTimeline(params?: {
    tab?: FeedTabKey;
    seed?: string;
    before?: string;
    offset?: number;
    limit?: number;
  }): Promise<FeedTimelineResponse> {
    const queryParams = new URLSearchParams();
    if (params?.tab) {
      queryParams.append('tab', params.tab);
    }
    if (params?.seed) {
      queryParams.append('seed', params.seed);
    }
    if (params?.before) {
      queryParams.append('before', params.before);
    }
    if (params?.offset !== undefined && params?.offset > 0) {
      queryParams.append('offset', String(params.offset));
    }
    if (params?.limit) {
      queryParams.append('limit', String(params.limit));
    }
    const queryStr = queryParams.toString();
    const endpoint = queryStr ? `/api/feed?${queryStr}` : '/api/feed';

    return apiClient<FeedTimelineResponse>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * GET /api/feed/:id
   * Mengambil satu postingan (404 bila sudah dihapus atau beda tenant).
   */
  async getPost(postId: string): Promise<FeedPost> {
    return apiClient<FeedPost>(`/api/feed/${encodeURIComponent(postId)}`, {
      method: 'GET',
    });
  },

  /**
   * POST /api/feed
   * Membuat postingan komunitas baru.
   */
  async createPost(data: CreateFeedPostRequest): Promise<FeedPost> {
    return apiClient<FeedPost>('/api/feed', {
      method: 'POST',
      body: JSON.stringify({
        content: data.content,
        media_urls: data.media_urls || [],
        post_type: data.post_type || 'standard',
        is_pinned: Boolean(data.is_pinned),
        metadata: data.metadata || {},
      }),
    });
  },

  /**
   * POST /api/feed/:id/like
   * Toggle atomic suka / batal suka pada postingan tertentu.
   */
  async toggleLike(postId: string): Promise<FeedLikeResponse> {
    return apiClient<FeedLikeResponse>(`/api/feed/${postId}/like`, {
      method: 'POST',
    });
  },

  /**
   * GET /api/feed/:id/comments?before=<timestamp>&limit=<limit>
   * Mengambil daftar komentar pada postingan tertentu.
   */
  async getComments(
    postId: string,
    params?: { before?: string; limit?: number }
  ): Promise<FeedCommentsResponse> {
    const queryParams = new URLSearchParams();
    if (params?.before) {
      queryParams.append('before', params.before);
    }
    if (params?.limit) {
      queryParams.append('limit', String(params.limit));
    }
    const queryStr = queryParams.toString();
    const endpoint = queryStr ? `/api/feed/${postId}/comments?${queryStr}` : `/api/feed/${postId}/comments`;

    return apiClient<FeedCommentsResponse>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * POST /api/feed/:id/comments
   * Menambahkan komentar baru pada postingan.
   */
  async createComment(postId: string, content: string): Promise<FeedComment> {
    return apiClient<FeedComment>(`/api/feed/${postId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    });
  },

  /**
   * DELETE /api/feed/:id
   * Menghapus postingan komunitas oleh pemilik atau admin/moderator.
   */
  async deletePost(postId: string): Promise<{ status: string; message: string }> {
    return apiClient<{ status: string; message: string }>(`/api/feed/${postId}`, {
      method: 'DELETE',
    });
  },
};
