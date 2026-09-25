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
  nickname?: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'system';
  created_at?: string;
  timestamp?: string;
  status?: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  reply_to?: {
    id: string;
    nickname?: string;
    content?: string;
    media_url?: string;
    media_type?: string;
  };
  is_encrypted?: boolean;
  media_url?: string;
  media_type?: string;
  file_name?: string;
  file_size?: number;
  media_status?: string;
  reactions?: {
    emoji: string;
    users: string[];
    count: number;
  }[];
  is_deleted?: boolean;
}

export interface MediaUploadResponse {
  url: string;
  file_name: string;
  file_size: number;
  media_type: string;
  mime_type: string;
}

export interface MediaAckRequest {
  message_id: string;
  room_id?: string;
}

export interface MediaAckResponse {
  status: string;
  media_status: string;
}

export interface PublicKeyResponse {
  user_id?: string;
  public_key?: string;
}

export interface UpdatePublicKeyResponse {
  status: string;
  message?: string;
  public_key?: string;
  key_version?: number;
}

export type ConversationItem = Conversation;

export interface Conversation {
  id: string;
  room_id?: string;
  title?: string;
  name?: string;
  description?: string;
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
  member_count?: number;
  my_role?: GroupRole;
  is_pinned?: boolean;
  pinned?: boolean;
  participants?: User[];
  updated_at?: string;
}

export type GroupRole = 'creator' | 'admin' | 'member';

export interface GroupMember {
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  role: GroupRole;
  is_verified?: boolean;
  joined_at: string;
}

export interface GroupDetails {
  id: string;
  title: string;
  description?: string;
  avatar_url?: string;
  is_public: boolean;
  group_username?: string;
  parent_id?: string;
  created_by: string;
  created_at: string;
  updated_at?: string;
  member_count: number;
  my_role?: GroupRole;
  members?: GroupMember[];
}

export interface CreateGroupRequest {
  title: string;
  description?: string;
  avatar_url?: string;
  is_public?: boolean;
  group_username?: string;
  member_ids?: string[];
}

export interface CreateGroupResponse {
  success: boolean;
  group: GroupDetails;
  message?: string;
}

export interface ApiError {
  status: number;
  title: string;
  detail: string;
  code?: string;
}

