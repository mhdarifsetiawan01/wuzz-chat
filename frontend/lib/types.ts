// Tipe pesan yang dipertukarkan — sinkron dengan backend Go (internal/ws/message.go)
export type MessageType =
  | 'join'
  | 'message'
  | 'typing'
  | 'receipt'
  | 'reaction'
  | 'leave'
  | 'system'
  | 'history'
  | 'room_users'
  | 'message_deleted'
  | 'message_edited'
  | 'message_pinned'
  | 'message_unpinned'
  | 'ack'
  | 'join_request'
  | 'call_offer'
  | 'call_answer'
  | 'ice_candidate'
  | 'call_reject'
  | 'call_end'
  | 'call_busy'

export type MessageReceiptStatus = 'pending' | 'sent' | 'delivered' | 'read'

export type CallStatus = 'idle' | 'outgoing_ringing' | 'incoming_ringing' | 'connecting' | 'connected' | 'ended'

export interface ActiveCallInfo {
  room: string
  peerId: string
  peerNickname: string
  mediaType: 'audio' | 'video'
  isCaller: boolean
  status: CallStatus
  startTime?: number
}

export interface ReplyTarget {
  id: string
  nickname: string
  content: string
}

export interface ReactionItem {
  emoji: string
  users: string[]
  count: number
}

export interface ReactionPayload {
  message_id: string
  emoji: string
}

export interface RoomUser {
  id: string
  username?: string
  display_name?: string
  nickname: string
  avatar_url?: string
  is_verified?: boolean
  isSelf?: boolean
}

export interface Message {
  id?: string
  request_id?: string
  type: MessageType
  from?: string
  sender_id?: string
  to?: string
  room?: string
  nickname?: string
  avatar_url?: string
  content?: string
  raw_content?: string
  timestamp?: string
  status?: MessageReceiptStatus
  reply_to?: ReplyTarget
  reactions?: ReactionItem[]
  reaction?: ReactionPayload
  media_url?: string
  media_type?: 'image' | 'audio' | 'video' | 'document' | string
  file_name?: string
  file_size?: number
  media_status?: 'active' | 'downloaded' | 'expired' | string
  is_deleted?: boolean
  is_edited?: boolean
  edited_at?: string
  is_forwarded?: boolean
  new_content?: string
  pinned?: PinnedMessage
  mentions?: string[]    // User UUIDs yang di-mention
  sdp?: string
  candidate?: string
  since?: string         // Timestamp ISO8601 checkpoint untuk delta offline sync
  messages?: Message[]   // Digunakan saat type = 'history'
  users?: RoomUser[]     // Digunakan saat type = 'room_users'
}

export interface PinnedMessage {
  id: string
  conversation_id: string
  message_id: string
  pinned_by: string
  pinned_at: string
  expires_at?: string
  message?: Message
}

export interface AppConfig {
  media_upload_enabled: boolean
  max_file_size_mb: number
  storage_driver: string
  media_retention_days?: number
  auto_delete_on_download?: boolean
}

export interface LinkPreview {
  url: string
  title?: string
  description?: string
  image?: string
  site_name?: string
  favicon?: string
}

export interface MediaUploadResponse {
  url: string
  file_name: string
  file_size: number
  media_type: 'image' | 'audio' | 'video' | 'document' | string
  mime_type: string
}

// Status koneksi WebSocket
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Info sesi client setelah join berhasil
export interface SessionInfo {
  clientId: string
  nickname: string
  peerId?: string
}

export interface User {
  id: string
  username: string
  display_name: string
  status_message?: string
  avatar_url?: string
  public_key?: string
  created_at?: string
  is_verified?: boolean
}

export type GroupRole = 'creator' | 'admin' | 'member'

export interface GroupMember {
  user_id: string
  username: string
  display_name: string
  avatar_url?: string
  role: GroupRole
  is_verified?: boolean
  joined_at: string
}

export interface GroupDetails {
  id: string
  title: string
  name?: string
  description?: string
  avatar_url?: string
  is_public: boolean
  group_username?: string
  parent_id?: string
  created_by: string
  created_at: string
  updated_at: string
  member_count: number
  my_role?: GroupRole
  status?: 'active' | 'expired' | 'archived' | string
  expires_at?: string
  ai_summary?: string
  members?: GroupMember[]
}

