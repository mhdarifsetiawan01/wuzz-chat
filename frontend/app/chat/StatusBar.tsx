'use client'

import { useState } from 'react'
import type { ConnectionStatus, SessionInfo, RoomUser } from '@/lib/types'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
  roomId: string
  roomUsers?: RoomUser[]
  onOpenMemberList: () => void
  onToggleSidebar?: () => void
}

const statusLabel: Record<ConnectionStatus, string> = {
  connected:    'Online',
  connecting:   'Menghubungkan...',
  disconnected: 'Terputus',
  reconnecting: 'Reconnecting...',
}

export function StatusBar({
  status,
  session,
  peerNickname,
  roomId,
  roomUsers = [],
  onOpenMemberList,
  onToggleSidebar,
}: StatusBarProps) {
  const [copied, setCopied] = useState(false)

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/chat?room=${encodeURIComponent(roomId)}`
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const peerName = peerNickname ?? (roomId ? `Room: ${roomId}` : 'Ruang Obrolan')
  const initial = (peerNickname ?? (roomId ? roomId[0] : '#'))[0].toUpperCase()

  return (
    <header className="status-bar" role="banner">
      <div className="status-bar-left">
        {onToggleSidebar && (
          <button
            type="button"
            className="mobile-menu-btn"
            onClick={onToggleSidebar}
            aria-label="Buka daftar obrolan"
          >
            ☰
          </button>
        )}

        {/* Avatar */}
        <div className="status-avatar" aria-hidden="true">
          {initial}
        </div>

        <div className="status-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <span className="status-name">{peerName}</span>
            {roomId && (
              <button
                type="button"
                onClick={copyRoomLink}
                className="status-btn"
                title="Salin link chat ini untuk dibagikan ke teman"
              >
                {copied ? '✓ Link Tersalin!' : '📋 Salin Link'}
              </button>
            )}
            {/* Tombol Daftar Anggota */}
            <button
              type="button"
              onClick={onOpenMemberList}
              className="status-btn member-badge-btn"
              title="Lihat daftar anggota yang sedang online di room ini"
            >
              👥 {roomUsers.length} Online
            </button>
          </div>
          {session && (
            <div className="status-sub">
              Kamu: <strong>{session.nickname}</strong>
            </div>
          )}
        </div>
      </div>

      {/* Status koneksi */}
      <div
        className={`status-indicator ${status}`}
        role="status"
        aria-live="polite"
        aria-label={`Status koneksi: ${statusLabel[status]}`}
      >
        <span className="status-dot" aria-hidden="true" />
        {statusLabel[status]}
      </div>
    </header>
  )
}
