/** Push data is a navigation hint; destination APIs enforce membership, role and tenant. */
export type RoomNotificationTarget = {
  type: 'room';
  roomId: string | null;
  isGroup: boolean;
  senderId: string | null;
  title: string | null;
  senderPublicKey: string | null;
  isCall: boolean;
  callId: string | null;
  callerNickname: string | null;
  sdp: string | null;
};
export type MemoryNotificationTarget = {
  type: 'memory_draft_ready'; groupId: string; forumId: string; draftId: string;
};
export type NotificationTarget = RoomNotificationTarget | MemoryNotificationTarget;
const value = (v: unknown): string | null => typeof v === 'string' && v.trim() ? v.trim() : null;

export function parseNotificationTarget(data?: Record<string, unknown>): NotificationTarget | null {
  if (!data) return null;
  if (data.type === 'memory_draft_ready') {
    const groupId = value(data.group_id), forumId = value(data.forum_id), draftId = value(data.draft_id);
    if (!groupId?.startsWith('grp_') || !forumId?.startsWith('sub_') || !draftId) return null;
    return { type: 'memory_draft_ready', groupId, forumId, draftId };
  }
  const roomId = value(data.room_id);
  if (!roomId) return null;
  const title = value(data.sender_nickname) || value(data.caller_nickname);
  return {
    type: 'room', roomId, title,
    isGroup: roomId.startsWith('grp_') || roomId.startsWith('sub_'),
    senderId: value(data.sender_id) || value(data.caller_id),
    senderPublicKey: value(data.sender_public_key),
    isCall: data.type === 'call_incoming' || data.is_call === true || data.is_call === 'true',
    callId: value(data.call_id), callerNickname: value(data.caller_nickname) || title, sdp: value(data.sdp),
  };
}

/** Keep taps received before NavigationContainer.onReady; dispose on session change. */
export function createNotificationNavigationQueue(
  isReady: () => boolean,
  navigate: (target: NotificationTarget) => void,
) {
  let active = true;
  const pending: NotificationTarget[] = [];
  return {
    enqueue(target: NotificationTarget) {
      if (!active) return;
      if (isReady()) navigate(target);
      else pending.push(target);
    },
    flush() {
      if (!active || !isReady()) return;
      while (pending.length) navigate(pending.shift()!);
    },
    dispose() { active = false; pending.length = 0; },
  };
}
