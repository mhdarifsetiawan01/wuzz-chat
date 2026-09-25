/**
 * WuzzChat Mobile Secure Storage Service
 * Encrypted storage wrapper utilizing expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const STORAGE_KEYS = {
  AUTH_TOKEN: 'wuzz_auth_token',
  DEVICE_ID: 'wuzz_device_id',
  USER_DATA: 'wuzz_user_profile',
} as const;

// In-memory fallback for environments without SecureStore (e.g. web preview)
const memoryStorage = new Map<string, string>();

async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export const secureStorage = {
  async setItem(key: string, value: string): Promise<void> {
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.setItemAsync(key, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
    } else {
      memoryStorage.set(key, value);
    }
  },

  async getItem(key: string): Promise<string | null> {
    const available = await isSecureStoreAvailable();
    if (available) {
      return await SecureStore.getItemAsync(key);
    }
    return memoryStorage.get(key) ?? null;
  },

  async deleteItem(key: string): Promise<void> {
    const available = await isSecureStoreAvailable();
    if (available) {
      await SecureStore.deleteItemAsync(key);
    } else {
      memoryStorage.delete(key);
    }
  },

  // Specialized helpers
  async setAuthToken(token: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.AUTH_TOKEN, token);
  },

  async getAuthToken(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  async deleteAuthToken(): Promise<void> {
    await this.deleteItem(STORAGE_KEYS.AUTH_TOKEN);
  },

  async setDeviceId(deviceId: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.DEVICE_ID, deviceId);
  },

  async getDeviceId(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.DEVICE_ID);
  },

  async setUserData<T>(user: T): Promise<void> {
    await this.setItem(STORAGE_KEYS.USER_DATA, JSON.stringify(user));
  },

  async getUserData<T>(): Promise<T | null> {
    const raw = await this.getItem(STORAGE_KEYS.USER_DATA);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  },

  async clearSession(): Promise<void> {
    await this.deleteAuthToken();
    await this.deleteItem(STORAGE_KEYS.USER_DATA);
    // Note: Do NOT delete DEVICE_ID so device identity remains persistent
  },
};
