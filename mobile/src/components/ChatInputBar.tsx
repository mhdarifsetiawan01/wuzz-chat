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
  ScrollView,
  ActivityIndicator,
  Keyboard,
  Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  useAudioRecorder,
  RecordingPresets,
  requestRecordingPermissionsAsync,
} from 'expo-audio';
import { GroupMember, Message } from '../api/types';
import { Avatar } from './Avatar';
import {
  collectMentionIds,
  detectMentionTrigger,
  filterMentionMembers,
  insertMention,
  MentionTrigger,
} from '../utils/mentionUtils';
import { EmojiPicker } from './EmojiPicker';
import { audioManager } from '../services';
import { useTheme, useThemedStyles, ColorTokens } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { spacing } from '../theme/spacing';
import { quotePreviewText } from '../utils/quotePreview';
import { showAlert } from '../services/dialog';

export interface StagedMedia {
  uri: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  width?: number;
  height?: number;
  base64?: string;
  /** Jenis lampiran; kosong = gambar (perilaku lama). */
  mediaType?: 'image' | 'video';
  /** Hanya video: pratinjau (JPEG lokal), ukurannya dikirim saat meminta tiket unggah. */
  thumbUri?: string;
  thumbSize?: number;
  durationMs?: number;
}

export interface ChatInputBarProps {
  onSend: (text: string, media?: StagedMedia | null, mentions?: string[]) => void;
  onSendAudio?: (uri: string, durationSeconds: number, fileSize?: number) => void;
  disabled?: boolean;
  stagedMedia?: StagedMedia | null;
  isUploading?: boolean;
  /** Video sedang dikompres/divalidasi sebelum bisa dikirim. */
  isPreparingMedia?: boolean;
  /** Progres 0..1 untuk tahap menyiapkan (kompresi) atau mengunggah video. */
  mediaProgress?: number | null;
  onPickCamera?: () => void;
  onPickVideo?: () => void;
  onPickGallery?: () => void;
  onCancelStagedMedia?: () => void;
  replyTo?: Message | null;
  /** Dipanggil saat picker emoji dibuka/ditutup (induk menyembunyikan tombol melayang). */
  onEmojiPickerChange?: (open: boolean) => void;
  /** Dipanggil (dibatasi tiap 2 dtk) saat pengguna mengetik; induk meneruskannya sebagai event typing. */
  onTyping?: () => void;
  replySenderName?: string;
  onCancelReply?: () => void;
  editingMessage?: Message | null;
  onSaveEdit?: (messageId: string, newContent: string) => void;
  onCancelEdit?: () => void;
  /** Anggota room (grup/topik) untuk autocomplete @mention; kosong/undefined = fitur mati (DM) */
  mentionMembers?: GroupMember[];
  /** Dipanggil saat pengguna mengetik "@" di grup tetapi daftar anggota belum ada (pemuatan malas oleh induk) */
  onRequestMentionMembers?: () => void;
  currentUserId?: string;
}

// Sama dengan web (MessageInput.tsx): satu event typing per 2 dtk
const TYPING_THROTTLE_MS = 2000;

function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatRecordingTimer(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
}

