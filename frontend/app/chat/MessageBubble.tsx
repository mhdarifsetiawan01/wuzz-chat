'use client'

import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  selfId: string
  selfNickname: string
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

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

export function MessageBubble({ message, selfId, selfNickname, onReply, onReact }: MessageBubbleProps) {
  const isSystem = message.type === 'system'
  
  // Penentuan self yang andal: utamakan kecocokan nickname, fallback ke client ID
  const isSelf = isSystem
    ? false
    : message.nickname && selfNickname
      ? message.nickname === selfNickname
      : message.from === selfId

  const rowClass = isSystem ? 'system' : isSelf ? 'self' : 'peer'
  const time = formatTime(message.timestamp)

  const handleQuickReact = (emoji: string) => {
    if (message.id && onReact) {
      onReact(message.id, emoji)
    }
  }

  const handleReplyClick = () => {
    if (onReply) {
      onReply(message)
    }
  }

  return (
    <div className={`message-row ${rowClass}`} role="listitem">
      {!isSystem && !isSelf && message.nickname && (
        <span className="message-sender">{message.nickname}</span>
      )}
      
      <div className="message-bubble-wrapper">
        <div className="message-bubble">
          {/* Quoted / Reply Preview Block */}
          {message.reply_to && (
            <div className="message-quote-box">
              <span className="quote-sender">{message.reply_to.nickname || 'Pengguna'}</span>
              <span className="quote-text">{message.reply_to.content}</span>
            </div>
          )}

          {/* Isi Pesan */}
          <div className="message-text-content">
            {message.content}
          </div>

          {/* Timestamp & Receipt Status */}
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

        {/* Floating Action Bar on Hover (Reply & Quick Reactions) */}
        {!isSystem && message.id && (
          <div className="bubble-action-bar" aria-label="Aksi pesan">
            <div className="quick-emoji-list">
              {QUICK_EMOJIS.map(emoji => (
                <button
                  key={emoji}
                  type="button"
                  className="quick-emoji-btn"
                  onClick={() => handleQuickReact(emoji)}
                  title={`Reaksi ${emoji}`}
                >
                  {emoji}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="bubble-action-btn reply-btn"
              onClick={handleReplyClick}
              title="Balas pesan ini"
            >
              ↩️
            </button>
          </div>
        )}
      </div>

      {/* Reaction Pills Badges */}
      {!isSystem && message.reactions && message.reactions.length > 0 && (
        <div className="reaction-pills-container">
          {message.reactions.map(r => {
            const hasReacted = selfNickname ? r.users.some(u => u.toLowerCase() === selfNickname.toLowerCase()) : false
            return (
              <button
                key={r.emoji}
                type="button"
                className={`reaction-pill ${hasReacted ? 'active' : ''}`}
                onClick={() => handleQuickReact(r.emoji)}
                title={`${r.users.join(', ')} bereaksi ${r.emoji}`}
              >
                <span className="reaction-emoji">{r.emoji}</span>
                <span className="reaction-count">{r.count}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
