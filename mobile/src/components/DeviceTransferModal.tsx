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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../context/AuthContext';
import { useDevice } from '../context/DeviceContext';
import {
  generateTransferSessionToken,
  uploadTransferSession,
  parseTransferQRData,
} from '../services/keyTransfer';
import { canTransfer, TransferRole } from '../services/keyTransferPolicy';
import { radius, shadows, spacing, useTheme, useThemedStyles, ColorTokens, makeTypography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Button } from './Button';
import { QRCodeView } from './QRCodeView';
import { CameraQRScannerModal } from './CameraQRScannerModal';
import { showAlert } from '../services/dialog';

export type DeviceTransferMode = 'scan' | 'input';

export interface DeviceTransferModalProps {
  visible: boolean;
  role: TransferRole;
  initialMode?: DeviceTransferMode;
  onClose: () => void;
  onTransferSuccess?: () => void;
}

export const DeviceTransferModal: React.FC<DeviceTransferModalProps> = ({
  visible,
  role,
  initialMode = 'scan',
  onClose,
  onTransferSuccess,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();

  const { user, token, isLoading: authLoading, e2eeStatus, isGoogleLinkFrozen, isAccountSuspended,
    e2eeKeyPair, importTransferredKeyPair } = useAuth();
  const allowed = canTransfer(role, {
    userId: user?.id ?? null, session: token, status: e2eeStatus, hasKey: !!e2eeKeyPair,
    blocked: authLoading || isGoogleLinkFrozen || isAccountSuspended,
  });
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

  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const initTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const copyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const operation = useRef<AbortController | null>(null);
  const importBusy = useRef(false);

  const clearTimer = useCallback(() => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  }, []);

  const cancelOperation = useCallback(() => {
    operation.current?.abort();
    operation.current = null;
    if (initTimer.current) clearTimeout(initTimer.current);
    if (copyTimer.current) clearTimeout(copyTimer.current);
    initTimer.current = null;
    copyTimer.current = null;
    clearTimer();
  }, [clearTimer]);

  const initShareSession = useCallback(() => {
    if (!visible || !allowed || role !== 'sender' || !e2eeKeyPair) return;
    cancelOperation();
    const controller = new AbortController();
    operation.current = controller;
    setIsLoading(true);
    setErrorMsg(null);
    setIsExpired(false);
    setCopied(false);
    setSessionToken('');
    setQrUrl('');
    // Let the modal render before wrapping the key.
    initTimer.current = setTimeout(async () => {
      initTimer.current = null;
      try {
        if (controller.signal.aborted) return;
        const code = generateTransferSessionToken();
        const { expires_in } = await uploadTransferSession(e2eeKeyPair, code);
        if (controller.signal.aborted) return;
        const deadline = Date.now() + (expires_in || 300) * 1000;
        setSessionToken(code);
        setTimeLeft(expires_in || 300);
        setQrUrl(`https://chat.wuzzhub.id/transfer?token=${code}`);
        timerRef.current = setInterval(() => {
          const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
          setTimeLeft(remaining);
          if (!remaining) {
            clearTimer();
            setIsExpired(true);
          }
        }, 1000);
      } catch (err: any) {
        if (!controller.signal.aborted) setErrorMsg(err?.detail || err?.message || 'Gagal membuat sesi transfer kunci.');
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 100);
  }, [visible, allowed, role, e2eeKeyPair, cancelOperation, clearTimer]);

  useEffect(() => {
    setIsSuccess(false);
    setErrorMsg(null);
    setIsLoading(false);
    setSessionToken('');
    setQrUrl('');
    setManualToken('');
    setIsScannerOpen(false);
    setActiveTab(initialMode);
    if (visible && allowed) {
      if (role === 'sender') initShareSession();
      else operation.current = new AbortController();
    }
    return cancelOperation;
  }, [visible, allowed, role, initialMode, token, user?.id, initShareSession, cancelOperation]);

  const handleClose = () => {
    cancelOperation();
    onClose();
  };

  const handleTabChange = (tab: DeviceTransferMode) => {
    if (isLoading || role !== 'receiver' || !allowed) return;
    setErrorMsg(null);
    setActiveTab(tab);
  };

  const handleCopyToken = async () => {
    if (!allowed || role !== 'sender' || !sessionToken || isExpired) return;
    const current = operation.current;
    try {
      await Clipboard.setStringAsync(sessionToken);
      if (!current || current.signal.aborted) return;
      setCopied(true);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      copyTimer.current = setTimeout(() => setCopied(false), 3000);
    } catch {
      if (current && !current.signal.aborted) showAlert('Gagal', 'Tidak dapat menyalin kode ke papan klip.');
    }
  };

  // Handle scanned QR data from CameraQRScannerModal
  const handleScanResult = async (scannedData: string) => {
    setIsScannerOpen(false);
    if (!allowed || role !== 'receiver' || !user?.id || !deviceId) {
      setErrorMsg('Identitas perangkat atau akun pengguna tidak valid.');
      return;
    }

    const token = parseTransferQRData(scannedData);
    if (!token) {
      showAlert(
        'Kode QR Tidak Valid',
        'Kode QR yang dipindai bukan kode transfer perangkat WuzzChat yang sah.'
      );
      return;
    }

    await executeConsumeTransfer(token);
  };

  // Consume and import keypair
  const executeConsumeTransfer = async (token: string) => {
    if (!allowed || role !== 'receiver' || !user?.id || !deviceId) {
      setErrorMsg('Identitas perangkat atau akun pengguna tidak valid.');
      return;
    }

    const controller = operation.current;
    if (importBusy.current || !controller || controller.signal.aborted) return;
    importBusy.current = true;
    setIsLoading(true);
    setErrorMsg(null);

    try {
      await importTransferredKeyPair(token, controller.signal);
      if (controller.signal.aborted) return;
      setIsSuccess(true);
      if (onTransferSuccess) {
        onTransferSuccess();
      }
    } catch (err: any) {
      if (controller.signal.aborted) return;
      const msg =
        err?.detail ||
        err?.message ||
        'Gagal menyinkronkan kunci keamanan. Pastikan kode QR masih aktif dan belum kedaluwarsa.';
      setErrorMsg(`${msg} Jika kode sudah digunakan, buat kode baru di perangkat sumber.`);
      showAlert('Transfer Kunci Gagal', msg);
    } finally {
      importBusy.current = false;
      if (!controller.signal.aborted) setIsLoading(false);
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

  // Keep hooks above this guard so opening/closing preserves their order and runs cleanup.
  if (!visible) return null;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      statusBarTranslucent
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <View style={[styles.container, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerIconWrapper}>
                <IconText style={styles.headerIcon}>📱</IconText>
              </View>
              <View style={styles.headerText}>
                <Text style={styles.headerTitle}>{role === 'sender' ? 'Bagikan Kunci Enkripsi' : 'Terima Kunci Enkripsi'}</Text>
                <Text style={styles.headerSubtitle}>Transfer kunci untuk akun yang sama</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              style={styles.closeButton}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Icon name="close" size={18} color={colors.textSecondary} />
            </TouchableOpacity>
          </View>

          {/* Success View */}
          {!allowed && !isSuccess ? (
            <View style={styles.tabContent}>
              <Text style={styles.description}>Transfer belum tersedia. Membagikan kunci memerlukan kunci aktif; menerima kunci hanya tersedia saat terjadi konflik kunci setelah login.</Text>
            </View>
          ) : isSuccess ? (
            <View style={styles.successContainer}>
              <View style={styles.successIconCircle}>
                <IconText style={styles.successIcon}>✓</IconText>
              </View>
              <Text style={styles.successTitle}>Kunci E2EE Berhasil Disinkronkan!</Text>
              <Text style={styles.successMessage}>
                Kunci enkripsi berhasil diterima. Perangkat ini siap digunakan dengan kunci yang sama seperti perangkat sumber.
              </Text>
              <Button
                title="Selesai"
                variant="primary"
                onPress={handleClose}
                style={styles.fullWidthButton}
              />
            </View>
          ) : (
            <>
              {/* Segmented Tab Controls */}
              {role === 'receiver' && <View style={styles.tabContainer}>
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
              </View>}

              <ScrollView
                style={styles.contentScroll}
                contentContainerStyle={styles.scrollContentContainer}
                showsVerticalScrollIndicator={false}
              >
                {/* Error Banner */}
                {errorMsg ? (
                  <View style={styles.errorBanner}>
                    <IconText style={styles.errorIcon}>⚠️</IconText>
                    <Text style={styles.errorText}>{errorMsg}</Text>
                  </View>
                ) : null}

                {/* TAB 1: SHARE MODE (SENDER) */}
                {role === 'sender' && (
                  <View style={styles.tabContent}>
                    <Text style={styles.description}>
                      Login ke akun yang sama di perangkat lain, lalu pindai QR ini dari pilihan Transfer dari Perangkat Lain saat terjadi konflik kunci. QR ini memindahkan kunci enkripsi, bukan untuk login.
                    </Text>

                    {isLoading ? (
                      <View style={styles.loadingBox}>
                        <ActivityIndicator size="large" color={colors.accentPrimary} />
                        <Text style={styles.loadingText}>Menyiapkan sesi transfer aman...</Text>
                      </View>
                    ) : isExpired ? (
                      <View style={styles.expiredBox}>
                        <IconText style={styles.expiredIcon}>⏳</IconText>
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
                          <IconText style={styles.timerIcon}>⏱️</IconText>
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
                          <IconText style={styles.copyButtonIcon}>{copied ? '✓' : '📋'}</IconText>
                          <Text style={styles.copyButtonText}>
                            {copied ? 'Kode Token Tersalin!' : 'Salin Kode Token Manual'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : errorMsg ? (
                      <Button title="Coba Buat Kode Lagi" onPress={initShareSession} style={styles.actionButton} />
                    ) : null}

                    <View style={styles.infoCard}>
                      <IconText style={styles.infoCardTitle}>🛡️ Zero-Knowledge Security</IconText>
                      <Text style={styles.infoCardText}>
                        Kunci enkripsi dibungkus dengan AES-256-GCM langsung di perangkat Anda. Server tidak dapat melihat atau mendekripsi private key Anda.
                      </Text>
                    </View>
                  </View>
                )}

                {/* TAB 2: SCAN MODE (RECEIVER) */}
                {role === 'receiver' && activeTab === 'scan' && (
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
                          Pilih menu <Text style={styles.boldText}>Transfer Kunci ke Perangkat Lain</Text>.
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
                      onPress={() => { if (allowed && role === 'receiver' && !importBusy.current) setIsScannerOpen(true); }}
                      isLoading={isLoading}
                      disabled={isLoading}
                      style={styles.actionButton}
                    />
                  </View>
                )}

                {/* TAB 3: INPUT MODE (FALLBACK) */}
                {role === 'receiver' && activeTab === 'input' && (
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
      {allowed && role === 'receiver' && isScannerOpen && (
        <CameraQRScannerModal
          visible={isScannerOpen}
          title="Pindai QR Transfer Kunci"
          onClose={() => setIsScannerOpen(false)}
          onScan={handleScanResult}
        />
      )}
    </Modal>
  );
};

const makeStyles = (colors: ColorTokens) => {
  const typography = makeTypography(colors);
  return StyleSheet.create({
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
    flex: 1,
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
  headerText: {
    flex: 1,
    paddingRight: spacing.sm,
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
    backgroundColor: colors.accentFill,
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
    backgroundColor: colors.bgSurface,
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
    backgroundColor: colors.accentFill,
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
};
