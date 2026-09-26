/**
 * WuzzChat Mobile - Background Notification Decryption Task
 * WhatsApp/Signal-style client-side E2EE background decryption.
 * 
 * Flow:
 * 1. Backend sends data-only silent FCM push containing encrypted ciphertext & sender metadata.
 * 2. Android wakes up this background task handler.
 * 3. Handler reads local user E2EE Private Key from SecureStore.
 * 4. Derives AES key with sender's public key and decrypts ciphertext locally in background.
 * 5. Schedules/Presents local notification to Android notification bar with decrypted plaintext.
 */

import { Platform } from 'react-native';
import { secureStorage } from './secureStorage';
import {
  decryptText,
  getOrDeriveRoomAESKey,
  isEncryptedMessage,
} from './crypto';
import {
  DEFAULT_NOTIFICATION_CHANNEL_ID,
  MENTION_NOTIFICATION_CHANNEL_ID,
} from './notificationService';

export const BACKGROUND_NOTIFICATION_TASK = 'WUZZ_BACKGROUND_NOTIFICATION_DECRYPT';

/**
 * Safely loads TaskManager and Notifications modules to guard against Expo Go runtime restrictions.
 */
function getExpoModules() {
  try {
    const TaskManager = require('expo-task-manager');
    const Notifications = require('expo-notifications');
    return { TaskManager, Notifications };
  } catch (err) {
    console.warn('[notificationBackgroundTask] Native background modules unavailable:', err);
    return null;
  }
}

/**
 * Decrypts notification data payload and formats user-friendly title and body.
 */
export async function decryptNotificationPayload(data: Record<string, any>): Promise<{
  title: string;
  body: string;
  channelId: string;
  isDecrypted: boolean;
}> {
  const senderNickname = data.sender_nickname || data.title || 'WuzzChat';
  const isMention =
    data.is_mention === 'true' ||
    data.is_mention === true ||
    (typeof data.tag === 'string' && data.tag.includes('mention'));

  const title = isMention ? `🔔 ${senderNickname} menyebut Anda` : senderNickname;
  const channelId = isMention
    ? MENTION_NOTIFICATION_CHANNEL_ID
    : DEFAULT_NOTIFICATION_CHANNEL_ID;

  const rawContent = data.encrypted_content || data.body || '';
  const senderPubKey = data.sender_public_key;
  const roomId = data.room_id;
  const mediaType = data.media_type;

  // 1. Fallback untuk pesan non-terenkripsi (misal notifikasi sistem/pengumuman)
  if (!isEncryptedMessage(rawContent)) {
    let body = rawContent || 'Pesan baru diterima';
    if (mediaType) {
      body = formatMediaSnippet(mediaType);
    }
    return { title, body, channelId, isDecrypted: true };
  }

  // 2. Dekripsi pesan E2EE jika private key dan public key pengirim tersedia
  try {
    const currentUserId = await secureStorage.getCurrentUserId();
    if (!currentUserId) {
      console.warn('[notificationBackgroundTask] No logged in user found in SecureStorage');
      return {
        title,
        body: formatEncryptedFallback(mediaType),
        channelId,
        isDecrypted: false,
      };
    }

    const keyPair = await secureStorage.getE2EEKeyPair(currentUserId);
    if (!keyPair || !keyPair.privateKeyHex) {
      console.warn('[notificationBackgroundTask] E2EE keypair not found for user', currentUserId);
      return {
        title,
        body: formatEncryptedFallback(mediaType),
        channelId,
        isDecrypted: false,
      };
    }

    if (!senderPubKey || !roomId) {
      console.warn('[notificationBackgroundTask] Missing sender_public_key or room_id in push payload');
      return {
        title,
        body: formatEncryptedFallback(mediaType),
        channelId,
        isDecrypted: false,
      };
    }

    // Derive symmetric AES key & decrypt
    const aesKey = getOrDeriveRoomAESKey(keyPair.privateKeyHex, senderPubKey, roomId);
    const decryptedText = decryptText(aesKey, rawContent);

    let displayBody = decryptedText;
    if (mediaType && (!displayBody || displayBody === rawContent)) {
      displayBody = formatMediaSnippet(mediaType);
    }

    return {
      title,
      body: displayBody || 'Pesan baru',
      channelId,
      isDecrypted: true,
    };
  } catch (err) {
    console.warn('[notificationBackgroundTask] Decryption error in background task:', err);
    return {
      title,
      body: formatEncryptedFallback(mediaType),
      channelId,
      isDecrypted: false,
    };
  }
}

function formatMediaSnippet(mediaType?: string): string {
  switch (mediaType) {
    case 'image':
      return '📷 Mengirim foto';
    case 'audio':
      return '🎤 Mengirim pesan suara';
    case 'document':
      return '📄 Mengirim dokumen';
    case 'video':
      return '🎥 Mengirim video';
    default:
      return '📎 Mengirim lampiran';
  }
}

function formatEncryptedFallback(mediaType?: string): string {
  if (mediaType) {
    return formatMediaSnippet(mediaType);
  }
  return '🔒 Pesan Baru (Terenkripsi)';
}

// Inisialisasi background task definition di level module
const modules = getExpoModules();
if (modules && modules.TaskManager && typeof modules.TaskManager.defineTask === 'function') {
  try {
    modules.TaskManager.defineTask(
      BACKGROUND_NOTIFICATION_TASK,
      async ({ data, error, executionInfo }: any) => {
        if (error) {
          console.warn('[notificationBackgroundTask] Background task error:', error);
          return;
        }

        try {
          const notificationData =
            data?.notification?.data ||
            data?.notification?.request?.content?.data ||
            data?.data ||
            data ||
            {};

          // Ambil payload notifikasi
          const { title, body, channelId } = await decryptNotificationPayload(notificationData);

          // Tampilkan notifikasi lokal di status bar Android
          if (modules.Notifications && typeof modules.Notifications.scheduleNotificationAsync === 'function') {
            await modules.Notifications.scheduleNotificationAsync({
              content: {
                title,
                body,
                data: notificationData,
                sound: 'default',
                badge: 1,
                ...(Platform.OS === 'android' ? { channelId } : {}),
              },
              trigger: null, // tampilkan seketika (0ms)
            });
            console.log('[notificationBackgroundTask] Local notification successfully posted to status bar:', title);
          }
        } catch (taskExecErr) {
          console.warn('[notificationBackgroundTask] Execution failed:', taskExecErr);
        }
      }
    );
    console.log('[notificationBackgroundTask] Registered TaskManager definition:', BACKGROUND_NOTIFICATION_TASK);
  } catch (regErr) {
    console.warn('[notificationBackgroundTask] Failed to define background task:', regErr);
  }
}
