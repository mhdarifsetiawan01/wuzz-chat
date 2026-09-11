'use client'

import type { ConnectionStatus, SessionInfo } from '@/lib/types'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
}

const statusLabel: Record<ConnectionStatus, string> = {
  connected:    'Online',
  connecting:   'Menghubungkan...',
  disconnected: 'Terputus',
  reconnecting: 'Reconnecting...',
}

export function StatusBar({ status, session, peerNickname }: StatusBarProps) {
  const peerName = peerNickname ?? (session?.peerId ? `ID: ${session.peerId.slice(0, 8)}…` : 'Menunggu lawan chat')
  const peerInitial = (peerNickname ?? '?')[0].toUpperCase()

  return (
    <header className="status-bar" role="banner">
      <div className="status-bar-left">
        {/* Avatar peer */}
        <div className="status-avatar" aria-hidden="true">
          {peerInitial}
        </div>

        <div className="status-info">
          <div className="status-name">{peerName}</div>
          {session && (
            <div className="status-sub">
              Kamu: {session.nickname}
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
