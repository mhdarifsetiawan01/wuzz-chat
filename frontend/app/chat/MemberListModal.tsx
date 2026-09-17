'use client'

import { useState } from 'react'
import type { RoomUser } from '@/lib/types'
import { ContactProfileModal } from './ContactProfileModal'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getAvatarStyle } from '@/lib/avatarColor'

interface MemberListModalProps {
  isOpen: boolean
  onClose: () => void
  users: RoomUser[]
  currentNickname?: string
  roomId: string
}

export function MemberListModal({
  isOpen,
  onClose,
  users,
  currentNickname,
  roomId,
}: MemberListModalProps) {
  const [selectedUser, setSelectedUser] = useState<RoomUser | null>(null)
  const handleClose = useModalBackHandler(isOpen, onClose, 'member_list')

  if (!isOpen) return null

  return (
    <>
      <div
        className="modal-backdrop"
        onClick={handleClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="member-modal-title"
      >
        <div
          className="member-drawer"
          onClick={e => e.stopPropagation()}
        >
          <div className="member-drawer-header">
            <div>
              <h2 id="member-modal-title" className="member-drawer-title">
                Anggota Room
              </h2>
              <p className="member-drawer-subtitle">
                Room: <span className="highlight">{roomId}</span> ({users.length} Online)
              </p>
            </div>
            <button
              type="button"
              className="member-drawer-close"
              onClick={handleClose}
              aria-label="Tutup daftar anggota"
            >
              ✕
            </button>
          </div>

          <div className="member-drawer-body">
            {users.length === 0 ? (
              <p className="member-empty">Belum ada data anggota</p>
            ) : (
              <ul className="member-list">
                {users.map(u => {
                  const isMe = u.nickname === currentNickname
                  const initial = (u.nickname || '?')[0].toUpperCase()
                  return (
                    <li
                      key={u.id}
                      className={`member-item ${isMe ? 'member-item-me' : ''}`}
                      onClick={() => {
                        setSelectedUser(u)
                      }}
                      style={{ cursor: 'pointer' }}
                      title="Klik untuk melihat profil"
                    >
                      <div className="member-avatar" style={getAvatarStyle(u.nickname || u.id)}>
                        {initial}
                        <span className="member-online-dot" />
                      </div>
                      <div className="member-details">
                        <span className="member-name">
                          {u.nickname} {isMe && <span className="member-badge-you">(Kamu)</span>}
                        </span>
                        <span className="member-status-text">Sedang Aktif • Lihat Profil ➔</span>
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>
      </div>

      <ContactProfileModal
        isOpen={Boolean(selectedUser)}
        onClose={() => setSelectedUser(null)}
        userId={selectedUser?.id}
        username={selectedUser?.username || selectedUser?.nickname}
      />
    </>
  )
}

