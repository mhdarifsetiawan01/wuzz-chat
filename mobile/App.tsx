/**
 * WuzzChat Mobile App Entry Point
 * Expo Managed Workflow (React Native + TypeScript)
 * Implements @react-navigation/native-stack with 60fps native animations.
 */

import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { enableScreens } from 'react-native-screens';
import { NavigationContainer } from '@react-navigation/native';
import './src/services/notificationBackgroundTask';
import { initCrashReporting, setCrashUser } from './src/services/crashReporting';
import { AppErrorBoundary } from './src/components/AppErrorBoundary';
import { ActivityIndicator, Image, Linking, StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AuthProvider,
  CallProvider,
  ConversationProvider,
  DeviceProvider,
  FeedProvider,
  ConnectionProvider,
  MessageProvider,
  useAuth,
  useCall,
  useConversations,
} from './src/context';
import {
  cachePeerPublicKey,
  getCachedPeerPublicKey,
  extractDMPeerId,
} from './src/services/crypto';
import { ConversationItem, ConnectionStatusResponse } from './src/api/types';
import { getUserProfile, startDirectChat } from './src/api/users';
import { connectionsApi } from './src/api/connections';
import { AccountSuspendedScreen, GoogleLinkRequiredScreen, GoogleOnboardingScreen, LoginScreen, RegisterScreen } from './src/screens';
import type { GooglePending } from './src/screens/GoogleOnboardingScreen';
import {
  KeyConflictModal,
  SessionAlertModal,
  DeviceTransferModal,
  IncomingCallModal,
  ActiveCallOverlay,
  ForceUpdateModal,
  UpdateBannerLayout,
  GoogleLinkBannerLayout,
} from './src/components';
import { AppNavigator as MainAppNavigator, navigationRef } from './src/navigation';
import { notificationService } from './src/services/notificationService';
import { colors } from './src/theme';
import { AppDialogHost } from './src/components/AppDialogHost';
import { showAlert } from './src/services/dialog';

// Enable native screens for fluid 60fps stack transitions
enableScreens(true);

// Tahan splash native sampai pemeriksaan sesi awal selesai agar tidak ada layar loading perantara.
SplashScreen.preventAutoHideAsync().catch(() => {});

// Batas pengaman: splash native tidak boleh tertahan lebih lama dari ini.
const SPLASH_MAX_WAIT_MS = 3000;

const SPLASH_BACKGROUND = '#0462E8';
const SPLASH_ICON = require('./assets/splash-icon.png');

type AuthRoute = 'login' | 'register' | 'google';

// Pelaporan crash (Firebase Crashlytics): aktif hanya pada build rilis; no-op bila modul native tak ada.
initCrashReporting();

