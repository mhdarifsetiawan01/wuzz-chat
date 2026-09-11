'use client'

import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  selfId: string
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

export function MessageBubble({ message, selfId }: MessageBubbleProps) {
  // Tentukan "siapa" yang mengirim pesan ini untuk styling bubble
  const isSelf   = message.from === selfId
  const isSystem = message.type === 'system'

  const rowClass = isSystem ? 'system' : isSelf ? 'self' : 'peer'
  const time = formatTime(message.timestamp)

  return (
    <div className={`message-row ${rowClass}`} role="listitem">
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
