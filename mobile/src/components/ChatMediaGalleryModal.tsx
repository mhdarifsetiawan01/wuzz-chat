/**
 * WuzzChat Mobile - ChatMediaGalleryModal
 * Conversation Media & Document Gallery with Media Grid (3-column) and File List tabs.
 * Conforms to frontend/DESIGN.md & Aurora Dark Theme.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Dimensions,
  Share,
  StatusBar,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { getRoomMediaMessages } from '../services/sqliteStorage';
import { mediaCache } from '../services/mediaCache';
import { MediaViewerModal } from './MediaViewerModal';
import { colors } from '../theme/colors';
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
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState<'media' | 'files'>('media');
  const [isLoading, setIsLoading] = useState(true);
  const [mediaList, setMediaList] = useState<Message[]>([]);
  const [fileList, setFileList] = useState<Message[]>([]);

  // Selected media for full screen viewer
  const [selectedViewerMedia, setSelectedViewerMedia] = useState<Message | null>(null);
  const [resolvedViewerUri, setResolvedViewerUri] = useState<string | null>(null);

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
        const isVid =
          msg.type === 'video' ||
          msg.media_type === 'video' ||
          /\.(mp4|mov|webm)$/i.test(url);

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
    const rawUrl = (msg as any).local_media_uri || msg.media_url;
    if (!rawUrl) return;

    setSelectedViewerMedia(msg);

    // Resolve local cache uri if available
    try {
      const cached = await mediaCache.getCachedMediaUri(rawUrl, msg.id, msg.file_name);
      setResolvedViewerUri(cached || rawUrl);
    } catch {
      setResolvedViewerUri(rawUrl);
    }
  };

  // Close media viewer
  const handleCloseViewer = () => {
    setSelectedViewerMedia(null);
    setResolvedViewerUri(null);
  };

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

  // Share file action
  const handleShareFile = async (msg: Message) => {
    const url = (msg as any).local_media_uri || msg.media_url;
    if (!url) return;
    try {
      await Share.share({
        title: msg.file_name || 'Berkas',
        message: msg.file_name ? `${msg.file_name}\n${url}` : url,
        url,
      });
    } catch (err) {
      console.warn('[ChatMediaGalleryModal] Share error:', err);
    }
  };

  // Render individual grid photo/video item
  const renderMediaItem = ({ item }: { item: Message }) => {
    const uri = (item as any).local_media_uri || item.media_url;
    const isVideo =
      item.type === 'video' ||
      item.media_type === 'video' ||
      /\.(mp4|mov|webm)$/i.test(uri || '');

    return (
      <TouchableOpacity
        style={styles.gridItem}
        activeOpacity={0.8}
        onPress={() => handleOpenViewer(item)}
      >
        <Image source={{ uri }} style={styles.gridImage} contentFit="cover" />
        {isVideo && (
          <View style={styles.videoBadge}>
            <IconText style={styles.videoBadgeIcon}>▶</IconText>
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
      >
        <View style={styles.fileIconContainer}>
          <IconText style={styles.fileIconText}>{isAudio ? '🎵' : '📄'}</IconText>
        </View>

        <View style={styles.fileInfo}>
          <Text style={styles.fileNameText} numberOfLines={1}>
            {fileName}
          </Text>
          <Text style={styles.fileSubText} numberOfLines={1}>
            {details || 'Dokumen'}
          </Text>
        </View>

        <TouchableOpacity
          style={styles.fileActionBtn}
          onPress={() => handleShareFile(item)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          activeOpacity={0.7}
        >
          <IconText style={styles.fileActionIcon}>📤</IconText>
        </TouchableOpacity>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <StatusBar barStyle="light-content" backgroundColor={colors.bgBase} />

      <View style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header Bar */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={onClose}
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
        <MediaViewerModal
          visible={Boolean(selectedViewerMedia && resolvedViewerUri)}
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

const styles = StyleSheet.create({
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
