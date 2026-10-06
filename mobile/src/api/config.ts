/**
 * WuzzChat API Configuration
 * Supports dynamic switching between live production and local development.
 */

import { Platform } from 'react-native';

const LIVE_PRODUCTION_URL = 'https://chat-api.wuzzhub.id';
const LOCAL_ANDROID_URL = 'http://10.0.2.2:8080';
const LOCAL_IOS_URL = 'http://localhost:8080';

// Change USE_LIVE_BACKEND to false if running Go backend locally
const USE_LIVE_BACKEND = true;

export function getBaseApiUrl(): string {
  if (USE_LIVE_BACKEND) {
    return LIVE_PRODUCTION_URL;
  }
  if (Platform.OS === 'android') {
    return LOCAL_ANDROID_URL;
  }
  return LOCAL_IOS_URL;
}

export function getBaseWsUrl(): string {
  if (USE_LIVE_BACKEND) {
    return 'wss://chat-api.wuzzhub.id/ws';
  }
  if (Platform.OS === 'android') {
    return 'ws://10.0.2.2:8080/ws';
  }
  return 'ws://localhost:8080/ws';
}

export const API_CONFIG = {
  TIMEOUT_MS: 15000, // 15 seconds strict AbortController limit
  TENANT_ID: 'default',
  PLATFORM: Platform.OS === 'ios' ? 'ios' : 'android',
} as const;

/**
 * Login Google. WEB_CLIENT_ID adalah OAuth client ID bertipe "Web application" dari Google Cloud Console (bukan client
 * ID Android) dan harus termasuk dalam GOOGLE_OAUTH_CLIENT_IDS di server. Kosong = tombol Google disembunyikan dan
 * aplikasi berperilaku seperti sebelumnya (login/daftar username + password). Nilainya bukan rahasia.
 */
export const GOOGLE_AUTH_CONFIG = {
  WEB_CLIENT_ID: '721755234013-ciptsooit78pk1vjmrevkmdaft0malhg.apps.googleusercontent.com',
} as const;

export const APP_LINK_CONFIG = {
  WEB_DOMAIN: 'chat.wuzzhub.id',
  WEB_BASE_URL: 'https://chat.wuzzhub.id',
  CUSTOM_SCHEME: 'wuzzchat',
  getProfileShareUrl: (username: string) =>
    `https://chat.wuzzhub.id/u/${encodeURIComponent(username.replace(/^@/, ''))}`,
  getGroupShareUrl: (groupId: string) =>
    `https://chat.wuzzhub.id/g/${encodeURIComponent(groupId)}`,
  getSubGroupShareUrl: (subGroupId: string) =>
    `https://chat.wuzzhub.id/sub/${encodeURIComponent(subGroupId)}`,
} as const;

/** Alamat dukungan yang tercantum di halaman legal publik; dipakai tautan "hubungi support" di aplikasi. */
export const SUPPORT_EMAIL = 'support@semanticdigital.id';

/** Halaman legal publik (web); dibuka lewat peramban dari aplikasi dan dipakai sebagai URL di Play Console. */
export const LEGAL_URLS = {
  privacy: 'https://chat.wuzzhub.id/privacy',
  terms: 'https://chat.wuzzhub.id/terms',
  deleteAccount: 'https://chat.wuzzhub.id/delete-account',
} as const;
