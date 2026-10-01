/**
 * WuzzChat Mobile UI — CreatePostModal
 * Milestone M-Mobile-9.3
 * 
 * Features:
 * - 1,000 character limit with live color-coded counter (normal, warning, error)
 * - Media attachment from Camera or Gallery (up to 4 photos)
 * - Seamless integration with mediaApi.uploadMedia
 * - Admin controls for wuzz_admin: Sticky Pinning & Post Type (Announcement, Article, Sponsored)
 * - Strict Double-Submit prevention & error resilient feedback
 */

import * as ImagePicker from 'expo-image-picker';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mediaApi } from '../api/media';
import { CreateFeedPostRequest, FeedPostType } from '../api/types';
import { useAuth, useFeed } from '../context';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';

export interface CreatePostModalProps {
  visible: boolean;
  onClose: () => void;
  onPostCreated?: () => void;
}

interface LocalMediaItem {
  uri: string;
  fileName?: string;
  mimeType?: string;
}

const MAX_CHARS = 1000;
const MAX_MEDIA = 4;

const POST_TYPES: { type: FeedPostType; label: string; icon: string }[] = [
  { type: 'standard', label: 'Standar', icon: '📝' },
  { type: 'announcement', label: 'Pengumuman Resmi', icon: '📢' },
  { type: 'article', label: 'Artikel', icon: '📰' },
  { type: 'sponsored', label: 'Sponsored', icon: '⭐' },
];

