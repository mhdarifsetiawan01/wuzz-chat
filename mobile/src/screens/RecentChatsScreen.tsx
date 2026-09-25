/**
 * WuzzChat Mobile UI - RecentChatsScreen
 * WhatsApp-Grade Recent Conversations Screen with Pull-to-Refresh & Live WebSocket updates.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversationsApi } from '../api/conversations';
import { Conversation } from '../api/types';
import { Avatar, ChatListItem, SessionAlertModal } from '../components';
import { useAuth } from '../context';
import { ConnectionState, websocketClient } from '../services/websocket';
import { colors, radius, spacing, typography } from '../theme';

export interface RecentChatsScreenProps {
  onSelectChat?: (conversation: Conversation) => void;
  onStartNewChat?: () => void;
}

export const RecentChatsScreen: React.FC<RecentChatsScreenProps> = ({ onSelectChat, onStartNewChat }) => {
  const { user, logout, sessionReplacedMessage, dismissSessionAlert } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [wsState, setWsState] = useState<ConnectionState>(websocketClient.getState());

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await conversationsApi.getConversations();
      setConversations(data || []);
    } catch (err) {
      console.warn('[RecentChatsScreen] Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchConversations();

    // Subscribe to WebSocket state
    const unsubscribeWs = websocketClient.onStateChange((state) => {
      setWsState(state);
    });

    // Refresh conversation list on incoming message or system notification
    const unsubscribeMsg = websocketClient.on('message', () => {
      fetchConversations(true);
    });

    return () => {
      unsubscribeWs();
      unsubscribeMsg();
    };
  }, [fetchConversations]);

  const handleChatPress = (chat: Conversation) => {
    if (onSelectChat) {
      onSelectChat(chat);
    }
  };

  const getStatusText = () => {
    switch (wsState) {
      case 'connected':
        return 'Terhubung';
      case 'reconnecting':
        return 'Menghubungkan ulang...';
      case 'connecting':
        return 'Menghubungkan...';
      case 'terminated':
        return 'Sesi tidak aktif';
      default:
        return 'Offline';
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* WhatsApp Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.brandTitle}>WuzzChat</Text>
          <View style={styles.statusRow}>
            <View
              style={[
                styles.statusDot,
                wsState === 'connected' ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
            <Text style={styles.statusText}>{getStatusText()}</Text>
          </View>
        </View>

        <View style={styles.headerRight}>
          {onStartNewChat && (
            <TouchableOpacity
              onPress={onStartNewChat}
              activeOpacity={0.7}
              style={styles.headerIconButton}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.headerIconText}>✏️</Text>
            </TouchableOpacity>
          )}
          {user && (
            <View style={styles.userProfileWrapper}>
              <Avatar name={user.display_name || user.username} size={36} />
              <TouchableOpacity
                onPress={logout}
                activeOpacity={0.7}
                style={styles.logoutButton}
              >
                <Text style={styles.logoutText}>Keluar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>

      {/* Main Conversation List */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Memuat obrolan...</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item, index) => item.id || item.room_id || String(index)}
          renderItem={({ item }) => (
            <ChatListItem conversation={item} onPress={handleChatPress} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchConversations(true)}
              tintColor={colors.accentPrimary}
              colors={[colors.accentPrimary]}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>💬</Text>
              <Text style={styles.emptyTitle}>Belum Ada Obrolan</Text>
              <Text style={styles.emptySubtitle}>
                Daftar kontak dan pesan baru Anda akan muncul di sini. Tarik ke bawah untuk memuat ulang.
              </Text>
              {onStartNewChat && (
                <TouchableOpacity
                  style={styles.startChatBtn}
                  onPress={onStartNewChat}
                  activeOpacity={0.8}
                >
                  <Text style={styles.startChatBtnText}>+ Mulai Chat Baru</Text>
                </TouchableOpacity>
              )}
            </View>
          }
        />
      )}

      {/* WhatsApp Floating Action Button (FAB) */}
      {onStartNewChat && (
        <TouchableOpacity
          style={styles.fab}
          onPress={onStartNewChat}
          activeOpacity={0.8}
        >
          <Text style={styles.fabIcon}>💬</Text>
        </TouchableOpacity>
      )}

      {/* Close Code 4001 Terminal Guard Modal */}
      <SessionAlertModal
        visible={!!sessionReplacedMessage}
        message={sessionReplacedMessage}
        onDismiss={dismissSessionAlert}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  headerLeft: {
    flexDirection: 'column',
  },
  brandTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radius.full,
    marginRight: 6,
  },
  statusDotOnline: {
    backgroundColor: colors.colorOnline,
  },
  statusDotOffline: {
    backgroundColor: colors.textMuted,
  },
  statusText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userProfileWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logoutButton: {
    marginLeft: spacing.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
  },
  logoutText: {
    ...typography.captionBold,
    color: colors.colorError,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 100,
    paddingHorizontal: spacing.xxl,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },
  headerIconButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    width: 36,
    height: 36,
  },
  headerIconText: {
    fontSize: 16,
  },
  startChatBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
  },
  startChatBtnText: {
    ...typography.button,
    color: colors.textOnAccent,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    bottom: spacing.xl,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 5,
  },
  fabIcon: {
    fontSize: 26,
    color: colors.textOnAccent,
  },
});

