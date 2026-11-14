/**
 * PaidGroupSection — pengaturan grup berbayar untuk pembuat grup yang juga mitra kreator (V2 Tahap 2a).
 * Tampil di GroupInfoScreen hanya untuk role creator di grup utama privat. Komponen tidak merender apa pun bila
 * GET /api/groups/{id}/paid menjawab 404 (sakelar PAID_GROUPS_ENABLED mati) atau pemanggil bukan mitra kreator aktif.
 *
 * Mengubah status berbayar (aktif/nonaktif) mereset tautan undangan di server; onLinkReset memberi tahu induk agar
 * bagian Tautan Undangan dimuat ulang. Hanya harga yang berubah tidak mereset tautan.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { formatStars, PaidGroupSettings, starsApi } from '../api/stars';
import { Icon } from './Icon';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { showAlert } from '../services/dialog';

export interface PaidGroupSectionProps {
  groupId: string;
  /** Dipanggil setelah status berbayar berubah (server mereset tautan undangan). */
  onLinkReset?: () => void;
}

/** Pesan galat ramah untuk PUT /paid. */
export function paidGroupErrorMessage(err: any, min: number, max: number): string {
  switch (err?.code) {
    case 'price_out_of_range':
      return `Harga harus antara ${formatStars(min)} dan ${formatStars(max)}.`;
    case 'not_private':
      return 'Grup berbayar harus privat.';
    case 'not_group_creator':
      return 'Hanya pembuat grup yang dapat mengatur harga.';
    case 'not_paid_creator':
      return 'Akun Anda belum terdaftar sebagai mitra kreator.';
    default:
      return err?.detail || 'Periksa koneksi lalu coba lagi.';
  }
}

export const PaidGroupSection: React.FC<PaidGroupSectionProps> = ({ groupId, onLinkReset }) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [settings, setSettings] = useState<PaidGroupSettings | null>(null);
  const [priceText, setPriceText] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const res = await starsApi.getGroupPaid(groupId, controller.signal);
      if (controller.signal.aborted) return;
      setSettings(res);
      setPriceText(String(res.paid?.price_stars ?? res.price_min));
    } catch {
      // 404 (sakelar mati) atau jaringan: bagian ini tetap tersembunyi; tidak penting bagi Info Grup.
      if (!controller.signal.aborted) setSettings(null);
    }
  }, [groupId]);

  useEffect(() => {
    load();
    return () => abortRef.current?.abort();
  }, [load]);

  // Bukan mitra kreator dan grup belum pernah berbayar: tidak ada yang bisa diatur.
  if (!settings || (!settings.is_creator && !settings.paid)) return null;

  const enabled = Boolean(settings.paid?.enabled);
  const savedPrice = settings.paid?.price_stars;
  const parsed = Number.parseInt(priceText.replace(/\D/g, ''), 10);
  const priceValid = Number.isFinite(parsed) && parsed >= settings.price_min && parsed <= settings.price_max;

  const save = async (nextEnabled: boolean) => {
    if (isBusy) return;
    if (!priceValid) {
      showAlert('Harga tidak valid', `Harga harus antara ${formatStars(settings.price_min)} dan ${formatStars(settings.price_max)}.`);
      return;
    }
    setIsBusy(true);
    try {
      const paid = await starsApi.setGroupPaid(groupId, parsed, nextEnabled);
      setSettings({ ...settings, paid });
      setPriceText(String(paid?.price_stars ?? parsed));
      if (nextEnabled !== enabled) onLinkReset?.();
    } catch (err: any) {
      showAlert('Gagal menyimpan', paidGroupErrorMessage(err, settings.price_min, settings.price_max));
    } finally {
      setIsBusy(false);
    }
  };

  const handleToggle = (next: boolean) => {
    if (isBusy) return;
    const message = next
      ? `Tautan undangan akan direset ke mode berbayar: orang yang membukanya membayar ${priceValid ? formatStars(parsed) : 'harga ini'} lalu langsung masuk. Tautan lama berhenti bekerja.`
      : 'Tautan undangan akan direset ke mode persetujuan admin. Tautan berbayar lama berhenti bekerja. Anggota yang sudah membayar tetap di grup.';
    showAlert(next ? 'Aktifkan Grup Berbayar?' : 'Nonaktifkan Grup Berbayar?', message, [
      { text: 'Batal', style: 'cancel' },
      { text: next ? 'Aktifkan' : 'Nonaktifkan', style: next ? 'default' : 'destructive', onPress: () => void save(next) },
    ]);
  };

  const priceDirty = priceValid && parsed !== savedPrice;

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}>
        <Icon name="star" size={18} color={colors.accentPrimary} />
        <Text style={styles.title}>Grup Berbayar</Text>
        {isBusy ? <ActivityIndicator size="small" color={colors.accentPrimary} style={styles.busy} /> : null}
        <Switch
          value={enabled}
          onValueChange={handleToggle}
          disabled={isBusy || (!settings.is_creator && !enabled)}
          style={isBusy ? undefined : styles.switch}
          trackColor={{ true: colors.accentFill, false: colors.borderDefault }}
          accessibilityLabel="Grup berbayar"
        />
      </View>
      <Text style={styles.caption}>
        {enabled
          ? 'Orang yang membuka tautan undangan membayar sekali dengan Star lalu langsung masuk.'
          : 'Aktifkan agar orang membayar sekali dengan Star untuk masuk lewat tautan undangan.'}
      </Text>

      <Text style={styles.label}>Harga (Star)</Text>
      <View style={styles.priceRow}>
        <TextInput
          style={styles.input}
          value={priceText}
          onChangeText={(t) => setPriceText(t.replace(/\D/g, '').slice(0, 6))}
          keyboardType="number-pad"
          editable={!isBusy && settings.is_creator}
          placeholder={String(settings.price_min)}
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Harga grup dalam Star"
        />
        {enabled ? (
          <TouchableOpacity
            style={[styles.saveBtn, (!priceDirty || isBusy) && styles.btnDisabled]}
            onPress={() => save(true)}
            disabled={!priceDirty || isBusy}
            accessibilityRole="button"
          >
            <Text style={styles.saveText}>Simpan</Text>
          </TouchableOpacity>
        ) : null}
      </View>
      <Text style={[styles.hint, !priceValid && priceText !== '' && styles.hintError]}>
        Rentang {formatStars(settings.price_min)} sampai {formatStars(settings.price_max)}. Harga baru berlaku untuk pembayaran berikutnya.
      </Text>
      {!settings.is_creator ? (
        <Text style={styles.hintError}>Akun Anda tidak lagi terdaftar sebagai mitra kreator; grup ini tidak menerima pembayaran.</Text>
      ) : null}
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
    switch: { marginLeft: 'auto' },
    caption: { fontSize: 13, lineHeight: 18, color: colors.textSecondary, marginTop: 6 },
    label: { fontSize: 13, fontWeight: '600', color: colors.textPrimary, marginTop: 14 },
    priceRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
    input: {
      flex: 1,
      minHeight: 44,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.bgInput,
      fontSize: 15,
      color: colors.textPrimary,
    },
    saveBtn: {
      minHeight: 44,
      paddingHorizontal: 18,
      borderRadius: 10,
      backgroundColor: colors.accentFill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    saveText: { fontSize: 14, fontWeight: '700', color: colors.textOnAccent },
    btnDisabled: { opacity: 0.5 },
    hint: { fontSize: 12, lineHeight: 17, color: colors.textSecondary, marginTop: 6 },
    hintError: { fontSize: 12, lineHeight: 17, color: colors.colorErrorText, marginTop: 6 },
  });
