/**
 * WuzzChat ChatInputBar Component
 * Auto-expanding chat text input bar with send button, staged media banner,
 * attachment picker modal (Camera & Gallery), and safe area insets.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState, useEffect, useRef } from 'react';
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
  Keyboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { EmojiPicker } from './EmojiPicker';
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
  replyTo?: Message | null;
  onCancelReply?: () => void;
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
  replyTo,
  onCancelReply,
}) => {
  const [text, setText] = useState('');
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();

  // Focus text input immediately when a reply is initiated
  useEffect(() => {
    if (replyTo) {
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    }
  }, [replyTo]);

  const handleSend = () => {
    if (disabled || isUploading) return;
    const trimmed = text.trim();
    if (!trimmed && !stagedMedia) return;

    onSend(trimmed, stagedMedia);
    setText('');
    setShowEmojiPicker(false);
  };

  const handleToggleEmoji = () => {
    if (showEmojiPicker) {
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    } else {
      Keyboard.dismiss();
      setShowEmojiPicker(true);
    }
  };

  const handleSelectEmoji = (emoji: string) => {
    setText((prev) => prev + emoji);
  };

  const handleBackspace = () => {
    setText((prev) => {
      const chars = Array.from(prev);
      if (chars.length === 0) return '';
      chars.pop();
      return chars.join('');
    });
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
    <View
      style={[
        styles.wrapper,
        { paddingBottom: showEmojiPicker ? 0 : Math.max(insets.bottom, 8) },
      ]}
    >
      {/* Quoted Reply Preview Banner (WhatsApp Style) */}
      {replyTo ? (
        <View style={styles.replyBanner}>
          <View style={styles.replyAccentBar} />
          <View style={styles.replyInfo}>
            <Text style={styles.replySender} numberOfLines={1}>
              Membalas ke {replyTo.from || replyTo.nickname || 'Pengguna'}
            </Text>
            <Text style={styles.replySnippet} numberOfLines={1}>
              {replyTo.media_url ? '📷 Foto' : replyTo.content || 'Pesan'}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.replyCancelBtn}
            onPress={onCancelReply}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Text style={styles.replyCancelText}>✕</Text>
          </TouchableOpacity>
        </View>
      ) : null}

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
        {/* Emoji Picker Toggle Button */}
        <TouchableOpacity
          style={styles.emojiToggleBtn}
          onPress={handleToggleEmoji}
          disabled={disabled || isUploading}
          activeOpacity={0.7}
        >
          <Text style={styles.emojiToggleIcon}>{showEmojiPicker ? '⌨️' : '😊'}</Text>
        </TouchableOpacity>

        {/* Attachment Picker Trigger Button */}
        <TouchableOpacity
          style={styles.attachButton}
          onPress={() => {
            if (showEmojiPicker) setShowEmojiPicker(false);
            setShowAttachModal(true);
          }}
          disabled={disabled || isUploading}
          activeOpacity={0.7}
        >
          <Text style={styles.attachIcon}>📎</Text>
        </TouchableOpacity>

        {/* Text Input / Caption */}
        <TextInput
          ref={inputRef}
          style={styles.input}
          placeholder={stagedMedia ? 'Tambah keterangan...' : 'Ketik pesan...'}
          placeholderTextColor={colors.textMuted}
          value={text}
          onChangeText={setText}
          onFocus={() => setShowEmojiPicker(false)}
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

      {/* Docked Emoji Picker Tray (Replacing soft keyboard at ~280dp) */}
      {showEmojiPicker ? (
        <EmojiPicker
          onSelectEmoji={handleSelectEmoji}
          onBackspace={handleBackspace}
          height={280}
        />
      ) : null}

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
  replyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    position: 'relative',
  },
  replyAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.accentPrimary,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  replyInfo: {
    flex: 1,
    marginLeft: 6,
    justifyContent: 'center',
  },
  replySender: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accentPrimary,
    marginBottom: 2,
  },
  replySnippet: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  replyCancelBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  replyCancelText: {
    fontSize: 11,
    color: colors.textMuted,
    fontWeight: '700',
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
  emojiToggleBtn: {
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
  emojiToggleIcon: {
    fontSize: 18,
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
