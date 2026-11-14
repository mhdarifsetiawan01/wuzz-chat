/**
 * InviteLinkSection — Tautan Undangan grup privat untuk creator/admin (V2 Tahap 1).
 * Tampil di GroupInfoScreen. Bagikan / Salin / Reset / Matikan tautan, plus pintu ke daftar permohonan bergabung
 * (JoinRequestsModal memakai endpoint join-requests yang sama dengan forum, dengan ID grp_).
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { APP_LINK_CONFIG } from '../api/config';
import { invitesApi, InviteLink } from '../api/invites';
import { subgroupsApi } from '../api/subgroups';
import { Icon } from './Icon';
import { JoinRequestsModal } from './JoinRequestsModal';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { showAlert } from '../services/dialog';

export interface InviteLinkSectionProps {
  groupId: string;
  groupTitle: string;
  /** Dipanggil setelah ada permohonan yang disetujui, agar daftar anggota dimuat ulang. */
  onMembersChanged?: () => void;
  /** Naikkan nilainya untuk memuat ulang tautan (mis. setelah status grup berbayar berubah dan server mereset tautan). */
  refreshKey?: number;
}

/** Pesan bagikan tautan undangan; dipakai juga tombol "Bagikan" di Info Grup. */
export const buildInviteShareMessage = (groupTitle: string, link: InviteLink): string =>
  `Gabung grup privat WuzzChat: ${groupTitle}\n${APP_LINK_CONFIG.getShortShareUrl(link.path)}\n` +
  (link.mode === 'paid' ? '(Grup berbayar: bayar dengan Star lalu langsung masuk)' : '(Admin grup akan menyetujui permohonan Anda)');

