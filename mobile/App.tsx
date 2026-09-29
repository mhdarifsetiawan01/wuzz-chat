/**
 * WuzzChat Mobile App Entry Point
 * Expo Managed Workflow (React Native + TypeScript)
 * Implements @react-navigation/native-stack with 60fps native animations.
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { enableScreens } from 'react-native-screens';
import { NavigationContainer } from '@react-navigation/native';
import './src/services/notificationBackgroundTask';
import { ActivityIndicator, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import {
  AuthProvider,
  CallProvider,
  ConversationProvider,
  DeviceProvider,
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
import { ConversationItem } from './src/api/types';
import { LoginScreen, RegisterScreen } from './src/screens';
import {
  KeyConflictModal,
  SessionAlertModal,
  DeviceTransferModal,
  IncomingCallModal,
  ActiveCallOverlay,
} from './src/components';
import { AppNavigator as MainAppNavigator, navigationRef } from './src/navigation';
import { notificationService } from './src/services/notificationService';
import { colors, spacing, typography } from './src/theme';

// Enable native screens for fluid 60fps stack transitions
enableScreens(true);

type AuthRoute = 'login' | 'register';

function AppContent() {
  const {
    isAuthenticated,
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
  const [isKeyTransferModalOpen, setIsKeyTransferModalOpen] = useState<boolean>(false);

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

  // Deep link listener for direct group links (DEC-012 & DEC-013)
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleDeepLink = (url: string | null) => {
      if (!url) return;
      try {
        console.log('[App] Received deep link URL:', url);
        // Match room parameter: room=grp_... or room=sub_... or room=dm_...
        const match = url.match(/[?&]room=([^&#]+)/);
        if (match && match[1]) {
          const roomId = decodeURIComponent(match[1]);
          const isGroupRoom = roomId.startsWith('grp_') || roomId.startsWith('sub_');
          const targetConv: ConversationItem = {
            id: roomId,
            room_id: roomId,
            title: isGroupRoom ? 'Grup' : 'Obrolan',
            is_group: isGroupRoom,
            type: roomId.startsWith('sub_') ? 'subgroup' : isGroupRoom ? 'group' : 'direct',
          } as ConversationItem;

          if (navigationRef.isReady()) {
            navigationRef.navigate('Chat', { conversation: targetConv });
          }
        }
      } catch (err) {
        console.warn('[App] Failed to parse deep link URL:', err);
      }
    };

    // Check initial URL
    Linking.getInitialURL().then(handleDeepLink);

    // Listen to URL events
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
          <View style={styles.splashBadge}>
            <Text style={styles.splashLogo}>⚡</Text>
          </View>
          <Text style={styles.splashTitle}>WuzzChat</Text>
          <ActivityIndicator size="large" color={colors.accentPrimary} style={styles.spinner} />
        </View>
      );
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

    return <LoginScreen onNavigateToRegister={() => setAuthRoute('register')} />;
  };

  return (
    <View style={styles.rootContainer}>
      {renderContent()}

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
    </View>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DeviceProvider>
        <AuthProvider>
          <ConversationProvider>
            <MessageProvider>
              <CallProvider>
                <AppContent />
              </CallProvider>
            </MessageProvider>
          </ConversationProvider>
        </AuthProvider>
      </DeviceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  splashContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  splashBadge: {
    width: 80,
    height: 80,
    borderRadius: 24,
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  splashLogo: {
    fontSize: 40,
  },
  splashTitle: {
    ...typography.h1,
    color: colors.textPrimary,
    marginBottom: spacing.xxl,
  },
  spinner: {
    marginTop: spacing.md,
  },
});
