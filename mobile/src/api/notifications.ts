/**
 * WuzzChat Push Notifications API Client
 * Manages device subscription registration and deregistration with backend Go server.
 */

import { apiClient } from './client';

export interface PushSubscribePayload {
  platform: 'android' | 'ios' | 'web';
  endpoint: string;
  keys?: {
    p256dh?: string;
    auth?: string;
  };
}

export interface PushUnsubscribePayload {
  endpoint: string;
}

export interface PushSubscribeResponse {
  status: string;
  message: string;
}

export interface VapidPublicKeyResponse {
  public_key: string;
}

export const notificationsApi = {
  /**
   * Registers a device push token with the backend server.
   */
  async subscribe(payload: PushSubscribePayload): Promise<PushSubscribeResponse> {
    return apiClient<PushSubscribeResponse>('/api/notifications/subscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Unsubscribes a device push token from receiving push notifications.
   */
  async unsubscribe(payload: PushUnsubscribePayload): Promise<PushSubscribeResponse> {
    return apiClient<PushSubscribeResponse>('/api/notifications/unsubscribe', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  /**
   * Fetches VAPID public key (primarily used for Web Push or verifying public key).
   */
  async getVapidPublicKey(): Promise<VapidPublicKeyResponse> {
    return apiClient<VapidPublicKeyResponse>('/api/notifications/vapid-public-key', {
      method: 'GET',
      skipAuth: true,
    });
  },
};