export const InviteLinkSection: React.FC<InviteLinkSectionProps> = ({ groupId, groupTitle, onMembersChanged, refreshKey }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [link, setLink] = useState<InviteLink | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  const [showRequests, setShowRequests] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setIsLoading(true);
    setLoadFailed(false);
    const [linkRes, reqRes] = await Promise.allSettled([
      invitesApi.getLink(groupId, controller.signal),
      subgroupsApi.listJoinRequests(groupId, controller.signal),
    ]);
    if (controller.signal.aborted) return;
    if (linkRes.status === 'fulfilled') {
      setLink(linkRes.value);
    } else {
      setLoadFailed(true);
    }
    setPendingCount(reqRes.status === 'fulfilled' ? reqRes.value.filter((r) => r.status === 'pending').length : null);
    setIsLoading(false);
  }, [groupId]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load, refreshKey]);

  const runAction = async (action: () => Promise<void>, failTitle: string) => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await action();
    } catch (err: any) {
      showAlert(failTitle, err?.detail || 'Periksa koneksi lalu coba lagi.');
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreate = () =>
    runAction(async () => {
      setLink(await invitesApi.createLink(groupId, false));
    }, 'Gagal membuat tautan');

  const handleShare = () => {
    if (!link) return;
    Share.share({ message: buildInviteShareMessage(groupTitle, link), title: `Undang ke ${groupTitle}` }).catch(() => {});
  };

  const handleCopy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(APP_LINK_CONFIG.getShortShareUrl(link.path));
      showAlert('Tautan disalin', 'Tautan undangan sudah disalin ke papan klip.');
    } catch {
      showAlert('Gagal menyalin', 'Coba lagi.');
    }
  };

  const handleReset = () => {
    showAlert('Reset Tautan?', 'Tautan lama langsung berhenti bekerja. Permohonan yang sudah masuk tetap menunggu keputusan Anda.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Reset',
        style: 'destructive',
        onPress: () =>
          runAction(async () => {
            setLink(await invitesApi.createLink(groupId, true));
          }, 'Gagal mereset tautan'),
      },
    ]);
  };

  const handleRevoke = () => {
    showAlert('Matikan Tautan?', 'Tautan ini berhenti bekerja dan orang baru tidak bisa mengajukan bergabung sampai Anda membuat tautan lagi.', [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Matikan',
        style: 'destructive',
        onPress: () =>
          runAction(async () => {
            await invitesApi.revokeLink(groupId);
            setLink(null);
          }, 'Gagal mematikan tautan'),
      },
    ]);
  };

  const url = link ? APP_LINK_CONFIG.getShortShareUrl(link.path) : '';

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="link" size={18} color={colors.accentPrimary} />
        <Text style={styles.title}>Tautan Undangan</Text>
        {isBusy ? <ActivityIndicator size="small" color={colors.accentPrimary} style={styles.busy} /> : null}
      </View>
      <Text style={styles.caption}>
        {link?.mode === 'paid'
          ? 'Grup berbayar: orang yang membuka tautan ini membayar dengan Star lalu langsung masuk.'
          : 'Orang yang membuka tautan ini bisa mengajukan bergabung. Anda yang menyetujui atau menolak.'}
      </Text>

      {isLoading ? (
        <ActivityIndicator size="small" color={colors.accentPrimary} style={styles.loader} />
      ) : loadFailed ? (
        <TouchableOpacity onPress={load} style={styles.retryBtn} accessibilityRole="button">
          <Text style={styles.retryText}>Gagal memuat tautan. Ketuk untuk mencoba lagi.</Text>
        </TouchableOpacity>
      ) : link ? (
        <>
          <Text style={styles.url} selectable numberOfLines={1}>
            {url}
          </Text>
          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} disabled={isBusy} accessibilityRole="button" accessibilityLabel="Bagikan tautan undangan">
              <Icon name="share" size={18} color={colors.accentPrimary} />
              <Text style={styles.actionText}>Bagikan</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleCopy} disabled={isBusy} accessibilityRole="button" accessibilityLabel="Salin tautan undangan">
              <Icon name="copy" size={18} color={colors.accentPrimary} />
              <Text style={styles.actionText}>Salin</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleReset} disabled={isBusy} accessibilityRole="button" accessibilityLabel="Reset tautan undangan">
              <Icon name="broom" size={18} color={colors.accentPrimary} />
              <Text style={styles.actionText}>Reset</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={handleRevoke} disabled={isBusy} style={styles.revokeBtn} accessibilityRole="button">
            <Text style={styles.revokeText}>Matikan tautan</Text>
          </TouchableOpacity>
        </>
      ) : (
        <TouchableOpacity style={styles.createBtn} onPress={handleCreate} disabled={isBusy} accessibilityRole="button">
          <Text style={styles.createText}>Buat Tautan Undangan</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.requestsRow} onPress={() => setShowRequests(true)} accessibilityRole="button" accessibilityLabel="Permohonan bergabung">
        <Icon name="userPlus" size={18} color={colors.textSecondary} />
        <Text style={styles.requestsText}>Permohonan bergabung</Text>
        {pendingCount ? (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{pendingCount > 99 ? '99+' : pendingCount}</Text>
          </View>
        ) : null}
        <Icon name="forward" size={16} color={colors.textMuted} />
      </TouchableOpacity>

      {showRequests && (
        <JoinRequestsModal
          visible={showRequests}
          subGroupId={groupId}
          subGroupTitle={groupTitle}
          onClose={() => {
            setShowRequests(false);
            load();
          }}
          onRequestActioned={onMembersChanged}
        />
      )}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    card: {
      marginHorizontal: 16,
      marginTop: 16,
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.bgCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderDefault,
    },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    busy: { marginLeft: 'auto' },
    caption: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 6 },
    loader: { marginVertical: 16 },
    retryBtn: { paddingVertical: 12 },
    retryText: { fontSize: 13, color: colors.accentPrimary },
    url: {
      marginTop: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 10,
      backgroundColor: colors.bgInput,
      fontSize: 13,
      color: colors.textPrimary,
    },
    actionsRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    actionBtn: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: 40,
      borderRadius: 10,
      backgroundColor: colors.tintAccent10,
    },
    actionText: { fontSize: 13, fontWeight: '600', color: colors.accentPrimary },
    revokeBtn: { alignSelf: 'flex-start', marginTop: 10, paddingVertical: 4 },
    revokeText: { fontSize: 13, fontWeight: '600', color: colors.colorErrorText },
    createBtn: {
      marginTop: 12,
      minHeight: 44,
      borderRadius: 12,
      backgroundColor: colors.accentFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    createText: { fontSize: 14, fontWeight: '700', color: colors.textOnAccent },
    requestsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
      paddingTop: 12,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.borderDefault,
    },
    requestsText: { flex: 1, fontSize: 14, color: colors.textPrimary },
    countBadge: {
      minWidth: 22,
      height: 22,
      paddingHorizontal: 6,
      borderRadius: 11,
      backgroundColor: colors.unreadBadgeBg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countText: { fontSize: 12, fontWeight: '700', color: colors.unreadBadgeText },
  });
