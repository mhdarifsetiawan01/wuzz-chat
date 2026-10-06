/**
 * WuzzChat Canonical API Types
 * Derived from docs/openapi.yaml (OpenAPI 3.1.0)
 */

export interface SocialLinks {
  instagram?: string;
  youtube?: string;
  linkedin?: string;
  tiktok?: string;
  [key: string]: string | undefined;
}

export interface UserPrivacySettings {
  allow_direct_messages?: 'everyone' | 'friends';
  allow_calls?: 'everyone' | 'friends';
  [key: string]: any;
}

export interface UserMetadata {
  bio?: string;
  role?: string;
  location?: string;
  website?: string;
  banner_url?: string;
  social_links?: SocialLinks;
  privacy?: UserPrivacySettings;
  [key: string]: any;
}

export interface User {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  status_message?: string;
  bio?: string;
  role?: string;
  system_role?: 'wuzz_admin' | 'wuzz_moderator' | 'user' | string;
  metadata?: UserMetadata;
  is_verified?: boolean;
  is_private_account?: boolean;
  public_key?: string;
  created_at?: string;
  last_seen?: string;
  /** Hanya ada pada respons GET /api/auth/me: akun sudah punya akun Google tertaut. */
  google_linked?: boolean;
  /** Hanya ada pada respons GET /api/auth/me: false = akun Google-only (tanpa password). */
  has_password?: boolean;
  /** RFC3339: akun belum tertaut diminta menautkan Google sebelum waktu ini (hanya ada bila server mengumumkannya). */
  google_link_required_by?: string;
  /** true bila akun dibekukan: belum menautkan Google setelah batas waktu (hanya ada dari server saat pembekuan aktif). */
  google_link_frozen?: boolean;
}

export interface UpdateProfileRequest {
  display_name?: string;
  status_message?: string;
  avatar_url?: string;
  bio?: string;
  role?: string;
  metadata?: UserMetadata;
  is_private_account?: boolean;
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
  /** false = akun Google-only: aksi sensitif (hapus akun, reset kunci) harus memakai re-auth Google. */
  has_password?: boolean;
  google_linked?: boolean;
  google_link_required_by?: string;
  google_link_frozen?: boolean;
}

export interface LoginRequest {
  username: string;
  password: string;
  device_id?: string;
  device_name?: string;
  confirm_override?: boolean;
  kick_device_id?: string;
}

/** Perangkat yang dikirim pada semua endpoint login Google (opsional bila memakai header X-Device-ID). */
export interface GoogleDeviceFields {
  device_id?: string;
  confirm_override?: boolean;
  kick_device_id?: string;
}

/** Respons POST /api/auth/google bila akun Google belum tertaut ke akun Wuzz mana pun (HTTP 200). */
export interface GoogleNotLinkedResponse {
  code: 'GOOGLE_NOT_LINKED';
  link_token: string;
  email?: string;
  expires_in: number;
}

/** Hasil POST /api/auth/google: sesi penuh atau permintaan melanjutkan pendaftaran/penautan. */
export type GoogleSignInResponse = AuthTokenResponse | GoogleNotLinkedResponse;

export interface GoogleRegisterRequest extends GoogleDeviceFields {
  link_token: string;
  username: string;
  display_name?: string;
}

export interface GoogleLinkRequest extends GoogleDeviceFields {
  link_token: string;
  username: string;
  password: string;
}

/** Bukti kepemilikan untuk aksi sensitif: password ATAU ID token Google yang baru diterbitkan (maks 5 menit). */
export type OwnershipProof = { password: string } | { googleIdToken: string };

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
  type?: 'text' | 'image' | 'video' | 'file' | 'audio' | 'system';
  created_at?: string;
  timestamp?: string;
  local_media_uri?: string;
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
  reactions?: ReactionItem[];
  is_deleted?: boolean;
  is_edited?: boolean;
  edited_at?: string;
  is_forwarded?: boolean;
  is_pinned?: boolean;
  /** True bila dekripsi E2EE gagal setelah semua retry (kunci tidak berhasil didapat) */
  decrypt_failed?: boolean;
  pinned_at?: string;
}

export interface ReactionItem {
  emoji: string;
  users: string[];
  count: number;
}

/**
 * Normalizes reactions from any wire format (array, JSON string, null)
 * into a safe, valid ReactionItem array.
 */
export function normalizeReactions(raw: any): ReactionItem[] {
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw.map((r: any) => ({
      emoji: typeof r?.emoji === 'string' ? r.emoji : '👍',
      count: typeof r?.count === 'number' ? r.count : (Array.isArray(r?.users) ? r.users.length : 1),
      users: Array.isArray(r?.users) ? r.users.filter((u: any) => typeof u === 'string') : [],
    }));
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed || trimmed === '[]' || trimmed === '{}') return [];
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) {
        return parsed.map((r: any) => ({
          emoji: typeof r?.emoji === 'string' ? r.emoji : '👍',
          count: typeof r?.count === 'number' ? r.count : (Array.isArray(r?.users) ? r.users.length : 1),
          users: Array.isArray(r?.users) ? r.users.filter((u: any) => typeof u === 'string') : [],
        }));
      }
    } catch {
      return [];
    }
  }
  return [];
}


export interface MediaUploadResponse {
  url: string;
  file_name: string;
  file_size: number;
  media_type: string;
  mime_type: string;
}

