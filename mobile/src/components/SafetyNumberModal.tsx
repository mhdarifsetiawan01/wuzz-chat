/**
 * WuzzChat Mobile UI - SafetyNumberModal Component
 * Full 30-digit E2EE Key Fingerprint verification modal (WhatsApp & Signal grade).
 *
 * Conforms to:
 * - Mandatory Dual-Platform Frontend Architecture Rule
 * - Slow & Flaky Server Resilience Rule
 * - Mandatory Frontend Design System & Token Compliance Rule
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateSafetyNumber, isContactSafetyVerified, setContactSafetyVerified } from '../services/e2eeService';
import { QRCodeView } from './QRCodeView';
import { colors, radius, spacing, typography } from '../theme';

export interface SafetyNumberModalProps {
  visible: boolean;
  onClose: () => void;
  currentUserId: string;
  peerId: string;
  peerNickname: string;
  peerPublicKeyJWK?: string;
  myPublicKeyJWK?: string;
  onVerificationChanged?: (verified: boolean) => void;
}

export const SafetyNumberModal: React.FC<SafetyNumberModalProps> = ({
  visible,
  onClose,
  currentUserId,
  peerId,
  peerNickname,
  peerPublicKeyJWK,
  myPublicKeyJWK,
  onVerificationChanged,
}) => {
  const insets = useSafeAreaInsets();
  const [safetyNumber, setSafetyNumber] = useState<string>('00000 00000 00000 00000 00000 00000');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [copied, setCopied] = useState<boolean>(false);
  const [isVerified, setIsVerified] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'digits' | 'qr'>('digits');

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    setIsLoading(true);

    async function loadFingerprint() {
      try {
        if (!peerPublicKeyJWK || !myPublicKeyJWK) {
          if (mounted) {
            setSafetyNumber('Kunci enkripsi belum tersedia');
            setIsLoading(false);
          }
          return;
        }

        const num = await generateSafetyNumber(myPublicKeyJWK, peerPublicKeyJWK);
        if (mounted) {
          setSafetyNumber(num);
          const verified = await isContactSafetyVerified(peerId, num);
          setIsVerified(verified);
          setIsLoading(false);
        }
      } catch (err) {
        console.warn('[SafetyNumberModal] Failed to calculate safety number:', err);
        if (mounted) {
          setSafetyNumber('Gagal menghitung nomor keamanan');
          setIsLoading(false);
        }
      }
    }

    loadFingerprint();

    return () => {
      mounted = false;
    };
  }, [visible, peerPublicKeyJWK, myPublicKeyJWK, peerId]);

  const handleCopy = async () => {
    try {
      await Clipboard.setStringAsync(safetyNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.warn('[SafetyNumberModal] Failed to copy to clipboard:', err);
    }
  };

  const handleToggleVerification = async () => {
    const nextState = !isVerified;
    setIsVerified(nextState);
    await setContactSafetyVerified(peerId, safetyNumber, nextState);
    if (onVerificationChanged) {
      onVerificationChanged(nextState);
    }
  };

  if (!visible) return null;

  const chunks = safetyNumber.split(' ');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.md),
              paddingTop: spacing.md,
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.lockIcon}>🔒</Text>
              <Text style={styles.headerTitle}>Verifikasi Nomor Keamanan</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* Description */}
            <Text style={styles.description}>
              Pesan dan panggilan dengan{' '}
              <Text style={styles.highlightName}>{peerNickname || 'Kontak'}</Text> didukung oleh
              enkripsi ujung-ke-ujung (<Text style={styles.highlight}>E2EE</Text>). Cocokkan 30
              digit kode atau pindai kode QR di bawah pada perangkat lawan bicara.
            </Text>

            {/* Verification Status Banner */}
            <View
              style={[
                styles.statusBanner,
                isVerified ? styles.statusBannerVerified : styles.statusBannerUnverified,
              ]}
            >
              <Text style={styles.statusBannerText}>
                {isVerified
                  ? '✅ Kontak Telah Diverifikasi Aman'
                  : '⚠️ Belum Diverifikasi Secara Manual'}
              </Text>
            </View>

            {/* Tab Switcher: 30-Digit vs QR Code */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'digits' && styles.tabBtnActive]}
                onPress={() => setActiveTab('digits')}
                activeOpacity={0.8}
              >
                <Text
                  style={[styles.tabBtnText, activeTab === 'digits' && styles.tabBtnTextActive]}
                >
                  🔢 30-Digit Angka
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.tabBtn, activeTab === 'qr' && styles.tabBtnActive]}
                onPress={() => setActiveTab('qr')}
                activeOpacity={0.8}
              >
                <Text style={[styles.tabBtnText, activeTab === 'qr' && styles.tabBtnTextActive]}>
                  📱 Kode QR
                </Text>
              </TouchableOpacity>
            </View>

            {/* Tab 1: 30-Digit Key Fingerprint */}
            {activeTab === 'digits' ? (
              <View style={styles.digitsSection}>
                {isLoading ? (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color={colors.accentPrimary} />
                    <Text style={styles.loadingText}>Menghitung fingerprint kunci...</Text>
                  </View>
                ) : (
                  <View style={styles.gridContainer}>
                    {chunks.map((chunk, idx) => (
                      <View key={`chunk-${idx}`} style={styles.digitChunk}>
                        <Text style={styles.digitText}>{chunk}</Text>
                      </View>
                    ))}
                  </View>
                )}

                <TouchableOpacity
                  style={styles.copyButton}
                  onPress={handleCopy}
                  activeOpacity={0.8}
                >
                  <Text style={styles.copyButtonText}>
                    {copied ? '✅ Nomor Keamanan Disalin!' : '📋 Salin Nomor Keamanan'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              /* Tab 2: Visual QR Code */
              <View style={styles.qrSection}>
                <View style={styles.qrWrapper}>
                  <QRCodeView
                    value={`wuzz-safety://${currentUserId}/${peerId}/${safetyNumber.replace(/\s+/g, '')}`}
                    size={220}
                    padding={16}
                  />
                </View>
                <Text style={styles.qrCaption}>
                  Pindai kode ini langsung dari kamera atau scanner perangkat lawan bicara.
                </Text>
              </View>
            )}

            {/* Toggle Verification Button */}
            <TouchableOpacity
              style={[
                styles.verifyToggleBtn,
                isVerified ? styles.verifyToggleBtnActive : styles.verifyToggleBtnInactive,
              ]}
              onPress={handleToggleVerification}
              activeOpacity={0.8}
            >
              <Text style={styles.verifyToggleText}>
                {isVerified
                  ? 'Batalkan Status Verifikasi'
                  : '✓ Tandai Sebagai Kontak Terverifikasi'}
              </Text>
            </TouchableOpacity>
          </ScrollView>

          {/* Bottom Close Button */}
          <TouchableOpacity style={styles.closeMainBtn} onPress={onClose} activeOpacity={0.8}>
            <Text style={styles.closeMainBtnText}>Selesai</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: colors.bgOverlay,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: spacing.lg,
    maxHeight: '90%',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  lockIcon: {
    fontSize: 20,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  scrollContent: {
    paddingBottom: spacing.md,
  },
  description: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    lineHeight: 20,
    marginBottom: spacing.md,
    textAlign: 'center',
  },
  highlightName: {
    color: colors.textPrimary,
    fontWeight: '700',
  },
  highlight: {
    color: colors.colorCyanNeon,
    fontWeight: '700',
  },
  statusBanner: {
    paddingVertical: spacing.xs + 2,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  statusBannerVerified: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  statusBannerUnverified: {
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
    borderColor: 'rgba(245, 158, 11, 0.35)',
  },
  statusBannerText: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bgCard,
    borderRadius: radius.lg,
    padding: 3,
    marginBottom: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.md,
  },
  tabBtnActive: {
    backgroundColor: colors.accentPrimary,
  },
  tabBtnText: {
    ...typography.caption,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabBtnTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  digitsSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  loadingContainer: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    ...typography.caption,
    color: colors.textMuted,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCard,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(0, 242, 254, 0.25)',
    width: '100%',
    marginBottom: spacing.md,
  },
  digitChunk: {
    width: '48%',
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  digitText: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'monospace',
    letterSpacing: 2,
    color: colors.colorCyanNeon,
  },
  copyButton: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
  },
  copyButtonText: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
    fontWeight: '600',
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  qrWrapper: {
    padding: spacing.xs,
    backgroundColor: '#ffffff',
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
  },
  qrCaption: {
    ...typography.caption,
    color: colors.textMuted,
    textAlign: 'center',
    marginTop: spacing.xs,
  },
  verifyToggleBtn: {
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  verifyToggleBtnActive: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  verifyToggleBtnInactive: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  verifyToggleText: {
    ...typography.bodySecondary,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  closeMainBtn: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.sm + 2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeMainBtnText: {
    ...typography.body,
    fontWeight: '700',
    color: '#ffffff',
  },
});
