'use client'

import { useState, useEffect } from 'react'
import type { ConnectionStatus, SessionInfo, RoomUser, GroupDetails } from '@/lib/types'
import { soundManager } from '@/lib/sound'
import { ContactProfileModal } from './ContactProfileModal'
import { SafetyNumberModal } from './SafetyNumberModal'
import { UserAvatar } from './UserAvatar'
import { VerifiedBadge } from './VerifiedBadge'

interface StatusBarProps {
  status: ConnectionStatus
  session: SessionInfo | null
  peerNickname: string | null
  peerAvatarUrl?: string
  peerUserId?: string
  peerIsVerified?: boolean
  roomId: string
  roomUsers?: RoomUser[]
  isPeerTyping?: boolean
  typingNickname?: string | null
  currentUserId?: string
  peerPublicKeyJWK?: string
  isGroup?: boolean
  groupDetails?: GroupDetails | null
  onOpenGroupInfo?: () => void
  onOpenMemberList: () => void
  onOpenSubgroups?: () => void
  onBackToParent?: () => void
  parentGroupName?: string
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
  peerAvatarUrl = '',
  peerUserId = '',
  peerIsVerified = false,
  roomId,
  roomUsers = [],
  isPeerTyping = false,
  typingNickname = null,
  currentUserId = '',
  peerPublicKeyJWK = '',
  isGroup = false,
  groupDetails = null,
  onOpenGroupInfo,
  onOpenMemberList,
  onOpenSubgroups,
  onBackToParent,
  parentGroupName,
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

