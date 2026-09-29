/**
 * WuzzChat Mobile UI — CallsHistoryScreen
 * Tab Panggilan — Riwayat WebRTC Voice Call (Milestone M-Mobile-8.20)
 *
 * Displays persistent call history (incoming, outgoing, missed) from SQLite
 * with Aurora Dark Mode styling, pull-to-refresh, call actions, and a FAB Dialer
 * to initiate WebRTC voice calls to any contact.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
  ListRenderItem,
  Platform,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { searchUsers } from '../api/users';
import { Conversation, User } from '../api/types';
import { Avatar } from '../components/Avatar';
import { BottomSheetModal } from '../components/BottomSheetModal';
import { useAuth, useCall, useConversations } from '../context';
import { LocalCallRecord } from '../services';
import { colors, radius, shadows, spacing, typography } from '../theme';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers & Metadata
// ─────────────────────────────────────────────────────────────────────────────
type CallType = 'incoming' | 'outgoing' | 'missed';

const CALL_META: Record<CallType, { icon: string; label: string; color: string }> = {
  incoming: { icon: '↙️', label: 'Masuk', color: colors.colorOnline },
  outgoing: { icon: '↗️', label: 'Keluar', color: colors.accentPrimary },
  missed: { icon: '📵', label: 'Tak Terjawab', color: colors.colorError },
};

function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

function formatTimestamp(timestampMs: number): string {
  if (!timestampMs) return '';
  const date = new Date(timestampMs);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const dayMs = 86400000;

  if (diff < dayMs && now.getDate() === date.getDate()) {
    return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 2 * dayMs) return 'Kemarin';
  return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Call List Item & Grouping
// ─────────────────────────────────────────────────────────────────────────────
export interface GroupedCallRecord extends LocalCallRecord {
  call_count: number;
  raw_ids: string[];
}

interface CallListItemProps {
  item: GroupedCallRecord;
  onPress: (item: GroupedCallRecord) => void;
  onLongPress: (item: GroupedCallRecord) => void;
  onCallback: (item: GroupedCallRecord) => void;
}

const CallListItem = React.memo<CallListItemProps>(
  ({ item, onPress, onLongPress, onCallback }) => {
    const meta = CALL_META[item.call_type] || CALL_META.missed;
    const displayName = item.peer_display_name || item.peer_username || 'Kontak WuzzChat';

    return (
      <TouchableOpacity
        style={styles.callItem}
        activeOpacity={0.75}
        onPress={() => onPress(item)}
        onLongPress={() => onLongPress(item)}
      >
        {/* Avatar */}
        <Avatar name={displayName} size={48} />

        {/* Info */}
        <View style={styles.callInfo}>
          <Text style={styles.contactName} numberOfLines={1}>
            {displayName}
            {item.call_count > 1 ? ` (${item.call_count})` : ''}
          </Text>
          <View style={styles.callMeta}>
            <Text style={styles.callTypeIcon}>{meta.icon}</Text>
            <Text style={[styles.callTypeLabel, { color: meta.color }]}>
              {meta.label}
            </Text>
            {item.call_type !== 'missed' && item.duration_seconds > 0 && (
              <Text style={styles.callDuration}>
                {' · '}{formatDuration(item.duration_seconds)}
              </Text>
            )}
            {item.status === 'rejected' && (
              <Text style={styles.callStatusNotice}> · Ditolak</Text>
            )}
            {item.status === 'busy' && (
              <Text style={styles.callStatusNotice}> · Sibuk</Text>
            )}
          </View>
        </View>

        {/* Timestamp + callback button */}
        <View style={styles.callRight}>
          <Text style={styles.callTimestamp}>
            {formatTimestamp(item.created_at)}
          </Text>
          <TouchableOpacity
            style={styles.callbackButton}
            activeOpacity={0.75}
            onPress={() => onCallback(item)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.callbackIcon}>📞</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  }
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Screen
// ─────────────────────────────────────────────────────────────────────────────
export const CallsHistoryScreen: React.FC = () => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { conversations } = useConversations();
  const {
    callHistory,
    isLoadingHistory,
    refreshCallHistory,
    deleteCallRecord,
    clearAllCallHistory,
    startCall,
  } = useCall();

  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDialerOpen, setIsDialerOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Filter direct conversation contacts for quick picker list
  const directContacts = useMemo(() => {
    return conversations.filter(
      (c) => !c.is_group && (c as any).type !== 'group' && c.id
    );
  }, [conversations]);

  // Pull-to-refresh handler
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshCallHistory();
    setIsRefreshing(false);
  }, [refreshCallHistory]);

  // Consecutive call grouping (DEC-CALL-04: WhatsApp-style aggregation)
  const groupedCallHistory = useMemo<GroupedCallRecord[]>(() => {
    if (!callHistory || callHistory.length === 0) return [];

    const groups: GroupedCallRecord[] = [];
    let currentGroup: GroupedCallRecord | null = null;

    for (const record of callHistory) {
      const peerIdentifier = record.peer_id || record.peer_username || record.peer_display_name;
      const currentPeerIdentifier = currentGroup
        ? currentGroup.peer_id || currentGroup.peer_username || currentGroup.peer_display_name
        : null;

      if (
        currentGroup &&
        peerIdentifier === currentPeerIdentifier &&
        currentGroup.call_type === record.call_type
      ) {
        currentGroup.call_count += 1;
        currentGroup.raw_ids.push(record.id);
        if (record.duration_seconds) {
          currentGroup.duration_seconds += record.duration_seconds;
        }
      } else {
        currentGroup = {
          ...record,
          call_count: 1,
          raw_ids: [record.id],
        };
        groups.push(currentGroup);
      }
    }

    return groups;
  }, [callHistory]);

  // Initiate call to a history peer with robust room & peer resolution
  const handleInitiateCall = useCallback(
    async (item: GroupedCallRecord | LocalCallRecord) => {
      // Cari direct conversation terkait dari daftar conversations
      const conv = conversations.find(
        (c) =>
          !c.is_group &&
          (c as any).type !== 'group' &&
          (c.id === item.room_id ||
            c.id === item.peer_id ||
            c.peer_id === item.peer_id ||
            (c as any).room_id === item.room_id)
      );

      const targetRoomId = item.room_id || conv?.id || '';
      const targetPeerId = conv?.peer_id || item.peer_id;
      const displayName =
        item.peer_display_name ||
        conv?.name ||
        conv?.peer_nickname ||
        item.peer_username ||
        'Kontak';
      const avatarUrl = conv?.avatar_url || conv?.peer_avatar_url;

      await startCall(targetRoomId, targetPeerId, displayName, avatarUrl);
    },
    [conversations, startCall]
  );

  // Tap on item: Prompt confirmation
  const handleItemPress = useCallback(
    (item: GroupedCallRecord) => {
      const displayName = item.peer_display_name || item.peer_username || 'Kontak';
      Alert.alert(
        'Panggilan Suara',
        `Mulai panggilan suara ke ${displayName}?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Panggil',
            onPress: () => handleInitiateCall(item),
          },
        ]
      );
    },
    [handleInitiateCall]
  );

  // Long press on item: Delete confirmation (removes all records in the group)
  const handleItemLongPress = useCallback(
    (item: GroupedCallRecord) => {
      const displayName = item.peer_display_name || item.peer_username || 'Kontak';
      const countMsg = item.call_count > 1 ? ` (${item.call_count} panggilan)` : '';
      Alert.alert(
        'Hapus Riwayat Panggilan',
        `Hapus catatan panggilan dengan ${displayName}${countMsg}?`,
        [
          { text: 'Batal', style: 'cancel' },
          {
            text: 'Hapus',
            style: 'destructive',
            onPress: async () => {
              for (const id of item.raw_ids) {
                await deleteCallRecord(id);
              }
            },
          },
        ]
      );
    },
    [deleteCallRecord]
  );

  // Clear all history
  const handleClearAll = useCallback(() => {
    if (callHistory.length === 0) return;
    Alert.alert(
      'Bersihkan Riwayat Panggilan',
      'Apakah Anda yakin ingin menghapus seluruh riwayat panggilan?',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus Semua',
          style: 'destructive',
          onPress: clearAllCallHistory,
        },
      ]
    );
  }, [callHistory.length, clearAllCallHistory]);

  // Search users inside Dialer modal
  const handleSearchChange = useCallback((text: string) => {
    setSearchQuery(text);
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = text.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      return;
    }

    setIsSearching(true);
    debounceTimerRef.current = setTimeout(async () => {
      try {
        const users = await searchUsers(trimmed);
        setSearchResults(users || []);
      } catch (err) {
        console.warn('[CallsHistoryScreen] Failed to search users:', err);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  // Pick contact from Dialer to start call
  const handlePickContactToCall = useCallback(
    async (targetUserId: string, targetName: string, avatarUrl?: string, roomId?: string) => {
      Keyboard.dismiss();
      setIsDialerOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      await startCall(roomId || '', targetUserId, targetName, avatarUrl);
    },
    [startCall]
  );

  const renderItem: ListRenderItem<GroupedCallRecord> = useCallback(
    ({ item }) => (
      <CallListItem
        item={item}
        onPress={handleItemPress}
        onLongPress={handleItemLongPress}
        onCallback={handleInitiateCall}
      />
    ),
    [handleItemPress, handleItemLongPress, handleInitiateCall]
  );

  const keyExtractor = useCallback((item: GroupedCallRecord) => item.id, []);

  const ListEmpty = useMemo(
    () => (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📞</Text>
        <Text style={styles.emptyTitle}>Belum ada riwayat panggilan</Text>
        <Text style={styles.emptySubtitle}>
          Mulai panggilan suara WebRTC dengan menekan tombol telepon di bawah.
        </Text>
      </View>
    ),
    []
  );

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Panggilan</Text>
        {groupedCallHistory.length > 0 && (
          <TouchableOpacity
            style={styles.clearHeaderBtn}
            onPress={handleClearAll}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.clearHeaderBtnText}>Bersihkan</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Loading Indicator for Initial Load */}
      {isLoadingHistory && groupedCallHistory.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Memuat riwayat panggilan...</Text>
        </View>
      ) : (
        /* Call History List */
        <FlatList
          data={groupedCallHistory}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          ListEmptyComponent={ListEmpty}
          contentContainerStyle={[
            styles.listContent,
            groupedCallHistory.length === 0 && styles.listContentEmpty,
          ]}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accentPrimary}
              colors={[colors.accentPrimary]}
            />
          }
        />
      )}

      {/* FAB — Initiate New Call */}
      <TouchableOpacity
        style={[
          styles.fab,
          {
            bottom: Math.max(insets.bottom + spacing.xl, spacing.xxxl),
          },
        ]}
        activeOpacity={0.85}
        onPress={() => setIsDialerOpen(true)}
      >
        <Text style={styles.fabIcon}>📞</Text>
      </TouchableOpacity>

      {/* Dialer & Contact Picker Modal */}
      <BottomSheetModal
        visible={isDialerOpen}
        onClose={() => {
          setIsDialerOpen(false);
          setSearchQuery('');
          setSearchResults([]);
        }}
        title="Mulai Panggilan Suara"
      >
        <View style={styles.modalContent}>
          {/* Search Box */}
          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari kontak atau username..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleSearchChange}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
            />
            {isSearching && (
              <ActivityIndicator
                size="small"
                color={colors.accentPrimary}
                style={{ marginRight: spacing.xs }}
              />
            )}
          </View>

          {/* Section: Search Results */}
          {searchQuery.trim().length > 0 ? (
            <View style={styles.pickerListContainer}>
              <Text style={styles.sectionHeaderTitle}>Hasil Pencarian</Text>
              {searchResults.length === 0 && !isSearching ? (
                <Text style={styles.noResultsText}>
                  Tidak ada pengguna ditemukan untuk &quot;{searchQuery}&quot;
                </Text>
              ) : (
                <FlatList
                  data={searchResults.filter((u) => u.id !== user?.id)}
                  keyExtractor={(u) => u.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: u }) => (
                    <TouchableOpacity
                      style={styles.pickerItem}
                      activeOpacity={0.7}
                      onPress={() =>
                        handlePickContactToCall(
                          u.id,
                          u.display_name || u.username,
                          u.avatar_url
                        )
                      }
                    >
                      <Avatar
                        name={u.display_name || u.username}
                        avatarUrl={u.avatar_url}
                        size={40}
                      />
                      <View style={styles.pickerItemInfo}>
                        <Text style={styles.pickerItemName} numberOfLines={1}>
                          {u.display_name || u.username}
                        </Text>
                        <Text style={styles.pickerItemUsername}>
                          @{u.username}
                        </Text>
                      </View>
                      <View style={styles.pickerCallAction}>
                        <Text style={styles.pickerCallIcon}>📞</Text>
                      </View>
                    </TouchableOpacity>
                  )}
                />
              )}
            </View>
          ) : (
            /* Section: Existing Direct Contacts */
            <View style={styles.pickerListContainer}>
              <Text style={styles.sectionHeaderTitle}>Kontak Percakapan</Text>
              {directContacts.length === 0 ? (
                <Text style={styles.noResultsText}>
                  Belum ada kontak percakapan. Ketik username di atas untuk mencari.
                </Text>
              ) : (
                <FlatList
                  data={directContacts}
                  keyExtractor={(c) => c.id}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item: c }) => {
                    const peerId =
                      (c as any).peer_user_id ||
                      (c as any).user_id ||
                      (c as any).peer_id ||
                      c.id;
                    const peerName = c.title || (c as any).peer_nickname || 'Kontak';
                    return (
                      <TouchableOpacity
                        style={styles.pickerItem}
                        activeOpacity={0.7}
                        onPress={() =>
                          handlePickContactToCall(
                            peerId,
                            peerName,
                            c.avatar_url,
                            (c as any).room_id || c.id
                          )
                        }
                      >
                        <Avatar
                          name={peerName}
                          avatarUrl={c.avatar_url}
                          size={40}
                        />
                        <View style={styles.pickerItemInfo}>
                          <Text style={styles.pickerItemName} numberOfLines={1}>
                            {peerName}
                          </Text>
                          <Text style={styles.pickerItemSub}>
                            Ketuk untuk memanggil
                          </Text>
                        </View>
                        <View style={styles.pickerCallAction}>
                          <Text style={styles.pickerCallIcon}>📞</Text>
                        </View>
                      </TouchableOpacity>
                    );
                  }}
                />
              )}
            </View>
          )}
        </View>
      </BottomSheetModal>
    </View>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitle: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  clearHeaderBtn: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
  },
  clearHeaderBtnText: {
    ...typography.caption,
    color: colors.colorError,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
  },
  loadingText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
  },
  listContent: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxxl * 2,
  },
  listContentEmpty: {
    flex: 1,
  },
  separator: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginLeft: 64,
  },

  // ── Call Item ──────────────────────────────────────────────────────────────
  callItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  callInfo: {
    flex: 1,
    marginLeft: spacing.md,
    marginRight: spacing.sm,
  },
  contactName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  callMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  callTypeIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  callTypeLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  callDuration: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  callStatusNotice: {
    fontSize: 12,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  callRight: {
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  callTimestamp: {
    fontSize: 11,
    color: colors.textSecondary,
  },
  callbackButton: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callbackIcon: {
    fontSize: 15,
  },

  // ── Empty State ────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxxl,
    paddingTop: spacing.huge,
  },
  emptyIcon: {
    fontSize: 56,
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  emptySubtitle: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 20,
  },

  // ── FAB ───────────────────────────────────────────────────────────────────
  fab: {
    position: 'absolute',
    right: spacing.xl,
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.modal,
  },
  fabIcon: {
    fontSize: 24,
  },

  // ── Modal & Contact Picker ─────────────────────────────────────────────────
  modalContent: {
    flexShrink: 1,
    maxHeight: 520,
    paddingBottom: spacing.md,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.sm : spacing.xs,
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    flex: 1,
    ...typography.body,
    color: colors.textPrimary,
    paddingVertical: spacing.xs,
  },
  pickerListContainer: {
    flexShrink: 1,
    maxHeight: 340,
  },
  sectionHeaderTitle: {
    ...typography.caption,
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  noResultsText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    textAlign: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.md,
  },
  pickerItemInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  pickerItemName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  pickerItemUsername: {
    ...typography.caption,
    color: colors.accentPrimary,
  },
  pickerItemSub: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  pickerCallAction: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  pickerCallIcon: {
    fontSize: 14,
  },
});