export const CreatePostModal: React.FC<CreatePostModalProps> = ({
  visible,
  onClose,
  onPostCreated,
}) => {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { createPost } = useFeed();

  const [content, setContent] = useState('');
  const [mediaList, setMediaList] = useState<LocalMediaItem[]>([]);
  const [postType, setPostType] = useState<FeedPostType>('standard');
  const [isPinned, setIsPinned] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isAdmin = user?.system_role === 'wuzz_admin';

  const resetForm = () => {
    setContent('');
    setMediaList([]);
    setPostType('standard');
    setIsPinned(false);
    setIsSubmitting(false);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    resetForm();
    onClose();
  };

  const handlePickGallery = async () => {
    if (mediaList.length >= MAX_MEDIA) {
      Alert.alert('Batas Media', `Maksimal lampiran adalah ${MAX_MEDIA} gambar.`);
      return;
    }

    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Ditolak', 'Izin galeri diperlukan untuk memilih foto.');
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsMultipleSelection: true,
        selectionLimit: MAX_MEDIA - mediaList.length,
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const newItems: LocalMediaItem[] = result.assets.map((asset) => ({
          uri: asset.uri,
          fileName: asset.fileName || `feed_${Date.now()}.jpg`,
          mimeType: asset.mimeType || 'image/jpeg',
        }));
        setMediaList((prev) => [...prev, ...newItems].slice(0, MAX_MEDIA));
      }
    } catch (err) {
      console.warn('[CreatePostModal] Error picking image:', err);
      Alert.alert('Gagal', 'Terjadi kesalahan saat membuka galeri foto.');
    }
  };

  const handleLaunchCamera = async () => {
    if (mediaList.length >= MAX_MEDIA) {
      Alert.alert('Batas Media', `Maksimal lampiran adalah ${MAX_MEDIA} gambar.`);
      return;
    }

    try {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Izin Ditolak', 'Izin kamera diperlukan untuk mengambil foto.');
        return;
      }

      const result = await ImagePicker.launchCameraAsync({
        mediaTypes: ['images'],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const asset = result.assets[0];
        setMediaList((prev) => [
          ...prev,
          {
            uri: asset.uri,
            fileName: asset.fileName || `feed_${Date.now()}.jpg`,
            mimeType: asset.mimeType || 'image/jpeg',
          },
        ]);
      }
    } catch (err) {
      console.warn('[CreatePostModal] Error launching camera:', err);
      Alert.alert('Gagal', 'Terjadi kesalahan saat membuka kamera.');
    }
  };

  const handleRemoveMedia = (index: number) => {
    setMediaList((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleSubmit = async () => {
    const trimmed = content.trim();
    if (!trimmed) {
      Alert.alert('Konten Kosong', 'Silakan tulis sesuatu untuk membagikan postingan.');
      return;
    }

    if (trimmed.length > MAX_CHARS) {
      Alert.alert('Konten Terlalu Panjang', `Maksimal adalah ${MAX_CHARS} karakter.`);
      return;
    }

    setIsSubmitting(true);

    try {
      // 1. Upload media files if any
      const uploadedUrls: string[] = [];
      for (const item of mediaList) {
        const uploadRes = await mediaApi.uploadMedia(
          item.uri,
          item.fileName,
          item.mimeType,
          undefined,
          'feed'
        );
        if (uploadRes?.url) {
          uploadedUrls.push(uploadRes.url);
        }
      }

      // 2. Prepare payload
      const payload: CreateFeedPostRequest = {
        content: trimmed,
        media_urls: uploadedUrls,
        post_type: isAdmin ? postType : 'standard',
        is_pinned: isAdmin ? isPinned : false,
      };

      await createPost(payload);

      resetForm();
      onClose();
      onPostCreated?.();
    } catch (err: any) {
      console.warn('[CreatePostModal] Error creating post:', err);
      Alert.alert(
        'Gagal Mempublikasikan',
        err?.message || 'Terjadi kesalahan jaringan saat mempublikasikan postingan.'
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const remainingChars = MAX_CHARS - content.length;
  const isCharWarning = remainingChars <= 100 && remainingChars > 0;
  const isCharLimitReached = remainingChars <= 0;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.overlay}
      >
        <Pressable style={styles.backdrop} onPress={handleClose} />

        <View style={[styles.modalCard, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handleClose} disabled={isSubmitting} style={styles.closeBtn}>
              <Text style={styles.closeText}>Batal</Text>
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Buat Postingan</Text>

            <TouchableOpacity
              onPress={handleSubmit}
              disabled={isSubmitting || !content.trim()}
              style={[
                styles.submitBtn,
                (!content.trim() || isSubmitting) && styles.submitBtnDisabled,
              ]}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Text style={styles.submitText}>Kirim</Text>
              )}
            </TouchableOpacity>
          </View>

          <ScrollView
            style={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Author Row */}
            <View style={styles.authorRow}>
              <Avatar
                name={user?.display_name || user?.username || 'User'}
                avatarUrl={user?.avatar_url}
                size={44}
                shape="circle"
              />
              <View style={styles.authorMeta}>
                <Text style={styles.authorName}>
                  {user?.display_name || user?.username || 'Pengguna'}
                </Text>
                {isAdmin && (
                  <View style={styles.adminBadge}>
                    <Text style={styles.adminBadgeText}>🛡️ Wuzz Admin</Text>
                  </View>
                )}
              </View>
            </View>

            {/* Admin Controls */}
            {isAdmin && (
              <View style={styles.adminControlCard}>
                <View style={styles.adminControlHeader}>
                  <Text style={styles.adminControlTitle}>⚙️ Pengaturan Admin</Text>
                </View>

                {/* Sticky Pin Toggle */}
                <View style={styles.settingRow}>
                  <View style={styles.settingLabelCol}>
                    <Text style={styles.settingLabel}>Sematkan ke Puncak (Sticky Pin)</Text>
                    <Text style={styles.settingSubLabel}>
                      Postingan akan selalu berada di baris teratas linimasa.
                    </Text>
                  </View>
                  <Switch
                    value={isPinned}
                    onValueChange={setIsPinned}
                    trackColor={{ false: '#e2e8f0', true: colors.accentPrimary }}
                    thumbColor="#ffffff"
                  />
                </View>

                {/* Post Type Selector */}
                <Text style={styles.typeSelectorLabel}>Tipe Postingan:</Text>
                <View style={styles.typeSelectorRow}>
                  {POST_TYPES.map((pt) => {
                    const isSelected = postType === pt.type;
                    return (
                      <TouchableOpacity
                        key={pt.type}
                        onPress={() => setPostType(pt.type)}
                        style={[
                          styles.typeChip,
                          isSelected && styles.typeChipSelected,
                        ]}
                      >
                        <Text style={styles.typeChipIcon}>{pt.icon}</Text>
                        <Text
                          style={[
                            styles.typeChipText,
                            isSelected && styles.typeChipTextSelected,
                          ]}
                        >
                          {pt.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}

            {/* Content Input */}
            <TextInput
              style={styles.textInput}
              placeholder="Apa yang sedang terjadi di komunitasmu hari ini?..."
              placeholderTextColor="#94a3b8"
              multiline
              maxLength={MAX_CHARS}
              value={content}
              onChangeText={setContent}
              textAlignVertical="top"
              autoFocus
            />

            {/* Attached Media Thumbnails */}
            {mediaList.length > 0 && (
              <View style={styles.mediaContainer}>
                {mediaList.map((item, index) => (
                  <View key={index} style={styles.mediaThumbnailWrapper}>
                    <Image source={{ uri: item.uri }} style={styles.mediaThumbnail} />
                    <TouchableOpacity
                      style={styles.removeMediaBtn}
                      onPress={() => handleRemoveMedia(index)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.removeMediaText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
              </View>
            )}
          </ScrollView>

          {/* Bottom Toolbar & Character Counter */}
          <View style={styles.bottomBar}>
            <View style={styles.mediaButtonsRow}>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={handlePickGallery}
                disabled={mediaList.length >= MAX_MEDIA || isSubmitting}
              >
                <Text style={styles.iconBtnText}>🖼️</Text>
                <Text style={styles.iconBtnLabel}>Galeri</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.iconBtn}
                onPress={handleLaunchCamera}
                disabled={mediaList.length >= MAX_MEDIA || isSubmitting}
              >
                <Text style={styles.iconBtnText}>📷</Text>
                <Text style={styles.iconBtnLabel}>Kamera</Text>
              </TouchableOpacity>

              {mediaList.length > 0 && (
                <Text style={styles.mediaCountBadge}>
                  {mediaList.length}/{MAX_MEDIA} foto
                </Text>
              )}
            </View>

            <View style={styles.counterWrapper}>
              <Text
                style={[
                  styles.charCounter,
                  isCharWarning && styles.charCounterWarning,
                  isCharLimitReached && styles.charCounterError,
                ]}
              >
                {content.length}/{MAX_CHARS}
              </Text>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
  },
  modalCard: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    paddingTop: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  closeText: {
    fontSize: 15,
    color: '#64748b',
    fontWeight: '600',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0f172a',
  },
  submitBtn: {
    backgroundColor: colors.accentPrimary,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 20,
    minWidth: 64,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.45,
  },
  submitText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  authorMeta: {
    marginLeft: 12,
  },
  authorName: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0f172a',
  },
  adminBadge: {
    backgroundColor: '#eff6ff',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  adminBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1d4ed8',
  },
  adminControlCard: {
    backgroundColor: '#f8fafc',
    borderRadius: 16,
    padding: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  adminControlHeader: {
    marginBottom: 8,
  },
  adminControlTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e2e8f0',
    marginBottom: 8,
  },
  settingLabelCol: {
    flex: 1,
    paddingRight: 12,
  },
  settingLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1e293b',
  },
  settingSubLabel: {
    fontSize: 11,
    color: '#64748b',
    marginTop: 2,
  },
  typeSelectorLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
    marginBottom: 6,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 4,
  },
  typeChipSelected: {
    backgroundColor: colors.tintAccent10,
    borderColor: colors.accentPrimary,
  },
  typeChipIcon: {
    fontSize: 12,
  },
  typeChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  typeChipTextSelected: {
    color: colors.accentPrimary,
    fontWeight: '700',
  },
  textInput: {
    fontSize: 16,
    lineHeight: 24,
    color: '#0f172a',
    minHeight: 130,
    paddingTop: 4,
  },
  mediaContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginVertical: 12,
  },
  mediaThumbnailWrapper: {
    position: 'relative',
    width: 76,
    height: 76,
    borderRadius: 14,
    overflow: 'hidden',
  },
  mediaThumbnail: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
  },
  removeMediaBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeMediaText: {
    color: '#ffffff',
    fontSize: 10,
    fontWeight: '800',
  },
  bottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#e2e8f0',
  },
  mediaButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  iconBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
  },
  iconBtnText: {
    fontSize: 18,
  },
  iconBtnLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  mediaCountBadge: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.accentPrimary,
    marginLeft: 4,
  },
  counterWrapper: {},
  charCounter: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
  },
  charCounterWarning: {
    color: '#f59e0b',
    fontWeight: '700',
  },
  charCounterError: {
    color: '#ef4444',
    fontWeight: '700',
  },
});
