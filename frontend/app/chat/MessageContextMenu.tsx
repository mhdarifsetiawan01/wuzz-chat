'use client'

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import type { Message } from '@/lib/types'

interface MessageContextMenuProps {
  x: number
  y: number
  isMobile: boolean
  message: Message
  isSelf: boolean
  canEdit: boolean
  isPinned: boolean
  selfId: string
  selfNickname: string
  onClose: () => void
  onReact: (emoji: string) => void
  onReply: () => void
  onEdit: () => void
  onForward: () => void
  onPin: () => void
  onUnpin: () => void
  onDelete: () => void
}

const QUICK_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏']

export function MessageContextMenu({
  x,
  y,
  isMobile,
  message,
  isSelf,
  canEdit,
  isPinned,
  selfId,
  selfNickname,
  onClose,
  onReact,
  onReply,
  onEdit,
  onForward,
  onPin,
  onUnpin,
  onDelete,
}: MessageContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null)

  // Tutup menu saat klik di luar
  useEffect(() => {
    const handlePointerDown = (e: MouseEvent | TouchEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }

    // sedikit delay agar event yang memicu menu tidak langsung nutup
    const tid = setTimeout(() => {
      document.addEventListener('mousedown', handlePointerDown)
      document.addEventListener('touchstart', handlePointerDown)
      document.addEventListener('keydown', handleKeyDown)
    }, 10)

    return () => {
      clearTimeout(tid)
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('touchstart', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  // Hitung posisi clamped agar tidak keluar viewport (desktop only)
  const getDesktopPosition = () => {
    const MENU_W = 220
    const MENU_H = 280 // estimasi
    const vw = window.innerWidth
    const vh = window.innerHeight

    let left = x
    let top = y

    if (left + MENU_W > vw - 8) left = vw - MENU_W - 8
    if (left < 8) left = 8
    if (top + MENU_H > vh - 8) top = vh - MENU_H - 8
    if (top < 8) top = 8

    return { left, top }
  }

  const handleReact = (emoji: string) => {
    onReact(emoji)
    onClose()
  }

  const handleAction = (fn: () => void) => {
    fn()
    onClose()
  }

  // Cek apakah user sudah bereaksi dengan emoji ini
  const hasReacted = (emoji: string) => {
    if (!message.reactions) return false
    return message.reactions.some(
      r => r.emoji === emoji && r.users.some(u =>
        (selfId && u === selfId) ||
        Boolean(selfNickname && u.toLowerCase() === selfNickname.toLowerCase())
      )
    )
  }

  // ── EMOJI ROW (sama di desktop & mobile) ──────────────────────────
  const emojiRow = (
    <div className="ctx-emoji-row">
      {QUICK_EMOJIS.map(emoji => (
        <button
          key={emoji}
          type="button"
          className={`ctx-emoji-btn ${hasReacted(emoji) ? 'ctx-emoji-btn--active' : ''}`}
          onClick={() => handleReact(emoji)}
          title={`Reaksi ${emoji}`}
        >
          {emoji}
        </button>
      ))}
    </div>
  )

  // ── ACTION ITEMS ──────────────────────────────────────────────────
  const actionItems = (
    <>
      <button type="button" className="ctx-item" onClick={() => handleAction(onReply)}>
        <span className="ctx-item-icon">↩️</span>
        <span className="ctx-item-label">Balas</span>
      </button>

      {canEdit && (
        <button type="button" className="ctx-item" onClick={() => handleAction(onEdit)}>
          <span className="ctx-item-icon">✏️</span>
          <span className="ctx-item-label">Edit Pesan</span>
          <span className="ctx-item-badge">15 menit</span>
        </button>
      )}

      {!message.is_deleted && (
        <button type="button" className="ctx-item" onClick={() => handleAction(onForward)}>
          <span className="ctx-item-icon">↪️</span>
          <span className="ctx-item-label">Teruskan</span>
        </button>
      )}

      {!message.is_deleted && (
        <button
          type="button"
          className={`ctx-item ${isPinned ? 'ctx-item--pinned' : ''}`}
          onClick={() => handleAction(isPinned ? onUnpin : onPin)}
        >
          <span className="ctx-item-icon">📌</span>
          <span className="ctx-item-label">{isPinned ? 'Lepas Sematan' : 'Sematkan Pesan'}</span>
        </button>
      )}

      <div className="ctx-separator" />

      <button type="button" className="ctx-item ctx-item--danger" onClick={() => handleAction(onDelete)}>
        <span className="ctx-item-icon">🗑️</span>
        <span className="ctx-item-label">Hapus</span>
      </button>
    </>
  )

  // ── MOBILE: Bottom Sheet ──────────────────────────────────────────
  if (isMobile) {
    return createPortal(
      <div className="ctx-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-label="Menu aksi pesan">
        <div
          ref={menuRef}
          className="ctx-bottom-sheet"
          onClick={e => e.stopPropagation()}
        >
          <div className="ctx-bottom-sheet-handle" />
          {emojiRow}
          <div className="ctx-separator" />
          <div className="ctx-bottom-sheet-actions">
            {actionItems}
          </div>
        </div>
      </div>,
      document.body
    )
  }

  // ── DESKTOP: Dropdown Context Menu ────────────────────────────────
  const pos = getDesktopPosition()

  return createPortal(
    <div
      ref={menuRef}
      className="ctx-dropdown"
      style={{ left: pos.left, top: pos.top }}
      role="menu"
      aria-label="Menu aksi pesan"
    >
      {emojiRow}
      <div className="ctx-separator" />
      {actionItems}
    </div>,
    document.body
  )
}
