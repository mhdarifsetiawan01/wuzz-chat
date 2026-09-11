'use client'

import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  selfId: string
  selfNickname: string
}

// Format timestamp menjadi HH:MM
function formatTime(iso?: string): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

export function MessageBubble({ message, selfId, selfNickname }: MessageBubbleProps) {
  const isSystem = message.type === 'system'
  
  // Penentuan self yang andal: utamakan kecocokan nickname, fallback ke client ID
  const isSelf = isSystem
    ? false
    : message.nickname && selfNickname
      ? message.nickname === selfNickname
      : message.from === selfId

  const rowClass = isSystem ? 'system' : isSelf ? 'self' : 'peer'
  const time = formatTime(message.timestamp)

  return (
    <div className={`message-row ${rowClass}`} role="listitem">
      {!isSystem && !isSelf && message.nickname && (
        <span className="message-sender">{message.nickname}</span>
      )}
      <div className="message-bubble">
        {message.content}
      </div>
      {!isSystem && time && (
        <span className="message-meta" aria-label={`Dikirim pukul ${time}`}>
          {time}
        </span>
      )}
    </div>
  )
}
