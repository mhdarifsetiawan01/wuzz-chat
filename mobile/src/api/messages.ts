/**
 * WuzzChat Messages API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import {
  Message,
  PinnedMessage,
  EditMessageResponse,
  ForwardMessageResponse,
  PinMessageResponse,
} from './types';

export const messagesApi = {
  /**
   * GET /api/messages
   * Retrieves message history for a specific room.
   */
  async getMessages(roomId: string, limit = 50, before?: string): Promise<Message[]> {
    let endpoint = `/api/messages?room_id=${encodeURIComponent(roomId)}&limit=${limit}`;
    if (before) {
      endpoint += `&before=${encodeURIComponent(before)}`;
    }

    return apiClient<Message[]>(endpoint, {
      method: 'GET',
    });
  },

  /**
   * PUT /api/messages/edit
   * Edits message content within the allowable 15-minute time window.
   */
  async editMessage(messageId: string, content: string, roomId?: string): Promise<EditMessageResponse> {
    return apiClient<EditMessageResponse>('/api/messages/edit', {
      method: 'PUT',
      body: JSON.stringify({
        message_id: messageId,
        content,
        ...(roomId ? { room_id: roomId } : {}),
      }),
    });
  },

  /**
   * POST /api/messages/forward
   * Forwards a message to 1-5 target rooms with optional decrypted plaintext override.
   */
  async forwardMessage(
    messageId: string,
    targetRoomIds: string[],
    plaintextContent?: string
  ): Promise<ForwardMessageResponse> {
    return apiClient<ForwardMessageResponse>('/api/messages/forward', {
      method: 'POST',
      body: JSON.stringify({
        message_id: messageId,
        target_room_ids: targetRoomIds,
        ...(plaintextContent ? { plaintext_content: plaintextContent } : {}),
      }),
    });
  },

  /**
   * POST /api/messages/pin
   * Pins a message in a conversation (max 3 pinned messages per room).
   */
  async pinMessage(messageId: string, roomId: string): Promise<PinMessageResponse> {
    return apiClient<PinMessageResponse>('/api/messages/pin', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: roomId,
        room_id: roomId,
        message_id: messageId,
        id: messageId,
        duration_hours: 0,
      }),
    });
  },

  /**
   * POST /api/messages/unpin
   * Unpins a message in a conversation.
   */
  async unpinMessage(messageId: string, roomId: string): Promise<PinMessageResponse> {
    return apiClient<PinMessageResponse>('/api/messages/unpin', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: roomId,
        room_id: roomId,
        message_id: messageId,
        id: messageId,
      }),
    });
  },

  /**
   * GET /api/messages/pinned
   * Retrieves pinned messages for a specific conversation.
   */
  async getPinnedMessages(conversationId: string): Promise<PinnedMessage[]> {
    const res = await apiClient<{ success?: boolean; pinned?: PinnedMessage[] } | PinnedMessage[]>(
      `/api/messages/pinned?room_id=${encodeURIComponent(conversationId)}&conversation_id=${encodeURIComponent(conversationId)}`,
      {
        method: 'GET',
      }
    );
    if (Array.isArray(res)) {
      return res;
    }
    if (res && Array.isArray((res as any).pinned)) {
      return (res as any).pinned;
    }
    return [];
  },

  /**
   * GET /api/messages/search
   * Searches for text messages within an active conversation.
   */
  async searchMessages(conversationId: string, query: string): Promise<Message[]> {
    const res = await apiClient<{ success?: boolean; messages?: Message[] } | Message[]>(
      `/api/messages/search?room_id=${encodeURIComponent(conversationId)}&conversation_id=${encodeURIComponent(conversationId)}&q=${encodeURIComponent(query)}`,
      {
        method: 'GET',
      }
    );
    if (Array.isArray(res)) {
      return res;
    }
    if (res && Array.isArray((res as any).messages)) {
      return (res as any).messages;
    }
    return [];
  },

  /**
   * DELETE /api/messages
   * Deletes a message (for_me or for_everyone).
   */
  async deleteMessage(
    messageId: string,
    roomId: string,
    type: 'for_me' | 'for_everyone' = 'for_everyone'
  ): Promise<{ status: string }> {
    return apiClient<{ status: string }>('/api/messages', {
      method: 'DELETE',
      body: JSON.stringify({
        message_id: messageId,
        room_id: roomId,
        type,
        delete_for_everyone: type === 'for_everyone',
      }),
    });
  },
};
