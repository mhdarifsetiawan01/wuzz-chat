/**
 * SubGroupListModal — M-Mobile-8.2B & 8.2C
 * Bottom-sheet drawer showing all active forum topics under a parent group.
 *
 * Features:
 *  - Real-time TTL countdown badge per topic
 *  - Access control flow: Join (public) / Request (private) / Pending / Admin review
 *  - "Buat Topik Baru" (admin/creator only) → opens CreateSubGroupModal
 *  - Admin join-request review → opens JoinRequestsModal
 *
 * Conforms to:
 *  - Mandatory Dual-Platform Frontend Architecture Rule
 *  - Slow & Flaky Server Resilience Rule (AbortController 15s)
 *  - Immutable UUID-Only Checking (DEC-008 / DEC-031)
 *  - Mandatory Frontend Design System & Token Compliance Rule
 */

import React, {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { subgroupsApi } from '../api/subgroups';
import { SubGroup, GroupRole, Conversation } from '../api/types';
import { Avatar } from './Avatar';
import { CreateSubGroupModal } from './CreateSubGroupModal';
import { JoinRequestsModal } from './JoinRequestsModal';
import { colors } from '../theme/colors';
import { spacing, radius, shadows } from '../theme/spacing';

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SubGroupListModalProps {
  visible: boolean;
  parentGroupId: string;
  parentGroupTitle: string;
  /** Current user's role in the parent group */
  currentUserRole: GroupRole | undefined;
  /** Current user's UUID (immutable) */
  currentUserId: string;
  onClose: () => void;
  /** Called when user successfully joins / is approved for a sub-group */
  onEnterSubGroup: (subGroupConversation: Conversation) => void;
}

// ─── TTL Countdown Helpers ────────────────────────────────────────────────────

/**
 * Returns a human-readable countdown string for the remaining TTL.
 * e.g. "23 jam lagi", "5 hari lagi", "Kedaluwarsa"
 */
function formatTTL(expiresAt: string): string {
  const now = Date.now();
  const diff = new Date(expiresAt).getTime() - now;
  if (diff <= 0) return 'Kedaluwarsa';

  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} menit lagi`;
  const hours = Math.floor(diff / 3_600_000);
  if (hours < 24) return `${hours} jam lagi`;
  const days = Math.floor(diff / 86_400_000);
  return `${days} hari lagi`;
}

function isExpired(expiresAt: string): boolean {
  return new Date(expiresAt).getTime() <= Date.now();
}

// ─── Component ────────────────────────────────────────────────────────────────

export const SubGroupListModal: React.FC<SubGroupListModalProps> = ({
  visible,
  parentGroupId,
  parentGroupTitle,
  currentUserRole,
  currentUserId,
  onClose,
  onEnterSubGroup,
}) => {
  const insets = useSafeAreaInsets();

  const [subGroups, setSubGroups] = useState<SubGroup[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [requestingId, setRequestingId] = useState<string | null>(null);

  // Child modal state
  const [showCreate, setShowCreate] = useState(false);
  const [joinRequestsSubGroup, setJoinRequestsSubGroup] = useState<SubGroup | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const isAdminOrCreator = currentUserRole === 'admin' || currentUserRole === 'creator';

  // ── Load sub-groups ───────────────────────────────────────────────────────

  const loadSubGroups = useCallback(async (silent = false) => {
    if (!visible || !parentGroupId) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), 15_000);

    if (!silent) setIsLoading(true);
    try {
      const data = await subgroupsApi.listSubGroups(parentGroupId, controller.signal);
      const list = Array.isArray(data) ? data : ((data as any)?.subgroups || []);
      setSubGroups(list);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        Alert.alert('Gagal memuat topik', 'Silakan tarik ke bawah untuk mencoba lagi.');
      }
    } finally {
      clearTimeout(timer);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [visible, parentGroupId]);

  useEffect(() => {
    if (visible) loadSubGroups();
    return () => { abortRef.current?.abort(); };
  }, [visible, loadSubGroups]);

  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    loadSubGroups(true);
  }, [loadSubGroups]);

  // ── Join public topic ─────────────────────────────────────────────────────

  const handleJoinPublic = useCallback(async (sub: SubGroup) => {
    if (joiningId) return;
    setJoiningId(sub.id);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await subgroupsApi.joinPublicSubGroup(sub.id, controller.signal);
      // Build a lightweight Conversation object to open ChatScreen
      const conv: Conversation = {
        id: sub.id,
        title: sub.title,
        description: sub.description,
        type: 'subgroup',
        is_subgroup: true,
        member_count: sub.member_count,
        my_role: sub.my_role,
      };
      onClose();
      onEnterSubGroup(conv);
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        Alert.alert('Gagal bergabung', (err as any)?.detail || 'Silakan coba lagi.');
      }
    } finally {
      clearTimeout(timer);
      setJoiningId(null);
    }
  }, [joiningId, onClose, onEnterSubGroup]);

  // ── Open already-joined topic ─────────────────────────────────────────────

  const handleOpenMember = useCallback((sub: SubGroup) => {
    const conv: Conversation = {
      id: sub.id,
      title: sub.title,
      description: sub.description,
      type: 'subgroup',
      is_subgroup: true,
      member_count: sub.member_count,
      my_role: sub.my_role,
    };
    onClose();
    onEnterSubGroup(conv);
  }, [onClose, onEnterSubGroup]);

  // ── Request join for private topic ────────────────────────────────────────

  const handleRequestJoin = useCallback(async (sub: SubGroup) => {
    if (requestingId) return;
    setRequestingId(sub.id);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      await subgroupsApi.requestJoinPrivateSubGroup(sub.id, controller.signal);
      // Update local state: mark as pending
      setSubGroups((prev) =>
        prev.map((s) =>
          s.id === sub.id ? { ...s, has_pending_request: true } : s
        )
      );
    } catch (err: any) {
      if (err?.name !== 'AbortError') {
        Alert.alert('Gagal mengajukan izin', (err as any)?.detail || 'Silakan coba lagi.');
      }
    } finally {
      clearTimeout(timer);
      setRequestingId(null);
    }
  }, [requestingId]);

  // ── Created callback ──────────────────────────────────────────────────────

  const handleSubGroupCreated = useCallback((newSub: SubGroup) => {
    setSubGroups((prev) => [newSub, ...prev]);
  }, []);

  // ── Sorted: active first, expired last ───────────────────────────────────

  const sortedSubGroups = useMemo(() => {
    const list = Array.isArray(subGroups) ? subGroups : [];
    return [...list].sort((a, b) => {
      const aExp = isExpired(a.expires_at) ? 1 : 0;
      const bExp = isExpired(b.expires_at) ? 1 : 0;
      if (aExp !== bExp) return aExp - bExp;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [subGroups]);

  // ── Render each forum topic card ──────────────────────────────────────────

  const renderSubGroup = useCallback(
    ({ item: sub }: { item: SubGroup }) => {
      const expired = isExpired(sub.expires_at) || sub.status === 'expired';
      const ttlLabel = formatTTL(sub.expires_at);
      const isJoining = joiningId === sub.id;
      const isRequesting = requestingId === sub.id;

      return (
        <View style={[styles.card, expired && styles.cardExpired]}>
          {/* Card header */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {sub.title}
              </Text>
              <View style={[styles.accessBadge, !sub.is_public && styles.accessBadgePrivate]}>
                <Text style={styles.accessBadgeText}>
                  {sub.is_public ? '🌐 Terbuka' : '🔒 Privat'}
                </Text>
              </View>
            </View>

            {/* TTL badge */}
            <View style={[styles.ttlBadge, expired && styles.ttlBadgeExpired]}>
              <Text style={[styles.ttlBadgeText, expired && styles.ttlBadgeTextExpired]}>
                ⏱ {ttlLabel}
              </Text>
            </View>
          </View>

          {/* Description */}
          {sub.description ? (
            <Text style={styles.cardDesc} numberOfLines={2}>
              {sub.description}
            </Text>
          ) : null}

          {/* Footer: member count + action */}
          <View style={styles.cardFooter}>
            <Text style={styles.memberCount}>
              👥 {sub.member_count} anggota
            </Text>

            {expired ? (
              <View style={styles.expiredChip}>
                <Text style={styles.expiredChipText}>🔒 Terkunci</Text>
              </View>
            ) : sub.is_member ? (
              // Already a member → open directly
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary]}
                onPress={() => handleOpenMember(sub)}
                activeOpacity={0.8}
              >
                <Text style={styles.actionBtnPrimaryText}>Buka Chat</Text>
              </TouchableOpacity>
            ) : sub.is_public !== false ? (
              // Public topic → join directly
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnPrimary, isJoining && styles.actionBtnDisabled]}
                onPress={() => handleJoinPublic(sub)}
                disabled={!!isJoining}
                activeOpacity={0.8}
              >
                {isJoining ? (
                  <ActivityIndicator size="small" color={colors.textOnAccent} />
                ) : (
                  <Text style={styles.actionBtnPrimaryText}>Gabung & Buka</Text>
                )}
              </TouchableOpacity>
            ) : sub.has_pending_request ? (
              // Private + pending request
              <View style={[styles.actionBtn, styles.actionBtnPending]}>
                <Text style={styles.actionBtnPendingText}>⏳ Menunggu Izin</Text>
              </View>
            ) : (
              // Private + no request yet → request to join
              <TouchableOpacity
                style={[styles.actionBtn, styles.actionBtnSecondary, isRequesting && styles.actionBtnDisabled]}
                onPress={() => handleRequestJoin(sub)}
                disabled={!!isRequesting}
                activeOpacity={0.8}
              >
                {isRequesting ? (
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                ) : (
                  <Text style={styles.actionBtnSecondaryText}>🔒 Minta Izin Gabung</Text>
                )}
              </TouchableOpacity>
            )}
          </View>

          {/* Admin: join-request review button */}
          {isAdminOrCreator && !sub.is_public && !expired && (
            <TouchableOpacity
              style={styles.reviewRequestsBtn}
              onPress={() => setJoinRequestsSubGroup(sub)}
              activeOpacity={0.75}
            >
              <Text style={styles.reviewRequestsBtnText}>
                📋 Tinjau Permohonan Izin
              </Text>
            </TouchableOpacity>
          )}
        </View>
      );
    },
    [joiningId, requestingId, isAdminOrCreator, handleJoinPublic, handleOpenMember, handleRequestJoin]
  );

  const ListEmpty = (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyIcon}>🏛️</Text>
      <Text style={styles.emptyTitle}>Belum Ada Topik</Text>
      <Text style={styles.emptyDesc}>
        {isAdminOrCreator
          ? 'Buat topik forum pertama untuk memulai diskusi terfokus.'
          : 'Admin grup belum membuat topik forum.'}
      </Text>
    </View>
  );

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <>
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        statusBarTranslucent
        onRequestClose={onClose}
      >
        <View style={styles.backdrop}>
          <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
            {/* Header */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <Text style={styles.headerTitle}>🏛️ Forum</Text>
                <Text style={styles.headerSubtitle} numberOfLines={1}>
                  {parentGroupTitle}
                </Text>
              </View>

              <View style={styles.headerActions}>
                {/* Create topic (admin only) */}
                {isAdminOrCreator && (
                  <TouchableOpacity
                    style={styles.createBtn}
                    onPress={() => setShowCreate(true)}
                    activeOpacity={0.8}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={styles.createBtnText}>+ Buat Topik</Text>
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={styles.closeBtn}
                  onPress={onClose}
                  hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                >
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* List */}
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.accentPrimary} />
                <Text style={styles.loadingText}>Memuat topik forum...</Text>
              </View>
            ) : (
              <FlatList
                data={sortedSubGroups}
                keyExtractor={(item) => item.id}
                renderItem={renderSubGroup}
                contentContainerStyle={
                  sortedSubGroups.length === 0 ? { flex: 1 } : { padding: spacing.lg }
                }
                ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
                ListEmptyComponent={ListEmpty}
                showsVerticalScrollIndicator={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handleRefresh}
                    tintColor={colors.accentPrimary}
                  />
                }
              />
            )}
          </View>
        </View>
      </Modal>

      {/* Create sub-group modal */}
      <CreateSubGroupModal
        visible={showCreate}
        parentGroupId={parentGroupId}
        parentGroupTitle={parentGroupTitle}
        onClose={() => setShowCreate(false)}
        onCreated={handleSubGroupCreated}
      />

      {/* Join requests modal (admin only) */}
      {joinRequestsSubGroup && (
        <JoinRequestsModal
          visible={!!joinRequestsSubGroup}
          subGroupId={joinRequestsSubGroup.id}
          subGroupTitle={joinRequestsSubGroup.title}
          onClose={() => setJoinRequestsSubGroup(null)}
          onRequestActioned={() => loadSubGroups(true)}
        />
      )}
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(9, 13, 22, 0.80)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xl,
    paddingBottom: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: { flex: 1 },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: 0.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    marginTop: 2,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  createBtn: {
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    borderRadius: radius.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 2,
  },
  createBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.huge,
    gap: spacing.md,
  },
  loadingText: {
    fontSize: 14,
    color: colors.textMuted,
  },
  // ── Topic card ──────────────────────────────────────────────────────────────
  card: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.lg,
    padding: spacing.lg,
    ...shadows.card,
  },
  cardExpired: {
    opacity: 0.55,
    borderColor: colors.borderSubtle,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  cardTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  accessBadge: {
    backgroundColor: 'rgba(16, 185, 129, 0.12)',
    borderWidth: 1,
    borderColor: colors.colorSuccess,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  accessBadgePrivate: {
    backgroundColor: colors.tintError10,
    borderColor: colors.colorError,
  },
  accessBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.textSecondary,
  },
  ttlBadge: {
    backgroundColor: colors.tintAccent10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  ttlBadgeExpired: {
    backgroundColor: colors.tintError10,
  },
  ttlBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  ttlBadgeTextExpired: {
    color: colors.colorError,
  },
  cardDesc: {
    fontSize: 13,
    color: colors.textSecondary,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  memberCount: {
    fontSize: 12,
    color: colors.textMuted,
  },
  // ── Action buttons ──────────────────────────────────────────────────────────
  actionBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 110,
  },
  actionBtnDisabled: { opacity: 0.55 },
  actionBtnPrimary: {
    backgroundColor: colors.accentPrimary,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  actionBtnSecondary: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorError,
  },
  actionBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorError,
  },
  actionBtnPending: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  actionBtnPendingText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textMuted,
  },
  expiredChip: {
    backgroundColor: colors.tintError10,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  expiredChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorError,
  },
  reviewRequestsBtn: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    alignItems: 'center',
  },
  reviewRequestsBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  // ── Empty state ─────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.huge,
  },
  emptyIcon: { fontSize: 48, marginBottom: spacing.lg },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  emptyDesc: {
    fontSize: 13,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 18,
  },
});
