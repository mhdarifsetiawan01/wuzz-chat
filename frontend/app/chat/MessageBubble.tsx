'use client'

import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { Message } from '@/lib/types'
import { AudioPlayerBubble } from './AudioPlayerBubble'
import { LinkPreviewCard } from './LinkPreviewCard'
import { getCachedMediaBlob, setCachedMediaBlob } from '@/lib/mediaCache'
import { acknowledgeMediaDownload } from '@/lib/api'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getAvatarStyle } from '@/lib/avatarColor'

interface MessageBubbleProps {
  message: Message
  selfId: string
  selfNickname: string
  onReply?: (message: Message) => void
  onReact?: (messageId: string, emoji: string) => void
  onImageClick?: (imageUrl: string, fileName?: string) => void
  onDeleteMessage?: (messageId: string, type: 'for_me' | 'for_everyone') => void
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

export function MessageBubble({
  message,
  selfId,
  selfNickname,
  onReply,
  onReact,
  onImageClick,
  onDeleteMessage,
}: MessageBubbleProps) {
  const isSystem = message.type === 'system'
  // Deteksi khusus: pesan notifikasi perubahan kode keamanan E2EE
  const isSecurityNotice = isSystem && Boolean(message.id?.startsWith('security-notice-'))
  const [isExpanded, setIsExpanded] = useState(false)
  const [isReaderModalOpen, setIsReaderModalOpen] = useState(false)
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false)
  const [remainingSeconds, setRemainingSeconds] = useState(0)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleCloseDelete = useModalBackHandler(
    isDeleteModalOpen,
    () => setIsDeleteModalOpen(false),
    'msg_delete_modal'
  )
  const handleCloseReader = useModalBackHandler(
    isReaderModalOpen,
    () => setIsReaderModalOpen(false),
    'msg_reader_modal'
  )

  // Media Offline Caching & Expiration State (Store-and-Forward)
  const [resolvedMediaUrl, setResolvedMediaUrl] = useState<string | null>(null)
  const [isMediaExpired, setIsMediaExpired] = useState(false)
  const [isMediaLoading, setIsMediaLoading] = useState(false)

  // Penentuan self yang andal: utamakan kecocokan nickname, fallback ke client ID
  const isSelf = isSystem
    ? false
    : message.nickname && selfNickname
      ? message.nickname === selfNickname
      : message.from === selfId

  // Timer countdown untuk 'Hapus untuk Semua Orang' (1 menit / 60 detik batas waktu)
  useEffect(() => {
    if (!isDeleteModalOpen) return

    const calculateRemaining = () => {
      if (!message.timestamp) return 0
      const ageMs = Date.now() - new Date(message.timestamp).getTime()
      const rem = Math.max(0, Math.ceil((60000 - ageMs) / 1000))
      return rem
    }

    setRemainingSeconds(calculateRemaining())

    const timer = setInterval(() => {
      const rem = calculateRemaining()
      setRemainingSeconds(rem)
    }, 1000)

    return () => clearInterval(timer)
  }, [isDeleteModalOpen, message.timestamp])

  const canDeleteForEveryone = isSelf && remainingSeconds > 0 && !message.is_deleted

  const handleDeleteConfirm = async (type: 'for_me' | 'for_everyone') => {
    if (!message.id || !onDeleteMessage) return
    setIsDeleting(true)
    try {
      await onDeleteMessage(message.id, type)
      setIsDeleteModalOpen(false)
    } finally {
      setIsDeleting(false)
    }
  }

