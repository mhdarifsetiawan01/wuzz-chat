/**
 * WuzzChat Mobile UI - NewChatScreen
 * Contact Search & Direct Conversation Initiation Screen
 * With Public Group Discovery & Preview Confirmation (DEC-012).
 * WhatsApp Single-Screen Flow, Debounced Querying, & Anti-Double-Action Guard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Keyboard,
  SectionList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchUsers, startDirectChat } from '../api/users';
import { groupsApi } from '../api/groups';
import { Conversation, GroupDetails, User } from '../api/types';
import { Avatar } from '../components/Avatar';
import { GroupPreviewModal } from '../components/GroupPreviewModal';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';

export interface NewChatScreenProps {
  onBack: () => void;
  onSelectChat: (conversation: Conversation) => void;
  onNavigateToNewGroup?: () => void;
}

interface UserSection {
  title: string;
  type: 'users';
  data: User[];
}

interface GroupSection {
  title: string;
  type: 'groups';
  data: GroupDetails[];
}

type SearchSection = UserSection | GroupSection;

export const NewChatScreen: React.FC<NewChatScreenProps> = ({
  onBack,
  onSelectChat,
  onNavigateToNewGroup,
}) => {
  const { user: currentUser } = useAuth();

  const [searchQuery, setSearchQuery] = useState<string>('');
  const [userResults, setUserResults] = useState<User[]>([]);
  const [publicGroupResults, setPublicGroupResults] = useState<GroupDetails[]>([]);
  const [selectedPublicGroup, setSelectedPublicGroup] = useState<GroupDetails | null>(null);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle hardware Android Back button
  useEffect(() => {
    const backAction = () => {
      if (selectedPublicGroup) {
        setSelectedPublicGroup(null);
        return true;
      }
      onBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [onBack, selectedPublicGroup]);

  // Debounced search for both users and public groups
  const performSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setUserResults([]);
      setPublicGroupResults([]);
      setIsSearching(false);
      setErrorMessage(null);
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const [usersRes, groupsRes] = await Promise.allSettled([
          searchUsers(trimmed),
          groupsApi.searchPublicGroups(trimmed),
        ]);

        const users = usersRes.status === 'fulfilled' ? usersRes.value || [] : [];
        const groups = groupsRes.status === 'fulfilled' ? groupsRes.value || [] : [];

        setUserResults(users);
        setPublicGroupResults(groups);
      } catch (err: any) {
        console.warn('[NewChatScreen] Search failed:', err);
        setErrorMessage(err?.message || 'Gagal mencari kontak atau grup');
        setUserResults([]);
        setPublicGroupResults([]);
      } finally {
        setIsSearching(false);
      }
    }, 300);
  }, []);

  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    performSearch(text);
  };

  const handleClearQuery = () => {
    setSearchQuery('');
    setUserResults([]);
    setPublicGroupResults([]);
    setIsSearching(false);
    setErrorMessage(null);
  };

  // Start direct conversation with selected user
  const handleSelectUser = async (targetUser: User) => {
    if (startingUserId) return; // Anti-double-action guard

    Keyboard.dismiss();
    console.log('[NewChatScreen] handleSelectUser clicked:', targetUser.username, targetUser.id);
    setStartingUserId(targetUser.id);
    setErrorMessage(null);

    try {
      const response = await startDirectChat(targetUser.id);
      if (response?.room_id) {
        onSelectChat({
          id: response.room_id,
          room_id: response.room_id,
          title: targetUser.display_name || targetUser.username,
          peer_nickname: targetUser.display_name || targetUser.username,
          avatar_url: targetUser.avatar_url,
          is_group: false,
          type: 'direct',
        });
      } else {
        setErrorMessage('Gagal membuka percakapan');
      }
    } catch (err: any) {
      console.warn('[NewChatScreen] Failed to start conversation:', err);
      setErrorMessage(err?.message || 'Gagal memulai percakapan');
    } finally {
      setStartingUserId(null);
    }
  };

  // Select public group -> Trigger DEC-012 Preview Confirmation (Anti-Accidental Auto-Join)
  const handleSelectPublicGroup = (group: GroupDetails) => {
    Keyboard.dismiss();
    console.log('[NewChatScreen] Opening public group preview:', group.title, group.id);
    setSelectedPublicGroup(group);
  };

  // Callback when user confirms join / opens group from modal
  const handleGroupJoined = (joinedGroup: GroupDetails) => {
    setSelectedPublicGroup(null);
    onSelectChat({
      id: joinedGroup.id,
      room_id: joinedGroup.id,
      title: joinedGroup.title || (joinedGroup as any).name || 'Grup Publik',
      peer_nickname: joinedGroup.title || (joinedGroup as any).name || 'Grup Publik',
      avatar_url: joinedGroup.avatar_url,
      is_group: true,
      type: 'group',
    });
  };

  const renderUserItem = (item: User) => {
    const isMe = currentUser?.id === item.id;
    const isPending = startingUserId === item.id;

    return (
      <TouchableOpacity
        key={item.id}
        style={[styles.itemContainer, isPending && styles.itemDisabled]}
        onPress={() => handleSelectUser(item)}
        disabled={isPending || isMe}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.display_name || item.username}
          avatarUrl={item.avatar_url}
          size={48}
        />
        <View style={styles.itemInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {item.display_name || item.username}
            </Text>
            {item.is_verified && (
              <Text style={styles.verifiedBadge}>✓</Text>
            )}
            {isMe && (
              <Text style={styles.meBadge}> (Anda)</Text>
            )}
          </View>
          <Text style={styles.subText} numberOfLines={1}>
            @{item.username}
          </Text>
          {item.status_message ? (
            <Text style={styles.statusMessage} numberOfLines={1}>
              {item.status_message}
            </Text>
          ) : null}
        </View>

        {isPending ? (
          <ActivityIndicator size="small" color={colors.accentPrimary} />
        ) : (
          <Text style={styles.chevron}>›</Text>
        )}
      </TouchableOpacity>
    );
  };

  const renderGroupItem = (item: GroupDetails) => {
    const title = item.title || (item as any).name || 'Grup Publik';
    const memberCount = item.member_count ?? 1;

    return (
      <TouchableOpacity
        key={item.id}
        style={styles.itemContainer}
        onPress={() => handleSelectPublicGroup(item)}
        activeOpacity={0.7}
      >
        <Avatar
          name={title}
          avatarUrl={item.avatar_url}
          size={48}
        />
        <View style={styles.itemInfo}>
          <View style={styles.nameRow}>
            <Text style={styles.displayName} numberOfLines={1}>
              {title}
            </Text>
            <View style={styles.publicBadgeSmall}>
              <Text style={styles.publicBadgeSmallText}>🌐 Publik</Text>
            </View>
          </View>

          <View style={styles.groupMetaRow}>
            {item.group_username ? (
              <Text style={styles.subText} numberOfLines={1}>
                @{item.group_username} •{' '}
              </Text>
            ) : null}
            <Text style={styles.membersCountText}>
              {memberCount} anggota
            </Text>
          </View>

          {item.description ? (
            <Text style={styles.statusMessage} numberOfLines={1}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    );
  };

  // Build section list data
  const sections: SearchSection[] = [];
  if (publicGroupResults.length > 0) {
    sections.push({
      title: 'Grup Publik',
      type: 'groups',
      data: publicGroupResults,
    });
  }
  if (userResults.length > 0) {
    sections.push({
      title: 'Kontak & Pengguna',
      type: 'users',
      data: userResults,
    });
  }

  const hasResults = sections.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle}>Mulai Chat Baru</Text>
          <Text style={styles.headerSubtitle}>Cari kontak atau jelajahi grup publik</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama, @username, atau grup..."
            placeholderTextColor={colors.textMuted}
            value={searchQuery}
            onChangeText={handleQueryChange}
            autoFocus
            autoCapitalize="none"
            autoCorrect={false}
          />
          {isSearching && (
            <ActivityIndicator size="small" color={colors.accentPrimary} style={styles.searchSpinner} />
          )}
          {isSearchActive && !isSearching && (
            <TouchableOpacity onPress={handleClearQuery} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.clearIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Error Message */}
      {errorMessage ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{errorMessage}</Text>
        </View>
      ) : null}

      {/* Categorized Results or Default Actions */}
      <SectionList<User | GroupDetails, SearchSection>
        sections={sections}
        keyExtractor={(item) => item.id}
        renderItem={({ item, section }) => {
          if (section.type === 'groups') {
            return renderGroupItem(item as GroupDetails);
          }
          return renderUserItem(item as User);
        }}
        renderSectionHeader={({ section }) => (
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionHeaderTitle}>
              {section.type === 'groups' ? '🌐 ' : '👤 '}
              {section.title}
            </Text>
            <View style={styles.sectionHeaderBadge}>
              <Text style={styles.sectionHeaderCount}>{section.data.length}</Text>
            </View>
          </View>
        )}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="always"
        ListHeaderComponent={
          onNavigateToNewGroup && !isSearchActive ? (
            <TouchableOpacity
              style={styles.newGroupItem}
              onPress={onNavigateToNewGroup}
              activeOpacity={0.7}
            >
              <View style={styles.newGroupIconWrapper}>
                <Text style={styles.newGroupIcon}>👥</Text>
              </View>
              <View style={styles.newGroupInfo}>
                <Text style={styles.newGroupTitle}>Grup Baru</Text>
                <Text style={styles.newGroupSubtitle}>Buat obrolan grup bersama rekan</Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          !isSearching ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>
                {isSearchActive ? '🔍❓' : '💬'}
              </Text>
              <Text style={styles.emptyTitle}>
                {isSearchActive
                  ? 'Tidak Ditemukan'
                  : 'Cari Kontak atau Grup Publik'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {isSearchActive
                  ? `Tidak ada kontak atau grup yang cocok dengan "${searchQuery}".`
                  : 'Ketik username, nama kontak, atau nama grup publik untuk mulai mengobrol.'}
              </Text>
            </View>
          ) : null
        }
      />

      {/* DEC-012: Public Group Discovery & Preview Confirmation Modal */}
      <GroupPreviewModal
        visible={Boolean(selectedPublicGroup)}
        group={selectedPublicGroup}
        onClose={() => setSelectedPublicGroup(null)}
        onJoined={handleGroupJoined}
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
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    paddingRight: spacing.md,
    paddingVertical: spacing.xs,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  headerTitleContainer: {
    flex: 1,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  searchContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.sm,
  },
  searchInput: {
    ...typography.input,
    flex: 1,
    paddingVertical: 2,
  },
  searchSpinner: {
    marginLeft: spacing.xs,
  },
  clearIcon: {
    fontSize: 14,
    color: colors.textMuted,
    paddingHorizontal: spacing.xs,
  },
  errorBox: {
    marginHorizontal: spacing.md,
    marginTop: spacing.sm,
    padding: spacing.sm,
    backgroundColor: colors.tintError10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.colorError,
  },
  errorText: {
    ...typography.caption,
    color: colors.colorError,
    textAlign: 'center',
  },
  listContent: {
    flexGrow: 1,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgBase,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 4,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  sectionHeaderTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  sectionHeaderBadge: {
    backgroundColor: colors.bgElevated,
    paddingHorizontal: spacing.xs + 4,
    paddingVertical: 1,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
  },
  itemContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  itemDisabled: {
    opacity: 0.6,
  },
  itemInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  publicBadgeSmall: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.full,
    marginLeft: spacing.xs,
  },
  publicBadgeSmallText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  verifiedBadge: {
    fontSize: 12,
    color: colors.colorVerified,
    marginLeft: 4,
    fontWeight: '700',
  },
  meBadge: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  subText: {
    ...typography.caption,
    color: colors.accentPrimary,
    marginTop: 2,
  },
  groupMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  membersCountText: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  statusMessage: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  chevron: {
    fontSize: 22,
    color: colors.textMuted,
    marginLeft: spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxxl,
    marginTop: 40,
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
  newGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
    marginBottom: spacing.xs,
  },
  newGroupIconWrapper: {
    width: 48,
    height: 48,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newGroupIcon: {
    fontSize: 22,
  },
  newGroupInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  newGroupTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  newGroupSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
