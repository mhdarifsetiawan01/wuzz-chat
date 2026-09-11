// Tipe pesan yang dipertukarkan — sinkron dengan backend Go (internal/ws/message.go)
export type MessageType = 'join' | 'message' | 'typing' | 'leave' | 'system' | 'history'

export interface Message {
  id?: string
  type: MessageType
  from?: string
  to?: string
  room?: string
  nickname?: string
  content?: string
  timestamp?: string
  messages?: Message[] // Digunakan saat type = 'history'
}

// Status koneksi WebSocket
export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting'

// Info sesi client setelah join berhasil
export interface SessionInfo {
  clientId: string
  nickname: string
  peerId?: string
}
