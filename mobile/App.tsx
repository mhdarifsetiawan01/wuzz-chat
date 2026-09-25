/**
 * WuzzChat Mobile App Entry Point
 * Expo Managed Workflow (React Native + TypeScript)
 */

import { StatusBar } from 'expo-status-bar';
import React, { useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { AuthProvider, DeviceProvider, useAuth } from './src/context';
import { ChatScreen, LoginScreen, NewChatScreen, RecentChatsScreen, RegisterScreen } from './src/screens';
import { Conversation, ConversationItem } from './src/api/types';
import { colors, spacing, typography } from './src/theme';

type AuthRoute = 'login' | 'register';

function AppNavigator() {
  const { isAuthenticated, isLoading } = useAuth();
  const [authRoute, setAuthRoute] = useState<AuthRoute>('login');
  const [activeConversation, setActiveConversation] = useState<Conversation | null>(null);
  const [isNewChatOpen, setIsNewChatOpen] = useState<boolean>(false);

  // Hardware back button support for Android
  React.useEffect(() => {
    const onBackPress = () => {
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
  }, [activeConversation, isNewChatOpen]);

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
    if (activeConversation) {
      return (
        <ChatScreen
          conversation={activeConversation as unknown as ConversationItem}
          onBack={() => setActiveConversation(null)}
        />
      );
    }

    if (isNewChatOpen) {
      return (
        <NewChatScreen
          onBack={() => setIsNewChatOpen(false)}
          onSelectChat={(chat) => {
            setIsNewChatOpen(false);
            setActiveConversation(chat);
          }}
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
