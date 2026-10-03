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
import { Image } from 'expo-image';
import {
  getStorageStats,
  clearMessageCacheOnly,
  StorageStats,
  MAX_LOCAL_MESSAGES_PER_ROOM,
} from '../services/sqliteStorage';
import { mediaCache } from '../services/mediaCache';
import { colors, radius, shadows, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { Button } from './Button';

export interface StorageSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  userId: string;
}

/** Folder database expo-sqlite (wuzzchat.db + -wal + -shm). */
const SQLITE_DIR = `${FileSystem.documentDirectory ?? ''}SQLite/`;

/**
 * Entri cacheDirectory yang TIDAK ikut dihapus tombol pembersih:
 *  - wuzz_*.wav: nada dering/nada sambung panggilan yang dibuat app (callAudioManager membuatnya ulang bila hilang,
 *    tapi tidak perlu memaksa).
 *  - image_manager_disk_cache: cache expo-image (Glide) yang sedang dibuka; dibersihkan lewat Image.clearDiskCache().
 */
function isProtectedCacheEntry(name: string): boolean {
  return /^wuzz_.*\.wav$/.test(name) || name === 'image_manager_disk_cache';
}

/** Ukuran rekursif sebuah folder (getInfoAsync menghitung isi folder secara rekursif di Android). */
async function directorySize(uri: string | null): Promise<number> {
  if (!uri) return 0;
  try {
    const info: any = await FileSystem.getInfoAsync(uri);
    return info.exists && typeof info.size === 'number' ? info.size : 0;
  } catch {
    return 0;
  }
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
  const [dbBytes, setDbBytes] = useState<number>(0);
  const [persistedMedia, setPersistedMedia] = useState<{ bytes: number; files: number }>({ bytes: 0, files: 0 });
  const [tempCacheBytes, setTempCacheBytes] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isClearingMessages, setIsClearingMessages] = useState<boolean>(false);
  const [isClearingMedia, setIsClearingMedia] = useState<boolean>(false);

  const loadStats = useCallback(async () => {
    if (!userId) return;
    setIsLoading(true);
    try {
      const [storageStats, sqliteDirBytes, media, cacheBytes] = await Promise.all([
        getStorageStats(userId),
        directorySize(SQLITE_DIR), // database + WAL + SHM yang benar-benar memakai disk
        mediaCache.getUsage(), // media chat persisten (documentDirectory/wuzzchat_media)
        directorySize(FileSystem.cacheDirectory), // cache gambar & berkas sementara
      ]);
      setStats(storageStats);
      setDbBytes(sqliteDirBytes);
      setPersistedMedia(media);
      setTempCacheBytes(cacheBytes);
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
      'Bersihkan Cache Gambar?',
      'Gambar dan berkas sementara akan dihapus lalu diunduh ulang saat dibutuhkan. Media chat yang tersimpan di perangkat (foto dan voice note) tidak ikut terhapus.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Bersihkan',
          style: 'destructive',
          onPress: async () => {
            setIsClearingMedia(true);
            try {
              // Cache expo-image lewat API resminya (folder Glide sedang dibuka, jangan dihapus manual)
              await Image.clearDiskCache().catch(() => false);
              await Image.clearMemoryCache().catch(() => false);

              if (FileSystem.cacheDirectory) {
                const entries = await FileSystem.readDirectoryAsync(FileSystem.cacheDirectory);
                for (const entry of entries) {
                  if (isProtectedCacheEntry(entry)) continue;
                  try {
                    await FileSystem.deleteAsync(FileSystem.cacheDirectory + entry, { idempotent: true });
                  } catch {
                    // berkas sedang dipakai: lewati
                  }
                }
              }
              await loadStats();
              Alert.alert('Sukses', 'Cache gambar berhasil dibersihkan.');
            } catch (err) {
              console.warn('[StorageSettingsModal] Clear media error:', err);
              Alert.alert('Gagal', 'Terjadi kesalahan saat membersihkan cache gambar.');
            } finally {
              setIsClearingMedia(false);
            }
          },
        },
      ]
    );
  };

  const totalUsedBytes = dbBytes + persistedMedia.bytes + tempCacheBytes;

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
                <IconText style={styles.iconEmoji}>💾</IconText>
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
              <Icon name="close" size={18} color={colors.textMuted} />
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
                Terdiri dari database pesan lokal, media chat yang tersimpan, dan cache sementara.
              </Text>

              {/* Bar proporsi nyata: database / media tersimpan / cache sementara */}
              <View style={styles.progressBarBg}>
                {totalUsedBytes > 0 ? (
                  <View style={styles.progressBarRow}>
                    <View style={{ flex: dbBytes, backgroundColor: colors.accentPrimary }} />
                    <View style={{ flex: persistedMedia.bytes, backgroundColor: colors.colorWarning }} />
                    <View style={{ flex: tempCacheBytes, backgroundColor: colors.textMuted }} />
                  </View>
                ) : null}
              </View>
            </View>

            {/* Breakdown Card */}
            <View style={styles.card}>
              <Text style={styles.cardTitle}>Rincian Data Lokal</Text>

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <IconText style={styles.detailIcon}>💬</IconText>
                  <Text style={styles.detailLabel}>Pesan Tersimpan</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.messageCount} pesan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <IconText style={styles.detailIcon}>👥</IconText>
                  <Text style={styles.detailLabel}>Percakapan Terdaftar</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.conversationCount} obrolan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <IconText style={styles.detailIcon}>📞</IconText>
                  <Text style={styles.detailLabel}>Log Riwayat Panggilan</Text>
                </View>
                <Text style={styles.detailValue}>
                  {stats ? `${stats.callLogCount} panggilan` : '...'}
                </Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <View style={[styles.legendDot, { backgroundColor: colors.accentPrimary }]} />
                  <IconText style={styles.detailIcon}>🗄️</IconText>
                  <Text style={styles.detailLabel}>Database Lokal (SQLite)</Text>
                </View>
                <Text style={styles.detailValue}>{isLoading ? '...' : formatBytes(dbBytes)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <View style={[styles.legendDot, { backgroundColor: colors.colorWarning }]} />
                  <IconText style={styles.detailIcon}>📥</IconText>
                  <Text style={styles.detailLabel}>
                    Media Chat Tersimpan{persistedMedia.files > 0 ? ` (${persistedMedia.files}\u00A0berkas)` : ''}
                  </Text>
                </View>
                <Text style={styles.detailValue}>{isLoading ? '...' : formatBytes(persistedMedia.bytes)}</Text>
              </View>
              <View style={styles.divider} />

              <View style={styles.detailRow}>
                <View style={styles.detailLeft}>
                  <View style={[styles.legendDot, { backgroundColor: colors.textMuted }]} />
                  <IconText style={styles.detailIcon}>🖼️</IconText>
                  <Text style={styles.detailLabel}>Cache Gambar & Berkas Sementara</Text>
                </View>
                <Text style={styles.detailValue}>{isLoading ? '...' : formatBytes(tempCacheBytes)}</Text>
              </View>
            </View>

            {/* Storage Retention Policy Card */}
            <View style={styles.card}>
              <View style={styles.actionLeft}>
                <View style={[styles.actionIconBox, { backgroundColor: colors.tintAccent10 }]}>
                  <IconText style={styles.actionIconText}>⚡</IconText>
                </View>
                <View style={styles.actionTextBox}>
                  <Text style={styles.actionTitle}>Kebijakan Retensi Otomatis</Text>
                  <Text style={styles.actionSubtitle}>
                    SQLite lokal secara otomatis membatasi maksimal {MAX_LOCAL_MESSAGES_PER_ROOM} pesan terbaru per ruang obrolan demi efisiensi memori. Pesan usang otomatis dibersihkan dan ruang kosong dikembalikan ke OS via Incremental Auto-Vacuum.
                  </Text>
                </View>
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
                    <IconText style={styles.actionIconText}>🧹</IconText>
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
                    <IconText style={styles.actionIconText}>🗑️</IconText>
                  </View>
                  <View style={styles.actionTextBox}>
                    <Text style={styles.actionTitle}>Bersihkan Cache Gambar</Text>
                    <Text style={styles.actionSubtitle}>
                      Hapus gambar dan berkas sementara; diunduh ulang saat dibutuhkan. Media chat yang tersimpan tidak terhapus.
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
  progressBarRow: {
    flex: 1,
    flexDirection: 'row',
  },
  legendDot: {
    width: 8,
    height: 8,
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
    flex: 1,
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginRight: spacing.md,
  },
  detailIcon: {
    fontSize: 16,
  },
  detailLabel: {
    ...typography.body,
    flexShrink: 1,
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