export const ChatInputBar: React.FC<ChatInputBarProps> = ({
  onSend,
  onSendAudio,
  disabled,
  stagedMedia,
  isUploading,
  isPreparingMedia,
  mediaProgress,
  onPickCamera,
  onPickVideo,
  onPickGallery,
  onCancelStagedMedia,
  replyTo,
  onEmojiPickerChange,
  onTyping,
  replySenderName,
  onCancelReply,
  editingMessage,
  onSaveEdit,
  onCancelEdit,
  mentionMembers,
  onRequestMentionMembers,
  currentUserId = '',
}) => {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [text, setText] = useState('');
  const [mentionTrigger, setMentionTrigger] = useState<MentionTrigger | null>(null);
  const selectionRef = useRef({ start: 0, end: 0 });
  // username (lowercase) -> user_id, hanya untuk anggota yang dipilih dari daftar (DEC-013)
  const trackedMentionsRef = useRef<Map<string, string>>(new Map());
  const mentionMatches = mentionTrigger
    ? filterMentionMembers(mentionMembers, mentionTrigger.query, currentUserId)
    : [];
  const lastTypingSentRef = useRef(0);

  // Anggota tiba setelah "@" sudah diketik (dimuat malas): tampilkan dropdown tanpa menunggu ketikan berikutnya
  const hasMentionMembers = Boolean(mentionMembers && mentionMembers.length > 0);
  useEffect(() => {
    if (!hasMentionMembers || editingMessage) return;
    const cursor = Math.max(0, Math.min(text.length, selectionRef.current.end || text.length));
    setMentionTrigger(detectMentionTrigger(text, cursor));
    // hanya saat anggota baru tersedia; teks berikutnya ditangani handleChangeText
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMentionMembers]);

  const handleChangeText = (value: string) => {
    if (onRequestMentionMembers && !editingMessage && (!mentionMembers || mentionMembers.length === 0)) {
      const cursor = Math.max(0, Math.min(value.length, selectionRef.current.end + (value.length - text.length)));
      // Anggota belum ada: minta induk memuatnya (sekali, ber-cache), dropdown muncul setelah props terisi
      if (detectMentionTrigger(value, cursor)) onRequestMentionMembers();
    }
    if (mentionMembers && mentionMembers.length > 0 && !editingMessage) {
      const cursor = Math.max(0, Math.min(value.length, selectionRef.current.end + (value.length - text.length)));
      setMentionTrigger(detectMentionTrigger(value, cursor));
    } else if (mentionTrigger) {
      setMentionTrigger(null);
    }
    setText(value);
    // Tidak mengirim saat mengedit pesan lama atau teks kosong; server membatasi 3 event/2 dtk
    if (!onTyping || editingMessage || value.trim().length === 0) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current >= TYPING_THROTTLE_MS) {
      lastTypingSentRef.current = now;
      onTyping();
    }
  };
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  useEffect(() => {
    onEmojiPickerChange?.(showEmojiPicker);
  }, [showEmojiPicker, onEmojiPickerChange]);
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const inputRef = useRef<TextInput>(null);
  const insets = useSafeAreaInsets();
  const recordTimerRef = useRef<any>(null);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      () => setIsKeyboardVisible(true)
    );
    const hideSub = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => setIsKeyboardVisible(false)
    );
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Set text and focus when editing a message
  useEffect(() => {
    if (editingMessage) {
      setText(editingMessage.content || '');
      setShowEmojiPicker(false);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [editingMessage]);

  // Pulsing animation for red recording indicator
  useEffect(() => {
    let loop: Animated.CompositeAnimation | null = null;
    if (isRecording) {
      loop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.25,
            duration: 600,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 600,
            useNativeDriver: true,
          }),
        ])
      );
      loop.start();
    } else {
      pulseAnim.setValue(1);
    }
    return () => {
      if (loop) loop.stop();
    };
  }, [isRecording, pulseAnim]);

  // Clean up recording timer on unmount
  useEffect(() => {
    return () => {
      if (recordTimerRef.current) {
        clearInterval(recordTimerRef.current);
      }
    };
  }, []);

  // Focus text input immediately when a reply is initiated.
  // Keyed on the id: ChatScreen passes a fresh replyTo object every render, and
  // re-running this on each render closed the emoji picker while replying.
  const replyToId = replyTo?.id;
  useEffect(() => {
    if (replyToId) {
      setShowEmojiPicker(false);
      inputRef.current?.focus();
    }
  }, [replyToId]);

  const handleSelectMention = (member: GroupMember) => {
    if (!mentionTrigger) return;
    const cursor = mentionTrigger.startIdx + 1 + mentionTrigger.query.length;
    const next = insertMention(text, mentionTrigger.startIdx, cursor, member.username);
    trackedMentionsRef.current.set(member.username.toLowerCase(), member.user_id);
    setText(next.text);
    setMentionTrigger(null);
    selectionRef.current = { start: next.cursor, end: next.cursor };
    inputRef.current?.focus();
  };

  const handleSend = () => {
    if (disabled || isUploading) return;
    const trimmed = text.trim();

    if (editingMessage && onSaveEdit) {
      if (!trimmed) return;
      onSaveEdit(editingMessage.id, trimmed);
      setText('');
      setShowEmojiPicker(false);
      return;
    }

    if (!trimmed && !stagedMedia) return;

    const mentionIds = collectMentionIds(trimmed, trackedMentionsRef.current);
    onSend(trimmed, stagedMedia, mentionIds.length > 0 ? mentionIds : undefined);
    trackedMentionsRef.current.clear();
    setMentionTrigger(null);
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

  const handleSelectVideo = () => {
    setShowAttachModal(false);
    onPickVideo?.();
  };

  const handleSelectGallery = () => {
    setShowAttachModal(false);
    onPickGallery?.();
  };

  const startRecording = async () => {
    if (disabled || isUploading) return;
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        showAlert(
          'Izin Mikrofon Dibutuhkan',
          'WuzzChat membutuhkan akses ke mikrofon untuk merekam dan mengirim pesan suara.'
        );
        return;
      }

      await audioManager.configureAudioMode(true);
      // Stop any background playback before starting recording
      audioManager.stopActivePlayer();

      await recorder.prepareToRecordAsync();
      recorder.record();

      setIsRecording(true);
      setRecordingDuration(0);

      recordTimerRef.current = setInterval(() => {
        setRecordingDuration((prev) => prev + 1);
      }, 1000);
    } catch (err: any) {
      console.error('[ChatInputBar] Error starting recording:', err);
      showAlert('Gagal Memulai Rekaman', err.message || 'Tidak dapat mengakses mikrofon.');
    }
  };

  const cancelRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    setIsRecording(false);
    setRecordingDuration(0);

    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
    } catch (err) {
      console.warn('[ChatInputBar] Error stopping recording on cancel:', err);
    }
    await audioManager.configureAudioMode(false);
  };

  const stopAndSendRecording = async () => {
    if (recordTimerRef.current) {
      clearInterval(recordTimerRef.current);
      recordTimerRef.current = null;
    }
    const finalDuration = recordingDuration;
    setIsRecording(false);
    setRecordingDuration(0);

    try {
      if (recorder.isRecording) {
        await recorder.stop();
      }
      const uri = recorder.uri;
      await audioManager.configureAudioMode(false);

      if (!uri) {
        showAlert('Gagal Mengambil Rekaman', 'Berkas rekaman audio tidak ditemukan.');
        return;
      }

      // Ignore recordings under 1 second to prevent accidental mic tap sends
      if (finalDuration < 1) {
        return;
      }

      onSendAudio?.(uri, finalDuration);
    } catch (err: any) {
      console.error('[ChatInputBar] Error stopping and sending recording:', err);
      showAlert('Gagal Mengirim Rekaman', err.message || 'Terjadi kesalahan saat memproses audio.');
    }
  };

  const isSendActive = (text.trim().length > 0 || Boolean(stagedMedia)) && !disabled && !isUploading;

  return (
    <View
      style={[
        styles.wrapper,
        { paddingBottom: (showEmojiPicker || isKeyboardVisible) ? 8 : Math.max(insets.bottom, 8) },
      ]}
    >
      {/* Edit Mode Preview Banner */}
      {editingMessage ? (
        <View style={styles.editBanner}>
          <View style={styles.editAccentBar} />
          <View style={styles.editInfo}>
            <IconText style={styles.editSender} numberOfLines={1}>
              ✏️ Edit Pesan
            </IconText>
            <Text style={styles.editSnippet} numberOfLines={1}>
              {editingMessage.content}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.replyCancelBtn}
            onPress={() => {
              setText('');
              onCancelEdit?.();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Icon name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Mention autocomplete (@) - anggota room aktif saja */}
      {mentionMatches.length > 0 ? (
        <ScrollView style={styles.mentionList} keyboardShouldPersistTaps="always">
          {mentionMatches.map((m) => (
            <TouchableOpacity
              key={m.user_id}
              style={styles.mentionRow}
              onPress={() => handleSelectMention(m)}
              activeOpacity={0.7}
            >
              <Avatar name={m.display_name || m.username} avatarUrl={m.avatar_url} size={32} />
              <View style={styles.mentionInfo}>
                <Text style={styles.mentionName} numberOfLines={1}>
                  {m.display_name || m.username}
                </Text>
                <Text style={styles.mentionUsername} numberOfLines={1}>
                  @{m.username}
                </Text>
              </View>
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : null}

      {/* Quoted Reply Preview Banner (WhatsApp Style) */}
      {replyTo ? (
        <View style={styles.replyBanner}>
          <View style={styles.replyAccentBar} />
          <View style={styles.replyInfo}>
            <Text style={styles.replySender} numberOfLines={1}>
              Membalas ke{' '}
              {replySenderName ||
                (replyTo.nickname &&
                !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                  replyTo.nickname
                )
                  ? replyTo.nickname
                  : 'Pengguna')}
            </Text>
            <IconText style={styles.replySnippet} numberOfLines={1}>
              {quotePreviewText(replyTo)}
            </IconText>
          </View>
          <TouchableOpacity
            style={styles.replyCancelBtn}
            onPress={onCancelReply}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
          >
            <Icon name="close" size={14} color={colors.textMuted} />
          </TouchableOpacity>
        </View>
      ) : null}

      {/* Video sedang disiapkan (kompresi) */}
      {isPreparingMedia ? (
        <View style={styles.stagedBanner}>
          <View style={[styles.stagedThumbnail, styles.stagedThumbPlaceholder]}>
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          </View>
          <View style={styles.stagedInfo}>
            <Text style={styles.stagedFileName} numberOfLines={1}>Menyiapkan video…</Text>
            <Text style={styles.stagedFileSize}>
              {typeof mediaProgress === 'number' ? `${Math.round(mediaProgress * 100)}%` : 'Mengompres agar hemat kuota'}
            </Text>
          </View>
        </View>
      ) : null}

      {/* Staged Media Preview Banner */}
      {stagedMedia ? (
        <View style={styles.stagedBanner}>
          <View>
            <Image
              source={{ uri: stagedMedia.mediaType === 'video' && stagedMedia.thumbUri ? stagedMedia.thumbUri : stagedMedia.uri }}
              style={styles.stagedThumbnail}
              resizeMode="cover"
            />
            {stagedMedia.mediaType === 'video' ? (
              <View style={styles.stagedPlayBadge} pointerEvents="none">
                <Icon name="play" size={18} color="#ffffff" />
              </View>
            ) : null}
          </View>
          <View style={styles.stagedInfo}>
            <Text style={styles.stagedFileName} numberOfLines={1}>
              {stagedMedia.fileName || (stagedMedia.mediaType === 'video' ? 'Video Terlampir' : 'Foto Terlampir')}
            </Text>
            <Text style={styles.stagedFileSize}>
              {formatFileSize(stagedMedia.fileSize) || (stagedMedia.mediaType === 'video' ? 'Video' : 'Gambar')}
              {stagedMedia.mediaType === 'video' && stagedMedia.durationMs
                ? ` · ${formatRecordingTimer(Math.round(stagedMedia.durationMs / 1000))}`
                : ''}
            </Text>
          </View>
          {isUploading ? (
            <View style={styles.uploadingBadge}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <Text style={styles.uploadingText}>
                {stagedMedia.mediaType === 'video' && typeof mediaProgress === 'number'
                  ? `Mengunggah ${Math.round(mediaProgress * 100)}%`
                  : 'Mengunggah...'}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={onCancelStagedMedia}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              activeOpacity={0.7}
            >
              <Icon name="close" size={16} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      ) : null}

      {isRecording ? (
        /* WhatsApp-Style Recording Bar with Pulsing Indicator & Timer */
        <View style={styles.recordingRow}>
          <TouchableOpacity
            style={styles.cancelRecordButton}
            onPress={cancelRecording}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <IconText style={styles.cancelRecordIcon}>🗑️</IconText>
            <Text style={styles.cancelRecordText}>Batal</Text>
          </TouchableOpacity>

          <View style={styles.recordingCenter}>
            <Animated.View style={[styles.redDot, { opacity: pulseAnim }]} />
            <Text style={styles.recordingTimerText}>{formatRecordingTimer(recordingDuration)}</Text>
          </View>

          <TouchableOpacity
            style={styles.sendRecordButton}
            onPress={stopAndSendRecording}
            activeOpacity={0.7}
          >
            <Icon name="send" size={20} color="#ffffff" />
          </TouchableOpacity>
        </View>
      ) : (
        /* Standard Message Input Bar */
        <View style={styles.container}>
          {/* Emoji Picker Toggle Button */}
          <TouchableOpacity
            style={styles.emojiToggleBtn}
            onPress={handleToggleEmoji}
            disabled={disabled || isUploading}
            activeOpacity={0.7}
          >
            <IconText style={styles.emojiToggleIcon}>{showEmojiPicker ? '⌨️' : '😊'}</IconText>
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
            <Icon name="attach" size={22} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Text Input / Caption */}
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder={
              editingMessage
                ? 'Edit pesan...'
                : stagedMedia
                ? 'Tambah keterangan...'
                : 'Ketik pesan...'
            }
            placeholderTextColor={colors.textMuted}
            value={text}
            onChangeText={handleChangeText}
            onSelectionChange={(e) => {
              selectionRef.current = e.nativeEvent.selection;
            }}
            onFocus={() => setShowEmojiPicker(false)}
            multiline
            maxLength={4000}
            editable={!disabled && !isUploading}
          />

          {/* Send Button or Microphone Button (WhatsApp Dynamic Switch) */}
          {isSendActive ? (
            <TouchableOpacity
              style={[styles.sendButton, styles.sendButtonActive]}
              onPress={handleSend}
              disabled={disabled || isUploading}
              activeOpacity={0.7}
            >
              {isUploading ? (
                <ActivityIndicator size="small" color="#ffffff" />
              ) : (
                <Icon name={editingMessage ? 'check' : 'send'} size={20} color="#ffffff" />
              )}
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.micButton, (disabled || isUploading) ? styles.micButtonDisabled : null]}
              onPress={startRecording}
              disabled={disabled || isUploading}
              activeOpacity={0.7}
              accessibilityLabel="Rekam pesan suara"
            >
              <Icon name="mic" size={22} color={colors.textSecondary} />
            </TouchableOpacity>
          )}
        </View>
      )}

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
                <Icon name="close" size={20} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            <View style={styles.optionsRow}>
              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleSelectCamera}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconCircle, styles.cameraCircle]}>
                  <Icon name="camera" size={28} color={colors.accentHover} />
                </View>
                <Text style={styles.optionLabel}>Kamera</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleSelectVideo}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconCircle, styles.cameraCircle]}>
                  <Icon name="video" size={28} color={colors.accentHover} />
                </View>
                <Text style={styles.optionLabel}>Video</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.optionCard}
                onPress={handleSelectGallery}
                activeOpacity={0.7}
              >
                <View style={[styles.optionIconCircle, styles.galleryCircle]}>
                  <Icon name="image" size={28} color={colors.accentHover} />
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

