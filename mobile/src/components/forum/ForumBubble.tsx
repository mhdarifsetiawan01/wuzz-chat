/**
 * ForumBubble — tombol mengambang di beranda untuk membuat forum dengan cepat.
 * Alur: bubble → sheet → (pilih grup yang dikelola) → CreateSubGroupModal → masuk ke topik.
 * Dua pilihan: "Forum saya" (GET /api/forums/mine) dan "Buat forum baru".
 *
 * Multi-tenant: daftar grup berasal dari percakapan user sendiri (server sudah memfilter tenant),
 * klien tidak mengirim atau meng-hardcode tenant.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { subgroupsApi } from '../../api/subgroups';
import { ForumListState, needsForumReview } from '../../services/forumLifecycle';
import { groupsApi } from '../../api/groups';
import type { Conversation, GroupRole, MyForum, SubGroup } from '../../api/types';
import { consumePendingForumGroup } from '../../services/forumCreateIntent';
import { ColorTokens, spacing, useTheme, useThemedStyles } from '../../theme';
import { FAB_RIGHT, FAB_SIZE, getFabBottom, makeFabStyle } from '../../theme/fab';
import { ActionMenuItem, BottomSheetModal } from '../BottomSheetModal';
import { CreateSubGroupModal } from '../CreateSubGroupModal';
import { Icon } from '../Icon';
import { MemoryArchiveModal } from '../memory/MemoryArchiveModal';
import { ForumGroupPicker } from './ForumGroupPicker';
import { MyForumsView } from './MyForumsView';

export interface ForumBubbleProps {
  conversations: Conversation[];
  /** Membuka layar buat grup; setelah selesai, beranda otomatis membuka form forum. */
  onCreateGroupForForum: () => void;
  /** Masuk ke topik yang baru dibuat. */
  onEnterForum: (subConversation: Conversation, parentGroup: Conversation) => void;
}

type SheetStep = 'hub' | 'picker' | 'mine' | 'review' | null;

const isGroupChat = (c: Conversation): boolean =>
  (c.type === 'group' || c.is_group === true) && !c.is_subgroup && !c.parent_id;

// Daftar obrolan dari server membawa peran di `role`; `my_role` datang dari detail grup atau objek buatan klien.
const roleOf = (c: Conversation): GroupRole | undefined => c.my_role ?? c.role;

const canManage = (c: Conversation): boolean => {
  const role = roleOf(c);
  return role === 'admin' || role === 'creator';
};

