/**
 * WuzzChat Mobile UI - KeyConflictModal Component
 * Modal dialog for handling HTTP 409: KEY_ALREADY_REGISTERED.
 * Allows user to force reset E2EE key with password verification, or abort locally.
 * Adheres to docs/MOBILE_INTEGRATION_GUIDE.md Section 2B & 7.
 */

import React, { useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';
import { Input } from './Input';

interface KeyConflictModalProps {
  visible: boolean;
  onConfirmReset: (password: string) => Promise<void>;
  onOpenDeviceTransfer?: () => void;
  onCancel: () => void | Promise<void>;
}

export const KeyConflictModal: React.FC<KeyConflictModalProps> = ({
  visible,
  onConfirmReset,
  onOpenDeviceTransfer,
  onCancel,
}) => {
  if (!visible) return null;

  const [isPromptingPassword, setIsPromptingPassword] = useState<boolean>(false);
  const [password, setPassword] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleStartReset = () => {
    setErrorMessage(null);
    setPassword('');
    setIsPromptingPassword(true);
  };

  const handleBackToOptions = () => {
    if (isLoading) return;
    setErrorMessage(null);
    setPassword('');
    setIsPromptingPassword(false);
  };

  const handleSubmitReset = async () => {
    if (!password.trim()) {
      setErrorMessage('Harap masukkan password akun Anda untuk konfirmasi reset.');
      return;
    }

    setErrorMessage(null);
    setIsLoading(true);

    try {
      await onConfirmReset(password);
      setIsPromptingPassword(false);
      setPassword('');
    } catch (err: any) {
      const msg =
        err?.detail ||
        err?.message ||
        'Password salah atau gagal mereset kunci keamanan. Periksa password Anda.';
      setErrorMessage(msg);
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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>🔐</Text>
          </View>

          <Text style={styles.title}>
            {isPromptingPassword ? 'Konfirmasi Kata Sandi' : 'Kunci Keamanan Terdaftar'}
          </Text>

          <Text style={styles.description}>
            {isPromptingPassword
              ? 'Mereset kunci keamanan akan mengaktifkan enkripsi E2EE baru pada perangkat ini dan menonaktifkan sesi pada perangkat lain.'
              : 'Akun Anda telah memiliki kunci enkripsi aktif di perangkat lain. Anda dapat memindai kode QR dari perangkat lama untuk menyinkronkan kunci tanpa reset, atau mereset kunci menggunakan kata sandi Anda.'}
          </Text>

          {isPromptingPassword ? (
            <View style={styles.formContainer}>
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

              <Button
                title="Konfirmasi & Reset Kunci"
                variant="primary"
                isLoading={isLoading}
                disabled={isLoading}
                style={styles.actionButton}
                onPress={handleSubmitReset}
              />

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
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xxl,
    alignItems: 'center',
    ...shadows.modal,
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
