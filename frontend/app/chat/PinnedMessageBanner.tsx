'use client'

import { useState } from 'react'
import type { PinnedMessage } from '@/lib/types'

interface PinnedMessageBannerProps {
  pinnedMessages: PinnedMessage[]
  onJumpToMessage: (messageId: string) => void
  onUnpinMessage: (messageId: string) => void
}

export function PinnedMessageBanner({
  pinnedMessages,
  onJumpToMessage,
  onUnpinMessage,
}: PinnedMessageBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0)

  if (!pinnedMessages || pinnedMessages.length === 0) {
    return null
  }

  const safeIndex = currentIndex >= pinnedMessages.length ? 0 : currentIndex
  const currentPin = pinnedMessages[safeIndex]
  const msg = currentPin?.message

  const senderName = msg?.nickname || (currentPin?.pinned_by ? 'Pesan Tersemat' : 'Pesan')
  let previewText = msg?.content || ''
  if (!previewText && msg?.media_type) {
    previewText = `📎 ${msg.media_type === 'image' ? 'Foto' : msg.file_name || 'Berkas'}`
  }
  if (!previewText) {
    previewText = 'Pesan disematkan'
  }

  const handleBannerClick = () => {
    if (currentPin?.message_id) {
      onJumpToMessage(currentPin.message_id)
      if (pinnedMessages.length > 1) {
        setCurrentIndex((prev) => (prev + 1) % pinnedMessages.length)
      }
    }
  }

  const handleNext = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev + 1) % pinnedMessages.length)
  }

  const handlePrev = (e: React.MouseEvent) => {
    e.stopPropagation()
    setCurrentIndex((prev) => (prev - 1 + pinnedMessages.length) % pinnedMessages.length)
  }

  return (
    <div className="pinned-message-banner" role="region" aria-label="Pesan Tersemat">
      <div className="pinned-banner-bar" onClick={handleBannerClick} title="Klik untuk melompat ke pesan ini">
        <div className="pinned-banner-indicator">
          <span className="pinned-icon" aria-hidden="true">📌</span>
          <div className="pinned-bar-pill" />
        </div>

        <div className="pinned-banner-content">
          <div className="pinned-banner-header">
            <span className="pinned-sender-name">{senderName}</span>
            {pinnedMessages.length > 1 && (
              <span className="pinned-count-badge">
                {safeIndex + 1}/{pinnedMessages.length}
              </span>
            )}
          </div>
          <p className="pinned-text-preview">{previewText}</p>
        </div>

        <div className="pinned-banner-actions">
          {pinnedMessages.length > 1 && (
            <div className="pinned-nav-controls" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                className="pinned-nav-btn"
                onClick={handlePrev}
                title="Pesan tersemat sebelumnya"
                aria-label="Pesan sebelumnya"
              >
                ▲
              </button>
              <button
                type="button"
                className="pinned-nav-btn"
                onClick={handleNext}
                title="Pesan tersemat berikutnya"
                aria-label="Pesan berikutnya"
              >
                ▼
              </button>
            </div>
          )}

          <button
            type="button"
            className="pinned-unpin-btn"
            onClick={(e) => {
              e.stopPropagation()
              onUnpinMessage(currentPin.message_id || currentPin.id)
            }}
            title="Lepas sematan pesan"
            aria-label="Lepas sematan pesan"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  )
}
