/**
 * WuzzChat Mobile API - E2EE Key Transfer Endpoints
 * Supports Zero-Knowledge QR Code Device Migration.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 3D & 7.
 */

import { apiClient } from './client';

export interface CreateTransferRequest {
  session_token: string;
  encrypted_bundle: string;
}

export interface CreateTransferResponse {
  status: string;
  expires_in: number;
}

export interface ConsumeTransferRequest {
  session_token: string;
  device_id: string;
}

export interface ConsumeTransferResponse {
  status: string;
  encrypted_bundle: string;
}

/**
 * Create a new E2EE transfer session on the server (called by source/sending device).
 */
export async function createTransferSession(
  sessionToken: string,
  encryptedBundle: string
): Promise<CreateTransferResponse> {
  return apiClient<CreateTransferResponse>('/api/users/transfer/create', {
    method: 'POST',
    body: JSON.stringify({
      session_token: sessionToken,
      encrypted_bundle: encryptedBundle,
    } as CreateTransferRequest),
  });
}

/**
 * Consume an existing E2EE transfer session (called by target/receiving device).
 */
export async function consumeTransferSession(
  sessionToken: string,
  deviceId: string
): Promise<ConsumeTransferResponse> {
  return apiClient<ConsumeTransferResponse>('/api/users/transfer/consume', {
    method: 'POST',
    body: JSON.stringify({
      session_token: sessionToken,
      device_id: deviceId,
    } as ConsumeTransferRequest),
  });
}