  // Resolusi Caching IndexedDB untuk Media (WhatsApp-Style)
  useEffect(() => {
    if (!message.media_url) return

    let isMounted = true
    let createdBlobUrl: string | null = null

    async function resolveMedia() {
      const targetUrl = message.media_url!
      
      // 1. Cek apakah binary blob sudah tersimpan di IndexedDB browser lokal
      const cachedBlob = await getCachedMediaBlob(targetUrl)
      if (cachedBlob) {
        if (isMounted) {
          createdBlobUrl = URL.createObjectURL(cachedBlob)
          setResolvedMediaUrl(createdBlobUrl)
          setIsMediaExpired(false)
        }
        return
      }

      // 2. Jika tidak ada di lokal dan status di server sudah 'expired', tandai expired
      if (message.media_status === 'expired') {
        if (isMounted) {
          setIsMediaExpired(true)
        }
        return
      }

      // 3. Jika belum di-cache dan belum expired di server, unduh dan simpan ke IndexedDB
      if (isMounted) setIsMediaLoading(true)
      try {
        const token = typeof window !== 'undefined' ? localStorage.getItem('wuzz_auth_token') : null
        const isInternal = targetUrl.startsWith('/') || (typeof window !== 'undefined' && targetUrl.startsWith(window.location.origin))
        const headers: Record<string, string> = {}
        if (isInternal && token) {
          headers['Authorization'] = `Bearer ${token}`
        }

        const res = await fetch(targetUrl, { headers })
        if (!res.ok) {
          // Jika file fisik sudah dihapus dari server (404/410)
          if (res.status === 404 || res.status === 410) {
            if (isMounted) {
              setIsMediaExpired(true)
              setIsMediaLoading(false)
            }
          } else {
            if (isMounted) {
              setResolvedMediaUrl(targetUrl)
              setIsMediaLoading(false)
            }
          }
          return
        }

        const blob = await res.blob()
        // Simpan ke IndexedDB lokal
        await setCachedMediaBlob(targetUrl, blob, blob.type, message.file_name)

        // Kirim ACK ke backend bahwa media sudah selesai diunduh oleh client
        if (message.id && !isSelf) {
          acknowledgeMediaDownload(message.id, message.room)
        }

        if (isMounted) {
          createdBlobUrl = URL.createObjectURL(blob)
          setResolvedMediaUrl(createdBlobUrl)
          setIsMediaExpired(false)
          setIsMediaLoading(false)
        }
      } catch {
        if (isMounted) {
          // Fallback gunakan remote URL langsung jika fetch blob gagal tapi URL masih valid
          setResolvedMediaUrl(targetUrl)
          setIsMediaLoading(false)
        }
      }
    }

    resolveMedia()

    return () => {
      isMounted = false
      if (createdBlobUrl) {
        URL.revokeObjectURL(createdBlobUrl)
      }
    }
  }, [message.media_url, message.media_status, message.id, message.room, message.file_name, isSelf])

  // Cek apakah pesan tergolong panjang (> 300 karakter atau > 7 baris)
  const isLongMessage = !isSystem && Boolean(
    (message.content && message.content.length > 300) ||
    (message.content && message.content.split('\n').length > 7)
  )

  const rowClass = isSystem
    ? isSecurityNotice ? 'system security-notice' : 'system'
    : isSelf ? 'self' : 'peer'
  const time = formatTime(message.timestamp)

  // Tampilan jika pesan telah ditarik / dihapus (WhatsApp style)
  if (message.is_deleted) {
    return (
      <div
        id={message.id ? `msg-${message.id}` : undefined}
        className={`message-row ${rowClass}`}
        role="listitem"
      >
        <div className="message-row-inner">
          {!isSystem && !isSelf && (
            <div
              className="message-peer-avatar"
              style={getAvatarStyle(message.nickname || message.from || '?')}
              title={message.nickname || message.from || 'Pengguna'}
              aria-hidden="true"
            >
              {((message.nickname || message.from || '?').trim()[0] || '?').toUpperCase()}
            </div>
          )}
          <div className="message-content-wrapper">
            {!isSystem && !isSelf && message.nickname && (
              <span className="message-sender">{message.nickname}</span>
            )}
            <div className="message-bubble-wrapper">
              <div className="message-bubble deleted-bubble">
                <div className="message-deleted-text">
                  <span>🚫</span>
                  <span>Pesan ini telah dihapus</span>
                </div>
                <div className="message-meta-row">
                  {time && (
                    <span className="message-meta" aria-label={`Dihapus pukul ${time}`}>
                      {time}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
      void targetEl.offsetWidth
      targetEl.classList.add('highlight-pulse')
      setTimeout(() => {
        targetEl.classList.remove('highlight-pulse')
      }, 2000)
    }
  }

  const effectiveMediaUrl = resolvedMediaUrl || message.media_url

  return (
    <div
      id={message.id ? `msg-${message.id}` : undefined}
      className={`message-row ${rowClass}`}
      role="listitem"
    >
      <div className="message-row-inner">
        {!isSystem && !isSelf && (
          <div
            className="message-peer-avatar"
            style={getAvatarStyle(message.nickname || message.from || '?')}
            title={message.nickname || message.from || 'Pengguna'}
            aria-hidden="true"
          >
            {((message.nickname || message.from || '?').trim()[0] || '?').toUpperCase()}
          </div>
        )}

        <div className="message-content-wrapper">
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

          {/* Tampilan Media Kedaluwarsa (Expired State - WhatsApp style) */}
          {message.media_url && isMediaExpired && !resolvedMediaUrl && (
            <div className="message-expired-media-box">
              <span className="expired-media-icon">⌛</span>
              <div className="expired-media-info">
                <strong>Media telah kedaluwarsa</strong>
                <span>File sudah tidak tersedia di server</span>
              </div>
            </div>
          )}

          {/* Pratinjau Gambar jika ada dan tidak expired */}
          {message.media_url && message.media_type === 'image' && !isMediaExpired && (
            <div
              className="message-image-wrapper"
              onClick={() => onImageClick?.(effectiveMediaUrl!, message.file_name)}
              role="button"
              tabIndex={0}
              title="Klik untuk memperbesar gambar"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onImageClick?.(effectiveMediaUrl!, message.file_name)
                }
              }}
            >
              {isMediaLoading && (
                <div className="media-loading-overlay">
                  <span>Memuat gambar... ⏳</span>
                </div>
              )}
              <img
                src={effectiveMediaUrl!}
                alt={message.file_name || 'Foto terlampir'}
                className="message-image-img"
                loading="lazy"
              />
            </div>
          )}

