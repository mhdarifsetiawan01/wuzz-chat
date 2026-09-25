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
  PUSH_TOKEN: 'wuzz_push_token',
  NOTIFICATIONS_ENABLED: 'wuzz_notifications_enabled',
  E2EE_PRIVATE_KEY_PREFIX: 'wuzz_e2ee_priv_',
  E2EE_PUBLIC_KEY_PREFIX: 'wuzz_e2ee_pub_',
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

  async setPushToken(token: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.PUSH_TOKEN, token);
  },

  async getPushToken(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.PUSH_TOKEN);
  },

  async deletePushToken(): Promise<void> {
    await this.deleteItem(STORAGE_KEYS.PUSH_TOKEN);
  },

  async setNotificationsEnabled(enabled: boolean): Promise<void> {
    await this.setItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED, enabled ? 'true' : 'false');
  },

  async getNotificationsEnabled(): Promise<boolean> {
    const raw = await this.getItem(STORAGE_KEYS.NOTIFICATIONS_ENABLED);
    return raw !== 'false'; // Default enabled (true)
  },

  async setE2EEKeyPair(
    userId: string,
    keyPairOrHex: { privateKeyHex: string; publicKeyJWK: string } | string,
    publicKeyJWK?: string
  ): Promise<void> {
    const privHex = typeof keyPairOrHex === 'string' ? keyPairOrHex : keyPairOrHex.privateKeyHex;
    const pubJWK = typeof keyPairOrHex === 'string' ? (publicKeyJWK || '') : keyPairOrHex.publicKeyJWK;
    await this.setItem(`${STORAGE_KEYS.E2EE_PRIVATE_KEY_PREFIX}${userId}`, privHex);
    await this.setItem(`${STORAGE_KEYS.E2EE_PUBLIC_KEY_PREFIX}${userId}`, pubJWK);
  },

  async getE2EEKeyPair(userId: string): Promise<{ privateKeyHex: string; publicKeyJWK: string } | null> {
    const priv = await this.getItem(`${STORAGE_KEYS.E2EE_PRIVATE_KEY_PREFIX}${userId}`);
    const pub = await this.getItem(`${STORAGE_KEYS.E2EE_PUBLIC_KEY_PREFIX}${userId}`);
    if (priv && pub) {
      return { privateKeyHex: priv, publicKeyJWK: pub };
    }
    return null;
  },

  async deleteE2EEKeyPair(userId: string): Promise<void> {
    await this.deleteItem(`${STORAGE_KEYS.E2EE_PRIVATE_KEY_PREFIX}${userId}`);
    await this.deleteItem(`${STORAGE_KEYS.E2EE_PUBLIC_KEY_PREFIX}${userId}`);
  },
};

