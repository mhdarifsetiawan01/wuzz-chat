/**
 * GroupPreviewModal — DEC-012: Public Group Discovery & Preview Confirmation
 * Aurora Glassmorphism modal to prevent accidental auto-joins when discovering public groups.
 *
 * Conforms to:
 *  - Mandatory Dual-Platform Frontend Architecture Rule
 *  - Slow & Flaky Server Resilience Rule (AbortController 15s, anti-double-action)
 *  - Mandatory Frontend Design System & Token Compliance Rule
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { groupsApi } from '../api/groups';
import { GroupDetails } from '../api/types';
import { Avatar } from './Avatar';
import { colors } from '../theme/colors';
import { spacing, radius, shadows } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface GroupPreviewModalProps {
  visible: boolean;
  group: GroupDetails | null;
  onClose: () => void;
  onJoined: (group: GroupDetails) => void;
}

export const GroupPreviewModal: React.FC<GroupPreviewModalProps> = ({
  visible,
  group,
  onClose,
  onJoined,
}) => {
  const insets = useSafeAreaInsets();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (visible) {
      setIsLoading(false);
      setErrorMessage(null);
    } else {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
        abortControllerRef.current = null;
      }
    }
  }, [visible]);

  if (!visible || !group) return null;

  const isMember = Boolean(group.my_role || (group as any).is_member);
  const memberCount = group.member_count ?? 1;
  const title = group.title || (group as any).name || 'Grup Publik';

  const handleAction = async () => {
    if (isLoading) return; // Anti-double-action guard

    // Case A: User is already a member -> Directly open chat without calling join API
    if (isMember) {
      onJoined(group);
      return;
    }

    // Case B: Not a member -> Call POST /api/groups/{id}/join with 15s timeout
    setIsLoading(true);
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 15000);

    try {
      await groupsApi.joinPublicGroup(group.id);
      clearTimeout(timeoutId);
      onJoined({
        ...group,
        my_role: 'member',
        member_count: memberCount + 1,
      });
    } catch (err: any) {
      clearTimeout(timeoutId);
      console.warn('[GroupPreviewModal] Failed to join group:', err);
      if (err?.name === 'AbortError' || err?.status === 408) {
        setErrorMessage('Koneksi timeout (15 detik). Periksa jaringan Anda dan coba lagi.');
      } else {
        setErrorMessage(err?.detail || err?.message || 'Gagal bergabung ke grup publik.');
      }
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!isLoading) onClose();
      }}
    >
      <View style={styles.overlay}>
        <TouchableOpacity
          style={styles.backdrop}
          activeOpacity={1}
          onPress={() => {
            if (!isLoading) onClose();
          }}
        />

        <View
          style={[
            styles.container,
            { paddingBottom: Math.max(insets.bottom, spacing.xl) },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.headerIcon}>🌐</Text>
              <Text style={styles.headerTitle}>Pratinjau Grup Publik</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              disabled={isLoading}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.body}
            showsVerticalScrollIndicator={false}
          >
            {/* Avatar & Badges */}
            <View style={styles.avatarSection}>
              <View style={styles.avatarGlowContainer}>
                <Avatar
                  name={title}
                  avatarUrl={group.avatar_url}
                  size={76}
                />
              </View>

              <View style={styles.badgeRow}>
                <View style={styles.publicBadge}>
                  <Text style={styles.publicBadgeIcon}>🌐</Text>
                  <Text style={styles.publicBadgeText}>Publik</Text>
                </View>
                <View style={styles.membersBadge}>
                  <Text style={styles.membersBadgeText}>👥 {memberCount} Anggota</Text>
                </View>
              </View>

              <Text style={styles.groupTitle} numberOfLines={2}>
                {title}
              </Text>

              {group.group_username ? (
                <Text style={styles.groupHandle} numberOfLines={1}>
                  @{group.group_username}
                </Text>
              ) : null}
            </View>

            {/* Description Card */}
            <View style={styles.descCard}>
              <Text style={styles.descLabel}>TENTANG GRUP</Text>
              <Text style={styles.descText}>
                {group.description && group.description.trim().length > 0
                  ? group.description.trim()
                  : 'Tidak ada deskripsi untuk grup ini.'}
              </Text>
            </View>

            {/* Info notice */}
            <View style={styles.noticeBox}>
              <Text style={styles.noticeIcon}>ℹ️</Text>
              <Text style={styles.noticeText}>
                {isMember
                  ? 'Anda sudah menjadi anggota grup publik ini. Tekan tombol di bawah untuk langsung membuka ruang obrolan.'
                  : 'Grup ini bersifat publik dan dapat diikuti oleh siapa saja. Anda akan mendapatkan pembaruan pesan setelah bergabung.'}
              </Text>
            </View>

            {/* Error Message */}
            {errorMessage ? (
              <View style={styles.errorBox}>
                <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
              </View>
            ) : null}
          </ScrollView>

          {/* Action Buttons */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={styles.cancelBtn}
              onPress={onClose}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelBtnText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.primaryBtn,
                isMember ? styles.memberBtn : styles.joinBtn,
                isLoading && styles.btnDisabled,
              ]}
              onPress={handleAction}
              disabled={isLoading}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isMember ? '💬 Buka Obrolan' : '➕ Gabung ke Grup'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
  },
  container: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '85%',
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    borderRadius: radius.xl,
    overflow: 'hidden',
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIcon: {
    fontSize: 18,
  },
  headerTitle: {
    ...typography.h3,
    fontSize: 16,
    color: colors.textPrimary,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtnText: {
    fontSize: 14,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  body: {
    padding: spacing.lg,
    alignItems: 'center',
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: spacing.lg,
    width: '100%',
  },
  avatarGlowContainer: {
    padding: 4,
    borderRadius: radius.full,
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.35)',
    marginBottom: spacing.md,
    ...shadows.card,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  publicBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
    gap: 4,
  },
  publicBadgeIcon: {
    fontSize: 11,
  },
  publicBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  membersBadge: {
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.full,
  },
  membersBadgeText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  groupTitle: {
    ...typography.h2,
    fontSize: 19,
    color: colors.textPrimary,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  groupHandle: {
    ...typography.caption,
    color: colors.accentPrimary,
    marginTop: 2,
  },
  descCard: {
    width: '100%',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  descLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textMuted,
    marginBottom: spacing.xs,
    letterSpacing: 0.5,
  },
  descText: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    lineHeight: 18,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    backgroundColor: 'rgba(59, 130, 246, 0.08)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.2)',
    padding: spacing.md,
    gap: spacing.sm,
  },
  noticeIcon: {
    fontSize: 14,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 17,
  },
  errorBox: {
    width: '100%',
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: colors.colorDanger,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.md,
  },
  errorText: {
    fontSize: 12,
    color: colors.colorDanger,
    lineHeight: 16,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    gap: spacing.md,
  },
  cancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: radius.lg,
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    ...typography.button,
    color: colors.textSecondary,
  },
  primaryBtn: {
    flex: 1.6,
    height: 46,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  joinBtn: {
    backgroundColor: colors.accentPrimary,
  },
  memberBtn: {
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.accentPrimary,
  },
  btnDisabled: {
    opacity: 0.6,
  },
  primaryBtnText: {
    ...typography.button,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
