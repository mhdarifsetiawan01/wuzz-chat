/**
 * WuzzChat Mobile UI - DeleteAccountModal
 * Konfirmasi hapus akun permanen dengan re-autentikasi password (syarat kebijakan Google Play).
 */

import React, { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
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
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, onClose, onConfirm, hasPassword = true }) => {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    if (!visible) {
      setPassword('');
      setError(null);
      setIsDeleting(false);
    }
  }, [visible]);

  const handleConfirm = async () => {
    if (hasPassword && !password) {
      setError('Masukkan kata sandi untuk melanjutkan.');
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      let proof: OwnershipProof;
      if (hasPassword) {
        proof = { password };
      } else {
        // Akun Google-only: minta ID token baru dari pemilih akun Google (server memeriksa akunnya sama).
        const identity = await signInWithGoogle();
        if (!identity) {
          setIsDeleting(false); // pengguna menutup pemilih akun
          return;
        }
        proof = { googleIdToken: identity.idToken };
      }
      await onConfirm(proof);
    } catch (err: any) {
      if (hasPassword && err?.status === 401) {
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
            </View>
            {hasPassword ? (
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
                Akun ini masuk dengan Google. Untuk konfirmasi, Anda akan diminta memilih akun Google yang sama.
              </Text>
            )}
            {!hasPassword && error ? <Text style={styles.errorText}>{error}</Text> : null}
            <View style={styles.actions}>
              <Button title={hasPassword ? 'Hapus Akun Saya' : 'Konfirmasi dengan Google & Hapus'} variant="danger" isLoading={isDeleting} onPress={handleConfirm} style={styles.btn} />
              <Button title="Batal" variant="secondary" disabled={isDeleting} onPress={onClose} style={styles.btn} />
            </View>
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
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
  btn: { width: '100%', height: 48, borderRadius: radius.lg },
});
