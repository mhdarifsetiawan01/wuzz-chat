/**
 * WuzzChat Mobile UI — StarsScreen (Saldo & Riwayat Star, V2 Tahap 2a)
 * Dibuka dari Pengaturan (baris "Saldo Star" hanya tampil bila GET /api/me/stars tidak 404).
 *
 * Menampilkan saldo, ringkasan "Star diterima" untuk mitra kreator, dan Riwayat Star (50 entri terakhir).
 * Tahap 2a tidak menjual Star: tidak ada tombol beli, tidak ada kata "pendapatan/tarik/cairkan" (STARS_WALLET.md aturan 13).
 * Ketahanan jaringan: AbortController per muat, tarik-untuk-segarkan, data lama tetap tampil bila penyegaran gagal.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  formatStars,
  formatThousands,
  isStarsUnavailable,
  starKindLabel,
  starsApi,
  StarsReceived,
  StarWallet,
} from '../api/stars';
import { Icon } from '../components/Icon';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';

export interface StarsScreenProps {
  onBack: () => void;
}

type LoadError = 'unavailable' | 'network' | null;

/** "14 Nov 2026, 09.30" — tanggal singkat untuk baris riwayat. */
export function formatStarDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}, ${hh}.${mm}`;
}

export const StarsScreen: React.FC<StarsScreenProps> = ({ onBack }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const [wallet, setWallet] = useState<StarWallet | null>(null);
  const [received, setReceived] = useState<StarsReceived | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<LoadError>(null);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async (mode: 'initial' | 'refresh') => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    if (mode === 'initial') {
      setIsLoading(true);
      setLoadError(null);
    } else {
      setIsRefreshing(true);
    }
    const [walletRes, receivedRes] = await Promise.allSettled([
      starsApi.getWallet(controller.signal),
      starsApi.getReceived(controller.signal),
    ]);
    if (controller.signal.aborted) return;
    if (walletRes.status === 'fulfilled') {
      setWallet(walletRes.value);
      setLoadError(null);
    } else if (mode === 'initial' || isStarsUnavailable(walletRes.reason)) {
      setLoadError(isStarsUnavailable(walletRes.reason) ? 'unavailable' : 'network');
    }
    // Ringkasan Star diterima bersifat pelengkap: gagal memuatnya tidak menggagalkan layar.
    if (receivedRes.status === 'fulfilled') setReceived(receivedRes.value);
    setIsLoading(false);
    setIsRefreshing(false);
  }, []);

  useEffect(() => {
    load('initial');
    return () => abortRef.current?.abort();
  }, [load]);

  const renderReceived = () => {
    if (!received || (!received.is_creator && received.groups.length === 0)) return null;
    return (
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Star diterima</Text>
        {received.groups.length === 0 ? (
          <Text style={styles.cardCaption}>
            Belum ada Star yang diterima. Star masuk saat seseorang membayar akses ke grup berbayar Anda.
          </Text>
        ) : (
          <>
            <Text style={styles.cardCaption}>Star dari akses grup berbayar Anda. Star berstatus diproses selama masa tahan.</Text>
            {received.groups.map((g) => (
              <View key={g.group_id} style={styles.receivedRow}>
                <View style={styles.receivedText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {g.group_title || 'Grup'}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {g.purchases} akses · {formatThousands(g.available_stars)} tersedia · {formatThousands(g.pending_stars)} diproses
                  </Text>
                </View>
                <Text style={styles.receivedStars}>{formatStars(g.stars)}</Text>
              </View>
            ))}
          </>
        )}
      </View>
    );
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.accentPrimary} />
        </View>
      );
    }
    if (loadError === 'unavailable') {
      return (
        <View style={styles.center}>
          <Icon name="star" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Star belum tersedia</Text>
          <Text style={styles.stateText}>Fitur ini belum aktif untuk akun Anda.</Text>
        </View>
      );
    }
    if (loadError === 'network' || !wallet) {
      return (
        <View style={styles.center}>
          <Icon name="alert" size={40} color={colors.textMuted} />
          <Text style={styles.stateTitle}>Gagal memuat Saldo Star</Text>
          <Text style={styles.stateText}>Periksa koneksi internet Anda lalu coba lagi.</Text>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => load('initial')} accessibilityRole="button">
            <Text style={styles.secondaryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 32 }]}
        refreshControl={
          <RefreshControl refreshing={isRefreshing} onRefresh={() => load('refresh')} tintColor={colors.accentPrimary} colors={[colors.accentPrimary]} />
        }
      >
        <View style={styles.balanceCard}>
          <Icon name="star" size={28} color={colors.accentPrimary} />
          <Text style={styles.balanceLabel}>Saldo Star</Text>
          <Text style={styles.balanceValue} accessibilityLabel={`Saldo ${formatStars(wallet.balance)}`}>
            {formatThousands(wallet.balance)}
          </Text>
          <Text style={styles.balanceCaption}>Star dipakai untuk masuk grup privat berbayar di WuzzChat.</Text>
        </View>

        {renderReceived()}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Riwayat Star</Text>
          {wallet.history.length === 0 ? (
            <Text style={styles.cardCaption}>Belum ada riwayat.</Text>
          ) : (
            wallet.history.map((e, idx) => (
              <View key={e.id} style={[styles.historyRow, idx > 0 && styles.historyDivider]}>
                <View style={styles.historyText}>
                  <Text style={styles.rowTitle} numberOfLines={1}>
                    {starKindLabel(e.kind)}
                    {e.group_title ? ` · ${e.group_title}` : ''}
                  </Text>
                  <Text style={styles.rowMeta} numberOfLines={1}>
                    {formatStarDate(e.created_at)}
                  </Text>
                </View>
                <Text style={[styles.delta, e.delta >= 0 ? styles.deltaPlus : styles.deltaMinus]}>
                  {e.delta >= 0 ? '+' : '−'}
                  {formatThousands(Math.abs(e.delta))}
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={onBack} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }} accessibilityLabel="Kembali">
          <Icon name="back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Saldo Star</Text>
        <View style={styles.headerSpacer} />
      </View>
      {renderBody()}
    </View>
  );
};

const makeStyles = (colors: ColorTokens) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bgSurface },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.borderDefault,
    },
    headerTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
    headerSpacer: { width: 24 },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
    stateTitle: { fontSize: 17, fontWeight: '700', color: colors.textPrimary, textAlign: 'center' },
    stateText: { fontSize: 14, lineHeight: 20, color: colors.textSecondary, textAlign: 'center' },
    secondaryBtn: {
      marginTop: 8,
      minHeight: 46,
      borderRadius: 14,
      backgroundColor: colors.tintAccent10,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    secondaryBtnText: { fontSize: 15, fontWeight: '600', color: colors.accentPrimary },
    content: { padding: 16, gap: 16 },
    balanceCard: {
      alignItems: 'center',
      paddingVertical: 24,
      paddingHorizontal: 16,
      borderRadius: 16,
      backgroundColor: colors.tintAccent10,
    },
    balanceLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary, marginTop: 8 },
    balanceValue: { fontSize: 36, fontWeight: '800', color: colors.textPrimary, marginTop: 4 },
    balanceCaption: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, textAlign: 'center', marginTop: 8 },
    card: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.bgCard,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.borderDefault,
    },
    cardTitle: { fontSize: 15, fontWeight: '700', color: colors.textPrimary },
    cardCaption: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 6 },
    receivedRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 12 },
    receivedText: { flex: 1 },
    receivedStars: { fontSize: 14, fontWeight: '700', color: colors.textPrimary },
    rowTitle: { fontSize: 14, fontWeight: '600', color: colors.textPrimary },
    rowMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 2 },
    historyRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
    historyDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderDefault },
    historyText: { flex: 1 },
    delta: { fontSize: 15, fontWeight: '700' },
    deltaPlus: { color: colors.accentPrimary },
    deltaMinus: { color: colors.textPrimary },
  });
