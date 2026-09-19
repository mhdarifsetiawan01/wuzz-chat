'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import type { User } from '@/lib/types'
import { isImageCompressionEnabled, setImageCompressionEnabled } from '@/lib/imageCompressor'
import { getMediaCacheStats, clearMediaCache } from '@/lib/mediaCache'
import { useModalBackHandler } from '@/lib/useModalBackHandler'
import { getActiveServiceWorkerVersion } from '@/lib/pushNotification'
import { DeviceTransferModal } from './DeviceTransferModal'
import { VerifiedBadge } from './VerifiedBadge'
import { UserAvatar } from './UserAvatar'
import { AvatarStudio } from './AvatarStudio'

interface ProfileModalProps {
  isOpen: boolean
  onClose: () => void
}

const PRESET_BIOS = [
  '💬 Tersedia untuk mengobrol',
  '🚀 Sedang fokus coding',
  '☕ Sedang istirahat kopi',
  '🔕 Jangan ganggu / Sedang sibuk',
  '✈️ Sedang di luar kota',
  '🎮 Sedang bermain game',
]

export function ProfileModal({ isOpen, onClose }: ProfileModalProps) {
  const router = useRouter()
  const { user, updateUser, logout } = useAuth()
  const handleClose = useModalBackHandler(isOpen, onClose, 'profile_modal')

  // Tab State
  const [activeTab, setActiveTab] = useState<'profile' | 'media' | 'security'>('profile')
  const [isAvatarStudioOpen, setIsAvatarStudioOpen] = useState(false)

  // Profile Form State
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
  const [swVersion, setSwVersion] = useState<string | null>(null)
  const [isTransferModalOpen, setIsTransferModalOpen] = useState(false)

  useEffect(() => {
    if (user && isOpen) {
      setDisplayName(user.display_name || user.username || '')
      setStatusMessage(user.status_message || 'Tersedia untuk mengobrol')
      setAvatarUrl(user.avatar_url || '')
      setError('')
      setSuccessMsg('')
      setIsAvatarStudioOpen(false)
      setActiveTab('profile')
      setCompressImages(isImageCompressionEnabled())
      getMediaCacheStats().then(setCacheStats)
      getActiveServiceWorkerVersion().then(setSwVersion)
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
      }, 750)
    }
  }

  const mbUsed = (cacheStats.totalBytes / (1024 * 1024)).toFixed(2)
  const isVerified = Boolean(user.is_verified)

  return (
    <div
      className="modal-backdrop profile-modal-backdrop"
      onClick={e => {
        if (e.target === e.currentTarget) handleClose()
      }}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 100,
        padding: 'var(--space-4)',
      }}
    >
      <div className="modal-card profile-modal-card">
        {/* Mobile Drag Indicator */}
        <div
          style={{
            display: 'none',
            width: '40px',
            height: '4px',
            borderRadius: '2px',
            background: 'rgba(255, 255, 255, 0.25)',
            margin: '8px auto 2px',
          }}
          className="mobile-drag-handle"
        />

        {/* 1. Hero Aurora Banner */}
        <div className="profile-hero-banner">
          {/* Close Button */}
          <button
            type="button"
            onClick={handleClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              width: '32px',
              height: '32px',
              borderRadius: '50%',
              background: 'rgba(15, 23, 42, 0.55)',
              border: '1px solid rgba(255, 255, 255, 0.18)',
              color: 'var(--text-primary)',
              fontSize: '0.9rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 10,
              backdropFilter: 'blur(8px)',
              transition: 'all 0.15s ease',
            }}
            title="Tutup (Esc)"
          >
            ✕
          </button>
        </div>

        {/* 2. Hero Identity Section */}
        <div
          style={{
            padding: '0 var(--space-5)',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 'var(--space-4)',
          }}
        >
          {/* Floating Avatar with Edit Button */}
          <div className="profile-avatar-wrapper">
            <UserAvatar
              avatarUrl={avatarUrl}
              name={displayName || user.username}
              id={user.id}
              size={82}
              fontSize="2.4rem"
              style={{
                boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5), 0 0 16px var(--accent-glow)',
                border: '3px solid var(--bg-overlay)',
              }}
            />
            <button
              type="button"
              className="profile-avatar-edit-btn"
              onClick={() => setIsAvatarStudioOpen(!isAvatarStudioOpen)}
              title="Ubah Avatar atau Foto Profil"
              aria-label="Ubah Avatar"
            >
              ✏️
            </button>
          </div>

          {/* User Names & Verified Badge */}
          <div style={{ paddingTop: '8px', flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
              <h3
                style={{
                  margin: 0,
                  fontSize: '1.25rem',
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                  letterSpacing: '-0.01em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {displayName || user.username}
              </h3>
              {isVerified && <VerifiedBadge size={18} />}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
              <span
                style={{
                  fontSize: '0.8rem',
                  color: 'var(--accent-300)',
                  fontWeight: 500,
                  background: 'rgba(59, 130, 246, 0.12)',
                  padding: '1px 8px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(59, 130, 246, 0.25)',
                }}
              >
                @{user.username}
              </span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>• ID Permanen</span>
            </div>
          </div>
        </div>

        {/* 3. Segmented Navigation Tabs */}
        <div className="profile-segmented-nav">
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'profile' ? 'active' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span>👤</span> Profil
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'media' ? 'active' : ''}`}
            onClick={() => setActiveTab('media')}
          >
            <span>📦</span> Media
          </button>
          <button
            type="button"
            className={`profile-tab-btn ${activeTab === 'security' ? 'active' : ''}`}
            onClick={() => setActiveTab('security')}
          >
            <span>🔐</span> Keamanan
          </button>
        </div>

        {/* 4. Tab Body Content */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-5) var(--space-5)',
            overflowY: 'auto',
            flex: 1,
          }}
        >
          {/* Notifications / Alerts */}
          {error && (
            <div
              style={{
                background: 'rgba(239, 68, 68, 0.12)',
                border: '1px solid rgba(239, 68, 68, 0.35)',
                color: 'var(--color-error)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem',
                marginBottom: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>⚠️</span> {error}
            </div>
          )}

          {successMsg && (
            <div
              style={{
                background: 'rgba(34, 197, 94, 0.12)',
                border: '1px solid rgba(34, 197, 94, 0.35)',
                color: 'var(--color-success)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.84rem',
                marginBottom: 'var(--space-3)',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
            >
              <span>{successMsg}</span>
            </div>
          )}

          {/* ========================================================
              TAB 1: PROFIL PENGGUNA
              ======================================================== */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Avatar Studio Pop-down */}
              {isAvatarStudioOpen && (
                <AvatarStudio
                  currentAvatar={avatarUrl}
                  displayName={displayName}
                  onSelectAvatar={newAvatar => setAvatarUrl(newAvatar)}
                  onClose={() => setIsAvatarStudioOpen(false)}
                />
              )}

              {/* Display Name Input */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <label className="form-label" htmlFor="displayName" style={{ fontSize: '0.8rem', fontWeight: 600 }}>
                    Nama Tampilan <span style={{ color: 'var(--color-error)' }}>*</span>
                  </label>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                    {displayName.length}/40
                  </span>
                </div>
                <input
                  id="displayName"
                  className="form-input"
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="Masukkan nama tampilan Anda"
                  required
                  maxLength={40}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    fontSize: '0.9rem',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Status Bio Input */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" htmlFor="statusMessage" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                  Status Bio / Keterangan
                </label>
                <input
                  id="statusMessage"
                  className="form-input"
                  type="text"
                  value={statusMessage}
                  onChange={e => setStatusMessage(e.target.value)}
                  placeholder="misal: Tersedia untuk mengobrol"
                  maxLength={100}
                  style={{
                    background: 'var(--bg-elevated)',
                    border: '1px solid var(--border-default)',
                    borderRadius: 'var(--radius-md)',
                    padding: '10px 14px',
                    fontSize: '0.9rem',
                    color: 'var(--text-primary)',
                  }}
                />

                {/* Preset Bio Chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginTop: '8px' }}>
                  {PRESET_BIOS.map(preset => {
                    const isActive = statusMessage === preset
                    return (
                      <button
                        key={preset}
                        type="button"
                        className={`profile-bio-chip ${isActive ? 'active' : ''}`}
                        onClick={() => setStatusMessage(preset)}
                      >
                        {preset}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Status Akun & Verifikasi Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 'var(--radius-md)',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div>
                  <div style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span>Status Akun:</span>
                    {isVerified ? (
                      <span style={{ color: '#38bdf8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <VerifiedBadge size={15} /> Terverifikasi
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Akun Reguler</span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '2px' }}>
                    {isVerified
                      ? 'Akun resmi terverifikasi dengan standar keamanan Wuzz Chat.'
                      : 'Lencana centang biru resmi akan segera tersedia.'}
                  </div>
                </div>

                {!isVerified && (
                  <span
                    style={{
                      fontSize: '0.675rem',
                      color: 'var(--accent-300)',
                      background: 'rgba(59, 130, 246, 0.1)',
                      border: '1px solid rgba(59, 130, 246, 0.25)',
                      padding: '3px 8px',
                      borderRadius: 'var(--radius-full)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    Segera Hadir
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                <button
                  type="button"
                  onClick={handleClose}
                  className="btn btn-secondary"
                  style={{
                    flex: 1,
                    justifyContent: 'center',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                  }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="btn btn-primary"
                  style={{
                    flex: 1.5,
                    justifyContent: 'center',
                    padding: '10px 16px',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                  }}
                >
                  {isSaving ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </div>
            </form>
          )}

          {/* ========================================================
              TAB 2: PREFERENSI & MEDIA
              ======================================================== */}
          {activeTab === 'media' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* Toggle Kompresi Gambar */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '2px' }}>
                    🗜️ Kompres Gambar Otomatis
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                    Mengoptimalkan foto ke WebP sebelum diunggah untuk menghemat bandwidth & pengiriman kilat.
                  </div>
                </div>

                <label className="ios-glass-switch">
                  <input
                    type="checkbox"
                    checked={compressImages}
                    onChange={handleToggleCompression}
                  />
                  <span className="ios-glass-slider" />
                </label>
              </div>

              {/* IndexedDB Local Cache Management */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    💾 Penyimpanan Offline (IndexedDB)
                  </div>
                  <button
                    type="button"
                    onClick={handleClearCache}
                    className="btn btn-secondary"
                    style={{
                      fontSize: '0.75rem',
                      padding: '4px 12px',
                      borderRadius: 'var(--radius-full)',
                    }}
                    title="Bersihkan cache media lokal"
                  >
                    Bersihkan
                  </button>
                </div>

                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Menyimpan thumbnail gambar, pesan riwayat, dan audio voice note secara offline di peramban ini.
                </div>

                {/* Storage Bar Indicator */}
                <div
                  style={{
                    background: 'rgba(15, 23, 42, 0.7)',
                    borderRadius: 'var(--radius-full)',
                    height: '8px',
                    overflow: 'hidden',
                    marginBottom: '8px',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div
                    style={{
                      width: `${Math.min(100, Math.max(8, cacheStats.count * 5))}%`,
                      height: '100%',
                      background: 'var(--accent-gradient)',
                      borderRadius: 'var(--radius-full)',
                      transition: 'width 0.3s ease',
                    }}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  <span>{cacheStats.count} media tersimpan</span>
                  <span>{mbUsed} MB terpakai</span>
                </div>

                {cacheClearMsg && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '8px', textAlign: 'right' }}>
                    {cacheClearMsg}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 3: KEAMANAN & AKUN
              ======================================================== */}
          {activeTab === 'security' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
              {/* E2EE Status Card */}
              <div
                style={{
                  background: 'linear-gradient(135deg, rgba(6, 182, 212, 0.1) 0%, rgba(59, 130, 246, 0.1) 100%)',
                  border: '1px solid rgba(56, 189, 248, 0.25)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                  <span style={{ fontSize: '1.2rem' }}>🛡️</span>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#38bdf8' }}>
                    Enkripsi End-to-End (E2EE) Aktif
                  </div>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  Pesan Anda dilindungi kriptografi ECDH NIST P-256 & AES-256-GCM. Kunci privat hanya tersimpan di peramban perangkat ini.
                </div>
              </div>

              {/* QR Device Transfer Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>
                  📲 Pindah Perangkat via QR Code
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Salin kunci enkripsi akun Anda ke HP atau Laptop lain secara instan tanpa kehilangan pesan.
                </div>

                <button
                  type="button"
                  onClick={() => setIsTransferModalOpen(true)}
                  className="btn btn-secondary"
                  style={{
                    width: '100%',
                    fontSize: '0.825rem',
                    padding: '9px 14px',
                    justifyContent: 'center',
                    background: 'rgba(59, 130, 246, 0.12)',
                    color: 'var(--accent-300)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                  }}
                >
                  📸 Buka QR Scanner / Generator Kunci
                </button>
              </div>

              {/* Danger Zone: Logout */}
              <div
                style={{
                  background: 'rgba(239, 68, 68, 0.06)',
                  border: '1px solid rgba(239, 68, 68, 0.22)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                  marginTop: 'var(--space-2)',
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-error)', marginBottom: '8px' }}>
                  Zona Akun
                </div>
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
                    background: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-error)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.25)')}
                  onMouseOut={e => (e.currentTarget.style.background = 'rgba(239, 68, 68, 0.15)')}
                >
                  <span>⏻</span> Keluar dari Akun (Logout)
                </button>
              </div>

              {/* App Version Footer */}
              <div
                style={{
                  marginTop: '6px',
                  textAlign: 'center',
                  fontSize: '0.675rem',
                  color: 'var(--text-muted)',
                  opacity: 0.6,
                  userSelect: 'none',
                }}
              >
                Wuzz Chat v1.0.0{swVersion ? ` • SW v${swVersion}` : ''}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Nested Device Transfer Modal */}
      <DeviceTransferModal
        isOpen={isTransferModalOpen}
        initialMode="generate"
        currentUserId={user.id}
        onClose={() => setIsTransferModalOpen(false)}
      />
    </div>
  )
}
