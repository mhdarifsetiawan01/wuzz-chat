/**
 * WuzzChat Mobile UI - PrivateAccountNoticeModal Component
 * Elegant modal dialog for notifying users about private account interactions
 * (restricted DM, restricted calls, or pending connection status).
 *
 * Compliant with mobile/DESIGN.md & Workspace Design System.
 */

import React from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { ConnectionStatus } from '../api/types';
import { Avatar } from './Avatar';
import { Button } from './Button';

export interface PrivateAccountNoticeModalProps {
  visible: boolean;
  onClose: () => void;
  targetUser?: {
    id: string;
    display_name: string;
    username?: string;
    avatar_url?: string;
  } | null;
  mode?: 'chat' | 'call' | 'general';
  title?: string;
  description?: string;
  connectionStatus?: ConnectionStatus;
  isAddingFriend?: boolean;
  onAddFriend?: () => void;
}

export const PrivateAccountNoticeModal: React.FC<PrivateAccountNoticeModalProps> = ({
  visible,
  onClose,
  targetUser,
  mode = 'chat',
  title,
  description,
  connectionStatus = 'none',
  isAddingFriend = false,
  onAddFriend,
}) => {
  if (!visible) return null;

  const displayName = targetUser?.display_name || 'Pengguna ini';
  const isCall = mode === 'call';

  const defaultTitle = isCall ? 'Panggilan Dibatasi' : 'Akun Bersifat Privat';

  const defaultDescription =
    connectionStatus === 'pending'
      ? `Permintaan pertemanan telah dikirim ke ${displayName} dan sedang menunggu persetujuan.`
      : isCall
      ? `${displayName} membatasi panggilan suara dan video hanya untuk teman terhubung. Kirim permohonan pertemanan untuk mulai terhubung.`
      : `${displayName} mengaktifkan mode akun privat. Pesan langsung hanya dapat dikirim setelah kalian saling terhubung sebagai teman.`;

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
          {/* Top Badge Icon */}
          <View
            style={[
              styles.iconContainer,
              isCall ? styles.callIconBg : styles.privateIconBg,
            ]}
          >
            <IconText style={styles.icon}>{isCall ? '📞' : '🔒'}</IconText>
          </View>

          {/* Title */}
          <Text style={styles.title}>{title || defaultTitle}</Text>

          {/* User Preview Pill */}
          {targetUser ? (
            <View style={styles.userBadge}>
              <Avatar
                name={displayName}
                avatarUrl={targetUser.avatar_url}
                size={28}
                shape="circle"
              />
              <View style={styles.userBadgeInfo}>
                <Text style={styles.userBadgeName} numberOfLines={1}>
                  {displayName}
                </Text>
                {targetUser.username ? (
                  <Text style={styles.userBadgeUsername} numberOfLines={1}>
                    @{targetUser.username}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}

          {/* Friendly Description */}
          <Text style={styles.description}>{description || defaultDescription}</Text>

          {/* Action Buttons */}
          <View style={styles.actionContainer}>
            {connectionStatus === 'none' && onAddFriend ? (
              <>
                <Button
                  title="+ Tambah Teman"
                  variant="primary"
                  isLoading={isAddingFriend}
                  onPress={onAddFriend}
                  style={styles.primaryBtn}
                />
                <Button
                  title="Nanti Saja"
                  variant="secondary"
                  disabled={isAddingFriend}
                  onPress={onClose}
                  style={styles.secondaryBtn}
                />
              </>
            ) : (
              <Button
                title="Mengerti"
                variant="primary"
                onPress={onClose}
                style={styles.primaryBtn}
              />
            )}
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
    width: 64,
    height: 64,
    borderRadius: radius.full,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  privateIconBg: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.tintAccent20,
  },
  callIconBg: {
    backgroundColor: colors.tintWarning10,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  icon: {
    fontSize: 28,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
    textAlign: 'center',
  },
  userBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgInput,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    maxWidth: '85%',
  },
  userBadgeInfo: {
    marginLeft: spacing.sm,
    flexShrink: 1,
  },
  userBadgeName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  userBadgeUsername: {
    fontSize: 11,
    color: colors.textSecondary,
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
