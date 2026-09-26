/**
 * WuzzChat Mobile UI - CameraQRScannerModal Component
 * Native in-app live camera QR scanner modal with Aurora Glassmorphism reticle viewfinder.
 *
 * Conforms to:
 * - Mandatory Dual-Platform Frontend Architecture Rule
 * - Slow & Flaky Server Resilience Rule
 * - Mandatory Frontend Design System & Token Compliance Rule
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Animated,
  Easing,
  Dimensions,
  ActivityIndicator,
} from 'react-native';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, spacing, typography } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const VIEWFINDER_SIZE = Math.min(SCREEN_WIDTH * 0.72, 280);

export interface CameraQRScannerModalProps {
  visible: boolean;
  onClose: () => void;
  onScan: (scannedData: string) => void;
  title?: string;
}

export const CameraQRScannerModal: React.FC<CameraQRScannerModalProps> = ({
  visible,
  onClose,
  onScan,
  title = 'Pindai Kode QR Keamanan',
}) => {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [torchEnabled, setTorchEnabled] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Lock flag to prevent processing duplicate scans simultaneously
  const scanLockRef = useRef(false);

  // Animated laser scan beam
  const scanAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      scanLockRef.current = false;
      setIsReady(true);

      // Start continuous scanning laser animation
      const loopAnimation = Animated.loop(
        Animated.sequence([
          Animated.timing(scanAnim, {
            toValue: 1,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(scanAnim, {
            toValue: 0,
            duration: 2000,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ])
      );
      loopAnimation.start();

      return () => {
        loopAnimation.stop();
        scanAnim.setValue(0);
        setTorchEnabled(false);
        setIsReady(false);
      };
    }
  }, [visible, scanAnim]);

  const handleBarcodeScanned = (result: BarcodeScanningResult) => {
    if (scanLockRef.current || !result?.data) return;
    scanLockRef.current = true;
    onScan(result.data.trim());
  };

  const laserTranslateY = scanAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, VIEWFINDER_SIZE - 4],
  });

  if (!visible) return null;

  // Handle camera permissions view
  if (!permission) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={styles.permissionContainer}>
          <ActivityIndicator size="large" color={colors.colorCyanNeon} />
          <Text style={styles.permissionText}>Menyiapkan kamera...</Text>
        </View>
      </Modal>
    );
  }

  if (!permission.granted) {
    return (
      <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
        <View style={[styles.permissionContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionIcon}>📷</Text>
            <Text style={styles.permissionTitle}>Izin Kamera Diperlukan</Text>
            <Text style={styles.permissionDescription}>
              WuzzChat membutuhkan izin akses kamera untuk memindai kode QR verifikasi keamanan langsung dari perangkat lawan bicara.
            </Text>
            <TouchableOpacity
              style={styles.grantButton}
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text style={styles.grantButtonText}>Izinkan Akses Kamera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    );
  }

  return (
    <Modal
      visible={visible}
      transparent={false}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Live Camera Feed */}
        {isReady && (
          <CameraView
            style={StyleSheet.absoluteFill}
            facing="back"
            enableTorch={torchEnabled}
            barcodeScannerSettings={{
              barcodeTypes: ['qr'],
            }}
            onBarcodeScanned={scanLockRef.current ? undefined : handleBarcodeScanned}
          />
        )}

        {/* Viewfinder Overlay with Dark Masks */}
        <View style={[styles.overlayContainer, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
          {/* Top Header Bar */}
          <View style={styles.headerBar}>
            <TouchableOpacity
              style={styles.circleIconButton}
              onPress={onClose}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.closeIconText}>✕</Text>
            </TouchableOpacity>

            <View style={styles.headerTitleContainer}>
              <Text style={styles.headerTitle}>{title}</Text>
            </View>

            <TouchableOpacity
              style={[styles.circleIconButton, torchEnabled && styles.circleIconButtonActive]}
              onPress={() => setTorchEnabled(!torchEnabled)}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Text style={styles.torchIconText}>{torchEnabled ? '🔦' : '💡'}</Text>
            </TouchableOpacity>
          </View>

          {/* Central Target Viewfinder */}
          <View style={styles.viewfinderWrapper}>
            <View style={[styles.viewfinderBox, { width: VIEWFINDER_SIZE, height: VIEWFINDER_SIZE }]}>
              {/* Four Neon Reticle Corners */}
              <View style={[styles.corner, styles.topLeftCorner]} />
              <View style={[styles.corner, styles.topRightCorner]} />
              <View style={[styles.corner, styles.bottomLeftCorner]} />
              <View style={[styles.corner, styles.bottomRightCorner]} />

              {/* Animated Laser Scanning Beam */}
              <Animated.View
                style={[
                  styles.laserBeam,
                  {
                    transform: [{ translateY: laserTranslateY }],
                  },
                ]}
              >
                <View style={styles.laserGlow} />
              </Animated.View>
            </View>
          </View>

          {/* Bottom Guidance Area */}
          <View style={styles.bottomGuidanceArea}>
            <View style={styles.guidancePill}>
              <Text style={styles.guidanceText}>
                Posisikan kode QR di dalam bingkai untuk memindai otomatis
              </Text>
            </View>
            <TouchableOpacity
              style={styles.dismissBottomBtn}
              onPress={onClose}
              activeOpacity={0.8}
            >
              <Text style={styles.dismissBottomBtnText}>Tutup Pemindai</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const CORNER_THICKNESS = 4;
const CORNER_LENGTH = 28;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  permissionContainer: {
    flex: 1,
    backgroundColor: colors.bgBase,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  permissionCard: {
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
    padding: spacing.xl,
    alignItems: 'center',
    maxWidth: 340,
    borderWidth: 1,
    borderColor: colors.borderStrong,
  },
  permissionIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  permissionTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
    marginBottom: spacing.sm,
    textAlign: 'center',
  },
  permissionDescription: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: spacing.xl,
  },
  permissionText: {
    ...typography.body,
    color: colors.textSecondary,
    marginTop: spacing.md,
  },
  grantButton: {
    backgroundColor: colors.accentPrimary,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xl,
    borderRadius: radius.lg,
    width: '100%',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  grantButtonText: {
    ...typography.body,
    color: colors.textOnAccent,
    fontWeight: '600',
  },
  cancelButton: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  cancelButtonText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
  },
  overlayContainer: {
    flex: 1,
    justifyContent: 'space-between',
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  headerTitle: {
    ...typography.h3,
    color: colors.textPrimary,
    fontWeight: '700',
    fontSize: 16,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  circleIconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  circleIconButtonActive: {
    backgroundColor: colors.accentPrimary,
    borderColor: colors.colorCyanNeon,
  },
  closeIconText: {
    color: colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  torchIconText: {
    fontSize: 18,
  },
  viewfinderWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderBox: {
    position: 'relative',
    backgroundColor: 'transparent',
  },
  corner: {
    position: 'absolute',
    borderColor: colors.colorCyanNeon,
    width: CORNER_LENGTH,
    height: CORNER_LENGTH,
  },
  topLeftCorner: {
    top: 0,
    left: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderTopLeftRadius: radius.md,
  },
  topRightCorner: {
    top: 0,
    right: 0,
    borderTopWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderTopRightRadius: radius.md,
  },
  bottomLeftCorner: {
    bottom: 0,
    left: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderLeftWidth: CORNER_THICKNESS,
    borderBottomLeftRadius: radius.md,
  },
  bottomRightCorner: {
    bottom: 0,
    right: 0,
    borderBottomWidth: CORNER_THICKNESS,
    borderRightWidth: CORNER_THICKNESS,
    borderBottomRightRadius: radius.md,
  },
  laserBeam: {
    position: 'absolute',
    left: 4,
    right: 4,
    height: 2,
    backgroundColor: colors.colorCyanNeon,
    shadowColor: colors.colorCyanNeon,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 8,
    elevation: 4,
  },
  laserGlow: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -2,
    height: 6,
    backgroundColor: 'rgba(0, 242, 254, 0.4)',
    borderRadius: 3,
  },
  bottomGuidanceArea: {
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.lg,
    alignItems: 'center',
  },
  guidancePill: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    marginBottom: spacing.lg,
  },
  guidanceText: {
    ...typography.caption,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  dismissBottomBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.xl,
  },
  dismissBottomBtnText: {
    ...typography.bodySecondary,
    color: colors.textMuted,
  },
});
