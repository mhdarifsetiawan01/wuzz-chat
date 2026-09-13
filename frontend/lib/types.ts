// Tipe pesan yang dipertukarkan — sinkron dengan backend Go (internal/ws/message.go)
export type MessageType = 'join' | 'message' | 'typing' | 'receipt' | 'reaction' | 'leave' | 'system' | 'history' | 'room_users' | 'message_deleted'

export type MessageReceiptStatus = 'pending' | 'sent' | 'delivered' | 'read'

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
  isSelf?: boolean
}

export interface Message {
  id?: string
  type: MessageType
  from?: string
  to?: string
  room?: string
  nickname?: string
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
  messages?: Message[]   // Digunakan saat type = 'history'
  users?: RoomUser[]     // Digunakan saat type = 'room_users'
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
}

export interface ConversationItem {
  id: string
  type: string
  title: string
  peer_id?: string
  peer_nickname?: string
  peer_public_key?: string
  last_message?: string
  last_sender?: string
  last_status?: MessageReceiptStatus
  unread_count?: number
  updated_at: string
}


