/**
 * WuzzChat Auth API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import { AuthTokenResponse, LoginRequest, RegisterRequest, UpdateProfileRequest, User } from './types';

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
   * POST /api/auth/refresh
   * Sliding renewal: refreshed=false bila token masih panjang sisa umurnya.
   */
  async refresh(): Promise<{ refreshed: boolean; token?: string; expires_at: string }> {
    return apiClient<{ refreshed: boolean; token?: string; expires_at: string }>('/api/auth/refresh', {
      method: 'POST',
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
   * DELETE /api/auth/me
   * Menghapus akun & data pribadi secara permanen (wajib password). 401 = password salah.
   */
  async deleteAccount(password: string): Promise<{ status: string; message?: string }> {
    return apiClient<{ status: string; message?: string }>('/api/auth/me', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
      timeoutMs: 30000,
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

  /**
   * PUT /api/auth/profile
   */
  async updateProfile(payload: UpdateProfileRequest): Promise<User> {
    return apiClient<User>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
};

