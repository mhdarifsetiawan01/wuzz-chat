/**
 * WuzzChat App Version & Metadata Helper
 * Reads dynamic version & build metadata from expo-constants
 * and provides global Force Update event handling.
 */

import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppVersionInfo {
  version: string;
  buildNumber: number;
  clientId: string;
}

export interface ForceUpdatePayload {
  error: string;
  message: string;
  min_build?: number;
  update_url?: string;
}

type ForceUpdateListener = (payload: ForceUpdatePayload) => void;
const forceUpdateListeners = new Set<ForceUpdateListener>();

let cachedForceUpdatePayload: ForceUpdatePayload | null = null;

export function getAppVersionInfo(): AppVersionInfo {
  const config = Constants.expoConfig;
  const version = config?.version || '1.0.0';

  let buildNumber = 1;
  if (Platform.OS === 'android') {
    buildNumber = config?.android?.versionCode ?? 1;
  } else if (Platform.OS === 'ios') {
    const rawIos = config?.ios?.buildNumber;
    buildNumber = rawIos ? parseInt(rawIos, 10) : 1;
    if (isNaN(buildNumber)) buildNumber = 1;
  }

  const clientId =
    config?.android?.package ||
    (Platform.OS === 'ios' ? 'com.wuzzchat.ios' : 'com.wuzzchat.mobile');

  return {
    version,
    buildNumber,
    clientId,
  };
}

/**
 * Mendaftarkan listener ketika backend mengembalikan status HTTP 426 (Upgrade Required).
 */
export function onForceUpdateRequired(listener: ForceUpdateListener): () => void {
  forceUpdateListeners.add(listener);
  // Jika sudah ada status force update sebelumnya, langsung trigger listener
  if (cachedForceUpdatePayload) {
    listener(cachedForceUpdatePayload);
  }
  return () => {
    forceUpdateListeners.delete(listener);
  };
}

/**
 * Mentransmisikan sinyal pembaruan wajib (Force Update) ke seluruh UI.
 */
export function notifyForceUpdateRequired(payload: ForceUpdatePayload): void {
  cachedForceUpdatePayload = payload;
  forceUpdateListeners.forEach((listener) => {
    try {
      listener(payload);
    } catch (err) {
      console.error('[ForceUpdate] Listener execution error:', err);
    }
  });
}
