/**
 * WuzzChat Device Identity Service
 * Generates an immutable UUIDv4 device identifier upon first install and persists it securely.
 * Complies with docs/MOBILE_INTEGRATION_GUIDE.md Section 2.
 */

import * as Crypto from 'expo-crypto';
import { secureStorage } from './secureStorage';

let cachedDeviceId: string | null = null;

export const deviceIdService = {
  /**
   * Retrieves the existing device ID, or generates a new UUIDv4, persists it, and returns it.
   */
  async getOrCreateDeviceId(): Promise<string> {
    if (cachedDeviceId) {
      return cachedDeviceId;
    }

    try {
      const storedId = await secureStorage.getDeviceId();
      if (storedId && storedId.trim().length > 0) {
        cachedDeviceId = storedId;
        return storedId;
      }
    } catch {
      // Proceed to generate
    }

    // Generate UUIDv4
    const newDeviceId = Crypto.randomUUID();
    await secureStorage.setDeviceId(newDeviceId);
    cachedDeviceId = newDeviceId;
    return newDeviceId;
  },

  /**
   * Returns synchronous cached device ID if initialized, or null.
   */
  getCachedDeviceId(): string | null {
    return cachedDeviceId;
  },
};
