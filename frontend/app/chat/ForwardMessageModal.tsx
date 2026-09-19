'use client'

import { useState, useMemo } from 'react'
import type { Message, ConversationItem } from '@/lib/types'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getAvatarStyle } from '@/lib/avatarColor'

interface ForwardMessageModalProps {
  isOpen: boolean
  onClose: () => void
  message: Message | null
  conversations: ConversationItem[]
  currentRoomId: string
  onForward: (messageId: string, targetRoomIds: string[]) => Promise<void>
}

export function ForwardMessageModal({
  isOpen,
  onClose,
  message,
  conversations,
  currentRoomId,
  onForward,
}: ForwardMessageModalProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedRoomIds, setSelectedRoomIds] = useState<string[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')

  const handleClose = useModalBackHandler(isOpen, () => {
    setSelectedRoomIds([])
    setSearchQuery('')
    setErrorMsg('')
    onClose()
  }, 'forward_message')

  // Filter percakapan yang aktif dan cocok dengan query pencarian
  const filteredConversations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim()
    return conversations.filter(c => {
      const title = (c.type === 'direct' ? (c.peer_nickname || c.title) : c.title) || ''
      if (!q) return true
      return title.toLowerCase().includes(q)
    })
  }, [conversations, searchQuery])

  if (!isOpen || !message) return null

  const handleToggleRoom = (roomId: string) => {
    setErrorMsg('')
    if (selectedRoomIds.includes(roomId)) {
      setSelectedRoomIds(prev => prev.filter(id => id !== roomId))
    } else {
      if (selectedRoomIds.length >= 5) {
        setErrorMsg('Maksimal memilih 5 percakapan')
        return
      }
      setSelectedRoomIds(prev => [...prev, roomId])
    }
  }

  const handleConfirmForward = async () => {
    if (!message.id) return
    if (selectedRoomIds.length === 0) {
      setErrorMsg('Pilih minimal 1 percakapan')
      return
    }
    if (selectedRoomIds.length > 5) {
      setErrorMsg('Maksimal memilih 5 percakapan')
      return
    }

    setIsSubmitting(true)
    setErrorMsg('')
    try {
      await onForward(message.id, selectedRoomIds)
      setSelectedRoomIds([])
      setSearchQuery('')
      onClose()
    } catch (err: unknown) {
      const e = err as { message?: string }
      setErrorMsg(e.message || 'Gagal meneruskan pesan')
    } finally {
      setIsSubmitting(false)
    }
  }

  const snippet = message.content
    ? message.content.length > 80
      ? message.content.slice(0, 80) + '...'
      : message.content
    : message.media_type
    ? `[Berkas ${message.media_type}] ${message.file_name || ''}`
    : '[Pesan]'

  return (
    <div
      className="modal-backdrop"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="forward-modal-title"
    >
      <div
        className="forward-modal-card"
        onClick={e => e.stopPropagation()}
      >
        <div className="forward-modal-header">
          <div>
            <h2 id="forward-modal-title" className="forward-modal-title">
              ↪ Teruskan Pesan
            </h2>
            <p className="forward-modal-subtitle">
              Pilih kontak atau grup ({selectedRoomIds.length}/5 dipilih)
            </p>
          </div>
          <button
            type="button"
            className="forward-modal-close"
            onClick={handleClose}
            aria-label="Batal meneruskan"
          >
            ✕
          </button>
        </div>

        {/* Message snippet preview */}
        <div className="forward-preview-box">
          <span className="forward-preview-label">Pesan yang diteruskan:</span>
          <p className="forward-preview-text">{snippet}</p>
        </div>

        {/* Search input */}
        <div className="forward-search-box">
          <input
            type="text"
            className="forward-search-input"
            placeholder="Cari obrolan atau kontak..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            autoFocus
          />
        </div>

        {errorMsg && (
          <div className="forward-error-alert" role="alert">
            ⚠️ {errorMsg}
          </div>
        )}

        {/* Conversation list */}
        <div className="forward-list-body">
          {filteredConversations.length === 0 ? (
            <p className="forward-empty">Tidak ada percakapan yang cocok</p>
          ) : (
            <ul className="forward-list">
              {filteredConversations.map(c => {
                const isSelected = selectedRoomIds.includes(c.id)
                const isCurrent = c.id === currentRoomId
                const title = (c.type === 'direct' ? (c.peer_nickname || c.title) : c.title) || 'Obrolan'
                const initial = title[0]?.toUpperCase() || '?'
                const avatarStyle = getAvatarStyle(title)

                return (
                  <li
                    key={c.id}
                    className={`forward-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => handleToggleRoom(c.id)}
                  >
                    <div className="forward-item-avatar" style={avatarStyle}>
                      {c.avatar_url || c.peer_avatar_url ? (
                        <img
                          src={c.avatar_url || c.peer_avatar_url}
                          alt={title}
                          className="forward-avatar-img"
                        />
                      ) : (
                        <span>{initial}</span>
                      )}
                    </div>
                    <div className="forward-item-info">
                      <span className="forward-item-title">
                        {title}
                        {isCurrent && <span className="forward-item-badge">Saat ini</span>}
                      </span>
                      <span className="forward-item-desc">
                        {c.type === 'group' ? 'Grup' : 'Obrolan Langsung'}
                      </span>
                    </div>
                    <div className="forward-item-check">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}} // dikendalikan oleh onClick li
                        aria-label={`Pilih ${title}`}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="forward-modal-footer">
          <button
            type="button"
            className="forward-btn-cancel"
            onClick={handleClose}
            disabled={isSubmitting}
          >
            Batal
          </button>
          <button
            type="button"
            className="forward-btn-submit"
            onClick={handleConfirmForward}
            disabled={isSubmitting || selectedRoomIds.length === 0}
          >
            {isSubmitting ? 'Meneruskan...' : `Teruskan (${selectedRoomIds.length})`}
          </button>
        </div>
      </div>
    </div>
  )
}
