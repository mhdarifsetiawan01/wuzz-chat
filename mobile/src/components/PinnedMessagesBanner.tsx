/**
 * WuzzChat PinnedMessagesBanner Component
 * Aurora Glassmorphism multi-pin carousel banner (up to 3 pinned messages).
 * Implements Jump-to-Message navigation and unpin trigger.
 * Conforms to Milestone 8.3 & frontend/DESIGN.md.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Message, PinnedMessage } from '../api/types';
import { colors, radius, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Icon } from './Icon';
import { quotePreviewText } from '../utils/quotePreview';

export interface PinnedMessagesBannerProps {
  pinnedMessages: Array<Message | PinnedMessage>;
  onJumpToMessage: (messageId: string) => void;
  onUnpinMessage?: (message: Message | PinnedMessage) => void;
  canUnpin?: boolean;
}

export const PinnedMessagesBanner: React.FC<PinnedMessagesBannerProps> = ({
  pinnedMessages,
  onJumpToMessage,
  onUnpinMessage,
  canUnpin = true,
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);

  // Keep currentIndex in bounds when pinnedMessages changes
  useEffect(() => {
    if (currentIndex >= pinnedMessages.length) {
      setCurrentIndex(Math.max(0, pinnedMessages.length - 1));
    }
  }, [pinnedMessages.length, currentIndex]);

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null;
  }

  const activeItem = pinnedMessages[currentIndex] || pinnedMessages[0];
  const totalPins = pinnedMessages.length;

  const handleNext = () => {
    setCurrentIndex((prev) => (prev + 1) % totalPins);
  };

  const targetMessageId =
    (activeItem as PinnedMessage).message_id || (activeItem as Message).id || '';

  const handlePress = () => {
    if (targetMessageId) {
      onJumpToMessage(targetMessageId);
    }
  };

  const getSenderName = () => {
    const item = activeItem as any;
    if (item.message?.nickname) return item.message.nickname;
    if (item.message?.from) return item.message.from;
    if (item.nickname) return item.nickname;
    if (item.from) return item.from;
    return 'Pesan';
  };

  const getSnippet = () => {
    const item = activeItem as any;
    const msg = item.message || item;
    // Ringkasan bersama dengan kutipan balasan (suara, foto, postingan terbagi tidak tampil mentah)
    const preview = quotePreviewText(msg || {});
    return preview === 'Pesan' && !msg?.content ? 'Pesan Tersemat' : preview;
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.contentTouchable}
        onPress={handlePress}
        activeOpacity={0.75}
      >
        <View style={styles.pinIconContainer}>
          <IconText style={styles.pinIcon}>📌</IconText>
        </View>

        <View style={styles.infoCol}>
          <View style={styles.headerRow}>
            <Text style={styles.pinTitle}>
              Pesan Disematkan {totalPins > 1 ? `(${currentIndex + 1}/${totalPins})` : ''}
            </Text>
            <Text style={styles.senderText} numberOfLines={1}>
              • {getSenderName()}
            </Text>
          </View>
          <IconText style={styles.snippetText} numberOfLines={1}>
            {getSnippet()}
          </IconText>
        </View>
      </TouchableOpacity>

      {/* Right Controls */}
      <View style={styles.actionsRow}>
        {totalPins > 1 && (
          <TouchableOpacity
            style={styles.cycleBtn}
            onPress={handleNext}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Text style={styles.cycleBtnText}>›</Text>
          </TouchableOpacity>
        )}

        {canUnpin && onUnpinMessage && (
          <TouchableOpacity
            style={styles.unpinBtn}
            onPress={() => onUnpinMessage(activeItem)}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            activeOpacity={0.7}
          >
            <Icon name="close" size={14} color={colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    // Terang seperti header chat; versi gelap lama membuat teks sekunder hanya ±3,9:1 (butuh ≥ 4,5:1)
    backgroundColor: colors.bgCardSolid,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderDefault,
    borderLeftWidth: 3,
    borderLeftColor: colors.accentPrimary,
    paddingVertical: 7,
    paddingHorizontal: spacing.md,
    zIndex: 40,
  },
  contentTouchable: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tintAccent20,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: spacing.sm,
  },
  pinIcon: {
    fontSize: 14,
    color: colors.accentHover,
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pinTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.textPrimary,
  },
  senderText: {
    fontSize: 11,
    color: colors.textSecondary,
    marginLeft: 4,
    flex: 1,
  },
  snippetText: {
    ...typography.caption,
    color: colors.textSecondary,
    marginTop: 1,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: spacing.xs,
    gap: 4,
  },
  cycleBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.bgInput,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cycleBtnText: {
    color: colors.textSecondary,
    fontSize: 16,
    fontWeight: '700',
    marginTop: -2,
  },
  unpinBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.bgInput,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
