/**
 * MemoryArchiveModal — Arsip Memori Grup (AI Memory) di mobile.
 *
 * Satu BottomSheetModal dengan tumpukan tampilan internal (tanpa sheet bersarang):
 *  - Daftar arsip memori terverifikasi (semua anggota grup)
 *  - Tab "Perlu Ditinjau" untuk admin/creator → MemoryReviewView
 *  - Detail memori → MemoryDetailView
 *
 * Prinsip: "AI captures. Humans validate. Wuzz remembers." Hanya memori yang sudah disetujui admin
 * tampil ke anggota; draf hanya terlihat oleh admin/creator (ditegakkan di backend).
 */

import { useNavigation } from '@react-navigation/native';
import { sourceChatParams } from '../../services/sourceNavigation';
import { useAuth } from '../../context/AuthContext';
import { RootStackNavigationProp } from '../../navigation/types';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { BottomSheetModal } from '../BottomSheetModal';
import { Button } from '../Button';
import { Icon } from '../Icon';
import {
  memoryApi,
  MEMORY_PAGE_SIZE,
  ApprovedMemoryListItem,
  MemoryDraftListItem,
} from '../../api/memory';
import { GroupRole } from '../../api/types';
import { MemoryConfidenceBadge } from './MemoryConfidenceBadge';
import { MemoryDetailView } from './MemoryDetailView';
import { MemoryReviewView } from './MemoryReviewView';
import { validateMemoryDraftTarget, memoryDraftTargetError } from './memoryDraftTarget';
import { formatMemoryDate } from './memoryFormat';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens, makeTypography } from '../../theme';

export interface MemoryArchiveModalProps {
  visible: boolean;
  /** ID grup INDUK (bukan sub_*). */
  groupId: string;
  groupTitle: string;
  currentUserRole: GroupRole | undefined;
  /** Bila diisi, langsung membuka detail memori topik ini begitu arsip termuat (sekali per pembukaan). */
  initialForumId?: string;
  initialMemoryId?: string;
  initialDraftId?: string;
  initialDraftForumId?: string;
  onClose: () => void;
  onChanged?: () => void;
}

type Tab = 'archive' | 'review';
type View_ =
  | { kind: 'list' }
  | { kind: 'detail'; id: string }
  | { kind: 'review'; id: string };

const SHEET_CONTENT_HEIGHT = Math.round(Dimensions.get('window').height * 0.68);

