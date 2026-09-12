'use client'

import { useState, useEffect } from 'react'
import type { ConnectionStatus, SessionInfo, RoomUser } from '@/lib/types'
import { soundManager } from '@/lib/sound'
import { ContactProfileModal } from './ContactProfileModal'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
  roomId: string
  roomUsers?: RoomUser[]
  isPeerTyping?: boolean
  typingNickname?: string | null
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
  isPeerTyping = false,
  typingNickname = null,
  onOpenMemberList,
  onToggleSidebar,
}: StatusBarProps) {
  const [copied, setCopied] = useState(false)
  const [soundMuted, setSoundMuted] = useState(false)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)

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

  const isDirectChat = roomId.startsWith('dm_') || Boolean(peerNickname)
  const peerName = (peerNickname && peerNickname.trim()) ? peerNickname : (roomId ? `Room: ${roomId}` : 'Ruang Obrolan')
  const initial = (peerNickname && peerNickname.trim() ? peerNickname.trim()[0] : (roomId && roomId.trim() ? roomId.trim()[0] : '#')).toUpperCase()

  return (
    <>
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

          {/* Avatar & Name — Klik untuk melihat profil jika direct chat */}
          <div
            onClick={() => {
              if (isDirectChat && peerNickname) {
                setIsContactModalOpen(true)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              cursor: (isDirectChat && peerNickname) ? 'pointer' : 'default',
            }}
            title={isDirectChat && peerNickname ? 'Klik untuk melihat profil lengkap kontak ini' : undefined}
          >
            <div className="status-avatar" aria-hidden="true">
              {initial}
            </div>

            <div className="status-info">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span className="status-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  {peerName}
                  {isDirectChat && peerNickname && (
                    <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>ℹ️</span>
                  )}
                </span>
                {roomId && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      copyRoomLink()
                    }}
                    className="status-btn"
                    title="Salin link chat ini untuk dibagikan ke teman"
                  >
                    {copied ? '✓ Link Tersalin!' : '📋 Salin Link'}
                  </button>
                )}
                {/* Tombol Daftar Anggota */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenMemberList()
                  }}
                  className="status-btn member-badge-btn"
                  title="Lihat daftar anggota yang sedang online di room ini"
                >
                  👥 {roomUsers.length} Online
                </button>
              </div>
              {isPeerTyping ? (
                <div className="status-sub">
                  <span className="status-typing-label">
                    <span>✍️</span>
                    <span>{typingNickname ? `${typingNickname} sedang mengetik...` : 'sedang mengetik...'}</span>
                  </span>
                </div>
              ) : session ? (
                <div className="status-sub">
                  Kamu: <strong>{session.nickname}</strong>
                </div>
              ) : null}
            </div>
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

      {/* Modal Detail Kontak Lawan Bicara */}
      {(() => {
        const peerUser = roomUsers.find(u => (session && u.id !== session.clientId) || u.nickname === peerNickname)
        return (
          <ContactProfileModal
            isOpen={isContactModalOpen}
            onClose={() => setIsContactModalOpen(false)}
            userId={peerUser?.id}
            username={peerNickname}
          />
        )
      })()}
    </>
  )
}