export const ForumBubble: React.FC<ForumBubbleProps> = ({
  conversations,
  onCreateGroupForForum,
  onEnterForum,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [step, setStep] = useState<SheetStep>(null);
  const [targetGroup, setTargetGroup] = useState<Conversation | null>(null);
  const [memoryEnabled, setMemoryEnabled] = useState(false);
  const [memoryTarget, setMemoryTarget] = useState<{ groupId: string; title: string; role?: GroupRole; forumId: string; draftId?: string; memoryId?: string; session: string | null } | null>(null);
  const { user, token } = useAuth();
  const currentSession = useRef(token);
  currentSession.current = token;
  const [snapshot, setSnapshot] = useState<{session: string | null; items: MyForum[]; failed: boolean} | null>(null);
  const forumState = useMemo(() => new ForumListState((items, failed) => {
    if (currentSession.current === token && mountedRef.current) setSnapshot({ session: token, items, failed });
  }), [token, user?.id]);
  const items = snapshot?.session === token ? snapshot.items : [];
  const reviewCount = items.filter(needsForumReview).length;
  const refreshForums = useCallback(() => { void forumState.refresh(subgroupsApi.listMyForums); }, [forumState]);
  useFocusEffect(useCallback(() => { refreshForums(); return () => forumState.cancel(); }, [forumState, refreshForums]));
  useEffect(() => () => forumState.cancel(), [forumState]);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshForums();
    });
    return () => subscription.remove();
  }, [refreshForums]);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const groups = useMemo(() => conversations.filter(isGroupChat), [conversations]);
  const managedGroups = useMemo(() => groups.filter(canManage), [groups]);

  // Buka form untuk grup tertentu; teks pengenal AI Memory hanya bila server menyatakan aktif.
  const openForm = useCallback((group: Conversation) => {
    setMemoryEnabled(group.memory_enabled === true);
    setTargetGroup(group);
    setStep(null);
    if (group.memory_enabled === true) return;
    groupsApi.getGroupDetails(group.id)
      .then((details) => {
        if (mountedRef.current && details?.memory_enabled === true) setMemoryEnabled(true);
      })
      .catch(() => { /* petunjuk opsional; abaikan bila gagal */ });
  }, []);

  // Kembali dari "Buat grup baru": langsung lanjut membuat forum di grup tersebut.
  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingForumGroup();
      if (pending) openForm(pending);
    }, [openForm]),
  );

  const handleChooseCreate = useCallback(() => {
    if (managedGroups.length === 1) {
      openForm(managedGroups[0]);
      return;
    }
    setStep('picker');
  }, [managedGroups, openForm]);

  const handleCreateGroup = useCallback(() => {
    setStep(null);
    onCreateGroupForForum();
  }, [onCreateGroupForForum]);

  // Membuka topik dari "Forum saya"; percakapan grup induk dicari dari daftar obrolan (peran induk benar).
  const handleOpenForum = useCallback((forum: MyForum) => {
    const parent: Conversation = groups.find((g) => g.id === forum.parent_id) ?? {
      id: forum.parent_id,
      room_id: forum.parent_id,
      title: forum.parent_title,
      type: 'group',
      is_group: true,
    };
    const conv: Conversation = {
      id: forum.id,
      room_id: forum.id,
      title: forum.title,
      name: forum.title,
      description: forum.description,
      type: 'subgroup',
      is_subgroup: true,
      parent_id: forum.parent_id,
      member_count: forum.member_count,
      my_role: forum.my_role,
    };
    setStep(null);
    onEnterForum(conv, parent);
  }, [groups, onEnterForum]);

  const handleOpenMemory = useCallback((forum: MyForum) => {
    setStep(null);
    setMemoryTarget({ groupId: forum.parent_id, title: forum.parent_title, role: forum.parent_role, forumId: forum.id, draftId: needsForumReview(forum) ? forum.draft_id : undefined, memoryId: forum.memory_id, session: token });
  }, [token]);

  const handleCreated = useCallback((sub: SubGroup) => {
    const parent = targetGroup;
    setTargetGroup(null);
    if (!parent) return;
    const conv: Conversation = {
      id: sub.id,
      room_id: sub.id,
      title: sub.title,
      name: sub.title,
      description: sub.description,
      type: 'subgroup',
      is_subgroup: true,
      parent_id: parent.id,
      member_count: sub.member_count || 1,
      my_role: sub.my_role ?? roleOf(parent),
    };
    onEnterForum(conv, parent);
  }, [targetGroup, onEnterForum]);

  return (
    <>
      <TouchableOpacity
        style={[styles.bubble, { bottom: getFabBottom(insets.bottom) + FAB_SIZE + spacing.md }]}
        onPress={() => { refreshForums(); setStep('hub'); }}
        activeOpacity={0.82}
        accessibilityRole="button"
        accessibilityLabel={reviewCount ? `Forum, ${reviewCount} draf perlu ditinjau` : 'Forum'}
      >
        <Icon name="forum" size={22} color={colors.textOnAccent} />
        {reviewCount > 0 ? <Text style={styles.badge}>{reviewCount}</Text> : null}
      </TouchableOpacity>

      <BottomSheetModal
        visible={step !== null}
        onClose={() => setStep(null)}
        title={step === 'picker' ? 'Buat Forum Baru' : step === 'review' ? 'Perlu Ditinjau' : step === 'mine' ? 'Forum Saya' : 'Forum'}
      >
        {step === 'mine' || step === 'review' ? (
          <MyForumsView
            items={items}
            failed={snapshot?.session === token && snapshot.failed}
            isLoading={snapshot?.session !== token}
            load={refreshForums}
            reviewOnly={step === 'review'}
            onOpenForum={handleOpenForum}
            onOpenMemory={handleOpenMemory}
            onCreateForum={handleChooseCreate}
          />
        ) : step === 'picker' ? (
          <ForumGroupPicker
            managedGroups={managedGroups}
            hasAnyGroup={groups.length > 0}
            onPick={openForm}
            onCreateGroup={handleCreateGroup}
          />
        ) : (
          <View>
            <Text style={styles.explainer}>
              Forum adalah topik diskusi berbatas waktu di dalam grup. Riwayat tetap dapat dibaca setelah forum berakhir.
            </Text>
            <ActionMenuItem
              icon={<Icon name="forum" size={20} color={colors.accentPrimary} />}
              label="Forum saya"
              subtitle="Topik yang kamu ikuti, aktif dan berakhir"
              onPress={() => setStep('mine')}
            />
            {reviewCount > 0 ? <ActionMenuItem
              icon={<Icon name="bulb" size={20} color={colors.accentPrimary} />}
              label="Perlu Ditinjau"
              subtitle={`${reviewCount} draf di forum yang Anda ikuti`}
              onPress={() => setStep('review')}
            /> : null}
            <ActionMenuItem
              icon={<Icon name="plus" size={20} color={colors.accentPrimary} />}
              label="Buat forum baru"
              subtitle="Pilih grup, lalu mulai topik"
              onPress={handleChooseCreate}
            />
          </View>
        )}
      </BottomSheetModal>

      {memoryTarget && memoryTarget.session === token && (
        <MemoryArchiveModal
          visible
          groupId={memoryTarget.groupId}
          groupTitle={memoryTarget.title}
          currentUserRole={memoryTarget.role}
          initialForumId={memoryTarget.draftId ? undefined : memoryTarget.forumId}
          initialMemoryId={memoryTarget.memoryId}
          initialDraftId={memoryTarget.draftId}
          initialDraftForumId={memoryTarget.forumId}
          onChanged={refreshForums}
          onClose={() => { setMemoryTarget(null); refreshForums(); }}
        />
      )}

      {targetGroup && (
        <CreateSubGroupModal
          visible
          parentGroupId={targetGroup.id}
          parentGroupTitle={targetGroup.title || targetGroup.name || 'Grup'}
          showMemoryHint={memoryEnabled}
          onClose={() => setTargetGroup(null)}
          onCreated={handleCreated}
        />
      )}
    </>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  badge: { position: 'absolute', top: -4, right: -4, borderRadius: 12, minWidth: 20, textAlign: 'center', padding: 2, backgroundColor: colors.unreadBadgeBg, color: colors.unreadBadgeText, fontSize: 12, fontWeight: '700' },
  bubble: {
    ...makeFabStyle(colors),
    right: FAB_RIGHT + (FAB_SIZE - 44) / 2,
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  explainer: {
    fontSize: 13,
    lineHeight: 19,
    color: colors.textSecondary,
    marginBottom: spacing.lg,
  },
});
