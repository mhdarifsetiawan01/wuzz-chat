/**
 * WuzzChat Conversations API Endpoints
 * Conforms to docs/openapi.yaml
 */

import { apiClient } from './client';
import { Conversation } from './types';

export const conversationsApi = {
  /**
   * GET /api/conversations
   * Retrieves active direct and group conversations for the authenticated user.
   */
  async getConversations(): Promise<Conversation[]> {
    return apiClient<Conversation[]>('/api/conversations', {
      method: 'GET',
    });
  },

  /**
   * POST /api/conversations
   * Resolves or initiates a 1-on-1 direct conversation.
   */
  async startDirectConversation(recipientId: string): Promise<Conversation> {
    return apiClient<Conversation>('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ recipient_id: recipientId }),
    });
  },

  /**
   * POST /api/conversations/pin
   * Pins a conversation to the top of the chat list for the user.
   */
  async pinConversation(roomId: string): Promise<{ success: boolean; conversation_id: string; is_pinned: boolean }> {
    return apiClient<{ success: boolean; conversation_id: string; is_pinned: boolean }>('/api/conversations/pin', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: roomId,
        room_id: roomId,
        id: roomId,
      }),
    });
  },

  /**
   * POST /api/conversations/unpin
   * Unpins a conversation from the top of the chat list for the user.
   */
  async unpinConversation(roomId: string): Promise<{ success: boolean; conversation_id: string; is_pinned: boolean }> {
    return apiClient<{ success: boolean; conversation_id: string; is_pinned: boolean }>('/api/conversations/unpin', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: roomId,
        room_id: roomId,
        id: roomId,
      }),
    });
  },
};
