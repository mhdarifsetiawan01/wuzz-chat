'use client'

import { useState, useEffect } from 'react'
import type { ConnectionStatus, SessionInfo, RoomUser } from '@/lib/types'
import { soundManager } from '@/lib/sound'

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
  const [soundMuted, setSoundMuted] = useState(false)

  useEffect(() => {
    setSoundMuted(soundManager.isMuted())
    const unsubscribe = soundManager.onMuteChange(setSoundMuted)
    return () => unsubscribe()
  }, [])

  const copyRoomLink = () => {
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/chat?room=${encodeURIComponent(roomId)}`
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      })
    }
  }

  const peerName = (peerNickname && peerNickname.trim()) ? peerNickname : (roomId ? `Room: ${roomId}` : 'Ruang Obrolan')
  const initial = (peerNickname && peerNickname.trim() ? peerNickname.trim()[0] : (roomId && roomId.trim() ? roomId.trim()[0] : '#')).toUpperCase()

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

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Tombol Toggle Sound FX */}
        <button
          type="button"
          onClick={() => soundManager.toggleMute()}
          className={`status-btn ${soundMuted ? 'muted' : ''}`}
          title={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
          aria-label={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
          style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '4px 10px', fontSize: '0.8125rem' }}
        >
          <span>{soundMuted ? '🔇' : '🔊'}</span>
          <span className="hide-on-mobile">{soundMuted ? 'Muted' : 'Sound'}</span>
        </button>

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
      </div>
    </header>
  )
}

