/**
 * WuzzChat Auth API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import {
  AuthTokenResponse,
  GoogleLinkRequest,
  GoogleRegisterRequest,
  GoogleSignInResponse,
  LoginRequest,
  OwnershipProof,
  RegisterRequest,
  UpdateProfileRequest,
  User,
  GoogleDeviceFields,
} from './types';

/** Mengubah bukti kepemilikan menjadi field body yang dipahami server. */
export function proofToBody(proof: OwnershipProof): Record<string, string> {
  return 'googleIdToken' in proof ? { google_id_token: proof.googleIdToken } : { password: proof.password };
}

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
   * Menghapus akun & data pribadi secara permanen. Bukti: password ATAU ID token Google baru.
   * 401 = bukti salah (code GOOGLE_MISMATCH / GOOGLE_REAUTH_STALE untuk jalur Google).
   */
  async deleteAccount(proof: OwnershipProof): Promise<{ status: string; message?: string }> {
    return apiClient<{ status: string; message?: string }>('/api/auth/me', {
      method: 'DELETE',
      body: JSON.stringify(proofToBody(proof)),
      timeoutMs: 30000,
    });
  },

  /**
   * POST /api/auth/google
   * Menukar ID token Google dengan sesi. Bila akun Google belum tertaut, server membalas 200 dengan
   * code=GOOGLE_NOT_LINKED dan link_token untuk langkah berikutnya. 409 DEVICE_LIMIT_REACHED seperti login biasa.
   */
  async googleSignIn(idToken: string, device: GoogleDeviceFields): Promise<GoogleSignInResponse> {
    return apiClient<GoogleSignInResponse>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken, ...device }),
      skipAuth: true,
    });
  },

  /** POST /api/auth/google/register: akun baru tanpa password dari link_token. */
  async googleRegister(payload: GoogleRegisterRequest): Promise<AuthTokenResponse> {
    return apiClient<AuthTokenResponse>('/api/auth/google/register', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /** POST /api/auth/google/link: tautkan Google ke akun lama (username + password) lalu login. */
  async googleLink(payload: GoogleLinkRequest): Promise<AuthTokenResponse> {
    return apiClient<AuthTokenResponse>('/api/auth/google/link', {
      method: 'POST',
      body: JSON.stringify(payload),
      skipAuth: true,
    });
  },

  /** POST /api/auth/me/google: tautkan Google ke akun yang sedang login (ID token harus baru). */
  async linkGoogleToAccount(idToken: string): Promise<{ status: string; google_linked: boolean }> {
    return apiClient<{ status: string; google_linked: boolean }>('/api/auth/me/google', {
      method: 'POST',
      body: JSON.stringify({ id_token: idToken }),
    });
  },

  /** PUT /api/auth/me/google: ganti akun Google (bukti akun lama dan baru, keduanya baru). */
  async replaceGoogle(oldIdToken: string, newIdToken: string): Promise<{ status: string; google_linked: boolean }> {
    return apiClient<{ status: string; google_linked: boolean }>('/api/auth/me/google', {
      method: 'PUT',
      body: JSON.stringify({ old_id_token: oldIdToken, id_token: newIdToken }),
    });
  },

  /** DELETE /api/auth/me/google: putuskan Google (hanya akun yang masih punya password). */
  async unlinkGoogle(password: string): Promise<{ status: string; google_linked: boolean }> {
    return apiClient<{ status: string; google_linked: boolean }>('/api/auth/me/google', {
      method: 'DELETE',
      body: JSON.stringify({ password }),
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

