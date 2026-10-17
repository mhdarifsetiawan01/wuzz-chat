/**
 * WuzzChat Mobile - ChatMediaGalleryModal
 * Conversation Media & Document Gallery with Media Grid (3-column) and File List tabs.
 * Conforms to frontend/DESIGN.md & Aurora Dark Theme.
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import * as Sharing from 'expo-sharing';
import { CachedChatImage } from './CachedChatImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { getRoomMediaMessages } from '../services/sqliteStorage';
import { mediaCache } from '../services/mediaCache';
import { acknowledgeCachedMedia } from '../services/mediaReceipt';
import { mediaDownloadFeedback } from '../utils/mediaDownloadFeedback';
import { mediaApi } from '../api/media';
import { showAlert } from '../services/dialog';
import { MediaViewerModal } from './MediaViewerModal';
import { VideoPlayerModal } from './VideoPlayerModal';
import { getVideoThumbnailUrl, isVideoMessage } from '../utils/videoMedia';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { spacing } from '../theme/spacing';

export interface ChatMediaGalleryModalProps {
  visible: boolean;
  roomId: string;
  userId: string;
  roomTitle: string;
  onClose: () => void;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = 2;
const NUM_COLUMNS = 3;
const ITEM_SIZE = (SCREEN_WIDTH - GRID_GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

export const ChatMediaGalleryModal: React.FC<ChatMediaGalleryModalProps> = ({
  visible,
  roomId,
  userId,
  roomTitle,
  onClose,
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'media' | 'files'>('media');
  const [isLoading, setIsLoading] = useState(true);
  const [mediaList, setMediaList] = useState<Message[]>([]);
  const [fileList, setFileList] = useState<Message[]>([]);

  // Selected media for full screen viewer
  const [selectedViewerMedia, setSelectedViewerMedia] = useState<Message | null>(null);
  const [resolvedViewerUri, setResolvedViewerUri] = useState<string | null>(null);
  const [mediaDownload, setMediaDownload] = useState<{ id: string; progress: number } | null>(null);
  const openingRef = useRef(false);
  const viewerRequestRef = useRef(0);
  const requestControllerRef = useRef<AbortController | null>(null);

  // A completed download may stay cached after closing, but must never reopen an old viewer.
  const resetViewer = useCallback(() => {
    viewerRequestRef.current++;
    requestControllerRef.current?.abort();
    openingRef.current = false;
    setSelectedViewerMedia(null);
    setResolvedViewerUri(null);
    setMediaDownload(null);
  }, []);

  useEffect(() => {
    resetViewer();
    return () => { viewerRequestRef.current++; requestControllerRef.current?.abort(); };
  }, [visible, roomId, userId, resetViewer]);

  const handleClose = () => {
    resetViewer();
    onClose();
  };

  // Load room media messages
  const loadMedia = useCallback(async () => {
    if (!roomId || !userId) return;
    setIsLoading(true);
    try {
      const messages = await getRoomMediaMessages(userId, roomId);

      const media: Message[] = [];
      const files: Message[] = [];

      for (const msg of messages) {
        const url = (msg as any).local_media_uri || msg.media_url || '';
        const isImg =
          msg.type === 'image' ||
          msg.media_type === 'image' ||
          /\.(jpg|jpeg|png|webp|gif)$/i.test(url);
        const isVid = isVideoMessage({ ...msg, media_url: url });

        if (isImg || isVid) {
          media.push(msg);
        } else {
          files.push(msg);
        }
      }

      setMediaList(media);
      setFileList(files);
    } catch (err) {
      console.warn('[ChatMediaGalleryModal] Failed to load media:', err);
    } finally {
      setIsLoading(false);
    }
  }, [userId, roomId]);

  useEffect(() => {
    if (visible) {
      loadMedia();
    }
  }, [visible, loadMedia]);

  // Open full screen media viewer
  const handleOpenViewer = async (msg: Message) => {
    if (openingRef.current || !visible) return;
    const rawUrl = (msg as any).local_media_uri || msg.media_url;
    if (!rawUrl) return;
    openingRef.current = true;
    const request = ++viewerRequestRef.current;
    const isCurrent = () => request === viewerRequestRef.current;
    const isVideo = isVideoMessage({ ...msg, media_url: rawUrl });
    setResolvedViewerUri(null);
    const controller = new AbortController();
    requestControllerRef.current = controller;

    // Video uses the same persistent cache and in-flight download as the chat bubble.
    try {
      const cached = await mediaCache.getCachedMediaUri(rawUrl, msg.id, msg.file_name);
      if (!isCurrent()) return;
      if (!cached) setMediaDownload({ id: msg.id, progress: 0 });
      const uri = await mediaCache.downloadToCache(rawUrl, msg.id, msg.file_name, {
        expectedSize: msg.file_size,
        allowLocalSource: msg.sender_id === userId,
        signal: controller.signal,
        onProgress: (progress) => {
          if (isCurrent() && !cached) setMediaDownload({ id: msg.id, progress });
        },
      });
      if (!isCurrent()) return;
      setSelectedViewerMedia(msg);
      setResolvedViewerUri(uri);
      acknowledgeCachedMedia(msg, userId, mediaApi.acknowledgeMediaDownload).catch(() => {
        console.warn('[ChatMediaGalleryModal] Media ACK failed');
      });
    } catch (err) {
      if (!isCurrent()) return;
      const feedback = mediaDownloadFeedback(err, isVideo ? 'Video' : 'Gambar');
      if (feedback) showAlert(feedback.title, feedback.message);
    } finally {
      if (isCurrent()) {
        openingRef.current = false;
        setMediaDownload(null);
      }
    }
  };

  const viewerIsVideo = Boolean(
    selectedViewerMedia &&
      isVideoMessage({
        ...selectedViewerMedia,
        media_url: (selectedViewerMedia as any).local_media_uri || selectedViewerMedia.media_url,
      })
  );

  // Close media viewer
  const handleCloseViewer = resetViewer;

  // Format file size helper
  const formatFileSize = (bytes?: number) => {
    const numBytes = typeof bytes === 'number' ? bytes : Number(bytes);
    if (!numBytes || isNaN(numBytes) || numBytes <= 0) return '';
    if (numBytes < 1024) return `${numBytes} B`;
    if (numBytes < 1024 * 1024) return `${(numBytes / 1024).toFixed(1)} KB`;
    return `${(numBytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // Format date helper
  const formatDate = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return '';
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return '';
    }
  };

  // Download first, then export a read-only file URI through the platform share sheet.
  const handleShareFile = async (msg: Message) => {
    if (openingRef.current || !visible) return;
    const url = msg.local_media_uri || msg.media_url;
    if (!url) return;
    openingRef.current = true;
    const request = ++viewerRequestRef.current;
    const isCurrent = () => request === viewerRequestRef.current;
    const controller = new AbortController();
    requestControllerRef.current = controller;
    setMediaDownload({ id: msg.id, progress: 0 });
    let stored = false;
    try {
      const local = await mediaCache.downloadToCache(url, msg.id, msg.file_name, {
        expectedSize: msg.file_size,
        allowLocalSource: msg.sender_id === userId,
        signal: controller.signal,
        onProgress: (progress) => { if (isCurrent()) setMediaDownload({ id: msg.id, progress }); },
      });
      if (!isCurrent()) return;
      stored = true;
      setMediaDownload(null);
      acknowledgeCachedMedia(msg, userId, mediaApi.acknowledgeMediaDownload).catch(() => {});
      const available = await Sharing.isAvailableAsync();
      if (!isCurrent()) return;
      if (available) await Sharing.shareAsync(local, { dialogTitle: msg.file_name || 'Bagikan Berkas' });
      else showAlert('Berkas Tersimpan', 'Berkas sudah tersedia di penyimpanan aplikasi. Berbagi berkas tidak tersedia pada perangkat ini.');
    } catch (err) {
      if (!isCurrent()) return;
      if (stored) {
        showAlert('Gagal Membagikan Berkas', 'Berkas sudah tersimpan. Ketuk lagi untuk membuka pilihan berbagi.');
      } else {
        const feedback = mediaDownloadFeedback(err, 'Berkas');
        if (feedback) showAlert(feedback.title, feedback.message);
      }
    } finally {
      if (isCurrent()) { openingRef.current = false; setMediaDownload(null); }
    }
  };

  // Render individual grid photo/video item
  const renderMediaItem = ({ item }: { item: Message }) => {
    const uri = (item as any).local_media_uri || item.media_url;
    const isVideo = isVideoMessage({ ...item, media_url: uri });
    const thumbUri = isVideo ? getVideoThumbnailUrl(item.media_url) : uri;
    const downloading = mediaDownload?.id === item.id;

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.8}
        onPress={() => handleOpenViewer(item)}
        disabled={mediaDownload !== null}
        accessibilityLabel={downloading
          ? `Mengunduh media ${Math.round(mediaDownload.progress * 100)} persen`
          : isVideo ? 'Buka video' : 'Buka gambar'}
        accessibilityState={{ disabled: mediaDownload !== null, busy: downloading }}
      >
        {!isVideo && uri ? (
          <CachedChatImage url={uri} messageId={item.id} fileName={item.file_name} fileSize={item.file_size}
            allowLocalSource={item.sender_id === userId}
            onPress={() => handleOpenViewer(item)}
            onReady={() => {
              acknowledgeCachedMedia(item, userId, mediaApi.acknowledgeMediaDownload).catch(() => {});
            }} />
        ) : thumbUri ? (
          <Image source={{ uri: thumbUri }} style={styles.gridImage} contentFit="cover" />
        ) : (
          <View style={[styles.gridImage, { backgroundColor: '#1e293b' }]} />
        )}
        {isVideo && (
          <View style={styles.videoBadge}>
            <IconText style={styles.videoBadgeIcon}>▶</IconText>
          </View>
        )}
        {downloading && (
          <View style={styles.downloadOverlay} pointerEvents="none">
            <ActivityIndicator color={colors.textOnAccent} />
            <Text style={styles.downloadText}>{Math.round(mediaDownload.progress * 100)}%</Text>
          </View>
        )}
      </TouchableOpacity>
    );
  };

  // Render individual document list item
  const renderFileItem = ({ item }: { item: Message }) => {
    const fileName =
      typeof item.file_name === 'string' && item.file_name.trim()
        ? item.file_name
        : 'Berkas Dokumen';
    const dateStr = formatDate(item.created_at || item.timestamp);
    const sizeStr = formatFileSize(item.file_size);
    const sender =
      typeof (item.nickname || item.from) === 'string'
        ? item.nickname || item.from
        : '';
    const details = [sizeStr, dateStr, sender].filter(Boolean).join(' • ');

    const isAudio =
      item.type === 'audio' ||
      item.media_type === 'audio' ||
      /\.(m4a|aac|mp3|wav|ogg)$/i.test(fileName);

    return (
      <TouchableOpacity
        style={styles.fileCard}
        onPress={() => handleShareFile(item)}
        activeOpacity={0.7}
        disabled={mediaDownload !== null}
        accessibilityLabel={`Unduh dan bagikan ${fileName}`}
      >
        <View style={styles.fileIconContainer}>
          <IconText style={styles.fileIconText}>{isAudio ? '🎵' : '📄'}</IconText>
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileNameText} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={styles.fileSubText} numberOfLines={1}>
            {mediaDownload?.id === item.id ? `Mengunduh ${Math.round(mediaDownload.progress * 100)}%` : details || 'Dokumen'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.fileActionBtn}
          disabled={mediaDownload !== null}
          accessibilityLabel={`Unduh dan bagikan ${fileName}`}
          onPress={() => handleShareFile(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          {mediaDownload?.id === item.id ? <ActivityIndicator color={colors.accentPrimary} /> :
            <Icon name="share" size={20} color={colors.accentPrimary} />}
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBase} />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            activeOpacity={0.7}
          >
            <Icon name="back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>

          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle} numberOfLines={1}>
              Media & Berkas
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {roomTitle}
            </Text>
          </View>
        </View>

        {/* Tab Switcher */}
        <View style={styles.tabContainer}>
          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'media' && styles.tabButtonActive]}
            onPress={() => setActiveTab('media')}
            activeOpacity={0.75}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'media' && styles.tabButtonTextActive]}
            >
              Media ({mediaList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tabButton, activeTab === 'files' && styles.tabButtonActive]}
            onPress={() => setActiveTab('files')}
            activeOpacity={0.75}
          >
            <Text
              style={[styles.tabButtonText, activeTab === 'files' && styles.tabButtonTextActive]}
            >
              Dokumen ({fileList.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* Content Body */}
        {isLoading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
            <Text style={styles.loadingText}>Memuat berkas media...</Text>
          </View>
        ) : activeTab === 'media' ? (
          mediaList.length === 0 ? (
            <View style={styles.emptyContainer}>
              <IconText style={styles.emptyIcon}>🖼️</IconText>
              <Text style={styles.emptyTitle}>Belum Ada Media</Text>
              <Text style={styles.emptySubtitle}>
                Foto dan video yang dikirim dalam obrolan ini akan tampil di sini.
              </Text>
            </View>
          ) : (
            <FlatList
              key="gallery-media-grid"
              data={mediaList}
              extraData={mediaDownload}
              keyExtractor={(item, index) => item.id || `media_${index}`}
              renderItem={renderMediaItem}
              numColumns={NUM_COLUMNS}
              contentContainerStyle={styles.gridListContent}
              columnWrapperStyle={styles.gridColumnWrapper}
              showsVerticalScrollIndicator={false}
            />
          )
        ) : fileList.length === 0 ? (
          <View style={styles.emptyContainer}>
            <IconText style={styles.emptyIcon}>📂</IconText>
            <Text style={styles.emptyTitle}>Belum Ada Berkas</Text>
            <Text style={styles.emptySubtitle}>
              Dokumen, audio, dan berkas lampiran lainnya akan tampil di sini.
            </Text>
          </View>
        ) : (
          <FlatList
            key="gallery-files-list"
            data={fileList}
            keyExtractor={(item, index) => item.id || `file_${index}`}
            renderItem={renderFileItem}
            contentContainerStyle={[styles.fileListContent, { paddingBottom: insets.bottom + 16 }]}
            showsVerticalScrollIndicator={false}
          />
        )}

        {/* Fullscreen Interactive Pinch-to-Zoom Media Viewer */}
        <VideoPlayerModal
          visible={Boolean(selectedViewerMedia && resolvedViewerUri && viewerIsVideo)}
          videoUrl={resolvedViewerUri}
          senderName={selectedViewerMedia?.nickname || selectedViewerMedia?.from}
          onClose={handleCloseViewer}
        />
        <MediaViewerModal
          visible={Boolean(selectedViewerMedia && resolvedViewerUri && !viewerIsVideo)}
          mediaUrl={resolvedViewerUri}
          fileName={selectedViewerMedia?.file_name}
          caption={selectedViewerMedia?.content}
          senderName={selectedViewerMedia?.nickname || selectedViewerMedia?.from}
          timestamp={selectedViewerMedia?.created_at || selectedViewerMedia?.timestamp}
          onClose={handleCloseViewer}
        />
      </View>
    </Modal>
  );
};

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bgBase,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
    backgroundColor: colors.bgSurface,
  },
  backButton: {
    paddingRight: spacing.sm,
  },
  headerTitleContainer: {
    flex: 1,
    marginLeft: spacing.xs,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  headerSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
    marginTop: 1,
  },
  tabContainer: {
    flexDirection: 'row',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: colors.bgBase,
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.borderFocus,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  tabButtonTextActive: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xl,
  },
  loadingText: {
    marginTop: spacing.md,
    fontSize: 14,
    color: colors.textSecondary,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  emptySubtitle: {
    fontSize: 13,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 18,
  },
  gridListContent: {
    paddingTop: GRID_GAP,
  },
  gridColumnWrapper: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridItem: {
    width: ITEM_SIZE,
    height: ITEM_SIZE,
    backgroundColor: colors.bgElevated,
    position: 'relative',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  downloadOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  downloadText: {
    color: colors.textOnAccent,
    fontSize: 14,
    fontWeight: '600',
  },
  videoBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoBadgeIcon: {
    fontSize: 11,
    color: colors.textPrimary,
    marginLeft: 1,
  },
  fileListContent: {
    padding: spacing.md,
  },
  fileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.sm + 2,
    backgroundColor: colors.bgSurface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: spacing.sm,
  },
  fileIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.tintAccent10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.md,
  },
  fileIconText: {
    fontSize: 22,
  },
  fileInfo: {
    flex: 1,
    marginRight: spacing.sm,
  },
  fileNameText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.textPrimary,
    marginBottom: 2,
  },
  fileSubText: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  fileActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fileActionIcon: {
    fontSize: 16,
    color: colors.textPrimary,
  },
});
