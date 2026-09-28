/**
 * DeviceLimitModal — Mobile Dialog Pemilihan Perangkat yang Ingin Di-Kick
 * Muncul saat login mencapai kuota 2 perangkat (HTTP 409 DEVICE_LIMIT_REACHED).
 * Selaras dengan frontend/app/login/DeviceLimitModal.tsx & Design System WuzzChat.
 */

import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Platform,
} from 'react-native';
import { ActiveDeviceItem } from '../api/types';
import { colors, radius, shadows, spacing, typography } from '../theme';

export interface DeviceLimitModalProps {
  visible: boolean;
  activeDevices: ActiveDeviceItem[];
  onClose: () => void;
  onConfirm: (kickDeviceId: string) => void;
  isLoading?: boolean;
  errorMessage?: string | null;
}

export function parseUserAgent(ua?: string, fallbackName?: string) {
  let browser = 'Browser';
  let os = 'Perangkat';
  let icon = '💻';

  if (!ua) {
    return { name: fallbackName || 'Perangkat Terdaftar', icon: '💻' };
  }

  if (/wuzzchat|okhttp|react-native|expo/i.test(ua)) {
    if (/ios|iphone|ipad/i.test(ua)) {
      return { name: 'Aplikasi WuzzChat di iOS', icon: '📱' };
    }
    return { name: 'Aplikasi WuzzChat di Android', icon: '📱' };
  }

  if (/android/i.test(ua)) {
    os = 'Android';
    icon = '📱';
  } else if (/iphone|ipad|ipod/i.test(ua)) {
    os = 'iOS';
    icon = '📱';
  } else if (/windows/i.test(ua)) {
    os = 'Windows';
    icon = '🖥️';
  } else if (/macintosh|mac os x/i.test(ua)) {
    os = 'macOS';
    icon = '💻';
  } else if (/linux/i.test(ua)) {
    os = 'Linux';
    icon = '🐧';
  }

  if (/chrome|crios/i.test(ua) && !/edg|opr/i.test(ua)) {
    browser = 'Chrome';
  } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
    browser = 'Safari';
  } else if (/firefox|fxios/i.test(ua)) {
    browser = 'Firefox';
  } else if (/edg/i.test(ua)) {
    browser = 'Edge';
  }

  return { name: `${browser} di ${os}`, icon };
}

export function formatRelativeTime(isoDate?: string): string {
  if (!isoDate) return 'Waktu tidak diketahui';
  try {
    const date = new Date(isoDate);
    const diffMs = Date.now() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'Baru saja aktif';
    if (diffMin < 60) return `Aktif ${diffMin} mnt lalu`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `Aktif ${diffHour} jam lalu`;
    const diffDay = Math.floor(diffHour / 24);
    if (diffDay < 7) return `Aktif ${diffDay} hari lalu`;
    return `Aktif ${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`;
  } catch {
    return 'Waktu tidak diketahui';
  }
}

