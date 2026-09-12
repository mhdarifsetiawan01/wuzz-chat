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
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
}

export function ChatWindow({
  messages,
  selfId,
  selfNickname,
  isPeerTyping,
  typingNickname,
  onReply,
  onReact,
}: ChatWindowProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll ke bawah setiap ada pesan baru atau typing indicator
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isPeerTyping])

  if (messages.length === 0 && !isPeerTyping) {
    return (
      <div className="chat-window" aria-label="Area percakapan">
        <div className="chat-empty" role="status">
          <span className="chat-empty-icon" aria-hidden="true">💬</span>
          <p>Belum ada pesan di room ini.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            Kirim pesan pertama atau bagikan link room ke teman untuk mulai mengobrol.
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
