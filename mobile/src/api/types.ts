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
  /** M-Mobile-8.2B: Parent group ID for sub-group (forum topic) rooms */
  parent_id?: string;
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

// ─── Sub-Groups / Forum Topics (Milestone 8.2B) ────────────────────────────

/** Duration options for ephemeral forum topics. */
export type SubGroupTTL = '7_days' | '30_days';

/** Lifecycle status for a forum topic. */
export type SubGroupStatus = 'active' | 'expired';

/**
 * A forum topic (ephemeral sub-group) nested under a parent group.
 * ID format: `sub_<UUIDv4>`; parent format: `grp_<UUIDv4>`.
 */
export interface SubGroup {
  /** Immutable ID: "sub_<UUIDv4>" */
  id: string;
  /** Immutable parent group ID: "grp_<UUIDv4>" */
  parent_id: string;
  title: string;
  description?: string;
  /** true = 🌐 Terbuka (anyone in parent can join directly) */
  is_public: boolean;
  status: SubGroupStatus;
  /** ISO 8601 expiry timestamp */
  expires_at: string;
  /** UUID of creator — immutable, never mutable display_name */
  created_by: string;
  created_at: string;
  member_count: number;
  my_role?: GroupRole;
  /** Whether the current user is already a member */
  is_member?: boolean;
  /** Whether the current user has a pending join-request */
  has_pending_request?: boolean;
}

/** Payload for creating a new forum topic. */
export interface CreateSubGroupRequest {
  title: string;
  description?: string;
  /** Expiry duration. Default: '7_days'. */
  ttl: SubGroupTTL;
  /** Access control: true = public, false = private (requires join-request). */
  is_public: boolean;
}

/** Response envelope for creating a sub-group. */
export interface CreateSubGroupResponse {
  success: boolean;
  group: SubGroup;
  message?: string;
}

/** A pending join-request for a private forum topic. */
export interface JoinRequest {
  id: string;
  conversation_id: string;
  /** UUID of requester — immutable */
  user_id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}

