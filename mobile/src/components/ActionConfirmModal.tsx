/**
 * WuzzChat Mobile UI - ActionConfirmModal Component
 * Polished dialog modal to replace generic Alert.alert for destructive or important actions
 * (e.g. Unfriend, Block, Delete).
 *
 * Compliant with mobile/DESIGN.md & Workspace Design System.
 */

import React from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Button } from './Button';

export interface ActionConfirmModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmTitle?: string;
  cancelTitle?: string;
  confirmVariant?: 'primary' | 'danger';
  isLoading?: boolean;
  icon?: string;
  iconBgVariant?: 'danger' | 'warning' | 'info';
}

export const ActionConfirmModal: React.FC<ActionConfirmModalProps> = ({
  visible,
  onClose,
  onConfirm,
  title,
  description,
  confirmTitle = 'Konfirmasi',
  cancelTitle = 'Batal',
  confirmVariant = 'danger',
  isLoading = false,
  icon = '⚠️',
  iconBgVariant = 'warning',
}) => {
  if (!visible) return null;

  const getIconBgStyle = () => {
    switch (iconBgVariant) {
      case 'danger':
        return styles.iconDangerBg;
      case 'info':
        return styles.iconInfoBg;
      default:
        return styles.iconWarningBg;
    }
  };

  return (
    <Modal
      transparent
      animationType="fade"
      visible={visible}
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Icon Badge */}
          <View style={[styles.iconContainer, getIconBgStyle()]}>
            <IconText style={styles.icon}>{icon}</IconText>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title}</Text>

          {/* Description */}
          <Text style={styles.description}>{description}</Text>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            <Button
              title={confirmTitle}
              variant={confirmVariant}
              isLoading={isLoading}
              onPress={onConfirm}
              style={styles.primaryBtn}
            />
            <Button
              title={cancelTitle}
              variant="secondary"
              disabled={isLoading}
              onPress={onClose}
              style={styles.secondaryBtn}
            />
          </View>
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
    maxWidth: 380,
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
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
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconWarningBg: {
    backgroundColor: colors.tintWarning10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  iconDangerBg: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.tintError20,
  },
  iconInfoBg: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.tintAccent20,
  },
  icon: {
    fontSize: 26,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  description: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.xl,
    lineHeight: 22,
    paddingHorizontal: spacing.xs,
  },
  actionContainer: {
    width: '100%',
    gap: spacing.sm,
  },
  primaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
  },
  secondaryBtn: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
  },
});
