/**
 * WuzzChat Mobile UI - NewGroupScreen
 * Group Creation Wizard Screen with Multi-Select Contact Checklist & Selected Chips
 * Adheres to WhatsApp-grade single-screen flow & Design System tokens.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { groupsApi } from '../api/groups';
import { searchUsers } from '../api/users';
import { Conversation, User } from '../api/types';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';

export interface NewGroupScreenProps {
  onBack: () => void;
  onSelectChat: (conversation: Conversation) => void;
}

export const NewGroupScreen: React.FC<NewGroupScreenProps> = ({ onBack, onSelectChat }) => {
  const { user: currentUser } = useAuth();
  const [title, setTitle] = useState<string>('');
  const [description, setDescription] = useState<string>('');
  const [selectedUsers, setSelectedUsers] = useState<User[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [contacts, setContacts] = useState<User[]>([]);
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Android hardware back button handler
  useEffect(() => {
    const backAction = () => {
      onBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [onBack]);

  // Initial contacts search (or load when screen opens)
  useEffect(() => {
    let mounted = true;
    async function loadInitialContacts() {
      setIsSearching(true);
      try {
        const users = await searchUsers('a');
        if (mounted) {
          setContacts(users?.filter((u) => u.id !== currentUser?.id) || []);
        }
      } catch (err) {
        console.warn('[NewGroupScreen] Failed to load initial contacts:', err);
      } finally {
        if (mounted) setIsSearching(false);
      }
    }
    loadInitialContacts();
    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  // Debounced search for contacts
  const performSearch = useCallback(
    (query: string) => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      const trimmed = query.trim();
      setIsSearching(true);
      setErrorMessage(null);

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const users = await searchUsers(trimmed || 'a');
          setContacts(users?.filter((u) => u.id !== currentUser?.id) || []);
        } catch (err: any) {
          console.warn('[NewGroupScreen] Search failed:', err);
          setContacts([]);
        } finally {
          setIsSearching(false);
        }
      }, 300);
    },
    [currentUser?.id]
  );

  const handleQueryChange = (text: string) => {
    setSearchQuery(text);
    performSearch(text);
  };

  // Toggle member selection
  const handleToggleUser = (targetUser: User) => {
    setSelectedUsers((prev) => {
      const exists = prev.some((u) => u.id === targetUser.id);
      if (exists) {
        return prev.filter((u) => u.id !== targetUser.id);
      }
      return [...prev, targetUser];
    });
  };

  const handleRemoveUser = (userId: string) => {
    setSelectedUsers((prev) => prev.filter((u) => u.id !== userId));
  };

  // Submit group creation
  const handleCreateGroup = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMessage('Nama grup wajib diisi');
      return;
    }
    if (trimmedTitle.length > 128) {
      setErrorMessage('Nama grup maksimal 128 karakter');
      return;
    }

    if (isSubmitting) return; // Anti-double-action guard
    setIsSubmitting(true);
    setErrorMessage(null);
    Keyboard.dismiss();

    try {
      const memberIds = selectedUsers.map((u) => u.id);
      const res = await groupsApi.createGroup({
        title: trimmedTitle,
        description: description.trim() || undefined,
        member_ids: memberIds,
      });

      if (res?.group?.id) {
        const newGroup = res.group;
        onSelectChat({
          id: newGroup.id,
          room_id: newGroup.id,
          title: newGroup.title,
          name: newGroup.title,
          description: newGroup.description,
          avatar_url: newGroup.avatar_url,
          is_group: true,
          type: 'group',
          member_count: newGroup.member_count || memberIds.length + 1,
          my_role: 'creator',
        });
      } else {
        setErrorMessage('Gagal membuat grup');
      }
    } catch (err: any) {
      console.warn('[NewGroupScreen] Failed to create group:', err);
      setErrorMessage(err?.message || 'Gagal membuat grup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const renderContactItem = ({ item }: { item: User }) => {
    const isSelected = selectedUsers.some((u) => u.id === item.id);

    return (
      <TouchableOpacity
        style={[styles.contactItem, isSelected && styles.contactItemSelected]}
        onPress={() => handleToggleUser(item)}
        activeOpacity={0.7}
      >
        <Avatar
          name={item.display_name || item.username}
          avatarUrl={item.avatar_url}
          size={46}
        />
        <View style={styles.contactInfo}>
          <View style={styles.contactNameRow}>
            <Text style={styles.contactDisplayName} numberOfLines={1}>
              {item.display_name || item.username}
            </Text>
            {item.is_verified && <Text style={styles.verifiedBadge}>✓</Text>}
          </View>
          <Text style={styles.contactUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>

        {/* Checkbox Icon */}
        <View style={[styles.checkbox, isSelected && styles.checkboxSelected]}>
          {isSelected && <Text style={styles.checkMark}>✓</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={styles.keyboardContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
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
            <Text style={styles.headerTitle}>Grup Baru</Text>
            <Text style={styles.headerSubtitle}>
              {selectedUsers.length > 0
                ? `${selectedUsers.length} anggota dipilih`
                : 'Tambah info & pilih anggota'}
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.createHeaderButton,
              (!title.trim() || isSubmitting) && styles.createHeaderButtonDisabled,
            ]}
            onPress={handleCreateGroup}
            disabled={!title.trim() || isSubmitting}
            activeOpacity={0.7}
          >
            {isSubmitting ? (
              <ActivityIndicator size="small" color="#ffffff" />
            ) : (
              <Text style={styles.createHeaderText}>Buat</Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Error Notification */}
        {errorMessage ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{errorMessage}</Text>
          </View>
        ) : null}

        {/* Group Profile Form */}
        <View style={styles.formContainer}>
          <View style={styles.groupAvatarPlaceholder}>
            <Avatar name={title.trim() || 'Grup'} size={56} isGroup={true} />
          </View>
          <View style={styles.formInputs}>
            <View style={styles.inputRow}>
              <TextInput
                style={styles.titleInput}
                placeholder="Nama grup (wajib)"
                placeholderTextColor={colors.textMuted}
                value={title}
                onChangeText={setTitle}
                maxLength={128}
                autoFocus
              />
              <Text style={styles.counterText}>{title.length}/128</Text>
            </View>
            <TextInput
              style={styles.descInput}
              placeholder="Deskripsi grup (opsional)"
              placeholderTextColor={colors.textMuted}
              value={description}
              onChangeText={setDescription}
              maxLength={256}
              multiline
            />
          </View>
        </View>

        {/* Selected Members Chips */}
        {selectedUsers.length > 0 && (
          <View style={styles.chipsSection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chipsContent}
              keyboardShouldPersistTaps="always"
            >
              {selectedUsers.map((user) => (
                <View key={user.id} style={styles.chipItem}>
                  <Avatar
                    name={user.display_name || user.username}
                    avatarUrl={user.avatar_url}
                    size={28}
                  />
                  <Text style={styles.chipText} numberOfLines={1}>
                    {user.display_name || user.username}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveUser(user.id)}
                    style={styles.chipRemoveButton}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.chipRemoveIcon}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Search Contacts Bar */}
        <View style={styles.searchBarContainer}>
          <View style={styles.searchBar}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.searchInput}
              placeholder="Cari anggota untuk ditambahkan..."
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={handleQueryChange}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {isSearching && (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            )}
          </View>
        </View>

        {/* Contacts Multi-Select List */}
        <FlatList
          data={contacts}
          keyExtractor={(item) => item.id}
          renderItem={renderContactItem}
          contentContainerStyle={styles.contactListContent}
          keyboardShouldPersistTaps="always"
          ListEmptyComponent={
            !isSearching ? (
              <View style={styles.emptyContacts}>
                <Text style={styles.emptyContactsText}>
                  {searchQuery.trim().length > 0
                    ? `Tidak ada kontak cocok dengan "${searchQuery}".`
                    : 'Tidak ada kontak ditemukan.'}
                </Text>
              </View>
            ) : null
          }
        />
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  keyboardContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  backButtonText: {
    fontSize: 24,
    color: colors.textPrimary,
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
  createHeaderButton: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createHeaderButtonDisabled: {
    opacity: 0.4,
  },
  createHeaderText: {
    ...typography.body,
    fontWeight: '700',
    color: '#ffffff',
  },
  errorBox: {
    backgroundColor: colors.tintError10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.colorError,
  },
  errorText: {
    ...typography.caption,
    color: colors.colorError,
  },

  formContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: spacing.md,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  groupAvatarPlaceholder: {
    marginRight: spacing.md,
    marginTop: spacing.xs,
  },
  formInputs: {
    flex: 1,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    paddingBottom: 4,
  },
  titleInput: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    paddingVertical: spacing.xs,
  },
  counterText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 10,
    marginLeft: spacing.xs,
  },
  descInput: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
    marginTop: spacing.xs,
    paddingVertical: spacing.xs,
    maxHeight: 60,
  },
  chipsSection: {
    backgroundColor: colors.bgBase,
    paddingVertical: spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  chipsContent: {
    paddingHorizontal: spacing.md,
    gap: spacing.xs,
    alignItems: 'center',
  },
  chipItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.xs + 2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxWidth: 160,
  },
  chipText: {
    ...typography.caption,
    color: colors.textPrimary,
    fontWeight: '600',
    marginHorizontal: 6,
    flexShrink: 1,
  },
  chipRemoveButton: {
    padding: 2,
  },
  chipRemoveIcon: {
    fontSize: 10,
    color: colors.textMuted,
    fontWeight: '700',
  },
  searchBarContainer: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    paddingHorizontal: spacing.sm,
    height: 40,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  searchIcon: {
    fontSize: 14,
    marginRight: spacing.xs,
  },
  searchInput: {
    flex: 1,
    ...typography.bodySecondary,
    color: colors.textPrimary,
  },
  contactListContent: {
    paddingBottom: spacing.xxl,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  contactItemSelected: {
    backgroundColor: colors.tintAccent10,
  },
  contactInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  contactNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  contactDisplayName: {
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
  contactUsername: {
    ...typography.caption,
    color: colors.accentPrimary,
    marginTop: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    borderColor: colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.sm,
  },
  checkboxSelected: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.accentPrimary,
  },
  checkMark: {
    fontSize: 12,
    color: '#ffffff',
    fontWeight: '700',
    lineHeight: 14,
  },
  emptyContacts: {
    padding: spacing.xl,
    alignItems: 'center',
  },
  emptyContactsText: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
  },
});
