/**
 * WuzzChat Mobile UI - ChatListItem Component
 * WhatsApp-grade conversation list row item with unread badge and preview.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Conversation, Message } from '../api/types';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';

interface ChatListItemProps {
  conversation: Conversation;
  onPress: (conversation: Conversation) => void;
}

function formatChatTime(dateString?: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const isToday =
    date.getDate() === now.getDate() &&
    date.getMonth() === now.getMonth() &&
    date.getFullYear() === now.getFullYear();

  if (isToday) {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
  }

  const yesterday = new Date();
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    date.getDate() === yesterday.getDate() &&
    date.getMonth() === yesterday.getMonth() &&
    date.getFullYear() === yesterday.getFullYear();

  if (isYesterday) {
    return 'Kemarin';
  }

  return `${date.getDate()}/${date.getMonth() + 1}`;
}

function getConversationName(conv: Conversation): string {
  return conv.title || conv.peer_nickname || conv.name || conv.id || 'Obrolan';
}

function getMessagePreview(conversation: Conversation): string {
  if (!conversation.last_message) {
    return 'Belum ada pesan';
  }

  const isMsgObj = typeof conversation.last_message === 'object' && conversation.last_message !== null;
  const lastMsg = isMsgObj ? (conversation.last_message as Message) : null;
  const mediaUrl = lastMsg?.media_url;
  const mediaType = lastMsg?.media_type;

  const raw: string = isMsgObj
    ? lastMsg?.content || ''
    : typeof conversation.last_message === 'string'
    ? conversation.last_message
    : '';

  if (mediaUrl || mediaType === 'image') {
    if (raw && !raw.startsWith('e2ee:')) {
      return `📷 Foto: ${raw}`;
    }
    return '📷 Foto';
  }

  if (!raw) {
    return 'Belum ada pesan';
  }
  if (raw.startsWith('e2ee:')) {
    return '🔒 Pesan terenkripsi';
  }
  return raw;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({ conversation, onPress }) => {
  const unreadCount = conversation.unread_count || 0;
  const hasUnread = unreadCount > 0;
  const timeFormatted = formatChatTime(
    typeof conversation.last_message === 'object'
      ? conversation.last_message.created_at
      : conversation.updated_at
  );
  const previewText = getMessagePreview(conversation);
  const displayName = getConversationName(conversation);
  const avatarUrl = conversation.avatar_url || conversation.peer_avatar_url;

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.container}
      onPress={() => onPress(conversation)}
    >
      <Avatar name={displayName} avatarUrl={avatarUrl} size={52} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <Text
            numberOfLines={1}
            style={[styles.name, hasUnread && styles.nameUnread]}
          >
            {displayName}
          </Text>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>
            {timeFormatted}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <Text
            numberOfLines={1}
            style={[styles.preview, hasUnread && styles.previewUnread]}
          >
            {previewText}
          </Text>

          {hasUnread && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadText}>
                {unreadCount > 99 ? '99+' : unreadCount}
              </Text>
            </View>
          )}
        </View>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    backgroundColor: colors.bgBase,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderSubtle,
  },
  content: {
    flex: 1,
    marginLeft: spacing.lg,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.xs,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    flex: 1,
    marginRight: spacing.sm,
  },
  nameUnread: {
    fontWeight: '700',
    color: colors.textPrimary,
  },
  time: {
    ...typography.caption,
    color: colors.textMuted,
  },
  timeUnread: {
    color: colors.accentPrimary,
    fontWeight: '600',
  },
  bottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  preview: {
    ...typography.bodySecondary,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewUnread: {
    color: colors.textPrimary,
    fontWeight: '500',
  },
  unreadBadge: {
    backgroundColor: colors.unreadBadgeBg,
    borderRadius: radius.full,
    minWidth: 20,
    height: 20,
    paddingHorizontal: 6,
    justifyContent: 'center',
    alignItems: 'center',
  },
  unreadText: {
    color: colors.unreadBadgeText,
    fontSize: 11,
    fontWeight: '700',
  },
});
