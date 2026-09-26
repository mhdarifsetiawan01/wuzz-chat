/**
 * WuzzChat Mobile Push Notification Service
 * Encapsulated notification adapter supporting Expo Go development simulation
 * as well as Production / Development Builds (FCM v1 & APNs).
 * Strictly guards against Expo Go SDK 53+ Android push restrictions.
 */

import * as Device from 'expo-device';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';
import { notificationsApi } from '../api/notifications';
import { secureStorage } from './secureStorage';

// Android default notification channel IDs
export const DEFAULT_NOTIFICATION_CHANNEL_ID = 'wuzz_chat_messages';
export const MENTION_NOTIFICATION_CHANNEL_ID = 'wuzz_chat_mentions';

// State to track active room opened in foreground for suppression (DEC-015)
let currentActiveRoomId: string | null = null;

/**
 * Detects if currently executing inside the Expo Go mobile client.
 */
export function isExpoGo(): boolean {
  try {
    return (
      Constants.appOwnership === 'expo' ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    );
  } catch {
    return false;
  }
}

/**
 * Safely loads the native expo-notifications module dynamically to prevent
 * unhandled startup evaluation errors inside Expo Go on Android (SDK 53+).
 */
function getExpoNotificationsModule(): typeof import('expo-notifications') | null {
  // If running on Android in Expo Go, avoid loading expo-notifications because SDK 53+ intentionally throws fatal error on load
  if (isExpoGo() && Platform.OS === 'android') {
    return null;
  }
  try {
    return require('expo-notifications');
  } catch (err) {
    console.warn('[NotificationService] expo-notifications module unavailable in current environment:', err);
    return null;
  }
}

// Inisialisasi notification presentation handler dengan aman
try {
  const Notifications = getExpoNotificationsModule();
  if (Notifications && typeof Notifications.setNotificationHandler === 'function') {
    Notifications.setNotificationHandler({
      handleNotification: async (notification) => {
        const data = notification.request?.content?.data as Record<string, any> | undefined;
        const notificationRoomId = data?.room_id;

        // DEC-015: Foreground Banner Suppression
        if (currentActiveRoomId && notificationRoomId && currentActiveRoomId === notificationRoomId) {
          return {
            shouldShowAlert: false,
            shouldShowBanner: false,
            shouldShowList: false,
            shouldPlaySound: false,
            shouldSetBadge: false,
          };
        }

        return {
          shouldShowAlert: true,
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        };
      },
    });
  }
} catch (handlerErr) {
  console.warn('[NotificationService] Failed to set notification handler:', handlerErr);
}

