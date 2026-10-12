/**
 * Detail satu memori terverifikasi: ringkasan, keputusan beserta kutipan bukti, dan Journey Lite.
 * Dipakai di dalam MemoryArchiveModal (tanpa sheet sendiri).
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { memoryApi, ApprovedMemoryDetail } from '../../api/memory';
import { MemoryConfidenceBadge } from './MemoryConfidenceBadge';
import { Button } from '../Button';
import { showAlert } from '../../services/dialog';
import { radius, spacing, useThemedStyles, ColorTokens, makeTypography } from '../../theme';
import { formatMemoryDate } from './memoryFormat';

interface Props {
  memoryId: string;
  /** Admin/creator grup boleh menghapus memori. */
  canDelete?: boolean;
  onDeleted?: () => void;
}

export const MemoryDetailView: React.FC<Props> = ({ memoryId, canDelete = false, onDeleted }) => {
  const styles = useThemedStyles(makeStyles);
  const [detail, setDetail] = useState<ApprovedMemoryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setIsLoading(true);
      setError('');
      try {
        setDetail(await memoryApi.getApproved(memoryId, signal));
      } catch (err: any) {
        if (err?.name !== 'AbortError') setError(err?.detail || 'Gagal memuat memori.');
      } finally {
        setIsLoading(false);
      }
    },
    [memoryId]
  );

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const confirmDelete = () => {
    showAlert(
      'Hapus memori ini?',
      'Memori beserta kutipan buktinya dihapus permanen dan tidak bisa dikembalikan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            try {
              await memoryApi.deleteApproved(memoryId);
              onDeleted?.();
            } catch (err: any) {
              showAlert('Gagal menghapus', err?.detail || 'Silakan coba lagi.');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }
  if (error || !detail) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorText}>{error || 'Memori tidak ditemukan.'}</Text>
        <Button title="Coba Lagi" variant="secondary" onPress={() => load()} />
      </View>
    );
  }

  const showJourney =
    !!detail.snapshot_journey_lite && !detail.is_journey_lite_removed;

  return (
    <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
      <Text style={styles.forumTitle}>{detail.forum_title}</Text>
      <Text style={styles.meta}>
        Disetujui {detail.approved_by_name} · {formatMemoryDate(detail.approved_at)}
        {detail.has_human_edits ? ' · Disunting' : ''}
      </Text>

      <Text style={styles.sectionLabel}>Ringkasan</Text>
      <View style={styles.card}>
        <Text style={styles.body}>{detail.snapshot_summary}</Text>
        {detail.snapshot_summary_conf ? (
          <MemoryConfidenceBadge level={detail.snapshot_summary_conf} />
        ) : null}
      </View>

      {detail.snapshot_decisions?.length ? (
        <>
          <Text style={styles.sectionLabel}>Keputusan ({detail.snapshot_decisions.length})</Text>
          {detail.snapshot_decisions.map((d) => (
            <View key={d.position} style={styles.card}>
              <Text style={styles.body}>{d.text}</Text>
              <MemoryConfidenceBadge level={d.confidence} />
              {d.evidences?.map((ev) => (
                <View key={ev.message_id} style={styles.evidence}>
                  <Text style={styles.evidenceText}>“{ev.preview}”</Text>
                  <Text style={styles.evidenceMeta}>
                    {ev.sender_name} · {formatMemoryDate(ev.sent_at)}
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </>
      ) : null}

      {showJourney ? (
        <>
          <Text style={styles.sectionLabel}>Alur Diskusi</Text>
          <View style={styles.card}>
            <Text style={styles.body}>{detail.snapshot_journey_lite}</Text>
            {detail.snapshot_journey_conf ? (
              <MemoryConfidenceBadge level={detail.snapshot_journey_conf} />
            ) : null}
          </View>
        </>
      ) : null}

      {canDelete ? (
        <Button
          title="Hapus Memori"
          variant="danger"
          onPress={confirmDelete}
          isLoading={isDeleting}
          disabled={isDeleting}
          style={styles.deleteButton}
        />
      ) : null}
    </ScrollView>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
    center: { alignItems: 'center', justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
    errorText: { ...typography.body, color: colors.colorError, textAlign: 'center' },
    content: { paddingBottom: spacing.lg, gap: spacing.sm },
    forumTitle: { ...typography.h3, color: colors.textPrimary },
    meta: { ...typography.caption, color: colors.textMuted },
    sectionLabel: {
      ...typography.captionBold,
      color: colors.textSecondary,
      marginTop: spacing.md,
    },
    card: {
      backgroundColor: colors.bgCardSolid,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: colors.borderDefault,
      padding: spacing.md,
      gap: spacing.sm,
    },
    body: { ...typography.body, color: colors.textPrimary },
    evidence: {
      borderLeftWidth: 3,
      borderLeftColor: colors.accentPrimary,
      paddingLeft: spacing.sm,
      gap: 2,
    },
    evidenceText: { ...typography.bodySecondary, color: colors.textSecondary },
    evidenceMeta: { ...typography.caption, color: colors.textMuted },
    deleteButton: { marginTop: spacing.lg },
  });
};
