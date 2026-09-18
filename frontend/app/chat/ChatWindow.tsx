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
  isE2EE?: boolean
  isDirectChat?: boolean
  peerAvatarUrl?: string
  peerNickname?: string
  onRetryHistory?: () => void
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
  onImageClick?: (imageUrl: string, fileName?: string) => void
  onDeleteMessage?: (messageId: string, type: 'for_me' | 'for_everyone') => void
  members?: import('@/lib/types').GroupMember[]
}

export function ChatWindow({
  messages,
  selfId,
  selfNickname,
  isPeerTyping,
  typingNickname,
  isLoadingHistory,
  isHistoryError,
  isE2EE = false,
  isDirectChat = false,
  peerAvatarUrl = '',
  peerNickname = '',
  onRetryHistory,
  onReply,
  onReact,
  onImageClick,
  onDeleteMessage,
  members,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll ke bawah setiap ada pesan baru atau typing indicator (terisolasi hanya di container, tidak men-scroll window)
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTo({
        top: containerRef.current.scrollHeight,
        behavior: 'smooth',
      })
    } else {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
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
      <div ref={containerRef} className="chat-window" aria-label="Area percakapan">
        {isE2EE && (
          <div
            style={{
              margin: 'var(--space-2) auto var(--space-4) auto',
              maxWidth: '440px',
              textAlign: 'center',
              padding: '8px 14px',
              background: 'rgba(234, 179, 8, 0.1)',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              borderRadius: '10px',
              fontSize: '0.75rem',
              color: 'var(--text-secondary)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              lineHeight: 1.4,
            }}
          >
            <span style={{ fontSize: '0.9rem' }}>🔒</span>
            <span>Pesan di ruang ini terenkripsi end-to-end. Tidak ada pihak ketiga (bahkan server) yang dapat membacanya.</span>
          </div>
        )}
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
      ref={containerRef}
      className="chat-window"
      role="list"
      aria-label="Pesan percakapan"
      aria-live="polite"
      aria-relevant="additions"
    >
      {isE2EE && (
        <div
          style={{
            margin: 'var(--space-2) auto var(--space-4) auto',
            maxWidth: '440px',
            textAlign: 'center',
            padding: '8px 14px',
            background: 'rgba(234, 179, 8, 0.1)',
            border: '1px solid rgba(234, 179, 8, 0.25)',
            borderRadius: '10px',
            fontSize: '0.75rem',
            color: 'var(--text-secondary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            lineHeight: 1.4,
          }}
        >
          <span style={{ fontSize: '0.9rem' }}>🔒</span>
          <span>Pesan di ruang ini terenkripsi end-to-end. Tidak ada pihak ketiga yang dapat membaca isinya.</span>
        </div>
      )}

      {messages.map((msg, idx) => (
        <MessageBubble
          key={msg.id || `${msg.timestamp ?? ''}-${idx}`}
          message={msg}
          selfId={selfId}
          selfNickname={selfNickname}
          isDirectChat={isDirectChat}
          peerAvatarUrl={peerAvatarUrl}
          peerNickname={peerNickname}
          onReply={onReply}
          onReact={onReact}
          onImageClick={onImageClick}
          onDeleteMessage={onDeleteMessage}
          members={members}
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
