import { apiClient } from './client';

export interface LinkedDevice {
  id: string;
  user_id: string;
  name: string;
  platform: string;
  is_active: boolean;
  last_seen_at: string | null;
  created_at: string;
}

/** Pin authorization to the session that opened the screen, including delayed actions. */
export function createDevicesApi(token: string, deviceId: string) {
  const headers = { Authorization: `Bearer ${token}`, 'X-Device-ID': deviceId };
  return {
    list: (signal: AbortSignal) => apiClient<LinkedDevice[]>('/api/auth/devices', {
      headers, skipAuth: true, signal,
    }),
    remove: (id: string, signal: AbortSignal) => apiClient<{ message: string }>(
      `/api/auth/devices/${encodeURIComponent(id)}`,
      { method: 'DELETE', headers, skipAuth: true, signal },
    ),
  };
}
