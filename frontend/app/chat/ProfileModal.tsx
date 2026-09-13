'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import type { User } from '@/lib/types'
import { isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/imageCompressor'
import { getMediaCacheStats, clearMediaCache } from '@/lib/mediaCache'
import { useModalBackHandler } from '@/lib/useModalBackHandler'

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
  const router = useRouter()
  const { user, updateUser, logout } = useAuth()
  const handleClose = useModalBackHandler(isOpen, onClose, 'profile_modal')

  const [displayName, setDisplayName] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  // Settings: Image Compression & Media Cache
  const [compressImages, setCompressImages] = useState(true)
  const [cacheStats, setCacheStats] = useState<{ count: number; totalBytes: number }>({ count: 0, totalBytes: 0 })
  const [cacheClearMsg, setCacheClearMsg] = useState('')

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.display_name || user.username || '')
      setStatusMessage(user.status_message || 'Tersedia untuk mengobrol')
      setAvatarUrl(user.avatar_url || '')
      setError('')
      setSuccessMsg('')
      setCompressImages(isImageCompressionEnabled())
      getMediaCacheStats().then(setCacheStats)
    }
  }, [user, isOpen])

  if (!isOpen || !user) return null

  const handleToggleCompression = (e: React.ChangeEvent<HTMLInputElement>) => {
    const checked = e.target.checked
    setCompressImages(checked)
    setImageCompressionEnabled(checked)
  }

  const handleClearCache = async () => {
    await clearMediaCache()
    const stats = await getMediaCacheStats()
    setCacheStats(stats)
    setCacheClearMsg('🧹 Cache media lokal berhasil dibersihkan!')
    setTimeout(() => setCacheClearMsg(''), 2500)
  }

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
        handleClose()
      }, 700)
    }
  }

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
        backdropFilter: 'blur(6px)',
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
          background: '#161b22',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          width: '100%',
          maxWidth: '460px',
          maxHeight: '90vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 25px 50px rgba(0,0,0,0.7)',
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
            borderBottom: '1px solid var(--border-subtle)',
            background: '#21262d',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <span style={{ fontSize: '1.25rem' }}>⚙️</span>
            <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600, color: 'var(--text-primary)' }}>Profil & Pengaturan</h3>
          </div>
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

        {/* Form Body */}
        <form onSubmit={handleSave} style={{ padding: 'var(--space-5)', overflowY: 'auto' }}>
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

          {/* Section: Pengaturan Media & Penyimpanan (WhatsApp Style) */}
          <div
            style={{
              marginTop: 'var(--space-4)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <h4 style={{ margin: '0 0 10px 0', fontSize: '0.9rem', color: 'var(--text-primary)', fontWeight: 600 }}>
              📦 Pengaturan Media & Penyimpanan
            </h4>

            {/* Toggle Kompresi Gambar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '8px',
              }}
            >
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  🗜️ Kompres Gambar Otomatis
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  Hemat kuota dan unggah lebih cepat (Default: ON)
                </div>
              </div>
              <input
                type="checkbox"
                checked={compressImages}
                onChange={handleToggleCompression}
                style={{ width: '18px', height: '18px', cursor: 'pointer', accentColor: 'var(--accent-500)' }}
              />
            </div>

            {/* Cache Local IndexedDB Stats & Clear */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <div>
                <div style={{ fontSize: '0.84rem', fontWeight: 500, color: 'var(--text-primary)' }}>
                  💾 Penyimpanan Lokal (IndexedDB)
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                  {cacheStats.count} media tersimpan ({(cacheStats.totalBytes / (1024 * 1024)).toFixed(2)} MB)
                </div>
              </div>
              <button
                type="button"
                onClick={handleClearCache}
                className="btn btn-secondary"
                style={{ fontSize: '0.75rem', padding: '4px 10px' }}
                title="Bersihkan cache lokal"
              >
                Bersihkan
              </button>
            </div>

            {cacheClearMsg && (
              <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '6px', textAlign: 'right' }}>
                {cacheClearMsg}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-5)' }}>
            <button
              type="button"
              onClick={handleClose}
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

          {/* Section: Keluar dari Akun (Logout) */}
          <div
            style={{
              marginTop: 'var(--space-5)',
              paddingTop: 'var(--space-4)',
              borderTop: '1px solid var(--border-color)',
            }}
          >
            <button
              type="button"
              onClick={() => {
                if (window.confirm('Apakah Anda yakin ingin keluar dari akun ini?')) {
                  logout()
                  onClose()
                  router.push('/login')
                }
              }}
              style={{
                width: '100%',
                padding: '10px 16px',
                background: 'rgba(239, 68, 68, 0.1)',
                border: '1px solid rgba(239, 68, 68, 0.3)',
                borderRadius: 'var(--radius-md)',
                color: '#ef4444',
                fontWeight: 600,
                fontSize: '0.875rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.15s ease',
              }}
              onMouseOver={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.2)')}
              onMouseOut={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)')}
            >
              <span style={{ fontSize: '1rem' }}>⏻</span> Keluar dari Akun
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