export interface SignedUploadTicketRequest {
  file_name: string;
  file_size: number;
  mime_type: string;
}

export interface SignedUploadTicketResponse {
  signed_url: string;
  public_url: string;
  object_key: string;
  token: string;
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

export interface ActiveDeviceItem {
  id: string;
  name: string;
  platform: string;
  user_agent?: string;
  last_seen_at?: string;
  created_at?: string;
}

export interface ApiError {
  status: number;
  title: string;
  detail: string;
  code?: string;
  data?: any;
  active_devices?: ActiveDeviceItem[];
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

/** Milestone 8.3: Edit Message Request/Response */
export interface EditMessageRequest {
  message_id: string;
  content: string;
}

export interface EditMessageResponse {
  success: boolean;
  message_id: string;
  room_id: string;
  content: string;
  is_edited: boolean;
  edited_at: string;
}

/** Milestone 8.3: Forward Message Request/Response */
export interface ForwardMessageRequest {
  message_id: string;
  target_room_ids: string[];
  plaintext_content?: string;
}

export interface ForwardMessageResponse {
  success: boolean;
  forwarded_count: number;
  messages: Array<{
    id: string;
    room: string;
    from: string;
    content: string;
    is_forwarded: boolean;
    timestamp: string;
  }>;
}

/** Milestone 8.3: Pin Message Request/Response */
export interface PinMessageRequest {
  message_id: string;
  room_id: string;
}

export interface PinMessageResponse {
  success: boolean;
  message_id: string;
  room_id: string;
  is_pinned: boolean;
}

/** Milestone 8.3: Pinned Message Entity */
export interface PinnedMessage {
  id: string;
  conversation_id: string;
  message_id: string;
  pinned_by: string;
  pinned_at: string;
  expires_at?: string;
  message?: Message;
}

/** Milestone 8.3: Pin Conversation Request/Response */
export interface PinConversationRequest {
  room_id: string;
}

export interface PinConversationResponse {
  success: boolean;
  room_id: string;
  is_pinned: boolean;
}

/** Milestone M-Mobile-9.3: Community Social Feed Types */
export interface FeedAuthor {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  role?: string;
  system_role?: string;
  is_verified?: boolean;
}

export type FeedPostType = 'standard' | 'announcement' | 'article' | 'sponsored' | string;
export type FeedTabKey = 'latest' | 'explore';

export interface FeedPost {
  id: string;
  tenant_id: string;
  user_id?: string;
  content: string;
  media_urls?: string[];
  post_type: FeedPostType;
  is_pinned: boolean;
  metadata?: Record<string, any>;
  likes_count: number;
  comments_count: number;
  is_liked: boolean;
  author: FeedAuthor;
  created_at: string;
  updated_at: string;
}

export interface FeedComment {
  id: string;
  tenant_id: string;
  post_id: string;
  user_id?: string;
  content: string;
  author: FeedAuthor;
  created_at: string;
}

export interface FeedTimelineResponse {
  posts: FeedPost[];
  next_cursor?: string;
  has_more: boolean;
}

export interface FeedCommentsResponse {
  comments: FeedComment[];
  next_cursor?: string;
  has_more: boolean;
}

export interface FeedLikeResponse {
  liked: boolean;
  likes_count: number;
}

export interface CreateFeedPostRequest {
  content: string;
  media_urls?: string[];
  post_type?: FeedPostType;
  is_pinned?: boolean;
  metadata?: Record<string, any>;
}

export interface CreateFeedCommentRequest {
  content: string;
}

// =========================================================================
// USER CONNECTIONS & FRIENDLIST (Milestone M-Mobile-10)
// =========================================================================
export type ConnectionStatus = 'none' | 'pending' | 'accepted' | 'declined' | 'blocked';
export type ConnectionSourceType = 'in_app_request' | 'phone_contact';

export interface UserConnection {
  id: string;
  tenant_id: string;
  requester_id: string;
  receiver_id: string;
  status: ConnectionStatus;
  source_type: ConnectionSourceType;
  created_at: string;
  updated_at: string;
}

export interface FriendItem {
  id: string;
  username: string;
  display_name: string;
  avatar_url?: string;
  status_message?: string;
  bio?: string;
  role?: string;
  is_verified?: boolean;
  is_private_account?: boolean;
  connection_id: string;
  connected_at: string;
}

export interface PendingRequestItem {
  id: string;
  requester_id: string;
  receiver_id: string;
  direction: 'incoming' | 'outgoing';
  status: ConnectionStatus;
  source_type: ConnectionSourceType;
  peer_id: string;
  peer_username: string;
  peer_display_name: string;
  peer_avatar_url?: string;
  peer_is_verified?: boolean;
  created_at: string;
  updated_at: string;
}

export interface FriendsListResponse {
  friends: FriendItem[];
  next_cursor?: string;
  has_more: boolean;
}

export interface ConnectionStatusResponse {
  status: ConnectionStatus;
  direction?: 'incoming' | 'outgoing' | '';
  connection_id?: string;
  is_private_account: boolean;
  can_message: boolean;
  can_call: boolean;
  blocked_by_me?: boolean;
  blocked_by_them?: boolean;
}

// =========================================================================
// LINK PREVIEW (OpenGraph / oEmbed)
// =========================================================================
export interface LinkPreview {
  url: string;
  title: string;
  description?: string;
  image?: string;
  site_name?: string;
  favicon?: string;
}



