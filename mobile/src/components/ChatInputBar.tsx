/**
 * WuzzChat ChatInputBar Component
 * Auto-expanding chat text input bar with send button, staged media banner,
 * attachment picker modal (Camera & Gallery), and safe area insets.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState } from 'react';
import {
  View,
  TextInput,
  TouchableOpacity,
  Text,
  StyleSheet,
  Platform,
  Image,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface StagedMedia {
  uri: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  base64?: string;
}

export interface ChatInputBarProps {
  onSend: (text: string, media?: StagedMedia | null) => void;
  disabled?: boolean;
  stagedMedia?: StagedMedia | null;
  isUploading?: boolean;
  onPickCamera?: () => void;
  onPickGallery?: () => void;
  onCancelStagedMedia?: () => void;
}

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSend,
  disabled,
  stagedMedia,
  isUploading,
  onPickCamera,
  onPickGallery,
  onCancelStagedMedia,
}) => {
  const [text, setText] = useState('');
  const [showAttachModal, setShowAttachModal] = useState(false);
  const insets = useSafeAreaInsets();

  const handleSend = () => {
    if (disabled || isUploading) return;
    const trimmed = text.trim();
    if (!trimmed && !stagedMedia) return;

    onSend(trimmed, stagedMedia);
    setText('');
  };

  const handleSelectCamera = () => {
    setShowAttachModal(false);
    onPickCamera?.();
  };

  const handleSelectGallery = () => {
    setShowAttachModal(false);
    onPickGallery?.();
  };

  const isSendActive = (text.trim().length > 0 || Boolean(stagedMedia)) && !disabled && !isUploading;

  return (
    <View style={[styles.wrapper, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {/* Staged Media Preview Banner */}
      {stagedMedia ? (
        <View style={styles.stagedBanner}>
          <Image source={{ uri: stagedMedia.uri }} style={styles.stagedThumbnail} resizeMode="cover" />
          <View style={styles.stagedInfo}>
            <Text style={styles.stagedFileName} numberOfLines={1}>
              {stagedMedia.fileName || 'Foto Terlampir'}
            </Text>
            <Text style={styles.stagedFileSize}>
              {formatFileSize(stagedMedia.fileSize) || 'Gambar'}
            </Text>
          </View>
          {isUploading ? (
            <View style={styles.uploadingBadge}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <Text style={styles.uploadingText}>Mengunggah...</Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancelStagedMedia}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Text style={styles.cancelIcon}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      <View style={styles.container}>
        {/* Attachment Picker Trigger Button */}
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => setShowAttachModal(true)}
          disabled={disabled || isUploading}
          activeOpacity={0.7}
        >
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        {/* Text Input / Caption */}
        <TextInput
          style={styles.input}
          placeholder={stagedMedia ? 'Tambah keterangan...' : 'Ketik pesan...'}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          multiline
          maxLength={4000}
          editable={!disabled && !isUploading}
        />

        {/* Send Button */}
        <TouchableOpacity
          style={[styles.sendButton, isSendActive ? styles.sendButtonActive : styles.sendButtonDisabled]}
          onPress={handleSend}
          disabled={!isSendActive}
          activeOpacity={0.7}
        >
          {isUploading ? (
            <ActivityIndicator size="small" color="#ffffff" />
          ) : (
            <Text style={[styles.sendIcon, isSendActive ? styles.sendIconActive : styles.sendIconDisabled]}>
              ➤
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Attachment Options Modal */}
      <Modal
        visible={showAttachModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowAttachModal(false)}
      >
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAttachModal(false)}>
          <Pressable style={styles.modalSheet} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Lampirkan Media</Text>
              <TouchableOpacity
                onPress={() => setShowAttachModal(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.modalCloseIcon}>✕</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleSelectCamera}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconCircle, styles.cameraCircle]}>
                  <Text style={styles.optionEmoji}>📷</Text>
                </View>
                <Text style={styles.optionLabel}>Kamera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleSelectGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconCircle, styles.galleryCircle]}>
                  <Text style={styles.optionEmoji}>🖼️</Text>
                </View>
                <Text style={styles.optionLabel}>Galeri</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
  },
  stagedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: 12,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  stagedThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
  },
  stagedInfo: {
    flex: 1,
    marginLeft: 10,
    justifyContent: 'center',
  },
  stagedFileName: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  stagedFileSize: {
    fontSize: 11,
    color: colors.textMuted,
    marginTop: 2,
  },
  uploadingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 8,
  },
  uploadingText: {
    fontSize: 11,
    color: colors.accentPrimary,
    fontWeight: '500',
  },
  cancelButton: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  cancelIcon: {
    fontSize: 12,
    color: colors.textSecondary,
    fontWeight: '700',
  },
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  attachButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.bgCardSolid,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  attachIcon: {
    fontSize: 18,
    color: colors.textSecondary,
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    backgroundColor: colors.bgInput,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: Platform.OS === 'ios' ? 10 : 8,
    paddingBottom: Platform.OS === 'ios' ? 10 : 8,
    fontSize: 15,
    color: colors.textPrimary,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  sendButtonActive: {
    backgroundColor: colors.accentPrimary,
  },
  sendButtonDisabled: {
    backgroundColor: colors.bgCardSolid,
  },
  sendIcon: {
    fontSize: 16,
    marginLeft: 2, // Centering arrow icon
  },
  sendIconActive: {
    color: '#ffffff',
  },
  sendIconDisabled: {
    color: colors.textMuted,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: colors.bgCardSolid,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingBottom: spacing.xl,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  modalCloseIcon: {
    fontSize: 16,
    color: colors.textMuted,
    padding: 4,
  },
  optionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: spacing.sm,
  },
  optionCard: {
    alignItems: 'center',
    gap: 8,
  },
  optionIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCircle: {
    backgroundColor: 'rgba(236, 72, 153, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(236, 72, 153, 0.4)',
  },
  galleryCircle: {
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.4)',
  },
  optionEmoji: {
    fontSize: 26,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
});