export const MemoryArchiveModal: React.FC<MemoryArchiveModalProps> = ({
  visible,
  groupId,
  groupTitle,
  currentUserRole,
  initialForumId,
  initialMemoryId,
  initialDraftId,
  initialDraftForumId,
  onClose,
  onChanged,
}) => {
  const { token } = useAuth();
  const sourceOpeningRef = useRef(false);
  useEffect(() => { sourceOpeningRef.current = false; }, [visible, groupId]);
  const navigation = useNavigation<RootStackNavigationProp<'Chat'>>();
  const openSource = (forumId: string, messageId: string, title?: string, sourceGroupId?: string) => {
    if (sourceOpeningRef.current || sourceGroupId !== groupId) return;
    const params = sourceChatParams(groupId, groupTitle, forumId, messageId, title);
    if (!params) return;
    sourceOpeningRef.current = true;
    onClose();
    navigation.push('Chat', params);
  };
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const initialForumHandledRef = useRef(false);
  const initialDraftHandledRef = useRef(false);
  const isAdmin = currentUserRole === 'admin' || currentUserRole === 'creator';

  const [tab, setTab] = useState<Tab>('archive');
  const [view, setView] = useState<View_>({ kind: 'list' });
  const [memories, setMemories] = useState<ApprovedMemoryListItem[]>([]);
  const [drafts, setDrafts] = useState<MemoryDraftListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [hasMore, setHasMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);

  const loadFirstPage = useCallback(
    async (silent = false) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      if (!silent) setIsLoading(true);
      setError('');
      try {
        const [archive, pending] = await Promise.all([
          memoryApi.listApproved(groupId, 0, controller.signal),
          isAdmin
            ? memoryApi.listDrafts(groupId, controller.signal).catch(() => [] as MemoryDraftListItem[])
            : Promise.resolve([] as MemoryDraftListItem[]),
        ]);
        if (controller.signal.aborted) return;
        setMemories(archive);
        setHasMore(archive.length >= MEMORY_PAGE_SIZE);
        setDrafts(pending);
        if (initialDraftId && !initialDraftHandledRef.current) {
          if (!isAdmin) {
            setError(memoryDraftTargetError({ status: 403 }));
            return;
          }
          // Fetch by ID: a draft need not be in the first pending page.
          const draft = await memoryApi.getDraft(initialDraftId, controller.signal);
          if (controller.signal.aborted) return;
          const invalid = validateMemoryDraftTarget(draft, groupId, initialDraftForumId);
          initialDraftHandledRef.current = true;
          if (invalid) setError(invalid);
          else {
            setTab('review');
            setView({ kind: 'review', id: initialDraftId });
          }
        }
        // Dibuka dari "Forum saya": lompat ke memori topik itu; bila tidak ada di halaman pertama, tetap di daftar.
        if ((initialMemoryId || initialForumId) && !initialForumHandledRef.current) {
          initialForumHandledRef.current = true;
          const hit = archive.find((m) => m.forum_id === initialForumId);
          if (initialMemoryId || hit) setView({ kind: 'detail', id: initialMemoryId || hit!.id });
        }
      } catch (err: any) {
        if (!controller.signal.aborted) setError(initialDraftId ? memoryDraftTargetError(err) : err?.detail || 'Gagal memuat arsip memori.');
      } finally {
        if (!controller.signal.aborted) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [groupId, isAdmin, initialForumId, initialMemoryId, initialDraftId, initialDraftForumId]
  );

  useEffect(() => {
    if (visible) {
      initialForumHandledRef.current = false;
      initialDraftHandledRef.current = false;
      setMemories([]);
      setDrafts([]);
      setTab('archive');
      setView({ kind: 'list' });
      loadFirstPage();
    }
    return () => abortRef.current?.abort();
  }, [visible, loadFirstPage, token]);

  const loadMore = useCallback(async () => {
    if (!hasMore || loadingMoreRef.current || tab !== 'archive') return;
    loadingMoreRef.current = true;
    try {
      const next = await memoryApi.listApproved(groupId, memories.length);
      setMemories((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        return [...prev, ...next.filter((m) => !seen.has(m.id))];
      });
      setHasMore(next.length >= MEMORY_PAGE_SIZE);
    } catch {
      // Gagal memuat halaman berikutnya: biarkan daftar apa adanya; pengguna bisa tarik untuk menyegarkan.
    } finally {
      loadingMoreRef.current = false;
    }
  }, [groupId, hasMore, memories.length, tab]);

  const backToList = useCallback(() => {
    setView({ kind: 'list' });
  }, []);

  const handleReviewDone = useCallback(() => {
    onChanged?.();
    setView({ kind: 'list' });
    loadFirstPage(true);
  }, [loadFirstPage, onChanged]);

  const title =
    view.kind === 'detail' ? 'Detail Memori' : view.kind === 'review' ? 'Tinjau Draf' : 'Arsip Memori';

  const renderMemory = ({ item }: { item: ApprovedMemoryListItem }) => {
    const isNew = item.has_viewed === false;
    return (
      <TouchableOpacity
        style={styles.row}
        activeOpacity={0.75}
        onPress={() => setView({ kind: 'detail', id: item.id })}
        accessibilityRole="button"
        accessibilityLabel={`Memori ${item.forum_title}${isNew ? ', belum dibaca' : ''}`}
      >
        <View style={styles.rowTop}>
          <Text style={styles.rowTitle} numberOfLines={2}>
            {item.forum_title}
          </Text>
          {isNew ? <View style={styles.newDot} accessibilityLabel="Baru" /> : null}
          <Icon name="forward" size={14} color={colors.textMuted} />
        </View>
        {item.snapshot_summary ? (
          <Text style={styles.rowSummary} numberOfLines={2}>
            {item.snapshot_summary}
          </Text>
        ) : null}
        <View style={styles.rowMeta}>
          {item.snapshot_summary_conf ? <MemoryConfidenceBadge level={item.snapshot_summary_conf} /> : null}
          <Text style={styles.metaText}>
            {item.decisions_count ?? 0} keputusan · {formatMemoryDate(item.approved_at)}
          </Text>
        </View>
        {item.approved_by_name || item.has_human_edits ? (
          <Text style={styles.metaText} numberOfLines={1}>
            {item.approved_by_name ? `Disetujui ${item.approved_by_name}` : ''}
            {item.approved_by_name && item.has_human_edits ? ' · ' : ''}
            {item.has_human_edits ? 'Disunting' : ''}
          </Text>
        ) : null}
      </TouchableOpacity>
    );
  };

  const renderDraft = ({ item }: { item: MemoryDraftListItem }) => (
    <TouchableOpacity
      style={styles.row}
      activeOpacity={0.75}
      onPress={() => setView({ kind: 'review', id: item.draft_id })}
      accessibilityRole="button"
      accessibilityLabel={`Tinjau draf ${item.forum_title}`}
    >
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {item.forum_title}
        </Text>
        <Icon name="forward" size={14} color={colors.textMuted} />
      </View>
      <Text style={styles.metaText}>
        {item.message_count_processed} pesan dianalisis · {formatMemoryDate(item.created_at)}
      </Text>
    </TouchableOpacity>
  );

  const showingDrafts = tab === 'review';
  const listData: (ApprovedMemoryListItem | MemoryDraftListItem)[] = showingDrafts ? drafts : memories;

  const emptyText = showingDrafts
    ? 'Tidak ada draf yang perlu ditinjau.'
    : 'Belum ada memori. Ringkasan topik forum yang sudah disetujui admin akan muncul di sini.';

  return (
    <BottomSheetModal
      visible={visible}
      onClose={onClose}
      title={title}
      avoidKeyboard={view.kind === 'review'}
    >
      <View style={styles.container}>
        {view.kind !== 'list' ? (
          <TouchableOpacity
            style={styles.backRow}
            onPress={backToList}
            accessibilityRole="button"
            accessibilityLabel="Kembali ke daftar"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Icon name="back" size={16} color={colors.accentPrimary} />
            <Text style={styles.backText}>Kembali</Text>
          </TouchableOpacity>
        ) : null}

        {view.kind === 'detail' ? (
          <MemoryDetailView
            key={`${groupId}:${view.id}`}
            onOpenSource={openSource}
            memoryId={view.id}
            canDelete={isAdmin}
            onDeleted={() => {
              onChanged?.();
              setView({ kind: 'list' });
              loadFirstPage(true);
            }}
          />
        ) : null}
        {view.kind === 'review' ? <MemoryReviewView key={`${groupId}:${view.id}`} onOpenSource={openSource} draftId={view.id} onDone={handleReviewDone} /> : null}

        {view.kind === 'list' ? (
          <>
            <Text style={styles.subtitle} numberOfLines={1}>
              {groupTitle}
            </Text>
            {isAdmin ? (
              <View style={styles.tabs}>
                <TouchableOpacity
                  style={[styles.tab, tab === 'archive' && styles.tabActive]}
                  onPress={() => setTab('archive')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'archive' }}
                >
                  <Text style={[styles.tabText, tab === 'archive' && styles.tabTextActive]}>Arsip</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.tab, tab === 'review' && styles.tabActive]}
                  onPress={() => setTab('review')}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: tab === 'review' }}
                >
                  <Text style={[styles.tabText, tab === 'review' && styles.tabTextActive]}>
                    Perlu Ditinjau{drafts.length > 0 ? ` (${drafts.length})` : ''}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {isLoading ? (
              <View style={styles.center}>
                <ActivityIndicator />
              </View>
            ) : error ? (
              <View style={styles.center}>
                <Text style={styles.errorText}>{error}</Text>
                <Button title="Coba Lagi" variant="secondary" onPress={() => loadFirstPage()} />
              </View>
            ) : (
              <FlatList
                data={listData as any[]}
                keyExtractor={(item: any) => item.draft_id ?? item.id}
                renderItem={showingDrafts ? (renderDraft as any) : (renderMemory as any)}
                ItemSeparatorComponent={() => <View style={styles.separator} />}
                ListEmptyComponent={<Text style={styles.emptyText}>{emptyText}</Text>}
                onEndReached={loadMore}
                onEndReachedThreshold={0.4}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={() => {
                      setIsRefreshing(true);
                      loadFirstPage(true);
                    }}
                    tintColor={colors.accentPrimary}
                  />
                }
                showsVerticalScrollIndicator={false}
              />
            )}
          </>
        ) : null}
      </View>
    </BottomSheetModal>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    // Tinggi tetap supaya FlatList bisa menggulir di dalam sheet; flexShrink agar muat saat keyboard muncul.
    container: { height: SHEET_CONTENT_HEIGHT, flexShrink: 1 },
    subtitle: { ...typography.caption, color: colors.textMuted, marginBottom: spacing.sm },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      alignSelf: 'flex-start',
      paddingBottom: spacing.sm,
    },
    backText: { ...typography.captionBold, color: colors.accentPrimary },
    tabs: {
      flexDirection: 'row',
      backgroundColor: colors.bgInput,
      borderRadius: radius.full,
      padding: 3,
      marginBottom: spacing.md,
    },
    tab: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, borderRadius: radius.full },
    tabActive: { backgroundColor: colors.bgCardSolid },
    tabText: { ...typography.captionBold, color: colors.textMuted },
    tabTextActive: { color: colors.textPrimary },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.md },
    errorText: { ...typography.body, color: colors.colorError, textAlign: 'center' },
    emptyText: {
      ...typography.bodySecondary,
      color: colors.textMuted,
      textAlign: 'center',
      paddingVertical: spacing.xl,
      paddingHorizontal: spacing.lg,
    },
    separator: { height: spacing.sm },
    row: {
      backgroundColor: colors.bgCardSolid,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: spacing.md,
      gap: spacing.xs,
    },
    rowTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.sm },
    rowTitle: { ...typography.body, fontWeight: '600', color: colors.textPrimary, flex: 1 },
    rowSummary: { ...typography.bodySecondary, color: colors.textSecondary },
    newDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accentPrimary },
    rowMeta: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
    metaText: { ...typography.caption, color: colors.textMuted },
  });
};
