/**
 * WuzzChat Auth API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import { AuthTokenResponse, LoginRequest, RegisterRequest, User } from './types';

export const authApi = {
  /**
   * POST /api/auth/login
   */
  async login(payload: LoginRequest): Promise<AuthTokenResponse> {
    return apiClient<AuthTokenResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /**
   * POST /api/auth/register
   */
  async register(payload: RegisterRequest): Promise<AuthTokenResponse> {
    return apiClient<AuthTokenResponse>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /**
   * GET /api/auth/me
   */
  async getMe(): Promise<User> {
    return apiClient<User>('/api/auth/me', {
      method: 'GET',
    });
  },

  /**
   * POST /api/auth/logout
   */
  async logout(deviceId?: string): Promise<{ message?: string }> {
    return apiClient<{ message?: string }>('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ device_id: deviceId }),
      // Use 30s timeout per MOBILE_INTEGRATION_GUIDE section 2B
      timeoutMs: 30000,
    });
  },
};
