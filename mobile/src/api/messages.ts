/**
 * WuzzChat Messages API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import { Message } from './types';

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
   * PUT /api/messages
   * Edits message content within the allowable time window.
   */
  async editMessage(messageId: string, roomId: string, content: string): Promise<Message> {
    return apiClient<Message>('/api/messages', {
      method: 'PUT',
      body: JSON.stringify({
        message_id: messageId,
        room_id: roomId,
        content,
      }),
    });
  },

  /**
   * DELETE /api/messages
   * Deletes a message for everyone in the room.
   */
  async deleteMessage(messageId: string, roomId: string): Promise<{ status: string }> {
    return apiClient<{ status: string }>('/api/messages', {
      method: 'DELETE',
      body: JSON.stringify({
        message_id: messageId,
        room_id: roomId,
      }),
    });
  },
};
