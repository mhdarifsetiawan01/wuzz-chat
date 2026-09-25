/**
 * WuzzChat Mobile UI - RecentChatsScreen
 * WhatsApp-Grade Recent Conversations Screen with Pull-to-Refresh & Live WebSocket updates.
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { conversationsApi } from '../api/conversations';
import { getUserPublicKey } from '../api/users';
import { Conversation } from '../api/types';
import { Avatar } from '../components/Avatar';
import { ChatListItem } from '../components/ChatListItem';
import { SessionAlertModal } from '../components/SessionAlertModal';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { useAuth } from '../context';
import { ConnectionState, websocketClient } from '../services/websocket';
import {
  cachePeerPublicKey,
  getCachedPeerPublicKey,
  decryptSnippet,
  isEncryptedMessage,
} from '../services/crypto';
import { colors, radius, spacing, typography } from '../theme';

export interface RecentChatsScreenProps {
  onSelectChat?: (conversation: Conversation) => void;
  onStartNewChat?: () => void;
}

export const RecentChatsScreen: React.FC<RecentChatsScreenProps> = ({ onSelectChat, onStartNewChat }) => {
  const { user, logout, sessionReplacedMessage, dismissSessionAlert, e2eeKeyPair } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [wsState, setWsState] = useState<ConnectionState>(websocketClient.getState());

  const fetchConversations = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }

    try {
      const data = await conversationsApi.getConversations();
      if (!data) {
        setConversations([]);
        return;
      }

      // Decrypt last_message for direct E2EE chats if keypair is available
      const decryptedData = await Promise.all(
        data.map(async (c) => {
          const raw =
            typeof c.last_message === 'string'
              ? c.last_message
              : c.last_message?.content;

          if (!raw || !isEncryptedMessage(raw) || !user?.id || !e2eeKeyPair?.privateKeyHex) {
            return c;
          }

          // 1. Resolve Peer ID for direct conversation
          let peerId = c.peer_id || '';
          if (!peerId && c.id && c.id.startsWith('dm_')) {
            const parts = c.id.replace(/^dm_/, '').split('_');
            peerId = parts[0] === user.id ? parts[1] : parts[0];
          }
          if (!peerId && c.participants?.length) {
            const other = c.participants.find((p) => p.id !== user.id);
            peerId = other?.id || '';
          }

          if (!peerId) {
            return c;
          }

          // 2. Resolve Peer Public Key (cache-first to prevent network spam)
          let peerPub = c.peer_public_key || getCachedPeerPublicKey(peerId);
          if (!peerPub) {
            try {
              peerPub = (await getUserPublicKey(peerId)) || undefined;
              if (peerPub) {
                cachePeerPublicKey(peerId, peerPub);
              }
            } catch {
              // ignore fetch failure
            }
          } else {
            cachePeerPublicKey(peerId, peerPub);
          }

          if (!peerPub) {
            return c;
          }

          // 3. Decrypt snippet using cached/derived AES key
          const plain = decryptSnippet(raw, c.id, peerPub, e2eeKeyPair.privateKeyHex);

          if (typeof c.last_message === 'object' && c.last_message !== null) {
            return {
              ...c,
              last_message: {
                ...c.last_message,
                content: plain,
              },
            };
          } else {
            return {
              ...c,
              last_message: plain,
            };
          }
        })
      );

      // Prioritize pinned chats at the top, then sort by latest activity
      const sorted = [...decryptedData].sort((a, b) => {
        const aPinned = a.is_pinned || a.pinned ? 1 : 0;
        const bPinned = b.is_pinned || b.pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;

        const aTime = new Date(
          a.updated_at ||
            (typeof a.last_message === 'object' ? a.last_message?.timestamp || a.last_message?.created_at : undefined) ||
            0
        ).getTime();
        const bTime = new Date(
          b.updated_at ||
            (typeof b.last_message === 'object' ? b.last_message?.timestamp || b.last_message?.created_at : undefined) ||
            0
        ).getTime();
        return bTime - aTime;
      });

      setConversations(sorted);
    } catch (err) {
      console.warn('[RecentChatsScreen] Failed to load conversations:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [user?.id, e2eeKeyPair?.privateKeyHex]);

  const handleChatLongPress = useCallback((chat: Conversation) => {
    const roomId = chat.id || chat.room_id || '';
    if (!roomId) return;
    const isPinned = Boolean(chat.is_pinned || chat.pinned);
    const title = chat.title || chat.peer_nickname || chat.name || 'Obrolan';

    Alert.alert(
      title,
      isPinned ? 'Lepas sematan obrolan ini dari daftar teratas?' : 'Sematkan obrolan ini di daftar teratas?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: isPinned ? 'Lepas Sematan' : 'Sematkan 📌',
          onPress: async () => {
            // Optimistic local update
            setConversations((prev) => {
              const updated = prev.map((c) =>
                (c.id === roomId || c.room_id === roomId)
                  ? { ...c, is_pinned: !isPinned, pinned: !isPinned }
                  : c
              );
              return [...updated].sort((a, b) => {
                const aPinned = a.is_pinned || a.pinned ? 1 : 0;
                const bPinned = b.is_pinned || b.pinned ? 1 : 0;
                if (aPinned !== bPinned) return bPinned - aPinned;
                const aTime = new Date(a.updated_at || 0).getTime();
                const bTime = new Date(b.updated_at || 0).getTime();
                return bTime - aTime;
              });
            });

            try {
              if (isPinned) {
                await conversationsApi.unpinConversation(roomId);
              } else {
                await conversationsApi.pinConversation(roomId);
              }
            } catch (err: any) {
              console.error('[RecentChatsScreen] Failed to toggle pin:', err);
              Alert.alert('Gagal', err?.message || 'Gagal mengubah status sematan obrolan.');
              fetchConversations(true);
            }
          },
        },
      ]
    );
  }, [fetchConversations]);

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
          <TouchableOpacity
            onPress={() => setIsNotificationModalOpen(true)}
            activeOpacity={0.7}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.headerIconText}>🔔</Text>
          </TouchableOpacity>

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
            <ChatListItem
              conversation={item}
              onPress={handleChatPress}
              onLongPress={handleChatLongPress}
            />
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

      {/* Push Notification Preferences & Diagnostics Modal */}
      <NotificationSettingsModal
        visible={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
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

