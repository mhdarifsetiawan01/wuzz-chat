import type { RootStackParamList } from '../navigation/types';

export function sourceChatParams(groupId: string, groupTitle: string, forumId: string, messageId: string, title?: string): RootStackParamList['Chat'] | null {
  if (!groupId.startsWith('grp_') || !forumId.startsWith('sub_') || !messageId.trim()) return null;
  return {
    conversation: { id: forumId, room_id: forumId, title: title || 'Forum', type: 'group', is_group: true, is_subgroup: true, parent_id: groupId },
    parentGroupConversation: { id: groupId, room_id: groupId, title: groupTitle, type: 'group', is_group: true },
    fromForumBubble: true,
    sourceMessageId: messageId,
  };
}
