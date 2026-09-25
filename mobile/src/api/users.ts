/**
 * User & Contact API Endpoints
 * Conforms to WuzzChat OpenAPI 3.1.0 specifications
 */

import { apiClient } from './client';
import { User, StartDirectChatResponse } from './types';

/**
 * Search users by username or display name
 * @param query search keyword
 */
export async function searchUsers(query: string): Promise<User[]> {
  const trimmed = query.trim();
  if (!trimmed) {
    return [];
  }
  return apiClient<User[]>(`/api/users/search?q=${encodeURIComponent(trimmed)}`, {
    method: 'GET',
  });
}

/**
 * Start or open direct conversation with another user
 * @param targetUserId Target user UUID
 */
export async function startDirectChat(targetUserId: string): Promise<StartDirectChatResponse> {
  return apiClient<StartDirectChatResponse>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ target_user_id: targetUserId }),
  });
}
