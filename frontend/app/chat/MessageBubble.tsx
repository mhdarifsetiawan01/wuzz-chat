'use client'

import { useState } from 'react'
import { createPortal } from 'react-dom'
import type { Message } from '@/lib/types'

interface MessageBubbleProps {
  message: Message
  selfId: string
  selfNickname: string
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
  onImageClick?: (imageUrl: string, fileName?: string) => void
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

// Format ukuran file bytes ke B / KB / MB
function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

// Identifikasi metadata file (ikon, label, warna) berbasis ekstensi
function getFileMeta(fileName?: string) {
  const ext = fileName ? fileName.split('.').pop()?.toLowerCase() || '' : ''
  switch (ext) {
    case 'pdf':
      return { icon: '📕', label: 'PDF', colorClass: 'file-pdf' }
    case 'doc':
    case 'docx':
      return { icon: '📘', label: 'DOC', colorClass: 'file-doc' }
    case 'xls':
    case 'xlsx':
    case 'csv':
      return { icon: '📗', label: 'SHEET', colorClass: 'file-sheet' }
    case 'ppt':
    case 'pptx':
      return { icon: '📙', label: 'SLIDE', colorClass: 'file-slide' }
    case 'zip':
    case 'rar':
    case '7z':
    case 'tar':
    case 'gz':
      return { icon: '🗜️', label: 'ZIP', colorClass: 'file-zip' }
    case 'txt':
    case 'json':
    case 'js':
    case 'ts':
    case 'html':
    case 'css':
      return { icon: '📄', label: 'TEXT', colorClass: 'file-code' }
    default:
      return { icon: '📁', label: ext.toUpperCase() || 'FILE', colorClass: 'file-default' }
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

export function MessageBubble({ message, selfId, selfNickname, onReply, onReact, onImageClick }: MessageBubbleProps) {
  const isSystem = message.type === 'system'
  const [isExpanded, setIsExpanded] = useState(false)
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false)

  // Cek apakah pesan tergolong panjang (> 300 karakter atau > 7 baris)
  const isLongMessage = !isSystem && Boolean(
    (message.content && message.content.length > 300) ||
    (message.content && message.content.split('\n').length > 7)
  )
  
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

  const handleQuoteClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    const targetId = message.reply_to?.id
    if (!targetId) return

    const targetEl = document.getElementById(`msg-${targetId}`)
    if (targetEl) {
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
      targetEl.classList.remove('highlight-pulse')
      // Trigger reflow untuk me-restart animasi pulse jika diklik berkali-kali
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl.classList.remove('highlight-pulse')
      }, 2000)
    }
  }

  return (
    <div
      id={message.id ? `msg-${message.id}` : undefined}
      className={`message-row ${rowClass}`}
      role="listitem"
    >
      {!isSystem && !isSelf && message.nickname && (
        <span className="message-sender">{message.nickname}</span>
      )}
      
      <div className="message-bubble-wrapper">
        <div className="message-bubble">
          {/* Quoted / Reply Preview Block */}
          {message.reply_to && (
            <div
              className="message-quote-box"
              onClick={handleQuoteClick}
              role="button"
              tabIndex={0}
              title="Klik untuk melompat ke pesan yang dibalas"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleQuoteClick(e as unknown as React.MouseEvent)
                }
              }}
            >
              <span className="quote-sender">{message.reply_to.nickname || 'Pengguna'}</span>
              <span className="quote-text">{message.reply_to.content}</span>
            </div>
          )}

          {/* Pratinjau Gambar jika ada */}
          {message.media_url && message.media_type === 'image' && (
            <div
              className="message-image-wrapper"
              onClick={() => onImageClick?.(message.media_url!, message.file_name)}
              role="button"
              tabIndex={0}
              title="Klik untuk memperbesar gambar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onImageClick?.(message.media_url!, message.file_name)
                }
              }}
            >
              <img
                src={message.media_url}
                alt={message.file_name || 'Foto terlampir'}
                className="message-image-img"
                loading="lazy"
              />
            </div>
          )}

          {/* Pratinjau Dokumen / Berkas jika tipe bukan gambar atau audio */}
          {message.media_url && message.media_type !== 'image' && message.media_type !== 'audio' && (
            <div className="message-doc-card">
              <div className={`doc-card-badge ${getFileMeta(message.file_name).colorClass}`}>
                <span className="doc-card-icon">{getFileMeta(message.file_name).icon}</span>
                <span className="doc-card-ext-label">{getFileMeta(message.file_name).label}</span>
              </div>
              <div className="doc-card-details">
                <span className="doc-card-title" title={message.file_name || 'Berkas'}>
                  {message.file_name || 'Dokumen Terlampir'}
                </span>
                <span className="doc-card-meta">
                  {formatFileSize(message.file_size)}
                </span>
              </div>
              <a
                href={message.media_url}
                download={message.file_name || 'file'}
                target="_blank"
                rel="noopener noreferrer"
                className="doc-card-download-btn"
                title="Unduh berkas"
                onClick={(e) => e.stopPropagation()}
              >
                ⬇
              </a>
            </div>
          )}

          {/* Isi Pesan dengan Read Mode */}
          {message.content && (
            <div className={`message-text-content ${isLongMessage && !isExpanded ? 'message-text-clamped' : ''}`}>
              {message.content}
            </div>
          )}

          {/* Tombol Aksi Read Mode / Baca Selengkapnya */}
          {isLongMessage && (
            <div className="read-more-actions">
              <button
                type="button"
                className="read-more-toggle-btn"
                onClick={() => setIsExpanded(!isExpanded)}
                aria-expanded={isExpanded}
                title={isExpanded ? 'Sembunyikan sebagian teks' : 'Baca seluruh isi teks'}
              >
                {isExpanded ? '▲ Sembunyikan' : '📖 Baca Selengkapnya'}
              </button>
              <button
                type="button"
                className="read-mode-modal-btn"
                onClick={() => setIsReaderModalOpen(true)}
                title="Buka dalam tampilan Mode Baca penuh yang nyaman"
              >
                🔍 Mode Baca
              </button>
            </div>
          )}

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

      {/* Modal Mode Baca Penuh (Zen Reader View via Portal) */}
      {isReaderModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-backdrop"
          onClick={() => setIsReaderModalOpen(false)}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            backdropFilter: 'blur(8px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 99999,
            padding: 'var(--space-4)',
          }}
        >
          <div
            className="modal-card"
            onClick={e => e.stopPropagation()}
            style={{
              backgroundColor: '#111b21',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: 'var(--radius-lg)',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '85vh',
              display: 'flex',
              flexDirection: 'column',
              boxShadow: '0 25px 60px rgba(0, 0, 0, 0.9)',
              animation: 'fadeIn 0.2s ease',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: 'var(--space-4) var(--space-5)',
                borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#1f2c34',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '1.25rem' }}>📖</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#e9edef' }}>Mode Baca</h3>
                  <span style={{ fontSize: '0.75rem', color: '#8696a0' }}>
                    Dari {message.nickname || (isSelf ? 'Kamu' : 'Pengguna')} • {time}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsReaderModalOpen(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8696a0',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                title="Tutup mode baca"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div
              style={{
                padding: 'var(--space-6)',
                overflowY: 'auto',
                fontSize: '1.05rem',
                lineHeight: 1.8,
                color: '#d1d7db',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                userSelect: 'text',
                backgroundColor: '#111b21',
              }}
            >
              {message.content}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: 'var(--space-3) var(--space-5)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#1f2c34',
                display: 'flex',
                justifyContent: 'flex-end',
              }}
            >
              <button
                type="button"
                onClick={() => setIsReaderModalOpen(false)}
                className="btn btn-primary"
                style={{ padding: '6px 18px', fontSize: '0.875rem' }}
              >
                Tutup
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
