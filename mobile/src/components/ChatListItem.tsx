/**
 * WuzzChat Mobile UI - ChatListItem Component
 * WhatsApp-grade conversation list row item with unread badge and preview.
 */

import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Conversation, Message } from '../api/types';
import { colors, radius, spacing, typography } from '../theme';
import { IconText } from './IconText';
import { Avatar } from './Avatar';
import { VerifiedBadge } from './VerifiedBadge';
import { useAuth } from '../context';
import { parseSharedPost } from '../utils/feedShare';

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
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) {
    return 'now';
  }
  if (diffMins < 60) {
    return `${diffMins}m ago`;
  }
  if (diffHours < 24) {
    return `${diffHours}h ago`;
  }
  if (diffDays < 7) {
    return `${diffDays}d ago`;
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
  } else if (parseSharedPost(raw)) {
    body = '📢 Postingan Komunitas';
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

const ChatListItemComponent: React.FC<ChatListItemProps> = ({
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
      style={[styles.rowContainer, hasUnread && styles.rowUnread]}
      onPress={() => onPress(conversation)}
      onLongPress={onLongPress ? () => onLongPress(conversation) : undefined}
      delayLongPress={300}
    >
      <Avatar
        name={displayName}
        avatarUrl={avatarUrl}
        size={54}
        isGroup={isGroup}
        shape="circle"
        unreadCount={unreadCount}
      />

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
            {isGroup && (
              <View style={styles.groupTypeTag}>
                <Text style={styles.groupTypeTagText}>Group</Text>
              </View>
            )}
          </View>
          <Text style={[styles.time, hasUnread && styles.timeUnread]}>
            {timeFormatted}
          </Text>
        </View>

        <View style={styles.bottomRow}>
          <IconText
            numberOfLines={1}
            style={[styles.preview, hasUnread && styles.previewUnread]}
          >
            {previewText}
          </IconText>

          {isPinned && <IconText style={styles.pinIcon}>📌</IconText>}
        </View>
      </View>
    </TouchableOpacity>
  );
};

// Memoized: baris hanya re-render bila conversation/callback berubah
export const ChatListItem = React.memo(ChatListItemComponent);

const styles = StyleSheet.create({
  rowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 20,
    backgroundColor: '#ffffff',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  rowUnread: {
    backgroundColor: '#fbfdff',
  },
  content: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: spacing.sm,
    gap: 4,
  },
  name: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textPrimary,
    flexShrink: 1,
    letterSpacing: -0.2,
  },
  nameUnread: {
    fontWeight: '700',
    color: '#0f172a',
  },
  groupTypeTag: {
    backgroundColor: colors.tintAccent10,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  groupTypeTagText: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.accentPrimary,
  },
  time: {
    fontSize: 13,
    fontWeight: '400',
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
    fontSize: 14,
    lineHeight: 20,
    color: colors.textSecondary,
    flex: 1,
    marginRight: spacing.sm,
  },
  previewUnread: {
    color: '#334155',
    fontWeight: '500',
  },
  pinIcon: {
    fontSize: 12,
    marginLeft: 4,
  },
});
