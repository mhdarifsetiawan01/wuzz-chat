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
};
