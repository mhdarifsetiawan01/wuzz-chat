/**
 * WuzzChat Mobile UI - KeyConflictModal Component
 * Modal dialog for handling HTTP 409: KEY_ALREADY_REGISTERED.
 * Allows user to force reset E2EE key with password verification, or abort locally.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 2B & 7.
 */

import React, { useState, useEffect } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Button } from './Button';
import { Input } from './Input';
import type { OwnershipProof } from '../api/types';
import { signInWithGoogle } from '../services/googleAuth';
import { googleErrorMessage } from '../utils/googleErrors';

interface KeyConflictModalProps {
  visible: boolean;
  /** Bukti kepemilikan: password, atau ID token Google baru untuk akun Google-only. */
  onConfirmReset: (proof: OwnershipProof) => Promise<void>;
  /** false = akun Google-only: reset dikonfirmasi lewat pemilih akun Google. Default true. */
  hasPassword?: boolean;
  /** true = akun punya password DAN tertaut Google: pengguna boleh memilih bukti mana yang dipakai. */
  googleLinked?: boolean;
  onOpenDeviceTransfer?: () => void;
  onCancel: () => void | Promise<void>;
}

export const KeyConflictModal: React.FC<KeyConflictModalProps> = ({
  visible,
  onConfirmReset,
  hasPassword = true,
  googleLinked = false,
  onOpenDeviceTransfer,
  onCancel,
}) => {
  if (!visible) return null;

  const [isPromptingPassword, setIsPromptingPassword] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  // Akun dengan dua metode: pengguna memilih password atau Google. Akun Google-only selalu Google.
  const [preferGoogle, setPreferGoogle] = useState<boolean>(false);
  const canChoose = hasPassword && googleLinked;
  const usePassword = hasPassword && !(canChoose && preferGoogle);

  // Auto-dismiss software keyboard when modal appears so modal buttons are never obscured
  useEffect(() => {
    if (visible) {
      Keyboard.dismiss();
    }
  }, [visible]);

  const handleStartReset = () => {
    setErrorMessage(null);
    setPassword('');
    setPreferGoogle(false);
    setIsPromptingPassword(true);
  };

  const handleBackToOptions = () => {
    if (isLoading) return;
    setErrorMessage(null);
    setPassword('');
    setIsPromptingPassword(false);
  };

  const handleSubmitReset = async () => {
    if (usePassword && !password.trim()) {
      setErrorMessage('Harap masukkan password akun Anda untuk konfirmasi reset.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      let proof: OwnershipProof;
      if (usePassword) {
        proof = { password };
      } else {
        // Akun Google-only: ID token baru dari pemilih akun Google (server memeriksa akunnya sama).
        const identity = await signInWithGoogle();
        if (!identity) {
          setIsLoading(false); // pengguna menutup pemilih akun
          return;
        }
        proof = { googleIdToken: identity.idToken };
      }
      await onConfirmReset(proof);
      setIsPromptingPassword(false);
      setPassword('');
    } catch (err: any) {
      setErrorMessage(
        usePassword
          ? err?.detail || err?.message || 'Password salah atau gagal mereset kunci keamanan. Periksa password Anda.'
          : googleErrorMessage(err, 'Gagal mereset kunci keamanan. Silakan coba lagi.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancel = async () => {
    if (isLoading) return;
    setErrorMessage(null);
    setPassword('');
    setIsPromptingPassword(false);
    await onCancel();
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.overlay}
        >
          <TouchableWithoutFeedback onPress={(e) => e.stopPropagation()} accessible={false}>
            <View style={styles.card}>
              <ScrollView
                style={styles.scrollWrapper}
                contentContainerStyle={styles.scrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
            <View style={styles.iconContainer}>
              <IconText style={styles.icon}>🔐</IconText>
            </View>

            <Text style={styles.title}>
              {isPromptingPassword ? 'Konfirmasi Kata Sandi' : 'Kunci Keamanan Terdaftar'}
            </Text>

            <Text style={styles.description}>
              {isPromptingPassword
                ? 'Mereset kunci keamanan akan mengaktifkan enkripsi E2EE baru pada perangkat ini dan menonaktifkan sesi pada perangkat lain.'
                : 'Akun Anda telah memiliki kunci enkripsi aktif di perangkat lain. Anda dapat memindai kode QR dari perangkat lama untuk menyinkronkan kunci tanpa reset, atau mereset kunci menggunakan kata sandi Anda.'}
            </Text>

            {/* Peringatan konsekuensi reset: pesan lama (termasuk yang dikirim sendiri) permanen tak terbaca */}
            <View style={styles.warningBox} accessibilityRole="alert">
              <Icon name="alert" size={20} color={colors.colorDanger} />
              <View style={styles.warningTextCol}>
                <Text style={styles.warningTitle}>Pesan lama tidak akan bisa dibuka lagi</Text>
                <Text style={styles.warningBody}>
                  Semua pesan sebelum reset, termasuk yang Anda kirim sendiri, tidak bisa dibuka dengan kunci baru
                  {onOpenDeviceTransfer
                    ? `. Hanya perangkat yang masih menyimpan kunci lama yang bisa membukanya. Bila Anda masih memilikinya, ${
                        isPromptingPassword ? 'tekan Kembali lalu pilih' : 'pilih'
                      } Transfer dari Perangkat Lain.`
                    : '. Pesan baru setelah reset tidak terpengaruh.'}
                </Text>
              </View>
            </View>

            {isPromptingPassword ? (
              <View style={styles.formContainer}>
                {usePassword ? (
                  <Input
                    label="Kata Sandi Akun"
                    placeholder="Masukkan kata sandi akun Anda"
                    secureTextEntry
                    value={password}
                    onChangeText={(text) => {
                      setPassword(text);
                      if (errorMessage) setErrorMessage(null);
                    }}
                    error={errorMessage}
                    autoCapitalize="none"
                    editable={!isLoading}
                    containerStyle={styles.inputContainer}
                  />
                ) : (
                  <>
                    <Text style={styles.googleNote}>
                      Akun ini masuk dengan Google. Untuk konfirmasi reset, Anda akan diminta memilih akun Google yang sama.
                    </Text>
                    {errorMessage ? <Text style={styles.googleError}>{errorMessage}</Text> : null}
                  </>
                )}

                <Button
                  title={usePassword ? 'Saya Mengerti, Reset Kunci' : 'Konfirmasi dengan Google & Reset Kunci'}
                  variant="danger"
                  isLoading={isLoading}
                  disabled={isLoading}
                  style={styles.actionButton}
                  onPress={handleSubmitReset}
                />

                {canChoose && (
                  <Button
                    title={usePassword ? 'Lupa kata sandi? Gunakan Google' : 'Gunakan kata sandi'}
                    variant="secondary"
                    disabled={isLoading}
                    style={styles.actionButton}
                    onPress={() => {
                      setErrorMessage(null);
                      setPreferGoogle(usePassword);
                    }}
                  />
                )}

                <Button
                  title="Kembali"
                  variant="secondary"
                  disabled={isLoading}
                  style={styles.actionButton}
                  onPress={handleBackToOptions}
                />
              </View>
            ) : (
              <View style={styles.formContainer}>
                {onOpenDeviceTransfer && (
                  <Button
                    title="📱 Transfer dari Perangkat Lain"
                    variant="primary"
                    style={styles.actionButton}
                    onPress={onOpenDeviceTransfer}
                  />
                )}

                <Button
                  title={onOpenDeviceTransfer ? 'Reset Kunci Baru' : 'Reset Kunci ke Perangkat Ini'}
                  variant={onOpenDeviceTransfer ? 'secondary' : 'primary'}
                  style={styles.actionButton}
                  onPress={handleStartReset}
                />

                <Button
                  title="Batal / Keluar"
                  variant="secondary"
                  style={styles.actionButton}
                  onPress={handleCancel}
                />
              </View>
            )}
          </ScrollView>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

const styles = StyleSheet.create({
  googleNote: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    marginBottom: spacing.sm,
  },
  googleError: {
    ...typography.caption,
    color: colors.colorError,
    marginBottom: spacing.sm,
  },
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  card: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
    ...shadows.modal,
  },
  scrollWrapper: {
    width: '100%',
  },
  scrollContent: {
    alignItems: 'center',
    paddingBottom: spacing.sm,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: radius.full,
    backgroundColor: colors.tintWarning10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  icon: {
    fontSize: 28,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  description: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.tintError20,
    borderLeftWidth: 4,
    borderLeftColor: colors.colorDanger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
  },
  warningTextCol: {
    flex: 1,
  },
  warningTitle: {
    ...typography.bodySecondary,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  warningBody: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
    lineHeight: 20,
  },
  formContainer: {
    width: '100%',
  },
  inputContainer: {
    marginBottom: spacing.lg,
  },
  actionButton: {
    width: '100%',
    marginBottom: spacing.md,
  },
});
