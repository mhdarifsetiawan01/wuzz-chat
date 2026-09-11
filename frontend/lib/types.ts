// Tipe pesan yang dipertukarkan — harus sinkron dengan backend Go (internal/ws/message.go)
export type MessageType = 'join' | 'message' | 'typing' | 'leave' | 'system'

export interface Message {
  type: MessageType
  from?: string
  to?: string
  nickname?: string
  content?: string
  timestamp?: string
}

// Status koneksi WebSocket
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Info sesi client setelah join berhasil
export interface SessionInfo {
  clientId: string
  nickname: string
  peerId?: string
}
