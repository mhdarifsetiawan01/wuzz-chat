/**
 * WuzzChat Mobile UI - ChatListItem Component
 * WhatsApp-grade conversation list row item with unread badge and preview.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Conversation, Message } from '../api/types';
import { colors, radius, spacing, typography } from '../theme';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { useAuth } from '../context';

interface ChatListItemProps {
  conversation: Conversation;
  onPress: (conversation: Conversation) => void;
  onLongPress?: (conversation: Conversation) => void;
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

function getMessagePreview(conversation: Conversation, currentUserId?: string): string {
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

  let body = '';
  if (
    mediaType === 'audio' ||
    (mediaUrl && /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(mediaUrl)) ||
    (lastMsg?.file_name && /\.(m4a|aac|mp3|wav|ogg|webm)$/i.test(lastMsg.file_name))
  ) {
    body = '🎙️ Pesan Suara';
  } else if (mediaUrl || mediaType === 'image') {
    body = raw && !raw.startsWith('e2ee:') ? `📷 Foto: ${raw}` : '📷 Foto';
  } else if (!raw) {
    body = 'Belum ada pesan';
  } else if (raw.startsWith('e2ee:')) {
    body = '🔒 Pesan terenkripsi';
  } else {
    body = raw;
  }

  const isGroup =
    conversation.is_group === true ||
    conversation.type === 'group' ||
    conversation.type === 'subgroup' ||
    (typeof conversation.id === 'string' && (conversation.id.startsWith('grp_') || conversation.id.startsWith('sub_')));

  if (isGroup && body !== 'Belum ada pesan') {
    const senderId = lastMsg?.sender_id || conversation.last_sender_id;
    const isSelf = Boolean(senderId && currentUserId && senderId === currentUserId);
    let senderName = '';
    if (isSelf) {
      senderName = 'Anda';
    } else {
      senderName =
        lastMsg?.nickname ||
        lastMsg?.from ||
        conversation.last_sender ||
        '';
    }
    if (senderName) {
      return `${senderName}: ${body}`;
    }
  }

  return body;
}

export const ChatListItem: React.FC<ChatListItemProps> = ({
  conversation,
  onPress,
  onLongPress,
}) => {
  const { user } = useAuth();
  const unreadCount = conversation.unread_count || 0;
  const hasUnread = unreadCount > 0;
  const timeFormatted = formatChatTime(
    typeof conversation.last_message === 'object'
      ? conversation.last_message.created_at
      : conversation.updated_at
  );
  const previewText = getMessagePreview(conversation, user?.id);
  const displayName = getConversationName(conversation);
  const avatarUrl = conversation.avatar_url || conversation.peer_avatar_url;
  const isGroup =
    conversation.is_group === true ||
    conversation.type === 'group' ||
    conversation.type === 'subgroup' ||
    (typeof conversation.id === 'string' && (conversation.id.startsWith('grp_') || conversation.id.startsWith('sub_')));

  const isPinned = Boolean(conversation.is_pinned || conversation.pinned);

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      style={styles.container}
      onPress={() => onPress(conversation)}
      onLongPress={onLongPress ? () => onLongPress(conversation) : undefined}
      delayLongPress={300}
    >
      <Avatar name={displayName} avatarUrl={avatarUrl} size={52} isGroup={isGroup} />

      <View style={styles.content}>
        <View style={styles.topRow}>
          <View style={styles.nameContainer}>
            <Text
              numberOfLines={1}
              style={[styles.name, hasUnread && styles.nameUnread]}
            >
              {displayName}
            </Text>
            {conversation.peer_is_verified && <VerifiedBadge size={14} />}
          </View>
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

          <View style={styles.rightBadges}>
            {isPinned && <Text style={styles.pinIcon}>📌</Text>}
            {hasUnread && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadText}>
                  {unreadCount > 99 ? '99+' : unreadCount}
                </Text>
              </View>
            )}
          </View>
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
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
    gap: 4,
  },
  name: {
    ...typography.body,
    fontWeight: '600',
    flexShrink: 1,
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
  rightBadges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pinIcon: {
    fontSize: 13,
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
