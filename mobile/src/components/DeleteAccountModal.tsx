/**
 * WuzzChat Mobile UI - DeleteAccountModal
 * Konfirmasi hapus akun permanen dengan re-autentikasi password atau akun Google (syarat kebijakan Google Play).
 * Star (keputusan K9): bila fitur Star aktif dan saldo > 0, saldo ditampilkan dan tombol hapus terkunci sampai pengguna
 * mencentang bahwa saldo akan hangus. Saldo dimuat ulang setiap modal dibuka; 404 (fitur mati) = tanpa bagian Star.
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { radius, shadows, spacing, useTheme, useThemedStyles, ColorTokens, makeTypography } from '../theme';
import { formatStars, starsApi } from '../api/stars';
import { Icon } from './Icon';
import { Button } from './Button';
import { Input } from './Input';
import { IconText } from './IconText';
import type { OwnershipProof } from '../api/types';
import { signInWithGoogle } from '../services/googleAuth';
import { googleErrorMessage } from '../utils/googleErrors';

export interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Melempar error ber-status 401 bila bukti (password atau akun Google) salah. */
  onConfirm: (proof: OwnershipProof) => Promise<void>;
  /** false = akun Google-only: konfirmasi lewat pemilih akun Google, bukan password. Default true. */
  hasPassword?: boolean;
  /** true = akun punya password DAN tertaut Google: pengguna boleh memilih bukti mana yang dipakai. */
  googleLinked?: boolean;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, onClose, onConfirm, hasPassword = true, googleLinked = false }) => {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const [password, setPassword] = useState('');
  // null = fitur Star mati atau belum dimuat (tanpa bagian Star).
  const [starBalance, setStarBalance] = useState<number | null>(null);
  const [starsAck, setStarsAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  // Akun dengan dua metode: pengguna memilih password atau Google. Akun Google-only selalu Google.
  const [preferGoogle, setPreferGoogle] = useState(false);
  const canChoose = hasPassword && googleLinked;
  const usePassword = hasPassword && !(canChoose && preferGoogle);

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setError(null);
      setIsDeleting(false);
      setPreferGoogle(false);
      setStarBalance(null);
      setStarsAck(false);
      return;
    }
    const controller = new AbortController();
    starsApi
      .getWallet(controller.signal)
      .then((w) => {
        if (!controller.signal.aborted) setStarBalance(w.balance);
      })
      .catch(() => {
        // 404 = fitur mati; galat jaringan: tidak menahan penghapusan (server tetap menyimpan catatan transaksi).
      });
    return () => controller.abort();
  }, [visible]);

  const needsStarsAck = starBalance !== null && starBalance > 0;

  const handleConfirm = async () => {
    if (needsStarsAck && !starsAck) {
      setError('Centang konfirmasi saldo Star untuk melanjutkan.');
      return;
    }
    if (usePassword && !password) {
      setError('Masukkan kata sandi untuk melanjutkan.');
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      let proof: OwnershipProof;
      if (usePassword) {
        proof = { password };
      } else {
        // Akun Google: minta ID token baru dari pemilih akun Google (server memeriksa akunnya sama).
        const identity = await signInWithGoogle();
        if (!identity) {
          setIsDeleting(false); // pengguna menutup pemilih akun
          return;
        }
        proof = { googleIdToken: identity.idToken };
      }
      await onConfirm(proof);
    } catch (err: any) {
      if (usePassword && err?.status === 401) {
        setError('Kata sandi salah.');
      } else {
        setError(googleErrorMessage(err, 'Gagal menghapus akun. Periksa koneksi lalu coba lagi.'));
      }
      setIsDeleting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={isDeleting ? undefined : onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
            <View style={styles.iconContainer}>
              <IconText style={styles.icon}>⚠️</IconText>
            </View>
            <Text style={styles.title}>Hapus Akun Permanen</Text>
            <Text style={styles.description}>
              Tindakan ini tidak dapat dibatalkan. Yang akan dihapus:
            </Text>
            <View style={styles.list}>
              <Text style={styles.listItem}>• Profil, {hasPassword ? 'kata sandi, ' : 'tautan akun Google, '}dan kunci enkripsi akun ini</Text>
              <Text style={styles.listItem}>• Semua pesan yang Anda kirim, postingan, dan komentar</Text>
              <Text style={styles.listItem}>• Daftar teman dan keanggotaan grup (kepemilikan grup dialihkan)</Text>
              <Text style={styles.listItem}>• Riwayat chat dan media di perangkat ini</Text>
              {starBalance !== null ? (
                <Text style={styles.listItem}>• Catatan transaksi Star tetap disimpan sampai 10 tahun (kewajiban pajak), tanpa profil Anda</Text>
              ) : null}
            </View>
            {needsStarsAck ? (
              <View style={styles.starBox}>
                <Text style={styles.starTitle}>Saldo Star Anda: {formatStars(starBalance!)}</Text>
                <Text style={styles.starText}>Saldo ini akan hangus dan tidak dapat dipindahkan, dikembalikan, atau diuangkan.</Text>
                <TouchableOpacity
                  style={styles.ackRow}
                  onPress={() => {
                    setStarsAck((v) => !v);
                    if (error) setError(null);
                  }}
                  disabled={isDeleting}
                  activeOpacity={0.7}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: starsAck, disabled: isDeleting }}
                  accessibilityLabel={`Saya mengerti saldo ${formatStars(starBalance!)} akan hangus`}
                >
                  <View style={[styles.ackBox, starsAck && styles.ackBoxChecked]}>
                    {starsAck ? <Icon name="check" size={16} color={colors.textOnAccent} /> : null}
                  </View>
                  <Text style={styles.ackText}>Saya mengerti saldo {formatStars(starBalance!)} akan hangus.</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {usePassword ? (
              <Input
                label="Kata sandi"
                placeholder="Masukkan kata sandi Anda"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                value={password}
                onChangeText={(t) => {
                  setPassword(t);
                  if (error) setError(null);
                }}
                editable={!isDeleting}
                error={error}
                containerStyle={styles.input}
              />
            ) : (
              <Text style={styles.googleNote}>
                {canChoose ? 'Anda memilih konfirmasi dengan Google. ' : 'Akun ini masuk dengan Google. '}Untuk konfirmasi, Anda akan diminta memilih akun Google yang sama.
              </Text>
            )}
            {!usePassword && error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.actions}>
              <Button
                title={usePassword ? 'Hapus Akun Saya' : 'Konfirmasi dengan Google & Hapus'}
                variant="danger"
                isLoading={isDeleting}
                disabled={needsStarsAck && !starsAck}
                onPress={handleConfirm}
                style={styles.btn}
              />
              {canChoose ? (
                <Button
                  title={usePassword ? 'Lupa kata sandi? Gunakan Google' : 'Gunakan kata sandi'}
                  variant="secondary"
                  disabled={isDeleting}
                  onPress={() => {
                    setError(null);
                    setPreferGoogle(usePassword);
                  }}
                  style={styles.btn}
                />
              ) : null}
              <Button title="Batal" variant="secondary" disabled={isDeleting} onPress={onClose} style={styles.btn} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    maxHeight: '90%',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    ...shadows.modal,
  },
  content: { padding: spacing.xxl, alignItems: 'center' },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.tintError20,
  },
  icon: { fontSize: 26 },
  title: { ...typography.h2, color: colors.textPrimary, marginBottom: spacing.xs, textAlign: 'center' },
  description: { ...typography.bodySecondary, color: colors.textSecondary, alignSelf: 'flex-start', marginBottom: spacing.sm },
  list: { alignSelf: 'stretch', marginBottom: spacing.lg, gap: spacing.xs },
  listItem: { ...typography.bodySecondary, color: colors.textSecondary, lineHeight: 20 },
  input: { alignSelf: 'stretch' },
  googleNote: { ...typography.bodySecondary, color: colors.textSecondary, alignSelf: 'stretch', marginBottom: spacing.sm },
  errorText: { ...typography.caption, color: colors.colorError, alignSelf: 'stretch', marginBottom: spacing.sm },
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  starBox: {
    alignSelf: 'stretch',
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.colorWarning,
    backgroundColor: colors.tintWarning10,
    gap: spacing.xs,
  },
  starTitle: { ...typography.body, color: colors.textPrimary, fontWeight: '700' },
  starText: { ...typography.bodySecondary, color: colors.textSecondary },
  ackRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, marginTop: spacing.sm },
  ackBox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgInput,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ackBoxChecked: { backgroundColor: colors.accentFill, borderColor: colors.accentPrimary },
  ackText: { ...typography.bodySecondary, color: colors.textPrimary, flex: 1 },
  btn: { width: '100%', height: 48, borderRadius: radius.lg },
});
};
