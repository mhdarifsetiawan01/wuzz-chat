/**
 * WuzzChat Mobile UI - FriendsListScreen
 * Milestone M-Mobile-10: Scalable User Connections & Friendlist Engine
 * 
 * Features:
 * - Tab 1: "Teman" with instant SQLite cache rendering, search filter, and cursor-based infinite scroll.
 * - Tab 2: "Permintaan" with incoming/outgoing requests, real-time badge, and 0ms optimistic UI.
 * - Anti-Same-Color Contrast Bug: Fully compliant with WCAG 2.1 AA (dark text on secondary buttons).
 * - Virtualized FlatList with performance safeguards (windowSize=7, maxToRenderPerBatch=10).
 */

import React, { useCallback, useMemo, useState } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { startDirectChat } from '../api/users';
import { ConversationItem, FriendItem, PendingRequestItem } from '../api/types';
import { Avatar } from '../components/Avatar';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { useConnection } from '../context/ConnectionContext';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from '../components/IconText';
import { Icon } from '../components/Icon';

export interface FriendsListScreenProps {
  initialTab?: 'friends' | 'requests';
  onBack: () => void;
  onOpenUserProfile: (userId: string) => void;
  onStartChat: (conversation: ConversationItem) => void;
  onNavigateToNewChat: () => void;
}

