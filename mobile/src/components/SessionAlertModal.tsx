/**
 * WuzzChat Mobile UI - SessionAlertModal Component
 * Modal dialog for handling WebSocket Close Code 4001: SESSION_REPLACED.
 */

import React from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

interface SessionAlertModalProps {
  visible: boolean;
  message?: string | null;
  onDismiss: () => void;
}

export const SessionAlertModal: React.FC<SessionAlertModalProps> = ({
  visible,
  message,
  onDismiss,
}) => {
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onDismiss}
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.iconContainer}>
            <Text style={styles.icon}>⚠️</Text>
          </View>

          <Text style={styles.title}>Sesi Dihentikan</Text>

          <Text style={styles.description}>
            {message ||
              'Akun WuzzChat Anda sedang aktif di perangkat lain. Sesi pada perangkat ini telah dinonaktifkan secara otomatis untuk menjaga keamanan akun Anda.'}
          </Text>

          <Button
            title="Masuk Kembali"
            variant="primary"
            style={styles.button}
            onPress={onDismiss}
          />
        </View>
      </View>
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
    backgroundColor: colors.tintError10,
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
    marginBottom: spacing.xxl,
    lineHeight: 22,
  },
  button: {
    width: '100%',
  },
});
