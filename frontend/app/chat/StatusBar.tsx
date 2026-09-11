'use client'

import { useState } from 'react'
import type { ConnectionStatus, SessionInfo } from '@/lib/types'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
  roomId: string
}

const statusLabel: Record<ConnectionStatus, string> = {
  connected:    'Online',
  connecting:   'Menghubungkan...',
  disconnected: 'Terputus',
  reconnecting: 'Reconnecting...',
}

export function StatusBar({ status, session, peerNickname, roomId }: StatusBarProps) {
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
        {/* Avatar */}
        <div className="status-avatar" aria-hidden="true">
          {initial}
        </div>

        <div className="status-info">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="status-name">{peerName}</span>
            {roomId && (
              <button
                type="button"
                onClick={copyRoomLink}
                style={{
                  background: 'var(--bg-overlay)',
                  border: '1px solid var(--border-default)',
                  color: copied ? 'var(--accent-400)' : 'var(--text-secondary)',
                  fontSize: '0.6875rem',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                }}
                title="Salin link chat ini untuk dibagikan ke teman"
              >
                {copied ? '✓ Link Tersalin!' : '📋 Salin Link'}
              </button>
            )}
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
