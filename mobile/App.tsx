/**
 * WuzzChat Mobile App Entry Point
 * Expo Managed Workflow (React Native + TypeScript)
 */

import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, DeviceProvider, useAuth } from './src/context';
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
import { colors, spacing, typography } from './src/theme';

type AuthRoute = 'login' | 'register';

function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authRoute, setAuthRoute] = useState<AuthRoute>('login');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState<boolean>(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState<boolean>(false);
  const [activeGroupInfo, setActiveGroupInfo] = useState<GroupDetails | ConversationItem | null>(null);

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
      if (activeConversation) {
        setActiveConversation(null);
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
  }, [activeGroupInfo, isNewGroupOpen, activeConversation, isNewChatOpen]);

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
    setActiveConversation(null);
  }, []);

  const handleOpenGroupInfo = useCallback((grp: GroupDetails | ConversationItem) => {
    setActiveGroupInfo(grp);
  }, []);

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
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <DeviceProvider>
        <AuthProvider>
          <AppNavigator />
        </AuthProvider>
      </DeviceProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
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
