/**
 * WuzzChat Mobile UI - RecentChatsScreen
 * WhatsApp-Grade Recent Conversations Screen with Pull-to-Refresh & Live WebSocket updates.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { conversationsApi } from '../api/conversations';
import { getUserPublicKey } from '../api/users';
import { Conversation } from '../api/types';
import { Avatar } from '../components/Avatar';
import { ChatListItem } from '../components/ChatListItem';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { DeviceTransferModal } from '../components/DeviceTransferModal';
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
  const insets = useSafeAreaInsets();
  const { user, logout, e2eeKeyPair } = useAuth();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isDeviceTransferModalOpen, setIsDeviceTransferModalOpen] = useState<boolean>(false);
  const [wsState, setWsState] = useState<ConnectionState>(websocketClient.getState());

  // Search & filter tab state (DESIGN.md Section 3: Layar 1)
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [activeFilter, setActiveFilter] = useState<'all' | 'unread' | 'groups'>('all');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim().toLowerCase());
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

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

  // Tab counts for badges
  const unreadCount = useMemo(() => {
    return conversations.filter((c) => Number(c.unread_count || 0) > 0).length;
  }, [conversations]);

  const groupsCount = useMemo(() => {
    return conversations.filter(
      (c) =>
        c.is_group === true ||
        c.type === 'group' ||
        c.type === 'subgroup' ||
        (typeof c.id === 'string' && (c.id.startsWith('grp_') || c.id.startsWith('sub_')))
    ).length;
  }, [conversations]);

  // Real-time filtered conversations (Filter Tabs + Debounced Search)
  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      // 1. Tab category filter
      if (activeFilter === 'unread') {
        const unread = Number(c.unread_count || 0);
        if (unread <= 0) return false;
      } else if (activeFilter === 'groups') {
        const isGroup =
          c.is_group === true ||
          c.type === 'group' ||
          c.type === 'subgroup' ||
          (typeof c.id === 'string' && (c.id.startsWith('grp_') || c.id.startsWith('sub_')));
        if (!isGroup) return false;
      }

      // 2. Debounced search query
      if (debouncedQuery) {
        const title = (c.title || c.peer_nickname || c.name || '').toLowerCase();
        const snippet = (
          typeof c.last_message === 'string'
            ? c.last_message
            : c.last_message?.content || ''
        ).toLowerCase();
        const participantMatch = c.participants?.some(
          (p) =>
            p.username?.toLowerCase().includes(debouncedQuery) ||
            p.display_name?.toLowerCase().includes(debouncedQuery)
        );

        if (!title.includes(debouncedQuery) && !snippet.includes(debouncedQuery) && !participantMatch) {
          return false;
        }
      }

      return true;
    });
  }, [conversations, activeFilter, debouncedQuery]);

  const handleProfilePress = () => {
    if (!user) return;
    Alert.alert(
      user.display_name || user.username || 'Profil Pengguna',
      `Masuk sebagai @${user.username || 'user'}\nID: ${user.id || '-'}`,
      [
        { text: 'Tutup', style: 'cancel' },
        {
          text: 'Keluar Akun',
          style: 'destructive',
          onPress: logout,
        },
      ]
    );
  };

  const renderEmptyState = () => {
    if (debouncedQuery) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>🔍</Text>
          <Text style={styles.emptyTitle}>Tidak Ada Hasil</Text>
          <Text style={styles.emptySubtitle}>
            Tidak ada obrolan yang cocok dengan &quot;{searchQuery}&quot;. Periksa kembali kata kunci atau ejaan Anda.
          </Text>
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={() => setSearchQuery('')}
            activeOpacity={0.8}
          >
            <Text style={styles.clearFilterBtnText}>Hapus Pencarian</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeFilter === 'unread') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>Semua Sudah Dibaca</Text>
          <Text style={styles.emptySubtitle}>
            Bagus! Tidak ada obrolan dengan pesan baru yang belum Anda baca.
          </Text>
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={styles.clearFilterBtnText}>Lihat Semua Chat</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeFilter === 'groups') {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>👥</Text>
          <Text style={styles.emptyTitle}>Belum Ada Grup</Text>
          <Text style={styles.emptySubtitle}>
            Anda belum bergabung atau memiliki obrolan grup percakapan.
          </Text>
          {onStartNewChat && (
            <TouchableOpacity
              style={styles.startChatBtn}
              onPress={onStartNewChat}
              activeOpacity={0.8}
            >
              <Text style={styles.startChatBtnText}>+ Buat Obrolan Baru</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
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
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Brand Header */}
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
            onPress={() => setIsDeviceTransferModalOpen(true)}
            activeOpacity={0.7}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Tautkan Perangkat"
          >
            <Text style={styles.headerIconText}>💻</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setIsNotificationModalOpen(true)}
            activeOpacity={0.7}
            style={styles.headerIconButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Notifikasi"
          >
            <Text style={styles.headerIconText}>🔔</Text>
          </TouchableOpacity>

          {user && (
            <TouchableOpacity
              onPress={handleProfilePress}
              activeOpacity={0.8}
              style={styles.avatarButton}
              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
              accessibilityLabel="Profil Pengguna"
            >
              <Avatar name={user.display_name || user.username} size={36} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Search Bar (Debounced) - DESIGN.md Section 3 */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputWrapper}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Cari obrolan atau kontak..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            returnKeyType="search"
            autoCapitalize="none"
            autoCorrect={false}
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity
              onPress={() => setSearchQuery('')}
              style={styles.clearSearchButton}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityLabel="Hapus pencarian"
            >
              <Text style={styles.clearSearchIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Filter Tabs (Semua, Belum Dibaca, Grup) - DESIGN.md Section 3 */}
      <View style={styles.filterTabsContainer}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'all' && styles.filterChipTextActive,
            ]}
          >
            Semua
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'unread' && styles.filterChipActive]}
          onPress={() => setActiveFilter('unread')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'unread' && styles.filterChipTextActive,
            ]}
          >
            Belum Dibaca
          </Text>
          {unreadCount > 0 && (
            <View style={styles.filterBadge}>
              <Text style={styles.filterBadgeText}>{unreadCount}</Text>
            </View>
          )}
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'groups' && styles.filterChipActive]}
          onPress={() => setActiveFilter('groups')}
          activeOpacity={0.7}
        >
          <Text
            style={[
              styles.filterChipText,
              activeFilter === 'groups' && styles.filterChipTextActive,
            ]}
          >
            Grup
          </Text>
          {groupsCount > 0 && (
            <View style={styles.filterCountTag}>
              <Text style={styles.filterCountTagText}>{groupsCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* Main Conversation List */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Memuat obrolan...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredConversations}
          keyExtractor={(item, index) => item.id || item.room_id || String(index)}
          renderItem={({ item }) => (
            <ChatListItem
              conversation={item}
              onPress={handleChatPress}
              onLongPress={handleChatLongPress}
            />
          )}
          contentContainerStyle={[
            styles.listContent,
            { paddingBottom: Math.max(insets.bottom + 88, 100) },
          ]}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={() => fetchConversations(true)}
              tintColor={colors.accentPrimary}
              colors={[colors.accentPrimary]}
            />
          }
          ListEmptyComponent={renderEmptyState}
        />
      )}

      {/* WhatsApp Floating Action Button (FAB) */}
      {onStartNewChat && (
        <TouchableOpacity
          style={[
            styles.fab,
            { bottom: Math.max(insets.bottom + spacing.lg, spacing.xl) },
          ]}
          onPress={onStartNewChat}
          activeOpacity={0.8}
          accessibilityLabel="Mulai Chat Baru"
        >
          <Text style={styles.fabIcon}>💬</Text>
        </TouchableOpacity>
      )}

      {/* Push Notification Preferences & Diagnostics Modal */}
      <NotificationSettingsModal
        visible={isNotificationModalOpen}
        onClose={() => setIsNotificationModalOpen(false)}
      />

      {/* Multi-Device QR Code E2EE Key Transfer Modal */}
      <DeviceTransferModal
        visible={isDeviceTransferModalOpen}
        initialMode="share"
        onClose={() => setIsDeviceTransferModalOpen(false)}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
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
    gap: spacing.sm,
  },
  headerIconButton: {
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    justifyContent: 'center',
    alignItems: 'center',
    width: 40,
    height: 40,
  },
  headerIconText: {
    fontSize: 18,
  },
  avatarButton: {
    borderRadius: radius.full,
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
  },
  searchBarContainer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    backgroundColor: colors.bgBase,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
    color: colors.textMuted,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: 0,
    height: '100%',
  },
  clearSearchButton: {
    padding: spacing.xs,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearSearchIcon: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: 'bold',
  },
  filterTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.bgBase,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    minHeight: 34,
  },
  filterChipActive: {
    backgroundColor: colors.tintAccent20,
    borderColor: colors.borderFocus,
  },
  filterChipText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: colors.unreadBadgeBg,
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  filterCountTag: {
    marginLeft: 6,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.full,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 0.5,
    borderColor: colors.borderDefault,
  },
  filterCountTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  listContent: {
    flexGrow: 1,
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
    paddingTop: 80,
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
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
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
  clearFilterBtn: {
    marginTop: spacing.lg,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  clearFilterBtnText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
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


