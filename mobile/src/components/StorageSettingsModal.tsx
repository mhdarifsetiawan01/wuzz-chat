/**
 * WuzzChat Mobile UI - StorageSettingsModal Component
 * Interactive modal for inspecting local SQLite database size,
 * message and conversation counts, and performing safe cache cleanup.
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import {
  getStorageStats,
  clearMessageCacheOnly,
  StorageStats,
} from '../services/sqliteStorage';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { Button } from './Button';

export interface StorageSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 KB';
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export const StorageSettingsModal: React.FC<StorageSettingsModalProps> = ({
  visible,
  onClose,
  userId,
}) => {
  const insets = useSafeAreaInsets();
  const [stats, setStats] = useState<StorageStats | null>(null);
  const [mediaCacheBytes, setMediaCacheBytes] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearingMessages, setIsClearingMessages] = useState<boolean>(false);
  const [isClearingMedia, setIsClearingMedia] = useState<boolean>(false);

  const loadStats = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const storageStats = await getStorageStats(userId);
      setStats(storageStats);

      // Calculate media cache
      let mediaBytes = 0;
      if (FileSystem.cacheDirectory) {
        try {
          const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
          for (const file of files) {
            const info = await FileSystem.getInfoAsync(FileSystem.cacheDirectory + file);
            if (info.exists && 'size' in info && typeof info.size === 'number') {
              mediaBytes += info.size;
            }
          }
        } catch {
          // ignore cache read errors
        }
      }
      setMediaCacheBytes(mediaBytes);
    } catch (err) {
      console.warn('[StorageSettingsModal] Failed to load storage stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (visible) {
      loadStats();
    }
  }, [visible, loadStats]);

  const handleClearMessages = () => {
    Alert.alert(
      'Bersihkan Cache Pesan?',
      'Riwayat pesan lokal di perangkat ini akan dikosongkan untuk menghemat memori. Pesan tetap aman di server dan akan diunduh kembali saat Anda membuka ruang obrolan.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bersihkan',
          style: 'destructive',
          onPress: async () => {
            setIsClearingMessages(true);
            try {
              await clearMessageCacheOnly(userId);
              await loadStats();
              Alert.alert('Sukses', 'Cache pesan lokal berhasil dibersihkan.');
            } catch (err) {
              console.warn('[StorageSettingsModal] Clear messages error:', err);
              Alert.alert('Gagal', 'Terjadi kesalahan saat membersihkan cache pesan.');
            } finally {
              setIsClearingMessages(false);
            }
          },
        },
      ]
    );
  };

  const handleClearMedia = () => {
    Alert.alert(
      'Bersihkan Cache Media?',
      'File cache sementara (gambar, audio, dan dokumen) yang pernah diunduh akan dihapus dari penyimpanan HP.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bersihkan',
          style: 'destructive',
          onPress: async () => {
            setIsClearingMedia(true);
            try {
              if (FileSystem.cacheDirectory) {
                const files = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
                for (const file of files) {
                  try {
                    await FileSystem.deleteAsync(FileSystem.cacheDirectory + file, { idempotent: true });
                  } catch {
                    // ignore
                  }
                }
              }
              await loadStats();
              Alert.alert('Sukses', 'Cache media berhasil dibersihkan.');
            } catch (err) {
              console.warn('[StorageSettingsModal] Clear media error:', err);
              Alert.alert('Gagal', 'Terjadi kesalahan saat membersihkan media cache.');
            } finally {
              setIsClearingMedia(false);
            }
          },
        },
      ]
    );
  };

  const totalUsedBytes = (stats?.estimatedSizeBytes || 0) + mediaCacheBytes;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View
          style={[
            styles.container,
            {
              paddingTop: insets.top > 0 ? insets.top + spacing.md : spacing.xl,
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.iconCircle}>
                <Text style={styles.iconEmoji}>💾</Text>
              </View>
              <View>
                <Text style={styles.title}>Penyimpanan & Data</Text>
                <Text style={styles.subtitle}>Kelola Penggunaan Ruang Memori HP</Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.closeButton}
              onPress={onClose}
              activeOpacity={0.7}
            >
              <Text style={styles.closeButtonText}>✕</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollArea}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Total Storage Summary Card */}
            <View style={styles.card}>
              <Text style={styles.summaryLabel}>Total Penyimpanan Digunakan</Text>
              {isLoading ? (
                <ActivityIndicator color={colors.accentPrimary} style={{ marginVertical: spacing.md }} />
              ) : (
                <Text style={styles.summaryValue}>{formatBytes(totalUsedBytes)}</Text>
              )}
              <Text style={styles.summaryDesc}>
                Terdiri dari database pesan terenkripsi SQLite lokal dan berkas media offline.
              </Text>

              {/* Progress bar visual */}
              <View style={styles.progressBarBg}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: totalUsedBytes > 0 ? '45%' : '5%',
                    },
                  ]}
                />
              </View>
            </View>

            {/* Breakdown Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rincian Data Lokal</Text>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Text style={styles.detailIcon}>💬</Text>
                  <Text style={styles.detailLabel}>Pesan Tersimpan</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.messageCount} pesan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Text style={styles.detailIcon}>👥</Text>
                  <Text style={styles.detailLabel}>Percakapan Terdaftar</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.conversationCount} obrolan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Text style={styles.detailIcon}>📞</Text>
                  <Text style={styles.detailLabel}>Log Riwayat Panggilan</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.callLogCount} panggilan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Text style={styles.detailIcon}>🗄️</Text>
                  <Text style={styles.detailLabel}>Ukuran Basis Data SQLite</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? formatBytes(stats.estimatedSizeBytes) : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <Text style={styles.detailIcon}>🖼️</Text>
                  <Text style={styles.detailLabel}>Cache Berkas & Media</Text>
                </View>
                <Text style={styles.detailValue}>{formatBytes(mediaCacheBytes)}</Text>
              </View>
            </View>

            {/* Actions Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Pembersihan Memori</Text>
              <Text style={styles.cardSubtitle}>
                Tindakan di bawah ini aman dan tidak akan menghapus akun atau kunci enkripsi Anda.
              </Text>

              <TouchableOpacity
                style={styles.actionItem}
                onPress={handleClearMessages}
                disabled={isClearingMessages || isLoading}
                activeOpacity={0.7}
              >
                <View style={styles.actionLeft}>
                  <View style={[styles.actionIconBox, { backgroundColor: colors.tintWarning10 }]}>
                    <Text style={styles.actionIconText}>🧹</Text>
                  </View>
                  <View style={styles.actionTextBox}>
                    <Text style={styles.actionTitle}>Bersihkan Cache Pesan</Text>
                    <Text style={styles.actionSubtitle}>
                      Kosongkan pesan lokal. Data akan disinkronkan kembali dari server saat dibuka.
                    </Text>
                  </View>
                </View>
                {isClearingMessages && <ActivityIndicator color={colors.colorWarning} />}
              </TouchableOpacity>

              <View style={styles.divider} />

              <TouchableOpacity
                style={styles.actionItem}
                onPress={handleClearMedia}
                disabled={isClearingMedia || isLoading}
                activeOpacity={0.7}
              >
                <View style={styles.actionLeft}>
                  <View style={[styles.actionIconBox, { backgroundColor: colors.tintAccent10 }]}>
                    <Text style={styles.actionIconText}>🗑️</Text>
                  </View>
                  <View style={styles.actionTextBox}>
                    <Text style={styles.actionTitle}>Bersihkan Cache Media</Text>
                    <Text style={styles.actionSubtitle}>
                      Hapus preview gambar, voice note sementara, dan file thumbnail.
                    </Text>
                  </View>
                </View>
                {isClearingMedia && <ActivityIndicator color={colors.accentPrimary} />}
              </TouchableOpacity>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <Button
              title="Tutup"
              variant="secondary"
              onPress={onClose}
            />
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
  },
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.tintAccent10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconEmoji: {
    fontSize: 20,
  },
  title: {
    ...typography.h3,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textMuted,
  },
  closeButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.bgSurface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    color: colors.textMuted,
    fontSize: 16,
    fontWeight: '600',
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgSurface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    ...shadows.card,
  },
  summaryLabel: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.xs,
  },
  summaryValue: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.accentPrimary,
    marginBottom: spacing.xs,
  },
  summaryDesc: {
    ...typography.caption,
    color: colors.textSecondary,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: colors.bgBase,
    borderRadius: radius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: colors.accentPrimary,
    borderRadius: radius.full,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.md,
  },
  cardSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginBottom: spacing.md,
    lineHeight: 18,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  detailLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  detailIcon: {
    fontSize: 16,
  },
  detailLabel: {
    ...typography.body,
    color: colors.textSecondary,
  },
  detailValue: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  divider: {
    height: 1,
    backgroundColor: colors.borderSubtle,
    marginVertical: spacing.xs,
  },
  actionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
  },
  actionLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
    flex: 1,
  },
  actionIconBox: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionIconText: {
    fontSize: 18,
  },
  actionTextBox: {
    flex: 1,
  },
  actionTitle: {
    ...typography.body,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  actionSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    lineHeight: 16,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
  },
});
