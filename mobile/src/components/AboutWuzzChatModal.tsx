/**
 * WuzzChat Mobile UI - AboutWuzzChatModal
 * Dialog informasi profil, visi, dan filosofi platform WuzzChat.
 */

import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BottomSheetModal } from './BottomSheetModal';
import { Button } from './Button';
import { colors, radius, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { getAppVersionInfo } from '../utils/appVersion';

interface AboutWuzzChatModalProps {
  visible: boolean;
  onClose: () => void;
}

export const AboutWuzzChatModal: React.FC<AboutWuzzChatModalProps> = ({
  visible,
  onClose,
}) => {
  const appVersion = getAppVersionInfo();

  return (
    <BottomSheetModal visible={visible} onClose={onClose} title="Tentang WuzzChat">
      <View style={styles.container}>
        {/* App Logo & Title */}
        <View style={styles.headerBlock}>
          <View style={styles.logoBadge}>
            <Image source={require('../../assets/icon.png')} style={styles.logoImage} />
          </View>
          <Text style={styles.appName}>
            <Text style={{ color: colors.accentPrimary }}>Wuzz</Text>
            <Text style={{ color: colors.monoAmber }}>Chat</Text>
          </Text>
          <Text style={styles.tagline}>
            Actionable Knowledge Messaging Engine
          </Text>
        </View>

        {/* Mission Statement Box */}
        <View style={styles.missionCard}>
          <IconText style={styles.missionIcon}>💡</IconText>
          <Text style={styles.missionText}>
            WuzzChat adalah aplikasi percakapan untuk individu, tim, dan komunitas: pesan langsung terenkripsi ujung-ke-ujung, grup dengan topik forum, dan panggilan suara.
          </Text>
        </View>

        {/* Core Pillars */}
        <View style={styles.pillarsContainer}>
          <View style={styles.pillarItem}>
            <IconText style={styles.pillarIcon}>🛡️</IconText>
            <View style={styles.pillarContent}>
              <Text style={styles.pillarTitle}>Zero-Knowledge E2EE</Text>
              <Text style={styles.pillarDesc}>
                Enkripsi ujung-ke-ujung NIST P-256 ECDH + AES-GCM. Kunci privat tidak pernah meninggalkan perangkat Anda.
              </Text>
            </View>
          </View>

          <View style={styles.pillarItem}>
            <Text style={styles.pillarIcon}>🧠</Text>
            <View style={styles.pillarContent}>
              <Text style={styles.pillarTitle}>Knowledge Memory (segera hadir)</Text>
              <Text style={styles.pillarDesc}>
                Rencana: merangkum intisari percakapan terbuka agar dapat dicari dan diingat kembali, dengan validasi manusia. Fitur ini belum tersedia di aplikasi.
              </Text>
            </View>
          </View>

          <View style={styles.pillarItem}>
            <IconText style={styles.pillarIcon}>⚡</IconText>
            <View style={styles.pillarContent}>
              <Text style={styles.pillarTitle}>Cepat & Andal</Text>
              <Text style={styles.pillarDesc}>
                Koneksi WebSocket real-time ringan, cache offline SQLite lokal, dan antarmuka modern yang responsif.
              </Text>
            </View>
          </View>
        </View>

        {/* Version & Build */}
        <View style={styles.versionRow}>
          <Text style={styles.versionText}>
            Versi {appVersion.version} (Build {appVersion.buildNumber}) · Aurora Engine
          </Text>
        </View>

        {/* Action Button */}
        <Button
          title="Tutup"
          variant="primary"
          onPress={onClose}
          style={styles.closeBtn}
        />
      </View>
    </BottomSheetModal>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing.sm,
    paddingTop: spacing.xs,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoBadge: {
    width: 56,
    height: 56,
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: spacing.xs,
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  appName: {
    ...typography.h2,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  tagline: {
    ...typography.captionBold,
    color: colors.textSecondary,
    marginTop: 2,
  },
  missionCard: {
    backgroundColor: colors.tintAccent10,
    borderWidth: 1,
    borderColor: `${colors.accentPrimary}30`,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
  },
  missionIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  missionText: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
    flex: 1,
    lineHeight: 20,
    fontWeight: '500',
  },
  pillarsContainer: {
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  pillarItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  pillarIcon: {
    fontSize: 18,
    marginTop: 1,
  },
  pillarContent: {
    flex: 1,
  },
  pillarTitle: {
    ...typography.captionBold,
    color: colors.textPrimary,
  },
  pillarDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
    lineHeight: 16,
  },
  versionRow: {
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
  versionText: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
  },
  closeBtn: {
    marginTop: spacing.xs,
  },
});
