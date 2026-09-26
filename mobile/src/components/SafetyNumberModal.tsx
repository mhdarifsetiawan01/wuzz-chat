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
  Alert,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateSafetyNumber, isContactSafetyVerified, setContactSafetyVerified } from '../services/e2eeService';
import { QRCodeView } from './QRCodeView';
import { CameraQRScannerModal } from './CameraQRScannerModal';
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

function extractFingerprintFromQR(data: string): string | null {
  if (!data) return null;
  const trimmed = data.trim();

  // 1. JSON format: {"type":"safety_number","fingerprint":"..."}
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
    try {
      const parsed = JSON.parse(trimmed);
      const candidate = parsed.fingerprint || parsed.safetyNumber || parsed.safety_number || parsed.num;
      if (typeof candidate === 'string') {
        const cleaned = candidate.replace(/\D/g, '');
        if (cleaned.length === 30) return cleaned;
      }
    } catch {
      // not JSON, continue to other checks
    }
  }

  // 2. Custom URL or Web link (wuzz-safety://... or https://...)
  if (trimmed.includes('://')) {
    const parts = trimmed.split('/');
    for (let i = parts.length - 1; i >= 0; i--) {
      const cleaned = parts[i].replace(/\D/g, '');
      if (cleaned.length === 30) return cleaned;
    }
  }

  // 3. Raw 30 digits with optional spaces or dashes
  const plainCleaned = trimmed.replace(/\D/g, '');
  if (plainCleaned.length === 30) {
    return plainCleaned;
  }

  return null;
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
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);
  const [scanFeedback, setScanFeedback] = useState<{
    type: 'success' | 'danger' | 'warning';
    message: string;
  } | null>(null);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;
    setIsLoading(true);
    setScanFeedback(null);

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

  const handleScanQR = async (scannedData: string) => {
    setIsScannerOpen(false);
    const currentClean = safetyNumber.replace(/\D/g, '');
    if (!currentClean || currentClean.length !== 30) {
      Alert.alert('Perhatian', 'Nomor keamanan belum siap dihitung. Harap tunggu sebentar.');
      return;
    }

    const scannedFingerprint = extractFingerprintFromQR(scannedData);
    if (!scannedFingerprint) {
      setScanFeedback({
        type: 'warning',
        message: 'Kode QR tidak dikenali sebagai format nomor keamanan WuzzChat yang valid.',
      });
      Alert.alert(
        'Format QR Tidak Dikenal',
        'Kode QR yang dipindai bukan format nomor keamanan WuzzChat yang valid.'
      );
      return;
    }

    if (scannedFingerprint === currentClean) {
      setIsVerified(true);
      await setContactSafetyVerified(peerId, safetyNumber, true);
      if (onVerificationChanged) {
        onVerificationChanged(true);
      }
      setScanFeedback({
        type: 'success',
        message: 'Nomor Keamanan Cocok 100%! Kontak telah berhasil diverifikasi melalui pemindaian kamera.',
      });
      Alert.alert(
        'Verifikasi Berhasil',
        `Nomor keamanan untuk ${peerNickname || 'kontak'} cocok 100%!\n\nKontak ini telah ditandai sebagai kontak aman terverifikasi.`,
        [{ text: 'Selesai' }]
      );
    } else {
      setScanFeedback({
        type: 'danger',
        message: 'PERINGATAN KEAMANAN: Nomor keamanan TIDAK COCOK! Kemungkinan kunci kontak telah berubah atau terjadi manipulasi jaringan (Man-in-the-Middle).',
      });
      Alert.alert(
        'PERINGATAN KEAMANAN',
        `Nomor keamanan TIDAK COCOK dengan perangkat ${peerNickname || 'kontak'}!\n\nKemungkinan sesi tidak aman atau perangkat lawan bicara menggunakan kunci enkripsi yang berbeda.`,
        [{ text: 'Mengerti', style: 'destructive' }]
      );
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

            {/* Scan Result Feedback Banner */}
            {scanFeedback && (
              <View
                style={[
                  styles.feedbackBanner,
                  scanFeedback.type === 'success' && styles.feedbackSuccess,
                  scanFeedback.type === 'danger' && styles.feedbackDanger,
                  scanFeedback.type === 'warning' && styles.feedbackWarning,
                ]}
              >
                <Text style={styles.feedbackIcon}>
                  {scanFeedback.type === 'success' ? '✅' : scanFeedback.type === 'danger' ? '🚨' : '⚠️'}
                </Text>
                <Text style={styles.feedbackText}>{scanFeedback.message}</Text>
                <TouchableOpacity
                  onPress={() => setScanFeedback(null)}
                  style={styles.feedbackCloseBtn}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <Text style={styles.feedbackCloseText}>✕</Text>
                </TouchableOpacity>
              </View>
            )}

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

                <View style={styles.actionRow}>
                  <TouchableOpacity
                    style={styles.copyButton}
                    onPress={handleCopy}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.copyButtonText}>
                      {copied ? '✅ Disalin!' : '📋 Salin Nomor'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.scanSecondaryBtn}
                    onPress={() => setIsScannerOpen(true)}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.scanSecondaryBtnText}>📷 Pindai QR</Text>
                  </TouchableOpacity>
                </View>
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

                <TouchableOpacity
                  style={styles.scanCameraPrimaryBtn}
                  onPress={() => setIsScannerOpen(true)}
                  activeOpacity={0.8}
                >
                  <Text style={styles.scanCameraPrimaryBtnText}>
                    📷 Pindai Kode QR {peerNickname ? peerNickname.split(' ')[0] : 'Kontak'}
                  </Text>
                </TouchableOpacity>
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

      {/* Live Camera QR Scanner Modal */}
      <CameraQRScannerModal
        visible={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleScanQR}
        title={`Pindai QR ${peerNickname || 'Kontak'}`}
      />
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
  feedbackBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    marginBottom: spacing.md,
    borderWidth: 1,
  },
  feedbackSuccess: {
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    borderColor: 'rgba(16, 185, 129, 0.4)',
  },
  feedbackDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: 'rgba(239, 68, 68, 0.4)',
  },
  feedbackWarning: {
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    borderColor: 'rgba(245, 158, 11, 0.4)',
  },
  feedbackIcon: {
    fontSize: 16,
    marginRight: spacing.sm,
  },
  feedbackText: {
    flex: 1,
    ...typography.caption,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  feedbackCloseBtn: {
    padding: 4,
    marginLeft: spacing.xs,
  },
  feedbackCloseText: {
    fontSize: 14,
    color: colors.textMuted,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    width: '100%',
  },
  copyButton: {
    flex: 1,
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  copyButtonText: {
    ...typography.bodySecondary,
    color: colors.textPrimary,
    fontWeight: '600',
    fontSize: 13,
  },
  scanSecondaryBtn: {
    flex: 1,
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.md,
    alignItems: 'center',
  },
  scanSecondaryBtnText: {
    ...typography.bodySecondary,
    color: colors.colorCyanNeon,
    fontWeight: '600',
    fontSize: 13,
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
    marginBottom: spacing.xs,
  },
  scanCameraPrimaryBtn: {
    backgroundColor: 'rgba(0, 242, 254, 0.12)',
    borderWidth: 1,
    borderColor: colors.colorCyanNeon,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    width: '100%',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  scanCameraPrimaryBtnText: {
    ...typography.bodySecondary,
    color: colors.colorCyanNeon,
    fontWeight: '700',
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
