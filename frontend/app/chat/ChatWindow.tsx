'use client'

import { useEffect, useRef } from 'react'
import type { Message } from '@/lib/types'
import { MessageBubble } from './MessageBubble'

interface ChatWindowProps {
  messages: Message[]
  selfId: string
  isPeerTyping: boolean
}

export function ChatWindow({ messages, selfId, isPeerTyping }: ChatWindowProps) {
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
          <p>Belum ada pesan.</p>
          <p style={{ fontSize: '0.8125rem' }}>
            Mulai kirim pesan atau tunggu lawan chat bergabung.
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
          key={`${msg.timestamp ?? ''}-${idx}`}
          message={msg}
          selfId={selfId}
        />
      ))}

      {/* Typing indicator — muncul hanya saat peer sedang mengetik */}
      {isPeerTyping && (
        <div className="message-row peer" aria-label="Lawan chat sedang mengetik" role="status">
          <div className="typing-indicator" aria-hidden="true">
            <span className="typing-dot" />
            <span className="typing-dot" />
            <span className="typing-dot" />
          </div>
        </div>
      )}

      {/* Anchor untuk auto-scroll */}
      <div ref={bottomRef} aria-hidden="true" />
    </div>
  )
}
