/**
 * WuzzChat Mobile UI - RecentChatsScreen
 * WhatsApp-Grade Recent Conversations Screen with Pull-to-Refresh & Live WebSocket updates.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { Conversation } from '../api/types';
import { Avatar } from '../components/Avatar';
import { ChatListItem } from '../components/ChatListItem';
import { NotificationSettingsModal } from '../components/NotificationSettingsModal';
import { DeviceTransferModal } from '../components/DeviceTransferModal';
import { BottomSheetModal, ActionMenuItem } from '../components/BottomSheetModal';
import { useAuth, useConversations } from '../context';
import { useFavoriteChats } from '../hooks/useFavoriteChats';
import { ConnectionState, websocketClient } from '../services/websocket';
import { colors, radius, spacing, typography } from '../theme';
import { fabStyle, getFabBottom } from '../theme/fab';
import { IconText } from '../components/IconText';
import { Icon } from '../components/Icon';
import { showAlert } from '../services/dialog';

export interface RecentChatsScreenProps {
  onSelectChat?: (conversation: Conversation) => void;
  onStartNewChat?: () => void;
  onStartNewGroup?: () => void;
}

export const RecentChatsScreen: React.FC<RecentChatsScreenProps> = ({
  onSelectChat,
  onStartNewChat,
  onStartNewGroup,
}) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const {
    conversations,
    isLoading,
    isRefreshing,
    refreshConversations,
    updateConversationPin,
    markConversationAsRead,
  } = useConversations();
  const { favoriteIds, toggleFavorite, maxFavorites } = useFavoriteChats(user?.id);
  const [isNotificationModalOpen, setIsNotificationModalOpen] = useState<boolean>(false);
  const [isDeviceTransferModalOpen, setIsDeviceTransferModalOpen] = useState<boolean>(false);
  const [chatMenuTarget, setChatMenuTarget] = useState<Conversation | null>(null);
  const [isActionMenuOpen, setIsActionMenuOpen] = useState<boolean>(false);
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

  const handleChatLongPress = useCallback((chat: Conversation) => {
    if (!(chat.id || chat.room_id)) return;
    setChatMenuTarget(chat);
  }, []);

  const handleToggleFavoriteFromMenu = useCallback(() => {
    const roomId = chatMenuTarget?.id || chatMenuTarget?.room_id;
    setChatMenuTarget(null);
    if (roomId) toggleFavorite(roomId);
  }, [chatMenuTarget, toggleFavorite]);

  const handleTogglePinFromMenu = useCallback(async () => {
    const chat = chatMenuTarget;
    const roomId = chat?.id || chat?.room_id;
    setChatMenuTarget(null);
    if (!chat || !roomId) return;
    try {
      await updateConversationPin(roomId, !(chat.is_pinned || chat.pinned));
    } catch (err: any) {
      showAlert('Gagal', err?.message || 'Gagal mengubah status sematan obrolan.');
    }
  }, [chatMenuTarget, updateConversationPin]);

  useEffect(() => {
    // Stale-While-Revalidate: revalidate silently if conversations already present in context
    if (conversations.length > 0) {
      refreshConversations(true);
    } else {
      refreshConversations(false);
    }

    // Subscribe to WebSocket connection state banner
    const unsubscribeWs = websocketClient.onStateChange((state) => {
      setWsState(state);
    });

    return () => {
      unsubscribeWs();
    };
  }, []);

  // Revalidate conversations silently whenever RecentChatsScreen regains focus (e.g. returning from ChatScreen)
  useFocusEffect(
    useCallback(() => {
      refreshConversations(true);
    }, [refreshConversations])
  );

  const handleChatPress = useCallback(
    (chat: Conversation) => {
      const roomId = chat.id || chat.room_id;
      if (roomId) {
        markConversationAsRead(roomId);
      }
      if (onSelectChat) {
        onSelectChat(chat);
      }
    },
    [markConversationAsRead, onSelectChat]
  );

  const renderChatItem = useCallback(
    ({ item }: { item: Conversation }) => (
      <ChatListItem
        conversation={item}
        onPress={handleChatPress}
        onLongPress={handleChatLongPress}
      />
    ),
    [handleChatPress, handleChatLongPress]
  );

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

  const favoriteContacts = useMemo(() => {
    const byId = new Map<string, Conversation>();
    conversations.forEach((c) => {
      const id = c.id || c.room_id;
      if (id) byId.set(id, c);
    });
    // Urutan mengikuti waktu ditambahkan; id yang percakapannya sudah tak ada dilewati.
    return favoriteIds.flatMap((id) => {
      const c = byId.get(id);
      if (!c) return [];
      const title = c.title || c.peer_nickname || c.name || 'Chat';
      return [
        {
          id,
          name: title.trim().split(/\s+/)[0],
          fullName: title,
          avatarUrl: c.avatar_url || c.peer_avatar_url,
          unreadCount: c.unread_count ?? 0,
          conversation: c,
        },
      ];
    });
  }, [conversations, favoriteIds]);

  const handleFavoriteContactPress = useCallback(
    (item: (typeof favoriteContacts)[number]) => {
      handleChatPress(item.conversation);
    },
    [handleChatPress]
  );

  const handleFavoriteContactLongPress = useCallback(
    (item: (typeof favoriteContacts)[number]) => setChatMenuTarget(item.conversation),
    []
  );

  const handleConfirmLogout = () => {
    setIsActionMenuOpen(false);
    showAlert(
      'Keluar Akun',
      'Apakah Anda yakin ingin keluar dari akun ini? Kunci E2EE tetap tersimpan dengan aman di perangkat ini.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
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
          <IconText style={styles.emptyIcon}>🔍</IconText>
          <Text style={styles.emptyTitle}>Tidak Ada Hasil</Text>
          <Text style={styles.emptySubtitle}>
            Tidak ada obrolan yang cocok dengan &quot;{searchQuery}&quot;. Periksa ejaan atau coba kata kunci lain.
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
          <IconText style={styles.emptyIcon}>✅</IconText>
          <Text style={styles.emptyTitle}>Semua Sudah Dibaca</Text>
          <Text style={styles.emptySubtitle}>
            Tidak ada obrolan yang belum dibaca.
          </Text>
          <TouchableOpacity
            style={styles.clearFilterBtn}
            onPress={() => setActiveFilter('all')}
            activeOpacity={0.8}
          >
            <Text style={styles.clearFilterBtnText}>Tampilkan Semua Obrolan</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (activeFilter === 'groups') {
      return (
        <View style={styles.emptyContainer}>
          <IconText style={styles.emptyIcon}>👥</IconText>
          <Text style={styles.emptyTitle}>Belum Ada Grup</Text>
          <Text style={styles.emptySubtitle}>
            Anda belum bergabung atau membuat grup.
          </Text>
          {onStartNewGroup && (
            <TouchableOpacity
              style={styles.startChatBtn}
              onPress={onStartNewGroup}
              activeOpacity={0.85}
            >
              <Text style={styles.startChatBtnText}>+ Grup Baru</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View style={styles.emptyContainer}>
        <IconText style={styles.emptyIcon}>💬</IconText>
        <Text style={styles.emptyTitle}>Belum Ada Pesan</Text>
        <Text style={styles.emptySubtitle}>
          Obrolan dan kontak terbaru Anda akan tampil di sini.
        </Text>
        {onStartNewChat && (
          <TouchableOpacity
            style={styles.startChatBtn}
            onPress={onStartNewChat}
            activeOpacity={0.85}
          >
            <Text style={styles.startChatBtnText}>+ Mulai Obrolan</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Clean Top Header — Reference Image 1 */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>
            <Text style={{ color: colors.accentPrimary }}>Wuzz</Text>
            <Text style={{ color: '#f59e0b' }}>Chat</Text>
          </Text>
          <View style={styles.statusDotIndicator}>
            <View
              style={[
                styles.statusDot,
                wsState === 'connected' ? styles.statusDotOnline : styles.statusDotOffline,
              ]}
            />
          </View>
        </View>

        <View style={styles.headerRightActions}>
          <TouchableOpacity
            onPress={() => setIsActionMenuOpen(true)}
            activeOpacity={0.7}
            style={styles.headerActionButton}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Menu"
          >
            <IconText style={styles.headerActionIcon}>⋮</IconText>
          </TouchableOpacity>
        </View>
      </View>

      {/* Clean Search Input */}
      <View style={styles.searchBarContainer}>
        <View style={styles.searchInputWrapper}>
          <Icon name="search" size={18} color={colors.textMuted} style={{ marginRight: 8 }} />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari pesan..."
            placeholderTextColor="#94a3b8"
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
              <Icon name="close" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Kontak Favorit — dipilih pengguna lewat tekan-tahan di daftar obrolan (disimpan lokal) */}
      <View style={styles.favoritesSection}>
        <Text style={styles.favoritesSectionTitle}>KONTAK FAVORIT</Text>
        {favoriteContacts.length === 0 ? (
          <Text style={styles.favoritesEmptyHint}>
            Tekan-tahan sebuah obrolan lalu pilih Favorit untuk menaruhnya di sini.
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.favoritesScrollContent}
          >
            {favoriteContacts.map((contact) => (
              <TouchableOpacity
                key={contact.id}
                style={styles.favoriteCard}
                onPress={() => handleFavoriteContactPress(contact)}
                onLongPress={() => handleFavoriteContactLongPress(contact)}
                activeOpacity={0.75}
              >
                <Avatar
                  name={contact.fullName || contact.name}
                  avatarUrl={contact.avatarUrl}
                  size={44}
                  shape="circle"
                  unreadCount={contact.unreadCount}
                />
                <Text style={styles.favoriteCardName} numberOfLines={1}>
                  {contact.name}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Filter Tabs (All, Unread, Groups) */}
      <View style={styles.filterTabsContainer}>
        <TouchableOpacity
          style={[styles.filterChip, activeFilter === 'all' && styles.filterChipActive]}
          onPress={() => setActiveFilter('all')}
          activeOpacity={0.75}
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
          activeOpacity={0.75}
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
          activeOpacity={0.75}
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

      {/* Main Conversation List (Pure White Rows with subtle dividers) */}
      {isLoading && !isRefreshing ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Loading messages...</Text>
        </View>
      ) : (
        <View style={styles.listWrapper}>
          <FlatList
            data={filteredConversations}
            keyExtractor={(item, index) => item.id || item.room_id || String(index)}
            renderItem={renderChatItem}
            initialNumToRender={12}
            maxToRenderPerBatch={8}
            windowSize={9}
            removeClippedSubviews
            contentContainerStyle={[
              styles.listContent,
              { paddingBottom: Math.max(insets.bottom + 88, 100) },
            ]}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => refreshConversations(false)}
                tintColor={colors.accentPrimary}
                colors={[colors.accentPrimary]}
              />
            }
            ListEmptyComponent={renderEmptyState}
          />
        </View>
      )}

      {/* Menu obrolan (tekan-tahan): favorit & sematan */}
      {(() => {
        const roomId = chatMenuTarget?.id || chatMenuTarget?.room_id || '';
        const isFavorite = favoriteIds.includes(roomId);
        const isPinned = Boolean(chatMenuTarget?.is_pinned || chatMenuTarget?.pinned);
        const isFull = !isFavorite && favoriteIds.length >= maxFavorites;
        return (
          <BottomSheetModal
            visible={chatMenuTarget !== null}
            onClose={() => setChatMenuTarget(null)}
            title={
              chatMenuTarget?.title ||
              chatMenuTarget?.peer_nickname ||
              chatMenuTarget?.name ||
              'Obrolan'
            }
          >
            <View style={styles.actionMenuList}>
              <ActionMenuItem
                icon="⭐"
                label={isFavorite ? 'Hapus dari Favorit' : 'Tambah ke Favorit'}
                subtitle={
                  isFull
                    ? `Batas ${maxFavorites} favorit tercapai, hapus salah satu dulu`
                    : isFavorite
                      ? 'Keluarkan dari bar Kontak Favorit'
                      : 'Tampilkan di bar Kontak Favorit'
                }
                onPress={isFull ? () => {} : handleToggleFavoriteFromMenu}
              />
              <ActionMenuItem
                icon="📌"
                label={isPinned ? 'Lepas Sematan' : 'Sematkan Obrolan'}
                subtitle={
                  isPinned ? 'Kembalikan ke urutan biasa' : 'Taruh di daftar teratas'
                }
                onPress={handleTogglePinFromMenu}
              />
            </View>
          </BottomSheetModal>
        );
      })()}

      {/* Aurora Action Bottom Sheet Menu */}
      <BottomSheetModal
        visible={isActionMenuOpen}
        onClose={() => setIsActionMenuOpen(false)}
        title="Menu & Akun"
      >
        {user && (
          <View style={styles.actionProfileCard}>
            <Avatar name={user.display_name || user.username} size={48} />
            <View style={styles.actionProfileInfo}>
              <Text style={styles.actionProfileName} numberOfLines={1}>
                {user.display_name || user.username}
              </Text>
              <Text style={styles.actionProfileUsername}>@{user.username || 'user'}</Text>
              <View style={styles.actionE2eeBadge}>
                <IconText style={styles.actionE2eeText}>🛡️ E2EE Terenkripsi Aktif</IconText>
              </View>
            </View>
          </View>
        )}

        <View style={styles.actionMenuList}>
          {onStartNewGroup && (
            <ActionMenuItem
              icon="👥"
              label="Buat Grup Baru"
              subtitle="Mulai percakapan grup terenkripsi"
              onPress={() => {
                setIsActionMenuOpen(false);
                onStartNewGroup();
              }}
            />
          )}

          <ActionMenuItem
            icon="💻"
            label="Tautkan Perangkat"
            subtitle="Pindai QR untuk sinkronisasi perangkat"
            onPress={() => {
              setIsActionMenuOpen(false);
              setIsDeviceTransferModalOpen(true);
            }}
          />

          <ActionMenuItem
            icon="🔔"
            label="Notifikasi & Suara"
            subtitle="Preferensi pemberitahuan & push FCM"
            onPress={() => {
              setIsActionMenuOpen(false);
              setIsNotificationModalOpen(true);
            }}
          />

          <ActionMenuItem
            icon="🚪"
            label="Keluar Akun"
            subtitle="Akhiri sesi di perangkat ini"
            destructive
            onPress={handleConfirmLogout}
          />
        </View>
      </BottomSheetModal>

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

      {/* FAB — New Chat Bubble (floating bottom-right, above tab bar) */}
      {onStartNewChat && (
        <TouchableOpacity
          style={[
            styles.fab,
            { bottom: getFabBottom(insets.bottom) },
          ]}
          onPress={onStartNewChat}
          activeOpacity={0.82}
          accessibilityLabel="Mulai obrolan baru"
          accessibilityRole="button"
        >
          <IconText style={styles.fabIcon}>💬</IconText>
        </TouchableOpacity>
      )}
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
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 6,
    backgroundColor: colors.bgBase,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
  },
  statusDotIndicator: {
    marginLeft: 8,
    padding: 2,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusDotOnline: {
    backgroundColor: colors.colorOnline,
  },
  statusDotOffline: {
    backgroundColor: colors.textMuted,
  },
  headerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  headerActionIcon: {
    fontSize: 18,
    color: '#475569',
  },
  fab: fabStyle,
  fabIcon: {
    fontSize: 26,
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 12,
    backgroundColor: colors.bgBase,
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eef2f6',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 42,
  },
  searchInput: {
    flex: 1,
    color: colors.textPrimary,
    fontSize: 14,
    paddingVertical: 0,
    height: '100%',
  },
  clearSearchButton: {
    padding: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  favoritesSection: {
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: colors.bgBase,
  },
  favoritesSectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94a3b8',
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  favoritesEmptyHint: {
    fontSize: 12,
    color: '#94a3b8',
    paddingHorizontal: 20,
  },
  favoritesScrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 4,
    gap: 12,
  },
  favoriteCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    width: 72,
    paddingVertical: 10,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    borderWidth: Platform.OS === 'ios' ? 0.5 : 0,
    borderColor: '#edf2f7',
  },
  favoriteCardName: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
    marginTop: 6,
    textAlign: 'center',
  },
  filterTabsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 8,
    gap: 8,
    backgroundColor: colors.bgBase,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 3,
    borderRadius: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minHeight: 24,
  },
  filterChipActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  filterChipTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  filterBadge: {
    marginLeft: 6,
    backgroundColor: '#ffffff',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.accentPrimary,
  },
  filterCountTag: {
    marginLeft: 6,
    backgroundColor: '#edf2f7',
    borderRadius: 10,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterCountTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748b',
  },
  listWrapper: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  listContent: {
    flexGrow: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  loadingText: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 12,
  },
  emptyContainer: {
    flex: 1,
    paddingTop: 60,
    paddingHorizontal: 32,
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 40,
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 6,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 19,
    maxWidth: 280,
  },
  startChatBtn: {
    marginTop: 16,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    backgroundColor: colors.accentPrimary,
  },
  startChatBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#ffffff',
  },
  clearFilterBtn: {
    marginTop: 16,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 18,
    backgroundColor: '#e2e8f0',
  },
  clearFilterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionProfileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: spacing.md,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  actionProfileInfo: {
    marginLeft: spacing.md,
    flex: 1,
  },
  actionProfileName: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  actionProfileUsername: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  actionE2eeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  actionE2eeText: {
    fontSize: 11,
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  actionMenuList: {
    paddingBottom: spacing.sm,
  },
});


