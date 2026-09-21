'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'
import type { User, AuthSession } from '@/lib/types'
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
  const [isLoggingOut, setIsLoggingOut] = useState(false)

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

  // Settings: Keamanan & Ganti Password
  const [oldPassword, setOldPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [changePassError, setChangePassError] = useState('')
  const [changePassSuccess, setChangePassSuccess] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  // Sesi Login Aktif (Phase 1: Session Foundation)
  const [sessions, setSessions] = useState<AuthSession[]>([])
  const [isLoadingSessions, setIsLoadingSessions] = useState(false)
  const [sessionError, setSessionError] = useState<string | null>(null)
  const [revokingSessionId, setRevokingSessionId] = useState<string | null>(null)
  const [isRevokingAllOthers, setIsRevokingAllOthers] = useState(false)

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
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')
      setChangePassError('')
      setChangePassSuccess('')
      setShowPasswordForm(false)
    }
  }, [user, isOpen])

  useEffect(() => {
    const handleSessionReplaced = () => {
      setIsTransferModalOpen(false)
      onClose()
    }
    if (typeof window !== 'undefined') {
      window.addEventListener('wuzz:session_replaced', handleSessionReplaced)
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('wuzz:session_replaced', handleSessionReplaced)
      }
    }
  }, [onClose])

  if (!isOpen || !user || typeof document === 'undefined') return null

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

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setChangePassError('')
    setChangePassSuccess('')

    if (!oldPassword) {
      setChangePassError('Password lama wajib diisi')
      return
    }
    if (!newPassword || newPassword.length < 6) {
      setChangePassError('Password baru minimal 6 karakter')
      return
    }
    if (newPassword !== confirmPassword) {
      setChangePassError('Konfirmasi password baru tidak cocok')
      return
    }

    setIsChangingPassword(true)
    try {
      const { error: apiErr } = await apiRequest<{ status: string; message: string }>('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({
          old_password: oldPassword,
          new_password: newPassword,
        }),
      })

      if (apiErr) {
        setChangePassError(apiErr)
        setIsChangingPassword(false)
        return
      }

      setChangePassSuccess('✅ Password berhasil diubah! Mengalihkan ke login...')
      setOldPassword('')
      setNewPassword('')
      setConfirmPassword('')

      setTimeout(async () => {
        try {
          await logout()
        } catch {}
        onClose()
        if (typeof window !== 'undefined') {
          window.location.replace('/login?logout=1')
        } else {
          router.replace('/login?logout=1')
        }
      }, 1500)
    } catch (err: any) {
      setChangePassError(err.message || 'Gagal mengubah password')
      setIsChangingPassword(false)
    }
  }

  // Helper & Handler Manajemen Sesi (Phase 1)
  const fetchSessions = useCallback(async () => {
    setIsLoadingSessions(true)
    setSessionError(null)
    const { data, error: apiErr } = await apiRequest<{ sessions: AuthSession[] }>('/api/auth/sessions')
    if (apiErr) {
      setSessionError(apiErr)
    } else if (data && data.sessions) {
      setSessions(data.sessions)
    }
    setIsLoadingSessions(false)
  }, [])

  useEffect(() => {
    if (isOpen && activeTab === 'security') {
      fetchSessions()
    }
  }, [isOpen, activeTab, fetchSessions])

  const handleRevokeSession = async (sessionId: string) => {
    if (!window.confirm('Apakah Anda yakin ingin mencabut akses sesi ini dari jarak jauh?')) {
      return
    }
    setRevokingSessionId(sessionId)
    const { error: apiErr } = await apiRequest(`/api/auth/sessions/${sessionId}`, { method: 'DELETE' })
    if (apiErr) {
      alert(`Gagal mencabut sesi: ${apiErr}`)
    } else {
      setSessions(prev => prev.filter(s => s.id !== sessionId))
    }
    setRevokingSessionId(null)
  }

  const handleRevokeAllOthers = async () => {
    if (!window.confirm('Apakah Anda yakin ingin mengeluarkan seluruh sesi lain? Sesi di HP/Laptop lain akan langsung terputus.')) {
      return
    }
    setIsRevokingAllOthers(true)
    const { error: apiErr } = await apiRequest('/api/auth/sessions/revoke-others', { method: 'POST' })
    if (apiErr) {
      alert(`Gagal mencabut sesi lain: ${apiErr}`)
    } else {
      setSessions(prev => prev.filter(s => s.is_current))
    }
    setIsRevokingAllOthers(false)
  }

  const parseUserAgent = (ua: string) => {
    let browser = 'Browser'
    let os = 'Perangkat'
    let icon = '💻'

    if (!ua) return { name: 'Perangkat Tak Dikenal', icon: '💻' }

    if (/android/i.test(ua)) {
      os = 'Android'
      icon = '📱'
    } else if (/iphone|ipad|ipod/i.test(ua)) {
      os = 'iOS'
      icon = '📱'
    } else if (/windows/i.test(ua)) {
      os = 'Windows'
      icon = '🖥️'
    } else if (/macintosh|mac os x/i.test(ua)) {
      os = 'macOS'
      icon = '💻'
    } else if (/linux/i.test(ua)) {
      os = 'Linux'
      icon = '🐧'
    }

    if (/chrome|crios/i.test(ua) && !/edg|opr/i.test(ua)) {
      browser = 'Chrome'
    } else if (/safari/i.test(ua) && !/chrome|crios/i.test(ua)) {
      browser = 'Safari'
    } else if (/firefox|fxios/i.test(ua)) {
      browser = 'Firefox'
    } else if (/edg/i.test(ua)) {
      browser = 'Edge'
    }

    return { name: `${browser} di ${os}`, icon }
  }

  const formatRelativeTime = (isoDate: string) => {
    try {
      const date = new Date(isoDate)
      const diffMs = Date.now() - date.getTime()
      const diffMin = Math.floor(diffMs / 60000)
      if (diffMin < 1) return 'Baru saja'
      if (diffMin < 60) return `${diffMin} mnt lalu`
      const diffHour = Math.floor(diffMin / 60)
      if (diffHour < 24) return `${diffHour} jam lalu`
      const diffDay = Math.floor(diffHour / 24)
      if (diffDay < 7) return `${diffDay} hari lalu`
      return date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })
    } catch {
      return ''
    }
  }

  const mbUsed = (cacheStats.totalBytes / (1024 * 1024)).toFixed(2)
  const isVerified = Boolean(user.is_verified)

  return createPortal(
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
        zIndex: 'var(--z-modal)' as any,
        padding: 'var(--space-4)',
      }}
    >
      <div className="modal-card profile-modal-card" onClick={e => e.stopPropagation()}>
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
            onClick={e => {
              e.stopPropagation()
              handleClose()
            }}
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
                  background: 'var(--tint-accent-12)',
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
                      <span style={{ color: 'var(--color-verified)', display: 'flex', alignItems: 'center', gap: '4px' }}>
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
                      background: 'var(--tint-accent-10)',
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
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-verified)' }}>
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
                    background: 'var(--tint-accent-12)',
                    color: 'var(--accent-300)',
                    border: '1px solid rgba(59, 130, 246, 0.35)',
                    borderRadius: 'var(--radius-md)',
                    fontWeight: 600,
                  }}
                >
                  📸 Buka QR Scanner / Generator Kunci
                </button>
              </div>

              {/* Change Password Card */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    🔑 Ganti Password Akun
                  </div>
                  {!showPasswordForm && (
                    <button
                      type="button"
                      onClick={() => setShowPasswordForm(true)}
                      className="btn btn-ghost"
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      Ubah
                    </button>
                  )}
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: showPasswordForm ? '12px' : '0', lineHeight: 1.4 }}>
                  Perbarui kata sandi akun Anda. Mengubah password akan mencabut seluruh sesi login aktif demi keamanan.
                </div>

                {showPasswordForm && (
                  <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)', marginTop: 'var(--space-2)' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Password Saat Ini:
                      </label>
                      <input
                        type="password"
                        value={oldPassword}
                        onChange={e => setOldPassword(e.target.value)}
                        placeholder="Masukkan password lama"
                        disabled={isChangingPassword}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Password Baru (min. 6 karakter):
                      </label>
                      <input
                        type="password"
                        value={newPassword}
                        onChange={e => setNewPassword(e.target.value)}
                        placeholder="Masukkan password baru"
                        disabled={isChangingPassword}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    <div>
                      <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                        Konfirmasi Password Baru:
                      </label>
                      <input
                        type="password"
                        value={confirmPassword}
                        onChange={e => setConfirmPassword(e.target.value)}
                        placeholder="Ulangi password baru"
                        disabled={isChangingPassword}
                        style={{
                          width: '100%',
                          padding: '8px 12px',
                          borderRadius: 'var(--radius-md)',
                          border: '1px solid var(--border-color)',
                          background: 'var(--bg-input)',
                          color: 'var(--text-primary)',
                          fontSize: '0.85rem',
                          boxSizing: 'border-box',
                        }}
                      />
                    </div>

                    {changePassError && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', padding: '6px 10px', background: 'var(--tint-error-10)', borderRadius: 'var(--radius-sm)' }}>
                        ⚠️ {changePassError}
                      </div>
                    )}

                    {changePassSuccess && (
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', padding: '6px 10px', background: 'var(--tint-success-10)', borderRadius: 'var(--radius-sm)' }}>
                        {changePassSuccess}
                      </div>
                    )}

                    <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-1)' }}>
                      <button
                        type="submit"
                        className="btn btn-primary"
                        disabled={isChangingPassword}
                        style={{ flex: 1, padding: '8px', fontSize: '0.85rem' }}
                      >
                        {isChangingPassword ? '⏳ Menyimpan...' : 'Simpan Password Baru'}
                      </button>
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          setShowPasswordForm(false)
                          setOldPassword('')
                          setNewPassword('')
                          setConfirmPassword('')
                          setChangePassError('')
                          setChangePassSuccess('')
                        }}
                        disabled={isChangingPassword}
                        style={{ padding: '8px 12px', fontSize: '0.85rem' }}
                      >
                        Batal
                      </button>
                    </div>
                  </form>
                )}
              </div>

              {/* Active Sessions Card (Phase 1: Session Foundation) */}
              <div
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                    🖥️ Sesi Login Aktif
                  </div>
                  <button
                    type="button"
                    onClick={fetchSessions}
                    disabled={isLoadingSessions}
                    className="btn btn-ghost"
                    style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    title="Segarkan daftar sesi"
                  >
                    {isLoadingSessions ? '⏳' : '🔄 Segarkan'}
                  </button>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '12px', lineHeight: 1.4 }}>
                  Daftar perangkat dan peramban yang saat ini sedang masuk ke akun WuzzChat Anda.
                </div>

                {sessionError && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-error)', marginBottom: '8px' }}>
                    ⚠️ {sessionError}
                  </div>
                )}

                {isLoadingSessions && sessions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Memuat daftar sesi aktif...
                  </div>
                ) : sessions.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '12px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                    Tidak ada sesi aktif tercatat.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {sessions.map(s => {
                      const { name, icon } = parseUserAgent(s.user_agent)
                      return (
                        <div
                          key={s.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '10px 12px',
                            background: s.is_current ? 'var(--tint-accent-10)' : 'var(--bg-secondary)',
                            border: s.is_current ? '1px solid rgba(59, 130, 246, 0.35)' : '1px solid var(--border-default)',
                            borderRadius: 'var(--radius-sm)',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                            <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{icon}</span>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ fontSize: '0.825rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {name}
                                </span>
                                {s.is_current && (
                                  <span
                                    style={{
                                      fontSize: '0.65rem',
                                      padding: '1px 6px',
                                      borderRadius: '10px',
                                      background: 'var(--color-verified)',
                                      color: '#fff',
                                      fontWeight: 600,
                                      flexShrink: 0,
                                    }}
                                  >
                                    Sesi Ini
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '2px' }}>
                                {s.ip_address && <span>IP: {s.ip_address}</span>}
                                <span>•</span>
                                <span>Aktif: {formatRelativeTime(s.last_active_at || s.created_at)}</span>
                              </div>
                            </div>
                          </div>

                          {!s.is_current && (
                            <button
                              type="button"
                              onClick={() => handleRevokeSession(s.id)}
                              disabled={revokingSessionId === s.id}
                              style={{
                                fontSize: '0.725rem',
                                padding: '5px 10px',
                                background: 'var(--tint-error-10)',
                                color: 'var(--color-error)',
                                border: '1px solid rgba(239, 68, 68, 0.3)',
                                borderRadius: 'var(--radius-sm)',
                                cursor: 'pointer',
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                flexShrink: 0,
                              }}
                            >
                              {revokingSessionId === s.id ? '⏳' : 'Cabut'}
                            </button>
                          )}
                        </div>
                      )
                    })}

                    {sessions.some(s => !s.is_current) && (
                      <button
                        type="button"
                        onClick={handleRevokeAllOthers}
                        disabled={isRevokingAllOthers}
                        style={{
                          marginTop: '4px',
                          width: '100%',
                          fontSize: '0.75rem',
                          padding: '8px 12px',
                          background: 'transparent',
                          color: 'var(--color-error)',
                          border: '1px dashed rgba(239, 68, 68, 0.4)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          fontWeight: 600,
                          textAlign: 'center',
                        }}
                      >
                        {isRevokingAllOthers ? '⏳ Memproses...' : '🚪 Keluar dari Semua Perangkat Lain'}
                      </button>
                    )}
                  </div>
                )}
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
                  disabled={isLoggingOut}
                  onClick={async () => {
                    if (window.confirm('Apakah Anda yakin ingin keluar dari akun ini?')) {
                      setIsLoggingOut(true)
                      try {
                        await logout()
                      } catch {}
                      onClose()
                      if (typeof window !== 'undefined') {
                        window.location.replace('/login?logout=1')
                      } else {
                        router.replace('/login?logout=1')
                      }
                    }
                  }}
                  style={{
                    width: '100%',
                    padding: '10px 16px',
                    background: 'var(--tint-error-15)',
                    border: '1px solid rgba(239, 68, 68, 0.4)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--color-error)',
                    fontWeight: 600,
                    fontSize: '0.85rem',
                    cursor: isLoggingOut ? 'not-allowed' : 'pointer',
                    opacity: isLoggingOut ? 0.7 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseOver={e => !isLoggingOut && (e.currentTarget.style.background = 'var(--tint-error-25)')}
                  onMouseOut={e => !isLoggingOut && (e.currentTarget.style.background = 'var(--tint-error-15)')}
                >
                  <span>{isLoggingOut ? '⏳' : '⏻'}</span> {isLoggingOut ? 'Memproses Keluar...' : 'Keluar dari Akun (Logout)'}
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
    </div>,
    document.body
  )
}