function AppContent() {
  const {
    isAuthenticated,
    isGoogleLinkFrozen,
    isAccountSuspended,
    user,
    isLoading,
    sessionReplacedMessage,
    dismissSessionAlert,
    e2eeStatus,
    resetE2EEKeys,
    cancelKeyConflict,
  } = useAuth();
  const { conversations } = useConversations();
  const { triggerIncomingCall } = useCall();
  const [authRoute, setAuthRoute] = useState<AuthRoute>('login');
  // Bukti verifikasi Google untuk layar onboarding (akun Google belum tertaut) dan pesan balik ke layar login.
  const [googlePending, setGooglePending] = useState<GooglePending | null>(null);
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [isKeyTransferModalOpen, setIsKeyTransferModalOpen] = useState<boolean>(false);
  const lastHandledUrlRef = useRef<{ url: string; time: number } | null>(null);

  // Kaitkan laporan crash dengan ID akun acak (UUID); kosongkan saat logout/hapus akun. Tanpa username/nama.
  useEffect(() => {
    setCrashUser(user?.id ?? null);
  }, [user?.id]);

  // Lepas splash native setelah sesi awal siap; layar loading JS di bawahnya tetap dipakai untuk logout.
  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync().catch(() => {});
      return;
    }
    const timer = setTimeout(() => {
      SplashScreen.hideAsync().catch(() => {});
    }, SPLASH_MAX_WAIT_MS);
    return () => clearTimeout(timer);
  }, [isLoading]);

  // Sync active room ID to notification service for foreground suppression (DEC-015)
  const handleNavigationStateChange = useCallback(() => {
    if (!navigationRef.isReady()) return;
    const currentRoute = navigationRef.getCurrentRoute();
    if (currentRoute?.name === 'Chat' && currentRoute.params) {
      const params = currentRoute.params as any;
      const roomId =
        params?.conversation?.id || params?.conversation?.room_id || null;
      notificationService.setActiveRoomId(roomId);
    } else {
      notificationService.setActiveRoomId(null);
    }
  }, []);

  // Helper to ensure navigation container is ready
  const ensureNavReady = async (): Promise<boolean> => {
    for (let i = 0; i < 20; i++) {
      if (navigationRef.isReady()) return true;
      await new Promise((r) => setTimeout(r, 50));
    }
    return navigationRef.isReady();
  };

  // Deep link listener for direct group links, forum sub-groups & user profiles (DEC-012, DEC-013, DEC-042, DEC-043)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleProfileDeepLink = async (username: string) => {
      try {
        const targetUser = await getUserProfile(username);
        if (!targetUser || !targetUser.id) {
          showAlert('Pengguna Tidak Ditemukan', `Akun @${username} tidak ditemukan.`);
          return;
        }

        const isNavReady = await ensureNavReady();
        if (!isNavReady) return;

        // Check if user is opening their own profile
        const currentUser = userRef.current;
        if (currentUser && (currentUser.id === targetUser.id || currentUser.username === targetUser.username)) {
          navigationRef.navigate('UserProfile', {
            userId: targetUser.id,
            username: targetUser.username,
            initialUser: targetUser,
          });
          return;
        }

        // Fetch connection status to verify privacy and friendship status
        let connStatus: ConnectionStatusResponse | null = null;
        try {
          connStatus = await connectionsApi.getConnectionStatus(targetUser.id);
        } catch (connErr) {
          console.warn('[App] Could not fetch connection status for deep link:', connErr);
        }

        const isPrivate = Boolean(targetUser.is_private_account || connStatus?.is_private_account);
        const isConnected = connStatus?.status === 'accepted';
        const canChat = !isPrivate || isConnected;

        if (canChat) {
          // Public profile or already connected: directly start / open direct chat window
          try {
            const res = await startDirectChat(targetUser.id);
            const conv: ConversationItem = {
              id: res.room_id,
              room_id: res.room_id,
              type: 'direct',
              title: targetUser.display_name,
              peer_id: targetUser.id,
              peer_nickname: targetUser.display_name,
              peer_avatar_url: targetUser.avatar_url,
              peer_is_verified: targetUser.is_verified,
              peer_public_key: targetUser.public_key,
            } as ConversationItem;

            navigationRef.navigate('Chat', { conversation: conv });
          } catch (chatErr: any) {
            console.warn('[App] Failed to start direct chat from deep link, navigating to profile:', chatErr);
            navigationRef.navigate('UserProfile', {
              userId: targetUser.id,
              username: targetUser.username,
              initialUser: targetUser,
            });
          }
        } else {
          // Private account and not friends yet: route to UserProfileScreen where private account guard & friend request action are presented
          navigationRef.navigate('UserProfile', {
            userId: targetUser.id,
            username: targetUser.username,
            initialUser: targetUser,
          });
        }
      } catch (err: any) {
        console.warn('[App] Failed to resolve user profile from deep link:', err);
        showAlert(
          'Profil Tidak Ditemukan',
          err?.detail || err?.message || `Tidak dapat menemukan pengguna @${username}.`
        );
      }
    };

    const handleDeepLink = async (url: string | null) => {
      if (!url) return;
      const now = Date.now();
      if (
        lastHandledUrlRef.current &&
        lastHandledUrlRef.current.url === url &&
        now - lastHandledUrlRef.current.time < 1500
      ) {
        return;
      }
      lastHandledUrlRef.current = { url, time: now };
      try {
        console.log('[App] Received deep link URL:', url);

        // 1. Match User Profile link:
        // Examples:
        // - https://chat.wuzzhub.id/u/john
        // - wuzzchat://u/john
        // - https://custom-domain.com/u/john
        // - https://chat.wuzzhub.id/?user=john or ?u=john
        const userMatch =
          url.match(/(?:\/|wuzzchat:\/\/)u\/([a-zA-Z0-9_.-]+)/i) ||
          url.match(/[?&](?:user|u)=([^&#]+)/i);

        if (userMatch && userMatch[1]) {
          const username = decodeURIComponent(userMatch[1]).replace(/^@/, '').trim();
          if (username) {
            await handleProfileDeepLink(username);
            return;
          }
        }

        // 2. Match Group / Subgroup Forum / Room link:
        // Examples:
        // - https://chat.wuzzhub.id/g/grp_xxx or wuzzchat://g/grp_xxx
        // - https://chat.wuzzhub.id/sub/sub_xxx or wuzzchat://sub/sub_xxx
        // - https://chat.wuzzhub.id/?room=grp_xxx or ?room=sub_xxx or ?room=dm_xxx
        // - wuzzchat://room/grp_xxx
        const groupMatch =
          url.match(/(?:\/|wuzzchat:\/\/)(?:g|sub|room)\/([^/?#]+)/i) ||
          url.match(/[?&]room=([^&#]+)/i);

        if (groupMatch && groupMatch[1]) {
          const roomId = decodeURIComponent(groupMatch[1]).trim();
          const isGroupRoom = roomId.startsWith('grp_') || roomId.startsWith('sub_');
          const targetConv: ConversationItem = {
            id: roomId,
            room_id: roomId,
            title: isGroupRoom ? 'Grup' : 'Obrolan',
            is_group: isGroupRoom,
            type: roomId.startsWith('sub_') ? 'subgroup' : isGroupRoom ? 'group' : 'direct',
          } as ConversationItem;

          const isNavReady = await ensureNavReady();
          if (isNavReady) {
            navigationRef.navigate('Chat', { conversation: targetConv });
          }
          return;
        }
      } catch (err) {
        console.warn('[App] Failed to parse deep link URL:', err);
      }
    };

    // Check initial URL (Cold Start)
    Linking.getInitialURL().then(handleDeepLink);

    // Listen to URL events (Warm / Foreground)
    const subscription = Linking.addEventListener('url', (event) => {
      handleDeepLink(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [isAuthenticated]);

  const conversationsRef = useRef(conversations);
  useEffect(() => {
    conversationsRef.current = conversations;
  }, [conversations]);

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  // Push notification tap & cold start listener
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleTargetNavigation = (target: {
      roomId: string | null;
      isGroup: boolean;
      title: string | null;
      senderId: string | null;
      senderPublicKey?: string | null;
      isCall?: boolean;
      callId?: string | null;
      callerNickname?: string | null;
      sdp?: string | null;
    }) => {
      if (!target.roomId) return;

      const currentConversations = conversationsRef.current;
      const currentUser = userRef.current;

      const existingConv = currentConversations.find(
        (c: ConversationItem) => c.id === target.roomId || c.room_id === target.roomId
      );

      const peerId =
        existingConv?.peer_id ||
        target.senderId ||
        extractDMPeerId(target.roomId, currentUser?.id);

      // Tangani event panggilan suara masuk
      if (target.isCall) {
        if (
          target.senderId &&
          currentUser?.id &&
          (target.senderId === currentUser.id || target.senderId === currentUser.username)
        ) {
          return;
        }
        triggerIncomingCall({
          room: target.roomId,
          peerId: peerId || target.senderId || 'Peer',
          peerNickname: target.callerNickname || target.title || 'Pengguna WuzzChat',
          sdp: target.sdp,
        });
        return;
      }

      const peerPublicKey =
        existingConv?.peer_public_key ||
        target.senderPublicKey ||
        (peerId ? getCachedPeerPublicKey(peerId) : undefined);

      if (peerId && peerPublicKey) {
        cachePeerPublicKey(peerId, peerPublicKey);
      }

      const targetConv: ConversationItem = existingConv || ({
        id: target.roomId,
        room_id: target.roomId,
        title: target.title || (target.isGroup ? 'Grup' : 'Obrolan'),
        is_group: target.isGroup,
        type: target.roomId.startsWith('sub_') ? 'subgroup' : target.isGroup ? 'group' : 'direct',
        peer_id: peerId || undefined,
        peer_public_key: peerPublicKey || undefined,
      } as ConversationItem);

      if (navigationRef.isReady()) {
        navigationRef.navigate('Chat', { conversation: targetConv });
      }
    };

    // Attach response listener
    const unsubscribeListener =
      notificationService.addNotificationResponseListener(handleTargetNavigation);

    // Check cold start
    notificationService.checkColdStartNotification(handleTargetNavigation);

    return () => {
      unsubscribeListener();
    };
  }, [isAuthenticated]);

  // Sesi terbentuk: buang sisa state alur Google/pesan login supaya tidak muncul lagi setelah logout berikutnya.
  useEffect(() => {
    if (isAuthenticated) {
      setGooglePending(null);
      setLoginMessage(null);
    }
  }, [isAuthenticated]);

  const handleDismissSessionAlert = useCallback(async () => {
    await dismissSessionAlert();
    setAuthRoute('login');
  }, [dismissSessionAlert]);

  const handleCancelKeyConflict = useCallback(async () => {
    await cancelKeyConflict();
    setAuthRoute('login');
  }, [cancelKeyConflict]);

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.splashContainer}>
          <Image source={SPLASH_ICON} style={styles.splashLogo} resizeMode="contain" />
          <ActivityIndicator size="large" color="#FFFFFF" style={styles.spinner} />
        </View>
      );
    }

    // Akun ditangguhkan moderator: layar khusus menggantikan seluruh aplikasi (didahulukan dari pembekuan Google).
    if (isAccountSuspended) {
      return <AccountSuspendedScreen />;
    }

    // Akun dibekukan (belum menautkan Google setelah batas waktu): layar penautan menggantikan seluruh aplikasi.
    if (isGoogleLinkFrozen) {
      return <GoogleLinkRequiredScreen />;
    }

    if (isAuthenticated) {
      return (
        <NavigationContainer
          ref={navigationRef}
          onStateChange={handleNavigationStateChange}
        >
          <MainAppNavigator />
        </NavigationContainer>
      );
    }

    if (authRoute === 'register') {
      return <RegisterScreen onNavigateToLogin={() => setAuthRoute('login')} />;
    }

    if (authRoute === 'google' && googlePending) {
      return (
        <GoogleOnboardingScreen
          pending={googlePending}
          onCancel={(message) => {
            setGooglePending(null);
            setLoginMessage(message ?? null);
            setAuthRoute('login');
          }}
        />
      );
    }

    return (
      <LoginScreen
        onNavigateToRegister={() => setAuthRoute('register')}
        onGoogleNotLinked={(pending) => {
          setLoginMessage(null);
          setGooglePending(pending);
          setAuthRoute('google');
        }}
        initialMessage={loginMessage}
      />
    );
  };

  return (
    <View style={styles.rootContainer}>
      {/* Ikon status bar: putih hanya di splash biru; gelap di UI terang (putih di atas latar terang nyaris tak terbaca). */}
      <StatusBar style={isLoading ? 'light' : 'dark'} />
      <GoogleLinkBannerLayout enabled={isAuthenticated}>
        <UpdateBannerLayout enabled={isAuthenticated}>
          {renderContent()}
        </UpdateBannerLayout>
      </GoogleLinkBannerLayout>

      {/* Global Terminal Session Replaced Guard Modal */}
      {!!sessionReplacedMessage && (
        <SessionAlertModal
          visible={!!sessionReplacedMessage}
          message={sessionReplacedMessage}
          onDismiss={handleDismissSessionAlert}
        />
      )}

      {/* Global E2EE Key Conflict Resolution Modal (HTTP 409) */}
      {e2eeStatus === 'conflict' && (
        <KeyConflictModal
          visible={e2eeStatus === 'conflict'}
          onConfirmReset={resetE2EEKeys}
          hasPassword={user?.has_password !== false}
          googleLinked={user?.google_linked === true}
          onOpenDeviceTransfer={() => setIsKeyTransferModalOpen(true)}
          onCancel={handleCancelKeyConflict}
        />
      )}

      {/* Global E2EE Key Transfer Modal */}
      {isKeyTransferModalOpen && (
        <DeviceTransferModal
          visible={isKeyTransferModalOpen}
          initialMode="scan"
          onClose={() => setIsKeyTransferModalOpen(false)}
          onTransferSuccess={() => setIsKeyTransferModalOpen(false)}
        />
      )}

      {/* Global WebRTC 1-on-1 Voice Calling Modals */}
      <IncomingCallModal />
      <ActiveCallOverlay />
      <ForceUpdateModal />
    </View>
  );
}

export default function App() {
  return (
    <AppErrorBoundary>
    <SafeAreaProvider>
      <DeviceProvider>
        <AuthProvider>
          <ConversationProvider>
            <MessageProvider>
              <CallProvider>
                <FeedProvider>
                  <ConnectionProvider>
                    <AppContent />
                  </ConnectionProvider>
                </FeedProvider>
              </CallProvider>
            </MessageProvider>
          </ConversationProvider>
        </AuthProvider>
      </DeviceProvider>
      <AppDialogHost />
    </SafeAreaProvider>
    </AppErrorBoundary>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  // Samakan dengan splash native (app.json -> expo-splash-screen) agar peralihan tidak terlihat.
  splashContainer: {
    flex: 1,
    backgroundColor: SPLASH_BACKGROUND,
    justifyContent: 'center',
    alignItems: 'center',
  },
  splashLogo: {
    width: 200,
    height: 200,
  },
  spinner: {
    position: 'absolute',
    bottom: '25%',
  },
});
