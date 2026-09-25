/**
 * User & Contact API Endpoints
 * Conforms to WuzzChat OpenAPI 3.1.0 specifications
 */

import { apiClient } from './client';
import { User, StartDirectChatResponse, PublicKeyResponse, UpdatePublicKeyResponse } from './types';

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

/**
 * Fetch a user's E2EE public key (JWK)
 * @param userId Target user ID
 */
export async function getUserPublicKey(userId: string): Promise<string | null> {
  try {
    const res = await apiClient<PublicKeyResponse>(
      `/api/users/public-key?id=${encodeURIComponent(userId)}`,
      { method: 'GET' }
    );
    return res?.public_key || null;
  } catch (err: any) {
    if (err?.status === 404) {
      return null;
    }
    console.warn(`[API] Failed to fetch public key for user ${userId}:`, err?.detail || err?.message || err);
    return null;
  }
}

/**
 * Register or update local device's E2EE public key on the server
 * @param publicKeyJWK Canonical JWK string
 * @param deviceId Current client device ID
 */
export async function updatePublicKey(
  publicKeyJWK: string,
  deviceId: string
): Promise<UpdatePublicKeyResponse> {
  return apiClient<UpdatePublicKeyResponse>('/api/users/public-key', {
    method: 'PUT',
    body: JSON.stringify({
      public_key: publicKeyJWK,
      device_id: deviceId,
    }),
  });
}

/**
 * Force reset E2EE public key for the account on this device (e.g. after login on fresh device)
 * @param publicKeyJWK New canonical JWK string
 * @param deviceId Current client device ID
 * @param password User password for verification
 */
export async function resetPublicKey(
  publicKeyJWK: string,
  deviceId: string,
  password?: string
): Promise<UpdatePublicKeyResponse> {
  return apiClient<UpdatePublicKeyResponse>('/api/users/public-key/reset', {
    method: 'POST',
    body: JSON.stringify({
      public_key: publicKeyJWK,
      device_id: deviceId,
      password: password || '',
    }),
  });
}

