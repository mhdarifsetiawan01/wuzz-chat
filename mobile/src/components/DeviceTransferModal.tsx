/**
 * WuzzChat Mobile UI - DeviceTransferModal Component
 * Multi-Device Zero-Knowledge E2EE Key Transfer Modal.
 * 
 * Supports:
 * 1. Share Mode (Sender/Source Device): Generates wrapped key bundle and displays dynamic QR Code via QRCodeView.
 * 2. Scan Mode (Receiver/Target Device): Opens CameraQRScannerModal to scan QR and imports keypair into Keystore.
 * 3. Manual Input Mode (Fallback): Allows pasting 64-hex session token.
 * 
 * Complies with:
 * - Mandatory Dual-Platform Frontend Architecture Rule
 * - Mandatory Frontend Design System & Token Compliance Rule
 * - Mandatory Slow & Flaky Server Resilience Rule
 * - docs/MOBILE_INTEGRATION_GUIDE.md Section 3D & 7
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import {
  generateTransferSessionToken,
  uploadTransferSession,
  consumeAndImportTransfer,
  parseTransferQRData,
} from '../services/keyTransfer';
import { secureStorage } from '../services/secureStorage';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';
import { QRCodeView } from './QRCodeView';
import { CameraQRScannerModal } from './CameraQRScannerModal';

export type DeviceTransferMode = 'share' | 'scan' | 'input';

export interface DeviceTransferModalProps {
  visible: boolean;
  initialMode?: DeviceTransferMode;
  onClose: () => void;
  onTransferSuccess?: () => void;
}

export const DeviceTransferModal: React.FC<DeviceTransferModalProps> = ({
  visible,
  initialMode = 'share',
  onClose,
  onTransferSuccess,
}) => {
  const { user, e2eeKeyPair, importTransferredKeyPair } = useAuth();
  const { deviceId } = useDevice();

  const [activeTab, setActiveTab] = useState<DeviceTransferMode>(initialMode);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [sessionToken, setSessionToken] = useState<string>('');
  const [qrUrl, setQrUrl] = useState<string>('');
  const [timeLeft, setTimeLeft] = useState<number>(300); // 5 minutes TTL
  const [isExpired, setIsExpired] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState<boolean>(false);

  // Manual token input state
  const [manualToken, setManualToken] = useState<string>('');

  // Scanner modal state
  const [isScannerOpen, setIsScannerOpen] = useState<boolean>(false);

  const timerRef = useRef<any>(null);

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  // Initialize Share Mode: Generate token, pack & upload key bundle, generate QR URL
  const initShareSession = useCallback(async () => {
    if (!user?.id) return;
    clearTimer();
    setIsLoading(true);
    setErrorMsg(null);
    setIsExpired(false);
    setCopied(false);

    // Run crypto & network upload asynchronously after modal frame renders
    const timer = setTimeout(async () => {
      try {
        // 1. Get local keypair (prefer memory cache)
        let keyPair = e2eeKeyPair;
        if (!keyPair) {
          keyPair = await secureStorage.getE2EEKeyPair(user.id);
        }

        if (!keyPair || !keyPair.privateKeyHex || !keyPair.publicKeyJWK) {
          throw new Error('Kunci E2EE lokal belum dibuat atau tidak ditemukan.');
        }

        // 2. Generate random 32-byte session token
        const token = generateTransferSessionToken();
        setSessionToken(token);

        // 3. Encrypt and upload key bundle
        const { expires_in } = await uploadTransferSession(keyPair, token);
        const ttl = expires_in || 300;
        setTimeLeft(ttl);

        // 4. Set QR code URL
        const url = `https://chat.wuzzhub.id/transfer?token=${token}`;
        setQrUrl(url);

        // 5. Start countdown timer
        timerRef.current = setInterval(() => {
          setTimeLeft((prev) => {
            if (prev <= 1) {
              clearTimer();
              setIsExpired(true);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } catch (err: any) {
        console.error('[DeviceTransferModal] Failed to init share session:', err);
        setErrorMsg(err?.detail || err?.message || 'Gagal membuat sesi transfer kunci.');
      } finally {
        setIsLoading(false);
      }
    }, 100);

    return () => {
      clearTimeout(timer);
    };
  }, [user?.id, e2eeKeyPair, clearTimer]);

  // Effect to reset and handle visible/mode changes
  useEffect(() => {
    if (visible) {
      setIsSuccess(false);
      setErrorMsg(null);
      setActiveTab(initialMode);
      if (initialMode === 'share') {
        initShareSession();
      }
    } else {
      clearTimer();
      setSessionToken('');
      setQrUrl('');
      setManualToken('');
      setIsScannerOpen(false);
    }

    return () => {
      clearTimer();
    };
  }, [visible, initialMode, initShareSession, clearTimer]);

  const handleTabChange = (tab: DeviceTransferMode) => {
    if (isLoading) return;
    setErrorMsg(null);
    setActiveTab(tab);
    if (tab === 'share' && (!sessionToken || isExpired)) {
      initShareSession();
    }
  };

  // Copy token to clipboard
  const handleCopyToken = async () => {
    if (!sessionToken) return;
    try {
      await Clipboard.setStringAsync(sessionToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      Alert.alert('Gagal', 'Tidak dapat menyalin token ke papan klip.');
    }
  };

  // Handle scanned QR data from CameraQRScannerModal
  const handleScanResult = async (scannedData: string) => {
    setIsScannerOpen(false);
    if (!user?.id || !deviceId) {
      setErrorMsg('Identitas perangkat atau akun pengguna tidak valid.');
      return;
    }

    const token = parseTransferQRData(scannedData);
    if (!token) {
      Alert.alert(
        'Kode QR Tidak Valid',
        'Kode QR yang dipindai bukan kode transfer perangkat WuzzChat yang sah.'
      );
      return;
    }

    await executeConsumeTransfer(token);
  };

  // Consume and import keypair
  const executeConsumeTransfer = async (token: string) => {
    if (!user?.id || !deviceId) {
      setErrorMsg('Identitas perangkat atau akun pengguna tidak valid.');
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    try {
      const importedPair = await consumeAndImportTransfer(user.id, token, deviceId);
      await importTransferredKeyPair(importedPair);
      setIsSuccess(true);
      if (onTransferSuccess) {
        onTransferSuccess();
      }
    } catch (err: any) {
      console.error('[DeviceTransferModal] Consume transfer failed:', err);
      const msg =
        err?.detail ||
        err?.message ||
        'Gagal menyinkronkan kunci keamanan. Pastikan kode QR masih aktif dan belum kedaluwarsa.';
      setErrorMsg(msg);
      Alert.alert('Transfer Kunci Gagal', msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Manual input submit
  const handleManualSubmit = async () => {
    const cleanToken = manualToken.trim();
    if (!cleanToken) {
      setErrorMsg('Harap masukkan token transfer.');
      return;
    }

    const token = parseTransferQRData(cleanToken);
    if (!token) {
      setErrorMsg('Format token tidak valid. Token harus berupa 64-karakter heksadesimal.');
      return;
    }

    await executeConsumeTransfer(token);
  };

  // Format seconds to mm:ss
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={styles.container}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconWrapper}>
                <Text style={styles.headerIcon}>📱</Text>
              </View>
              <View>
                <Text style={styles.headerTitle}>Tautkan Perangkat</Text>
                <Text style={styles.headerSubtitle}>Multi-Device Zero-Knowledge E2EE</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Success View */}
          {isSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconCircle}>
                <Text style={styles.successIcon}>✓</Text>
              </View>
              <Text style={styles.successTitle}>Kunci E2EE Berhasil Disinkronkan!</Text>
              <Text style={styles.successMessage}>
                Perangkat ini sekarang terhubung penuh secara aman. Seluruh pesan terenkripsi dapat dibaca tanpa mereset riwayat obrolan Anda.
              </Text>
              <Button
                title="Selesai"
                variant="primary"
                onPress={onClose}
                style={styles.fullWidthButton}
              />
            </View>
          ) : (
            <>
              {/* Segmented Tab Controls */}
              <View style={styles.tabContainer}>
                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'share' && styles.tabButtonActive]}
                  onPress={() => handleTabChange('share')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, activeTab === 'share' && styles.tabTextActive]}>
                    Bagi Kunci
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'scan' && styles.tabButtonActive]}
                  onPress={() => handleTabChange('scan')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, activeTab === 'scan' && styles.tabTextActive]}>
                    Pindai QR
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.tabButton, activeTab === 'input' && styles.tabButtonActive]}
                  onPress={() => handleTabChange('input')}
                  activeOpacity={0.7}
                >
                  <Text style={[styles.tabText, activeTab === 'input' && styles.tabTextActive]}>
                    Input Kode
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.contentScroll}
                contentContainerStyle={styles.scrollContentContainer}
                showsVerticalScrollIndicator={false}
              >
                {/* Error Banner */}
                {errorMsg ? (
                  <View style={styles.errorBanner}>
                    <Text style={styles.errorIcon}>⚠️</Text>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                {/* TAB 1: SHARE MODE (SENDER) */}
                {activeTab === 'share' && (
                  <View style={styles.tabContent}>
                    <Text style={styles.description}>
                      Pindai kode QR ini dari perangkat lain (Laptop/HP baru) untuk menyinkronkan kunci enkripsi E2EE secara aman.
                    </Text>

                    {isLoading ? (
                      <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={colors.accentPrimary} />
                        <Text style={styles.loadingText}>Menyiapkan sesi transfer aman...</Text>
                      </View>
                    ) : isExpired ? (
                      <View style={styles.expiredBox}>
                        <Text style={styles.expiredIcon}>⏳</Text>
                        <Text style={styles.expiredTitle}>Sesi Transfer Kedaluwarsa</Text>
                        <Text style={styles.expiredDesc}>
                          Untuk keamanan data Anda, kode QR berlaku selama 5 menit.
                        </Text>
                        <Button
                          title="Buat Kode QR Baru"
                          variant="primary"
                          onPress={initShareSession}
                          style={styles.actionButton}
                        />
                      </View>
                    ) : qrUrl ? (
                      <View style={styles.qrContainer}>
                        <View style={styles.qrWrapper}>
                          <QRCodeView value={qrUrl} size={210} padding={12} />
                        </View>

                        {/* Timer Badge */}
                        <View style={styles.timerBadge}>
                          <Text style={styles.timerIcon}>⏱️</Text>
                          <Text style={styles.timerText}>
                            Kedaluwarsa dalam <Text style={styles.timerCountdown}>{formatTime(timeLeft)}</Text>
                          </Text>
                        </View>

                        {/* Copy Token Button */}
                        <TouchableOpacity
                          style={styles.copyButton}
                          onPress={handleCopyToken}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.copyButtonIcon}>{copied ? '✓' : '📋'}</Text>
                          <Text style={styles.copyButtonText}>
                            {copied ? 'Kode Token Tersalin!' : 'Salin Kode Token Manual'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}

                    <View style={styles.infoCard}>
                      <Text style={styles.infoCardTitle}>🛡️ Zero-Knowledge Security</Text>
                      <Text style={styles.infoCardText}>
                        Kunci enkripsi dibungkus dengan AES-256-GCM langsung di perangkat Anda. Server tidak dapat melihat atau mendekripsi private key Anda.
                      </Text>
                    </View>
                  </View>
                )}

                {/* TAB 2: SCAN MODE (RECEIVER) */}
                {activeTab === 'scan' && (
                  <View style={styles.tabContent}>
                    <Text style={styles.description}>
                      Gunakan kamera HP untuk memindai kode QR yang ditampilkan di perangkat lama Anda (Web, Laptop, atau HP lain).
                    </Text>

                    <View style={styles.instructionsCard}>
                      <View style={styles.instructionStep}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>1</Text>
                        </View>
                        <Text style={styles.stepText}>
                          Buka WuzzChat di perangkat lama Anda yang sudah aktif.
                        </Text>
                      </View>

                      <View style={styles.instructionStep}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>2</Text>
                        </View>
                        <Text style={styles.stepText}>
                          Pilih menu <Text style={styles.boldText}>Tautkan Perangkat</Text> ➔ <Text style={styles.boldText}>Bagi Kunci</Text>.
                        </Text>
                      </View>

                      <View style={styles.instructionStep}>
                        <View style={styles.stepBadge}>
                          <Text style={styles.stepBadgeText}>3</Text>
                        </View>
                        <Text style={styles.stepText}>
                          Tekan tombol di bawah untuk memindai kode QR yang muncul.
                        </Text>
                      </View>
                    </View>

                    <Button
                      title={isLoading ? 'Menyinkronkan Kunci...' : 'Buka Kamera Pemindai'}
                      variant="primary"
                      onPress={() => setIsScannerOpen(true)}
                      isLoading={isLoading}
                      disabled={isLoading}
                      style={styles.actionButton}
                    />
                  </View>
                )}

                {/* TAB 3: INPUT MODE (FALLBACK) */}
                {activeTab === 'input' && (
                  <View style={styles.tabContent}>
                    <Text style={styles.description}>
                      Jika kamera tidak dapat digunakan, tempelkan kode token transfer 64-karakter dari perangkat lama Anda di bawah ini:
                    </Text>

                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.textInput}
                        placeholder="Contoh: a1b2c3d4e5f6..."
                        placeholderTextColor={colors.textSecondary}
                        value={manualToken}
                        onChangeText={setManualToken}
                        autoCapitalize="none"
                        autoCorrect={false}
                        multiline
                        numberOfLines={3}
                        editable={!isLoading}
                      />
                    </View>

                    <Button
                      title={isLoading ? 'Memproses Transfer...' : 'Verifikasi & Sinkronkan Kunci'}
                      variant="primary"
                      onPress={handleManualSubmit}
                      isLoading={isLoading}
                      disabled={isLoading || !manualToken.trim()}
                      style={styles.actionButton}
                    />
                  </View>
                )}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>

      {/* Camera Live Scanner Sub-Modal (Lazy mounted) */}
      {isScannerOpen && (
        <CameraQRScannerModal
          visible={isScannerOpen}
          title="Pindai QR Kode Perangkat"
          onClose={() => setIsScannerOpen(false)}
          onScan={handleScanResult}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? spacing.xl : spacing.md,
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  headerIconWrapper: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcon: {
    fontSize: 20,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  headerSubtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: colors.bgElevated,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    color: colors.textSecondary,
    fontWeight: '600',
  },
  tabContainer: {
    flexDirection: 'row',
    backgroundColor: colors.bgBase,
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radius.md,
    padding: 3,
  },
  tabButton: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  tabButtonActive: {
    backgroundColor: colors.accentPrimary,
  },
  tabText: {
    ...typography.captionBold,
    color: colors.textSecondary,
  },
  tabTextActive: {
    color: colors.textOnAccent,
  },
  contentScroll: {
    maxHeight: 520,
  },
  scrollContentContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  tabContent: {
    alignItems: 'center',
  },
  description: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintError10,
    borderColor: colors.colorError,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
    marginBottom: spacing.md,
    gap: spacing.xs,
    width: '100%',
  },
  errorIcon: {
    fontSize: 16,
  },
  errorText: {
    flex: 1,
    ...typography.caption,
    color: colors.colorError,
  },
  loadingBox: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
  },
  expiredBox: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
  },
  expiredIcon: {
    fontSize: 40,
    marginBottom: spacing.xs,
  },
  expiredTitle: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  expiredDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  qrContainer: {
    alignItems: 'center',
    width: '100%',
  },
  qrWrapper: {
    backgroundColor: '#ffffff',
    padding: 8,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  timerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.full,
    marginTop: spacing.md,
    gap: spacing.xs,
  },
  timerIcon: {
    fontSize: 14,
  },
  timerText: {
    ...typography.caption,
    color: colors.textPrimary,
  },
  timerCountdown: {
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderColor: colors.borderDefault,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  copyButtonIcon: {
    fontSize: 14,
    color: colors.accentPrimary,
  },
  copyButtonText: {
    ...typography.captionBold,
    color: colors.textPrimary,
  },
  infoCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.lg,
    width: '100%',
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
  },
  infoCardTitle: {
    ...typography.captionBold,
    color: colors.textPrimary,
    marginBottom: 4,
  },
  infoCardText: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  instructionsCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  instructionStep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    backgroundColor: colors.accentPrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  stepText: {
    flex: 1,
    ...typography.caption,
    color: colors.textPrimary,
    lineHeight: 18,
  },
  boldText: {
    fontWeight: '700',
    color: colors.accentPrimary,
  },
  inputWrapper: {
    width: '100%',
    marginBottom: spacing.md,
  },
  textInput: {
    backgroundColor: colors.bgInput,
    borderColor: colors.borderDefault,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    color: colors.textPrimary,
    ...typography.input,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    minHeight: 80,
    textAlignVertical: 'top',
  },
  actionButton: {
    width: '100%',
    marginTop: spacing.xs,
  },
  successContainer: {
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.md,
  },
  successIconCircle: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: colors.tintSuccess10,
    borderWidth: 2,
    borderColor: colors.colorSuccess,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  successIcon: {
    fontSize: 32,
    color: colors.colorSuccess,
    fontWeight: '700',
  },
  successTitle: {
    ...typography.h2,
    color: colors.textPrimary,
    textAlign: 'center',
  },
  successMessage: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  fullWidthButton: {
    width: '100%',
  },
});
