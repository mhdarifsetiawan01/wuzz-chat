/**
 * WuzzChat Force Update Modal Component
 * Non-dismissible overlay displaying mandatory app update prompt.
 * Strictly adheres to Mandatory Frontend Design System & Token Compliance Rule.
 */

import React, { useEffect, useState } from 'react';
import {
  Linking,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { colors, spacing, typography } from '../theme';
import { fetchAppUpdateInfo } from '../services/appUpdate';
import {
  ForceUpdatePayload,
  getAppVersionInfo,
  onForceUpdateRequired,
} from '../utils/appVersion';

export const ForceUpdateModal: React.FC = () => {
  const [updateInfo, setUpdateInfo] = useState<ForceUpdatePayload | null>(null);

  useEffect(() => {
    const unsubscribe = onForceUpdateRequired((payload) => {
      setUpdateInfo(payload);
    });
    return unsubscribe;
  }, []);

  if (!updateInfo) {
    return null;
  }

  const appInfo = getAppVersionInfo();

  const handleOpenStore = async () => {
    let targetUrl = updateInfo.update_url;
    if (!targetUrl) {
      // Mis. dari penutupan WebSocket (4426): ambil tujuan unduh sesuai channel dari backend
      targetUrl = (await fetchAppUpdateInfo(true))?.download_url;
    }
    if (!targetUrl) {
      if (Platform.OS === 'android') {
        targetUrl = `market://details?id=${appInfo.clientId}`;
      } else {
        targetUrl = 'https://apps.apple.com/app/wuzz-chat/id000000000';
      }
    }

    try {
      const supported = await Linking.canOpenURL(targetUrl);
      if (supported) {
        await Linking.openURL(targetUrl);
      } else {
        // Fallback to web play store url if market:// scheme is not supported (e.g. emulator)
        const fallbackUrl =
          Platform.OS === 'android'
            ? `https://play.google.com/store/apps/details?id=${appInfo.clientId}`
            : 'https://apps.apple.com';
        await Linking.openURL(fallbackUrl);
      }
    } catch (err) {
      console.error('[ForceUpdate] Failed to open store URL:', err);
    }
  };

  return (
    <Modal
      visible={Boolean(updateInfo)}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {
        // Non-dismissible: abaikan hardware back button di Android
      }}
    >
      <View style={styles.backdrop}>
        <View style={styles.card}>
          {/* Header Icon Badge */}
          <View style={styles.iconContainer}>
            <Text style={styles.iconEmoji}>🚀</Text>
          </View>

          {/* Title & Subtitle */}
          <Text style={styles.title}>Pembaruan Wajib Tersedia</Text>
          <Text style={styles.message}>
            {updateInfo.message ||
              'Versi aplikasi yang Anda gunakan sudah tidak didukung oleh server. Silakan perbarui ke versi terbaru untuk melanjutkan.'}
          </Text>

          {/* Version Info Badge Container */}
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Versi Saat Ini:</Text>
              <Text style={styles.infoValue}>
                v{appInfo.version} (Build {appInfo.buildNumber})
              </Text>
            </View>
            {Boolean(updateInfo.min_build) && (
              <View style={[styles.infoRow, { marginTop: spacing.xs }]}>
                <Text style={styles.infoLabel}>Batas Minimal Didukung:</Text>
                <Text style={[styles.infoValue, { color: colors.colorWarning }]}>
                  Build {updateInfo.min_build}+
                </Text>
              </View>
            )}
          </View>

          {/* Action Button */}
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.85}
            onPress={handleOpenStore}
          >
            <Text style={styles.primaryButtonText}>
              Perbarui Aplikasi Sekarang
            </Text>
          </TouchableOpacity>

          <Text style={styles.footerNote}>
            WuzzChat memerlukan versi terbaru untuk menjaga enkripsi dan keamanan data Anda.
          </Text>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.bgSurface,
    borderRadius: 20,
    padding: spacing.xl,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.tintAccent20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  iconEmoji: {
    fontSize: 32,
  },
  title: {
    ...typography.h3,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  message: {
    ...typography.bodySecondary,
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  infoBox: {
    width: '100%',
    backgroundColor: colors.bgBase,
    borderRadius: 12,
    padding: spacing.md,
    marginBottom: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.captionBold,
    color: colors.textPrimary,
  },
  primaryButton: {
    width: '100%',
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  primaryButtonText: {
    ...typography.button,
    color: colors.textOnAccent,
  },
  footerNote: {
    ...typography.caption,
    fontSize: 11,
    textAlign: 'center',
    marginTop: spacing.xs,
    lineHeight: 16,
  },
});
