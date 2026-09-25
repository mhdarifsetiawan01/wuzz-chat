/**
 * WuzzChat Mobile UI - GroupInfoScreen
 * Group Profile Details & Member Management Screen with RBAC
 * Supports Add Member, Kick Member, Promote/Demote Admin, and Leave Group.
 * Follows WhatsApp-grade single-screen flow & Design System tokens.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  BackHandler,
  FlatList,
  Modal,
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
import { GroupDetails, GroupMember, User } from '../api/types';
import { Avatar } from '../components/Avatar';
import { useAuth } from '../context/AuthContext';
import { colors, radius, spacing, typography } from '../theme';

export interface GroupInfoScreenProps {
  groupId: string;
  onBack: () => void;
  onLeaveSuccess?: () => void;
  onGroupUpdated?: (updated: GroupDetails) => void;
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '';
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export const GroupInfoScreen: React.FC<GroupInfoScreenProps> = ({
  groupId,
  onBack,
  onLeaveSuccess,
  onGroupUpdated,
}) => {
  const { user: currentUser } = useAuth();
  const [group, setGroup] = useState<GroupDetails | null>(null);
  const [members, setMembers] = useState<GroupMember[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const onGroupUpdatedRef = useRef(onGroupUpdated);
  useEffect(() => {
    onGroupUpdatedRef.current = onGroupUpdated;
  }, [onGroupUpdated]);

  const isLoadingRef = useRef(false);

  // Add Member Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState<boolean>(false);
  const [contactSearchQuery, setContactSearchQuery] = useState<string>('');
  const [availableContacts, setAvailableContacts] = useState<User[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [isSearchingContacts, setIsSearchingContacts] = useState<boolean>(false);
  const [isAddingMembers, setIsAddingMembers] = useState<boolean>(false);

  // Action Sheet for Member Management
  const [selectedMember, setSelectedMember] = useState<GroupMember | null>(null);
  const [isActionLoading, setIsActionLoading] = useState<boolean>(false);

  // Hardware Back button support
  useEffect(() => {
    const backAction = () => {
      if (isAddModalOpen) {
        setIsAddModalOpen(false);
        return true;
      }
      if (selectedMember) {
        setSelectedMember(null);
        return true;
      }
      onBack();
      return true;
    };
    const subscription = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => subscription.remove();
  }, [isAddModalOpen, selectedMember, onBack]);

  // Load group details & members
  const loadGroupData = useCallback(
    async (showLoading = true) => {
      if (!groupId || isLoadingRef.current) return;
      isLoadingRef.current = true;
      if (showLoading) {
        setIsLoading(true);
      }
      setErrorMessage(null);

      try {
        const [details, memberList] = await Promise.all([
          groupsApi.getGroupDetails(groupId),
          groupsApi.getGroupMembers(groupId),
        ]);
        setGroup(details);
        const memberArray = Array.isArray(memberList)
          ? memberList
          : (memberList as any)?.members && Array.isArray((memberList as any).members)
          ? (memberList as any).members
          : [];
        setMembers(memberArray);

        if (onGroupUpdatedRef.current && details) {
          onGroupUpdatedRef.current(details);
        }
      } catch (err: any) {
        console.warn('[GroupInfoScreen] Failed to load group data:', err);
        setErrorMessage(err?.message || 'Gagal memuat informasi grup');
      } finally {
        setIsLoading(false);
        isLoadingRef.current = false;
      }
    },
    [groupId]
  );

  useEffect(() => {
    loadGroupData(true);
  }, [loadGroupData]);


  // Determine current user's role in this group
  const myRole = group?.my_role || members.find((m) => m.user_id === currentUser?.id)?.role;
  const isCreator = myRole === 'creator';
  const isAdmin = myRole === 'admin' || isCreator;

  // Open Add Member Modal & search contacts
  const handleOpenAddModal = async () => {
    setIsAddModalOpen(true);
    setSelectedUserIds([]);
    setContactSearchQuery('');
    setIsSearchingContacts(true);

    try {
      const users = await searchUsers('a');
      const existingMemberIds = new Set(members.map((m) => m.user_id));
      const filtered = (users || []).filter(
        (u) => !existingMemberIds.has(u.id) && u.id !== currentUser?.id
      );
      setAvailableContacts(filtered);
    } catch (err) {
      console.warn('[GroupInfoScreen] Search users failed:', err);
      setAvailableContacts([]);
    } finally {
      setIsSearchingContacts(false);
    }
  };

  const handleSearchContacts = async (query: string) => {
    setContactSearchQuery(query);
    setIsSearchingContacts(true);
    try {
      const users = await searchUsers(query.trim() || 'a');
      const existingMemberIds = new Set(members.map((m) => m.user_id));
      const filtered = (users || []).filter(
        (u) => !existingMemberIds.has(u.id) && u.id !== currentUser?.id
      );
      setAvailableContacts(filtered);
    } catch (err) {
      console.warn('[GroupInfoScreen] Search users failed:', err);
    } finally {
      setIsSearchingContacts(false);
    }
  };

  const handleToggleSelectUser = (userId: string) => {
    setSelectedUserIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const handleConfirmAddMembers = async () => {
    if (selectedUserIds.length === 0 || isAddingMembers) return;
    setIsAddingMembers(true);

    try {
      await groupsApi.addGroupMembers(groupId, selectedUserIds);
      setIsAddModalOpen(false);
      setSelectedUserIds([]);
      await loadGroupData(false);
      Alert.alert('Sukses', 'Anggota berhasil ditambahkan ke grup');
    } catch (err: any) {
      console.warn('[GroupInfoScreen] Add members failed:', err);
      Alert.alert('Gagal', err?.message || 'Gagal menambahkan anggota');
    } finally {
      setIsAddingMembers(false);
    }
  };

  // Member Management Actions
  const handleMemberPress = (member: GroupMember) => {
    const isSelf = member.user_id === currentUser?.id;
    if (isSelf) return; // Cannot manage self from member list

    // Check if current user has privilege to manage this target member
    if (isCreator) {
      // Creator can manage everyone
      setSelectedMember(member);
    } else if (isAdmin) {
      // Admin can only manage ordinary members (not creator or other admins)
      if (member.role === 'member') {
        setSelectedMember(member);
      }
    }
  };

  const handleChangeRole = async (targetRole: 'admin' | 'member') => {
    if (!selectedMember || isActionLoading) return;
    setIsActionLoading(true);

    try {
      await groupsApi.updateMemberRole(groupId, selectedMember.user_id, targetRole);
      setSelectedMember(null);
      await loadGroupData(false);
      Alert.alert(
        'Sukses',
        `Peran ${selectedMember.display_name || selectedMember.username} berhasil diubah menjadi ${
          targetRole === 'admin' ? 'Admin' : 'Anggota'
        }`
      );
    } catch (err: any) {
      console.warn('[GroupInfoScreen] Change role failed:', err);
      Alert.alert('Gagal', err?.message || 'Gagal mengubah peran anggota');
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleKickMember = () => {
    if (!selectedMember || isActionLoading) return;
    const targetName = selectedMember.display_name || selectedMember.username;

    Alert.alert(
      'Keluarkan Anggota',
      `Apakah Anda yakin ingin mengeluarkan ${targetName} dari grup?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluarkan',
          style: 'destructive',
          onPress: async () => {
            setIsActionLoading(true);
            try {
              await groupsApi.removeGroupMember(groupId, selectedMember.user_id);
              setSelectedMember(null);
              await loadGroupData(false);
              Alert.alert('Sukses', `${targetName} telah dikeluarkan dari grup`);
            } catch (err: any) {
              console.warn('[GroupInfoScreen] Kick member failed:', err);

              Alert.alert('Gagal', err?.message || 'Gagal mengeluarkan anggota');
            } finally {
              setIsActionLoading(false);
            }
          },
        },
      ]
    );
  };

  // Leave Group
  const handleLeaveGroup = () => {
    if (isCreator && members.length > 1) {
      Alert.alert(
        'Tidak Dapat Keluar',
        'Anda adalah pembuat grup. Alihkan status pembuat ke anggota lain terlebih dahulu sebelum keluar dari grup.'
      );
      return;
    }

    Alert.alert(
      'Keluar dari Grup',
      'Apakah Anda yakin ingin keluar dari grup ini? Anda tidak akan lagi menerima pesan dari grup ini.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Keluar',
          style: 'destructive',
          onPress: async () => {
            if (!currentUser?.id) return;
            try {
              await groupsApi.leaveGroup(groupId, currentUser.id);
              if (onLeaveSuccess) {
                onLeaveSuccess();
              } else {
                onBack();
              }
            } catch (err: any) {
              console.warn('[GroupInfoScreen] Leave group failed:', err);
              Alert.alert('Gagal', err?.message || 'Gagal keluar dari grup');
            }
          },
        },
      ]
    );
  };

  const renderRoleBadge = (role: string) => {
    if (role === 'creator') {
      return (
        <View style={[styles.roleBadge, styles.creatorBadge]}>
          <Text style={styles.creatorBadgeText}>👑 Pembuat</Text>
        </View>
      );
    }
    if (role === 'admin') {
      return (
        <View style={[styles.roleBadge, styles.adminBadge]}>
          <Text style={styles.adminBadgeText}>🛡️ Admin</Text>
        </View>
      );
    }
    return (
      <View style={[styles.roleBadge, styles.memberBadge]}>
        <Text style={styles.memberBadgeText}>Anggota</Text>
      </View>
    );
  };

  const renderMemberRow = ({ item }: { item: GroupMember }) => {
    const isSelf = item.user_id === currentUser?.id;
    const canManageThisUser =
      !isSelf && (isCreator || (isAdmin && item.role === 'member'));

    return (
      <TouchableOpacity
        style={styles.memberRow}
        onPress={() => handleMemberPress(item)}
        disabled={!canManageThisUser}
        activeOpacity={canManageThisUser ? 0.7 : 1}
      >
        <Avatar
          name={item.display_name || item.username}
          avatarUrl={item.avatar_url}
          size={46}
        />
        <View style={styles.memberInfo}>
          <View style={styles.memberNameRow}>
            <Text style={styles.memberDisplayName} numberOfLines={1}>
              {item.display_name || item.username}
            </Text>
            {item.is_verified && <Text style={styles.verifiedBadge}>✓</Text>}
            {isSelf && <Text style={styles.meTag}> (Anda)</Text>}
          </View>
          <Text style={styles.memberUsername} numberOfLines={1}>
            @{item.username}
          </Text>
        </View>

        <View style={styles.memberMetaRow}>
          {renderRoleBadge(item.role)}
          {canManageThisUser && <Text style={styles.manageChevron}>›</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backButton} onPress={onBack}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Info Grup</Text>
        </View>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
          <Text style={styles.loadingText}>Memuat info grup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            Info Grup
          </Text>
        </View>
      </View>

      {errorMessage && (
        <View style={styles.errorBanner}>
          <Text style={styles.errorBannerText}>{errorMessage}</Text>
        </View>
      )}

      <ScrollView style={styles.contentScroll} showsVerticalScrollIndicator={false}>
        {/* Profile Card */}
        <View style={styles.profileSection}>
          <Avatar
            name={group?.title || 'Grup'}
            avatarUrl={group?.avatar_url}
            size={80}
            isGroup={true}
          />
          <Text style={styles.groupTitleText}>{group?.title || 'Grup'}</Text>
          {group?.group_username ? (
            <Text style={styles.groupUsernameText}>@{group.group_username}</Text>
          ) : null}

          {group?.description ? (
            <Text style={styles.groupDescText}>{group.description}</Text>
          ) : (
            <Text style={styles.noDescText}>Belum ada deskripsi grup</Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.createdDateText}>
              Dibuat pada {formatDate(group?.created_at)}
            </Text>
          </View>
        </View>

        {/* Action Buttons (Add Members & Leave) */}
        <View style={styles.actionButtonsSection}>
          {isAdmin && (
            <TouchableOpacity
              style={styles.actionCardButton}
              onPress={handleOpenAddModal}
              activeOpacity={0.7}
            >
              <Text style={styles.actionCardIcon}>👥➕</Text>
              <Text style={styles.actionCardText}>Tambah Anggota</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity
            style={[styles.actionCardButton, styles.leaveCardButton]}
            onPress={handleLeaveGroup}
            activeOpacity={0.7}
          >
            <Text style={styles.leaveCardIcon}>🚪</Text>
            <Text style={styles.leaveCardText}>Keluar dari Grup</Text>
          </TouchableOpacity>
        </View>

        {/* Member Section Header */}
        <View style={styles.membersSectionHeader}>
          <Text style={styles.membersSectionTitle}>
            Daftar Anggota ({members.length})
          </Text>
        </View>

        {/* Member List */}
        <View style={styles.membersContainer}>
          {members.map((item) => (
            <React.Fragment key={item.user_id}>
              {renderMemberRow({ item })}
            </React.Fragment>
          ))}
        </View>

        <View style={styles.footerSpacing} />
      </ScrollView>

      {/* Modal: Tambah Anggota */}
      <Modal
        visible={isAddModalOpen}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setIsAddModalOpen(false)}
      >
        <SafeAreaView style={styles.modalSafeArea}>
          <View style={styles.modalHeader}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => setIsAddModalOpen(false)}
            >
              <Text style={styles.backButtonText}>←</Text>
            </TouchableOpacity>
            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>Tambah Anggota</Text>
              <Text style={styles.headerSubtitle}>
                {selectedUserIds.length > 0
                  ? `${selectedUserIds.length} kontak dipilih`
                  : 'Pilih kontak untuk ditambahkan'}
              </Text>
            </View>
            <TouchableOpacity
              style={[
                styles.confirmAddButton,
                (selectedUserIds.length === 0 || isAddingMembers) &&
                  styles.confirmAddButtonDisabled,
              ]}
              onPress={handleConfirmAddMembers}
              disabled={selectedUserIds.length === 0 || isAddingMembers}
            >
              {isAddingMembers ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.confirmAddText}>Tambah</Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Search Bar in Modal */}
          <View style={styles.modalSearchContainer}>
            <View style={styles.searchBar}>
              <Text style={styles.searchIcon}>🔍</Text>
              <TextInput
                style={styles.searchInput}
                placeholder="Cari kontak..."
                placeholderTextColor={colors.textMuted}
                value={contactSearchQuery}
                onChangeText={handleSearchContacts}
                autoCapitalize="none"
              />
              {isSearchingContacts && (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              )}
            </View>
          </View>

          {/* Contacts List */}
          <FlatList
            data={availableContacts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.modalContactList}
            renderItem={({ item }) => {
              const isSelected = selectedUserIds.includes(item.id);
              return (
                <TouchableOpacity
                  style={[
                    styles.modalContactItem,
                    isSelected && styles.modalContactItemSelected,
                  ]}
                  onPress={() => handleToggleSelectUser(item.id)}
                  activeOpacity={0.7}
                >
                  <Avatar
                    name={item.display_name || item.username}
                    avatarUrl={item.avatar_url}
                    size={46}
                  />
                  <View style={styles.contactInfo}>
                    <Text style={styles.contactDisplayName} numberOfLines={1}>
                      {item.display_name || item.username}
                    </Text>
                    <Text style={styles.contactUsername} numberOfLines={1}>
                      @{item.username}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.checkbox,
                      isSelected && styles.checkboxSelected,
                    ]}
                  >
                    {isSelected && <Text style={styles.checkMark}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              !isSearchingContacts ? (
                <View style={styles.emptyContacts}>
                  <Text style={styles.emptyContactsText}>
                    Tidak ada kontak baru yang dapat ditambahkan.
                  </Text>
                </View>
              ) : null
            }
          />
        </SafeAreaView>
      </Modal>

      {/* Modal / Action Sheet: Manajemen Anggota */}
      <Modal
        visible={Boolean(selectedMember)}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setSelectedMember(null)}
      >
        <TouchableOpacity
          style={styles.actionSheetOverlay}
          activeOpacity={1}
          onPress={() => setSelectedMember(null)}
        >
          <View style={styles.actionSheetCard}>
            <View style={styles.actionSheetHeader}>
              <Text style={styles.actionSheetTitle} numberOfLines={1}>
                {selectedMember?.display_name || selectedMember?.username}
              </Text>
              <Text style={styles.actionSheetSubtitle}>
                Peran saat ini: {selectedMember?.role}
              </Text>
            </View>

            {isCreator && selectedMember?.role === 'member' && (
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleChangeRole('admin')}
                disabled={isActionLoading}
              >
                <Text style={styles.sheetOptionText}>🛡️ Jadikan Admin Grup</Text>
              </TouchableOpacity>
            )}

            {isCreator && selectedMember?.role === 'admin' && (
              <TouchableOpacity
                style={styles.sheetOption}
                onPress={() => handleChangeRole('member')}
                disabled={isActionLoading}
              >
                <Text style={styles.sheetOptionText}>👤 Turunkan dari Admin</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.sheetOption, styles.sheetOptionDestructive]}
              onPress={handleKickMember}
              disabled={isActionLoading}
            >
              <Text style={styles.sheetOptionDestructiveText}>
                🚫 Keluarkan dari Grup
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.sheetCancelOption}
              onPress={() => setSelectedMember(null)}
            >
              <Text style={styles.sheetCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  backButton: {
    padding: spacing.xs,
    marginRight: spacing.sm,
  },
  backButtonText: {
    fontSize: 22,
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
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
    marginTop: spacing.sm,
  },
  errorBanner: {
    backgroundColor: colors.tintError10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.colorError,
  },
  errorBannerText: {
    ...typography.caption,
    color: colors.colorError,
  },
  contentScroll: {
    flex: 1,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgSurface,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  groupTitleText: {
    ...typography.h2,
    color: colors.textPrimary,
    marginTop: spacing.md,
    textAlign: 'center',
  },
  groupUsernameText: {
    ...typography.caption,
    color: colors.colorCyanNeon,
    marginTop: 2,
  },
  groupDescText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    marginTop: spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
  },
  noDescText: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
    marginTop: spacing.sm,
  },
  metaRow: {
    marginTop: spacing.md,
  },
  createdDateText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  actionButtonsSection: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    gap: spacing.sm,
    backgroundColor: colors.bgBase,
  },
  actionCardButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionCardIcon: {
    fontSize: 18,
    marginRight: spacing.md,
  },
  actionCardText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  leaveCardButton: {
    borderColor: colors.tintError20,
  },
  leaveCardIcon: {
    fontSize: 18,
    marginRight: spacing.md,
  },
  leaveCardText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.colorDanger,
  },
  membersSectionHeader: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase,
  },
  membersSectionTitle: {
    ...typography.caption,
    color: colors.textMuted,
    textTransform: 'uppercase',
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  membersContainer: {
    backgroundColor: colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  memberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgBase,
  },
  memberInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  memberNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  memberDisplayName: {
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
  meTag: {
    ...typography.caption,
    color: colors.textMuted,
    fontStyle: 'italic',
  },
  memberUsername: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  memberMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  roleBadge: {
    paddingHorizontal: spacing.xs + 2,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  creatorBadge: {
    backgroundColor: 'rgba(168, 85, 247, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(168, 85, 247, 0.4)',
  },
  creatorBadgeText: {
    ...typography.caption,
    color: '#c084fc',
    fontWeight: '700',
    fontSize: 11,
  },
  adminBadge: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
  },
  adminBadgeText: {
    ...typography.caption,
    color: colors.accentPrimary,
    fontWeight: '700',
    fontSize: 11,
  },
  memberBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  memberBadgeText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  manageChevron: {
    fontSize: 20,
    color: colors.textMuted,
    marginLeft: spacing.xs,
  },
  footerSpacing: {
    height: 40,
  },
  modalSafeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  modalHeader: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  confirmAddButton: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
    borderRadius: radius.md,
    minWidth: 64,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmAddButtonDisabled: {
    opacity: 0.4,
  },
  confirmAddText: {
    ...typography.body,
    fontWeight: '700',
    color: '#ffffff',
  },
  modalSearchContainer: {
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
  modalContactList: {
    paddingBottom: spacing.xxl,
  },
  modalContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  modalContactItemSelected: {
    backgroundColor: colors.tintAccent10,
  },
  contactInfo: {
    flex: 1,
    marginLeft: spacing.md,
  },
  contactDisplayName: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
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
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'flex-end',
  },
  actionSheetCard: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.lg,
    borderTopWidth: 1,
    borderColor: colors.borderSubtle,
  },
  actionSheetHeader: {
    alignItems: 'center',
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.xs,
  },
  actionSheetTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  actionSheetSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 2,
  },
  sheetOption: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    alignItems: 'center',
  },
  sheetOptionText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  sheetOptionDestructive: {
    borderBottomWidth: 0,
  },
  sheetOptionDestructiveText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.colorDanger,
  },
  sheetCancelOption: {
    marginTop: spacing.md,
    paddingVertical: spacing.md,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: radius.md,
    alignItems: 'center',
  },
  sheetCancelText: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textSecondary,
  },
});
