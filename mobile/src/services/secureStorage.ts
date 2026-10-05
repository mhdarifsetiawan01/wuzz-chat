/**
 * WuzzChat Mobile Secure Storage Service
 * Encrypted storage wrapper utilizing expo-secure-store
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createExclusiveQueue } from './exclusiveQueue';

const STORAGE_KEYS = {
  AUTH_TOKEN: 'wuzz_auth_token',
  DEVICE_ID: 'wuzz_device_id',
  USER_DATA: 'wuzz_user_profile',
  CURRENT_USER_ID: 'wuzz_current_user_id',
  EXPIRED_USER_ID: 'wuzz_expired_user_id',
  PUSH_TOKEN: 'wuzz_push_token',
  NOTIFICATIONS_ENABLED: 'wuzz_notifications_enabled',
  E2EE_PRIVATE_KEY_PREFIX: 'wuzz_e2ee_priv_',
  E2EE_PUBLIC_KEY_PREFIX: 'wuzz_e2ee_pub_',
  E2EE_ROOM_KEY_PREFIX: 'wuzz_e2ee_aes_',
  E2EE_ROOM_KEY_INDEX_PREFIX: 'wuzz_e2ee_aes_idx_',
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

/**
 * Kunci turunan room (AES) disimpan per user supaya cold start tidak mengulang ECDH (±120 ms/room).
 * Indeks daftar entri disimpan agar semuanya bisa dihapus saat kunci E2EE dihapus/diganti
 * (SecureStore tidak bisa menyebutkan isi). Read-modify-write indeks diserialkan lewat antrean.
 */
const roomKeyIndexLock = createExclusiveQueue();

function roomKeyEntryName(userId: string, roomId: string): string {
  // SecureStore hanya menerima [A-Za-z0-9._-]
  return `${STORAGE_KEYS.E2EE_ROOM_KEY_PREFIX}${userId}_${roomId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
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

  async setCurrentUserId(userId: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.CURRENT_USER_ID, userId);
  },

  async getCurrentUserId(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.CURRENT_USER_ID);
  },

  async deleteCurrentUserId(): Promise<void> {
    await this.deleteItem(STORAGE_KEYS.CURRENT_USER_ID);
  },

  /** Menandai akun yang sesinya habis (token 401) agar cache lokalnya dipertahankan sampai login berikutnya. */
  async setExpiredUserId(userId: string): Promise<void> {
    await this.setItem(STORAGE_KEYS.EXPIRED_USER_ID, userId);
  },

  async getExpiredUserId(): Promise<string | null> {
    return await this.getItem(STORAGE_KEYS.EXPIRED_USER_ID);
  },

  async deleteExpiredUserId(): Promise<void> {
    await this.deleteItem(STORAGE_KEYS.EXPIRED_USER_ID);
  },

  async clearSession(): Promise<void> {
    await this.deleteAuthToken();
    await this.deleteItem(STORAGE_KEYS.USER_DATA);
    await this.deleteCurrentUserId();
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
    // Kunci privat berganti (reset/regenerasi): kunci turunan lama tak berlaku lagi, hapus agar tidak tersisa
    const previousPriv = await this.getItem(`${STORAGE_KEYS.E2EE_PRIVATE_KEY_PREFIX}${userId}`);
    if (previousPriv && previousPriv !== privHex) {
      await this.clearDerivedRoomKeys(userId);
    }
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
    await this.clearDerivedRoomKeys(userId);
  },

  async getDerivedRoomKey(userId: string, roomId: string): Promise<string | null> {
    return await this.getItem(roomKeyEntryName(userId, roomId));
  },

  async setDerivedRoomKey(userId: string, roomId: string, value: string): Promise<void> {
    const entry = roomKeyEntryName(userId, roomId);
    await roomKeyIndexLock(async () => {
      // Indeks ditulis lebih dulu: entri yatim tak mungkin terbentuk bila proses mati di tengah jalan
      const indexName = `${STORAGE_KEYS.E2EE_ROOM_KEY_INDEX_PREFIX}${userId}`;
      let names: string[] = [];
      try {
        const parsed = JSON.parse((await this.getItem(indexName)) || '[]');
        if (Array.isArray(parsed)) names = parsed.filter((n): n is string => typeof n === 'string');
      } catch {
        // indeks rusak: mulai dari kosong
      }
      if (!names.includes(entry)) {
        names.push(entry);
        await this.setItem(indexName, JSON.stringify(names));
      }
      await this.setItem(entry, value);
    });
  },

  async clearDerivedRoomKeys(userId: string): Promise<void> {
    await roomKeyIndexLock(async () => {
      const indexName = `${STORAGE_KEYS.E2EE_ROOM_KEY_INDEX_PREFIX}${userId}`;
      try {
        const parsed = JSON.parse((await this.getItem(indexName)) || '[]');
        if (Array.isArray(parsed)) {
          for (const name of parsed) {
            if (typeof name === 'string' && name.startsWith(STORAGE_KEYS.E2EE_ROOM_KEY_PREFIX)) {
              await this.deleteItem(name).catch(() => {});
            }
          }
        }
      } catch {
        // indeks rusak: tidak ada yang bisa dihapus secara terarah
      }
      await this.deleteItem(indexName).catch(() => {});
    });
  },
};

