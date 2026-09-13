'use client'

import { useState, useEffect } from 'react'
import type { ConnectionStatus, SessionInfo, RoomUser } from '@/lib/types'
import { soundManager } from '@/lib/sound'
import { ContactProfileModal } from './ContactProfileModal'
import { SafetyNumberModal } from './SafetyNumberModal'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
  roomId: string
  roomUsers?: RoomUser[]
  isPeerTyping?: boolean
  typingNickname?: string | null
  currentUserId?: string
  peerPublicKeyJWK?: string
  onOpenMemberList: () => void
  onBack?: () => void
  onStartAudioCall?: () => void
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
  currentUserId = '',
  peerPublicKeyJWK = '',
  onOpenMemberList,
  onBack,
  onStartAudioCall,
}: StatusBarProps) {
  const [copied, setCopied] = useState(false)
  const [soundMuted, setSoundMuted] = useState(false)
  const [isContactModalOpen, setIsContactModalOpen] = useState(false)
  const [isSafetyModalOpen, setIsSafetyModalOpen] = useState(false)

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

  const isDirectChat = roomId.startsWith('dm_') || !roomId.startsWith('room-')
  const isPeerOnline = roomUsers.some(u => (session && u.id !== session.clientId) || (peerNickname && u.nickname === peerNickname))
  const peerName = (peerNickname && peerNickname.trim())
    ? peerNickname
    : (isDirectChat ? 'Memuat kontak...' : (roomId.startsWith('room-') ? `Grup ${roomId.replace('room-', '')}` : roomId))
  const initial = (peerName && peerName.trim() ? peerName.trim()[0] : '#').toUpperCase()

  return (
    <>
      <header className="status-bar" role="banner">
        <div className="status-bar-left">
          {onBack && (
            <button
              type="button"
              className="mobile-back-btn"
              onClick={onBack}
              aria-label="Kembali ke daftar obrolan"
              title="Kembali ke daftar obrolan"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
              </svg>
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
              minWidth: 0,
            }}
            title={isDirectChat && peerNickname ? 'Klik untuk melihat profil lengkap kontak ini' : undefined}
          >
            <div className="status-avatar" aria-hidden="true" style={{ position: 'relative' }}>
              {initial}
              {isPeerOnline && isDirectChat && (
                <span
                  style={{
                    position: 'absolute',
                    bottom: 0,
                    right: 0,
                    width: '10px',
                    height: '10px',
                    borderRadius: '50%',
                    background: '#22c55e',
                    border: '2px solid var(--bg-surface)',
                  }}
                  title="Online"
                />
              )}
            </div>

            <div className="status-info">
              <span className="status-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {peerName}
              </span>
              <div className="status-sub">
                {isPeerTyping ? (
                  <span className="status-typing-label" style={{ color: 'var(--accent-400)' }}>
                    <span>✍️</span> {typingNickname ? `${typingNickname} sedang mengetik...` : 'sedang mengetik...'}
                  </span>
                ) : isDirectChat ? (
                  <span style={{ color: isPeerOnline ? 'var(--accent-400)' : 'var(--text-muted)' }}>
                    {isPeerOnline ? 'online' : 'offline'}
                  </span>
                ) : (
                  <span>{roomUsers.length} anggota</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Untuk Grup: Tombol Salin Link & Anggota */}
          {!isDirectChat && roomId && (
            <>
              <button
                type="button"
                onClick={copyRoomLink}
                className="status-btn"
                title="Salin link room ini"
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              >
                {copied ? '✓ Tersalin' : '📋 Link'}
              </button>
              <button
                type="button"
                onClick={onOpenMemberList}
                className="status-btn member-badge-btn"
                title="Lihat daftar anggota room"
                style={{ fontSize: '0.75rem', padding: '4px 8px' }}
              >
                👥 {roomUsers.length}
              </button>
            </>
          )}

          {/* Tombol Panggilan Suara (Audio Call) untuk Direct Chat */}
          {isDirectChat && onStartAudioCall && (
            <button
              type="button"
              onClick={onStartAudioCall}
              className="status-btn"
              title="Mulai Panggilan Suara"
              aria-label="Mulai Panggilan Suara"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', fontSize: '0.9rem', width: '32px', height: '32px', borderRadius: 'var(--radius-full)' }}
            >
              <span>📞</span>
            </button>
          )}

          {/* Tombol Kunci Keamanan E2EE untuk Direct Message */}
          {isDirectChat && (
            <button
              type="button"
              onClick={() => setIsSafetyModalOpen(true)}
              className="status-btn"
              title="Obrolan Terenkripsi End-to-End. Klik untuk verifikasi nomor keamanan."
              aria-label="Verifikasi Kunci Keamanan E2EE"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', fontSize: '0.85rem', width: '32px', height: '32px', borderRadius: 'var(--radius-full)' }}
            >
              <span>🔒</span>
            </button>
          )}

          {/* Tombol Toggle Sound FX Minimalis */}
          <button
            type="button"
            onClick={() => soundManager.toggleMute()}
            className={`status-btn ${soundMuted ? 'muted' : ''}`}
            title={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
            aria-label={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '6px', fontSize: '0.85rem', width: '32px', height: '32px', borderRadius: 'var(--radius-full)' }}
          >
            <span>{soundMuted ? '🔇' : '🔊'}</span>
          </button>

          {/* Indikator Bulat Koneksi (Dot-Only tanpa tulisan) */}
          <div
            className={`status-indicator-dot-only ${status}`}
            role="status"
            aria-label={`Status koneksi: ${statusLabel[status]}`}
            title={`Status koneksi: ${statusLabel[status]}`}
          >
            <span className="status-dot" aria-hidden="true" />
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

      {/* Modal Nomor Keamanan E2EE */}
      {isDirectChat && (
        <SafetyNumberModal
          isOpen={isSafetyModalOpen}
          onClose={() => setIsSafetyModalOpen(false)}
          currentUserId={currentUserId}
          peerNickname={peerName}
          peerPublicKeyJWK={peerPublicKeyJWK}
        />
      )}
    </>
  )
}