const makeStyles = (colors: ColorTokens) => StyleSheet.create({
  wrapper: {
    backgroundColor: colors.bgBase,
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    paddingTop: 8,
    paddingHorizontal: spacing.sm,
  },
  mentionList: {
    maxHeight: 220,
    backgroundColor: colors.bgCardSolid,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    marginBottom: 8,
  },
  mentionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  mentionInfo: {
    flex: 1,
    marginLeft: 10,
  },
  mentionName: {
    color: colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  mentionUsername: {
    color: colors.textMuted,
    fontSize: 12,
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
  editBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: 10,
    paddingVertical: 6,
    paddingHorizontal: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: colors.colorCyanNeon,
    overflow: 'hidden',
    position: 'relative',
  },
  editAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    backgroundColor: colors.colorCyanNeon,
    borderTopLeftRadius: 10,
    borderBottomLeftRadius: 10,
  },
  editInfo: {
    flex: 1,
    marginLeft: 6,
    justifyContent: 'center',
  },
  editSender: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorCyanNeon,
    marginBottom: 2,
  },
  editSnippet: {
    fontSize: 12,
    color: colors.textSecondary,
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
    backgroundColor: colors.accentFill,
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
  stagedThumbnail: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: colors.bgInput,
  },
  stagedThumbPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  stagedPlayBadge: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: 8,
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
    backgroundColor: colors.accentFill,
  },
  sendButtonDisabled: {
    backgroundColor: colors.bgCardSolid,
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
    backgroundColor: colors.tintAccent20,
    borderWidth: 1,
    borderColor: colors.tintAccent30,
  },
  optionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  micButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accentFill,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 1,
  },
  micButtonDisabled: {
    opacity: 0.5,
  },
  recordingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.bgCardSolid,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: 12,
    height: 44,
  },
  cancelRecordButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 16,
    backgroundColor: colors.tintError10,
  },
  cancelRecordIcon: {
    fontSize: 13,
    marginRight: 4,
  },
  cancelRecordText: {
    fontSize: 13,
    color: colors.colorDanger,
    fontWeight: '600',
  },
  recordingCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  redDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.dangerFill,
  },
  recordingTimerText: {
    fontSize: 15,
    fontWeight: '700',
    color: colors.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  sendRecordButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.accentFill,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
