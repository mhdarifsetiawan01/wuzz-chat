/**
 * WuzzChat Mobile App Entry Point
 * Expo Managed Workflow (React Native + TypeScript)
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, CallProvider, DeviceProvider, useAuth } from './src/context';
import {
  ChatScreen,
  GroupInfoScreen,
  LoginScreen,
  NewChatScreen,
  NewGroupScreen,
  RecentChatsScreen,
  RegisterScreen,
} from './src/screens';
import { Conversation, ConversationItem, GroupDetails } from './src/api/types';
import {
  KeyConflictModal,
  SessionAlertModal,
  DeviceTransferModal,
  IncomingCallModal,
  ActiveCallOverlay,
} from './src/components';
import { notificationService } from './src/services/notificationService';
import { colors, spacing, typography } from './src/theme';

type AuthRoute = 'login' | 'register';

function AppNavigator() {
  const {
    isAuthenticated,
    isLoading,
    sessionReplacedMessage,
    dismissSessionAlert,
    e2eeStatus,
    resetE2EEKeys,
    cancelKeyConflict,
  } = useAuth();
  const [authRoute, setAuthRoute] = useState<AuthRoute>('login');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState<boolean>(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState<boolean>(false);
  const [isKeyTransferModalOpen, setIsKeyTransferModalOpen] = useState<boolean>(false);
  const [activeGroupInfo, setActiveGroupInfo] = useState<GroupDetails | ConversationItem | null>(null);
  // M-Mobile-8.2C: Tracks the parent group conversation when inside a sub-group
  // (used for smart back navigation & breadcrumb info)
  const [forumParentConversation, setForumParentConversation] = useState<Conversation | null>(null);

  // Hardware back button support for Android
  React.useEffect(() => {
    const onBackPress = () => {
      if (activeGroupInfo) {
        setActiveGroupInfo(null);
        return true;
      }
      if (isNewGroupOpen) {
        setIsNewGroupOpen(false);
        return true;
      }
      // M-Mobile-8.2C: Smart back — sub-group → navigate to parent group first
      if (activeConversation && forumParentConversation &&
          typeof activeConversation.id === 'string' &&
          activeConversation.id.startsWith('sub_')) {
        // Pop sub-group → go back to parent group
        setActiveConversation(forumParentConversation);
        setForumParentConversation(null);
        return true;
      }
      if (activeConversation) {
        setActiveConversation(null);
        setForumParentConversation(null);
        return true;
      }
      if (isNewChatOpen) {
        setIsNewChatOpen(false);
        return true;
      }
      return false;
    };

    const subscription = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => subscription.remove();
  }, [activeGroupInfo, isNewGroupOpen, activeConversation, isNewChatOpen, forumParentConversation]);

  // Deep link listener for direct group links (DEC-012 & DEC-013)
  React.useEffect(() => {
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
          setActiveGroupInfo(null);
          setIsNewGroupOpen(false);
          setIsNewChatOpen(false);
          setActiveConversation({
            id: roomId,
            room_id: roomId,
            title: isGroupRoom ? 'Grup' : 'Obrolan',
            is_group: isGroupRoom,
            type: roomId.startsWith('sub_') ? 'subgroup' : isGroupRoom ? 'group' : 'direct',
          });
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

  // Sync active room ID to notification service for foreground suppression (DEC-015)
  React.useEffect(() => {
    const roomId = activeConversation
      ? (activeConversation.id || activeConversation.room_id || null)
      : null;
    notificationService.setActiveRoomId(roomId);
  }, [activeConversation]);

  // Push notification tap & cold start listener
  React.useEffect(() => {
    if (!isAuthenticated) return;

    const handleTargetNavigation = (target: {
      roomId: string | null;
      isGroup: boolean;
      title: string | null;
      senderId: string | null;
    }) => {
      if (!target.roomId) return;
      setActiveGroupInfo(null);
      setIsNewGroupOpen(false);
      setIsNewChatOpen(false);
      setActiveConversation({
        id: target.roomId,
        room_id: target.roomId,
        title: target.title || (target.isGroup ? 'Grup' : 'Obrolan'),
        is_group: target.isGroup,
        type: target.roomId.startsWith('sub_') ? 'subgroup' : target.isGroup ? 'group' : 'direct',
      });
    };

    // Attach response listener
    const unsubscribeListener = notificationService.addNotificationResponseListener(handleTargetNavigation);

    // Check cold start
    notificationService.checkColdStartNotification(handleTargetNavigation);

    return () => {
      unsubscribeListener();
    };
  }, [isAuthenticated]);

  // Memoized screen event handlers to eliminate infinite re-render cycles
  const handleBackFromGroupInfo = useCallback(() => {
    setActiveGroupInfo(null);
  }, []);

  const handleLeaveSuccess = useCallback(() => {
    setActiveGroupInfo(null);
    setActiveConversation(null);
  }, []);

  const handleGroupUpdated = useCallback((updated: GroupDetails) => {
    setActiveConversation((prev) => {
      if (!prev || prev.id !== updated.id) return prev;
      if (
        prev.title === updated.title &&
        prev.description === updated.description &&
        prev.avatar_url === updated.avatar_url &&
        prev.member_count === updated.member_count
      ) {
        return prev;
      }
      return {
        ...prev,
        title: updated.title,
        description: updated.description,
        avatar_url: updated.avatar_url,
        member_count: updated.member_count,
      };
    });
  }, []);

  const handleBackFromChat = useCallback(() => {
    // M-Mobile-8.2C: When backing out of a sub-group, go to parent group first
    if (
      activeConversation &&
      forumParentConversation &&
      typeof activeConversation.id === 'string' &&
      activeConversation.id.startsWith('sub_')
    ) {
      setActiveConversation(forumParentConversation);
      setForumParentConversation(null);
      return;
    }
    setActiveConversation(null);
    setForumParentConversation(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeConversation, forumParentConversation]);

  const handleOpenGroupInfo = useCallback((grp: GroupDetails | ConversationItem) => {
    setActiveGroupInfo(grp);
  }, []);

  /**
   * M-Mobile-8.2B: Directly enter a sub-group conversation from the forum modal.
   * Saves the current parent conversation for breadcrumbs & back navigation.
   */
  const handleEnterSubGroup = useCallback((subConv: Conversation) => {
    setForumParentConversation(activeConversation);
    setActiveConversation(subConv);
  }, [activeConversation]);

  /**
   * M-Mobile-8.2C: Smart back from sub-group breadcrumb / back button.
   * Finds and navigates to the parent group conversation.
   */
  const handleNavigateToParent = useCallback((parentGroupId: string) => {
    // Try to use the saved parent conversation if IDs match
    if (forumParentConversation && forumParentConversation.id === parentGroupId) {
      setActiveConversation(forumParentConversation);
      setForumParentConversation(null);
      return;
    }
    // Fallback: build minimal conversation object for the parent group
    const parentConv: Conversation = {
      id: parentGroupId,
      type: 'group',
      is_group: true,
    };
    setActiveConversation(parentConv);
    setForumParentConversation(null);
  }, [forumParentConversation]);

  const handleBackFromNewGroup = useCallback(() => {
    setIsNewGroupOpen(false);
  }, []);

  const handleSelectFromNewGroup = useCallback((chat: Conversation) => {
    setIsNewGroupOpen(false);
    setIsNewChatOpen(false);
    setActiveConversation(chat);
  }, []);

  const handleBackFromNewChat = useCallback(() => {
    setIsNewChatOpen(false);
  }, []);

  const handleSelectFromNewChat = useCallback((chat: Conversation) => {
    setIsNewChatOpen(false);
    setActiveConversation(chat);
  }, []);

  const handleNavigateToNewGroup = useCallback(() => {
    setIsNewChatOpen(false);
    setIsNewGroupOpen(true);
  }, []);

  const handleDismissSessionAlert = useCallback(async () => {
    await dismissSessionAlert();
    setAuthRoute('login');
    setActiveConversation(null);
    setActiveGroupInfo(null);
    setIsNewGroupOpen(false);
    setIsNewChatOpen(false);
    setForumParentConversation(null);
  }, [dismissSessionAlert]);

  const handleCancelKeyConflict = useCallback(async () => {
    await cancelKeyConflict();
    setAuthRoute('login');
    setActiveConversation(null);
    setActiveGroupInfo(null);
    setIsNewGroupOpen(false);
    setIsNewChatOpen(false);
    setForumParentConversation(null);
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
      if (activeGroupInfo) {
        const targetGroupId = activeGroupInfo.id || (activeGroupInfo as any).room_id || '';
        return (
          <GroupInfoScreen
            groupId={targetGroupId}
            onBack={handleBackFromGroupInfo}
            onLeaveSuccess={handleLeaveSuccess}
            onGroupUpdated={handleGroupUpdated}
          />
        );
      }

      if (activeConversation) {
        return (
          <ChatScreen
            conversation={activeConversation as unknown as ConversationItem}
            onBack={handleBackFromChat}
            onOpenGroupInfo={handleOpenGroupInfo}
            onNavigateToParent={handleNavigateToParent}
            parentGroupConversation={forumParentConversation as unknown as ConversationItem}
            onEnterSubGroup={handleEnterSubGroup}
          />
        );
      }

      if (isNewGroupOpen) {
        return (
          <NewGroupScreen
            onBack={handleBackFromNewGroup}
            onSelectChat={handleSelectFromNewGroup}
          />
        );
      }

      if (isNewChatOpen) {
        return (
          <NewChatScreen
            onBack={handleBackFromNewChat}
            onSelectChat={handleSelectFromNewChat}
            onNavigateToNewGroup={handleNavigateToNewGroup}
          />
        );
      }

      return (
        <RecentChatsScreen
          onSelectChat={(chat) => setActiveConversation(chat)}
          onStartNewChat={() => setIsNewChatOpen(true)}
        />
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
      <SessionAlertModal
        visible={!!sessionReplacedMessage}
        message={sessionReplacedMessage}
        onDismiss={handleDismissSessionAlert}
      />

      {/* Global E2EE Key Conflict Resolution Modal (HTTP 409) */}
      <KeyConflictModal
        visible={e2eeStatus === 'conflict'}
        onConfirmReset={resetE2EEKeys}
        onOpenDeviceTransfer={() => setIsKeyTransferModalOpen(true)}
        onCancel={handleCancelKeyConflict}
      />

      {/* Global E2EE Key Transfer Modal */}
      <DeviceTransferModal
        visible={isKeyTransferModalOpen}
        initialMode="scan"
        onClose={() => setIsKeyTransferModalOpen(false)}
      />

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
          <CallProvider>
            <AppNavigator />
          </CallProvider>
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
