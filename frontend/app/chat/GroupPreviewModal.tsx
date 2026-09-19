'use client'

import React, { useState, useEffect } from 'react'
import { GroupDetails } from '@/lib/types'
import { apiRequest } from '@/lib/api'

interface GroupPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  group: GroupDetails | null
  onJoined: (group: GroupDetails) => void
}

export default function GroupPreviewModal({
  isOpen,
  onClose,
  group,
  onJoined,
}: GroupPreviewModalProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    if (isOpen) {
      setIsLoading(false)
      setErrorMessage('')
    }
  }, [isOpen])

  // ESC key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isLoading) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, isLoading, onClose])

  if (!isOpen || !group) return null

  const handleJoin = async () => {
    setIsLoading(true)
    setErrorMessage('')

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 15000)

    try {
      const { error } = await apiRequest<{ success: boolean; message: string }>(
        `/api/groups/${encodeURIComponent(group.id)}/join`,
        {
          method: 'POST',
          signal: controller.signal,
        }
      )
      clearTimeout(timeoutId)

      if (error) {
        throw new Error(error)
      }

      onJoined(group)
    } catch (err: unknown) {
      clearTimeout(timeoutId)
      const errObj = err as { name?: string; message?: string }
      if (errObj?.name === 'AbortError') {
        setErrorMessage('Koneksi timeout (15 detik). Silakan coba lagi.')
      } else {
        setErrorMessage(errObj?.message || 'Gagal bergabung ke grup publik')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const groupTitle = group.title || group.name || 'Grup Publik'
  const isEmojiAvatar = group.avatar_url?.startsWith('emoji:')
  const emojiChar = isEmojiAvatar ? group.avatar_url?.replace('emoji:', '') : '👥'

  return (
    <div 
      className="group-modal-backdrop" 
      onClick={() => !isLoading && onClose()} 
      style={{ zIndex: 1160 }}
    >
      <div 
        className="group-modal-card" 
        onClick={(e) => e.stopPropagation()}
        style={{ 
          maxWidth: 440, 
          padding: 0,
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(20px)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05)',
          borderRadius: '24px',
          overflow: 'hidden'
        }}
      >
        {/* Header Modal */}
        <div className="group-modal-header" style={{ borderBottom: '1px solid var(--border-subtle)', padding: '16px 20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '1.2rem' }}>🌐</span>
            <h2 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              Pratinjau Grup Publik
            </h2>
          </div>
          <button 
            className="group-modal-close-btn" 
            onClick={onClose} 
            disabled={isLoading}
            aria-label="Tutup modal"
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.1rem',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '8px'
            }}
          >
            ✕
          </button>
        </div>

        {/* Body Modal: Hero Card */}
        <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: '16px' }}>
          {/* Avatar Besar */}
          <div style={{ position: 'relative' }}>
            {group.avatar_url && !isEmojiAvatar ? (
              <img
                src={group.avatar_url}
                alt={groupTitle}
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  objectFit: 'cover',
                  border: '3px solid rgba(59, 130, 246, 0.4)',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)',
                }}
              />
            ) : (
              <div
                style={{
                  width: 76,
                  height: 76,
                  borderRadius: '50%',
                  background: 'linear-gradient(135deg, var(--accent-500), var(--accent-secondary))',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '2.2rem',
                  border: '3px solid rgba(255, 255, 255, 0.15)',
                  boxShadow: '0 8px 24px rgba(59, 130, 246, 0.25)',
                }}
              >
                {emojiChar}
              </div>
            )}
            <div 
              style={{
                position: 'absolute',
                bottom: -2,
                right: -2,
                background: 'var(--accent-500)',
                borderRadius: '50%',
                width: 24,
                height: 24,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '0.8rem',
                border: '2px solid #0f172a',
                boxShadow: '0 2px 8px rgba(0,0,0,0.4)'
              }}
              title="Grup Publik Terbuka"
            >
              🌐
            </div>
          </div>

          {/* Info Grup */}
          <div style={{ width: '100%' }}>
            <h3 style={{ margin: '0 0 6px', fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-primary)', wordBreak: 'break-word' }}>
              {groupTitle}
            </h3>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', flexWrap: 'wrap' }}>
              {group.group_username && (
                <span 
                  style={{ 
                    fontSize: '0.8rem', 
                    color: 'var(--accent-secondary)', 
                    fontWeight: 600,
                    background: 'rgba(129, 140, 248, 0.1)',
                    padding: '3px 8px',
                    borderRadius: '6px',
                    border: '1px solid rgba(129, 140, 248, 0.2)'
                  }}
                >
                  @{group.group_username}
                </span>
              )}
              <span 
                style={{ 
                  fontSize: '0.8rem', 
                  color: 'var(--text-muted)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                👥 {group.member_count ?? 1} Anggota
              </span>
            </div>
          </div>

          {/* Deskripsi Grup */}
          <div 
            style={{ 
              width: '100%',
              padding: '12px 14px',
              borderRadius: '12px',
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '0.85rem',
              lineHeight: '1.5',
              color: group.description ? 'var(--text-secondary, #cbd5e1)' : 'var(--text-muted)',
              maxHeight: '120px',
              overflowY: 'auto',
              textAlign: group.description ? 'left' : 'center',
              fontStyle: group.description ? 'normal' : 'italic',
            }}
          >
            {group.description || 'Tidak ada deskripsi untuk grup ini.'}
          </div>

          {/* Pesan Error jika gagal */}
          {errorMessage && (
            <div 
              style={{ 
                width: '100%',
                padding: '10px 12px', 
                borderRadius: '10px', 
                background: 'rgba(239, 68, 68, 0.12)', 
                border: '1px solid rgba(239, 68, 68, 0.25)', 
                color: 'var(--color-error)', 
                fontSize: '0.8rem',
                textAlign: 'left'
              }}
            >
              ⚠️ {errorMessage}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div 
          style={{ 
            padding: '16px 20px', 
            borderTop: '1px solid var(--border-subtle)', 
            background: 'rgba(255, 255, 255, 0.02)',
            display: 'flex',
            gap: '12px',
            justifyContent: 'flex-end'
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            disabled={isLoading}
            style={{
              padding: '9px 18px',
              borderRadius: '10px',
              fontSize: '0.9rem',
              fontWeight: 500,
            }}
          >
            Batal
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleJoin}
            disabled={isLoading}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              padding: '9px 22px',
              borderRadius: '10px',
              fontWeight: 600,
              fontSize: '0.9rem',
              boxShadow: '0 4px 14px rgba(59, 130, 246, 0.35)',
              minWidth: '150px',
            }}
          >
            {isLoading ? (
              <>
                <div 
                  className="spinner" 
                  style={{ 
                    width: 16, 
                    height: 16, 
                    borderWidth: 2, 
                    borderTopColor: '#ffffff' 
                  }} 
                />
                <span>Bergabung...</span>
              </>
            ) : (
              <>
                <span>🚪</span>
                <span>Gabung ke Grup</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
