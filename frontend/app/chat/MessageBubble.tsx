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

// Render icon tanda terima pesan (WhatsApp/Telegram-style)
function renderReceipt(status?: Message['status']) {
  switch (status) {
    case 'pending':
      return <span className="receipt-icon receipt-pending" title="Sedang dikirim...">🕒</span>
    case 'delivered':
      return <span className="receipt-icon receipt-delivered" title="Tersampaikan">✓✓</span>
    case 'read':
      return <span className="receipt-icon receipt-read" title="Dibaca">✓✓</span>
    case 'sent':
    default:
      return <span className="receipt-icon receipt-sent" title="Terkirim ke server">✓</span>
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
      {!isSystem && (
        <div className="message-meta-row">
          {time && (
            <span className="message-meta" aria-label={`Dikirim pukul ${time}`}>
              {time}
            </span>
          )}
          {isSelf && (
            <span className="message-receipt" aria-label={`Status: ${message.status || 'sent'}`}>
              {renderReceipt(message.status)}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
