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

export interface DeleteAccountModalProps {
  visible: boolean;
  onClose: () => void;
  /** Melempar error ber-status 401 bila password salah. */
  onConfirm: (password: string) => Promise<void>;
}

export const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ visible, onClose, onConfirm }) => {
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
    if (!password) {
      setError('Masukkan kata sandi untuk melanjutkan.');
      return;
    }
    setIsDeleting(true);
    setError(null);
    try {
      await onConfirm(password);
    } catch (err: any) {
      setError(
        err?.status === 401
          ? 'Kata sandi salah.'
          : err?.detail || 'Gagal menghapus akun. Periksa koneksi lalu coba lagi.'
      );
      setIsDeleting(false);
    }
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={isDeleting ? undefined : onClose} statusBarTranslucent>
      <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
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
              <Text style={styles.listItem}>• Profil, kata sandi, dan kunci enkripsi akun ini</Text>
              <Text style={styles.listItem}>• Semua pesan yang Anda kirim, postingan, dan komentar</Text>
              <Text style={styles.listItem}>• Daftar teman dan keanggotaan grup (kepemilikan grup dialihkan)</Text>
              <Text style={styles.listItem}>• Riwayat chat dan media di perangkat ini</Text>
            </View>
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
            />
            <View style={styles.actions}>
              <Button title="Hapus Akun Saya" variant="danger" isLoading={isDeleting} onPress={handleConfirm} style={styles.btn} />
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
  actions: { width: '100%', gap: spacing.sm, marginTop: spacing.md },
  btn: { width: '100%', height: 48, borderRadius: radius.lg },
});