  const isSubGroup = Boolean(roomId.startsWith('sub_') || groupDetails?.parent_id)
  const isGroupChat = Boolean(isGroup || roomId.startsWith('grp_') || isSubGroup || roomId.startsWith('room-'))
  const isDirectChat = !isGroupChat && (roomId.startsWith('dm_') || !roomId.startsWith('room-'))
  const isPeerOnline = roomUsers.some(u => 
    (peerUserId && u.id === peerUserId) || 
    (session && u.id !== session.clientId) || 
    Boolean(peerNickname && u.nickname === peerNickname)
  )
  const peerName = (groupDetails?.title || groupDetails?.name)
    ? (groupDetails.title || groupDetails.name)!
    : (peerNickname && peerNickname.trim())
      ? peerNickname
      : (isDirectChat ? 'Memuat kontak...' : (roomId.startsWith('room-') ? `Grup ${roomId.replace('room-', '')}` : 'Grup'))

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
              ←
            </button>
          )}

          {/* Avatar & Name — Klik untuk melihat profil jika DM, atau info grup jika grup */}
          <div
            className="status-user-clickable"
            onClick={() => {
              if (isGroupChat && onOpenGroupInfo) {
                onOpenGroupInfo()
              } else if (isDirectChat && peerNickname) {
                setIsContactModalOpen(true)
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-3)',
              cursor: (isGroupChat && onOpenGroupInfo) || (isDirectChat && peerNickname) ? 'pointer' : 'default',
              minWidth: 0,
            }}
            title={
              isGroupChat
                ? 'Klik untuk melihat info & anggota grup'
                : isDirectChat && peerNickname
                  ? 'Klik untuk melihat profil lengkap kontak ini'
                  : undefined
            }
          >
            <UserAvatar
              avatarUrl={isGroupChat ? (groupDetails?.avatar_url || '') : peerAvatarUrl}
              name={peerName}
              id={isGroupChat ? roomId : peerUserId}
              size={36}
              fontSize="1rem"
              isOnline={isDirectChat ? isPeerOnline : undefined}
            />

            <div className="status-info">
              {isSubGroup && onBackToParent && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onBackToParent()
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    color: '#60a5fa',
                    fontSize: '0.72rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px',
                    marginBottom: '1px',
                    textAlign: 'left',
                  }}
                  title="Kembali ke grup induk"
                >
                  <span>←</span> <span>{parentGroupName || 'Grup Utama'}</span>
                </button>
              )}
              <span className="status-name" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                {peerName}
                {isGroupChat ? (
                  isSubGroup ? (
                    <span title="Topik Subgrup" style={{ fontSize: '0.8rem' }}>💬</span>
                  ) : groupDetails?.is_public ? (
                    <span title="Grup Publik" style={{ fontSize: '0.8rem' }}>🌐</span>
                  ) : (
                    <span title="Grup Privat (Wuzz Cloud)" style={{ fontSize: '0.8rem' }}>🔒</span>
                  )
                ) : (
                  peerIsVerified && <VerifiedBadge size={14} />
                )}
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
                ) : isGroupChat ? (
                  <span style={{ color: 'var(--text-muted)' }}>
                    {isSubGroup 
                      ? `Topik Subgrup • ${groupDetails?.member_count ?? roomUsers.length} anggota` 
                      : `${groupDetails?.is_public ? '🌐 Grup Publik' : '🔒 Wuzz Cloud'} • ${groupDetails?.member_count ?? roomUsers.length} anggota`}
                  </span>
                ) : (
                  <span>{roomUsers.length} anggota</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {/* Untuk Grup: Tombol Subgrup, Info Grup & Salin Link */}
          {isGroupChat && (
            <>
              {/* Tombol Buka Subgrup jika ini adalah Grup Induk (bukan subgrup) */}
              {!isSubGroup && onOpenSubgroups && (
                <button
                  type="button"
                  onClick={onOpenSubgroups}
                  className="status-btn"
                  title="Lihat topik & subgrup aktif"
                  aria-label="Subgrup"
                  style={{ 
                    fontSize: '0.75rem', 
                    padding: '5px 10px', 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '5px',
                    background: 'rgba(59, 130, 246, 0.15)',
                    color: '#60a5fa',
                    border: '1px solid rgba(59, 130, 246, 0.3)',
                    borderRadius: '16px',
                    fontWeight: 600
                  }}
                >
                  <span>💬</span> <span>Subgrup</span>
                </button>
              )}

              {/* Badge indikator jika ini adalah Subgrup */}
              {isSubGroup && (
                <span
                  style={{
                    fontSize: '0.72rem',
                    padding: '3px 8px',
                    borderRadius: '12px',
                    background: groupDetails?.status === 'expired' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.12)',
                    color: groupDetails?.status === 'expired' ? '#f87171' : '#93c5fd',
                    border: groupDetails?.status === 'expired' ? '1px solid rgba(239, 68, 68, 0.3)' : '1px solid rgba(59, 130, 246, 0.25)',
                    fontWeight: 500,
                  }}
                >
                  {groupDetails?.status === 'expired' ? '🔒 Kedaluwarsa' : '⏳ Subgrup'}
                </span>
              )}

              {onOpenGroupInfo && (
                <button
                  type="button"
                  onClick={onOpenGroupInfo}
                  className="status-btn"
                  title="Lihat info & anggota grup"
                  aria-label="Info Grup"
                  style={{ fontSize: '0.75rem', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                >
                  <span>ℹ️</span> <span>Info</span>
                </button>
              )}
              {roomId && (
                <button
                  type="button"
                  onClick={copyRoomLink}
                  className="status-btn"
                  title="Salin link room ini"
                  style={{ fontSize: '0.75rem', padding: '5px 9px' }}
                >
                  {copied ? '✓ Tersalin' : '📋 Link'}
                </button>
              )}
            </>
          )}

          {/* Untuk legacy room */}
          {!isDirectChat && !isGroupChat && roomId && (
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
        const peerUser = roomUsers.find(u => (peerUserId && u.id === peerUserId) || (session && u.id !== session.clientId) || (peerNickname && u.nickname === peerNickname))
        return (
          <ContactProfileModal
            isOpen={isContactModalOpen}
            onClose={() => setIsContactModalOpen(false)}
            userId={peerUserId || peerUser?.id}
            username={peerUser?.username}
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


