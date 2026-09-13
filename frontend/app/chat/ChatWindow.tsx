'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/lib/types'
import { MessageBubble } from './MessageBubble'

interface ChatWindowProps {
  messages: Message[]
  selfId: string
  selfNickname: string
  isPeerTyping: boolean
  typingNickname?: string | null
  isLoadingHistory?: boolean
  isHistoryError?: boolean
  onRetryHistory?: () => void
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
  onImageClick?: (imageUrl: string, fileName?: string) => void
  onDeleteMessage?: (messageId: string, type: 'for_me' | 'for_everyone') => void
}

export function ChatWindow({
  messages,
  selfId,
  selfNickname,
  isPeerTyping,
  typingNickname,
  isLoadingHistory,
  isHistoryError,
  onRetryHistory,
  onReply,
  onReact,
  onImageClick,
  onDeleteMessage,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll ke bawah setiap ada pesan baru atau typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPeerTyping])

  // 1. Tampilan saat sedang menyinkronkan riwayat pesan dari server
  if (isLoadingHistory) {
    return (
      <div className="chat-window chat-status-center" aria-label="Menyinkronkan percakapan" role="status">
        <div className="chat-sync-card">
          <div className="sync-spinner" aria-hidden="true" />
          <h4 className="sync-title">Menyinkronkan Percakapan</h4>
          <p className="sync-desc">
            Mengambil riwayat pesan terbaru dengan aman...
          </p>
        </div>
      </div>
    )
  }

  // 2. Tampilan saat terjadi gangguan koneksi / timeout pengambilan riwayat
  if (isHistoryError && messages.length === 0) {
    return (
      <div className="chat-window chat-status-center" aria-label="Gagal memuat percakapan" role="status">
        <div className="chat-sync-card error">
          <span className="sync-icon" aria-hidden="true">📡</span>
          <h4 className="sync-title">Koneksi Sedang Terhambat</h4>
          <p className="sync-desc">
            Kami belum dapat memuat riwayat pesan saat ini. Jangan khawatir, seluruh pesan Anda tetap tersimpan aman di server.
          </p>
          {onRetryHistory && (
            <button
              type="button"
              className="btn btn-primary sync-retry-btn"
              onClick={onRetryHistory}
            >
              🔄 Coba Sinkronkan Lagi
            </button>
          )}
        </div>
      </div>
    )
  }

  // 3. Tampilan jika obrolan belum memiliki pesan sama sekali
  if (messages.length === 0 && !isPeerTyping) {
    return (
      <div className="chat-window" aria-label="Area percakapan">
        <div className="chat-empty" role="status">
          <span className="chat-empty-icon" aria-hidden="true">💬</span>
          <p>Belum ada pesan di percakapan ini.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            Mulai obrolan dengan menyapa atau kirim pesan pertama Anda!
          </p>
        </div>
        <div ref={bottomRef} aria-hidden="true" />
      </div>
    )
  }

  return (
    <div
      className="chat-window"
      role="list"
      aria-label="Pesan percakapan"
      aria-live="polite"
      aria-relevant="additions"
    >
      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id || `${msg.timestamp ?? ''}-${idx}`}
          message={msg}
          selfId={selfId}
          selfNickname={selfNickname}
          onReply={onReply}
          onReact={onReact}
          onImageClick={onImageClick}
          onDeleteMessage={onDeleteMessage}
        />
      ))}

      {/* Typing indicator — muncul saat anggota lain sedang mengetik */}
      {isPeerTyping && (
        <div className="message-row peer" aria-label="Lawan chat sedang mengetik" role="status">
          <div className="typing-bubble-container">
            {typingNickname && <span className="typing-author">{typingNickname}</span>}
            <div className="typing-indicator" aria-hidden="true">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        </div>
      )}

      {/* Anchor untuk auto-scroll */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  )
}
