/**
 * WuzzChat Canonical API Types
 * Derived from docs/openapi.yaml (OpenAPI 3.1.0)
 */

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  status_message?: string;
  is_verified?: boolean;
  public_key?: string;
  created_at?: string;
}

export interface StartDirectChatRequest {
  target_user_id: string;
}

export interface StartDirectChatResponse {
  room_id: string;
}

export interface AuthTokenResponse {
  token: string;
  user: User;
  expires_in?: number;
}

export interface LoginRequest {
  username: string;
  password: string;
  device_id?: string;
  device_name?: string;
}

export interface RegisterRequest {
  username: string;
  password: string;
  display_name?: string;
  public_key?: string;
  key_version?: number;
}

export interface Message {
  id: string;
  room_id: string;
  sender_id: string;
  content: string;
  from?: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'system';
  created_at?: string;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  reply_to?: {
    id: string;
    nickname?: string;
    content?: string;
  };
}

export type ConversationItem = Conversation;

export interface Conversation {
  id: string;
  room_id?: string;
  title?: string;
  name?: string;
  type?: 'direct' | 'group' | 'subgroup';
  is_group?: boolean;
  is_subgroup?: boolean;
  avatar_url?: string;
  peer_id?: string;
  peer_nickname?: string;
  peer_avatar_url?: string;
  peer_public_key?: string;
  peer_is_verified?: boolean;
  last_message?: string | Message;
  last_sender?: string;
  last_sender_id?: string;
  last_status?: string;
  unread_count?: number;
  is_pinned?: boolean;
  pinned?: boolean;
  participants?: User[];
  updated_at?: string;
}

export interface ApiError {
  status: number;
  title: string;
  detail: string;
  code?: string;
}
