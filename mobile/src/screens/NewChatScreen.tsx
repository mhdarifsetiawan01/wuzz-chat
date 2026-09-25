/**
 * WuzzChat Mobile UI - NewChatScreen
 * Contact Search & Direct Conversation Initiation Screen
 * WhatsApp Single-Screen Flow, Debounced Querying, & Anti-Double-Action Guard.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { searchUsers, startDirectChat } from '../api/users';
import { Conversation, User } from '../api/types';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';

export interface NewChatScreenProps {
  onBack: () => void;
  onSelectChat: (conversation: Conversation) => void;
}

export const NewChatScreen: React.FC<NewChatScreenProps> = ({ onBack, onSelectChat }) => {
  const { user: currentUser } = useAuth();
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [startingUserId, setStartingUserId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Handle hardware Android Back button
  useEffect(() => {
    const backAction = () => {
      onBack();
      return true;
    };

    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [onBack]);

  // Debounced user search
  const performSearch = useCallback((query: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setSearchResults([]);
      setIsSearching(false);
      setErrorMessage(null);
      return;
    }

    setIsSearching(true);
    setErrorMessage(null);

    debounceTimerRef.current = setTimeout(async () => {
      try {
        const users = await searchUsers(trimmed);
        setSearchResults(users || []);
      } catch (err: any) {
        console.warn('[NewChatScreen] Search failed:', err);
        setErrorMessage(err?.message || 'Gagal mencari kontak');
        setSearchResults([]);
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
    setSearchResults([]);
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

  const renderUserItem = ({ item }: { item: User }) => {
    const isMe = currentUser?.id === item.id;
    const isPending = startingUserId === item.id;

    return (
      <TouchableOpacity
        style={[styles.userItem, isPending && styles.userItemDisabled]}
        onPress={() => handleSelectUser(item)}
        disabled={isPending || isMe}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.display_name || item.username}
          avatarUrl={item.avatar_url}
          size={48}
        />
        <View style={styles.userInfo}>
          <View style={styles.userNameRow}>
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
          <Text style={styles.usernameText} numberOfLines={1}>
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
          <Text style={styles.headerSubtitle}>Cari pengguna terdaftar</Text>
        </View>
      </View>

      {/* Search Input Bar */}
      <View style={styles.searchContainer}>
        <View style={styles.searchBar}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama atau username..."
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
          {searchQuery.length > 0 && !isSearching && (
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

      {/* Results List */}
      <FlatList
        data={searchResults}
        keyExtractor={(item) => item.id}
        renderItem={renderUserItem}
        contentContainerStyle={styles.listContent}
        keyboardShouldPersistTaps="always"
        ListEmptyComponent={
          !isSearching ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyIcon}>
                {searchQuery.trim().length > 0 ? '👤❓' : '💬'}
              </Text>
              <Text style={styles.emptyTitle}>
                {searchQuery.trim().length > 0
                  ? 'Pengguna Tidak Ditemukan'
                  : 'Cari Pengguna'}
              </Text>
              <Text style={styles.emptySubtitle}>
                {searchQuery.trim().length > 0
                  ? `Tidak ada kontak yang cocok dengan "${searchQuery}".`
                  : 'Ketik username atau nama tampilan untuk mulai mengobrol.'}
              </Text>
            </View>
          ) : null
        }
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
  userItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  userItemDisabled: {
    opacity: 0.6,
  },
  userInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  userNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  displayName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
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
  usernameText: {
    ...typography.caption,
    color: colors.accentPrimary,
    marginTop: 2,
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
});

