/**
 * WuzzChat MessageBubble Component
 * Renders individual chat message with timestamps, sender headers, and delivery status checkmarks.
 * Follows frontend/DESIGN.md & WhatsApp Aurora aesthetics.
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Message } from '../api/types';
import { colors } from '../theme/colors';
import { spacing } from '../theme/spacing';

export interface MessageBubbleProps {
  message: Message;
  isSelf: boolean;
  showSenderName?: boolean;
  senderName?: string;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
  message,
  isSelf,
  showSenderName,
  senderName,
}) => {
  const isE2EE = typeof message.content === 'string' && message.content.startsWith('e2ee:v1:');
  const isSystem = message.type === 'system';

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

  if (isSystem) {
    return (
      <View style={styles.systemContainer}>
        <View style={styles.systemBubble}>
          <Text style={styles.systemText}>{message.content}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, isSelf ? styles.selfContainer : styles.otherContainer]}>
      <View style={[styles.bubble, isSelf ? styles.selfBubble : styles.otherBubble]}>
        {showSenderName && !isSelf && senderName ? (
          <Text style={styles.senderName}>{senderName}</Text>
        ) : null}

        {isE2EE ? (
          <View style={styles.e2eeRow}>
            <Text style={styles.e2eeIcon}>🔒</Text>
            <Text style={[styles.messageText, styles.e2eeText]}>Pesan terenkripsi E2EE</Text>
          </View>
        ) : (
          <Text style={styles.messageText}>{message.content}</Text>
        )}

        <View style={styles.footerRow}>
          <Text style={styles.timeText}>{timeString}</Text>
          {isSelf ? (
            <Text style={[styles.receiptIcon, message.status === 'read' ? styles.receiptRead : styles.receiptSent]}>
              {message.status === 'sending'
                ? '🕒'
                : message.status === 'read' || message.status === 'delivered'
                ? '✓✓'
                : '✓'}
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginVertical: 3,
    paddingHorizontal: spacing.sm,
    width: '100%',
  },
  selfContainer: {
    alignItems: 'flex-end',
  },
  otherContainer: {
    alignItems: 'flex-start',
  },
  bubble: {
    maxWidth: '82%',
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 6,
    borderRadius: 14,
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
    marginBottom: 3,
  },
  messageText: {
    fontSize: 15,
    lineHeight: 20,
    color: colors.textPrimary,
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
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-end',
    marginTop: 4,
    gap: 4,
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
});