          {/* Pratinjau Dokumen / Berkas jika tipe bukan gambar atau audio */}
          {message.media_url && message.media_type !== 'image' && message.media_type !== 'audio' && !isMediaExpired && (
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
                href={effectiveMediaUrl!}
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

          {/* Pratinjau Pesan Suara / Audio Voice Note */}
          {message.media_url && message.media_type === 'audio' && !isMediaExpired && (
            <AudioPlayerBubble
              audioUrl={effectiveMediaUrl!}
              fileName={message.file_name}
              isSelf={isSelf}
            />
          )}

          {/* Isi Pesan dengan Read Mode */}
          {message.content && (
            <div className={`message-text-content ${isLongMessage && !isExpanded ? 'message-text-clamped' : ''}`}>
              {message.content}
            </div>
          )}

          {/* Pratinjau Tautan Web (OpenGraph Link Preview) */}
          {message.content && message.content.match(/(https?:\/\/[^\s]+)/i) && (
            <LinkPreviewCard url={message.content.match(/(https?:\/\/[^\s]+)/i)![0]} />
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

        {/* Floating Action Bar on Hover (Reply, Delete & Quick Reactions) */}
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
            <button
              type="button"
              className="bubble-action-btn delete-btn"
              onClick={() => setIsDeleteModalOpen(true)}
              title="Hapus pesan"
            >
              🗑️
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
      </div>

      {/* Modal Pilihan Hapus Pesan */}
      {isDeleteModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-backdrop"
          onClick={() => !isDeleting && handleCloseDelete()}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: '100vw',
            height: '100vh',
            backgroundColor: 'rgba(0, 0, 0, 0.8)',
            backdropFilter: 'blur(6px)',
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
              maxWidth: '440px',
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
                <span style={{ fontSize: '1.25rem' }}>🗑️</span>
                <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: '#e9edef' }}>
                  Hapus Pesan?
                </h3>
              </div>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleCloseDelete}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#8696a0',
                  fontSize: '1.25rem',
                  cursor: 'pointer',
                  padding: '4px',
                }}
                title="Tutup dialog"
              >
                ✕
              </button>
            </div>

            {/* Content Body */}
            <div
              style={{
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
                gap: '10px',
              }}
            >
              {/* Option 1: Hapus untuk Semua Orang */}
              {isSelf && (
                <button
                  type="button"
                  className="delete-choice-card danger"
                  disabled={!canDeleteForEveryone || isDeleting}
                  onClick={() => handleDeleteConfirm('for_everyone')}
                >
                  <span className="delete-choice-icon">📢</span>
                  <div className="delete-choice-info">
                    <span className="delete-choice-title">Hapus untuk Semua Orang</span>
                    <span className="delete-choice-desc">
                      {canDeleteForEveryone
                        ? 'Pesan akan ditarik dan diganti dengan keterangan terhapus untuk semua peserta chat.'
                        : 'Hanya dapat ditarik dalam waktu 1 menit setelah pesan terkirim.'}
                    </span>
                    {canDeleteForEveryone && (
                      <span className="delete-countdown-badge">
                        ⏱️ Sisa waktu tarik: {remainingSeconds} detik
                      </span>
                    )}
                  </div>
                </button>
              )}

              {/* Option 2: Hapus untuk Saya */}
              <button
                type="button"
                className="delete-choice-card"
                disabled={isDeleting}
                onClick={() => handleDeleteConfirm('for_me')}
              >
                <span className="delete-choice-icon">👤</span>
                <div className="delete-choice-info">
                  <span className="delete-choice-title">Hapus untuk Saya Saja</span>
                  <span className="delete-choice-desc">
                    Pesan hanya akan dihapus dari layar Anda. Lawan bicara tetap dapat melihat pesan ini.
                  </span>
                </div>
              </button>
            </div>

            {/* Footer */}
            <div
              style={{
                padding: 'var(--space-3) var(--space-5)',
                borderTop: '1px solid rgba(255, 255, 255, 0.08)',
                backgroundColor: '#1f2c34',
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '8px',
              }}
            >
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleCloseDelete}
                className="btn btn-secondary"
                style={{ padding: '6px 14px', fontSize: '0.875rem' }}
              >
                Batal
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Modal Mode Baca Penuh (Zen Reader View via Portal) */}
      {isReaderModalOpen && typeof document !== 'undefined' && createPortal(
        <div
          className="modal-backdrop"
          onClick={handleCloseReader}
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
                onClick={handleCloseReader}
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
                onClick={handleCloseReader}
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