export const notificationService = {
  /**
   * Updates currently opened room ID in foreground to suppress duplicate alerts.
   */
  setActiveRoomId(roomId: string | null): void {
    currentActiveRoomId = roomId;
    if (roomId) {
      this.clearBadge().catch(() => {});
    }
  },

  /**
   * Retrieves currently active room ID.
   */
  getActiveRoomId(): string | null {
    return currentActiveRoomId;
  },

  /**
   * Initializes notification channels on Android.
   */
  async initChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;
    try {
      const Notifications = getExpoNotificationsModule();
      if (!Notifications || !Notifications.setNotificationChannelAsync) return;

      await Notifications.setNotificationChannelAsync(DEFAULT_NOTIFICATION_CHANNEL_ID, {
        name: 'Pesan WuzzChat',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#10B981',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });

      await Notifications.setNotificationChannelAsync(MENTION_NOTIFICATION_CHANNEL_ID, {
        name: 'Sebutan & Prioritas',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 500, 250, 500],
        lightColor: '#3B82F6',
        sound: 'default',
        enableLights: true,
        enableVibrate: true,
        showBadge: true,
      });
    } catch (err) {
      console.warn('[NotificationService] initChannels skipped or failed:', err);
    }
  },

  /**
   * Checks OS notification permission status.
   */
  async getPermissionStatus(): Promise<string> {
    try {
      if (Platform.OS === 'web') return 'granted';
      if (isExpoGo()) return 'granted';

      const Notifications = getExpoNotificationsModule();
      if (!Notifications || !Notifications.getPermissionsAsync) return 'undetermined';

      const { status } = await Notifications.getPermissionsAsync();
      return status;
    } catch {
      return 'undetermined';
    }
  },

  /**
   * Requests runtime OS notification permission.
   */
  async requestPermissions(): Promise<string> {
    try {
      if (Platform.OS === 'web') return 'granted';
      if (isExpoGo()) return 'granted';

      const Notifications = getExpoNotificationsModule();
      if (!Notifications || !Notifications.requestPermissionsAsync) return 'undetermined';

      const { status } = await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
        },
      });
      return status;
    } catch {
      return 'denied';
    }
  },

  /**
   * Requests OS push notification permission and fetches device/Expo push token.
   */
  async registerForPushNotificationsAsync(): Promise<string | null> {
    try {
      if (Platform.OS === 'web') {
        console.log('[NotificationService] Push notifications on Web preview are managed by ServiceWorker.');
        return null;
      }

      await this.initChannels();

      // Check if running in Expo Go client (SDK 53+ removed remote FCM push from Expo Go)
      if (isExpoGo()) {
        console.log(
          'ℹ️ [NotificationService] Running in Expo Go: Remote push notifications (FCM) are disabled in Expo Go on SDK 53+. Use a development build (expo-dev-client) for production remote push.'
        );
        return null;
      }

      // Physical device verification
      if (!Device.isDevice) {
        console.warn('[NotificationService] Push notifications require a physical mobile device.');
        return null;
      }

      const Notifications = getExpoNotificationsModule();
      if (!Notifications) return null;

      // Check and request permission
      const status = await this.requestPermissions();
      if (status !== 'granted') {
        console.warn('[NotificationService] Push notification permissions not granted.');
        return null;
      }

      // Fetch token safely: Try native device push token first for FCM/APNs, fallback to Expo push token
      let token: string | null = null;
      try {
        if (typeof Notifications.getDevicePushTokenAsync === 'function') {
          const deviceTokenResponse = await Notifications.getDevicePushTokenAsync();
          if (deviceTokenResponse && deviceTokenResponse.data) {
            token = deviceTokenResponse.data;
          }
        }
      } catch (deviceErr) {
        console.warn('[NotificationService] Device push token unavailable, attempting Expo push token:', deviceErr);
      }

      if (!token) {
        try {
          if (typeof Notifications.getExpoPushTokenAsync === 'function') {
            const tokenResponse = await Notifications.getExpoPushTokenAsync();
            token = tokenResponse.data;
          }
        } catch (expoErr: any) {
          if (expoErr?.message?.includes('removed from Expo Go')) {
            console.log('ℹ️ [NotificationService] Remote push requires a development build.');
            return null;
          }
          console.warn('[NotificationService] Expo push token fetch failed:', expoErr);
        }
      }

      if (token) {
        await secureStorage.setPushToken(token);
        console.log('[NotificationService] Push token registered:', token);
      }

      return token;
    } catch (err) {
      console.warn('[NotificationService] registerForPushNotificationsAsync error (graceful fallback):', err);
      return null;
    }
  },

  /**
   * Registers/Subscribes the device push token with the backend server.
   */
  async subscribeDevice(providedToken?: string): Promise<boolean> {
    try {
      const isEnabled = await secureStorage.getNotificationsEnabled();
      if (!isEnabled) {
        console.log('[NotificationService] Push notifications are disabled in user settings.');
        return false;
      }

      if (isExpoGo()) {
        // In Expo Go, mark preference as active without firing remote FCM request
        return true;
      }

      const token = providedToken || (await this.registerForPushNotificationsAsync());
      if (!token) {
        return false;
      }

      const platform = Platform.OS === 'ios' ? 'ios' : 'android';
      await notificationsApi.subscribe({
        platform,
        endpoint: token,
      });

      console.log('[NotificationService] Successfully subscribed device to backend.');
      return true;
    } catch (err) {
      console.warn('[NotificationService] Failed to subscribe device with backend:', err);
      return false;
    }
  },

  /**
   * Unsubscribes the device push token from the backend server.
   */
  async unsubscribeDevice(): Promise<boolean> {
    try {
      const token = await secureStorage.getPushToken();
      if (token) {
        try {
          await notificationsApi.unsubscribe({ endpoint: token });
          console.log('[NotificationService] Successfully unsubscribed device from backend.');
        } catch (err) {
          console.warn('[NotificationService] Unsubscribe request failed (offline / best-effort):', err);
        }
        await secureStorage.deletePushToken();
      }
      return true;
    } catch (err) {
      console.warn('[NotificationService] Error during unsubscribeDevice:', err);
      return false;
    }
  },

  /**
   * Updates app icon badge count.
   */
  async setBadgeCount(count: number): Promise<void> {
    try {
      const Notifications = getExpoNotificationsModule();
      if (Notifications && typeof Notifications.setBadgeCountAsync === 'function') {
        await Notifications.setBadgeCountAsync(Math.max(0, count));
      }
    } catch (err) {
      console.warn('[NotificationService] Failed to set badge count:', err);
    }
  },

  /**
   * Clears all notifications and resets badge count to 0.
   */
  async clearBadge(): Promise<void> {
    try {
      const Notifications = getExpoNotificationsModule();
      if (Notifications) {
        if (typeof Notifications.setBadgeCountAsync === 'function') {
          await Notifications.setBadgeCountAsync(0);
        }
        if (typeof Notifications.dismissAllNotificationsAsync === 'function') {
          await Notifications.dismissAllNotificationsAsync();
        }
      }
    } catch (err) {
      console.warn('[NotificationService] Failed to clear badge:', err);
    }
  },

  /**
   * Schedules a local notification (e.g. for testing or system alerts).
   */
  async scheduleLocalNotification(
    title: string,
    body: string,
    data?: Record<string, any>
  ): Promise<string> {
    try {
      if (isExpoGo() && Platform.OS === 'android') {
        console.log('🔔 [Simulasi Notifikasi Expo Go]', { title, body, data });
        return 'expo_go_mock_notification_id';
      }

      await this.initChannels();
      const Notifications = getExpoNotificationsModule();
      if (!Notifications || typeof Notifications.scheduleNotificationAsync !== 'function') {
        console.log('🔔 [Simulasi Notifikasi Fallback]', { title, body, data });
        return 'mock_notification_id';
      }

      return await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          data: data || {},
          sound: 'default',
          badge: 1,
          ...(Platform.OS === 'android' ? { channelId: DEFAULT_NOTIFICATION_CHANNEL_ID } : {}),
        },
        trigger: null, // show immediately
      });
    } catch (err) {
      console.warn('[NotificationService] Failed to schedule local notification (fallback to mock):', err);
      return 'fallback_notification_id';
    }
  },

  /**
   * Registers a listener when user taps an incoming notification.
   */
  addNotificationResponseListener(
    onResponse: (target: {
      roomId: string | null;
      isGroup: boolean;
      title: string | null;
      senderId: string | null;
    }) => void
  ): () => void {
    try {
      const Notifications = getExpoNotificationsModule();
      if (!Notifications || typeof Notifications.addNotificationResponseReceivedListener !== 'function') {
        return () => {};
      }

      const subscription = Notifications.addNotificationResponseReceivedListener((response) => {
        try {
          const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
          const target = this.extractTargetRoom(data);
          onResponse(target);
        } catch (err) {
          console.warn('[NotificationService] Error in response listener callback:', err);
        }
      });

      return () => {
        try {
          subscription.remove();
        } catch {}
      };
    } catch (err) {
      console.warn('[NotificationService] addNotificationResponseListener skipped:', err);
      return () => {};
    }
  },

  /**
   * Checks if app was launched directly from tapping a notification while in killed state (cold start).
   */
  async checkColdStartNotification(
    onResponse: (target: {
      roomId: string | null;
      isGroup: boolean;
      title: string | null;
      senderId: string | null;
    }) => void
  ): Promise<void> {
    try {
      const Notifications = getExpoNotificationsModule();
      if (!Notifications || typeof Notifications.getLastNotificationResponseAsync !== 'function') {
        return;
      }

      const response = await Notifications.getLastNotificationResponseAsync();
      if (!response) return;

      const data = response?.notification?.request?.content?.data as Record<string, any> | undefined;
      const target = this.extractTargetRoom(data);
      onResponse(target);
    } catch (err) {
      console.warn('[NotificationService] checkColdStartNotification skipped:', err);
    }
  },

  /**
   * Helper to parse and extract target room navigation data from a notification object.
   */
  extractTargetRoom(
    notificationData?: Record<string, any>
  ): {
    roomId: string | null;
    isGroup: boolean;
    senderId: string | null;
    title: string | null;
  } {
    if (!notificationData) {
      return { roomId: null, isGroup: false, senderId: null, title: null };
    }

    const roomId = notificationData.room_id || null;
    const senderId = notificationData.sender_id || null;
    const title = notificationData.sender_nickname || null;
    const isGroup = Boolean(
      roomId && (roomId.startsWith('grp_') || roomId.startsWith('sub_'))
    );

    return { roomId, isGroup, senderId, title };
  },
};
