/**
 * AuthorizationShield — DEC-013: Private Group Direct Link Gate & Authorization Shield
 * Aurora Glassmorphism protection view displayed when a user accesses a private group
 * without membership authorization (HTTP 403 Forbidden).
 *
 * Conforms to:
 *  - Mandatory Dual-Platform Frontend Architecture Rule
 *  - Strict Prohibition of empty chat rendering & false connection timeouts
 *  - Mandatory Frontend Design System & Token Compliance Rule
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { colors } from '../theme/colors';
import { spacing, radius, shadows } from '../theme/spacing';
import { typography } from '../theme/typography';

export interface AuthorizationShieldProps {
  onBack: () => void;
  errorDetail?: string;
  groupId?: string;
}

export const AuthorizationShield: React.FC<AuthorizationShieldProps> = ({
  onBack,
  errorDetail,
  groupId,
}) => {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.card}>
          {/* Glowing Red Shield Icon */}
          <View style={styles.iconGlowContainer}>
            <View style={styles.iconCircle}>
              <Text style={styles.lockIcon}>🔒</Text>
            </View>
          </View>

          {/* Title & Badge */}
          <View style={styles.titleSection}>
            <View style={styles.privateBadge}>
              <Text style={styles.privateBadgeText}>AKSES DITOLAK (403)</Text>
            </View>
            <Text style={styles.title}>Grup Ini Bersifat Privat</Text>
          </View>

          {/* Description */}
          <Text style={styles.description}>
            Anda tidak dapat mengakses atau melihat pesan di dalam grup ini karena Anda bukan anggota.
            Untuk bergabung, silakan minta admin atau pembuat grup untuk mengundang atau menambahkan akun Anda.
          </Text>

          {/* Optional Server Error Detail */}
          {errorDetail ? (
            <View style={styles.detailBox}>
              <Text style={styles.detailText}>
                {errorDetail}
              </Text>
            </View>
          ) : null}

          {/* Return Home Action Button */}
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.8}
          >
            <Text style={styles.backButtonText}>← Kembali ke Beranda Obrolan</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(15, 23, 42, 0.95)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    ...shadows.modal,
  },
  iconGlowContainer: {
    marginBottom: spacing.lg,
    padding: 6,
    borderRadius: radius.full,
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
  },
  iconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lockIcon: {
    fontSize: 32,
  },
  titleSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  privateBadge: {
    backgroundColor: colors.tintError10,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    marginBottom: spacing.xs,
  },
  privateBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: colors.colorDanger,
    letterSpacing: 0.5,
  },
  title: {
    ...typography.h2,
    fontSize: 20,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  description: {
    ...typography.body,
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  detailBox: {
    width: '100%',
    backgroundColor: colors.bgElevated,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
  },
  detailText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  backButton: {
    width: '100%',
    height: 48,
    borderRadius: radius.lg,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  backButtonText: {
    ...typography.button,
    color: colors.textPrimary,
    fontWeight: '700',
  },
});
