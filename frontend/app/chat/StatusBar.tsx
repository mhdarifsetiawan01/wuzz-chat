'use client'

import { useState, useEffect, useRef } from 'react'
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
  const [isActionsExpanded, setIsActionsExpanded] = useState(false)
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setSoundMuted(soundManager.isMuted())
    const unsubscribe = soundManager.onMuteChange(setSoundMuted)
    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent | TouchEvent) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target as Node)) {
        setIsActionsExpanded(false)
      }
    }
    if (isActionsExpanded) {
      document.addEventListener('mousedown', handleClickOutside)
      document.addEventListener('touchstart', handleClickOutside)
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('touchstart', handleClickOutside)
    }
  }, [isActionsExpanded])

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
              onClick={isSubGroup && onBackToParent ? onBackToParent : onBack}
              aria-label={isSubGroup && onBackToParent ? `Kembali ke ${parentGroupName || 'Grup Utama'}` : "Kembali ke daftar obrolan"}
              title={isSubGroup && onBackToParent ? `Kembali ke ${parentGroupName || 'Grup Utama'}` : "Kembali ke daftar obrolan"}
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
              flex: 1,
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

            <div className="status-info" style={{ minWidth: 0, flex: 1 }}>
              <span className="status-name" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {peerName}
                </span>
                {isGroupChat ? (
                  isSubGroup ? (
                    groupDetails?.status === 'expired' ? (
                      <span title="Kedaluwarsa" style={{ fontSize: '0.75rem', flexShrink: 0 }}>🔒</span>
                    ) : (
                      <span title="Topik Forum" style={{ fontSize: '0.8rem', flexShrink: 0 }}>💬</span>
                    )
                  ) : groupDetails?.is_public ? (
                    <span title="Grup Publik" style={{ fontSize: '0.8rem', flexShrink: 0 }}>🌐</span>
                  ) : (
                    <span title="Grup Privat (Wuzz Cloud)" style={{ fontSize: '0.8rem', flexShrink: 0 }}>🔒</span>
                  )
                ) : (
                  peerIsVerified && <VerifiedBadge size={14} />
                )}
              </span>
              <div className="status-sub" style={{ display: 'flex', alignItems: 'center', gap: '4px', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                {isPeerTyping ? (
                  <span className="status-typing-label" style={{ color: 'var(--accent-400)' }}>
                    <span>✍️</span> {typingNickname ? `${typingNickname} sedang mengetik...` : 'sedang mengetik...'}
                  </span>
                ) : isDirectChat ? (
                  <span style={{ color: isPeerOnline ? 'var(--accent-400)' : 'var(--text-muted)' }}>
                    {isPeerOnline ? 'online' : 'offline'}
                  </span>
                ) : isGroupChat ? (
                  isSubGroup ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '5px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {onBackToParent ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            onBackToParent()
                          }}
                          className="subgroup-breadcrumb-link"
                          title={`Kembali ke grup induk ${parentGroupName || 'Grup Utama'}`}
                        >
                          <span style={{ fontSize: '0.72rem' }}>↖</span>
                          <span className="subgroup-breadcrumb-text">{parentGroupName || 'Grup Utama'}</span>
                        </button>
                      ) : (
                        <span className="subgroup-breadcrumb-text" style={{ color: 'var(--text-muted)' }}>
                          {parentGroupName || 'Grup Utama'}
                        </span>
                      )}
                      <span style={{ color: 'var(--border-subtle, rgba(255,255,255,0.3))' }}>•</span>
                      <span style={{ color: '#93c5fd', fontSize: '0.72rem', fontWeight: 500, flexShrink: 0 }}>
                        Forum
                      </span>
                      <span style={{ color: 'var(--border-subtle, rgba(255,255,255,0.3))' }}>•</span>
                      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>
                        {groupDetails?.member_count ?? roomUsers.length} anggota
                      </span>
                      {groupDetails?.status === 'expired' && (
                        <span style={{ color: '#f87171', fontWeight: 600, fontSize: '0.7rem', flexShrink: 0 }}>
                          (Kedaluwarsa)
                        </span>
                      )}
                    </div>
                  ) : (
                    <span style={{ color: 'var(--text-muted)' }}>
                      {groupDetails?.is_public ? '🌐 Grup Publik' : '🔒 Wuzz Cloud'} • {groupDetails?.member_count ?? roomUsers.length} anggota
                    </span>
                  )
                ) : (
                  <span>{roomUsers.length} anggota</span>
                )}
              </div>
            </div>
          </div>
        </div>

        <div 
          ref={actionsRef}
          className="status-bar-actions-wrapper" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0, position: 'relative' }}
        >
          {/* Tombol Buka Forum jika ini adalah Grup Induk (Tetap Selalu di Luar) */}
          {isGroupChat && !isSubGroup && onOpenSubgroups && (
            <button
              type="button"
              onClick={onOpenSubgroups}
              className="status-btn subgroup-nav-pill"
              title="Lihat forum & topik diskusi aktif"
              aria-label="Forum"
              style={{ 
                fontSize: '0.75rem', 
                padding: '4px 10px', 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '5px',
                background: 'rgba(59, 130, 246, 0.15)',
                color: '#60a5fa',
                border: '1px solid rgba(59, 130, 246, 0.3)',
                borderRadius: '16px',
                fontWeight: 600
              }}
            >
              <span>🏛️</span> <span>Forum</span>
            </button>
          )}

          {/* Action Buttons: Expandable di Mobile, Standar di Desktop */}
          <div className={`status-actions-group ${isActionsExpanded ? 'expanded' : 'collapsed'}`}>
            {/* Untuk Grup: Info Grup & Salin Link */}
            {isGroupChat && (
              <>
                {onOpenGroupInfo && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsActionsExpanded(false)
                      onOpenGroupInfo()
                    }}
                    className="status-btn status-icon-btn"
                    title="Lihat info & anggota grup"
                    aria-label="Info Grup"
                    style={{ fontSize: '0.75rem', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>ℹ️</span> <span className="status-btn-text">Info</span>
                  </button>
                )}
                {roomId && (
                  <button
                    type="button"
                    onClick={() => {
                      copyRoomLink()
                      setTimeout(() => setIsActionsExpanded(false), 800)
                    }}
                    className="status-btn status-icon-btn"
                    title="Salin link room ini"
                    aria-label="Salin link obrolan"
                    style={{ fontSize: '0.75rem', padding: '5px 9px', display: 'flex', alignItems: 'center', gap: '4px' }}
                  >
                    <span>{copied ? '✓' : '🔗'}</span>
                    <span className="status-btn-text">{copied ? 'Tersalin' : 'Link'}</span>
                  </button>
                )}
              </>
            )}

            {/* Untuk legacy room */}
            {!isDirectChat && !isGroupChat && roomId && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    copyRoomLink()
                    setTimeout(() => setIsActionsExpanded(false), 800)
                  }}
                  className="status-btn status-icon-btn"
                  title="Salin link room ini"
                  aria-label="Salin link obrolan"
                  style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                >
                  {copied ? '✓ Tersalin' : '📋 Link'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsActionsExpanded(false)
                    onOpenMemberList()
                  }}
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
                onClick={() => {
                  setIsActionsExpanded(false)
                  onStartAudioCall()
                }}
                className="status-btn status-circle-btn"
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
                onClick={() => {
                  setIsActionsExpanded(false)
                  setIsSafetyModalOpen(true)
                }}
                className="status-btn status-circle-btn"
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
              className={`status-btn status-circle-btn ${soundMuted ? 'muted' : ''}`}
              title={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
              aria-label={soundMuted ? 'Nyalakan efek suara pesan' : 'Matikan efek suara pesan'}
            >
              <span>{soundMuted ? '🔇' : '🔊'}</span>
            </button>
          </div>

          {/* Tombol Titik Tiga / Panah (Collapsible Menu di Mobile) */}
          <button
            type="button"
            onClick={() => setIsActionsExpanded(!isActionsExpanded)}
            className={`status-btn status-circle-btn status-actions-toggle ${isActionsExpanded ? 'active' : ''}`}
            title={isActionsExpanded ? 'Tutup menu opsi' : 'Menu opsi'}
            aria-label={isActionsExpanded ? 'Tutup menu opsi' : 'Menu opsi'}
            aria-expanded={isActionsExpanded}
          >
            <span>{isActionsExpanded ? '✕' : '⋮'}</span>
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