export interface SubGroupItem {
  id: string
  parent_id: string
  title: string
  description: string
  member_count: number
  expires_at: string | null
  remaining_seconds: number
  created_by: string
  created_at: string
  status: 'active' | 'expired' | 'archived' | string
  is_member?: boolean
  is_public?: boolean
  has_pending_request?: boolean
  pending_requests_count?: number
}

export interface JoinRequestItem {
  id: string
  conversation_id: string
  user_id: string
  username: string
  display_name: string
  avatar_url?: string
  is_verified?: boolean
  status: 'pending' | 'approved' | 'rejected'
  created_at: string
}

export interface ConversationItem {
  id: string
  type: string
  title: string
  avatar_url?: string
  description?: string
  is_public?: boolean
  group_username?: string
  parent_id?: string
  status?: 'active' | 'expired' | 'archived' | string
  expires_at?: string
  role?: string
  peer_id?: string
  peer_nickname?: string
  peer_public_key?: string
  peer_is_verified?: boolean
  peer_avatar_url?: string
  last_message?: string
  last_sender?: string
  last_sender_id?: string
  last_status?: MessageReceiptStatus
  unread_count?: number
  is_pinned?: boolean
  pinned_at?: string
  updated_at: string
}

// =============================================================================
// Group Memory AI Types (Milestone 10)
// =============================================================================

export type MemoryConfidence = 'HIGH' | 'MEDIUM' | 'LOW'

export interface ArtifactEvidenceItem {
  id: string
  artifact_id?: string
  message_id: string
  message_preview: string
  message_sender_name: string
  message_sent_at: string
  created_at?: string
}

export interface MemoryArtifactItem {
  id: string
  draft_id: string
  type: 'SUMMARY' | 'DECISION' | 'JOURNEY_LITE'
  content: string
  ai_original_content?: string
  confidence: MemoryConfidence
  is_human_edited: boolean
  is_removed: boolean
  position?: number
  created_at: string
  updated_at: string
  evidences?: ArtifactEvidenceItem[]
}

export interface MemoryDraftDetail {
  id: string
  job_id: string
  forum_id: string
  forum_title?: string
  group_id: string
  status: 'DRAFT' | 'APPROVED' | 'REJECTED'
  message_count_processed: number
  was_truncated: boolean
  truncation_note?: string
  reviewed_at?: string
  reviewed_by?: string
  rejection_reason?: string
  created_at: string
  artifacts: MemoryArtifactItem[]
}

export interface MemoryDraftListItem {
  draft_id: string
  forum_id: string
  forum_title: string
  group_id: string
  status: string
  message_count_processed: number
  was_truncated: boolean
  artifact_count: number
  created_at: string
}

export interface ApprovedEvidenceItem {
  message_id: string
  preview: string
  sender_name: string
  sent_at: string
}

export interface ApprovedDecisionItem {
  position: number
  text: string
  confidence: MemoryConfidence
  is_human_edited?: boolean
  evidences: ApprovedEvidenceItem[]
}

export interface ApprovedMemoryListItem {
  id: string
  forum_id: string
  forum_title: string
  group_id: string
  approved_by: string
  approved_by_name: string
  approved_at: string
  has_human_edits: boolean
  snapshot_summary: string
  snapshot_summary_conf: MemoryConfidence
  decision_count: number
  has_journey_lite: boolean
  is_journey_lite_removed: boolean
}

export interface ApprovedMemoryDetail {
  id: string
  draft_id: string
  forum_id: string
  forum_title: string
  group_id: string
  approved_by: string
  approved_by_name: string
  approved_at: string
  has_human_edits: boolean
  snapshot_summary: string
  snapshot_summary_conf: MemoryConfidence
  snapshot_decisions: ApprovedDecisionItem[]
  snapshot_journey_lite?: string
  snapshot_journey_conf?: MemoryConfidence
  is_journey_lite_removed: boolean
  created_at: string
}
