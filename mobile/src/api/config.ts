/**
 * WuzzChat API Configuration
 * Supports dynamic switching between live production and local development.
 */

import { Platform } from 'react-native';

const LIVE_PRODUCTION_URL = 'https://wuzz-chat-backend.fly.dev';
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
    return 'wss://wuzz-chat-backend.fly.dev/ws';
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
