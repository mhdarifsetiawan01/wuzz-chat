/**
 * WuzzChat MessageBubble Component
 * Renders chat messages with image previews, expired media states,
 * caption text, timestamps, sender headers, and delivery receipts.
 * Conforms to frontend/DESIGN.md & WhatsApp Aurora theme.
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ActivityIndicator,
  Pressable,
  Animated,
  PanResponder,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Message } from '../api/types';
import { AudioPlayerBubble } from './AudioPlayerBubble';
import { getAvatarColor } from './Avatar';
import { mediaCache } from '../services/mediaCache';
import { MediaViewerModal } from './MediaViewerModal';
import { colors } from '../theme/colors';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { spacing } from '../theme/spacing';
import { LinkPreviewCard } from './LinkPreviewCard';
import { SharedPostCard } from './SharedPostCard';
import { parseSharedPost } from '../utils/feedShare';
import {
  UNDECRYPTABLE_INFO_BODY,
  UNDECRYPTABLE_INFO_TITLE,
  isUndecryptablePlaceholder,
} from '../utils/undecryptable';
import { URL_REGEX, sanitizeUrl, safeOpenUrl, extractFirstUrl } from '../utils/linkUtils';

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
  onPressMedia?: (message: Message, uri: string) => void;
  /** Dipanggil saat kartu postingan feed yang dibagikan diketuk */
  onPressPost?: (postId: string, post?: import('../api/types').FeedPost) => void;
  /** Dipanggil saat pesan E2EE yang gagal didekripsi diketuk untuk dicoba lagi */
  onRetryDecrypt?: (message: Message) => void;
}

