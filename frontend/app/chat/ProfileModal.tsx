'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import type { User } from '@/lib/types'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

const PRESET_AVATARS = ['💬', '🦊', '🐱', '🐼', '🐯', '🦁', '🚀', '☕', '⚡', '💎']
const PRESET_BIOS = [
  '💬 Tersedia untuk mengobrol',
  '🚀 Sedang fokus coding',
  '☕ Sedang istirahat kopi',
  '🔕 Jangan ganggu / Sedang sibuk',
  '✈️ Sedang di luar kota',
]

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const { user, updateUser } = useAuth()

  const [displayName, setDisplayName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.display_name || user.username || '')
      setStatusMessage(user.status_message || 'Tersedia untuk mengobrol')
      setAvatarUrl(user.avatar_url || '')
      setError('')
      setSuccessMsg('')
    }
  }, [user, isOpen])

  if (!isOpen || !user) return null

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim()) {
      setError('Nama tampilan tidak boleh kosong')
      return
    }

    setIsSaving(true)
    setError('')
    setSuccessMsg('')

    const { data, error: err } = await apiRequest<User>('/api/auth/profile', {
      method: 'PUT',
      body: JSON.stringify({
        display_name: displayName.trim(),
        status_message: statusMessage.trim() || 'Tersedia untuk mengobrol',
        avatar_url: avatarUrl,
      }),
    })

    setIsSaving(false)

    if (err) {
      setError(err)
      return
    }

    if (data) {
      updateUser(data)
      setSuccessMsg('✅ Profil berhasil diperbarui!')
      setTimeout(() => {
        onClose()
      }, 700)
    }
  }

  return (
    <div
      className="modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) onClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.7)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 'var(--space-4)',
      }}
    >
      <div
        className="modal-card"
        style={{
          background: 'var(--bg-secondary)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: 'var(--space-4) var(--space-5)',
            borderBottom: '1px solid var(--border-color)',
            background: 'var(--bg-tertiary)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.25rem' }}>⚙️</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>Edit Profil Akun</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
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

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: 'var(--space-5)' }}>
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                color: 'var(--color-error)',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                marginBottom: 'var(--space-4)',
              }}
            >
              {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.1)',
                border: '1px solid rgba(34, 197, 94, 0.3)',
                color: '#22c55e',
                padding: 'var(--space-3)',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.875rem',
                marginBottom: 'var(--space-4)',
              }}
            >
              {successMsg}
            </div>
          )}

          {/* Avatar Picker */}
          <div style={{ marginBottom: 'var(--space-4)', textAlign: 'center' }}>
            <div
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                background: 'var(--accent-glow)',
                border: '2px solid var(--accent-500)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.75rem',
                margin: '0 auto var(--space-3)',
              }}
            >
              {avatarUrl || '💬'}
            </div>
            <label style={{ fontSize: '0.8125rem', color: 'var(--text-muted)', display: 'block', marginBottom: '8px' }}>
              Pilih Avatar Karakter:
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', justifyContent: 'center' }}>
              {PRESET_AVATARS.map(item => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setAvatarUrl(item)}
                  style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '50%',
                    background: avatarUrl === item ? 'var(--accent-500)' : 'var(--bg-tertiary)',
                    border: avatarUrl === item ? '2px solid var(--accent-300)' : '1px solid var(--border-color)',
                    fontSize: '1rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.15s ease',
                  }}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          {/* Username (Read-Only) */}
          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-label" style={{ fontSize: '0.8125rem' }}>
              Username <span style={{ color: 'var(--text-muted)' }}>(permanen)</span>
            </label>
            <input
              className="form-input"
              type="text"
              value={`@${user.username}`}
              disabled
              style={{ opacity: 0.7, cursor: 'not-allowed', background: 'var(--bg-tertiary)' }}
            />
          </div>

          {/* Display Name */}
          <div className="form-group" style={{ marginBottom: 'var(--space-3)' }}>
            <label className="form-label" htmlFor="displayName" style={{ fontSize: '0.8125rem' }}>
              Nama Tampilan (Display Name) <span style={{ color: 'var(--color-error)' }}>*</span>
            </label>
            <input
              id="displayName"
              className="form-input"
              type="text"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              placeholder="Masukkan nama tampilan"
              required
              maxLength={40}
            />
          </div>

          {/* Status Bio */}
          <div className="form-group" style={{ marginBottom: 'var(--space-4)' }}>
            <label className="form-label" htmlFor="statusMessage" style={{ fontSize: '0.8125rem' }}>
              Status Bio / Pesan Status
            </label>
            <input
              id="statusMessage"
              className="form-input"
              type="text"
              value={statusMessage}
              onChange={e => setStatusMessage(e.target.value)}
              placeholder="misal: Tersedia untuk mengobrol"
              maxLength={100}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '6px' }}>
              {PRESET_BIOS.map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setStatusMessage(preset)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: '0.72rem',
                    padding: '2px 6px',
                    cursor: 'pointer',
                  }}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="btn btn-primary"
              style={{ flex: 1, justifyContent: 'center' }}
            >
              {isSaving ? 'Menyimpan...' : 'Simpan Profil'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
