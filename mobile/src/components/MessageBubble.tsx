/**
 * WuzzChat MessageBubble Component
 * Renders chat messages with image previews, expired media states,
 * caption text, timestamps, sender headers, and delivery receipts.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Pressable,
  Animated,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { AudioPlayerBubble } from './AudioPlayerBubble';
import { getAvatarColor } from './Avatar';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  showSenderName?: boolean;
  senderName?: string;
  currentUserId?: string;
  isHighlighted?: boolean;
  onMediaLoaded?: (message: Message) => void;
  onReply?: (message: Message) => void;
  onLongPress?: (message: Message) => void;
  onPressQuote?: (messageId: string) => void;
  onReact?: (messageId: string, emoji: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSelf,
  showSenderName,
  senderName,
  currentUserId,
  isHighlighted,
  onMediaLoaded,
  onReply,
  onLongPress,
  onPressQuote,
  onReact,
}) => {
  const insets = useSafeAreaInsets();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);

  // PanResponder for smooth Swipe-to-Reply
  const panX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only capture horizontal swipes to the right
        return gestureState.dx > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 1.5);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dx > 0) {
          const clamped = Math.min(gestureState.dx, 75);
          panX.setValue(clamped);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dx >= 50) {
          onReply?.(message);
        }
        Animated.spring(panX, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(panX, {
          toValue: 0,
          tension: 50,
          friction: 7,
          useNativeDriver: true,
        }).start();
      },
    })
  ).current;

  const replyIconOpacity = panX.interpolate({
    inputRange: [0, 35],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  const replyIconScale = panX.interpolate({
    inputRange: [0, 35, 60],
    outputRange: [0.5, 1, 1.15],
    extrapolate: 'clamp',
  });

  const isE2EE = typeof message.content === 'string' && message.content.startsWith('e2ee:v1:');
  const isSystem = message.type === 'system';
  const isImage = Boolean(
    message.media_url &&
      (message.media_type === 'image' ||
        message.type === 'image' ||
        /\.(jpg|jpeg|png|webp|gif)$/i.test(message.media_url))
  );
  const isAudio = Boolean(
    message.media_url &&
      (message.media_type === 'audio' ||
        message.type === 'audio' ||
        /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(message.media_url) ||
        (message.file_name && /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(message.file_name)))
  );
  const isExpired = message.media_status === 'expired';

  // Format timestamp (HH:mm)
  const formatTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
    } catch {
      return '';
    }
  };

  const timeString = formatTime(message.timestamp || message.created_at);

  const handleImageLoad = () => {
    setIsImageLoading(false);
    setImageError(false);
    if (!isSelf) {
      onMediaLoaded?.(message);
    }
  };

  const handleImageError = () => {
    setIsImageLoading(false);
    setImageError(true);
  };

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  const hasCaption = Boolean(message.content && message.content.trim() !== '' && !isE2EE);

  return (
    <View style={[styles.container, isSelf ? styles.selfContainer : styles.otherContainer]}>
      {/* Swipe to reply reveal icon */}
      <Animated.View
        style={[
          styles.swipeReplyIconContainer,
          {
            opacity: replyIconOpacity,
            transform: [{ scale: replyIconScale }],
          },
        ]}
      >
        <Text style={styles.swipeReplyIcon}>↩️</Text>
      </Animated.View>

      <Animated.View
        style={{
          transform: [{ translateX: panX }],
          maxWidth: '85%',
        }}
        {...panResponder.panHandlers}
      >
        <Pressable
          onLongPress={() => onLongPress?.(message)}
          delayLongPress={280}
          style={[
            styles.bubble,
            isSelf ? styles.selfBubble : styles.otherBubble,
            isImage ? styles.imageBubblePadding : null,
            isAudio ? styles.audioBubblePadding : null,
            isHighlighted ? styles.highlightedBubble : null,
          ]}
        >
          {showSenderName && !isSelf && senderName ? (
            <Text
              style={[
                styles.senderName,
                { color: getAvatarColor(senderName || message.from || 'User') },
              ]}
            >
              {senderName}
            </Text>
          ) : null}


          {/* Deleted Message State */}
          {message.is_deleted ? (
            <View style={styles.deletedRow}>
              <Text style={styles.deletedIcon}>🚫</Text>
              <Text style={styles.deletedText}>Pesan ini telah dihapus</Text>
            </View>
          ) : (
            <>
              {/* Quoted Message Card */}
              {message.reply_to ? (
                <TouchableOpacity
                  style={styles.quoteBox}
                  onPress={() => onPressQuote?.(message.reply_to!.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.quoteAccentBar} />
                  <View style={styles.quoteContent}>
                    <Text style={styles.quoteSender} numberOfLines={1}>
                      {message.reply_to.nickname || 'Pengguna'}
                    </Text>
                    <Text style={styles.quoteText} numberOfLines={2}>
                      {message.reply_to.media_type === 'audio'
                        ? '🎙️ Pesan Suara'
                        : message.reply_to.content || 'Pesan'}
                    </Text>
                  </View>
                </TouchableOpacity>
              ) : null}

              {/* Expired Media Banner (WhatsApp Store-and-Forward Lifecycle) */}
              {message.media_url && isExpired ? (
                <View style={styles.expiredBox}>
                  <Text style={styles.expiredIcon}>⌛</Text>
                  <View style={styles.expiredTextCol}>
                    <Text style={styles.expiredTitle}>Media telah kedaluwarsa</Text>
                    <Text style={styles.expiredSubtitle}>File sudah tidak tersedia di server</Text>
                  </View>
                </View>
              ) : null}

              {/* Image Attachment Preview */}
              {isImage && !isExpired && message.media_url ? (
                <View style={styles.imageContainer}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => setIsFullscreen(true)}
                    style={styles.imageTouchable}
                  >
                    <Image
                      source={{ uri: message.media_url }}
                      style={styles.mediaImage}
                      resizeMode="cover"
                      onLoad={handleImageLoad}
                      onError={handleImageError}
                    />
                    {isImageLoading ? (
                      <View style={styles.imageLoadingOverlay}>
                        <ActivityIndicator size="small" color={colors.accentPrimary} />
                      </View>
                    ) : null}
                    {imageError ? (
                      <View style={styles.imageErrorOverlay}>
                        <Text style={styles.imageErrorIcon}>⚠️</Text>
                        <Text style={styles.imageErrorText}>Gagal memuat gambar</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Voice Note Audio Player */}
              {isAudio && !isExpired && message.media_url ? (
                <AudioPlayerBubble
                  audioUrl={message.media_url}
                  fileName={message.file_name}
                  isSelf={isSelf}
                  onLoaded={() => {
                    if (!isSelf) {
                      onMediaLoaded?.(message);
                    }
                  }}
                />
              ) : null}

              {/* Text Content / Caption */}
              {isE2EE ? (
                <View style={styles.e2eeRow}>
                  <Text style={styles.e2eeIcon}>🔒</Text>
                  <Text style={[styles.messageText, styles.e2eeText]}>
                    Pesan terenkripsi (sedang menyinkronkan kunci...)
                  </Text>
                </View>
              ) : hasCaption ? (
                <Text style={[styles.messageText, isImage ? styles.captionText : null]}>
                  {message.content}
                </Text>
              ) : null}
            </>
          )}

          {/* Bubble Footer: Timestamp & Receipt Checkmarks */}
          <View style={[styles.footerRow, isImage && !hasCaption && !message.is_deleted ? styles.footerOverImage : null]}>
            {message.is_encrypted ? <Text style={styles.e2eeLockBadge}>🔒</Text> : null}
            <Text style={styles.timeText}>{timeString}</Text>
            {isSelf ? (
              <Text
                style={[
                  styles.receiptIcon,
                  message.status === 'read' ? styles.receiptRead : styles.receiptSent,
                ]}
              >
                {message.status === 'sending'
                  ? '🕒'
                  : message.status === 'read' || message.status === 'delivered'
                  ? '✓✓'
                  : '✓'}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {/* Reaction Pills Row */}
        {message.reactions && message.reactions.length > 0 && !message.is_deleted ? (
          <View style={[styles.reactionsRow, isSelf ? styles.selfReactions : styles.otherReactions]}>
            {message.reactions.map((r, i) => {
              const hasUserReacted = currentUserId && r.users?.includes(currentUserId);
              return (
                <TouchableOpacity
                  key={`${r.emoji}_${i}`}
                  style={[styles.reactionPill, hasUserReacted ? styles.reactionPillActive : null]}
                  onPress={() => onReact?.(message.id, r.emoji)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{r.emoji}</Text>
                  {r.count > 1 ? <Text style={styles.reactionCount}>{r.count}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </Animated.View>

      {/* Fullscreen Image Lightbox Modal */}
      {isImage && message.media_url ? (
        <Modal
          visible={isFullscreen}
          transparent
          animationType="fade"
          onRequestClose={() => setIsFullscreen(false)}
        >
          <View style={[styles.fullscreenBackdrop, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
            <View style={styles.fullscreenHeader}>
              <Text style={styles.fullscreenTitle} numberOfLines={1}>
                {message.file_name || 'Foto'}
              </Text>
              <TouchableOpacity
                style={styles.fullscreenCloseBtn}
                onPress={() => setIsFullscreen(false)}
                hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}
                activeOpacity={0.7}
              >
                <Text style={styles.fullscreenCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <Pressable style={styles.fullscreenBody} onPress={() => setIsFullscreen(false)}>
              <Image
                source={{ uri: message.media_url }}
                style={styles.fullscreenImage}
                resizeMode="contain"
              />
            </Pressable>

            {hasCaption ? (
              <View style={styles.fullscreenCaptionBox}>
                <Text style={styles.fullscreenCaptionText}>{message.content}</Text>
              </View>
            ) : null}
          </View>
        </Modal>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 3,
    paddingHorizontal: spacing.sm,
    width: '100%',
    position: 'relative',
  },
  selfContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  swipeReplyIconContainer: {
    position: 'absolute',
    left: 8,
    top: '35%',
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.bgCardSolid,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 10,
  },
  swipeReplyIcon: {
    fontSize: 15,
  },
  bubble: {
    maxWidth: '100%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
  },
  highlightedBubble: {
    borderWidth: 1.5,
    borderColor: colors.accentPrimary,
    backgroundColor: '#1e3a8a',
  },
  quoteBox: {
    backgroundColor: 'rgba(0, 0, 0, 0.22)',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    marginBottom: 6,
    flexDirection: 'row',
    overflow: 'hidden',
    position: 'relative',
  },
  quoteAccentBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3.5,
    backgroundColor: '#38bdf8',
    borderTopLeftRadius: 8,
    borderBottomLeftRadius: 8,
  },
  quoteContent: {
    flex: 1,
    marginLeft: 6,
  },
  quoteSender: {
    fontSize: 11,
    fontWeight: '700',
    color: '#38bdf8',
    marginBottom: 1,
  },
  quoteText: {
    fontSize: 12,
    color: colors.textSecondary,
    lineHeight: 16,
  },
  deletedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 2,
    gap: 6,
  },
  deletedIcon: {
    fontSize: 13,
  },
  deletedText: {
    fontSize: 13,
    fontStyle: 'italic',
    color: colors.textMuted,
  },
  reactionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
    marginTop: 2,
    marginBottom: 2,
  },
  selfReactions: {
    justifyContent: 'flex-end',
    marginRight: 4,
  },
  otherReactions: {
    justifyContent: 'flex-start',
    marginLeft: 4,
  },
  reactionPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bgCardSolid,
    borderRadius: 12,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    gap: 3,
  },
  reactionPillActive: {
    borderColor: colors.accentPrimary,
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
  },
  reactionEmoji: {
    fontSize: 13,
  },
  reactionCount: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.textPrimary,
  },
  imageBubblePadding: {
    paddingHorizontal: 5,
    paddingTop: 5,
    paddingBottom: 6,
  },
  audioBubblePadding: {
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 4,
  },
  selfBubble: {
    backgroundColor: '#1d4ed8', // Dark Royal Blue
    borderBottomRightRadius: 3,
  },
  otherBubble: {
    backgroundColor: colors.bgCardSolid, // #1e293b
    borderBottomLeftRadius: 3,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  senderName: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.colorCyanNeon,
    marginBottom: 4,
    marginLeft: 6,
  },
  imageContainer: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.bgInput,
  },
  imageTouchable: {
    width: 240,
    height: 200,
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
    borderRadius: 10,
  },
  imageLoadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  imageErrorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
    gap: 4,
  },
  imageErrorIcon: {
    fontSize: 22,
  },
  imageErrorText: {
    fontSize: 11,
    color: colors.textMuted,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
  },
  captionText: {
    marginTop: 6,
    marginHorizontal: 6,
  },
  expiredBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.3)',
    borderRadius: 8,
    padding: 8,
    gap: 8,
    marginBottom: 4,
    minWidth: 180,
  },
  expiredIcon: {
    fontSize: 18,
  },
  expiredTextCol: {
    flex: 1,
  },
  expiredTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#f87171',
  },
  expiredSubtitle: {
    fontSize: 10,
    color: colors.textMuted,
    marginTop: 1,
  },
  e2eeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  e2eeIcon: {
    fontSize: 13,
  },
  e2eeText: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  e2eeLockBadge: {
    fontSize: 9,
    opacity: 0.85,
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 4,
    marginRight: 4,
    gap: 4,
  },
  footerOverImage: {
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  timeText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  receiptIcon: {
    fontSize: 11,
    fontWeight: '700',
  },
  receiptSent: {
    color: 'rgba(255, 255, 255, 0.65)',
  },
  receiptRead: {
    color: '#38bdf8', // Neon Sky Blue
  },
  systemContainer: {
    alignItems: 'center',
    marginVertical: spacing.sm,
  },
  systemBubble: {
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
  },
  systemText: {
    fontSize: 11,
    color: colors.textMuted,
    textAlign: 'center',
  },
  fullscreenBackdrop: {
    flex: 1,
    backgroundColor: '#000000',
  },
  fullscreenHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  fullscreenTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: colors.textPrimary,
    flex: 1,
  },
  fullscreenCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
  fullscreenCloseText: {
    fontSize: 15,
    color: colors.textPrimary,
    fontWeight: '700',
  },
  fullscreenBody: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenImage: {
    width: '100%',
    height: '100%',
  },
  fullscreenCaptionBox: {
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    padding: spacing.md,
  },
  fullscreenCaptionText: {
    fontSize: 14,
    color: colors.textPrimary,
    textAlign: 'center',
  },
});