const MessageBubbleComponent: React.FC<MessageBubbleProps> = ({
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
  onPressMedia,
  onPressPost,
  onRetryDecrypt,
}) => {
  const insets = useSafeAreaInsets();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(true);
  const [imageError, setImageError] = useState(false);
  const [cachedMediaUri, setCachedMediaUri] = useState<string | null>(null);

  // Check persistent local media cache on mount or URL change (DEC-034)
  useEffect(() => {
    let mounted = true;
    if (message.media_url) {
      mediaCache
        .getCachedMediaUri(message.media_url, message.id, message.file_name)
        .then((uri) => {
          if (mounted && uri) {
            setCachedMediaUri(uri);
          }
        });
    }
    return () => {
      mounted = false;
    };
  }, [message.media_url, message.id, message.file_name]);

  const isDeleted = Boolean(
    message.is_deleted ||
      message.content === '🚫 Pesan ini telah dihapus' ||
      (typeof message.content === 'string' && message.content.startsWith('🚫 Pesan ini telah dihapus'))
  );

  // PanResponder for smooth Swipe-to-Reply
  const panX = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        if (isDeleted) return false;
        // Only capture horizontal swipes to the right
        return gestureState.dx > 15 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy * 1.5);
      },
      onPanResponderMove: (_, gestureState) => {
        if (isDeleted) return;
        if (gestureState.dx > 0) {
          const clamped = Math.min(gestureState.dx, 75);
          panX.setValue(clamped);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isDeleted) return;
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
  // Pesan E2EE yang kuncinya tidak cocok (mis. setelah reset kunci): permanen, bukan "sedang sinkron"
  const isUndecryptable = !isDeleted && Boolean(message.is_encrypted) && isUndecryptablePlaceholder(message.content);
  const isSystem = message.type === 'system';
  const effectiveMediaUrl = cachedMediaUri || message.media_url;

  const isImage = Boolean(
    effectiveMediaUrl &&
      (message.media_type === 'image' ||
        message.type === 'image' ||
        /\.(jpg|jpeg|png|webp|gif)$/i.test(effectiveMediaUrl))
  );
  const isAudio = Boolean(
    effectiveMediaUrl &&
      (message.media_type === 'audio' ||
        message.type === 'audio' ||
        /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(effectiveMediaUrl) ||
        (message.file_name && /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(message.file_name)))
  );

  // DEC-034: Media is only expired if the server marked it as expired AND we do not have a local cached file
  const isExpired = Boolean(message.media_status === 'expired' && !cachedMediaUri);

  // DEC-037 & DEC-038: Ekstrak URL pertama untuk LinkPreviewCard jika pesan aktif
  const sharedPost = !isDeleted && !isE2EE ? parseSharedPost(message.content) : null;
  const previewUrl = !isDeleted && !isE2EE && !sharedPost && message.content ? extractFirstUrl(message.content) : null;

  // Render teks pesan dengan deteksi auto-linking aman (http/https/www)
  const renderMessageTextWithLinks = (
    content: string,
    isSelfBubble: boolean,
    isImageCaption: boolean
  ) => {
    if (!content) return null;

    const parts = content.split(URL_REGEX);
    if (parts.length === 1) {
      return (
        <Text style={[styles.messageText, !isSelfBubble && styles.messageTextOther, isImageCaption ? styles.captionText : null]}>
          {content}
        </Text>
      );
    }

    return (
      <Text style={[styles.messageText, !isSelfBubble && styles.messageTextOther, isImageCaption ? styles.captionText : null]}>
        {parts.map((part, index) => {
          const isUrl = URL_REGEX.test(part);
          URL_REGEX.lastIndex = 0;

          if (isUrl) {
            const cleanUrl = sanitizeUrl(part);
            const trailing = part.slice(cleanUrl.length);

            return (
              <React.Fragment key={index}>
                <Text
                  style={[styles.linkText, isSelfBubble ? styles.linkTextSelf : styles.linkTextOther]}
                  onPress={() => safeOpenUrl(cleanUrl)}
                  suppressHighlighting={false}
                >
                  {cleanUrl}
                </Text>
                {trailing ? <Text>{trailing}</Text> : null}
              </React.Fragment>
            );
          }

          return <Text key={index}>{part}</Text>;
        })}
      </Text>
    );
  };

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
    // Auto-cache remote image into persistent local storage so it remains visible after server ACK delete
    if (message.media_url && !cachedMediaUri && !message.media_url.startsWith('file://')) {
      mediaCache
        .ensureMediaCached(message.media_url, message.id, message.file_name)
        .then((savedUri) => {
          if (savedUri && savedUri.startsWith('file://')) {
            setCachedMediaUri(savedUri);
          }
        })
        .catch(() => {});
    }
  };

  const handleImageError = () => {
    setIsImageLoading(false);
    // If loading from local cache failed, fallback to remote URL
    if (cachedMediaUri && message.media_url && cachedMediaUri !== message.media_url) {
      setCachedMediaUri(null);
    } else {
      setImageError(true);
    }
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

  const hasCaption = Boolean(
    message.content &&
      typeof message.content === 'string' &&
      message.content.trim() !== '' &&
      !isE2EE
  );

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
        <IconText style={styles.swipeReplyIcon}>↩️</IconText>
      </Animated.View>

      <Animated.View
        style={{
          transform: [{ translateX: panX }],
          maxWidth: '85%',
        }}
        {...panResponder.panHandlers}
      >
        <Pressable
          onLongPress={() => {
            if (!isDeleted) {
              onLongPress?.(message);
            }
          }}
          delayLongPress={280}
          style={[
            styles.bubble,
            isSelf ? styles.selfBubble : styles.otherBubble,
            isImage ? styles.imageBubblePadding : null,
            isAudio ? styles.audioBubblePadding : null,
            isHighlighted ? styles.highlightedBubble : null,
            isDeleted ? styles.deletedBubble : null,
          ]}
        >
          {showSenderName && !isSelf && senderName && !isDeleted ? (
            <Text
              style={[
                styles.senderName,
                { color: getAvatarColor(senderName || message.from || 'User') },
              ]}
            >
              {senderName}
            </Text>
          ) : null}

          {/* Forwarded Message Header */}
          {message.is_forwarded && !isDeleted ? (
            <View style={styles.forwardedRow}>
              <IconText style={styles.forwardedIcon}>↪</IconText>
              <Text style={styles.forwardedText}>Diteruskan</Text>
            </View>
          ) : null}

          {/* Deleted Message State */}
          {isDeleted ? (
            <View style={styles.deletedRow}>
              <IconText style={styles.deletedIcon}>🚫</IconText>
              <Text style={styles.deletedText}>Pesan ini telah dihapus</Text>
            </View>
          ) : (
            <>
              {/* Quoted Message Card */}
              {message.reply_to ? (
                <TouchableOpacity
                  style={[styles.quoteBox, isSelf && styles.quoteBoxSelf]}
                  onPress={() => onPressQuote?.(message.reply_to!.id)}
                  activeOpacity={0.7}
                >
                  <View style={[styles.quoteAccentBar, isSelf && styles.quoteAccentBarSelf]} />
                  <View style={styles.quoteContent}>
                    <Text style={[styles.quoteSender, isSelf && styles.quoteSenderSelf]} numberOfLines={1}>
                      {message.reply_to.nickname &&
                      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
                        message.reply_to.nickname
                      )
                        ? message.reply_to.nickname
                        : 'Pengguna'}
                    </Text>
                    <IconText style={styles.quoteText} numberOfLines={2}>
                      {message.reply_to.media_type === 'audio'
                        ? '🎙️ Pesan Suara'
                        : message.reply_to.content || 'Pesan'}
                    </IconText>
                  </View>
                </TouchableOpacity>
              ) : null}

              {/* Expired Media Banner (WhatsApp Store-and-Forward Lifecycle) */}
              {message.media_url && isExpired ? (
                <View style={styles.expiredBox}>
                  <IconText style={styles.expiredIcon}>⌛</IconText>
                  <View style={styles.expiredTextCol}>
                    <Text style={styles.expiredTitle}>Media telah kedaluwarsa</Text>
                    <Text style={styles.expiredSubtitle}>File sudah tidak tersedia di server</Text>
                  </View>
                </View>
              ) : null}

              {/* Image Attachment Preview */}
              {isImage && !isExpired && effectiveMediaUrl ? (
                <View style={styles.imageContainer}>
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => {
                      if (onPressMedia && effectiveMediaUrl) {
                        onPressMedia(message, effectiveMediaUrl);
                      } else {
                        setIsFullscreen(true);
                      }
                    }}
                    style={styles.imageTouchable}
                  >
                    <Image
                      source={{ uri: effectiveMediaUrl }}
                      style={styles.mediaImage}
                      contentFit="cover"
                      recyclingKey={message.id}
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
                        <IconText style={styles.imageErrorIcon}>⚠️</IconText>
                        <Text style={styles.imageErrorText}>Gagal memuat gambar</Text>
                      </View>
                    ) : null}
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* Voice Note Audio Player */}
              {isAudio && !isExpired && effectiveMediaUrl ? (
                <AudioPlayerBubble
                  audioUrl={effectiveMediaUrl}
                  messageId={message.id}
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
              {isUndecryptable ? (
                <TouchableOpacity
                  style={styles.e2eeRow}
                  activeOpacity={0.7}
                  onPress={() => Alert.alert(UNDECRYPTABLE_INFO_TITLE, UNDECRYPTABLE_INFO_BODY)}
                  accessibilityRole="button"
                  accessibilityLabel="Pesan tidak dapat dibuka karena kunci enkripsi berubah. Ketuk untuk info"
                >
                  <Icon name="lock" size={14} color="rgba(255, 255, 255, 0.75)" />
                  <Text style={styles.undecryptableTitle}>Pesan tidak dapat dibuka</Text>
                  <Icon name="info" size={14} color="rgba(255, 255, 255, 0.75)" />
                </TouchableOpacity>
              ) : isE2EE && message.decrypt_failed ? (
                <TouchableOpacity
                  style={styles.e2eeRow}
                  activeOpacity={0.7}
                  onPress={() => onRetryDecrypt?.(message)}
                >
                  <Icon name="lock" size={14} color={colors.textSecondary} />
                  <Text style={[styles.messageText, styles.e2eeText]}>
                    Pesan terenkripsi gagal dibuka.{' '}
                    <Text style={styles.e2eeRetryText}>Ketuk untuk coba lagi</Text>
                  </Text>
                </TouchableOpacity>
              ) : isE2EE ? (
                <View style={styles.e2eeRow}>
                  <Icon name="lock" size={14} color={colors.textSecondary} />
                  <Text style={[styles.messageText, styles.e2eeText]}>
                    Pesan terenkripsi (sedang menyinkronkan kunci...)
                  </Text>
                </View>
              ) : sharedPost ? (
                <SharedPostCard
                  postId={sharedPost.postId}
                  text={sharedPost.text}
                  isSelf={isSelf}
                  onPress={onPressPost}
                />
              ) : hasCaption ? (
                renderMessageTextWithLinks(message.content, isSelf, isImage)
              ) : null}

              {/* Web Link Preview Card (WhatsApp pattern: 1 card per message) */}
              {previewUrl ? (
                <LinkPreviewCard url={previewUrl} isSelf={isSelf} />
              ) : null}
            </>
          )}


          {/* Bubble Footer: Timestamp & Receipt Checkmarks */}
          <View style={[styles.footerRow, isImage && !hasCaption && !isDeleted ? styles.footerOverImage : null]}>
            {message.is_pinned && !isDeleted ? <Icon name="pin" size={12} color="rgba(255, 255, 255, 0.75)" /> : null}
            {message.is_edited && !isDeleted ? <Text style={[styles.editedLabel, !isSelf && styles.editedLabelOther]}>(diedit)</Text> : null}
            {message.is_encrypted && !isDeleted ? <Icon name="lock" size={11} color="rgba(255, 255, 255, 0.75)" /> : null}
            <Text style={[styles.timeText, !isSelf && styles.timeTextOther, isDeleted && styles.timeTextDeleted]}>{timeString}</Text>
            {isSelf && !isDeleted ? (
              <Icon
                name={
                  message.status === 'sending'
                    ? 'clock'
                    : message.status === 'read' || message.status === 'delivered'
                    ? 'checkDouble'
                    : 'check'
                }
                size={14}
                color={message.status === 'read' ? '#ffffff' : 'rgba(255, 255, 255, 0.65)'}
              />
            ) : null}
          </View>
        </Pressable>

        {/* Reaction Pills Row */}
        {Array.isArray(message.reactions) && message.reactions.length > 0 && !isDeleted ? (
          <View style={[styles.reactionsRow, isSelf ? styles.selfReactions : styles.otherReactions]}>
            {message.reactions.map((r, i) => {
              const hasUserReacted = Boolean(
                currentUserId && Array.isArray(r?.users) && r.users.includes(currentUserId)
              );
              const emojiStr = typeof r?.emoji === 'string' ? r.emoji : '👍';
              const countNum = typeof r?.count === 'number' ? r.count : 1;

              return (
                <TouchableOpacity
                  key={`${emojiStr}_${i}`}
                  style={[styles.reactionPill, hasUserReacted ? styles.reactionPillActive : null]}
                  onPress={() => onReact?.(message.id, emojiStr)}
                  activeOpacity={0.7}
                >
                  <Text style={styles.reactionEmoji}>{emojiStr}</Text>
                  {countNum > 1 ? <Text style={styles.reactionCount}>{countNum}</Text> : null}
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}
      </Animated.View>

      {/* Fullscreen Interactive Pinch-to-Zoom Media Viewer */}
      {isImage && effectiveMediaUrl ? (
        <MediaViewerModal
          visible={isFullscreen}
          mediaUrl={effectiveMediaUrl}
          fileName={message.file_name}
          caption={hasCaption ? message.content : undefined}
          senderName={senderName || message.nickname || message.from}
          timestamp={message.created_at || message.timestamp}
          onClose={() => setIsFullscreen(false)}
        />
      ) : null}
    </View>
  );
};

// Memoized: bubble hanya re-render bila prop-nya berubah (callback dari ChatScreen harus stabil)
export const MessageBubble = React.memo(MessageBubbleComponent);

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
  // Bubble Anda biru terang (#30AFFF): kotak kutipan digelapkan (hitam 40%) agar teks putih memenuhi WCAG AA 4,5:1
  quoteBoxSelf: {
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
  quoteAccentBarSelf: {
    backgroundColor: '#ffffff',
  },
  quoteSenderSelf: {
    color: '#ffffff',
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
    color: 'rgba(255, 255, 255, 0.92)',
    lineHeight: 16,
  },
  deletedBubble: {
    backgroundColor: 'rgba(30, 41, 59, 0.45)',
    borderWidth: 1,
    borderColor: colors.borderSubtle,
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
  timeTextDeleted: {
    color: colors.textMuted,
    opacity: 0.7,
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
    backgroundColor: '#30AFFF', // Wuzz Identity Blue
    borderBottomRightRadius: 3,
  },
  otherBubble: {
    backgroundColor: '#334155',
    borderBottomLeftRadius: 3,
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
    color: '#ffffff',
  },
  messageTextOther: {
    color: '#ffffff',
  },
  linkText: {
    textDecorationLine: 'underline',
    fontWeight: '600',
  },
  linkTextSelf: {
    color: '#e0f2fe',
  },
  linkTextOther: {
    color: '#38bdf8',
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
  e2eeText: {
    fontStyle: 'italic',
    color: colors.textSecondary,
  },
  undecryptableTitle: {
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  e2eeRetryText: {
    fontStyle: 'normal',
    fontWeight: '600',
    color: colors.accentPrimary,
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
  timeTextOther: {
    color: 'rgba(255, 255, 255, 0.60)',
  },
  forwardedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
    opacity: 0.85,
  },
  forwardedIcon: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.65)',
  },
  forwardedText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  editedLabel: {
    fontSize: 10,
    fontStyle: 'italic',
    color: 'rgba(255, 255, 255, 0.65)',
  },
  editedLabelOther: {
    color: '#94a3b8',
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
