/**
 * Review satu draf memori oleh admin/creator: sunting butir, hapus Journey Lite, setujui atau tolak.
 * Dipakai di dalam MemoryArchiveModal (tanpa sheet sendiri). Padanan MemoryDraftReviewModal di web.
 */

import { memoryDraftTargetError } from './memoryDraftTarget';
import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { memoryApi, MemoryArtifactItem, MemoryDraftDetail } from '../../api/memory';
import { MemoryConfidenceBadge } from './MemoryConfidenceBadge';
import { Button } from '../Button';
import { Input } from '../Input';
import { Icon } from '../Icon';
import { showAlert } from '../../services/dialog';
import { radius, spacing, useTheme, useThemedStyles, ColorTokens, makeTypography } from '../../theme';
import { formatMemoryDate } from './memoryFormat';

interface Props {
  onOpenSource: (forumId: string, messageId: string, title?: string, groupId?: string) => void;
  draftId: string;
  /** Dipanggil setelah draf selesai ditinjau (disetujui/ditolak) atau sudah diputuskan pihak lain. */
  onDone: () => void;
}

const MAX_EDIT_LENGTH = 2000;

export const MemoryReviewView: React.FC<Props> = ({ draftId, onDone, onOpenSource }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [draft, setDraft] = useState<MemoryDraftDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [hasEdits, setHasEdits] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState('');
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState('');

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError('');
      try {
        const d = await memoryApi.getDraft(draftId, signal);
        if (signal?.aborted) return;
        setDraft(d);
        setHasEdits(d.artifacts.some((a) => a.is_human_edited || a.is_removed));
      } catch (err: any) {
        if (!signal?.aborted) setError(memoryDraftTargetError(err));
      } finally {
        if (!signal?.aborted) setIsLoading(false);
      }
    },
    [draftId]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const patchArtifact = (id: string, patch: Partial<MemoryArtifactItem>) =>
    setDraft((prev) =>
      prev ? { ...prev, artifacts: prev.artifacts.map((a) => (a.id === id ? { ...a, ...patch } : a)) } : prev
    );

  // 409: draf sudah diputuskan admin lain → tutup review dan segarkan daftar.
  const handleActionError = (err: any, fallback: string) => {
    if (err?.status === 409) {
      showAlert('Sudah ditinjau', 'Draf ini sudah disetujui atau ditolak sebelumnya.', [
        { text: 'OK', onPress: onDone },
      ]);
      return;
    }
    showAlert(fallback, err?.detail || 'Silakan coba lagi.');
  };

  const handleSaveEdit = async () => {
    if (!draft || !editingId || isBusy) return;
    const text = editText.trim();
    if (!text) {
      showAlert('Isi kosong', 'Isi butir tidak boleh kosong.');
      return;
    }
    setIsBusy(true);
    try {
      await memoryApi.updateArtifact(draft.id, editingId, text);
      patchArtifact(editingId, { content: text, is_human_edited: true });
      setHasEdits(true);
      setEditingId(null);
    } catch (err: any) {
      handleActionError(err, 'Gagal menyimpan suntingan');
    } finally {
      setIsBusy(false);
    }
  };

  const handleRemoveJourney = () => {
    if (!draft) return;
    showAlert('Hapus Alur Diskusi?', 'Bagian ini tidak akan ikut diterbitkan ke arsip.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            await memoryApi.removeJourney(draft.id);
            setDraft((prev) =>
              prev
                ? {
                    ...prev,
                    artifacts: prev.artifacts.map((a) =>
                      a.type === 'JOURNEY_LITE' ? { ...a, is_removed: true, is_human_edited: true } : a
                    ),
                  }
                : prev
            );
            setHasEdits(true);
          } catch (err: any) {
            handleActionError(err, 'Gagal menghapus');
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  };

  const handleDeleteDraft = () => {
    if (!draft) return;
    showAlert('Hapus draf ini?', 'Draf dan kutipan buktinya dihapus permanen dan tidak bisa dikembalikan.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: async () => {
          setIsBusy(true);
          try {
            await memoryApi.deleteDraft(draft.id);
            onDone();
          } catch (err: any) {
            handleActionError(err, 'Gagal menghapus');
          } finally {
            setIsBusy(false);
          }
        },
      },
    ]);
  };

  const handleApprove = async () => {
    if (!draft || isBusy) return;
    setIsBusy(true);
    try {
      await memoryApi.approveDraft(draft.id, hasEdits);
      onDone();
    } catch (err: any) {
      handleActionError(err, 'Gagal menyetujui');
    } finally {
      setIsBusy(false);
    }
  };

  const handleConfirmReject = async () => {
    if (!draft || isBusy) return;
    setIsBusy(true);
    try {
      await memoryApi.rejectDraft(draft.id, rejectReason.trim());
      onDone();
    } catch (err: any) {
      handleActionError(err, 'Gagal menolak');
    } finally {
      setIsBusy(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !draft) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Draf tidak ditemukan.'}</Text>
        <Button title="Coba Lagi" variant="secondary" onPress={() => load()} />
      </View>
    );
  }

  const isPending = draft.status === 'DRAFT';
  const summary = draft.artifacts.find((a) => a.type === 'SUMMARY' && !a.is_removed);
  const decisions = draft.artifacts.filter((a) => a.type === 'DECISION' && !a.is_removed);
  const journey = draft.artifacts.find((a) => a.type === 'JOURNEY_LITE' && !a.is_removed);

  const renderArtifact = (a: MemoryArtifactItem, canRemove = false) => {
    const isEditing = editingId === a.id;
    return (
      <View key={a.id} style={styles.card}>
        {isEditing ? (
          <>
            <Input
              value={editText}
              onChangeText={setEditText}
              multiline
              maxLength={MAX_EDIT_LENGTH}
              autoFocus
              containerStyle={styles.editInput}
              editable={!isBusy}
            />
            <View style={styles.row}>
              <Button
                title="Batal"
                variant="secondary"
                style={styles.flex}
                onPress={() => setEditingId(null)}
                disabled={isBusy}
              />
              <Button
                title="Simpan"
                style={styles.flex}
                onPress={handleSaveEdit}
                isLoading={isBusy}
                disabled={isBusy}
              />
            </View>
          </>
        ) : (
          <>
            <Text style={styles.body}>{a.content}</Text>
            <View style={styles.row}>
              <MemoryConfidenceBadge level={a.confidence} />
              {a.is_human_edited ? <Text style={styles.edited}>Disunting</Text> : null}
              <View style={styles.flex} />
              {isPending ? (
                <>
                  <TouchableOpacity
                    onPress={() => {
                      setEditingId(a.id);
                      setEditText(a.content);
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    accessibilityRole="button"
                    accessibilityLabel="Sunting butir"
                  >
                    <Icon name="edit" size={18} color={colors.textSecondary} />
                  </TouchableOpacity>
                  {canRemove ? (
                    <TouchableOpacity
                      onPress={handleRemoveJourney}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel="Hapus alur diskusi"
                    >
                      <Icon name="trash" size={18} color={colors.colorError} />
                    </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </View>
            {a.evidences?.map((ev) => (
              <View key={ev.id} style={styles.evidence}>
                <Text style={styles.evidenceText}>“{ev.message_preview}”</Text>
                <Text style={styles.evidenceMeta}>
                  {ev.message_sender_name} · {formatMemoryDate(ev.message_sent_at)}
                </Text>
                {ev.message_id ? <Button title="Lihat Pesan Asli" variant="ghost" onPress={() => onOpenSource(draft.forum_id, ev.message_id, draft.forum_title, draft.group_id)} /> : null}
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  return (
    <View style={styles.flex}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.forumTitle}>{draft.forum_title || 'Topik forum'}</Text>
        <Text style={styles.meta}>
          {draft.message_count_processed} pesan dianalisis · {formatMemoryDate(draft.created_at)}
        </Text>
        {draft.was_truncated ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {draft.truncation_note || 'Diskusi terlalu panjang; hanya sebagian pesan yang dianalisis.'}
            </Text>
          </View>
        ) : null}
        {draft.status === 'APPROVED' ? <Text style={styles.statusOk}>Sudah disetujui</Text> : null}
        {draft.status === 'REJECTED' ? (
          <Text style={styles.statusBad}>
            Ditolak{draft.rejection_reason ? `: ${draft.rejection_reason}` : ''}
          </Text>
        ) : null}

        {summary ? (
          <>
            <Text style={styles.sectionLabel}>Ringkasan</Text>
            {renderArtifact(summary)}
          </>
        ) : null}
        {decisions.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>Keputusan ({decisions.length})</Text>
            {decisions.map((a) => renderArtifact(a))}
          </>
        ) : null}
        {journey ? (
          <>
            <Text style={styles.sectionLabel}>Alur Diskusi</Text>
            {renderArtifact(journey, true)}
          </>
        ) : null}
      </ScrollView>

      {isPending ? (
        <View style={styles.footer}>
          {isRejecting ? (
            <>
              <Input
                placeholder="Alasan penolakan (opsional)"
                value={rejectReason}
                onChangeText={setRejectReason}
                maxLength={500}
                editable={!isBusy}
                containerStyle={styles.rejectInput}
              />
              <View style={styles.row}>
                <Button
                  title="Batal"
                  variant="secondary"
                  style={styles.flex}
                  onPress={() => setIsRejecting(false)}
                  disabled={isBusy}
                />
                <Button
                  title="Tolak Draf"
                  variant="danger"
                  style={styles.flex}
                  onPress={handleConfirmReject}
                  isLoading={isBusy}
                  disabled={isBusy}
                />
              </View>
            </>
          ) : (
            <View style={styles.row}>
              <Button
                title="Tolak"
                variant="secondary"
                style={styles.flex}
                onPress={() => setIsRejecting(true)}
                disabled={isBusy || editingId !== null}
              />
              <Button
                title={hasEdits ? 'Setujui dengan Suntingan' : 'Setujui'}
                style={styles.flex}
                onPress={handleApprove}
                isLoading={isBusy}
                disabled={isBusy || editingId !== null}
              />
            </View>
          )}
          {!isRejecting ? (
            <TouchableOpacity
              style={styles.deleteLink}
              onPress={handleDeleteDraft}
              disabled={isBusy || editingId !== null}
              accessibilityRole="button"
              accessibilityLabel="Hapus draf"
            >
              <Text style={styles.deleteLinkText}>Hapus draf</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : null}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    flex: { flex: 1 },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
    errorText: { ...typography.body, color: colors.colorError, textAlign: 'center' },
    content: { paddingBottom: spacing.lg, gap: spacing.sm },
    forumTitle: { ...typography.h3, color: colors.textPrimary },
    meta: { ...typography.caption, color: colors.textMuted },
    notice: {
      backgroundColor: colors.tintWarning10,
      borderRadius: radius.md,
      padding: spacing.sm,
    },
    noticeText: { ...typography.caption, color: colors.colorWarningText },
    statusOk: { ...typography.captionBold, color: colors.colorSuccess },
    statusBad: { ...typography.captionBold, color: colors.colorError },
    sectionLabel: { ...typography.captionBold, color: colors.textSecondary, marginTop: spacing.md },
    card: {
      backgroundColor: colors.bgCardSolid,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: spacing.md,
      gap: spacing.sm,
    },
    body: { ...typography.body, color: colors.textPrimary },
    edited: { ...typography.caption, color: colors.colorWarningText },
    editInput: { marginBottom: 0 },
    rejectInput: { marginBottom: spacing.sm },
    evidence: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accentPrimary,
      paddingLeft: spacing.sm,
      gap: 2,
    },
    evidenceText: { ...typography.bodySecondary, color: colors.textSecondary },
    evidenceMeta: { ...typography.caption, color: colors.textMuted },
    deleteLink: { alignSelf: 'center', paddingTop: spacing.md, paddingBottom: spacing.xs },
    deleteLinkText: { ...typography.captionBold, color: colors.colorError },
    footer: {
      paddingTop: spacing.md,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderDefault,
    },
  });
};
