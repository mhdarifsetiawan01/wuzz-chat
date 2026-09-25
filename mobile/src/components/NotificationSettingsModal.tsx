/**
 * WuzzChat Mobile UI - NotificationSettingsModal Component
 * Settings dialog for managing Push Notification preferences, runtime OS permissions,
 * test alerts, and icon badge synchronization.
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import * as Device from 'expo-device';
import { isExpoGo, notificationService } from '../services/notificationService';
import { secureStorage } from '../services/secureStorage';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

interface NotificationSettingsModalProps {
  visible: boolean;
  onClose: () => void;
}

export const NotificationSettingsModal: React.FC<NotificationSettingsModalProps> = ({
  visible,
  onClose,
}) => {
  const [isEnabled, setIsEnabled] = useState<boolean>(true);
  const [permissionStatus, setPermissionStatus] = useState<string>('checking');
  const [isUpdating, setIsUpdating] = useState<boolean>(false);
  const [isTesting, setIsTesting] = useState<boolean>(false);

  useEffect(() => {
    if (!visible) return;

    let mounted = true;

    async function loadSettings() {
      try {
        const enabled = await secureStorage.getNotificationsEnabled();
        if (mounted) {
          setIsEnabled(enabled);
        }

        const status = await notificationService.getPermissionStatus();
        if (mounted) {
          setPermissionStatus(status);
        }
      } catch (err) {
        console.warn('[NotificationSettingsModal] Failed to load settings:', err);
      }
    }

    loadSettings();

    return () => {
      mounted = false;
    };
  }, [visible]);

  const handleToggle = async (value: boolean) => {
    setIsUpdating(true);
    setIsEnabled(value);
    try {
      await secureStorage.setNotificationsEnabled(value);
      if (value) {
        const success = await notificationService.subscribeDevice();
        if (success) {
          setPermissionStatus('granted');
        } else {
          // If permission is denied
          const status = await notificationService.requestPermissions();
          setPermissionStatus(status);
          if (status !== 'granted') {
            Alert.alert(
              'Izin Diperlukan',
              'Izin notifikasi dinonaktifkan di pengaturan sistem operasi HP Anda. Silakan aktifkan di Pengaturan Sistem untuk menerima pemberitahuan pesan baru.'
            );
          }
        }
      } else {
        await notificationService.unsubscribeDevice();
      }
    } catch (err: any) {
      console.error('[NotificationSettingsModal] Failed to update toggle:', err);
      Alert.alert('Gagal', err?.message || 'Gagal memperbarui preferensi notifikasi.');
    } finally {
      setIsUpdating(false);
    }
  };

  const handleTestNotification = async () => {
    setIsTesting(true);
    try {
      await notificationService.scheduleLocalNotification(
        '⚡ WuzzChat Notification Test',
        'Notifikasi latar belakang & foreground audio terverifikasi aktif dan berfungsi normal!',
        { room_id: 'test_room' }
      );
      if (isExpoGo()) {
        Alert.alert(
          '🔔 Uji Coba Notifikasi (Mode Expo Go)',
          'Simulasi notifikasi berhasil dijalankan!\n\nJudul: ⚡ WuzzChat Notification Test\nPesan: Notifikasi latar belakang & foreground audio terverifikasi aktif.\n\n(Catatan: Pada Production APK / Development Build, banner notifikasi sistem OS akan muncul langsung di status bar).'
        );
      } else {
        Alert.alert('Sukses', 'Notifikasi uji coba berhasil dikirim ke sistem OS!');
      }
    } catch (err: any) {
      console.error('[NotificationSettingsModal] Test notification failed:', err);
      Alert.alert('Gagal', err?.message || 'Gagal mengirim notifikasi uji coba.');
    } finally {
      setIsTesting(false);
    }
  };

  const handleClearBadge = async () => {
    try {
      await notificationService.clearBadge();
      Alert.alert('Sukses', 'Lencana (badge) notifikasi pada ikon aplikasi telah di-reset ke 0.');
    } catch (err: any) {
      Alert.alert('Gagal', err?.message || 'Gagal mereset badge.');
    }
  };

  const getPermissionLabel = () => {
    if (isExpoGo()) {
      return 'Expo Go (Simulasi Lokal)';
    }
    if (!Device.isDevice) {
      return 'Simulator / Emulator (Mock)';
    }
    switch (permissionStatus) {
      case 'granted':
        return '🟢 Diizinkan (Aktif)';
      case 'denied':
        return '🔴 Ditolak oleh Pengguna';
      case 'undetermined':
        return '🟡 Belum Meminta Izin';
      default:
        return 'Memeriksa...';
    }
  };

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          {/* Header */}
          <View style={styles.headerRow}>
            <View style={styles.iconContainer}>
              <Text style={styles.headerIcon}>🔔</Text>
            </View>
            <View style={styles.headerTextCol}>
              <Text style={styles.title}>Notifikasi & Privasi</Text>
              <Text style={styles.subtitle}>Push Notification & Background Sync</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Setting Row 1: Master Push Toggle */}
          <View style={styles.settingCard}>
            <View style={styles.settingLeft}>
              <Text style={styles.settingTitle}>Notifikasi Pesan Baru</Text>
              <Text style={styles.settingDesc}>
                Terima pemberitahuan saat pesan atau panggilan baru masuk ketika aplikasi di latar belakang.
              </Text>
            </View>
            {isUpdating ? (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            ) : (
              <Switch
                value={isEnabled}
                onValueChange={handleToggle}
                trackColor={{ false: colors.bgElevated, true: colors.accentPrimary }}
                thumbColor={colors.textPrimary}
              />
            )}
          </View>

          {/* Info Box: OS Permission & Zero-Knowledge Architecture */}
          <View style={styles.infoBox}>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Status Izin OS:</Text>
              <Text style={styles.infoValue}>{getPermissionLabel()}</Text>
            </View>
            <View style={styles.divider} />
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Privasi Notifikasi:</Text>
              <Text style={styles.infoValue}>🔒 Zero-Knowledge (E2EE)</Text>
            </View>
            <Text style={styles.privacyNote}>
              Konten obrolan Anda dilindungi enkripsi end-to-end. Server tidak dapat membaca isi pesan di banner notifikasi.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <TouchableOpacity
              style={styles.actionRowBtn}
              onPress={handleTestNotification}
              disabled={isTesting}
              activeOpacity={0.7}
            >
              <Text style={styles.actionBtnIcon}>🧪</Text>
              <View style={styles.actionBtnTextCol}>
                <Text style={styles.actionBtnTitle}>Kirim Uji Coba Notifikasi</Text>
                <Text style={styles.actionBtnDesc}>Cek suara, getar, dan banner notifikasi</Text>
              </View>
              {isTesting ? (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              ) : (
                <Text style={styles.actionBtnChevron}>›</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionRowBtn}
              onPress={handleClearBadge}
              activeOpacity={0.7}
            >
              <Text style={styles.actionBtnIcon}>🧹</Text>
              <View style={styles.actionBtnTextCol}>
                <Text style={styles.actionBtnTitle}>Bersihkan Lencana (Badge)</Text>
                <Text style={styles.actionBtnDesc}>Reset angka unread pada ikon aplikasi</Text>
              </View>
              <Text style={styles.actionBtnChevron}>›</Text>
            </TouchableOpacity>
          </View>

          {/* Footer Close Button */}
          <Button title="Selesai" variant="primary" style={styles.doneButton} onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: colors.bgOverlay,
    justifyContent: 'flex-end',
  },
  card: {
    width: '100%',
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
    ...shadows.modal,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  iconContainer: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: colors.tintAccent10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  headerIcon: {
    fontSize: 22,
  },
  headerTextCol: {
    flex: 1,
  },
  title: {
    ...typography.h2,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 2,
  },
  closeBtn: {
    padding: spacing.sm,
  },
  closeBtnText: {
    fontSize: 18,
    color: colors.textSecondary,
    fontWeight: 'bold',
  },
  settingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.md,
  },
  settingLeft: {
    flex: 1,
    paddingRight: spacing.md,
  },
  settingTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 4,
  },
  settingDesc: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
  },
  infoBox: {
    backgroundColor: colors.bgBase,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  infoLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  infoValue: {
    ...typography.caption,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  privacyNote: {
    ...typography.caption,
    color: colors.textMuted,
    fontSize: 11,
    lineHeight: 15,
    marginTop: spacing.xs,
  },
  actionsContainer: {
    marginBottom: spacing.lg,
  },
  actionRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgElevated,
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  actionBtnIcon: {
    fontSize: 20,
    marginRight: spacing.md,
  },
  actionBtnTextCol: {
    flex: 1,
  },
  actionBtnTitle: {
    ...typography.body,
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  actionBtnDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    fontSize: 12,
  },
  actionBtnChevron: {
    fontSize: 20,
    color: colors.textSecondary,
    fontWeight: 'bold',
  },
  doneButton: {
    width: '100%',
  },
});