export const DeviceLimitModal: React.FC<DeviceLimitModalProps> = ({
  visible,
  activeDevices = [],
  onClose,
  onConfirm,
  isLoading = false,
  errorMessage = null,
}) => {
  // Default pilih perangkat terakhir (perangkat terlama / FIFO)
  const defaultSelectedId =
    activeDevices.length > 0 ? activeDevices[activeDevices.length - 1].id : '';
  const [selectedId, setSelectedId] = useState<string>(defaultSelectedId);

  useEffect(() => {
    if (activeDevices.length > 0) {
      // Pastikan ada pilihan valid
      const exists = activeDevices.some((d) => d.id === selectedId);
      if (!exists || !selectedId) {
        setSelectedId(activeDevices[activeDevices.length - 1].id);
      }
    }
  }, [activeDevices, selectedId]);

  if (!visible) return null;

  const handleConfirm = () => {
    if (!selectedId && activeDevices.length > 0) {
      onConfirm(activeDevices[activeDevices.length - 1].id);
    } else {
      onConfirm(selectedId);
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
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <Text style={styles.warningEmoji}>⚠️</Text>
              <Text style={styles.title}>Batas Perangkat Tercapai</Text>
            </View>
            {!isLoading && (
              <TouchableOpacity
                style={styles.closeBtn}
                onPress={onClose}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityLabel="Tutup dialog"
              >
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </View>

          {/* Description */}
          <Text style={styles.description}>
            Akun Anda saat ini sudah aktif di <Text style={styles.boldText}>2 perangkat</Text> (batas maksimal). Silakan pilih salah satu perangkat lama yang ingin dikeluarkan untuk melanjutkan login di HP ini.
          </Text>

          {/* Error Message Box */}
          {errorMessage && (
            <View style={styles.errorBox}>
              <Text style={styles.errorText}>⚠️ {errorMessage}</Text>
            </View>
          )}

          {/* Device Selection List */}
          <ScrollView
            style={styles.deviceList}
            contentContainerStyle={styles.deviceListContent}
            keyboardShouldPersistTaps="handled"
          >
            {activeDevices.map((dev, idx) => {
              const isSelected = dev.id === selectedId;
              const isOldest = idx === activeDevices.length - 1;
              const info = parseUserAgent(dev.user_agent, dev.name);
              const timeStr = formatRelativeTime(dev.last_seen_at || dev.created_at);

              return (
                <TouchableOpacity
                  key={dev.id}
                  style={[
                    styles.deviceItem,
                    isSelected ? styles.deviceItemSelected : styles.deviceItemUnselected,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (!isLoading) setSelectedId(dev.id);
                  }}
                  disabled={isLoading}
                >
                  <View style={styles.deviceItemLeft}>
                    <Text style={styles.deviceIcon}>{info.icon}</Text>
                    <View style={styles.deviceInfoText}>
                      <View style={styles.deviceNameRow}>
                        <Text
                          style={[
                            styles.deviceName,
                            isSelected && styles.deviceNameSelected,
                          ]}
                          numberOfLines={1}
                        >
                          {dev.name || info.name}
                        </Text>
                        {isOldest && (
                          <View style={styles.oldestBadge}>
                            <Text style={styles.oldestBadgeText}>Paling Lama</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.deviceTime}>{timeStr}</Text>
                    </View>
                  </View>

                  {/* Radio Indicator */}
                  <View
                    style={[
                      styles.radioCircle,
                      isSelected ? styles.radioCircleSelected : styles.radioCircleUnselected,
                    ]}
                  >
                    {isSelected && <View style={styles.radioInnerCircle} />}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Info Notice */}
          <View style={styles.noticeBox}>
            <Text style={styles.noticeText}>
              💡 Perangkat yang dikeluarkan akan langsung terputus dari sesi chat.
            </Text>
          </View>

          {/* Footer Actions */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.btn, styles.btnCancel]}
              onPress={onClose}
              disabled={isLoading}
              activeOpacity={0.7}
            >
              <Text style={styles.btnCancelText}>Batal</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.btn, styles.btnConfirm, isLoading && styles.btnDisabled]}
              onPress={handleConfirm}
              disabled={isLoading || activeDevices.length === 0}
              activeOpacity={0.8}
            >
              {isLoading ? (
                <ActivityIndicator size="small" color={colors.textOnAccent} />
              ) : (
                <Text style={styles.btnConfirmText}>Keluarkan & Masuk</Text>
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
    backgroundColor: colors.bgOverlay,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: colors.bgCardSolid,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    ...shadows.modal,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  warningEmoji: {
    fontSize: 22,
    marginRight: spacing.sm,
  },
  title: {
    fontSize: typography.h3.fontSize,
    fontWeight: typography.h3.fontWeight,
    color: colors.textPrimary,
    flex: 1,
  },
  closeBtn: {
    padding: spacing.xs,
    marginLeft: spacing.sm,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textMuted,
    fontWeight: '600',
  },
  description: {
    fontSize: typography.body.fontSize,
    lineHeight: typography.body.lineHeight,
    color: colors.textSecondary,
    marginBottom: spacing.md,
  },
  boldText: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  errorBox: {
    backgroundColor: colors.tintError10,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: {
    fontSize: typography.caption.fontSize,
    color: colors.colorError,
    lineHeight: typography.caption.lineHeight,
  },
  deviceList: {
    maxHeight: 240,
    marginBottom: spacing.md,
  },
  deviceListContent: {
    gap: spacing.sm,
  },
  deviceItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  deviceItemSelected: {
    borderColor: colors.accentPrimary,
    backgroundColor: colors.tintAccent10,
  },
  deviceItemUnselected: {
    borderColor: colors.borderDefault,
    backgroundColor: colors.bgElevated,
  },
  deviceItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
  },
  deviceIcon: {
    fontSize: 24,
    marginRight: spacing.md,
  },
  deviceInfoText: {
    flex: 1,
  },
  deviceNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  deviceName: {
    fontSize: typography.body.fontSize,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
  },
  deviceNameSelected: {
    color: colors.accentPrimary,
  },
  oldestBadge: {
    backgroundColor: colors.tintWarning10,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  oldestBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: colors.colorWarning,
  },
  deviceTime: {
    fontSize: typography.caption.fontSize,
    color: colors.textMuted,
    marginTop: 2,
  },
  radioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
  },
  radioCircleSelected: {
    borderColor: colors.accentPrimary,
  },
  radioCircleUnselected: {
    borderColor: colors.borderStrong,
  },
  radioInnerCircle: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accentPrimary,
  },
  noticeBox: {
    backgroundColor: colors.bgInput,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.sm,
    marginBottom: spacing.lg,
  },
  noticeText: {
    fontSize: typography.caption.fontSize,
    color: colors.textMuted,
    lineHeight: typography.caption.lineHeight,
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
  },
  btn: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  btnCancel: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  btnCancelText: {
    fontSize: typography.button.fontSize,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  btnConfirm: {
    backgroundColor: colors.accentPrimary,
    flex: 1,
  },
  btnConfirmText: {
    fontSize: typography.button.fontSize,
    fontWeight: '700',
    color: colors.textOnAccent,
  },
  btnDisabled: {
    opacity: 0.6,
  },
});