export const FriendsListScreen: React.FC<FriendsListScreenProps> = ({
  initialTab = 'friends',
  onBack,
  onOpenUserProfile,
  onStartChat,
  onNavigateToNewChat,
}) => {
  const {
    friends,
    incomingRequests,
    outgoingRequests,
    pendingCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    hasMore,
    refreshFriends,
    loadMoreFriends,
    fetchPendingRequests,
    respondFriendRequest,
    unfriend,
  } = useConnection();

  const [activeTab, setActiveTab] = useState<'friends' | 'requests'>(initialTab);
  const [requestSubTab, setRequestSubTab] = useState<'incoming' | 'outgoing'>('incoming');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actingRequestId, setActingRequestId] = useState<string | null>(null);
  const [startingChatUserId, setStartingChatUserId] = useState<string | null>(null);

  // Filtered friends list by search query
  const filteredFriends = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return friends;
    return friends.filter(
      (f) =>
        f.display_name.toLowerCase().includes(q) ||
        f.username.toLowerCase().includes(q) ||
        (f.bio && f.bio.toLowerCase().includes(q))
    );
  }, [friends, searchQuery]);

  // Handle pull to refresh
  const handleRefresh = useCallback(async () => {
    if (activeTab === 'friends') {
      await refreshFriends();
    } else {
      await fetchPendingRequests();
    }
  }, [activeTab, refreshFriends, fetchPendingRequests]);

  // Handle start chat with a friend
  const handleChatWithFriend = useCallback(
    async (friend: FriendItem) => {
      setStartingChatUserId(friend.id);
      try {
        const res = await startDirectChat(friend.id);
        const conv: ConversationItem = {
          id: res.room_id,
          room_id: res.room_id,
          type: 'direct',
          title: friend.display_name,
          peer_id: friend.id,
          peer_nickname: friend.display_name,
          peer_avatar_url: friend.avatar_url,
          peer_is_verified: friend.is_verified,
        } as ConversationItem;

        onStartChat(conv);
      } catch (err: any) {
        console.warn('[FriendsListScreen] Start chat failed:', err);
        Alert.alert('Gagal Memulai Chat', err?.message || 'Terjadi kesalahan jaringan.');
      } finally {
        setStartingChatUserId(null);
      }
    },
    [onStartChat]
  );

  // Confirm unfriend
  const handleConfirmUnfriend = useCallback(
    (friend: FriendItem) => {
      Alert.alert(
        'Hapus Pertemanan',
        `Apakah kamu yakin ingin menghapus ${friend.display_name} dari daftar teman?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: async () => {
              try {
                await unfriend(friend.id);
              } catch (err: any) {
                Alert.alert('Gagal', err?.message || 'Gagal menghapus pertemanan.');
              }
            },
          },
        ]
      );
    },
    [unfriend]
  );

  // Respond to incoming request
  const handleRespondRequest = useCallback(
    async (req: PendingRequestItem, action: 'accept' | 'decline') => {
      setActingRequestId(req.id);
      try {
        await respondFriendRequest(req.id, action);
      } catch (err: any) {
        Alert.alert(
          action === 'accept' ? 'Gagal Menerima' : 'Gagal Menolak',
          err?.message || 'Terjadi kesalahan sistem.'
        );
      } finally {
        setActingRequestId(null);
      }
    },
    [respondFriendRequest]
  );

  // Render friend item row
  const renderFriendItem = useCallback(
    ({ item }: { item: FriendItem }) => {
      const isChatLoading = startingChatUserId === item.id;

      return (
        <View style={styles.friendRow}>
          <TouchableOpacity
            style={styles.avatarTouchable}
            onPress={() => onOpenUserProfile(item.id)}
            activeOpacity={0.7}
          >
            <Avatar
              name={item.display_name}
              avatarUrl={item.avatar_url}
              size={48}
              shape="circle"
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.friendInfo}
            onPress={() => onOpenUserProfile(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.display_name}
              </Text>
              {item.is_verified && <VerifiedBadge size={15} />}
              {item.is_private_account && (
                <IconText style={styles.privateBadge}>
                  🔒
                </IconText>
              )}
            </View>

            <Text style={styles.usernameText} numberOfLines={1}>
              @{item.username}
            </Text>

            {item.bio || item.status_message ? (
              <Text style={styles.bioText} numberOfLines={1}>
                {item.bio || item.status_message}
              </Text>
            ) : null}
          </TouchableOpacity>

          <View style={styles.friendActions}>
            <TouchableOpacity
              style={styles.chatButton}
              onPress={() => handleChatWithFriend(item)}
              disabled={isChatLoading}
              activeOpacity={0.8}
            >
              {isChatLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <IconText style={styles.chatButtonText}>💬 Chat</IconText>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.moreButton}
              onPress={() => {
                Alert.alert(
                  item.display_name,
                  `@${item.username}`,
                  [
                    {
                      text: 'Lihat Profil',
                      onPress: () => onOpenUserProfile(item.id),
                    },
                    {
                      text: 'Hapus Teman',
                      style: 'destructive',
                      onPress: () => handleConfirmUnfriend(item),
                    },
                    { text: 'Batal', style: 'cancel' },
                  ]
                );
              }}
              activeOpacity={0.6}
            >
              <IconText style={styles.moreButtonText}>⋮</IconText>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [startingChatUserId, onOpenUserProfile, handleChatWithFriend, handleConfirmUnfriend]
  );

  // Render incoming request card
  const renderIncomingRequest = useCallback(
    ({ item }: { item: PendingRequestItem }) => {
      const isActing = actingRequestId === item.id;

      return (
        <View style={styles.requestCard}>
          <View style={styles.requestHeader}>
            <TouchableOpacity
              onPress={() => onOpenUserProfile(item.peer_id)}
              activeOpacity={0.7}
            >
              <Avatar
                name={item.peer_display_name}
                avatarUrl={item.peer_avatar_url}
                size={44}
                shape="circle"
              />
            </TouchableOpacity>

            <View style={styles.requestInfo}>
              <View style={styles.nameRow}>
                <Text style={styles.displayName} numberOfLines={1}>
                  {item.peer_display_name}
                </Text>
                {item.peer_is_verified && <VerifiedBadge size={14} />}
              </View>
              <Text style={styles.usernameText} numberOfLines={1}>
                @{item.peer_username}
              </Text>
            </View>
          </View>

          <View style={styles.requestActionsRow}>
            <TouchableOpacity
              style={[styles.actionBtn, styles.acceptBtn]}
              onPress={() => handleRespondRequest(item, 'accept')}
              disabled={isActing}
              activeOpacity={0.8}
            >
              {isActing ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.acceptBtnText}>Terima</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.actionBtn, styles.declineBtn]}
              onPress={() => handleRespondRequest(item, 'decline')}
              disabled={isActing}
              activeOpacity={0.8}
            >
              <Text style={styles.declineBtnText}>Tolak</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    },
    [actingRequestId, onOpenUserProfile, handleRespondRequest]
  );

  // Render outgoing request card
  const renderOutgoingRequest = useCallback(
    ({ item }: { item: PendingRequestItem }) => (
      <View style={styles.requestCard}>
        <View style={styles.requestHeader}>
          <TouchableOpacity
            onPress={() => onOpenUserProfile(item.peer_id)}
            activeOpacity={0.7}
          >
            <Avatar
              name={item.peer_display_name}
              avatarUrl={item.peer_avatar_url}
              size={44}
              shape="circle"
            />
          </TouchableOpacity>

          <View style={styles.requestInfo}>
            <View style={styles.nameRow}>
              <Text style={styles.displayName} numberOfLines={1}>
                {item.peer_display_name}
              </Text>
              {item.peer_is_verified && <VerifiedBadge size={14} />}
            </View>
            <Text style={styles.usernameText} numberOfLines={1}>
              @{item.peer_username}
            </Text>
          </View>

          <View style={styles.pendingBadgeContainer}>
            <IconText style={styles.pendingBadgeText}>⏳ Menunggu</IconText>
          </View>
        </View>
      </View>
    ),
    [onOpenUserProfile]
  );

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      {/* ── Header ── */}
      <View style={styles.navBar}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          activeOpacity={0.7}
        >
          <Icon name="back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.navTitleContainer}>
          <Text style={styles.navTitle}>Teman & Koneksi</Text>
          <Text style={styles.navSubtitle}>
            {activeTab === 'friends'
              ? `${friends.length} Teman Terhubung`
              : `${incomingRequests.length} Permintaan Masuk`}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.addFriendHeaderBtn}
          onPress={onNavigateToNewChat}
          activeOpacity={0.7}
        >
          <IconText style={styles.addFriendHeaderIcon}>🔍</IconText>
        </TouchableOpacity>
      </View>

      {/* ── Main Tab Bar ── */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'friends' && styles.tabItemActive]}
          onPress={() => setActiveTab('friends')}
          activeOpacity={0.8}
        >
          <Text
            style={[
              styles.tabText,
              activeTab === 'friends' && styles.tabTextActive,
            ]}
          >
            Teman ({friends.length})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabItem, activeTab === 'requests' && styles.tabItemActive]}
          onPress={() => setActiveTab('requests')}
          activeOpacity={0.8}
        >
          <View style={styles.tabBadgeRow}>
            <Text
              style={[
                styles.tabText,
                activeTab === 'requests' && styles.tabTextActive,
              ]}
            >
              Permintaan
            </Text>
            {pendingCount > 0 && (
              <View style={styles.badgeCount}>
                <Text style={styles.badgeCountText}>
                  {pendingCount > 99 ? '99+' : pendingCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Tab Content ── */}
      {activeTab === 'friends' ? (
        <View style={styles.contentContainer}>
          {/* Search Bar */}
          <View style={styles.searchBarWrapper}>
            <IconText style={styles.searchIcon}>🔍</IconText>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari teman berdasarkan nama atau @username..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
              clearButtonMode="while-editing"
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="close" size={16} color={colors.textMuted} />
              </TouchableOpacity>
            )}
          </View>

          {/* Friends List with Cursor Pagination */}
          <FlatList
            data={filteredFriends}
            keyExtractor={(item) => item.id}
            renderItem={renderFriendItem}
            maxToRenderPerBatch={10}
            windowSize={7}
            removeClippedSubviews={true}
            onEndReached={loadMoreFriends}
            onEndReachedThreshold={0.3}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accentPrimary}
                colors={[colors.accentPrimary]}
              />
            }
            ListFooterComponent={
              isLoadingMore ? (
                <View style={styles.footerLoader}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                </View>
              ) : null
            }
            ListEmptyComponent={
              isLoading ? (
                <View style={styles.emptyContainer}>
                  <ActivityIndicator size="large" color={colors.accentPrimary} />
                  <Text style={styles.emptyLoadingText}>Memuat daftar teman...</Text>
                </View>
              ) : (
                <View style={styles.emptyContainer}>
                  <IconText style={styles.emptyIcon}>👥</IconText>
                  <Text style={styles.emptyTitle}>
                    {searchQuery ? 'Teman Tidak Ditemukan' : 'Belum Ada Teman'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {searchQuery
                      ? `Tidak ada teman yang cocok dengan "${searchQuery}".`
                      : 'Cari pengguna lain untuk saling terhubung dan mulai berkirim pesan dengan aman.'}
                  </Text>
                  {!searchQuery && (
                    <TouchableOpacity
                      style={styles.emptyActionBtn}
                      onPress={onNavigateToNewChat}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.emptyActionBtnText}>+ Cari & Tambah Teman</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )
            }
            contentContainerStyle={styles.listContent}
          />
        </View>
      ) : (
        <View style={styles.contentContainer}>
          {/* Requests Sub-tabs */}
          <View style={styles.subTabBar}>
            <TouchableOpacity
              style={[
                styles.subTabItem,
                requestSubTab === 'incoming' && styles.subTabItemActive,
              ]}
              onPress={() => setRequestSubTab('incoming')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.subTabText,
                  requestSubTab === 'incoming' && styles.subTabTextActive,
                ]}
              >
                Masuk ({incomingRequests.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.subTabItem,
                requestSubTab === 'outgoing' && styles.subTabItemActive,
              ]}
              onPress={() => setRequestSubTab('outgoing')}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.subTabText,
                  requestSubTab === 'outgoing' && styles.subTabTextActive,
                ]}
              >
                Terkirim ({outgoingRequests.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Requests FlatList */}
          <FlatList
            data={requestSubTab === 'incoming' ? incomingRequests : outgoingRequests}
            keyExtractor={(item) => item.id}
            renderItem={
              requestSubTab === 'incoming'
                ? renderIncomingRequest
                : renderOutgoingRequest
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor={colors.accentPrimary}
                colors={[colors.accentPrimary]}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <IconText style={styles.emptyIcon}>
                  {requestSubTab === 'incoming' ? '📬' : '📤'}
                </IconText>
                <Text style={styles.emptyTitle}>
                  {requestSubTab === 'incoming'
                    ? 'Tidak Ada Permintaan Masuk'
                    : 'Tidak Ada Permintaan Terkirim'}
                </Text>
                <Text style={styles.emptySubtitle}>
                  {requestSubTab === 'incoming'
                    ? 'Permintaan koneksi baru dari pengguna lain akan muncul di sini.'
                    : 'Permintaan koneksi yang kamu kirimkan ke pengguna lain akan tercantum di sini.'}
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  navBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navTitleContainer: {
    flex: 1,
    marginLeft: spacing.sm,
  },
  navTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  navSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  addFriendHeaderBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  addFriendHeaderIcon: {
    fontSize: 16,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabItem: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabItemActive: {
    borderBottomColor: colors.accentPrimary,
  },
  tabText: {
    ...typography.bodySecondary,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.accentPrimary,
  },
  tabBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  badgeCount: {
    backgroundColor: colors.colorError,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.full,
    minWidth: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCountText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  contentContainer: {
    flex: 1,
  },
  searchBarWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCard,
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    height: 44,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySecondary,
    color: colors.textPrimary,
    height: '100%',
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    paddingBottom: spacing.xxxl,
  },
  friendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  avatarTouchable: {
    marginRight: spacing.md,
  },
  friendInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  displayName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    maxWidth: '85%',
  },
  usernameText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  bioText: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  privateBadge: {
    fontSize: 12,
    marginLeft: 2,
  },
  friendActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: spacing.sm,
  },
  chatButton: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 70,
  },
  chatButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  moreButton: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bgCard,
  },
  moreButtonText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  subTabBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.md,
    marginTop: spacing.md,
    marginBottom: spacing.xs,
    backgroundColor: colors.bgSurface,
    borderRadius: radius.md,
    padding: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  subTabItem: {
    flex: 1,
    paddingVertical: spacing.xs + 2,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  subTabItemActive: {
    backgroundColor: colors.bgCard,
  },
  subTabText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  subTabTextActive: {
    color: colors.textPrimary,
  },
  requestCard: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginVertical: spacing.xs,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    ...shadows.card,
  },
  requestHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  requestInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  pendingBadgeContainer: {
    backgroundColor: colors.tintWarning10,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
  },
  pendingBadgeText: {
    fontSize: 11,
    color: colors.colorWarning,
    fontWeight: '600',
  },
  requestActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  actionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  acceptBtn: {
    backgroundColor: colors.accentPrimary,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
  // WCAG 2.1 AA Compliant: Dark text on light secondary button (Anti Same-Color Contrast Bug)
  declineBtn: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  declineBtnText: {
    color: colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  footerLoader: {
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxxl,
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 20,
  },
  emptyLoadingText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  emptyActionBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.full,
    marginTop: spacing.lg,
    ...shadows.card,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 14,
  },
});
