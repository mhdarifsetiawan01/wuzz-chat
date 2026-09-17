'use client'

import { useState, useEffect } from 'react'
import { apiRequest } from '@/lib/api'
import type { User } from '@/lib/types'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getAvatarStyle } from '@/lib/avatarColor'
import { UserAvatar } from './UserAvatar'
import { VerifiedBadge } from './VerifiedBadge'

interface ContactProfileModalProps {
  isOpen: boolean
  onClose: () => void
  user?: User | null
  userId?: string | null
  username?: string | null
}

export function ContactProfileModal({
  isOpen,
  onClose,
  user: initialUser,
  userId,
  username,
}: ContactProfileModalProps) {
  const [profile, setProfile] = useState<User | null>(initialUser || null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')

  const handleClose = useModalBackHandler(isOpen, onClose, 'contact_profile')

  useEffect(() => {
    if (!isOpen) return

    if (initialUser) {
      setProfile(initialUser)
      setError('')
      return
    }

    if (userId || username) {
      setIsLoading(true)
      setError('')
      const query = userId ? `id=${encodeURIComponent(userId)}` : `username=${encodeURIComponent(username!)}`
      apiRequest<User>(`/api/users/profile?${query}`).then(({ data, error: err }) => {
        setIsLoading(false)
        if (data) {
          setProfile(data)
        } else if (err) {
          setError(err)
        }
      })
    }
  }, [isOpen, initialUser, userId, username])

  if (!isOpen) return null

  const formatJoinDate = (dateStr?: string) => {
    if (!dateStr) return 'Baru saja'
    try {
      const d = new Date(dateStr)
      return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })
    } catch {
      return dateStr
    }
  }

  const avatarDisplay = profile?.avatar_url || (profile?.display_name || profile?.username || '?')[0].toUpperCase()

  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) handleClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 110,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-overlay)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '400px',
          boxShadow: '0 25px 50px rgba(0,0,0,0.7), 0 0 30px rgba(59, 130, 246, 0.1)',
          overflow: 'hidden',
          animation: 'fadeIn 0.2s ease',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--border-subtle)',
            background: 'var(--bg-elevated)',
            backdropFilter: 'var(--glass-blur)',
            WebkitBackdropFilter: 'var(--glass-blur)',
          }}
        >
          <h3 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>Info Kontak</h3>
          <button
            type="button"
            onClick={handleClose}
            style={{
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.25rem',
              cursor: 'pointer',
              lineHeight: 1,
              padding: '4px',
            }}
          >
            ✕
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-6)', textAlign: 'center' }}>
          {isLoading ? (
            <div style={{ padding: 'var(--space-8) 0', color: 'var(--text-muted)' }}>
              <div style={{ fontSize: '1.5rem', animation: 'spin 1.5s linear infinite', marginBottom: 'var(--space-2)' }}>💬</div>
              <p>Memuat profil pengguna...</p>
            </div>
          ) : error ? (
            <div style={{ color: 'var(--color-error)', padding: 'var(--space-4)' }}>
              {error}
            </div>
          ) : profile ? (
            <>
              {/* Big Avatar */}
              <UserAvatar
                avatarUrl={profile.avatar_url}
                name={profile.display_name || profile.username}
                id={profile.id}
                size={84}
                fontSize="2.4rem"
                style={{ margin: '0 auto var(--space-4)' }}
              />

              {/* Names with Verified Badge */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', marginBottom: '4px' }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
                  {profile.display_name}
                </h2>
                {profile.is_verified && <VerifiedBadge size={18} />}
              </div>
              <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: 'var(--space-5)' }}>
                @{profile.username}
              </div>

              {/* Status Bio Box */}
              <div
                style={{
                  background: 'var(--bg-elevated)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: 'var(--space-4)',
                  textAlign: 'left',
                  marginBottom: 'var(--space-4)',
                }}
              >
                <div style={{ fontSize: '0.75rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 600, marginBottom: '4px', letterSpacing: '0.5px' }}>
                  Status Bio
                </div>
                <div style={{ fontSize: '0.95rem', color: 'var(--text-primary)', lineHeight: 1.5 }}>
                  {profile.status_message || 'Tersedia untuk mengobrol'}
                </div>
              </div>

              {/* Account details */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  padding: 'var(--space-2) var(--space-1)',
                  fontSize: '0.8125rem',
                  color: 'var(--text-muted)',
                  borderTop: '1px solid var(--border-subtle)',
                  marginTop: 'var(--space-4)',
                }}
              >
                <span>Bergabung sejak</span>
                <span style={{ color: 'var(--text-primary)' }}>{formatJoinDate(profile.created_at)}</span>
              </div>
            </>
          ) : null}

          <button
            type="button"
            onClick={handleClose}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 'var(--space-5)', justifyContent: 'center' }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  )
}
